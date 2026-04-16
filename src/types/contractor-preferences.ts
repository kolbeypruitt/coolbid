export type ContractorPreferences = {
  equipment_brands?: string[];
  supply_register_style?: string;
  return_grille_sizing?: string;
  duct_trunk_material?: string;
  filter_size?: string;
  filter_merv?: string;
  thermostat_brand?: string;
  additional_notes?: string;
};

export function emptyContractorPreferences(): ContractorPreferences {
  return {};
}
