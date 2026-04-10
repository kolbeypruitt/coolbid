import { describe, it, expect } from "vitest";
import { generateScopeOfWork } from "./scope-of-work";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

function estimate(overrides: Partial<EstimateRow> = {}): EstimateRow {
  return {
    id: "e1",
    user_id: "u1",
    project_name: "Smith Residence",
    customer_name: "Jane Smith",
    status: "draft",
    total_sqft: 1820,
    num_units: 1,
    hvac_per_unit: false,
    climate_zone: "3A",
    profit_margin: 25,
    labor_rate: 85,
    labor_hours: 16,
    supplier_name: "",
    total_material_cost: null,
    total_price: null,
    system_type: "heat_pump",
    created_at: "2026-04-09T00:00:00Z",
    updated_at: "2026-04-09T00:00:00Z",
    job_address: null,
    customer_email: null,
    customer_phone: null,
    note_to_customer: null,
    valid_until: null,
    display_mode: "total_only",
    scope_of_work: null,
    ...overrides,
  };
}

function bomItem(overrides: Partial<BomRow> = {}): BomRow {
  return {
    id: "b1",
    estimate_id: "e1",
    category: "equipment",
    description: "3.5-ton heat pump",
    quantity: 1,
    unit: "ea",
    unit_cost: 4000,
    total_cost: 4000,
    part_id: null,
    supplier: null,
    sku: null,
    notes: "",
    source: "catalog",
    room_id: null,
    created_at: "2026-04-09T00:00:00Z",
    ...overrides,
  };
}

describe("generateScopeOfWork", () => {
  it("describes a heat pump install with tonnage, sqft, and climate zone", () => {
    const result = generateScopeOfWork(
      estimate(),
      [bomItem({ description: "3.5-ton heat pump, 16 SEER2" })],
    );
    expect(result).toContain("heat pump");
    expect(result).toContain("1,820 sq ft");
    expect(result).toContain("Zone 3A");
    expect(result).toContain("ductwork");
  });

  it("labels gas AC systems correctly", () => {
    const result = generateScopeOfWork(
      estimate({ system_type: "gas_ac", total_sqft: 2400 }),
      [bomItem({ description: "4-ton gas furnace with AC coil" })],
    );
    expect(result).toContain("gas furnace");
    expect(result).toContain("2,400 sq ft");
  });

  it("falls back gracefully when sqft is null", () => {
    const result = generateScopeOfWork(
      estimate({ total_sqft: null }),
      [bomItem()],
    );
    expect(result).toMatch(/HVAC system installation/i);
    expect(result).not.toContain("null");
  });
});
