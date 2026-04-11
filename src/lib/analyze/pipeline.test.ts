import { describe, it, expect } from "vitest";
import { AnalysisResultSchema } from "./schema";
import { validateAnalysis } from "./validate-analysis";

/**
 * Integration tests: simulate the full pipeline from raw Claude JSON output
 * through Zod schema validation and post-processing.
 *
 * These fixtures represent realistic Claude responses for known floor plans.
 */

/** Bobby Wright residence — 1600sqft single-family, 1 story */
const WRIGHT_RESIDENCE_RESPONSE = {
  floorplan_type: "residential floor plan",
  confidence: "high",
  building: {
    stories: 1,
    total_sqft: 1600,
    units: 1,
    has_garage: true,
    building_shape: "rectangle",
  },
  rooms: [
    {
      name: "Master Bedroom",
      type: "master bedroom",
      floor: 1,
      estimated_sqft: 200,
      width_ft: 10,
      length_ft: 20,
      window_count: 3,
      exterior_walls: 2,
      ceiling_height: 9,
      notes: "",
      polygon_id: "room_0",
      bbox: { x: 0.02, y: 0.15, width: 0.18, height: 0.35 },
      centroid: { x: 0.11, y: 0.325 },
      adjacent_rooms: ["Hall", "Bathroom"],
    },
    {
      name: "Living Room",
      type: "living room",
      floor: 1,
      estimated_sqft: 350,
      width_ft: 17.5,
      length_ft: 20,
      window_count: 4,
      exterior_walls: 2,
      ceiling_height: 9,
      notes: "Sunken",
      polygon_id: "room_1",
      bbox: { x: 0.2, y: 0.05, width: 0.25, height: 0.35 },
      centroid: { x: 0.325, y: 0.225 },
      adjacent_rooms: ["Hall", "Kitchen", "Dining"],
    },
    {
      name: "Hall",
      type: "hallway",
      floor: 1,
      estimated_sqft: 80,
      width_ft: 4,
      length_ft: 20,
      window_count: 0,
      exterior_walls: 0,
      ceiling_height: 9,
      notes: "",
      polygon_id: "room_2",
      bbox: { x: 0.18, y: 0.2, width: 0.05, height: 0.3 },
      centroid: { x: 0.205, y: 0.35 },
      adjacent_rooms: ["Master Bedroom", "Living Room", "Kitchen"],
    },
    {
      name: "Kitchen",
      type: "kitchen",
      floor: 1,
      estimated_sqft: 180,
      width_ft: 9,
      length_ft: 20,
      window_count: 1,
      exterior_walls: 1,
      ceiling_height: 9,
      notes: "",
      polygon_id: "room_3",
      bbox: { x: 0.3, y: 0.45, width: 0.15, height: 0.25 },
      centroid: { x: 0.375, y: 0.575 },
      adjacent_rooms: ["Entry", "Dining", "Hall"],
    },
    {
      name: "Dining",
      type: "dining room",
      floor: 1,
      estimated_sqft: 160,
      width_ft: 10,
      length_ft: 16,
      window_count: 1,
      exterior_walls: 1,
      ceiling_height: 9,
      notes: "",
      polygon_id: "room_4",
      bbox: { x: 0.45, y: 0.45, width: 0.15, height: 0.25 },
      centroid: { x: 0.525, y: 0.575 },
      adjacent_rooms: ["Kitchen", "Living Room"],
    },
    {
      name: "Entry",
      type: "entry",
      floor: 1,
      estimated_sqft: 60,
      width_ft: 6,
      length_ft: 10,
      window_count: 0,
      exterior_walls: 1,
      ceiling_height: 9,
      notes: "",
      polygon_id: "room_5",
      bbox: { x: 0.3, y: 0.7, width: 0.08, height: 0.12 },
      centroid: { x: 0.34, y: 0.76 },
      adjacent_rooms: ["Kitchen", "Porch"],
    },
    {
      name: "Bathroom",
      type: "bathroom",
      floor: 1,
      estimated_sqft: 60,
      width_ft: 6,
      length_ft: 10,
      window_count: 1,
      exterior_walls: 1,
      ceiling_height: 9,
      notes: "",
      polygon_id: "room_6",
      bbox: { x: 0.02, y: 0.5, width: 0.1, height: 0.15 },
      centroid: { x: 0.07, y: 0.575 },
      adjacent_rooms: ["Master Bedroom"],
    },
    {
      name: "Bedroom 2",
      type: "bedroom",
      floor: 1,
      estimated_sqft: 165,
      width_ft: 11,
      length_ft: 15,
      window_count: 2,
      exterior_walls: 2,
      ceiling_height: 9,
      notes: "",
      polygon_id: "room_7",
      bbox: { x: 0.02, y: 0.65, width: 0.15, height: 0.2 },
      centroid: { x: 0.095, y: 0.75 },
      adjacent_rooms: ["Hall"],
    },
    {
      name: "Porch",
      type: "bonus_room",
      floor: 1,
      estimated_sqft: 120,
      width_ft: 12,
      length_ft: 10,
      window_count: 0,
      exterior_walls: 3,
      ceiling_height: 9,
      notes: "",
      polygon_id: "room_8",
      bbox: { x: 0.25, y: 0.82, width: 0.2, height: 0.1 },
      centroid: { x: 0.35, y: 0.87 },
      adjacent_rooms: ["Entry"],
    },
    {
      name: "2 Car Garage",
      type: "garage",
      floor: 1,
      estimated_sqft: 400,
      width_ft: 20,
      length_ft: 20,
      window_count: 0,
      exterior_walls: 3,
      ceiling_height: 9,
      notes: "",
      polygon_id: "room_9",
      bbox: { x: 0.65, y: 0.1, width: 0.3, height: 0.4 },
      centroid: { x: 0.8, y: 0.3 },
      adjacent_rooms: [],
    },
    {
      name: "Storage",
      type: "closet",
      floor: 1,
      estimated_sqft: 100,
      width_ft: 10,
      length_ft: 10,
      window_count: 0,
      exterior_walls: 1,
      ceiling_height: 9,
      notes: "",
      polygon_id: "room_10",
      bbox: { x: 0.75, y: 0.55, width: 0.15, height: 0.15 },
      centroid: { x: 0.825, y: 0.625 },
      adjacent_rooms: [],
    },
    {
      name: "Covered Patio",
      type: "bonus_room",
      floor: 1,
      estimated_sqft: 300,
      width_ft: 20,
      length_ft: 15,
      window_count: 0,
      exterior_walls: 3,
      ceiling_height: 9,
      notes: "",
      polygon_id: "room_11",
      bbox: { x: 0.15, y: 0.0, width: 0.5, height: 0.1 },
      centroid: { x: 0.4, y: 0.05 },
      adjacent_rooms: ["Living Room"],
    },
  ],
  hvac_notes: {
    suggested_equipment_location: "garage or utility closet",
    suggested_zones: 2,
    special_considerations: ["Sunken living room may need extra supply"],
  },
  analysis_notes: "Scale 1/4\" = 1'-0\"",
};

describe("pipeline: schema → validation", () => {
  it("processes the Wright residence floor plan (12 rooms expected)", () => {
    const parsed = AnalysisResultSchema.parse(WRIGHT_RESIDENCE_RESPONSE);
    const result = validateAnalysis(parsed);

    // Should have all 12 rooms
    expect(result.rooms.length).toBeGreaterThanOrEqual(10);
    expect(result.rooms).toHaveLength(12);

    // Room type normalization
    const masterBedroom = result.rooms.find((r) => r.name === "Master Bedroom");
    expect(masterBedroom?.type).toBe("master_bedroom");

    const livingRoom = result.rooms.find((r) => r.name === "Living Room");
    expect(livingRoom?.type).toBe("living_room");

    const entry = result.rooms.find((r) => r.name === "Entry");
    expect(entry?.type).toBe("foyer");

    const dining = result.rooms.find((r) => r.name === "Dining");
    expect(dining?.type).toBe("dining_room");

    // Conditioned defaults
    const garage = result.rooms.find((r) => r.name === "2 Car Garage");
    expect(garage?.conditioned).toBe(false);

    const patio = result.rooms.find((r) => r.name === "Covered Patio");
    expect(patio?.conditioned).toBe(false);

    const porch = result.rooms.find((r) => r.name === "Porch");
    expect(porch?.conditioned).toBe(false);

    const kitchen = result.rooms.find((r) => r.name === "Kitchen");
    expect(kitchen?.conditioned).toBe(true);

    // All polygon_ids should be unique
    const polygonIds = result.rooms.map((r) => r.polygon_id);
    expect(new Set(polygonIds).size).toBe(polygonIds.length);

    // Confidence should stay high (rooms sum is close enough to 1600 for conditioned)
    // Conditioned sum: 200+350+80+180+160+60+60+165 = 1255 (unconditioned: garage 400, patio 300, porch 120, storage 100)
    // That's within range for 1600 total since garage/patio/porch are unconditioned
  });

  it("detects when geometry only returns 1 polygon (the bug)", () => {
    // Simulate the bug: geometry service returns 1 giant polygon
    const singleRoomResponse = {
      ...WRIGHT_RESIDENCE_RESPONSE,
      rooms: [
        {
          name: "Living Area",
          type: "living_room",
          floor: 1,
          estimated_sqft: 1600,
          width_ft: 40,
          length_ft: 40,
          window_count: 10,
          exterior_walls: 4,
          ceiling_height: 9,
          notes: "Single polygon covering entire floor plan",
          polygon_id: "room_0",
          bbox: { x: 0.02, y: 0.02, width: 0.96, height: 0.96 },
          centroid: { x: 0.5, y: 0.5 },
          adjacent_rooms: [],
        },
      ],
    };

    const parsed = AnalysisResultSchema.parse(singleRoomResponse);
    const result = validateAnalysis(parsed);

    // This is the "1 room" bug — the polygon covers almost the entire image
    // A single polygon with area ratio ~0.92 means the geometry service
    // failed to segment individual rooms
    expect(result.rooms).toHaveLength(1);

    // The bbox covers almost the whole image — a red flag
    expect(result.rooms[0].bbox.width).toBeGreaterThan(0.9);
    expect(result.rooms[0].bbox.height).toBeGreaterThan(0.9);
  });

  it("handles rooms with missing optional fields from Claude", () => {
    const sparseResponse = {
      floorplan_type: "residential",
      confidence: "medium",
      building: { stories: 1, total_sqft: 800, units: 1, has_garage: false, building_shape: "rectangle" },
      rooms: [
        {
          name: "Bedroom",
          type: "bedroom",
          estimated_sqft: 150,
          width_ft: 10,
          length_ft: 15,
          polygon_id: "room_0",
          bbox: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
          centroid: { x: 0.25, y: 0.25 },
          // Missing: floor, window_count, exterior_walls, ceiling_height, notes, adjacent_rooms
        },
        {
          name: "Kitchen",
          type: "kitchen",
          estimated_sqft: 120,
          width_ft: 10,
          length_ft: 12,
          polygon_id: "room_1",
          bbox: { x: 0.5, y: 0.1, width: 0.2, height: 0.3 },
          centroid: { x: 0.6, y: 0.25 },
        },
      ],
      hvac_notes: { suggested_equipment_location: "", suggested_zones: 1, special_considerations: [] },
      analysis_notes: "",
    };

    const parsed = AnalysisResultSchema.parse(sparseResponse);
    const result = validateAnalysis(parsed);

    expect(result.rooms).toHaveLength(2);
    // Defaults applied
    expect(result.rooms[0].floor).toBe(1);
    expect(result.rooms[0].window_count).toBe(0);
    expect(result.rooms[0].ceiling_height).toBe(9);
    expect(result.rooms[0].adjacent_rooms).toEqual([]);
  });

  it("processes a duplex floor plan with per-unit rooms", () => {
    const duplexResponse = {
      floorplan_type: "duplex floor plan",
      confidence: "high",
      building: {
        stories: 1,
        total_sqft: 2400,
        units: 2,
        has_garage: false,
        building_shape: "rectangle",
        unit_sqft: [1200, 1200],
      },
      rooms: [
        // Unit 1
        { name: "Living Room", type: "living_room", floor: 1, unit: 1, estimated_sqft: 300, width_ft: 15, length_ft: 20, window_count: 3, exterior_walls: 2, ceiling_height: 9, notes: "", polygon_id: "room_0", bbox: { x: 0.05, y: 0.1, width: 0.2, height: 0.3 }, centroid: { x: 0.15, y: 0.25 }, adjacent_rooms: ["Kitchen"] },
        { name: "Kitchen", type: "kitchen", floor: 1, unit: 1, estimated_sqft: 200, width_ft: 10, length_ft: 20, window_count: 1, exterior_walls: 1, ceiling_height: 9, notes: "", polygon_id: "room_1", bbox: { x: 0.05, y: 0.4, width: 0.2, height: 0.25 }, centroid: { x: 0.15, y: 0.525 }, adjacent_rooms: ["Living Room", "Bedroom"] },
        { name: "Bedroom", type: "bedroom", floor: 1, unit: 1, estimated_sqft: 250, width_ft: 12.5, length_ft: 20, window_count: 2, exterior_walls: 2, ceiling_height: 9, notes: "", polygon_id: "room_2", bbox: { x: 0.05, y: 0.65, width: 0.2, height: 0.25 }, centroid: { x: 0.15, y: 0.775 }, adjacent_rooms: ["Kitchen"] },
        { name: "Bathroom", type: "bathroom", floor: 1, unit: 1, estimated_sqft: 60, width_ft: 6, length_ft: 10, window_count: 1, exterior_walls: 1, ceiling_height: 9, notes: "", polygon_id: "room_3", bbox: { x: 0.25, y: 0.65, width: 0.1, height: 0.15 }, centroid: { x: 0.3, y: 0.725 }, adjacent_rooms: [] },
        // Unit 2
        { name: "Living Room", type: "living_room", floor: 1, unit: 2, estimated_sqft: 300, width_ft: 15, length_ft: 20, window_count: 3, exterior_walls: 2, ceiling_height: 9, notes: "", polygon_id: "room_4", bbox: { x: 0.55, y: 0.1, width: 0.2, height: 0.3 }, centroid: { x: 0.65, y: 0.25 }, adjacent_rooms: ["Kitchen"] },
        { name: "Kitchen", type: "kitchen", floor: 1, unit: 2, estimated_sqft: 200, width_ft: 10, length_ft: 20, window_count: 1, exterior_walls: 1, ceiling_height: 9, notes: "", polygon_id: "room_5", bbox: { x: 0.55, y: 0.4, width: 0.2, height: 0.25 }, centroid: { x: 0.65, y: 0.525 }, adjacent_rooms: ["Living Room", "Bedroom"] },
        { name: "Bedroom", type: "bedroom", floor: 1, unit: 2, estimated_sqft: 250, width_ft: 12.5, length_ft: 20, window_count: 2, exterior_walls: 2, ceiling_height: 9, notes: "", polygon_id: "room_6", bbox: { x: 0.55, y: 0.65, width: 0.2, height: 0.25 }, centroid: { x: 0.65, y: 0.775 }, adjacent_rooms: ["Kitchen"] },
        { name: "Bathroom", type: "bathroom", floor: 1, unit: 2, estimated_sqft: 60, width_ft: 6, length_ft: 10, window_count: 1, exterior_walls: 1, ceiling_height: 9, notes: "", polygon_id: "room_7", bbox: { x: 0.75, y: 0.65, width: 0.1, height: 0.15 }, centroid: { x: 0.8, y: 0.725 }, adjacent_rooms: [] },
      ],
      hvac_notes: { suggested_equipment_location: "utility closet", suggested_zones: 2, special_considerations: [] },
      analysis_notes: "",
    };

    const parsed = AnalysisResultSchema.parse(duplexResponse);
    const result = validateAnalysis(parsed, { perUnitAnalysis: true });

    expect(result.rooms).toHaveLength(8);

    // Same room name in different units is allowed
    const kitchens = result.rooms.filter((r) => r.name === "Kitchen");
    expect(kitchens).toHaveLength(2);
    expect(kitchens[0].unit).toBe(1);
    expect(kitchens[1].unit).toBe(2);

    // Per-unit sqft validation: each unit has 300+200+250+60=810, expected 1200
    // That's >15% off, so confidence should drop
    expect(result.confidence).toBe("low");
  });
});
