import type { BomItem, BomResult, BuildingInfo, ClimateZoneKey, HvacNotes, Room } from "@/types/hvac";
import type { CatalogItem, SystemType, EquipmentType } from "@/types/catalog";
import { SYSTEM_TYPE_EQUIPMENT, EQUIPMENT_TYPE_LABELS } from "@/types/catalog";
import { calculateRoomLoad, calculateSystemTonnage, calculateZoneCount, needsReturnRegister } from "./load-calc";

function findCatalogItem(
  catalog: CatalogItem[],
  equipmentType: EquipmentType,
  tonnage: number | null,
  systemType: SystemType,
): CatalogItem | null {
  const matches = catalog.filter((c) => {
    if (c.equipment_type !== equipmentType) return false;
    if (tonnage !== null && c.tonnage !== null && Math.abs(c.tonnage - tonnage) > 0.5) return false;
    if (c.system_type !== "universal" && c.system_type !== systemType) return false;
    return true;
  });

  // Sort: quote > manual > starter, then by usage_count desc
  const priority: Record<string, number> = { quote: 3, manual: 2, starter: 1 };
  matches.sort((a, b) => {
    const pDiff = (priority[b.source] ?? 0) - (priority[a.source] ?? 0);
    if (pDiff !== 0) return pDiff;
    return b.usage_count - a.usage_count;
  });

  return matches[0] ?? null;
}

function findCatalogItemByKeyword(
  catalog: CatalogItem[],
  equipmentType: EquipmentType,
  systemType: SystemType,
  modelKeyword: string,
  descKeyword: string,
): CatalogItem | null {
  const kModel = modelKeyword.toLowerCase();
  const kDesc = descKeyword.toLowerCase();
  const matches = catalog.filter((c) => {
    if (c.equipment_type !== equipmentType) return false;
    if (c.system_type !== "universal" && c.system_type !== systemType) return false;
    return (
      c.model_number.toLowerCase().includes(kModel) ||
      c.description.toLowerCase().includes(kDesc)
    );
  });

  const priority: Record<string, number> = { quote: 3, manual: 2, starter: 1 };
  matches.sort((a, b) => {
    const pDiff = (priority[b.source] ?? 0) - (priority[a.source] ?? 0);
    if (pDiff !== 0) return pDiff;
    return b.usage_count - a.usage_count;
  });

  return matches[0] ?? null;
}

function getCategoryFromType(type: EquipmentType): string {
  const map: Record<string, string> = {
    ac_condenser: "Major Equipment",
    heat_pump_condenser: "Major Equipment",
    gas_furnace: "Major Equipment",
    air_handler: "Major Equipment",
    heat_strips: "Major Equipment",
    evap_coil: "Major Equipment",
    thermostat: "Controls",
    ductwork: "Ductwork",
    register: "Registers & Grilles",
    grille: "Registers & Grilles",
    refrigerant: "Refrigerant & Lines",
    electrical: "Electrical",
    installation: "Installation",
  };
  return map[type] ?? "Other";
}

function catalogToBomItem(item: CatalogItem, qty: number, notes: string): BomItem {
  return {
    partId: item.id,
    name: item.description,
    category: getCategoryFromType(item.equipment_type),
    qty,
    unit: item.unit_of_measure,
    price: item.unit_price,
    supplier: item.supplier?.name ?? item.brand,
    sku: item.model_number,
    notes,
    source: item.source as BomItem["source"],
    brand: item.brand,
  };
}

function missingItem(
  eqType: EquipmentType,
  label: string,
  qty: number,
  notes = "No matching equipment — add to catalog or upload a quote",
): BomItem {
  return {
    partId: "",
    name: label,
    category: getCategoryFromType(eqType),
    qty,
    unit: "ea",
    price: null,
    supplier: "",
    sku: "",
    notes,
    source: "missing",
    brand: "",
  };
}

export function generateBOM(
  rooms: Room[],
  climateZone: ClimateZoneKey,
  systemType: SystemType,
  catalog: CatalogItem[],
  building?: BuildingInfo,
  hvacNotes?: HvacNotes,
): BomResult {
  const roomLoads = rooms.map((r) => calculateRoomLoad(r, climateZone));

  let totalBTU = 0;
  let totalCFM = 0;
  let totalRegs = 0;
  let largeRegs = 0;
  let condSqft = 0;
  const returnRooms: Room[] = [];

  for (const load of roomLoads) {
    totalBTU += load.btu;
    totalCFM += load.cfm;
    totalRegs += load.regs;
    if (load.type !== "garage" && load.type !== "closet") {
      condSqft += load.estimated_sqft;
      if (load.estimated_sqft >= 250) largeRegs += load.regs;
    }
    if (needsReturnRegister(load)) {
      returnRooms.push(load);
    }
  }

  const designBTU = Math.ceil(totalBTU * 1.1);
  const tonnage = calculateSystemTonnage(totalBTU);
  const stories = building?.stories ?? 1;
  const zones = hvacNotes?.suggested_zones ?? calculateZoneCount(stories, condSqft);
  const retCount = Math.max(returnRooms.length, 2);

  const items: BomItem[] = [];

  // Parts DB starts at 2T; clamp so a very small load doesn't produce an unknown key
  const equipTonnage = Math.max(tonnage, 2);

  // Major equipment from SYSTEM_TYPE_EQUIPMENT + thermostat
  const equipmentTypes: EquipmentType[] = [...SYSTEM_TYPE_EQUIPMENT[systemType], "thermostat"];
  for (const eqType of equipmentTypes) {
    const isThermostat = eqType === "thermostat";
    const qty = isThermostat ? zones : 1;
    const searchTonnage = isThermostat ? null : equipTonnage;
    const found = findCatalogItem(catalog, eqType, searchTonnage, systemType);
    if (found) {
      items.push(catalogToBomItem(found, qty, ""));
    } else {
      const label = isThermostat
        ? (EQUIPMENT_TYPE_LABELS[eqType] ?? eqType)
        : `${equipTonnage}T ${EQUIPMENT_TYPE_LABELS[eqType] ?? eqType}`;
      items.push(missingItem(eqType, label, qty));
    }
  }

  // Ductwork
  const trunkLen = Math.ceil(condSqft / 35);

  // Trunk sized by tonnage — search by model/description keyword
  const [trunkModelKw, trunkDescKw] =
    tonnage <= 3 ? ["0812", "8x12"] : tonnage <= 4 ? ["1014", "10x14"] : ["1216", "12x16"];
  const trunk = findCatalogItemByKeyword(catalog, "ductwork", systemType, trunkModelKw, trunkDescKw);
  if (trunk) {
    items.push(catalogToBomItem(trunk, trunkLen, ""));
  } else {
    const trunkLabel = tonnage <= 3 ? "8\"x12\" Sheet Metal Trunk" : tonnage <= 4 ? "10\"x14\" Sheet Metal Trunk" : "12\"x16\" Sheet Metal Trunk";
    items.push({ ...missingItem("ductwork", trunkLabel, trunkLen), unit: "ft" });
  }

  // Flex 8
  const flex8 = findCatalogItemByKeyword(catalog, "ductwork", systemType, "FD08", "8\" round flex");
  if (flex8) {
    items.push(catalogToBomItem(flex8, Math.ceil(totalRegs * 10), ""));
  } else {
    items.push({ ...missingItem("ductwork", "8\" Round Flex Duct", Math.ceil(totalRegs * 10)), unit: "ft" });
  }

  // Flex 6
  const flex6 = findCatalogItemByKeyword(catalog, "ductwork", systemType, "FD06", "6\" round flex");
  if (flex6) {
    items.push(catalogToBomItem(flex6, Math.ceil(totalRegs * 8), ""));
  } else {
    items.push({ ...missingItem("ductwork", "6\" Round Flex Duct", Math.ceil(totalRegs * 8)), unit: "ft" });
  }

  // Supply plenum
  const supPlenum = findCatalogItemByKeyword(catalog, "ductwork", systemType, "PL-SUP", "supply plenum");
  if (supPlenum) {
    items.push(catalogToBomItem(supPlenum, 1, ""));
  } else {
    items.push(missingItem("ductwork", "Supply Plenum", 1));
  }

  // Return plenum
  const retPlenum = findCatalogItemByKeyword(catalog, "ductwork", systemType, "PL-RET", "return plenum");
  if (retPlenum) {
    items.push(catalogToBomItem(retPlenum, 1, ""));
  } else {
    items.push(missingItem("ductwork", "Return Plenum", 1));
  }

  // Registers
  const smallRegs = totalRegs - largeRegs;
  if (largeRegs > 0) {
    const reg6x12 = findCatalogItemByKeyword(catalog, "register", systemType, "6x12", "6x12");
    if (reg6x12) {
      items.push(catalogToBomItem(reg6x12, largeRegs, ""));
    } else {
      items.push(missingItem("register", "6\"x12\" Supply Register", largeRegs));
    }
  }
  if (smallRegs > 0) {
    const reg4x12 = findCatalogItemByKeyword(catalog, "register", systemType, "4x12", "4x12");
    if (reg4x12) {
      items.push(catalogToBomItem(reg4x12, smallRegs, ""));
    } else {
      items.push(missingItem("register", "4\"x12\" Supply Register", smallRegs));
    }
  }

  // Return grilles
  const [retModelKw, retDescKw] =
    tonnage <= 3 ? ["2025", "20x25"] : tonnage <= 4 ? ["2030", "20x30"] : ["2430", "24x30"];
  const retGrille = findCatalogItemByKeyword(catalog, "grille", systemType, retModelKw, retDescKw);
  if (retGrille) {
    items.push(catalogToBomItem(retGrille, retCount, ""));
  } else {
    const retLabel = tonnage <= 3 ? "20\"x25\" Return Grille" : tonnage <= 4 ? "20\"x30\" Return Grille" : "24\"x30\" Return Grille";
    items.push(missingItem("grille", retLabel, retCount));
  }

  // Refrigerant & Lines
  const longLineset = condSqft > 1500 || stories > 1;
  const linesetKw = longLineset ? "50" : "25";
  const lineset = findCatalogItemByKeyword(catalog, "refrigerant", systemType, linesetKw + "ft", linesetKw + "ft");
  if (lineset) {
    items.push(catalogToBomItem(lineset, 1, ""));
  } else {
    items.push(missingItem("refrigerant", `Line Set (${longLineset ? "50" : "25"}ft)`, 1));
  }

  const refrigerant = findCatalogItemByKeyword(catalog, "refrigerant", systemType, "R410A", "r-410a");
  if (refrigerant) {
    items.push(catalogToBomItem(refrigerant, 1, ""));
  } else {
    items.push(missingItem("refrigerant", "R-410A Refrigerant (25lb)", 1));
  }

  // Electrical
  const disconnect = findCatalogItemByKeyword(catalog, "electrical", systemType, "DISC", "disconnect");
  if (disconnect) {
    items.push(catalogToBomItem(disconnect, 1, ""));
  } else {
    items.push(missingItem("electrical", "60A Non-Fused Disconnect", 1));
  }

  const whip = findCatalogItemByKeyword(catalog, "electrical", systemType, "WHIP", "conduit whip");
  if (whip) {
    items.push(catalogToBomItem(whip, 1, ""));
  } else {
    items.push(missingItem("electrical", "3/4\" Conduit Whip (6ft)", 1));
  }

  const [brkrModelKw, brkrDescKw] =
    tonnage <= 3 ? ["30A", "30a"] : tonnage <= 4 ? ["40A", "40a"] : ["50A", "50a"];
  const breaker = findCatalogItemByKeyword(catalog, "electrical", systemType, brkrModelKw, brkrDescKw + " breaker");
  if (breaker) {
    items.push(catalogToBomItem(breaker, 1, ""));
  } else {
    const brkrLabel = tonnage <= 3 ? "30A Dbl-Pole Breaker" : tonnage <= 4 ? "40A Dbl-Pole Breaker" : "50A Dbl-Pole Breaker";
    items.push(missingItem("electrical", brkrLabel, 1));
  }

  // Installation items
  const equipLoc = hvacNotes?.suggested_equipment_location?.toLowerCase() ?? "";
  if (equipLoc.includes("attic") || equipLoc.includes("closet")) {
    const cpump = findCatalogItemByKeyword(catalog, "installation", systemType, "CPUMP", "condensate pump");
    if (cpump) {
      items.push(catalogToBomItem(cpump, 1, ""));
    } else {
      items.push(missingItem("installation", "Condensate Pump", 1));
    }
  }

  const ptrap = findCatalogItemByKeyword(catalog, "installation", systemType, "PTRAP", "p-trap");
  if (ptrap) {
    items.push(catalogToBomItem(ptrap, 1, ""));
  } else {
    items.push(missingItem("installation", "P-Trap (3/4\" PVC)", 1));
  }

  const drain = findCatalogItemByKeyword(catalog, "installation", systemType, "DRAIN", "drain line");
  if (drain) {
    items.push(catalogToBomItem(drain, 2, ""));
  } else {
    items.push(missingItem("installation", "3/4\" PVC Drain Line (10ft)", 2));
  }

  const [filtModelKw, filtDescKw] = tonnage <= 3 ? ["16x25", "16x25"] : ["20x25", "20x25"];
  const filter = findCatalogItemByKeyword(catalog, "installation", systemType, filtModelKw, filtDescKw + " filter");
  if (filter) {
    items.push(catalogToBomItem(filter, 2, ""));
  } else {
    const filtLabel = tonnage <= 3 ? "16x25x1 Filter (MERV 8)" : "20x25x1 Filter (MERV 8)";
    items.push(missingItem("installation", filtLabel, 2));
  }

  const mastic = findCatalogItemByKeyword(catalog, "installation", systemType, "MASTIC", "duct mastic");
  if (mastic) {
    items.push(catalogToBomItem(mastic, Math.max(2, Math.ceil(trunkLen / 25)), ""));
  } else {
    items.push(missingItem("installation", "Duct Mastic (1 Gal)", Math.max(2, Math.ceil(trunkLen / 25))));
  }

  const foilTape = findCatalogItemByKeyword(catalog, "installation", systemType, "TAPE", "foil tape");
  if (foilTape) {
    items.push(catalogToBomItem(foilTape, Math.max(2, Math.ceil(totalRegs / 6)), ""));
  } else {
    items.push(missingItem("installation", "Foil Tape (2.5\"x60yd)", Math.max(2, Math.ceil(totalRegs / 6))));
  }

  const pad = findCatalogItemByKeyword(catalog, "installation", systemType, "PAD", "condenser pad");
  if (pad) {
    items.push(catalogToBomItem(pad, 1, ""));
  } else {
    items.push(missingItem("installation", "Condenser Pad (24x24x3)", 1));
  }

  const hanger = findCatalogItemByKeyword(catalog, "installation", systemType, "HANGER", "hanger strap");
  if (hanger) {
    items.push(catalogToBomItem(hanger, Math.max(2, Math.ceil(trunkLen / 40)), ""));
  } else {
    items.push(missingItem("installation", "Hanger Strap (100ft)", Math.max(2, Math.ceil(trunkLen / 40))));
  }

  return {
    items,
    summary: { designBTU, tonnage, totalCFM, totalRegs, retCount, condSqft, zones },
    roomLoads,
  };
}
