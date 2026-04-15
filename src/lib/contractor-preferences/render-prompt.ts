import type { ContractorPreferences } from "@/types/contractor-preferences";

const HEADER = "Contractor preferences for parts selection:";

export function renderContractorPreferencesPrompt(
  prefs: ContractorPreferences | null | undefined,
): string {
  if (!prefs) return "";

  const lines: string[] = [];

  if (prefs.equipment_brands && prefs.equipment_brands.length > 0) {
    lines.push(`- Preferred equipment brands: ${prefs.equipment_brands.join(", ")}`);
  }
  if (prefs.supply_register_style) {
    lines.push(`- Supply register style: ${prefs.supply_register_style}`);
  }
  if (prefs.return_grille_sizing) {
    lines.push(`- Return grille sizing: ${prefs.return_grille_sizing}`);
  }
  if (prefs.duct_trunk_material) {
    lines.push(`- Duct trunk material: ${prefs.duct_trunk_material}`);
  }
  if (prefs.filter_size) {
    lines.push(`- Filter size: ${prefs.filter_size}`);
  }
  if (prefs.filter_merv) {
    lines.push(`- Filter MERV rating: ${prefs.filter_merv}`);
  }
  if (prefs.thermostat_brand) {
    lines.push(`- Thermostat brand: ${prefs.thermostat_brand}`);
  }
  const notes = prefs.additional_notes?.trim();
  if (notes) {
    lines.push(`- Additional notes: ${notes}`);
  }

  if (lines.length === 0) return "";
  return `${HEADER}\n${lines.join("\n")}`;
}
