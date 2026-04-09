import type { ClimateZoneKey, Room, RoomLoad } from "@/types/hvac";
import { CLIMATE_ZONES } from "./climate-zones";
import { LOAD_FACTORS } from "./parts-db";

export function calculateRoomLoad(room: Room, climateZone: ClimateZoneKey): RoomLoad {
  const factor = LOAD_FACTORS[room.type];
  const climateFactor = CLIMATE_ZONES[climateZone].factor;

  if (room.type === "garage" || room.type === "closet") {
    return { ...room, btu: 0, cfm: 0, regs: 0 };
  }

  const sqft = room.estimated_sqft;
  const baseBTU = sqft * factor.btu * climateFactor;
  const winBTU = room.window_count * 800;
  const wallBTU = room.exterior_walls * 400;
  const ceilFactor = room.ceiling_height > 8 ? room.ceiling_height / 8 : 1;

  const btu = Math.ceil((baseBTU + winBTU + wallBTU) * ceilFactor);
  const cfm = Math.ceil(sqft * factor.cfm);
  const regs = Math.max(factor.reg, Math.ceil(cfm / 150));

  return { ...room, btu, cfm, regs };
}

export function calculateSystemTonnage(totalBTU: number): number {
  const designBTU = Math.ceil(totalBTU * 1.1);
  const raw = Math.ceil((designBTU / 12000) * 2) / 2;
  return Math.min(5, Math.max(1.5, raw));
}

export function calculateZoneCount(stories: number, condSqft: number): number {
  if ((stories >= 2 && condSqft > 1800) || condSqft > 3000) return 2;
  return 1;
}

export function needsReturnRegister(room: Room): boolean {
  const excluded: Room["type"][] = ["hallway", "bathroom", "half_bath", "laundry"];
  return room.estimated_sqft >= 200 && room.exterior_walls >= 1 && !excluded.includes(room.type);
}
