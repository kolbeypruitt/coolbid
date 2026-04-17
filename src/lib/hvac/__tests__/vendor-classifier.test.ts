import { describe, it, expect } from "vitest";
import { classifyVendorProduct } from "../vendor-classifier";
import type { VendorProductRow } from "@/types/catalog";

function row(overrides: Partial<VendorProductRow>): VendorProductRow {
  return {
    id: "v1",
    vendor_id: "vend1",
    sku: "SKU1",
    mpn: null,
    name: "Test",
    brand: "Goodman",
    image_url: null,
    short_description: null,
    category_root: "HVAC-Equipment",
    category_path: "HVAC-Equipment/Residential-Unitary/Split-Systems",
    category_leaf: "Split Systems",
    detail_url: null,
    price: 100,
    price_text: null,
    last_priced_at: null,
    vendor: null,
    ...overrides,
  };
}

describe("classifyVendorProduct", () => {
  it("classifies heat pump condenser", () => {
    const r = classifyVendorProduct(
      row({ name: "3 Ton Heat Pump Condenser", mpn: "GSZ160361" }),
    );
    expect(r?.equipment_type).toBe("heat_pump_condenser");
    expect(r?.tonnage).toBe(3);
    expect(r?.system_type).toBe("universal");
    expect(r?.source).toBe("imported");
  });

  it("classifies AC condenser from split systems + condenser keyword", () => {
    const r = classifyVendorProduct(
      row({ name: "2.5 Ton AC Condensing Unit", mpn: "GSX160301" }),
    );
    expect(r?.equipment_type).toBe("ac_condenser");
    expect(r?.tonnage).toBe(2.5);
  });

  it("classifies gas furnace", () => {
    const r = classifyVendorProduct(
      row({
        name: "80K BTU 80% Gas Furnace",
        mpn: "GMSS960803BN",
        category_path: "HVAC-Equipment/Residential-Unitary/Gas-Furnaces",
        category_leaf: "Gas Furnaces",
      }),
    );
    expect(r?.equipment_type).toBe("gas_furnace");
  });

  it("classifies air handler (no coil keyword)", () => {
    const r = classifyVendorProduct(
      row({
        name: "3 Ton Multi-Position Air Handler",
        mpn: "ARUF37C14",
        category_path:
          "HVAC-Equipment/Residential-Unitary/Air-Handlers-Evaporator-Coils",
        category_leaf: "Air Handlers & Evaporator Coils",
      }),
    );
    expect(r?.equipment_type).toBe("air_handler");
    expect(r?.tonnage).toBe(3);
  });

  it("classifies evap coil (name has coil)", () => {
    const r = classifyVendorProduct(
      row({
        name: "3 Ton Cased Evaporator Coil",
        mpn: "CAUF3642C6",
        category_path:
          "HVAC-Equipment/Residential-Unitary/Air-Handlers-Evaporator-Coils",
        category_leaf: "Air Handlers & Evaporator Coils",
      }),
    );
    expect(r?.equipment_type).toBe("evap_coil");
  });

  it("classifies thermostat", () => {
    const r = classifyVendorProduct(
      row({
        name: "Honeywell T6 Pro Programmable Thermostat",
        brand: "Honeywell",
        category_path:
          "Controls/Thermostats/Thermostats/Digital-Programmable-Thermostats",
        category_leaf: "Digital Programmable Thermostats",
      }),
    );
    expect(r?.equipment_type).toBe("thermostat");
    expect(r?.tonnage).toBeNull();
  });

  it("classifies sheet metal ductwork", () => {
    const r = classifyVendorProduct(
      row({
        name: "8x12 Sheet Metal Trunk Duct",
        category_path:
          "Supplies/Air-Distribution-Grilles-Sheet-Metal-etc-/Ducting-Sheet-Metal",
        category_leaf: "Ducting Sheet Metal",
      }),
    );
    expect(r?.equipment_type).toBe("ductwork");
  });

  it("classifies register", () => {
    const r = classifyVendorProduct(
      row({
        name: "4x12 Supply Register Aluminum",
        category_path:
          "Supplies/Air-Distribution-Grilles-Sheet-Metal-etc-/Registers",
        category_leaf: "Registers",
      }),
    );
    expect(r?.equipment_type).toBe("register");
  });

  it("classifies return grille", () => {
    const r = classifyVendorProduct(
      row({
        name: "20x25 Return Air Grille",
        category_path:
          "Supplies/Air-Distribution-Grilles-Sheet-Metal-etc-/Grilles",
        category_leaf: "Grilles",
      }),
    );
    expect(r?.equipment_type).toBe("grille");
  });

  it("classifies R-410A refrigerant", () => {
    const r = classifyVendorProduct(
      row({
        name: "R-410A Refrigerant 25lb Cylinder",
        category_path: "Refrigeration/Refrigerant/R410A",
        category_leaf: "R410A",
      }),
    );
    expect(r?.equipment_type).toBe("refrigerant");
  });

  it("classifies line set under refrigerant bucket", () => {
    const r = classifyVendorProduct(
      row({
        name: "3/8 x 7/8 Line Set 25ft",
        category_path: "Supplies/Installation-Maintenance-Supplies/Line-Sets",
        category_leaf: "Line Sets",
      }),
    );
    expect(r?.equipment_type).toBe("refrigerant");
  });

  it("classifies electrical whip", () => {
    const r = classifyVendorProduct(
      row({
        name: '3/4" Conduit Whip 6ft',
        category_path:
          "Supplies/Electrical-Installation-Maintenance-Supplies/Whips",
        category_leaf: "Whips",
      }),
    );
    expect(r?.equipment_type).toBe("electrical");
  });

  it("classifies condensate pump as installation", () => {
    const r = classifyVendorProduct(
      row({
        name: "Little Giant Condensate Pump",
        category_path:
          "Supplies/Installation-Maintenance-Supplies/Condensate-Pumps",
        category_leaf: "Condensate Pumps",
      }),
    );
    expect(r?.equipment_type).toBe("installation");
  });

  it("returns null for single-packaged units (BOM generator expects split components)", () => {
    const r = classifyVendorProduct(
      row({
        name: "3 Ton 14 SEER Gas/Electric Packaged Unit",
        mpn: "GPG1436090M41",
        category_path:
          "HVAC-Equipment/Residential-Unitary/Single-Packaged-Units",
      }),
    );
    expect(r).toBeNull();
  });

  it("returns null for split-system accessories (TXV, non-condenser)", () => {
    const r = classifyVendorProduct(
      row({
        name: "TXV Kit R-410A 5-Ton",
        mpn: "S1-1TVM4F1",
        category_path: "HVAC-Equipment/Residential-Unitary/Split-Systems",
        category_leaf: "Thermostatic Expansion Valves",
      }),
    );
    expect(r).toBeNull();
  });

  it("returns null for unrelated (boiler)", () => {
    const r = classifyVendorProduct(
      row({
        name: "Cast Iron Boiler 100K BTU",
        category_path: "Hydronics-Plumbing/Equipment/Boilers",
        category_leaf: "Boilers",
      }),
    );
    expect(r).toBeNull();
  });

  it("extracts tonnage from BTU-code in MPN", () => {
    const r = classifyVendorProduct(
      row({
        name: "Split System Condenser",
        mpn: "GSX160361",
        category_path: "HVAC-Equipment/Residential-Unitary/Split-Systems",
      }),
    );
    expect(r?.tonnage).toBe(3);
  });

  // Locke (and similar vendors) file HVAC items under a category_leaf with
  // null category_path. The path-based rules above miss them; the leaf
  // fallback must catch the common HVAC leaf names so the accessory picker
  // has candidates to work with.
  describe("leaf-only fallback (null category_path)", () => {
    const cases: ReadonlyArray<[string, string, string]> = [
      ["register", "Bar Faced Registers", "Hart & Cooley 12x10 Supply Register"],
      ["register", "Floor Registers", "TRUaire 4x12 Floor Register"],
      ["register", "Sidewall & Ceiling Registers", "Sidewall Register"],
      ["register", "Supply Registers", "Supply Register 6x12"],
      ["register", "Deflection Registers", "Deflection Register"],
      ["grille", "Filter Grilles", "24x30 Filter Grille"],
      ["grille", "Stamped Face Grilles", "Stamped Face Grille"],
      ["grille", "Eggcrate Grilles", "Eggcrate Return Grille"],
      ["ductwork", "Duct Plenums", "Supply Plenum"],
      ["ductwork", "Duct Dampers", "Volume Damper"],
      ["ductwork", "Insulated Register Boxes", "Insulated Slant Top Register Box"],
      ["installation", "Condensate Pump", "DiversiTech Condensate Pump"],
      ["installation", "Foil Tapes", "Nashua 322 Foil Tape"],
      ["installation", "HVAC Tapes", "HVAC Aluminum Tape"],
      ["installation", "Duct Sealants & Mastic", "Hardcast Duct Mastic 1gal"],
      ["installation", "Hanger Strapping", "Galvanized Hanger Strap 100ft"],
      ["installation", "Tubular P-Traps", "3/4 PVC P-Trap"],
      ["electrical", "Circuit Breakers", "Eaton CHF250 50A 2P"],
      ["electrical", "Safety & Disconnect Switches", "60A Non-Fused Disconnect"],
    ];
    for (const [expected, leaf, name] of cases) {
      it(`classifies "${leaf}" → ${expected}`, () => {
        const r = classifyVendorProduct(
          row({ name, category_path: null, category_leaf: leaf }),
        );
        expect(r?.equipment_type).toBe(expected);
      });
    }

    it("skips 'Register Boxes'-style ambiguous leaves if they would mis-slot", () => {
      const r = classifyVendorProduct(
        row({
          name: "Register Box",
          category_path: null,
          category_leaf: "Register Boxes",
        }),
      );
      expect(r?.equipment_type).toBe("ductwork");
    });
  });
});
