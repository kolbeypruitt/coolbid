import type { BomItem, BomResult, BuildingInfo, ClimateZoneKey, HvacNotes, Room } from "@/types/hvac";
import type { CatalogItem, SystemType, EquipmentType } from "@/types/catalog";
import { SYSTEM_TYPE_EQUIPMENT, EQUIPMENT_TYPE_LABELS } from "@/types/catalog";
import { calculateRoomLoad, calculateSystemTonnage, calculateZoneCount, needsReturnRegister } from "./load-calc";
import type { ContractorPreferences } from "@/types/contractor-preferences";

type FindResult = { item: CatalogItem; notes: string };

function sortByPreference(items: CatalogItem[], preferredBrands?: string[]): CatalogItem[] {
  return [...items].sort((a, b) => {
    if (preferredBrands?.length) {
      const aMatch = preferredBrands.some((pb) => a.brand.toLowerCase() === pb.toLowerCase());
      const bMatch = preferredBrands.some((pb) => b.brand.toLowerCase() === pb.toLowerCase());
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
    }
    return b.usage_count - a.usage_count;
  });
}

function findCatalogItem(
  catalog: CatalogItem[],
  equipmentType: EquipmentType,
  tonnage: number | null,
  systemType: SystemType,
  preferredBrands?: string[],
): FindResult | null {
  const typeMatch = catalog.filter(
    (c) =>
      c.equipment_type === equipmentType &&
      (c.system_type === "universal" || c.system_type === systemType),
  );

  if (typeMatch.length === 0) return null;

  if (tonnage === null) {
    return { item: sortByPreference(typeMatch, preferredBrands)[0], notes: "" };
  }

  const exact = sortByPreference(
    typeMatch.filter((c) => c.tonnage !== null && Math.abs(c.tonnage - tonnage) <= 0.5),
    preferredBrands,
  );
  if (exact.length > 0) return { item: exact[0], notes: "" };

  const withTonnage = typeMatch.filter((c) => c.tonnage !== null);
  if (withTonnage.length > 0) {
    const sorted = sortByPreference(withTonnage, preferredBrands);
    sorted.sort((a, b) => Math.abs(a.tonnage! - tonnage) - Math.abs(b.tonnage! - tonnage));
    const closest = sorted[0];
    const supplier = closest.supplier?.name ?? closest.brand;
    return {
      item: closest,
      notes: `Need ${tonnage}T — closest is ${closest.tonnage}T from ${supplier}`,
    };
  }

  return {
    item: sortByPreference(typeMatch, preferredBrands)[0],
    notes: `Need ${tonnage}T — available part has no tonnage specified`,
  };
}

function findCatalogItemByKeyword(
  catalog: CatalogItem[],
  equipmentType: EquipmentType,
  systemType: SystemType,
  modelKeyword: string,
  descKeyword: string,
  preferredBrands?: string[],
): FindResult | null {
  const kModel = modelKeyword.toLowerCase();
  const kDesc = descKeyword.toLowerCase();

  const matchesKeyword = (c: CatalogItem): boolean =>
    (c.mpn?.toLowerCase() ?? "").includes(kModel) ||
    (c.description?.toLowerCase() ?? "").includes(kDesc);

  const typeMatch = catalog.filter(
    (c) =>
      c.equipment_type === equipmentType &&
      (c.system_type === "universal" || c.system_type === systemType),
  );

  const kwMatch = sortByPreference(typeMatch.filter(matchesKeyword), preferredBrands);
  return kwMatch.length > 0 ? { item: kwMatch[0], notes: "" } : null;
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
    sku: item.mpn,
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

const REGISTER_STYLE_KEYWORDS: Record<string, [string, string]> = {
  rectangular_4x12: ["4x12", "4x12"],
  rectangular_6x10: ["6x10", "6x10"],
  square_flush_ceiling: ["ceiling", "flush ceiling"],
  round_ceiling_diffuser: ["diffuser", "ceiling diffuser"],
  floor_register: ["floor", "floor register"],
};

const RETURN_GRILLE_KEYWORDS: Record<string, [string, string]> = {
  standard_20x20: ["2020", "20x20"],
  oversized_24x24: ["2424", "24x24"],
};

export function generateBOM(
  rooms: Room[],
  climateZone: ClimateZoneKey,
  systemType: SystemType,
  catalog: CatalogItem[],
  building?: BuildingInfo,
  hvacNotes?: HvacNotes,
  preferences?: ContractorPreferences | null,
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
    if (load.conditioned) {
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
  const equipTonnage = Math.max(tonnage, 2);
  const brands = preferences?.equipment_brands;
  const tstatBrands = preferences?.thermostat_brand
    ? [preferences.thermostat_brand]
    : brands;

  const equipmentTypes: EquipmentType[] = [...SYSTEM_TYPE_EQUIPMENT[systemType], "thermostat"];
  for (const eqType of equipmentTypes) {
    const isThermostat = eqType === "thermostat";
    const qty = isThermostat ? zones : 1;
    const searchTonnage = isThermostat ? null : equipTonnage;
    const found = findCatalogItem(
      catalog, eqType, searchTonnage, systemType,
      isThermostat ? tstatBrands : brands,
    );
    if (found) {
      items.push(catalogToBomItem(found.item, qty, found.notes));
    } else {
      const label = isThermostat
        ? (EQUIPMENT_TYPE_LABELS[eqType] ?? eqType)
        : `${equipTonnage}T ${EQUIPMENT_TYPE_LABELS[eqType] ?? eqType}`;
      items.push(missingItem(eqType, label, qty));
    }
  }

  // Ductwork
  const trunkLen = Math.ceil(condSqft / 35);

  const [trunkModelKw, trunkDescKw] =
    tonnage <= 3 ? ["0812", "8x12"] : tonnage <= 4 ? ["1014", "10x14"] : ["1216", "12x16"];
  const trunk = findCatalogItemByKeyword(catalog, "ductwork", systemType, trunkModelKw, trunkDescKw, brands);
  if (trunk) {
    items.push(catalogToBomItem(trunk.item, trunkLen, trunk.notes));
  } else {
    const trunkLabel = tonnage <= 3 ? "8\"x12\" Sheet Metal Trunk" : tonnage <= 4 ? "10\"x14\" Sheet Metal Trunk" : "12\"x16\" Sheet Metal Trunk";
    items.push({ ...missingItem("ductwork", trunkLabel, trunkLen), unit: "ft" });
  }

  const flex8 = findCatalogItemByKeyword(catalog, "ductwork", systemType, "FD08", "8\" round flex", brands);
  if (flex8) {
    items.push(catalogToBomItem(flex8.item, Math.ceil(totalRegs * 10), flex8.notes));
  } else {
    items.push({ ...missingItem("ductwork", "8\" Round Flex Duct", Math.ceil(totalRegs * 10)), unit: "ft" });
  }

  const flex6 = findCatalogItemByKeyword(catalog, "ductwork", systemType, "FD06", "6\" round flex", brands);
  if (flex6) {
    items.push(catalogToBomItem(flex6.item, Math.ceil(totalRegs * 8), flex6.notes));
  } else {
    items.push({ ...missingItem("ductwork", "6\" Round Flex Duct", Math.ceil(totalRegs * 8)), unit: "ft" });
  }

  const supPlenum = findCatalogItemByKeyword(catalog, "ductwork", systemType, "PL-SUP", "supply plenum", brands);
  if (supPlenum) {
    items.push(catalogToBomItem(supPlenum.item, 1, supPlenum.notes));
  } else {
    items.push(missingItem("ductwork", "Supply Plenum", 1));
  }

  const retPlenum = findCatalogItemByKeyword(catalog, "ductwork", systemType, "PL-RET", "return plenum", brands);
  if (retPlenum) {
    items.push(catalogToBomItem(retPlenum.item, 1, retPlenum.notes));
  } else {
    items.push(missingItem("ductwork", "Return Plenum", 1));
  }

  // Registers — use preferred style keywords if set
  const regStyle = preferences?.supply_register_style;
  const regKws = regStyle ? REGISTER_STYLE_KEYWORDS[regStyle] : undefined;

  const smallRegs = totalRegs - largeRegs;
  if (largeRegs > 0) {
    const [lgModel, lgDesc] = regKws ?? ["6x12", "6x12"];
    const reg = findCatalogItemByKeyword(catalog, "register", systemType, lgModel, lgDesc, brands);
    if (reg) {
      items.push(catalogToBomItem(reg.item, largeRegs, reg.notes));
    } else {
      items.push(missingItem("register", "6\"x12\" Supply Register", largeRegs));
    }
  }
  if (smallRegs > 0) {
    const [smModel, smDesc] = regKws ?? ["4x12", "4x12"];
    const reg = findCatalogItemByKeyword(catalog, "register", systemType, smModel, smDesc, brands);
    if (reg) {
      items.push(catalogToBomItem(reg.item, smallRegs, reg.notes));
    } else {
      items.push(missingItem("register", "4\"x12\" Supply Register", smallRegs));
    }
  }

  // Return grilles — use preferred sizing if set
  const retSizing = preferences?.return_grille_sizing;
  const retKws = retSizing ? RETURN_GRILLE_KEYWORDS[retSizing] : undefined;
  const [retModelKw, retDescKw] = retKws
    ?? (tonnage <= 3 ? ["2025", "20x25"] : tonnage <= 4 ? ["2030", "20x30"] : ["2430", "24x30"]);
  const retGrille = findCatalogItemByKeyword(catalog, "grille", systemType, retModelKw, retDescKw, brands);
  if (retGrille) {
    items.push(catalogToBomItem(retGrille.item, retCount, retGrille.notes));
  } else {
    const retLabel = tonnage <= 3 ? "20\"x25\" Return Grille" : tonnage <= 4 ? "20\"x30\" Return Grille" : "24\"x30\" Return Grille";
    items.push(missingItem("grille", retLabel, retCount));
  }

  // Refrigerant & Lines
  const longLineset = condSqft > 1500 || stories > 1;
  const linesetKw = longLineset ? "50" : "25";
  const lineset = findCatalogItemByKeyword(catalog, "refrigerant", systemType, linesetKw + "ft", linesetKw + "ft", brands);
  if (lineset) {
    items.push(catalogToBomItem(lineset.item, 1, lineset.notes));
  } else {
    items.push(missingItem("refrigerant", `Line Set (${longLineset ? "50" : "25"}ft)`, 1));
  }

  const refrigerant = findCatalogItemByKeyword(catalog, "refrigerant", systemType, "R410A", "r-410a", brands);
  if (refrigerant) {
    items.push(catalogToBomItem(refrigerant.item, 1, refrigerant.notes));
  } else {
    items.push(missingItem("refrigerant", "R-410A Refrigerant (25lb)", 1));
  }

  // Electrical
  const disconnect = findCatalogItemByKeyword(catalog, "electrical", systemType, "DISC", "disconnect", brands);
  if (disconnect) {
    items.push(catalogToBomItem(disconnect.item, 1, disconnect.notes));
  } else {
    items.push(missingItem("electrical", "60A Non-Fused Disconnect", 1));
  }

  const whip = findCatalogItemByKeyword(catalog, "electrical", systemType, "WHIP", "conduit whip", brands);
  if (whip) {
    items.push(catalogToBomItem(whip.item, 1, whip.notes));
  } else {
    items.push(missingItem("electrical", "3/4\" Conduit Whip (6ft)", 1));
  }

  const [brkrModelKw, brkrDescKw] =
    tonnage <= 3 ? ["30A", "30a"] : tonnage <= 4 ? ["40A", "40a"] : ["50A", "50a"];
  const breaker = findCatalogItemByKeyword(catalog, "electrical", systemType, brkrModelKw, brkrDescKw + " breaker", brands);
  if (breaker) {
    items.push(catalogToBomItem(breaker.item, 1, breaker.notes));
  } else {
    const brkrLabel = tonnage <= 3 ? "30A Dbl-Pole Breaker" : tonnage <= 4 ? "40A Dbl-Pole Breaker" : "50A Dbl-Pole Breaker";
    items.push(missingItem("electrical", brkrLabel, 1));
  }

  // Installation items
  const equipLoc = hvacNotes?.suggested_equipment_location?.toLowerCase() ?? "";
  if (equipLoc.includes("attic") || equipLoc.includes("closet")) {
    const cpump = findCatalogItemByKeyword(catalog, "installation", systemType, "CPUMP", "condensate pump", brands);
    if (cpump) {
      items.push(catalogToBomItem(cpump.item, 1, cpump.notes));
    } else {
      items.push(missingItem("installation", "Condensate Pump", 1));
    }
  }

  const ptrap = findCatalogItemByKeyword(catalog, "installation", systemType, "PTRAP", "p-trap", brands);
  if (ptrap) {
    items.push(catalogToBomItem(ptrap.item, 1, ptrap.notes));
  } else {
    items.push(missingItem("installation", "P-Trap (3/4\" PVC)", 1));
  }

  const drain = findCatalogItemByKeyword(catalog, "installation", systemType, "DRAIN", "drain line", brands);
  if (drain) {
    items.push(catalogToBomItem(drain.item, 2, drain.notes));
  } else {
    items.push(missingItem("installation", "3/4\" PVC Drain Line (10ft)", 2));
  }

  // Filters — use preferred size/MERV if set
  const prefFilterSize = preferences?.filter_size;
  const prefFilterMerv = preferences?.filter_merv;
  const filtDim = prefFilterSize
    ? prefFilterSize.replace(/x\d+$/, "").replace("x", "x")
    : (tonnage <= 3 ? "16x25" : "20x25");
  const filtDescSearch = prefFilterMerv
    ? `${filtDim} filter merv ${prefFilterMerv}`
    : `${filtDim} filter`;
  const filter = findCatalogItemByKeyword(catalog, "installation", systemType, filtDim, filtDescSearch, brands);
  if (filter) {
    items.push(catalogToBomItem(filter.item, 2, filter.notes));
  } else {
    const mervLabel = prefFilterMerv ? `MERV ${prefFilterMerv}` : "MERV 8";
    const sizeLabel = prefFilterSize ?? (tonnage <= 3 ? "16x25x1" : "20x25x1");
    items.push(missingItem("installation", `${sizeLabel} Filter (${mervLabel})`, 2));
  }

  const mastic = findCatalogItemByKeyword(catalog, "installation", systemType, "MASTIC", "duct mastic", brands);
  if (mastic) {
    items.push(catalogToBomItem(mastic.item, Math.max(2, Math.ceil(trunkLen / 25)), mastic.notes));
  } else {
    items.push(missingItem("installation", "Duct Mastic (1 Gal)", Math.max(2, Math.ceil(trunkLen / 25))));
  }

  const foilTape = findCatalogItemByKeyword(catalog, "installation", systemType, "TAPE", "foil tape", brands);
  if (foilTape) {
    items.push(catalogToBomItem(foilTape.item, Math.max(2, Math.ceil(totalRegs / 6)), foilTape.notes));
  } else {
    items.push(missingItem("installation", "Foil Tape (2.5\"x60yd)", Math.max(2, Math.ceil(totalRegs / 6))));
  }

  const pad = findCatalogItemByKeyword(catalog, "installation", systemType, "PAD", "condenser pad", brands);
  if (pad) {
    items.push(catalogToBomItem(pad.item, 1, pad.notes));
  } else {
    items.push(missingItem("installation", "Condenser Pad (24x24x3)", 1));
  }

  const hanger = findCatalogItemByKeyword(catalog, "installation", systemType, "HANGER", "hanger strap", brands);
  if (hanger) {
    items.push(catalogToBomItem(hanger.item, Math.max(2, Math.ceil(trunkLen / 40)), hanger.notes));
  } else {
    items.push(missingItem("installation", "Hanger Strap (100ft)", Math.max(2, Math.ceil(trunkLen / 40))));
  }

  return {
    items,
    summary: { designBTU, tonnage, totalCFM, totalRegs, retCount, condSqft, zones },
    roomLoads,
  };
}
