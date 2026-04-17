import { describe, it, expect } from 'vitest';
import { recommendTonnageFromSqft, TONNAGE_CHIPS, CHANGEOUT_TONNAGE_SQFT_PER_TON } from '../changeout-tonnage';

describe('recommendTonnageFromSqft', () => {
  it('exposes the exact chip set expected by the UI', () => {
    expect(TONNAGE_CHIPS).toEqual([1.5, 2, 2.5, 3, 3.5, 4, 5]);
  });

  it('uses the documented multiplier', () => {
    expect(CHANGEOUT_TONNAGE_SQFT_PER_TON).toBe(550);
  });

  it('snaps 1650 sqft to 3 ton', () => {
    expect(recommendTonnageFromSqft(1650)).toBe(3);
  });

  it('snaps 1375 sqft to 2.5 ton', () => {
    expect(recommendTonnageFromSqft(1375)).toBe(2.5);
  });

  it('rounds up at chip boundaries (1450 → 2.5, not 2)', () => {
    expect(recommendTonnageFromSqft(1450)).toBe(2.5);
  });

  it('floors at 1.5 ton for small homes', () => {
    expect(recommendTonnageFromSqft(400)).toBe(1.5);
  });

  it('caps at 5 ton for very large homes', () => {
    expect(recommendTonnageFromSqft(4000)).toBe(5);
  });

  it('returns null for non-positive input', () => {
    expect(recommendTonnageFromSqft(0)).toBeNull();
    expect(recommendTonnageFromSqft(-100)).toBeNull();
    expect(recommendTonnageFromSqft(Number.NaN)).toBeNull();
  });
});
