import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogItem, VendorProductRow } from "@/types/catalog";
import {
  classifyVendorProducts,
  classifiedRowToCatalogItem,
  type ClassifiedVendorRow,
} from "@/lib/hvac/vendor-classifier";
import { VENDOR_CATEGORY_FILTERS } from "@/lib/hvac/vendor-category-filters";

const VENDOR_SELECT =
  "id, vendor_id, sku, mpn, name, brand, image_url, short_description, category_root, category_path, category_leaf, detail_url, price, price_text, last_priced_at, vendor:vendors(id, slug, name)";

// Supabase PostgREST silently caps each response at 1000 rows regardless
// of the .limit() you set, so we page in 1000-row chunks until exhausted.
// VENDOR_FETCH_LIMIT is the absolute ceiling so a misconfigured vendor
// doesn't balloon memory.
const VENDOR_PAGE_SIZE = 1000;
const VENDOR_FETCH_LIMIT = 20000;

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

  const allVendorRows: ClassifiedVendorRow[] = [];
  for (
    let offset = 0;
    offset < VENDOR_FETCH_LIMIT;
    offset += VENDOR_PAGE_SIZE
  ) {
    const end = offset + VENDOR_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("vendor_products")
      .select(VENDOR_SELECT + ", bom_slot, bom_specs")
      .in("vendor_id", vendorIds)
      .or(VENDOR_CATEGORY_FILTERS)
      .order("id", { ascending: true })
      .range(offset, end);
    if (error) throw new Error(`vendor_products: ${error.message}`);
    const page = (data ?? []) as unknown as ClassifiedVendorRow[];
    allVendorRows.push(...page);
    if (page.length < VENDOR_PAGE_SIZE) break;
  }

  const classifiedItems: CatalogItem[] = [];
  const unclassifiedRows: VendorProductRow[] = [];
  for (const row of allVendorRows) {
    if (row.bom_slot) {
      const item = classifiedRowToCatalogItem(row);
      if (item) classifiedItems.push(item);
    } else {
      unclassifiedRows.push(row);
    }
  }

  const runtimeClassified = classifyVendorProducts(unclassifiedRows);
  return [...activeUserCat, ...classifiedItems, ...runtimeClassified];
}
