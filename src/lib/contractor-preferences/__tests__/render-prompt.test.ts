import { describe, it, expect } from "vitest";
import { renderContractorPreferencesPrompt } from "../render-prompt";
import type { ContractorPreferences } from "@/types/contractor-preferences";

describe("renderContractorPreferencesPrompt", () => {
  it("returns empty string for null", () => {
    expect(renderContractorPreferencesPrompt(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(renderContractorPreferencesPrompt(undefined)).toBe("");
  });

  it("returns empty string for empty object", () => {
    expect(renderContractorPreferencesPrompt({})).toBe("");
  });

  it("skips fields that are empty strings or empty arrays", () => {
    const prefs: ContractorPreferences = {
      equipment_brands: [],
      supply_register_style: "",
      additional_notes: "   ",
    };
    expect(renderContractorPreferencesPrompt(prefs)).toBe("");
  });

  it("renders a single field when only one is set", () => {
    const prefs: ContractorPreferences = { thermostat_brand: "Ecobee" };
    expect(renderContractorPreferencesPrompt(prefs)).toBe(
      "Contractor preferences for parts selection:\n- Thermostat brand: Ecobee",
    );
  });

  it("renders all eight fields in stable order (stability test)", () => {
    const prefs: ContractorPreferences = {
      equipment_brands: ["Carrier", "Daikin"],
      supply_register_style: "square_flush_ceiling",
      return_grille_sizing: "oversized_24x24",
      duct_trunk_material: "sheet_metal",
      filter_size: "20x25x4",
      filter_merv: "13",
      thermostat_brand: "Ecobee",
      additional_notes: "Always spec a shutoff on gas lines.",
    };
    expect(renderContractorPreferencesPrompt(prefs)).toBe(
      [
        "Contractor preferences for parts selection:",
        "- Preferred equipment brands: Carrier, Daikin",
        "- Supply register style: square_flush_ceiling",
        "- Return grille sizing: oversized_24x24",
        "- Duct trunk material: sheet_metal",
        "- Filter size: 20x25x4",
        "- Filter MERV rating: 13",
        "- Thermostat brand: Ecobee",
        "- Additional notes: Always spec a shutoff on gas lines.",
      ].join("\n"),
    );
  });

  it("trims whitespace from additional_notes", () => {
    const prefs: ContractorPreferences = {
      additional_notes: "  use braided gas line whips  ",
    };
    expect(renderContractorPreferencesPrompt(prefs)).toBe(
      "Contractor preferences for parts selection:\n- Additional notes: use braided gas line whips",
    );
  });
});
