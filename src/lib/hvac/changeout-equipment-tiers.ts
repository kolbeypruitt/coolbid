import type { ChangeoutCandidate, CandidatesBySlot } from '@/lib/estimates/changeout-candidates-action';

export type EquipmentTier = {
  label: 'Good' | 'Better' | 'Best';
  picks: ChangeoutCandidate[];
  totalPrice: number;
};

const TIER_LABELS = ['Good', 'Better', 'Best'] as const;

export function computeTiers(slots: string[], bySlot: CandidatesBySlot): EquipmentTier[] {
  if (slots.length === 0) return [];
  for (const s of slots) {
    if (!bySlot[s] || bySlot[s].length === 0) return [];
  }

  const sortedBySlot: Record<string, ChangeoutCandidate[]> = Object.fromEntries(
    slots.map((s) => [s, [...bySlot[s]].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))]),
  );

  const minCount = Math.min(...slots.map((s) => sortedBySlot[s].length));
  const tierCount = Math.min(3, minCount);

  const tiers: EquipmentTier[] = [];
  for (let i = 0; i < tierCount; i++) {
    const picks: ChangeoutCandidate[] = [];
    for (const s of slots) {
      const list = sortedBySlot[s];
      // Good = bottom (0), Best = top (len-1), Better = middle
      const idx =
        tierCount === 1 ? 0 :
        tierCount === 2 ? (i === 0 ? 0 : list.length - 1) :
        i === 0 ? 0 : i === 2 ? list.length - 1 : Math.floor(list.length / 2);
      picks.push(list[idx]);
    }
    tiers.push({
      label: TIER_LABELS[i],
      picks,
      totalPrice: picks.reduce((acc, p) => acc + (p.price ?? 0), 0),
    });
  }
  return tiers;
}
