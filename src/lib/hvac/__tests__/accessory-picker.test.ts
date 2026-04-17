import { describe, it, expect, vi } from "vitest";
import {
  pickAccessories,
  enrichBomWithAccessories,
  type AccessoryPickerClient,
} from "../accessory-picker";
import type { CatalogItem } from "@/types/catalog";
import type { BomItem, BomResult } from "@/types/hvac";

function catalogItem(over: Partial<CatalogItem>): CatalogItem {
  return {
    id: "c1",
    user_id: "",
    supplier_id: null,
    vendor_product_id: null,
    mpn: "MPN",
    description: "",
    equipment_type: "refrigerant",
    system_type: "universal",
    brand: "",
    tonnage: null,
    seer_rating: null,
    btu_capacity: null,
    stages: null,
    refrigerant_type: null,
    unit_price: 100,
    unit_of_measure: "ea",
    source: "imported",
    usage_count: 0,
    last_quoted_date: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function bomItem(over: Partial<BomItem>): BomItem {
  return {
    partId: "",
    name: "",
    category: "",
    qty: 1,
    unit: "ea",
    price: null,
    supplier: "",
    sku: "",
    notes: "",
    source: "missing",
    brand: "",
    ...over,
  };
}

function bomResult(items: BomItem[]): BomResult {
  return {
    items,
    summary: {
      designBTU: 30000,
      tonnage: 3,
      totalCFM: 1200,
      totalRegs: 8,
      retCount: 2,
      condSqft: 1500,
      zones: 1,
    },
    roomLoads: [],
  };
}

describe("pickAccessories", () => {
  it("returns the LLM picks merged with slot ids verbatim", async () => {
    const fakeClient: AccessoryPickerClient = {
      pick: vi.fn().mockResolvedValue({
        line_set: { pick_id: "vendor:line1", reason: "3/8x7/8 matches" },
        breaker: { pick_id: "vendor:brk1", reason: "30A covers 21A MCA" },
      }),
    };

    const out = await pickAccessories(
      {
        majorEquipment: [
          {
            slot: "ac_condenser",
            name: "3 Ton AC",
            specs: { tonnage: 3, mca: 21, liquid_size: "3/8", suction_size: "7/8" },
          },
        ],
        requirements: [
          { slot: "line_set", quantity: 1, fallbackLabel: "Line Set" },
          { slot: "breaker", quantity: 1, fallbackLabel: "Breaker" },
        ],
        candidatesBySlot: {
          line_set: [catalogItem({ id: "vendor:line1" })],
          breaker: [catalogItem({ id: "vendor:brk1" })],
        },
        preferences: null,
      },
      fakeClient,
    );

    expect(out.line_set).toEqual({ pickId: "vendor:line1", reason: "3/8x7/8 matches" });
    expect(out.breaker).toEqual({ pickId: "vendor:brk1", reason: "30A covers 21A MCA" });
  });

  it("drops a slot's pick when pick_id isn't in the candidate list", async () => {
    const fakeClient: AccessoryPickerClient = {
      pick: vi.fn().mockResolvedValue({
        line_set: { pick_id: "vendor:hallucinated", reason: "made up" },
      }),
    };

    const out = await pickAccessories(
      {
        majorEquipment: [],
        requirements: [{ slot: "line_set", quantity: 1, fallbackLabel: "Line Set" }],
        candidatesBySlot: { line_set: [catalogItem({ id: "vendor:real" })] },
        preferences: null,
      },
      fakeClient,
    );

    expect(out.line_set).toEqual({ pickId: null, reason: "made up" });
  });

  it("returns an empty object when no requirements are given", async () => {
    const fakeClient: AccessoryPickerClient = { pick: vi.fn() };
    const out = await pickAccessories(
      {
        majorEquipment: [],
        requirements: [],
        candidatesBySlot: {},
        preferences: null,
      },
      fakeClient,
    );
    expect(out).toEqual({});
    expect(fakeClient.pick).not.toHaveBeenCalled();
  });
});

describe("enrichBomWithAccessories", () => {
  it("replaces missing BomItems with picked candidates", async () => {
    const condenser = catalogItem({
      id: "vendor:ac",
      equipment_type: "ac_condenser",
      description: "3 Ton AC",
      bom_specs: { tonnage: 3, mca: 21, liquid_size: "3/8", suction_size: "7/8" },
    });
    const linesetCandidate = catalogItem({
      id: "vendor:line1",
      equipment_type: "refrigerant",
      description: "3/8x7/8 25ft Line Set",
      brand: "Mueller",
      bom_specs: { liquid_size: "3/8", suction_size: "7/8", length_ft: 25 },
    });

    const bom = bomResult([
      bomItem({
        partId: "vendor:ac",
        source: "imported",
        bom_slot: "ac_condenser",
        name: "3 Ton AC",
        category: "Major Equipment",
      }),
      bomItem({
        source: "missing",
        bom_slot: "line_set",
        name: "Line Set (25ft)",
        category: "Refrigerant & Lines",
        qty: 1,
      }),
    ]);

    const fakeClient: AccessoryPickerClient = {
      pick: vi.fn().mockResolvedValue({
        line_set: { pick_id: "vendor:line1", reason: "sizes match" },
      }),
    };

    const enriched = await enrichBomWithAccessories(
      bom,
      [condenser, linesetCandidate],
      null,
      fakeClient,
    );

    const linesetItem = enriched.items.find((i) => i.bom_slot === "line_set");
    expect(linesetItem?.source).toBe("imported");
    expect(linesetItem?.partId).toBe("vendor:line1");
    expect(linesetItem?.qty).toBe(1);
    expect(linesetItem?.brand).toBe("Mueller");
    expect(linesetItem?.notes).toContain("sizes match");
  });

  it("leaves items untouched when no client is provided", async () => {
    const bom = bomResult([
      bomItem({ source: "missing", bom_slot: "line_set", name: "Line Set" }),
    ]);
    const enriched = await enrichBomWithAccessories(bom, [], null, undefined);
    expect(enriched.items[0].source).toBe("missing");
  });

  it("leaves a missing item alone if the LLM returns pickId: null", async () => {
    const fakeClient: AccessoryPickerClient = {
      pick: vi.fn().mockResolvedValue({
        p_trap: { pick_id: null, reason: "no 3/4\" PVC trap in catalog" },
      }),
    };
    const bom = bomResult([
      bomItem({ source: "missing", bom_slot: "p_trap", name: "P-Trap" }),
    ]);
    const enriched = await enrichBomWithAccessories(
      bom,
      [
        catalogItem({
          id: "vendor:x",
          equipment_type: "installation",
          bom_specs: { size_inches: 1 },
        }),
      ],
      null,
      fakeClient,
    );
    expect(enriched.items[0].source).toBe("missing");
    expect(enriched.items[0].notes).toContain("no 3/4");
  });

  it("swallows LLM errors and returns the original BOM", async () => {
    const fakeClient: AccessoryPickerClient = {
      pick: vi.fn().mockRejectedValue(new Error("timeout")),
    };
    const bom = bomResult([
      bomItem({ source: "missing", bom_slot: "line_set", name: "Line Set" }),
    ]);
    const enriched = await enrichBomWithAccessories(bom, [], null, fakeClient);
    expect(enriched).toBe(bom);
  });
});
