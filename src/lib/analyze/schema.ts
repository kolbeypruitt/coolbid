import { z } from "zod";
import type { RoomType } from "@/types/hvac";
import { ROOM_TYPES } from "@/lib/hvac/parts-db";

/** Map common Claude output variations to valid RoomType enum values. */
const TYPE_ALIASES: Record<string, RoomType> = {
  "master bedroom": "master_bedroom",
  "master_bed": "master_bedroom",
  "mstr bdrm": "master_bedroom",
  "living room": "living_room",
  "family room": "family_room",
  "dining room": "dining_room",
  "half bath": "half_bath",
  "half_bathroom": "half_bath",
  "powder room": "half_bath",
  "bonus room": "bonus_room",
  "bonus_rm": "bonus_room",
  "great room": "family_room",
  "great_room": "family_room",
  "den": "office",
  "study": "office",
  "mud room": "laundry",
  "mudroom": "laundry",
  "mud_room": "laundry",
  "entry": "foyer",
  "entryway": "foyer",
  "vestibule": "foyer",
  "utility": "laundry",
  "utility_room": "laundry",
  "walk_in_closet": "closet",
  "walk-in closet": "closet",
  "pantry": "closet",
  "sun room": "sunroom",
  "sun_room": "sunroom",
  "breakfast nook": "dining_room",
  "breakfast_nook": "dining_room",
  "nook": "dining_room",
};

function normalizeRoomType(raw: string): RoomType {
  const lower = raw.toLowerCase().trim();
  if (ROOM_TYPES.includes(lower as RoomType)) return lower as RoomType;
  if (TYPE_ALIASES[lower]) return TYPE_ALIASES[lower];
  const underscored = lower.replace(/\s+/g, "_");
  if (ROOM_TYPES.includes(underscored as RoomType)) return underscored as RoomType;
  console.warn(`Unrecognized room type "${raw}", falling back to bonus_room`);
  return "bonus_room";
}

const RoomSchema = z.object({
  name: z.string().min(1),
  type: z.string().transform(normalizeRoomType),
  floor: z.coerce.number().int().min(1).default(1),
  estimated_sqft: z.coerce.number().min(0),
  width_ft: z.coerce.number().min(0),
  length_ft: z.coerce.number().min(0),
  window_count: z.coerce.number().int().min(0).default(0),
  exterior_walls: z.coerce.number().int().min(0).max(4).default(1),
  ceiling_height: z.coerce.number().min(0).default(9),
  notes: z.string().default(""),
  unit: z.coerce.number().int().min(1).optional(),
  polygon_id: z.string().min(1),
  bbox: z.object({
    x: z.coerce.number().min(0).max(1),
    y: z.coerce.number().min(0).max(1),
    width: z.coerce.number().min(0).max(1),
    height: z.coerce.number().min(0).max(1),
  }),
  centroid: z.object({
    x: z.coerce.number().min(0).max(1),
    y: z.coerce.number().min(0).max(1),
  }),
  adjacent_rooms: z.array(z.string()).default([]),
});

const BuildingSchema = z.object({
  stories: z.coerce.number().int().min(1).default(1),
  total_sqft: z.coerce.number().min(0),
  units: z.coerce.number().int().min(1).default(1),
  has_garage: z.coerce.boolean().default(false),
  building_shape: z.string().default("rectangle"),
  unit_sqft: z.array(z.coerce.number().min(0)).optional(),
});

const HvacNotesSchema = z.object({
  suggested_equipment_location: z.string().default(""),
  suggested_zones: z.coerce.number().int().min(1).default(1),
  special_considerations: z.array(z.string()).default([]),
});

export const AnalysisResultSchema = z.object({
  floorplan_type: z.string().default("residential floor plan"),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
  building: BuildingSchema,
  rooms: z.array(RoomSchema).min(1, "At least one room is required"),
  hvac_notes: HvacNotesSchema,
  analysis_notes: z.string().default(""),
});

export type ParsedAnalysisResult = z.infer<typeof AnalysisResultSchema>;
