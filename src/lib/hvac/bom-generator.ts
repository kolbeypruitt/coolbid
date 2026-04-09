import type { BomItem, BomResult, BuildingInfo, ClimateZoneKey, HvacNotes, Room } from "@/types/hvac";
import { PARTS_DB } from "./parts-db";
import { calculateRoomLoad, calculateSystemTonnage, calculateZoneCount, needsReturnRegister } from "./load-calc";

export function generateBOM(
  rooms: Room[],
  climateZone: ClimateZoneKey,
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
  function add(id: string, qty: number, notes = ""): void {
    const part = PARTS_DB[id];
    if (!part) return;
    items.push({
      partId: id,
      name: part.name,
      category: part.category,
      qty,
      unit: part.unit,
      price: part.price,
      supplier: part.supplier,
      sku: part.sku,
      notes,
      source: "starter",
      brand: "",
    });
  }

  // Parts DB starts at 2T; clamp so a very small load doesn't produce an unknown key
  const equipTonnage = Math.max(tonnage, 2);
  const ts = String(equipTonnage);
  const seer = equipTonnage <= 3 ? "14S" : "16S";
  add(`COND-${ts}T-${seer}`, 1);
  add(`AH-${ts}T-VS`, 1);
  add("TSTAT-WIFI", zones);

  const trunkLen = Math.ceil(condSqft / 35);
  const trunkId = tonnage <= 3 ? "TRUNK-8x12" : tonnage <= 4 ? "TRUNK-10x14" : "TRUNK-12x16";
  add(trunkId, trunkLen);
  add("FLEX-8", Math.ceil(totalRegs * 10));
  add("FLEX-6", Math.ceil(totalRegs * 8));
  add("PLENUM-SUP", 1);
  add("PLENUM-RET", 1);

  const smallRegs = totalRegs - largeRegs;
  if (largeRegs > 0) add("REG-6x12", largeRegs);
  if (smallRegs > 0) add("REG-4x12", smallRegs);

  const retGrille = tonnage <= 3 ? "RET-20x25" : tonnage <= 4 ? "RET-20x30" : "RET-24x30";
  add(retGrille, retCount);

  const longLineset = condSqft > 1500 || stories > 1;
  add(longLineset ? "LS-50" : "LS-25", 1);
  add("R410A-25", 1);

  add("DISC-60A", 1);
  add("WHIP-6FT", 1);
  const brkr = tonnage <= 3 ? "BRKR-30A" : tonnage <= 4 ? "BRKR-40A" : "BRKR-50A";
  add(brkr, 1);

  const equipLoc = hvacNotes?.suggested_equipment_location?.toLowerCase() ?? "";
  if (equipLoc.includes("attic") || equipLoc.includes("closet")) {
    add("CPUMP", 1);
  }
  add("PTRAP", 1);
  add("DRAIN-PVC", 2);
  const filtId = tonnage <= 3 ? "FILT-16x25" : "FILT-20x25";
  add(filtId, 2);
  add("MASTIC", Math.max(2, Math.ceil(trunkLen / 25)));
  add("TAPE-FOIL", Math.max(2, Math.ceil(totalRegs / 6)));
  add("PAD-COND", 1);
  add("HANGER", Math.max(2, Math.ceil(trunkLen / 40)));

  return {
    items,
    summary: { designBTU, tonnage, totalCFM, totalRegs, retCount, condSqft, zones },
    roomLoads,
  };
}
