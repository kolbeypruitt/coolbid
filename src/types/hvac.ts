export type { SystemType } from "./catalog";

export type ClimateZoneKey = "hot_humid" | "hot_dry" | "warm" | "mixed" | "cool" | "cold";

export type ClimateZone = { label: string; factor: number; desc: string };

export type RoomType = "master_bedroom" | "bedroom" | "living_room" | "family_room" | "kitchen" | "dining_room" | "bathroom" | "half_bath" | "hallway" | "laundry" | "office" | "foyer" | "sunroom" | "bonus_room" | "basement" | "closet" | "garage";

export type LoadFactor = { btu: number; cfm: number; reg: number };

export type Part = { name: string; category: string; unit: string; price: number; supplier: string; sku: string };

export type Room = {
  name: string; type: RoomType; floor: number; estimated_sqft: number;
  width_ft: number; length_ft: number; window_count: number;
  exterior_walls: number; ceiling_height: number; notes: string;
  unit?: number;
};

export type RoomLoad = Room & { btu: number; cfm: number; regs: number };

export type BomItem = {
  partId: string; name: string; category: string; qty: number; unit: string;
  price: number | null; supplier: string; sku: string; notes: string; source: "starter" | "quote" | "manual" | "missing";
  brand: string;
};

export type BomSummary = {
  designBTU: number; tonnage: number; totalCFM: number; totalRegs: number;
  retCount: number; condSqft: number; zones: number;
};

export type BomResult = { items: BomItem[]; summary: BomSummary; roomLoads: RoomLoad[] };

export type BuildingInfo = { stories: number; total_sqft: number; units: number; has_garage: boolean; building_shape: string; unit_sqft?: number[] };

export type HvacNotes = { suggested_equipment_location: string; suggested_zones: number; special_considerations: string[] };

export type AnalysisResult = {
  floorplan_type: string; confidence: "high" | "medium" | "low";
  building: BuildingInfo; rooms: Room[]; hvac_notes: HvacNotes; analysis_notes: string;
};
