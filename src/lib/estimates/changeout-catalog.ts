import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogItem, EquipmentType } from '@/types/catalog';
import type { BomSlot } from '@/lib/hvac/bom-slot-taxonomy';
import { classifiedRowToCatalogItem, type ClassifiedVendorRow } from '@/lib/hvac/vendor-classifier';

const VENDOR_PER_SLOT_LIMIT = 100;

/**
 * Narrow catalog fetch for the changeout flow. Unlike loadBomCatalog (which
 * pulls up to 10k rows + runtime-classifies), this hits equipment_catalog
 * and vendor_products with per-slot .eq() queries so each uses the partial
 * index on bom_slot and completes within Supabase's statement timeout.
 *
 * Both sources are normalized into CatalogItem shape. Vendor rows get the
 * "vendor:<uuid>" id prefix (matching classifiedRowToCatalogItem) so IDs
 * are consistent across call sites.
 */
export async function loadChangeoutCatalog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  userId: string,
  slots: readonly string[],
): Promise<CatalogItem[]> {
  const { data: supplierRows, error: supplierErr } = await supabase
    .from('suppliers')
    .select('vendor_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .not('vendor_id', 'is', null);
  if (supplierErr) throw new Error(`suppliers: ${supplierErr.message}`);
  const vendorIds = Array.from(
    new Set(
      ((supplierRows ?? []) as Array<{ vendor_id: string | null }>)
        .map((r) => r.vendor_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );

  const userCatQuery = supabase
    .from('equipment_catalog')
    .select('*, supplier:suppliers(*)')
    .eq('user_id', userId)
    .in('equipment_type', slots as unknown as string[])
    .order('usage_count', { ascending: false });

  // No price filter here — the step-4 picker lets contractors pick
  // unpriced vendor items (they show as "No price"), and finalize needs
  // to recover that exact row by id to render the user's real selection
  // instead of a generic placeholder. Unpriced rows are excluded from
  // AI accessory enrichment downstream.
  const vendorQueries =
    vendorIds.length > 0
      ? slots.map((slot) =>
          supabase
            .from('vendor_products')
            .select('id, vendor_id, sku, mpn, name, brand, short_description, price, bom_slot, bom_specs')
            .in('vendor_id', vendorIds)
            .eq('bom_slot', slot)
            .limit(VENDOR_PER_SLOT_LIMIT),
        )
      : [];

  const [userCatResult, ...vendorResults] = await Promise.all([userCatQuery, ...vendorQueries]);
  if (userCatResult.error) throw new Error(`equipment_catalog: ${userCatResult.error.message}`);

  const userCat = ((userCatResult.data ?? []) as CatalogItem[]).filter(
    (i) => i.supplier?.is_active !== false,
  );

  const classifiedVendors: CatalogItem[] = [];
  for (const r of vendorResults) {
    if (r.error) throw new Error(`vendor_products: ${r.error.message}`);
    for (const row of (r.data ?? []) as unknown as ClassifiedVendorRow[]) {
      const item = classifiedRowToCatalogItem(row);
      if (item) classifiedVendors.push(item);
    }
  }

  return [...userCat, ...classifiedVendors];
}

/**
 * Slot set used by the changeout finalize step: major equipment slots +
 * every slot the fixed changeout accessory set or upsell toggles can emit.
 * Kept in sync with generateChangeoutBom.
 */
export const CHANGEOUT_FINALIZE_SLOTS: readonly (EquipmentType | BomSlot)[] = [
  // Major equipment (from tier picks)
  'ac_condenser',
  'heat_pump_condenser',
  'gas_furnace',
  'air_handler',
  'evap_coil',
  'heat_strips',
  // Fixed accessories
  'condenser_pad',
  'line_set',
  'disconnect',
  'drain_line',
  // Upsells (keys in UPSELL_SLOTS map in changeout-bom.ts)
  'thermostat',
  'breaker',
  'condensate_pump',
];
