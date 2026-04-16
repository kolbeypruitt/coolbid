import type { LoadFactor, RoomType } from "@/types/hvac";

export const LOAD_FACTORS: Record<RoomType, LoadFactor> = {
  master_bedroom: { btu: 18, cfm: 1.0, reg: 2 },
  bedroom:        { btu: 18, cfm: 1.0, reg: 1 },
  living_room:    { btu: 22, cfm: 1.2, reg: 2 },
  family_room:    { btu: 22, cfm: 1.2, reg: 2 },
  kitchen:        { btu: 26, cfm: 1.3, reg: 1 },
  dining_room:    { btu: 20, cfm: 1.0, reg: 1 },
  bathroom:       { btu: 20, cfm: 0.8, reg: 1 },
  half_bath:      { btu: 20, cfm: 0.8, reg: 0 },
  hallway:        { btu: 14, cfm: 0.5, reg: 1 },
  laundry:        { btu: 20, cfm: 0.8, reg: 1 },
  office:         { btu: 20, cfm: 1.0, reg: 1 },
  foyer:          { btu: 18, cfm: 0.6, reg: 1 },
  sunroom:        { btu: 35, cfm: 1.5, reg: 2 },
  bonus_room:     { btu: 22, cfm: 1.0, reg: 1 },
  basement:       { btu: 14, cfm: 0.8, reg: 1 },
  closet:         { btu: 0,  cfm: 0,   reg: 0 },
  garage:         { btu: 0,  cfm: 0,   reg: 0 },
};

export const ROOM_TYPES: RoomType[] = Object.keys(LOAD_FACTORS) as RoomType[];

