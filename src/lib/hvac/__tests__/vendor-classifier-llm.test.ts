import { describe, it, expect, vi } from "vitest";
import {
  classifyVendorProductsBatch,
  type ClassifierClient,
} from "../vendor-classifier-llm";
import type { VendorProductRow } from "@/types/catalog";

function row(o: Partial<VendorProductRow>): VendorProductRow {
  return {
    id: o.id ?? "id-1",
    vendor_id: "v1",
    sku: "SKU",
    mpn: null,
    name: "",
    brand: null,
    image_url: null,
    short_description: null,
    category_root: null,
    category_path: null,
    category_leaf: null,
    detail_url: null,
    price: null,
    price_text: null,
    last_priced_at: null,
    vendor: null,
    ...o,
  };
}

describe("classifyVendorProductsBatch", () => {
  it("parses a valid LLM response into typed results", async () => {
    const fakeClient: ClassifierClient = {
      classify: vi.fn().mockResolvedValue([
        {
          id: "id-1",
          bom_slot: "ac_condenser",
          bom_specs: { tonnage: 3, seer: 16, refrigerant: "r410a" },
        },
        { id: "id-2", bom_slot: null, bom_specs: null },
      ]),
    };

    const out = await classifyVendorProductsBatch(
      [
        row({ id: "id-1", name: "3 Ton AC Condenser" }),
        row({ id: "id-2", name: "Hole Saw 3/4" }),
      ],
      fakeClient,
    );

    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      id: "id-1",
      bom_slot: "ac_condenser",
      bom_specs: { tonnage: 3, seer: 16, refrigerant: "r410a" },
    });
    expect(out[1]).toEqual({ id: "id-2", bom_slot: null, bom_specs: null });
  });

  it("drops an entry when bom_specs fails Zod validation", async () => {
    // v2: tonnage is nullish, so we trip validation with an invalid refrigerant
    // enum instead of a missing required field.
    const fakeClient: ClassifierClient = {
      classify: vi.fn().mockResolvedValue([
        {
          id: "id-1",
          bom_slot: "ac_condenser",
          bom_specs: { tonnage: 3, refrigerant: "r999-not-real" },
        },
      ]),
    };
    const out = await classifyVendorProductsBatch([row({ id: "id-1" })], fakeClient);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ id: "id-1", bom_slot: null, bom_specs: null });
  });

  it("accepts an ac_condenser with null tonnage (v2: no hallucinated guessing)", async () => {
    const fakeClient: ClassifierClient = {
      classify: vi.fn().mockResolvedValue([
        {
          id: "id-1",
          bom_slot: "ac_condenser",
          bom_specs: { tonnage: null, refrigerant: "r410a" },
        },
      ]),
    };
    const out = await classifyVendorProductsBatch([row({ id: "id-1" })], fakeClient);
    expect(out).toHaveLength(1);
    expect(out[0].bom_slot).toBe("ac_condenser");
    expect(out[0].bom_specs).toEqual({ tonnage: null, refrigerant: "r410a" });
  });

  it("drops an entry when bom_slot is not in the taxonomy", async () => {
    const fakeClient: ClassifierClient = {
      classify: vi.fn().mockResolvedValue([
        { id: "id-1", bom_slot: "invented_slot", bom_specs: {} },
      ]),
    };
    const out = await classifyVendorProductsBatch([row({ id: "id-1" })], fakeClient);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ id: "id-1", bom_slot: null, bom_specs: null });
  });

  it("returns null entries for ids the LLM omits", async () => {
    const fakeClient: ClassifierClient = {
      classify: vi.fn().mockResolvedValue([
        { id: "id-1", bom_slot: null, bom_specs: null },
      ]),
    };
    const out = await classifyVendorProductsBatch(
      [row({ id: "id-1" }), row({ id: "id-2" })],
      fakeClient,
    );
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.id).sort()).toEqual(["id-1", "id-2"]);
  });
});
