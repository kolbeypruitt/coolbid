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

export async function fetchChangeoutCandidates(
  systemType: SystemType,
  tonnage: number,
): Promise<{ slots: EquipmentType[]; bySlot: CandidatesBySlot } | { error: string }> {
  const slots = SYSTEM_TYPE_EQUIPMENT[systemType];
  if (!slots) return { error: `Unknown system type: ${systemType}` };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vendor_products')
    .select('id, name, mpn, brand, price, bom_slot, bom_specs')
    .in('bom_slot', slots as unknown as string[])
    .not('price', 'is', null);

  if (error) return { error: error.message };

  const bySlot: CandidatesBySlot = Object.fromEntries(slots.map((s) => [s, [] as ChangeoutCandidate[]]));
  for (const row of data ?? []) {
    const slot = row.bom_slot as string;
    const specs = (row.bom_specs ?? {}) as { tonnage?: number };
    // Gas furnace tonnage matching is loose — BTU sizing maps roughly.
    const tonMatch = specs.tonnage == null || specs.tonnage === tonnage;
    if (!tonMatch && slot !== 'gas_furnace') continue;
    if (!bySlot[slot]) continue;
    bySlot[slot].push({
      id: row.id,
      name: row.name,
      mpn: row.mpn,
      brand: row.brand,
      price: row.price,
      bom_slot: slot,
      tonnage: specs.tonnage ?? null,
    });
  }
  return { slots: [...slots], bySlot };
}
