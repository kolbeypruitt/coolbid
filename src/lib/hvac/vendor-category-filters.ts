/**
 * Category-path prefilter for `vendor_products`. Keeps BOM-related queries
 * narrow and avoids wasting LLM classifier calls on rows the generator
 * can't use anyway (hole saws, boilers, plumbing, safety gear).
 *
 * Consumed as a Supabase `.or()` argument — comma-separated OR conditions.
 * Keep in sync with `deriveEquipmentType` in `vendor-classifier.ts` and
 * the taxonomy in `bom-slot-taxonomy.ts`.
 */
export const VENDOR_CATEGORY_FILTERS = [
  "category_path.ilike.%residential-unitary/%",
  "category_path.ilike.%specialty/heaters-furnaces%",
  "category_path.ilike.%thermostats%",
  "category_path.ilike.%ducting-sheet-metal%",
  "category_leaf.ilike.registers",
  "category_leaf.ilike.grilles",
  "category_leaf.ilike.diffusers",
  "category_path.ilike.%refrigeration/refrigerant/%",
  "category_path.ilike.%installation-maintenance-supplies/line-sets%",
  "category_path.ilike.%electrical-installation-maintenance-supplies/%",
  "category_path.ilike.%installation-maintenance-supplies/condensate-%",
  "category_path.ilike.%installation-maintenance-supplies/condensing-unit-pads-covers%",
  "category_path.ilike.%installation-maintenance-supplies/tapes%",
  "category_path.ilike.%installation-maintenance-supplies/mounting-supplies%",
  "category_path.ilike.%installation-maintenance-supplies/adhesives%",
  "category_path.ilike.%filter-air%",
].join(",");
