import { describe, it, expect } from "vitest";
import { AnalysisResultSchema } from "./schema";

/** Minimal valid room for building test fixtures. */
function makeRoom(overrides: Record<string, unknown> = {}) {
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
    polygon_id: "room_0",
    bbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.25 },
    centroid: { x: 0.25, y: 0.325 },
    adjacent_rooms: [],
    ...overrides,
  };
}

/** Minimal valid analysis result. */
function makeResult(overrides: Record<string, unknown> = {}) {
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
    rooms: [makeRoom()],
    hvac_notes: {
      suggested_equipment_location: "garage",
      suggested_zones: 1,
      special_considerations: [],
    },
    analysis_notes: "",
    ...overrides,
  };
}

describe("AnalysisResultSchema", () => {
  it("parses a valid single-room result", () => {
    const result = AnalysisResultSchema.parse(makeResult());
    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0].type).toBe("kitchen");
    expect(result.rooms[0].conditioned).toBe(true);
  });

  it("parses a multi-room floor plan", () => {
    const rooms = [
      makeRoom({ name: "Kitchen", type: "kitchen", polygon_id: "room_0" }),
      makeRoom({ name: "Living Room", type: "living_room", polygon_id: "room_1", estimated_sqft: 300, width_ft: 15, length_ft: 20 }),
      makeRoom({ name: "Master Bedroom", type: "master_bedroom", polygon_id: "room_2", estimated_sqft: 250, width_ft: 12.5, length_ft: 20 }),
      makeRoom({ name: "Bedroom 2", type: "bedroom", polygon_id: "room_3", estimated_sqft: 150, width_ft: 10, length_ft: 15 }),
      makeRoom({ name: "Bathroom", type: "bathroom", polygon_id: "room_4", estimated_sqft: 60, width_ft: 6, length_ft: 10 }),
      makeRoom({ name: "Garage", type: "garage", polygon_id: "room_5", estimated_sqft: 400, width_ft: 20, length_ft: 20 }),
      makeRoom({ name: "Hallway", type: "hallway", polygon_id: "room_6", estimated_sqft: 80, width_ft: 4, length_ft: 20 }),
    ];
    const result = AnalysisResultSchema.parse(makeResult({ rooms }));
    expect(result.rooms).toHaveLength(7);
  });

  describe("room type normalization", () => {
    it.each([
      ["master bedroom", "master_bedroom"],
      ["master_bed", "master_bedroom"],
      ["mstr bdrm", "master_bedroom"],
      ["living room", "living_room"],
      ["family room", "family_room"],
      ["great room", "family_room"],
      ["great_room", "family_room"],
      ["dining room", "dining_room"],
      ["half bath", "half_bath"],
      ["half_bathroom", "half_bath"],
      ["powder room", "half_bath"],
      ["bonus room", "bonus_room"],
      ["den", "office"],
      ["study", "office"],
      ["mud room", "laundry"],
      ["mudroom", "laundry"],
      ["entry", "foyer"],
      ["entryway", "foyer"],
      ["vestibule", "foyer"],
      ["utility", "laundry"],
      ["walk-in closet", "closet"],
      ["pantry", "closet"],
      ["sun room", "sunroom"],
      ["breakfast nook", "dining_room"],
      ["nook", "dining_room"],
    ])('normalizes "%s" → "%s"', (input, expected) => {
      const result = AnalysisResultSchema.parse(
        makeResult({ rooms: [makeRoom({ type: input })] })
      );
      expect(result.rooms[0].type).toBe(expected);
    });

    it("falls back to bonus_room for unrecognized types", () => {
      const result = AnalysisResultSchema.parse(
        makeResult({ rooms: [makeRoom({ type: "conservatory" })] })
      );
      expect(result.rooms[0].type).toBe("bonus_room");
    });
  });

  describe("conditioned defaults", () => {
    it("marks garage as unconditioned", () => {
      const result = AnalysisResultSchema.parse(
        makeResult({ rooms: [makeRoom({ type: "garage", name: "2 Car Garage" })] })
      );
      expect(result.rooms[0].conditioned).toBe(false);
    });

    it("marks patio as unconditioned by name", () => {
      const result = AnalysisResultSchema.parse(
        makeResult({ rooms: [makeRoom({ name: "Covered Patio", type: "bonus_room" })] })
      );
      expect(result.rooms[0].conditioned).toBe(false);
    });

    it("marks porch as unconditioned by name", () => {
      const result = AnalysisResultSchema.parse(
        makeResult({ rooms: [makeRoom({ name: "Front Porch", type: "bonus_room" })] })
      );
      expect(result.rooms[0].conditioned).toBe(false);
    });

    it("marks deck as unconditioned by name", () => {
      const result = AnalysisResultSchema.parse(
        makeResult({ rooms: [makeRoom({ name: "Back Deck", type: "bonus_room" })] })
      );
      expect(result.rooms[0].conditioned).toBe(false);
    });

    it("respects explicit conditioned=true override on garage", () => {
      const result = AnalysisResultSchema.parse(
        makeResult({ rooms: [makeRoom({ type: "garage", conditioned: true })] })
      );
      expect(result.rooms[0].conditioned).toBe(true);
    });

    it("marks kitchen as conditioned", () => {
      const result = AnalysisResultSchema.parse(
        makeResult({ rooms: [makeRoom({ type: "kitchen" })] })
      );
      expect(result.rooms[0].conditioned).toBe(true);
    });
  });

  describe("defaults and coercion", () => {
    it("defaults floor to 1", () => {
      const result = AnalysisResultSchema.parse(
        makeResult({ rooms: [makeRoom({ floor: undefined })] })
      );
      expect(result.rooms[0].floor).toBe(1);
    });

    it("defaults ceiling_height to 9", () => {
      const result = AnalysisResultSchema.parse(
        makeResult({ rooms: [makeRoom({ ceiling_height: undefined })] })
      );
      expect(result.rooms[0].ceiling_height).toBe(9);
    });

    it("defaults window_count to 0", () => {
      const result = AnalysisResultSchema.parse(
        makeResult({ rooms: [makeRoom({ window_count: undefined })] })
      );
      expect(result.rooms[0].window_count).toBe(0);
    });

    it("defaults bbox to zeros when missing", () => {
      const result = AnalysisResultSchema.parse(
        makeResult({ rooms: [makeRoom({ bbox: undefined })] })
      );
      expect(result.rooms[0].bbox).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });

    it("coerces string numbers", () => {
      const result = AnalysisResultSchema.parse(
        makeResult({
          rooms: [makeRoom({ estimated_sqft: "200", width_ft: "10", length_ft: "20" })],
        })
      );
      expect(result.rooms[0].estimated_sqft).toBe(200);
      expect(result.rooms[0].width_ft).toBe(10);
    });

    it("clamps exterior_walls to 0-4", () => {
      expect(() =>
        AnalysisResultSchema.parse(
          makeResult({ rooms: [makeRoom({ exterior_walls: 5 })] })
        )
      ).toThrow();
    });
  });

  describe("validation failures", () => {
    it("rejects empty rooms array", () => {
      expect(() => AnalysisResultSchema.parse(makeResult({ rooms: [] }))).toThrow();
    });

    it("rejects room without name", () => {
      expect(() =>
        AnalysisResultSchema.parse(makeResult({ rooms: [makeRoom({ name: "" })] }))
      ).toThrow();
    });

    it("rejects bbox values outside 0-1", () => {
      expect(() =>
        AnalysisResultSchema.parse(
          makeResult({
            rooms: [makeRoom({ bbox: { x: 1.5, y: 0, width: 0.3, height: 0.2 } })],
          })
        )
      ).toThrow();
    });
  });
});
