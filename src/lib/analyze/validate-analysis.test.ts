import { describe, it, expect } from "vitest";
import { validateAnalysis } from "./validate-analysis";
import type { AnalysisResult, Room } from "@/types/hvac";

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    name: "Kitchen",
    type: "kitchen",
    floor: 1,
    estimated_sqft: 200,
    width_ft: 10,
    length_ft: 20,
    window_count: 2,
    exterior_walls: 1,
    ceiling_height: 9,
    notes: "",
    conditioned: true,
    polygon_id: "room_0",
    vertices: [],
    bbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.25 },
    centroid: { x: 0.25, y: 0.325 },
    adjacent_rooms: [],
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
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
      makeRoom({ name: "Living Room", type: "living_room", polygon_id: "room_0", estimated_sqft: 400, width_ft: 20, length_ft: 20 }),
      makeRoom({ name: "Kitchen", type: "kitchen", polygon_id: "room_1", estimated_sqft: 200, width_ft: 10, length_ft: 20 }),
      makeRoom({ name: "Master Bedroom", type: "master_bedroom", polygon_id: "room_2", estimated_sqft: 300, width_ft: 15, length_ft: 20 }),
      makeRoom({ name: "Bedroom 2", type: "bedroom", polygon_id: "room_3", estimated_sqft: 180, width_ft: 12, length_ft: 15 }),
      makeRoom({ name: "Bathroom", type: "bathroom", polygon_id: "room_4", estimated_sqft: 80, width_ft: 8, length_ft: 10 }),
      makeRoom({ name: "Hallway", type: "hallway", polygon_id: "room_5", estimated_sqft: 60, width_ft: 4, length_ft: 15 }),
      makeRoom({ name: "Garage", type: "garage", polygon_id: "room_6", estimated_sqft: 400, width_ft: 20, length_ft: 20, conditioned: false }),
    ],
    hvac_notes: {
      suggested_equipment_location: "garage",
      suggested_zones: 1,
      special_considerations: [],
    },
    analysis_notes: "",
    ...overrides,
  };
}

describe("validateAnalysis", () => {
  it("passes through a valid multi-room result unchanged", () => {
    const input = makeAnalysis();
    const result = validateAnalysis(input);
    expect(result.rooms).toHaveLength(7);
    expect(result.confidence).toBe("high");
  });

  describe("sqft consistency", () => {
    it("corrects sqft when width × length diverges > 15%", () => {
      const input = makeAnalysis({
        rooms: [
          makeRoom({ estimated_sqft: 300, width_ft: 10, length_ft: 20 }), // 10×20=200, off by 50%
        ],
      });
      const result = validateAnalysis(input);
      expect(result.rooms[0].estimated_sqft).toBe(200);
      expect(result.analysis_notes).toContain("corrected");
    });

    it("leaves sqft alone when within 15% of width × length", () => {
      const input = makeAnalysis({
        rooms: [makeRoom({ estimated_sqft: 195, width_ft: 10, length_ft: 20 })],
      });
      const result = validateAnalysis(input);
      expect(result.rooms[0].estimated_sqft).toBe(195); // 2.5% off, no correction
    });
  });

  describe("ceiling height", () => {
    it("fixes zero ceiling height to 9", () => {
      const input = makeAnalysis({
        rooms: [makeRoom({ ceiling_height: 0 })],
      });
      const result = validateAnalysis(input);
      expect(result.rooms[0].ceiling_height).toBe(9);
    });

    it("preserves non-zero ceiling height", () => {
      const input = makeAnalysis({
        rooms: [makeRoom({ ceiling_height: 10 })],
      });
      const result = validateAnalysis(input);
      expect(result.rooms[0].ceiling_height).toBe(10);
    });
  });

  describe("dimension warnings", () => {
    it("warns on unusually small width", () => {
      const input = makeAnalysis({
        rooms: [makeRoom({ width_ft: 2, length_ft: 5, estimated_sqft: 10 })],
      });
      const result = validateAnalysis(input);
      expect(result.analysis_notes).toContain("width 2 ft seems unusual");
    });

    it("warns on unusually large length", () => {
      const input = makeAnalysis({
        rooms: [makeRoom({ width_ft: 10, length_ft: 55, estimated_sqft: 550 })],
      });
      const result = validateAnalysis(input);
      expect(result.analysis_notes).toContain("length 55 ft seems unusual");
    });
  });

  describe("duplicate detection", () => {
    it("warns on duplicate room name+floor", () => {
      const input = makeAnalysis({
        rooms: [
          makeRoom({ name: "Bedroom", floor: 1, polygon_id: "room_0" }),
          makeRoom({ name: "Bedroom", floor: 1, polygon_id: "room_1" }),
        ],
      });
      const result = validateAnalysis(input);
      expect(result.analysis_notes).toContain("Duplicate room");
    });

    it("allows same name on different floors", () => {
      const input = makeAnalysis({
        rooms: [
          makeRoom({ name: "Bathroom", floor: 1, polygon_id: "room_0" }),
          makeRoom({ name: "Bathroom", floor: 2, polygon_id: "room_1" }),
        ],
      });
      const result = validateAnalysis(input);
      expect(result.analysis_notes).not.toContain("Duplicate room");
    });

    it("allows same name in different units", () => {
      const input = makeAnalysis({
        rooms: [
          makeRoom({ name: "Kitchen", floor: 1, unit: 1, polygon_id: "room_0" }),
          makeRoom({ name: "Kitchen", floor: 1, unit: 2, polygon_id: "room_1" }),
        ],
      });
      const result = validateAnalysis(input);
      expect(result.analysis_notes).not.toContain("Duplicate room");
    });
  });

  describe("geometry validation", () => {
    it("warns on missing polygon_id", () => {
      const input = makeAnalysis({
        rooms: [makeRoom({ polygon_id: "" })],
      });
      const result = validateAnalysis(input);
      expect(result.analysis_notes).toContain("missing polygon_id");
    });

    it("warns on invalid bbox", () => {
      const input = makeAnalysis({
        rooms: [makeRoom({ bbox: { x: 0, y: 0, width: 0, height: 0 } })],
      });
      const result = validateAnalysis(input);
      expect(result.analysis_notes).toContain("invalid or missing bbox");
    });

    it("warns on duplicate polygon_ids and downgrades confidence", () => {
      const input = makeAnalysis({
        rooms: [
          makeRoom({ name: "Kitchen", polygon_id: "room_0" }),
          makeRoom({ name: "Dining", polygon_id: "room_0" }),
        ],
      });
      const result = validateAnalysis(input);
      expect(result.analysis_notes).toContain("same polygon_id");
      expect(result.confidence).toBe("low");
    });
  });

  describe("sqft sum validation", () => {
    it("downgrades confidence when room sqft sum is far from building total", () => {
      const input = makeAnalysis({
        building: { stories: 1, total_sqft: 3000, units: 1, has_garage: false, building_shape: "rectangle" },
        rooms: [makeRoom({ estimated_sqft: 200, width_ft: 10, length_ft: 20 })],
      });
      const result = validateAnalysis(input);
      expect(result.confidence).toBe("low");
      expect(result.analysis_notes).toContain("differs from");
    });

    it("validates per-unit sqft with unit_sqft array", () => {
      const input = makeAnalysis({
        building: {
          stories: 1, total_sqft: 2400, units: 2, has_garage: false,
          building_shape: "rectangle", unit_sqft: [1200, 1200],
        },
        rooms: [
          makeRoom({ name: "Kitchen", unit: 1, estimated_sqft: 500, width_ft: 20, length_ft: 25, polygon_id: "room_0" }),
          makeRoom({ name: "Kitchen", unit: 2, estimated_sqft: 500, width_ft: 20, length_ft: 25, polygon_id: "room_1" }),
        ],
      });
      const result = validateAnalysis(input);
      // Unit 1 sum = 500, expected 1200 → >15% diff → low confidence
      expect(result.confidence).toBe("low");
    });
  });
});
