import type { BomItem, BomResult } from '@/types/hvac';
import type { CatalogItem, SystemType } from '@/types/catalog';
import type { BomSlot } from '@/lib/hvac/bom-slot-taxonomy';
import type { ChangeoutUpsells } from '@/hooks/use-estimator';

export type ChangeoutBomInput = {
  systemType: SystemType;
  tonnage: number;
  selectedEquipment: Partial<Record<string, string>>;
  upsells: ChangeoutUpsells;
  catalog: CatalogItem[];
  laborRate: number;
  laborHours: number;
};

const REFRIGERANT_SYSTEMS: ReadonlySet<SystemType> = new Set(['heat_pump', 'gas_ac', 'dual_fuel', 'ac_only']);

// No dedicated 'surge_protector' slot exists in bom-slot-taxonomy.ts; use 'breaker'.
const UPSELL_SLOTS: Record<keyof ChangeoutUpsells, BomSlot> = {
  thermostat: 'thermostat',
  surgeProtector: 'breaker',
  condensatePump: 'condensate_pump',
  floatSwitch: 'drain_line',
};

function missingLine(slot: BomSlot, name: string): BomItem {
  return {
    partId: '',
    name,
    category: slot,
    qty: 1,
    unit: 'ea',
    price: null,
    supplier: '',
    sku: '',
    notes: '',
    source: 'missing',
    brand: '',
    bom_slot: slot,
  };
}

function fromCatalog(item: CatalogItem, slot: BomSlot, qty = 1): BomItem {
  return {
    partId: item.id,
    name: item.description || item.mpn,
    category: slot,
    qty,
    unit: item.unit_of_measure,
    price: item.unit_price,
    supplier: item.supplier_id ?? '',
    sku: item.mpn,
    notes: '',
    source: item.source,
    brand: item.brand ?? '',
    bom_slot: slot,
  };
}

function labelForUpsell(key: keyof ChangeoutUpsells): string {
  switch (key) {
    case 'thermostat':      return 'Smart thermostat (upsell)';
    case 'surgeProtector':  return 'Surge protector (upsell)';
    case 'condensatePump':  return 'Condensate pump (upsell)';
    case 'floatSwitch':     return 'Float switch (upsell)';
  }
}

export function generateChangeoutBom(input: ChangeoutBomInput): BomResult {
  const items: BomItem[] = [];
  const catalogById = new Map(input.catalog.map((c) => [c.id, c]));

  for (const [slot, id] of Object.entries(input.selectedEquipment)) {
    if (!id) continue;
    const item = catalogById.get(id);
    if (item) {
      items.push(fromCatalog(item, slot as BomSlot));
    } else {
      items.push(missingLine(slot as BomSlot, 'Selected equipment'));
    }
  }

  // Emitted as missing so the AI enrichment step can fill pricing
  items.push(missingLine('condenser_pad', 'Equipment pad'));
  items.push(missingLine('disconnect', 'Disconnect + whip'));
  items.push(missingLine('drain_line', 'Drain kit'));
  if (REFRIGERANT_SYSTEMS.has(input.systemType)) {
    items.push(missingLine('line_set', 'Refrigerant line set'));
  }

  for (const [key, enabled] of Object.entries(input.upsells) as Array<[keyof ChangeoutUpsells, boolean]>) {
    if (!enabled) continue;
    items.push(missingLine(UPSELL_SLOTS[key], labelForUpsell(key)));
  }

  return {
    items,
    summary: {
      designBTU: input.tonnage * 12000,
      tonnage: input.tonnage,
      totalCFM: Math.round(input.tonnage * 400),
      totalRegs: 0,
      retCount: 0,
      condSqft: 0,
      zones: 1,
    },
    roomLoads: [],
  };
}
