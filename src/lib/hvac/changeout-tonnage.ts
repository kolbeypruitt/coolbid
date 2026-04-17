export const CHANGEOUT_TONNAGE_SQFT_PER_TON = 550;

export const TONNAGE_CHIPS = [1.5, 2, 2.5, 3, 3.5, 4, 5] as const;
export type TonnageChip = (typeof TONNAGE_CHIPS)[number];

/**
 * Snap a raw sqft value to the nearest tonnage chip using a fixed
 * rule-of-thumb multiplier. Sanity check only — not a load calc.
 */
export function recommendTonnageFromSqft(sqft: number): TonnageChip | null {
  if (!Number.isFinite(sqft) || sqft <= 0) return null;
  const rawTons = sqft / CHANGEOUT_TONNAGE_SQFT_PER_TON;
  let best: TonnageChip = TONNAGE_CHIPS[0];
  let bestDelta = Math.abs(rawTons - best);
  for (const chip of TONNAGE_CHIPS) {
    const delta = Math.abs(rawTons - chip);
    // Prefer the higher chip on ties — under-sizing is worse than over-sizing.
    if (delta < bestDelta || (delta === bestDelta && chip > best)) {
      best = chip;
      bestDelta = delta;
    }
  }
  return best;
}
