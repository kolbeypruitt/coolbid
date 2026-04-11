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

/** Room types that default to unconditioned (no heating/cooling). */
const UNCONDITIONED_TYPES: Set<RoomType> = new Set(["garage"]);

/** Name substrings that indicate an unconditioned space. */
const UNCONDITIONED_NAME_PATTERNS = ["patio", "porch", "deck", "lanai"];

function defaultConditioned(type: RoomType, name: string): boolean {
  if (UNCONDITIONED_TYPES.has(type)) return false;
  const lower = name.toLowerCase();
  return !UNCONDITIONED_NAME_PATTERNS.some((p) => lower.includes(p));
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
  conditioned: z.coerce.boolean().optional(),
  unit: z.coerce.number().int().min(1).optional(),
  polygon_id: z.string().default(""),
  // Populated post-validation from geometry service vertices, not from Claude output
  vertices: z.array(z.object({
    x: z.coerce.number().min(0).max(1),
    y: z.coerce.number().min(0).max(1),
  })).default([]),
  bbox: z.object({
    x: z.coerce.number().min(0).max(1),
    y: z.coerce.number().min(0).max(1),
    width: z.coerce.number().min(0).max(1),
    height: z.coerce.number().min(0).max(1),
  }).default({ x: 0, y: 0, width: 0, height: 0 }),
  centroid: z.object({
    x: z.coerce.number().min(0).max(1),
    y: z.coerce.number().min(0).max(1),
  }).default({ x: 0, y: 0 }),
  adjacent_rooms: z.array(z.string()).default([]),
}).transform((room) => ({
  ...room,
  conditioned: room.conditioned ?? defaultConditioned(room.type, room.name),
}));

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
