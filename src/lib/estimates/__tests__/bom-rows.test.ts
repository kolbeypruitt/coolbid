import { describe, it, expect } from "vitest";
import { toBomInsertRows } from "../bom-rows";
import type { BomItem } from "@/types/hvac";

describe("toBomInsertRows", () => {
  it("does not leak transient bom_slot field into the insert payload", () => {
    const item: BomItem = {
      partId: "x",
      name: "n",
      category: "c",
      qty: 1,
      unit: "ea",
      price: 10,
      supplier: "s",
      sku: "sku",
      notes: "",
      source: "imported",
      brand: "b",
      bom_slot: "line_set",
    };
    const [row] = toBomInsertRows([item], "estimate-id");
    expect(row).not.toHaveProperty("bom_slot");
  });
});
