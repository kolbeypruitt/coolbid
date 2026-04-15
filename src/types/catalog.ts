export type SystemType = "heat_pump" | "gas_ac" | "electric" | "dual_fuel";

export type EquipmentType =
  | "ac_condenser"
  | "heat_pump_condenser"
  | "gas_furnace"
  | "air_handler"
  | "heat_strips"
  | "evap_coil"
  | "thermostat"
  | "ductwork"
  | "register"
  | "grille"
  | "refrigerant"
  | "electrical"
  | "installation";

// `starter` remains in the union purely so old DB rows (and the historical
// BomItem.source type in @/types/hvac) still typecheck. Migration 016
// deletes every source='starter' row from `equipment_catalog`; new writes
// should use 'quote' | 'manual' | 'imported' instead.
export type CatalogSource = "starter" | "quote" | "manual" | "imported";

export type Supplier = {
  id: string;
  user_id: string;
  name: string;
  contact_email: string;
  contact_phone: string;
  brands: string[];
  is_starter: boolean;
  is_active: boolean;
  vendor_id: string | null;
  created_at: string;
};

export type Vendor = {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  is_active: boolean;
  created_at: string;
};

/**
 * A vendor_products row as returned by `GET /api/catalog?browse=vendor`.
 * Joined with its parent vendor for display.
 */
export type VendorProductRow = {
  id: string;
  vendor_id: string;
  sku: string;
  mpn: string | null;
  name: string;
  brand: string | null;
  image_url: string | null;
  short_description: string | null;
  category_root: string | null;
  category_path: string | null;
  category_leaf: string | null;
  detail_url: string | null;
  price: number | null;
  price_text: string | null;
  last_priced_at: string | null;
  vendor: { id: string; slug: string; name: string } | null;
};

export type CatalogItem = {
  id: string;
  user_id: string;
  supplier_id: string | null;
  vendor_product_id: string | null;
  model_number: string;
  description: string;
  equipment_type: EquipmentType;
  system_type: SystemType | "universal";
  brand: string;
  tonnage: number | null;
  seer_rating: number | null;
  btu_capacity: number | null;
  stages: number | null;
  refrigerant_type: string | null;
  unit_price: number | null;
  unit_of_measure: string;
  source: CatalogSource;
  usage_count: number;
  last_quoted_date: string | null;
  created_at: string;
  updated_at: string;
  supplier?: Supplier;
};

export type Quote = {
  id: string;
  user_id: string;
  supplier_id: string | null;
  quote_number: string;
  quote_date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  file_name: string;
  storage_path: string;
  status: "parsed" | "reviewing" | "saved";
  created_at: string;
  supplier?: Supplier;
};

export type QuoteLine = {
  id: string;
  quote_id: string;
  catalog_item_id: string | null;
  model_number: string;
  description: string;
  equipment_type: string;
  brand: string;
  tonnage: number | null;
  seer_rating: number | null;
  btu_capacity: number | null;
  stages: number | null;
  refrigerant_type: string | null;
  quantity: number;
  unit_price: number | null;
  extended_price: number | null;
  selected: boolean;
};

export type PriceHistoryEntry = {
  id: string;
  catalog_item_id: string;
  supplier_id: string | null;
  price: number;
  quote_date: string | null;
  quote_id: string | null;
  created_at: string;
};

export type ParsedQuoteResult = {
  supplier_name: string;
  quote_number: string;
  quote_date: string;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  line_items: ParsedLineItem[];
};

export type ParsedLineItem = {
  model_number: string;
  description: string;
  equipment_type: EquipmentType;
  brand: string;
  tonnage: number | null;
  seer_rating: number | null;
  btu_capacity: number | null;
  stages: number | null;
  refrigerant_type: string | null;
  quantity: number;
  unit_price: number | null;
  extended_price: number | null;
};

export const SYSTEM_TYPE_EQUIPMENT: Record<SystemType, EquipmentType[]> = {
  heat_pump: ["heat_pump_condenser", "air_handler", "heat_strips"],
  gas_ac: ["ac_condenser", "gas_furnace", "evap_coil"],
  electric: ["ac_condenser", "air_handler", "heat_strips"],
  dual_fuel: ["heat_pump_condenser", "gas_furnace"],
};

export const SYSTEM_TYPE_LABELS: Record<SystemType, string> = {
  heat_pump: "Heat Pump",
  gas_ac: "Gas / AC Split",
  electric: "Electric",
  dual_fuel: "Dual Fuel (Heat Pump + Gas)",
};

export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  ac_condenser: "AC Condenser",
  heat_pump_condenser: "Heat Pump Condenser",
  gas_furnace: "Gas Furnace",
  air_handler: "Air Handler",
  heat_strips: "Heat Strips",
  evap_coil: "Evaporator Coil",
  thermostat: "Thermostat",
  ductwork: "Ductwork",
  register: "Register",
  grille: "Grille",
  refrigerant: "Refrigerant",
  electrical: "Electrical",
  installation: "Installation",
};
