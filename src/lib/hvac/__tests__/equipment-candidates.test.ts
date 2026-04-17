import { describe, it, expect } from "vitest";
import { findEquipmentCandidates } from "../equipment-candidates";
import type { CatalogItem } from "@/types/catalog";

function item(over: Partial<CatalogItem>): CatalogItem {
  return {
    id: "c1",
    user_id: "",
    supplier_id: null,
    vendor_product_id: null,
    mpn: "",
    description: "",
    equipment_type: "ac_condenser",
    system_type: "universal",
    brand: "",
    tonnage: null,
    seer_rating: null,
    btu_capacity: null,
    stages: null,
    refrigerant_type: null,
    unit_price: null,
    unit_of_measure: "ea",
    source: "manual",
    usage_count: 0,
    last_quoted_date: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("findEquipmentCandidates", () => {
  it("filters by equipment_type derived from slot", () => {
    const catalog = [
      item({ id: "a", equipment_type: "ac_condenser", tonnage: 3 }),
      item({ id: "b", equipment_type: "gas_furnace", btu_capacity: 80000 }),
    ];
    const out = findEquipmentCandidates({
      catalog,
      slot: "ac_condenser",
      targetTonnage: 3,
      systemType: "gas_ac",
      preferences: null,
    });
    expect(out.map((c) => c.id)).toEqual(["a"]);
  });

  it("filters by tonnage within ±0.5 of target", () => {
    const catalog = [
      item({ id: "exact", equipment_type: "ac_condenser", tonnage: 3 }),
      item({ id: "close", equipment_type: "ac_condenser", tonnage: 2.5 }),
      item({ id: "far", equipment_type: "ac_condenser", tonnage: 5 }),
    ];
    const out = findEquipmentCandidates({
      catalog,
      slot: "ac_condenser",
      targetTonnage: 3,
      systemType: "gas_ac",
      preferences: null,
    });
    expect(out.map((c) => c.id).sort()).toEqual(["close", "exact"]);
  });

  it("keeps items with null tonnage (ranked after tonnage-matching ones)", () => {
    const catalog = [
      item({ id: "untyped", equipment_type: "ac_condenser", tonnage: null }),
      item({ id: "exact", equipment_type: "ac_condenser", tonnage: 3 }),
    ];
    const out = findEquipmentCandidates({
      catalog,
      slot: "ac_condenser",
      targetTonnage: 3,
      systemType: "gas_ac",
      preferences: null,
    });
    expect(out[0].id).toBe("exact");
    expect(out.map((c) => c.id)).toContain("untyped");
  });

  it("respects system_type: matches target or universal", () => {
    const catalog = [
      item({ id: "universal", equipment_type: "ac_condenser", tonnage: 3, system_type: "universal" }),
      item({ id: "gas_ac", equipment_type: "ac_condenser", tonnage: 3, system_type: "gas_ac" }),
      item({ id: "hp_only", equipment_type: "ac_condenser", tonnage: 3, system_type: "heat_pump" }),
    ];
    const out = findEquipmentCandidates({
      catalog,
      slot: "ac_condenser",
      targetTonnage: 3,
      systemType: "gas_ac",
      preferences: null,
    });
    expect(out.map((c) => c.id).sort()).toEqual(["gas_ac", "universal"]);
  });

  it("ranks brand-preference matches ahead of non-matches at same tonnage", () => {
    const catalog = [
      item({ id: "goodman", equipment_type: "ac_condenser", tonnage: 3, brand: "Goodman", usage_count: 10 }),
      item({ id: "carrier", equipment_type: "ac_condenser", tonnage: 3, brand: "Carrier", usage_count: 5 }),
    ];
    const out = findEquipmentCandidates({
      catalog,
      slot: "ac_condenser",
      targetTonnage: 3,
      systemType: "gas_ac",
      preferences: { equipment_brands: ["Carrier"] },
    });
    expect(out[0].id).toBe("carrier");
  });

  it("falls back to usage_count desc when no brand preference match", () => {
    const catalog = [
      item({ id: "rare", equipment_type: "ac_condenser", tonnage: 3, brand: "Trane", usage_count: 1 }),
      item({ id: "common", equipment_type: "ac_condenser", tonnage: 3, brand: "Goodman", usage_count: 20 }),
    ];
    const out = findEquipmentCandidates({
      catalog,
      slot: "ac_condenser",
      targetTonnage: 3,
      systemType: "gas_ac",
      preferences: null,
    });
    expect(out[0].id).toBe("common");
  });

  it("handles thermostat slot (no tonnage filter)", () => {
    const catalog = [
      item({ id: "smart", equipment_type: "thermostat", brand: "Ecobee" }),
      item({ id: "simple", equipment_type: "thermostat", brand: "Honeywell" }),
    ];
    const out = findEquipmentCandidates({
      catalog,
      slot: "thermostat",
      targetTonnage: null,
      systemType: "gas_ac",
      preferences: { thermostat_brand: "Honeywell" },
    });
    expect(out[0].id).toBe("simple");
  });

  it("ranks priced items ahead of null-priced ones at the same tonnage", () => {
    const catalog = [
      item({ id: "free", equipment_type: "ac_condenser", tonnage: 3, unit_price: null }),
      item({ id: "priced", equipment_type: "ac_condenser", tonnage: 3, unit_price: 2400 }),
    ];
    const out = findEquipmentCandidates({
      catalog,
      slot: "ac_condenser",
      targetTonnage: 3,
      systemType: "gas_ac",
      preferences: null,
    });
    expect(out.map((c) => c.id)).toEqual(["priced", "free"]);
  });

  it("limits results to the `limit` parameter", () => {
    const catalog = Array.from({ length: 20 }, (_, i) =>
      item({ id: `c${i}`, equipment_type: "ac_condenser", tonnage: 3 }),
    );
    const out = findEquipmentCandidates({
      catalog,
      slot: "ac_condenser",
      targetTonnage: 3,
      systemType: "gas_ac",
      preferences: null,
      limit: 5,
    });
    expect(out).toHaveLength(5);
  });
});
