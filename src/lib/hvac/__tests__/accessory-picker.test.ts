import { describe, it, expect, vi } from "vitest";
import {
  pickAccessories,
  enrichBomWithAccessories,
  synthesizeBomSpecs,
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

  it("passes synthesized specs to the picker for equipment_catalog majors (no bom_specs)", async () => {
    // Reproduces the R-454B coil + R-410A bulk refrigerant compatibility
    // bug: user's major equipment is from equipment_catalog so it has no
    // classifier-populated bom_specs. Synthesis from direct columns lets
    // the picker still reason about compatibility.
    const quotedCoil = catalogItem({
      id: "user:coil",
      equipment_type: "evap_coil",
      description: "R-454B MP V-EVAP COIL 5T - ALU",
      tonnage: 5,
      refrigerant_type: "R-454B",
      source: "quote",
      // NOTE: no bom_specs — this is from the user's equipment_catalog
    });

    const bom = bomResult([
      bomItem({
        partId: "user:coil",
        source: "quote",
        bom_slot: "evap_coil",
        name: "R-454B MP V-EVAP COIL 5T",
        category: "Major Equipment",
      }),
      bomItem({
        source: "missing",
        bom_slot: "refrigerant",
        name: "R-410A Refrigerant (25lb)",
        category: "Refrigerant & Lines",
        qty: 1,
      }),
    ]);

    const fakeClient: AccessoryPickerClient = {
      pick: vi.fn().mockResolvedValue({
        refrigerant: { pick_id: null, reason: "coil is R-454B; no compatible refrigerant in catalog" },
      }),
    };

    await enrichBomWithAccessories(bom, [quotedCoil], null, fakeClient);

    const pickCall = (fakeClient.pick as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(pickCall.majorEquipment).toHaveLength(1);
    expect(pickCall.majorEquipment[0].specs).toEqual({
      tonnage: 5,
      refrigerant: "r454b",
    });
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

  it("includes unclassified vendor candidates and sorts classified first", async () => {
    // Runtime-classified vendor rows (no bom_specs) must still reach the
    // picker — otherwise accessory slots like flex_duct/line_set/p_trap
    // return empty candidate lists whenever the LLM classifier hasn't
    // processed those rows yet.
    const classified = catalogItem({
      id: "vendor:classified-trap",
      equipment_type: "installation",
      description: "3/4 PVC P-Trap",
      bom_specs: { size_inches: 0.75, material: "pvc" },
    });
    const unclassified = catalogItem({
      id: "vendor:runtime-trap",
      equipment_type: "installation",
      description: "1/2 PVC P-Trap",
      // no bom_specs — came from classifyVendorProducts fallback
    });

    const bom = bomResult([
      bomItem({ source: "missing", bom_slot: "p_trap", name: "P-Trap", qty: 1 }),
    ]);

    const fakeClient: AccessoryPickerClient = {
      pick: vi.fn().mockResolvedValue({
        p_trap: { pick_id: "vendor:classified-trap", reason: "matches 3/4 drain" },
      }),
    };

    await enrichBomWithAccessories(
      bom,
      [unclassified, classified],
      null,
      fakeClient,
    );

    const pickCall = (fakeClient.pick as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const candidates = pickCall.candidatesBySlot.p_trap;
    expect(candidates).toHaveLength(2);
    expect(candidates[0].id).toBe("vendor:classified-trap");
    expect(candidates[1].id).toBe("vendor:runtime-trap");
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

describe("synthesizeBomSpecs (equipment_catalog fallback)", () => {
  it("extracts tonnage + seer + refrigerant + stages for an ac_condenser", () => {
    const specs = synthesizeBomSpecs(
      catalogItem({
        equipment_type: "ac_condenser",
        tonnage: 5,
        seer_rating: 18,
        refrigerant_type: "R-410A",
        stages: 2,
      }),
      "ac_condenser",
    );
    expect(specs).toEqual({
      tonnage: 5,
      seer: 18,
      refrigerant: "r410a",
      stages: 2,
    });
  });

  it("normalizes R-454B variants to r454b", () => {
    expect(
      synthesizeBomSpecs(
        catalogItem({ equipment_type: "evap_coil", tonnage: 5, refrigerant_type: "R-454B" }),
        "evap_coil",
      ),
    ).toEqual({ tonnage: 5, refrigerant: "r454b" });

    expect(
      synthesizeBomSpecs(
        catalogItem({ equipment_type: "evap_coil", tonnage: 3, refrigerant_type: "R454" }),
        "evap_coil",
      ),
    ).toEqual({ tonnage: 3, refrigerant: "r454b" });
  });

  it("maps gas_furnace btu_capacity to btu_output", () => {
    expect(
      synthesizeBomSpecs(
        catalogItem({ equipment_type: "gas_furnace", btu_capacity: 100000, stages: 1 }),
        "gas_furnace",
      ),
    ).toEqual({ btu_output: 100000, stages: 1 });
  });

  it("skips null fields instead of emitting them", () => {
    const specs = synthesizeBomSpecs(
      catalogItem({ equipment_type: "ac_condenser", tonnage: 3, refrigerant_type: null }),
      "ac_condenser",
    );
    expect(specs).toEqual({ tonnage: 3 });
    expect(specs).not.toHaveProperty("refrigerant");
  });

  it("returns empty for slots with no derivable direct columns (thermostat)", () => {
    expect(
      synthesizeBomSpecs(catalogItem({ equipment_type: "thermostat" }), "thermostat"),
    ).toEqual({});
  });
});
