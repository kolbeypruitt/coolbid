import { describe, it, expect } from 'vitest';
import { generateChangeoutBom, type ChangeoutBomInput } from '../changeout-bom';
import type { CatalogItem } from '@/types/catalog';

// Build a minimal CatalogItem for testing. Only fields consumed by generateChangeoutBom are filled.
function cat(id: string, slot: string, price: number, name = id): CatalogItem {
  return {
    id,
    user_id: 'u1',
    supplier_id: null,
    vendor_product_id: null,
    mpn: id,
    description: name,
    equipment_type: 'ac_condenser',
    system_type: 'gas_ac',
    brand: 'B',
    tonnage: null,
    seer_rating: null,
    btu_capacity: null,
    stages: null,
    refrigerant_type: null,
    unit_price: price,
    unit_of_measure: 'ea',
    bom_slot: slot as never,
    source: 'quote',
    usage_count: 0,
    last_quoted_date: null,
    created_at: '',
    updated_at: '',
  };
}

const baseInput: ChangeoutBomInput = {
  systemType: 'gas_ac',
  tonnage: 3,
  selectedEquipment: { ac_condenser: 'ac1', gas_furnace: 'gf1', evap_coil: 'ec1' },
  upsells: { thermostat: false, surgeProtector: false, condensatePump: false, floatSwitch: false },
  catalog: [cat('ac1', 'ac_condenser', 2000), cat('gf1', 'gas_furnace', 1500), cat('ec1', 'evap_coil', 500)],
  laborRate: 85,
  laborHours: 6,
};

describe('generateChangeoutBom', () => {
  it('emits the selected major equipment as priced lines', () => {
    const result = generateChangeoutBom(baseInput);
    const majorPrices = result.items
      .filter((i) => ['ac_condenser', 'gas_furnace', 'evap_coil'].includes(i.bom_slot ?? ''))
      .reduce((a, b) => a + (b.price ?? 0) * b.qty, 0);
    expect(majorPrices).toBe(4000);
  });

  it('adds the fixed changeout accessory set as missing slots', () => {
    const result = generateChangeoutBom(baseInput);
    const missingSlots = result.items.filter((i) => i.source === 'missing').map((i) => i.bom_slot);
    expect(missingSlots).toEqual(expect.arrayContaining(['condenser_pad', 'line_set', 'disconnect', 'drain_line']));
  });

  it('skips the line set when system type has no refrigerant loop', () => {
    const result = generateChangeoutBom({ ...baseInput, systemType: 'electric' });
    const slots = result.items.map((i) => i.bom_slot);
    expect(slots).not.toContain('line_set');
  });

  it('adds the thermostat upsell only when toggled', () => {
    const off = generateChangeoutBom(baseInput);
    expect(off.items.find((i) => i.bom_slot === 'thermostat')).toBeUndefined();
    const on = generateChangeoutBom({ ...baseInput, upsells: { ...baseInput.upsells, thermostat: true } });
    expect(on.items.find((i) => i.bom_slot === 'thermostat')).toBeDefined();
  });

  it('reports tonnage in the summary', () => {
    const result = generateChangeoutBom(baseInput);
    expect(result.summary.tonnage).toBe(3);
    expect(result.roomLoads).toEqual([]);
  });
});
