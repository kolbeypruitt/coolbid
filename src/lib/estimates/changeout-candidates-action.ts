'use server';
import { createClient } from '@/lib/supabase/server';
import { loadBomCatalog } from '@/lib/estimates/load-bom-catalog';
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

const BTU_PER_TON = 12000;

export async function fetchChangeoutCandidates(
  systemType: SystemType,
  tonnage: number,
): Promise<{ slots: EquipmentType[]; bySlot: CandidatesBySlot } | { error: string }> {
  const slots = SYSTEM_TYPE_EQUIPMENT[systemType];
  if (!slots) return { error: `Unknown system type: ${systemType}` };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  let catalog;
  try {
    catalog = await loadBomCatalog(supabase, user.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load catalog' };
  }

  const bySlot: CandidatesBySlot = Object.fromEntries(slots.map((s) => [s, [] as ChangeoutCandidate[]]));
  const slotSet = new Set<string>(slots);

  for (const item of catalog) {
    const slot = item.bom_slot ?? item.equipment_type;
    if (!slotSet.has(slot)) continue;
    if (!matchesTonnage(item, slot, tonnage)) continue;
    if (item.unit_price == null) continue;

    bySlot[slot].push({
      id: item.id,
      name: item.description,
      mpn: item.mpn || null,
      brand: item.brand || null,
      price: item.unit_price,
      bom_slot: slot,
      tonnage: item.tonnage,
    });
  }

  return { slots: [...slots], bySlot };
}

/**
 * Gas furnaces don't have a tonnage column — they size by BTU. Treat a furnace
 * as a match if its btu_capacity falls within a generous band around the
 * requested tonnage. Everything else uses exact tonnage match, or passes
 * through when tonnage is absent (accessories, air handlers with universal
 * tonnage, etc.).
 */
function matchesTonnage(
  item: { tonnage: number | null; btu_capacity: number | null; bom_specs?: Record<string, unknown> },
  slot: string,
  tonnage: number,
): boolean {
  if (slot === 'gas_furnace') {
    if (item.btu_capacity == null) return true;
    const targetBtu = tonnage * BTU_PER_TON;
    return Math.abs(item.btu_capacity - targetBtu) <= BTU_PER_TON;
  }
  const specsTonnage = (item.bom_specs?.tonnage as number | undefined) ?? null;
  const effectiveTonnage = item.tonnage ?? specsTonnage;
  if (effectiveTonnage == null) return true;
  return effectiveTonnage === tonnage;
}
