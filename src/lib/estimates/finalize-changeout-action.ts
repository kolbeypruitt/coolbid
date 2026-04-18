'use server';

import { createClient } from '@/lib/supabase/server';
import { generateChangeoutBom, type ChangeoutBomInput } from '@/lib/hvac/changeout-bom';
import { enrichBomViaAI } from '@/lib/estimates/enrich-bom-action';
import { loadChangeoutCatalog, CHANGEOUT_FINALIZE_SLOTS } from '@/lib/estimates/changeout-catalog';
import { toBomInsertRows } from '@/lib/estimates/bom-rows';
import { calcTotals } from '@/lib/estimates/recalc';
import type { ChangeoutUpsells, ChangeoutAccessories } from '@/hooks/use-estimator';
import type { SystemType } from '@/types/catalog';
import type { ContractorPreferences } from '@/types/contractor-preferences';
import type { Database } from '@/types/database';

type BomRow = Database['public']['Tables']['estimate_bom_items']['Row'];

export type FinalizeChangeoutInput = {
  estimateId: string;
  systemType: SystemType;
  tonnage: number;
  selectedEquipment: Record<string, string>;
  upsells: ChangeoutUpsells;
  accessories: ChangeoutAccessories;
};

export async function finalizeChangeout(
  input: FinalizeChangeoutInput,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return { error: 'Not authenticated' };

  const [{ data: estimate, error: estErr }, { data: prefsRow }] = await Promise.all([
    supabase
      .from('estimates')
      .select('labor_rate, labor_hours, profit_margin, status')
      .eq('id', input.estimateId)
      .eq('user_id', user.id)
      .single(),
    supabase.from('profiles').select('contractor_preferences').eq('id', user.id).single(),
  ]);

  if (estErr || !estimate) return { error: 'Estimate not found' };

  let catalog;
  try {
    catalog = await loadChangeoutCatalog(supabase, user.id, CHANGEOUT_FINALIZE_SLOTS);
  } catch (err) {
    return { error: `Failed to load catalog: ${err instanceof Error ? err.message : 'unknown'}` };
  }

  const preferences =
    (prefsRow?.contractor_preferences as ContractorPreferences | null) ?? null;

  const bomInput: ChangeoutBomInput = {
    systemType: input.systemType,
    tonnage: input.tonnage,
    selectedEquipment: input.selectedEquipment,
    upsells: input.upsells,
    accessories: input.accessories,
    catalog,
    laborRate: estimate.labor_rate,
    laborHours: estimate.labor_hours,
  };

  const draftBom = generateChangeoutBom(bomInput);
  const enrichedBom = await enrichBomViaAI(draftBom, catalog, preferences);

  if (enrichedBom.items.length === 0) {
    return { error: 'BOM generation produced no items — catalog may be empty' };
  }

  await supabase.from('estimate_bom_items').delete().eq('estimate_id', input.estimateId);

  const rows = toBomInsertRows(enrichedBom.items, input.estimateId);
  const { error: insertErr } = await supabase.from('estimate_bom_items').insert(rows);
  if (insertErr) return { error: insertErr.message };

  // Re-read inserted rows to compute totals accurately
  const { data: insertedItems } = await supabase
    .from('estimate_bom_items')
    .select('*')
    .eq('estimate_id', input.estimateId);

  const { materialCost, totalPrice } = calcTotals(
    (insertedItems ?? []) as BomRow[],
    estimate.profit_margin,
    estimate.labor_rate,
    estimate.labor_hours,
  );

  const { error: updateErr } = await supabase
    .from('estimates')
    .update({
      total_material_cost: materialCost,
      total_price: totalPrice,
      ...(estimate.status === 'sent' ? { status: 'draft' as const } : {}),
    })
    .eq('id', input.estimateId);

  if (updateErr) return { error: updateErr.message };

  return { ok: true };
}
