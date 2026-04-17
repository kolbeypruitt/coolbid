const BTU_PER_TON = 12_000;

const MAJOR_TONNAGE_SLOTS = new Set([
  'ac_condenser',
  'heat_pump_condenser',
  'air_handler',
  'evap_coil',
]);

/**
 * True when a catalog item's recorded size fits the requested tonnage.
 *
 * For major equipment (condensers, air handlers, evap coils) and gas
 * furnaces, the item MUST have a recorded tonnage / btu_capacity to be
 * considered a match. Items with null sizing are excluded: we can't verify
 * fit, and showing them would produce false positives (the changeout
 * picker is explicitly tonnage-sized).
 *
 * Non-sized slots (heat_strips, accessories) always match — they're sized
 * on a different axis (kW, count) and aren't tonnage-filtered here.
 */
export function matchesTonnage(
  item: { tonnage: number | null; btu_capacity: number | null },
  slot: string,
  tonnage: number,
): boolean {
  if (slot === 'gas_furnace') {
    if (item.btu_capacity == null) return false;
    const targetBtu = tonnage * BTU_PER_TON;
    return Math.abs(item.btu_capacity - targetBtu) <= BTU_PER_TON;
  }
  if (!MAJOR_TONNAGE_SLOTS.has(slot)) return true;
  if (item.tonnage == null) return false;
  return item.tonnage === tonnage;
}

export function isTonnageSizedSlot(slot: string): boolean {
  return slot === 'gas_furnace' || MAJOR_TONNAGE_SLOTS.has(slot);
}
