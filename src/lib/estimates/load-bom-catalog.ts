import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogItem, VendorProductRow } from "@/types/catalog";
import { classifyVendorProducts } from "@/lib/hvac/vendor-classifier";

const VENDOR_SELECT =
  "id, vendor_id, sku, mpn, name, brand, image_url, short_description, category_root, category_path, category_leaf, detail_url, price, price_text, last_priced_at, vendor:vendors(id, slug, name)";

// Only pull vendor_products whose category_path the classifier recognizes —
// shrinks 30k rows to ~5k, well under Supabase's per-request row limits.
// Keep in sync with deriveEquipmentType in vendor-classifier.ts.
const VENDOR_CATEGORY_FILTERS = [
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

const VENDOR_FETCH_LIMIT = 10000;

/**
 * Returns the combined catalog used by BOM generation:
 *   1. The user's equipment_catalog (quotes, manual, imported) — ranked by usage_count.
 *   2. vendor_products scoped to the user's active-supplier linked vendors,
 *      classified into CatalogItem shape at query time.
 * User-catalog items come first so they win tiebreakers in sortByPreference.
 *
 * Throws on DB error so callers can distinguish "catalog empty" from
 * "query failed" — collapsing them causes misleading UI messages.
 */
export async function loadBomCatalog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>,
  userId: string,
): Promise<CatalogItem[]> {
  const [
    { data: userCat, error: userCatErr },
    { data: supplierRows, error: supplierErr },
  ] = await Promise.all([
    supabase
      .from("equipment_catalog")
      .select("*, supplier:suppliers(*)")
      .eq("user_id", userId)
      .order("usage_count", { ascending: false }),
    supabase
      .from("suppliers")
      .select("vendor_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .not("vendor_id", "is", null),
  ]);

  if (userCatErr) throw new Error(`equipment_catalog: ${userCatErr.message}`);
  if (supplierErr) throw new Error(`suppliers: ${supplierErr.message}`);

  const activeUserCat = ((userCat ?? []) as CatalogItem[]).filter(
    (i) => i.supplier?.is_active !== false,
  );

  const vendorIds = Array.from(
    new Set(
      ((supplierRows ?? []) as Array<{ vendor_id: string | null }>)
        .map((r) => r.vendor_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );

  if (vendorIds.length === 0) return activeUserCat;

  const { data: vendorRows, error: vendorErr } = await supabase
    .from("vendor_products")
    .select(VENDOR_SELECT)
    .in("vendor_id", vendorIds)
    .or(VENDOR_CATEGORY_FILTERS)
    .limit(VENDOR_FETCH_LIMIT);

  if (vendorErr) throw new Error(`vendor_products: ${vendorErr.message}`);

  const classified = classifyVendorProducts(
    (vendorRows ?? []) as unknown as VendorProductRow[],
  );
  return [...activeUserCat, ...classified];
}
