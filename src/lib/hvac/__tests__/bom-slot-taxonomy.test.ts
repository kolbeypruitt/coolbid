import { describe, it, expect } from "vitest";
import {
  BOM_SLOT_VALUES,
  BOM_SPEC_SCHEMAS,
  SLOT_TO_EQUIPMENT_TYPE,
  CLASSIFIER_VERSION,
  validateBomSpecs,
} from "../bom-slot-taxonomy";

describe("bom-slot-taxonomy", () => {
  it("every slot has a Zod schema", () => {
    for (const slot of BOM_SLOT_VALUES) {
      expect(BOM_SPEC_SCHEMAS[slot]).toBeDefined();
    }
  });

  it("every slot maps to an equipment_type", () => {
    for (const slot of BOM_SLOT_VALUES) {
      expect(SLOT_TO_EQUIPMENT_TYPE[slot]).toBeDefined();
    }
  });

  it("validateBomSpecs accepts a valid ac_condenser spec", () => {
    const result = validateBomSpecs("ac_condenser", {
      tonnage: 3,
      seer: 16,
      refrigerant: "r410a",
      mca: 21,
      max_fuse: 35,
      liquid_size: "3/8",
      suction_size: "7/8",
      voltage: 208,
      phase: 1,
      stages: 1,
    });
    expect(result.success).toBe(true);
  });

  it("validateBomSpecs rejects an ac_condenser missing tonnage", () => {
    const result = validateBomSpecs("ac_condenser", {
      seer: 16,
      refrigerant: "r410a",
    });
    expect(result.success).toBe(false);
  });

  it("validateBomSpecs accepts a line_set with required sizes + length", () => {
    const result = validateBomSpecs("line_set", {
      liquid_size: "3/8",
      suction_size: "7/8",
      length_ft: 25,
    });
    expect(result.success).toBe(true);
  });

  it("validateBomSpecs rejects an unknown slot", () => {
    const result = validateBomSpecs("made_up_slot", {});
    expect(result.success).toBe(false);
  });

  it("CLASSIFIER_VERSION is a positive integer", () => {
    expect(Number.isInteger(CLASSIFIER_VERSION)).toBe(true);
    expect(CLASSIFIER_VERSION).toBeGreaterThan(0);
  });
});
