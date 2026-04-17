import { describe, it, expect } from 'vitest';
import { computeTiers } from '../changeout-equipment-tiers';
import type { ChangeoutCandidate } from '@/lib/estimates/changeout-candidates-action';

function cand(id: string, slot: string, price: number): ChangeoutCandidate {
  return { id, name: id, mpn: null, brand: null, price, bom_slot: slot, tonnage: 3 };
}

describe('computeTiers', () => {
  it('produces three tiers when enough candidates exist', () => {
    const slots = ['ac_condenser', 'evap_coil'];
    const bySlot = {
      ac_condenser: [cand('a1', 'ac_condenser', 1000), cand('a2', 'ac_condenser', 1500), cand('a3', 'ac_condenser', 2000)],
      evap_coil: [cand('e1', 'evap_coil', 300), cand('e2', 'evap_coil', 450), cand('e3', 'evap_coil', 600)],
    };
    const tiers = computeTiers(slots, bySlot);
    expect(tiers).toHaveLength(3);
    expect(tiers[0].label).toBe('Good');
    expect(tiers[1].label).toBe('Better');
    expect(tiers[2].label).toBe('Best');
    expect(tiers[0].totalPrice).toBe(1300);
    expect(tiers[2].totalPrice).toBe(2600);
    expect(tiers[0].missingSlots).toEqual([]);
  });

  it('degrades to fewer tiers when candidates are sparse', () => {
    const slots = ['ac_condenser'];
    const bySlot = { ac_condenser: [cand('a1', 'ac_condenser', 1000)] };
    const tiers = computeTiers(slots, bySlot);
    expect(tiers).toHaveLength(1);
    expect(tiers[0].label).toBe('Good');
  });

  it('still produces tiers when a slot is empty, listing it as missing', () => {
    const slots = ['ac_condenser', 'evap_coil', 'air_handler'];
    const bySlot = {
      ac_condenser: [cand('a1', 'ac_condenser', 1000), cand('a2', 'ac_condenser', 1500), cand('a3', 'ac_condenser', 2000)],
      evap_coil: [cand('e1', 'evap_coil', 400)],
      air_handler: [],
    };
    const tiers = computeTiers(slots, bySlot);
    expect(tiers.length).toBeGreaterThan(0);
    expect(tiers[0].missingSlots).toEqual(['air_handler']);
    expect(tiers[0].picks.map((p) => p.bom_slot)).toEqual(['ac_condenser', 'evap_coil']);
  });

  it('returns empty when NO slot has candidates', () => {
    const slots = ['ac_condenser', 'evap_coil'];
    const bySlot = { ac_condenser: [], evap_coil: [] };
    expect(computeTiers(slots, bySlot)).toEqual([]);
  });
});
