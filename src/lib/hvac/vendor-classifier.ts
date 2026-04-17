import type {
  CatalogItem,
  EquipmentType,
  VendorProductRow,
} from "@/types/catalog";
import { SLOT_TO_EQUIPMENT_TYPE, type BomSlot } from "./bom-slot-taxonomy";

const TON_FROM_T = /(\d+(?:\.\d)?)\s*-?\s*t(?:on)?\b/i;
// Goodman/Amana MPN convention: <SEER-digit>0<tonnage-code><rev>. The
// preceding \d0 guard avoids matching SEER/capacity digits like "60" in
// "GSX**16**0361" and furnace heating codes like "080" in "GMSS960803".
const TON_FROM_MPN = /\d0(18|24|30|36|42|48|60)/;
const BTU_CODE_TO_TON: Record<string, number> = {
  "18": 1.5,
  "24": 2,
  "30": 2.5,
  "36": 3,
  "42": 3.5,
  "48": 4,
  "60": 5,
};

const EQUIPMENT_TYPES_WITH_TONNAGE = new Set<EquipmentType>([
  "ac_condenser",
  "heat_pump_condenser",
  "air_handler",
  "evap_coil",
  "gas_furnace",
]);

// MPN BTU-code extraction only applies to cooling equipment — gas furnace
// MPNs encode heating capacity (K BTU), not tonnage, so matching there
// would assign the wrong size.
const MPN_TONNAGE_TYPES = new Set<EquipmentType>([
  "ac_condenser",
  "heat_pump_condenser",
  "air_handler",
  "evap_coil",
]);

function extractTonnage(
  name: string,
  mpn: string | null,
  equipmentType: EquipmentType,
): number | null {
  const tMatch = name.match(TON_FROM_T) ?? (mpn ?? "").match(TON_FROM_T);
  if (tMatch) {
    const n = parseFloat(tMatch[1]);
    if (!Number.isNaN(n) && n > 0 && n <= 20) return n;
  }
  if (mpn && MPN_TONNAGE_TYPES.has(equipmentType)) {
    const mpnMatch = mpn.match(TON_FROM_MPN);
    if (mpnMatch) return BTU_CODE_TO_TON[mpnMatch[1]] ?? null;
  }
  return null;
}

function deriveEquipmentType(p: VendorProductRow): EquipmentType | null {
  const path = (p.category_path ?? "").toLowerCase();
  const name = (p.name ?? "").toLowerCase();
  const leaf = (p.category_leaf ?? "").toLowerCase();

  // Split Systems trees contain non-condenser accessories (TXVs, coils,
  // indoor heads). Require a positive condenser keyword before labelling.
  // Packaged units are intentionally skipped — the generator assumes split
  // components, and classifying them as condensers would pair them with
  // separate furnaces/AHs in the BOM (double-counted equipment).
  if (path.includes("residential-unitary/split-systems")) {
    const isCondenserShaped =
      name.includes("condens") ||
      name.includes("outdoor unit") ||
      leaf === "split systems";
    if (!isCondenserShaped) return null;
    if (name.includes("heat pump")) return "heat_pump_condenser";
    return "ac_condenser";
  }
  if (path.includes("residential-unitary/gas-furnaces")) return "gas_furnace";
  if (path.includes("residential-unitary/air-handlers-evaporator-coils")) {
    if (name.includes("coil")) return "evap_coil";
    return "air_handler";
  }
  if (path.includes("specialty/heaters-furnaces") && name.includes("strip"))
    return "heat_strips";
  if (path.includes("thermostats")) return "thermostat";
  if (path.includes("ducting-sheet-metal") || leaf === "ducting sheet metal")
    return "ductwork";
  if (leaf === "registers") return "register";
  if (leaf === "grilles" || leaf === "diffusers") return "grille";
  if (path.includes("refrigeration/refrigerant/")) return "refrigerant";
  if (path.includes("installation-maintenance-supplies/line-sets"))
    return "refrigerant";
  if (path.includes("electrical-installation-maintenance-supplies/"))
    return "electrical";
  if (path.includes("installation-maintenance-supplies/condensate-pumps"))
    return "installation";
  if (
    path.includes("installation-maintenance-supplies/condensate-drain-supplies")
  )
    return "installation";
  if (
    path.includes(
      "installation-maintenance-supplies/condensing-unit-pads-covers",
    )
  )
    return "installation";
  if (
    path.includes("installation-maintenance-supplies/tapes") &&
    name.includes("foil")
  )
    return "installation";
  if (
    path.includes("installation-maintenance-supplies/mounting-supplies") &&
    (name.includes("hanger") || name.includes("strap"))
  )
    return "installation";
  if (
    path.includes("installation-maintenance-supplies/adhesives") &&
    name.includes("mastic")
  )
    return "installation";
  if (path.includes("filter-air") || (leaf === "filters" && /\d+x\d+/.test(name)))
    return "installation";

  return null;
}

export function classifyVendorProduct(p: VendorProductRow): CatalogItem | null {
  const equipment_type = deriveEquipmentType(p);
  if (!equipment_type) return null;

  const tonnage = EQUIPMENT_TYPES_WITH_TONNAGE.has(equipment_type)
    ? extractTonnage(p.name, p.mpn, equipment_type)
    : null;

  const description = [p.name, p.short_description]
    .filter(Boolean)
    .join(" — ");

  return {
    id: `vendor:${p.id}`,
    user_id: "",
    supplier_id: null,
    vendor_product_id: p.id,
    mpn: p.mpn ?? p.sku,
    description,
    equipment_type,
    system_type: "universal",
    brand: p.brand ?? "",
    tonnage,
    seer_rating: null,
    btu_capacity: null,
    stages: null,
    refrigerant_type: null,
    unit_price: p.price,
    unit_of_measure: "ea",
    source: "imported",
    usage_count: 0,
    last_quoted_date: null,
    created_at: "",
    updated_at: "",
  };
}

export function classifyVendorProducts(rows: VendorProductRow[]): CatalogItem[] {
  const out: CatalogItem[] = [];
  for (const r of rows) {
    const item = classifyVendorProduct(r);
    if (item) out.push(item);
  }
  return out;
}

/**
 * Shape returned by loadBomCatalog when vendor_products has been LLM-classified.
 * Superset of VendorProductRow with the two classification columns.
 */
export type ClassifiedVendorRow = VendorProductRow & {
  bom_slot: string | null;
  bom_specs: Record<string, unknown> | null;
};

/**
 * Convert an LLM-classified vendor_products row into CatalogItem shape.
 * Pulls tonnage out of bom_specs when available so the existing BOM
 * generator's tonnage filter works on vendor rows.
 */
export function classifiedRowToCatalogItem(
  row: ClassifiedVendorRow,
): CatalogItem | null {
  if (!row.bom_slot) return null;
  const slot = row.bom_slot as BomSlot;
  const equipment_type = SLOT_TO_EQUIPMENT_TYPE[slot];
  if (!equipment_type) return null;

  const specs = (row.bom_specs ?? {}) as { tonnage?: number };
  const tonnage = typeof specs.tonnage === "number" ? specs.tonnage : null;

  const description = [row.name, row.short_description]
    .filter(Boolean)
    .join(" — ");

  return {
    id: `vendor:${row.id}`,
    user_id: "",
    supplier_id: null,
    vendor_product_id: row.id,
    mpn: row.mpn ?? row.sku,
    description,
    equipment_type,
    system_type: "universal",
    brand: row.brand ?? "",
    tonnage,
    seer_rating: null,
    btu_capacity: null,
    stages: null,
    refrigerant_type: null,
    unit_price: row.price,
    unit_of_measure: "ea",
    bom_specs: row.bom_specs ?? undefined,
    source: "imported",
    usage_count: 0,
    last_quoted_date: null,
    created_at: "",
    updated_at: "",
  };
}
