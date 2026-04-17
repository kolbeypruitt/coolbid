import { describe, it, expect } from 'vitest';
import { matchesTonnage } from '../changeout-tonnage-match';

describe('matchesTonnage', () => {
  describe('major equipment slots', () => {
    const majorSlots = ['ac_condenser', 'heat_pump_condenser', 'air_handler', 'evap_coil'] as const;

    for (const slot of majorSlots) {
      it(`${slot}: matches when tonnage equals request`, () => {
        expect(matchesTonnage({ tonnage: 4, btu_capacity: null }, slot, 4)).toBe(true);
      });

      it(`${slot}: does not match when tonnage differs`, () => {
        expect(matchesTonnage({ tonnage: 3, btu_capacity: null }, slot, 4)).toBe(false);
      });

      it(`${slot}: does NOT match when tonnage is null (was the bug)`, () => {
        expect(matchesTonnage({ tonnage: null, btu_capacity: null }, slot, 4)).toBe(false);
      });
    }
  });

  describe('gas_furnace', () => {
    it('matches when btu is within one tonnage-worth of target', () => {
      expect(matchesTonnage({ tonnage: null, btu_capacity: 48_000 }, 'gas_furnace', 4)).toBe(true);
      expect(matchesTonnage({ tonnage: null, btu_capacity: 60_000 }, 'gas_furnace', 4)).toBe(true);
    });

    it('does not match when btu is far from target', () => {
      expect(matchesTonnage({ tonnage: null, btu_capacity: 24_000 }, 'gas_furnace', 4)).toBe(false);
    });

    it('does NOT match when btu is null (was the bug)', () => {
      expect(matchesTonnage({ tonnage: null, btu_capacity: null }, 'gas_furnace', 4)).toBe(false);
    });
  });

  describe('non-sized slots', () => {
    it('heat_strips always matches (sized in kW, not tons)', () => {
      expect(matchesTonnage({ tonnage: null, btu_capacity: null }, 'heat_strips', 4)).toBe(true);
      expect(matchesTonnage({ tonnage: 2, btu_capacity: null }, 'heat_strips', 4)).toBe(true);
    });
  });
});
