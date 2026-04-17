import type { ChangeoutCandidate, CandidatesBySlot } from '@/lib/estimates/changeout-candidates-action';

export type EquipmentTier = {
  label: 'Good' | 'Better' | 'Best';
  picks: ChangeoutCandidate[];
  missingSlots: string[];
  totalPrice: number;
};

const TIER_LABELS = ['Good', 'Better', 'Best'] as const;

/**
 * Build Good/Better/Best tiers from whatever slots have candidates. Slots
 * with zero candidates are listed in `missingSlots` on each tier so the UI
 * can show them and the finalize step can fill them via AI enrichment.
 * Returns [] only when no slot has any candidate.
 */
export function computeTiers(slots: string[], bySlot: CandidatesBySlot): EquipmentTier[] {
  if (slots.length === 0) return [];

  const populatedSlots = slots.filter((s) => bySlot[s] && bySlot[s].length > 0);
  const missingSlots = slots.filter((s) => !bySlot[s] || bySlot[s].length === 0);
  if (populatedSlots.length === 0) return [];

  const sortedBySlot: Record<string, ChangeoutCandidate[]> = Object.fromEntries(
    populatedSlots.map((s) => [s, [...bySlot[s]].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))]),
  );

  const minCount = Math.min(...populatedSlots.map((s) => sortedBySlot[s].length));
  const tierCount = Math.min(3, minCount);

  const tiers: EquipmentTier[] = [];
  for (let i = 0; i < tierCount; i++) {
    const picks: ChangeoutCandidate[] = [];
    for (const s of populatedSlots) {
      const list = sortedBySlot[s];
      const idx =
        tierCount === 1 ? 0 :
        tierCount === 2 ? (i === 0 ? 0 : list.length - 1) :
        i === 0 ? 0 : i === 2 ? list.length - 1 : Math.floor(list.length / 2);
      picks.push(list[idx]);
    }
    tiers.push({
      label: TIER_LABELS[i],
      picks,
      missingSlots,
      totalPrice: picks.reduce((acc, p) => acc + (p.price ?? 0), 0),
    });
  }
  return tiers;
}
