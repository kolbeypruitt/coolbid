'use server';
import { createClient } from '@/lib/supabase/server';
import { SYSTEM_TYPE_EQUIPMENT } from '@/types/catalog';
import type { SystemType, EquipmentType } from '@/types/catalog';

export type ChangeoutCandidate = {
  id: string;
  name: string;
  mpn: string | null;
  brand: string | null;
  price: number | null;
  bom_slot: string;
  tonnage: number | null;
};

export type CandidatesBySlot = Record<string, ChangeoutCandidate[]>;

export type CandidatesDiagnostics = {
  userCatalogSize: number;
  vendorRows: number;
  slotMatches: number;
  slotMatchesTonnage: number;
  priced: number;
  slotHistogram: Record<string, number>;
};

const BTU_PER_TON = 12000;
const VENDOR_PER_SLOT_LIMIT = 100;

/**
 * Narrow, fast query for changeout equipment candidates. Unlike the
 * broader loadBomCatalog helper (which fetches up to 10k rows and
 * runtime-classifies), this hits equipment_catalog + vendor_products
 * with slot-specific filters so it completes within Supabase's
 * statement timeout.
 */
export async function fetchChangeoutCandidates(
  systemType: SystemType,
  tonnage: number,
): Promise<
  | { slots: EquipmentType[]; bySlot: CandidatesBySlot; diagnostics: CandidatesDiagnostics }
  | { error: string }
> {
  const slots = SYSTEM_TYPE_EQUIPMENT[systemType];
  if (!slots) return { error: `Unknown system type: ${systemType}` };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const slotList = slots as unknown as string[];

  const { data: supplierRows, error: supplierErr } = await supabase
    .from('suppliers')
    .select('vendor_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .not('vendor_id', 'is', null);

  if (supplierErr) return { error: `suppliers: ${supplierErr.message}` };
  const vendorIds = Array.from(
    new Set(
      ((supplierRows ?? []) as Array<{ vendor_id: string | null }>)
        .map((r) => r.vendor_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );

  const userCatQuery = supabase
    .from('equipment_catalog')
    .select('id, mpn, description, equipment_type, brand, tonnage, btu_capacity, unit_price')
    .eq('user_id', user.id)
    .in('equipment_type', slotList)
    .order('usage_count', { ascending: false });

  // Per-slot vendor queries use .eq('bom_slot', x) so each hits the partial
  // index `vendor_products_bom_slot_idx` cleanly. A single .in('bom_slot', ...)
  // confuses the planner and can trigger sequential scans → statement timeout.
  const vendorQueries =
    vendorIds.length > 0
      ? slotList.map((slot) =>
          supabase
            .from('vendor_products')
            .select('id, name, mpn, brand, price, bom_slot, bom_specs')
            .in('vendor_id', vendorIds)
            .eq('bom_slot', slot)
            .not('price', 'is', null)
            .limit(VENDOR_PER_SLOT_LIMIT),
        )
      : [];

  const [userCatResult, ...vendorResults] = await Promise.all([userCatQuery, ...vendorQueries]);

  if (userCatResult.error) return { error: `equipment_catalog: ${userCatResult.error.message}` };
  const userCat = userCatResult.data;
  const vendorData: Array<{
    id: string; name: string; mpn: string | null; brand: string | null;
    price: number | null; bom_slot: string | null; bom_specs: Record<string, unknown> | null;
  }> = [];
  for (const r of vendorResults) {
    if (r.error) return { error: `vendor_products: ${r.error.message}` };
    for (const row of r.data ?? []) vendorData.push(row as never);
  }

  const bySlot: CandidatesBySlot = Object.fromEntries(slotList.map((s) => [s, [] as ChangeoutCandidate[]]));
  const slotHistogram: Record<string, number> = {};
  let slotMatches = 0;
  let slotMatchesTonnage = 0;
  let priced = 0;

  for (const row of (userCat ?? []) as Array<{
    id: string; mpn: string; description: string; equipment_type: string; brand: string;
    tonnage: number | null; btu_capacity: number | null; unit_price: number | null;
  }>) {
    const slot = row.equipment_type;
    slotHistogram[slot] = (slotHistogram[slot] ?? 0) + 1;
    slotMatches++;
    if (!matchesTonnage({ tonnage: row.tonnage, btu_capacity: row.btu_capacity }, slot, tonnage)) continue;
    slotMatchesTonnage++;
    if (row.unit_price == null) continue;
    priced++;
    bySlot[slot].push({
      id: row.id,
      name: row.description,
      mpn: row.mpn || null,
      brand: row.brand || null,
      price: row.unit_price,
      bom_slot: slot,
      tonnage: row.tonnage,
    });
  }

  for (const row of vendorData) {
    if (!row.bom_slot) continue;
    const slot = row.bom_slot;
    slotHistogram[slot] = (slotHistogram[slot] ?? 0) + 1;
    slotMatches++;
    const specsTonnage = (row.bom_specs?.tonnage as number | undefined) ?? null;
    if (!matchesTonnage({ tonnage: specsTonnage, btu_capacity: null }, slot, tonnage)) continue;
    slotMatchesTonnage++;
    if (row.price == null) continue;
    priced++;
    bySlot[slot].push({
      id: row.id,
      name: row.name,
      mpn: row.mpn,
      brand: row.brand,
      price: row.price,
      bom_slot: slot,
      tonnage: specsTonnage,
    });
  }

  return {
    slots: [...slots],
    bySlot,
    diagnostics: {
      userCatalogSize: userCat?.length ?? 0,
      vendorRows: vendorData.length,
      slotMatches,
      slotMatchesTonnage,
      priced,
      slotHistogram,
    },
  };
}

function matchesTonnage(
  item: { tonnage: number | null; btu_capacity: number | null },
  slot: string,
  tonnage: number,
): boolean {
  if (slot === 'gas_furnace') {
    if (item.btu_capacity == null) return true;
    const targetBtu = tonnage * BTU_PER_TON;
    return Math.abs(item.btu_capacity - targetBtu) <= BTU_PER_TON;
  }
  const majorSlots = new Set(['ac_condenser', 'heat_pump_condenser', 'evap_coil', 'air_handler']);
  if (!majorSlots.has(slot)) return true;
  if (item.tonnage == null) return true;
  return item.tonnage === tonnage;
}
