import { describe, it, expect, vi } from "vitest";
import { generateBOM } from "../bom-generator";
import {
  classifyVendorProducts,
  classifiedRowToCatalogItem,
  type ClassifiedVendorRow,
} from "../vendor-classifier";
import {
  enrichBomWithAccessories,
  type AccessoryPickerClient,
} from "../accessory-picker";
import type { CatalogItem, VendorProductRow } from "@/types/catalog";
import type { Room } from "@/types/hvac";

function vendor(over: Partial<VendorProductRow>): VendorProductRow {
  return {
    id: crypto.randomUUID(),
    vendor_id: "v1",
    sku: "SKU",
    mpn: null,
    name: "",
    brand: "Goodman",
    image_url: null,
    short_description: null,
    category_root: "HVAC-Equipment",
    category_path: "",
    category_leaf: "",
    detail_url: null,
    price: 100,
    price_text: null,
    last_priced_at: null,
    vendor: null,
    ...over,
  };
}

function room(sqft: number): Room {
  return {
    name: "Living",
    type: "living_room",
    floor: 1,
    estimated_sqft: sqft,
    width_ft: 20,
    length_ft: 20,
    window_count: 2,
    exterior_walls: 2,
    ceiling_height: 8,
    notes: "",
    conditioned: true,
    polygon_id: "p1",
    vertices: [],
    bbox: { x: 0, y: 0, width: 100, height: 100 },
    centroid: { x: 50, y: 50 },
    adjacent_rooms: [],
  };
}

describe("generateBOM with classified vendor_products", () => {
  it("fills major equipment + controls from vendor_products", () => {
    const catalog = classifyVendorProducts([
      vendor({
        name: "3 Ton AC Condensing Unit",
        mpn: "GSX160361",
        category_path: "HVAC-Equipment/Residential-Unitary/Split-Systems",
      }),
      vendor({
        name: "80K BTU Gas Furnace",
        mpn: "GMSS960803",
        category_path: "HVAC-Equipment/Residential-Unitary/Gas-Furnaces",
      }),
      vendor({
        name: "3 Ton Cased Evaporator Coil",
        mpn: "CAUF3642",
        category_path:
          "HVAC-Equipment/Residential-Unitary/Air-Handlers-Evaporator-Coils",
      }),
      vendor({
        name: "Honeywell T6 Pro Thermostat",
        brand: "Honeywell",
        category_path:
          "Controls/Thermostats/Thermostats/Digital-Programmable-Thermostats",
      }),
    ]);

    const bom = generateBOM([room(1500)], "mixed", "gas_ac", catalog);
    const missingMajor = bom.items.filter(
      (i) =>
        i.source === "missing" &&
        ["Major Equipment", "Controls"].includes(i.category),
    );
    expect(missingMajor).toHaveLength(0);
  });

  it("prefers user catalog over vendor catalog (usage_count tie-break)", () => {
    const userItem = {
      id: "user1",
      user_id: "u",
      supplier_id: null,
      vendor_product_id: null,
      mpn: "USER-AC",
      description: "User's preferred AC",
      equipment_type: "ac_condenser" as const,
      system_type: "universal" as const,
      brand: "Carrier",
      tonnage: 3,
      seer_rating: null,
      btu_capacity: null,
      stages: null,
      refrigerant_type: null,
      unit_price: 2000,
      unit_of_measure: "ea",
      source: "quote" as const,
      usage_count: 5,
      last_quoted_date: null,
      created_at: "",
      updated_at: "",
    };
    const vendorItems = classifyVendorProducts([
      vendor({
        name: "3 Ton AC Condenser",
        mpn: "GSX160361",
        category_path: "HVAC-Equipment/Residential-Unitary/Split-Systems",
      }),
    ]);
    const bom = generateBOM(
      [room(1500)],
      "mixed",
      "gas_ac",
      [userItem, ...vendorItems],
    );
    const condenser = bom.items.find(
      (i) => i.category === "Major Equipment" && i.name.includes("preferred AC"),
    );
    expect(condenser?.source).toBe("quote");
  });

  it("tolerates null brand on items and null/empty entries in preferences", () => {
    // Reproduces 'Cannot read properties of null (reading toLowerCase)'
    // surfaced when contractor_preferences.equipment_brands is wired
    // through (was being fetched but not passed before).
    const userItem = {
      id: "user1",
      user_id: "u",
      supplier_id: null,
      vendor_product_id: null,
      mpn: "X",
      description: "Legacy item with null brand",
      equipment_type: "ac_condenser" as const,
      system_type: "universal" as const,
      brand: null as unknown as string,
      tonnage: 3,
      seer_rating: null,
      btu_capacity: null,
      stages: null,
      refrigerant_type: null,
      unit_price: 100,
      unit_of_measure: "ea",
      source: "manual" as const,
      usage_count: 1,
      last_quoted_date: null,
      created_at: "",
      updated_at: "",
    };
    const malformedPrefs = {
      equipment_brands: ["", null as unknown as string, "Carrier"],
    };
    expect(() =>
      generateBOM(
        [room(1500)],
        "mixed",
        "gas_ac",
        [userItem],
        undefined,
        undefined,
        malformedPrefs,
      ),
    ).not.toThrow();
  });

  it("contractor brand preference picks vendor item with matching brand", () => {
    const catalog = classifyVendorProducts([
      vendor({
        name: "3 Ton AC Condenser",
        brand: "Goodman",
        mpn: "GSX160361",
        category_path: "HVAC-Equipment/Residential-Unitary/Split-Systems",
      }),
      vendor({
        name: "3 Ton AC Condenser",
        brand: "Carrier",
        mpn: "24ACC636",
        category_path: "HVAC-Equipment/Residential-Unitary/Split-Systems",
      }),
    ]);
    const bom = generateBOM(
      [room(1500)],
      "mixed",
      "gas_ac",
      catalog,
      undefined,
      undefined,
      { equipment_brands: ["Carrier"] },
    );
    const condenser = bom.items.find(
      (i) => i.category === "Major Equipment" && i.name.includes("Condenser"),
    );
    expect(condenser?.brand).toBe("Carrier");
  });
});

describe("classifiedRowToCatalogItem", () => {
  it("maps an LLM-classified ac_condenser row to a CatalogItem with tonnage", () => {
    const row: ClassifiedVendorRow = {
      id: "abc",
      vendor_id: "v1",
      sku: "SKU",
      mpn: "GSX160361",
      name: "3 Ton AC Condensing Unit",
      brand: "Goodman",
      image_url: null,
      short_description: null,
      category_root: null,
      category_path: null,
      category_leaf: null,
      detail_url: null,
      price: 2000,
      price_text: null,
      last_priced_at: null,
      vendor: null,
      bom_slot: "ac_condenser",
      bom_specs: { tonnage: 3, seer: 16, refrigerant: "r410a" },
    };
    const item = classifiedRowToCatalogItem(row);
    expect(item?.equipment_type).toBe("ac_condenser");
    expect(item?.tonnage).toBe(3);
    expect(item?.brand).toBe("Goodman");
    expect(item?.bom_specs).toEqual({ tonnage: 3, seer: 16, refrigerant: "r410a" });
  });

  it("returns null for rows where bom_slot is null", () => {
    const row: ClassifiedVendorRow = {
      id: "abc",
      vendor_id: "v1",
      sku: "SKU",
      mpn: null,
      name: "Hole Saw",
      brand: "Greenlee",
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
      bom_slot: null,
      bom_specs: null,
    };
    expect(classifiedRowToCatalogItem(row)).toBeNull();
  });
});

describe("generateBOM + enrichBomWithAccessories end-to-end", () => {
  it("replaces a missing line set with a compatible LLM pick", async () => {
    const condenser: CatalogItem = {
      id: "vendor:ac1",
      user_id: "",
      supplier_id: null,
      vendor_product_id: "ac1",
      mpn: "GSX160361",
      description: "3 Ton AC Condenser",
      equipment_type: "ac_condenser",
      system_type: "universal",
      brand: "Goodman",
      tonnage: 3,
      seer_rating: null,
      btu_capacity: null,
      stages: null,
      refrigerant_type: null,
      unit_price: 2000,
      unit_of_measure: "ea",
      source: "imported",
      usage_count: 0,
      last_quoted_date: null,
      created_at: "",
      updated_at: "",
      bom_specs: { tonnage: 3, mca: 21, liquid_size: "3/8", suction_size: "7/8", refrigerant: "r410a" },
    };
    // Names/MPNs chosen so findCatalogItemByKeyword doesn't auto-match on
    // "25ft"/"50ft" — forces the item into the "missing" state that the
    // enrichment step is meant to handle.
    const lineSet: CatalogItem = {
      ...condenser,
      id: "vendor:line1",
      mpn: "LSET-A",
      description: "Goodman Refrigerant Line Set 3/8 liquid 7/8 suction",
      equipment_type: "refrigerant",
      tonnage: null,
      bom_specs: { liquid_size: "3/8", suction_size: "7/8", length_ft: 25 },
    };
    const catalog = [condenser, lineSet];

    const bom = generateBOM([room(1500)], "mixed", "gas_ac", catalog);

    const lineSlotBefore = bom.items.find((i) => i.bom_slot === "line_set");
    expect(lineSlotBefore).toBeDefined();
    expect(lineSlotBefore?.source).toBe("missing");

    const client: AccessoryPickerClient = {
      pick: vi.fn().mockResolvedValue({
        line_set: { pick_id: "vendor:line1", reason: "3/8 x 7/8 matches condenser connections" },
      }),
    };
    const enriched = await enrichBomWithAccessories(bom, catalog, null, client);

    const lineSlotAfter = enriched.items.find((i) => i.bom_slot === "line_set");
    expect(lineSlotAfter?.partId).toBe("vendor:line1");
    expect(lineSlotAfter?.source).toBe("imported");
    expect(lineSlotAfter?.notes).toContain("3/8 x 7/8");
  });
});
