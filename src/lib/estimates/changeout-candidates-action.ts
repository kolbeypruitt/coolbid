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

export type CandidatesDiagnostics = {
  catalogSize: number;
  slotMatches: number;
  slotMatchesTonnage: number;
  priced: number;
};

const BTU_PER_TON = 12000;

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

  let catalog;
  try {
    catalog = await loadBomCatalog(supabase, user.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load catalog' };
  }

  const bySlot: CandidatesBySlot = Object.fromEntries(slots.map((s) => [s, [] as ChangeoutCandidate[]]));
  const slotSet = new Set<string>(slots);
  let slotMatches = 0;
  let slotMatchesTonnage = 0;
  let priced = 0;

  for (const item of catalog) {
    const slot = item.bom_slot ?? item.equipment_type;
    if (!slotSet.has(slot)) continue;
    slotMatches++;
    if (!matchesTonnage(item, slot, tonnage)) continue;
    slotMatchesTonnage++;
    if (item.unit_price == null) continue;
    priced++;

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

  return {
    slots: [...slots],
    bySlot,
    diagnostics: { catalogSize: catalog.length, slotMatches, slotMatchesTonnage, priced },
  };
}

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
  // Accessories and other items don't carry tonnage; only filter major equipment.
  const majorSlots = new Set(['ac_condenser', 'heat_pump_condenser', 'evap_coil', 'air_handler']);
  if (!majorSlots.has(slot)) return true;
  const specsTonnage = (item.bom_specs?.tonnage as number | undefined) ?? null;
  const effectiveTonnage = item.tonnage ?? specsTonnage;
  if (effectiveTonnage == null) return true;
  return effectiveTonnage === tonnage;
}
