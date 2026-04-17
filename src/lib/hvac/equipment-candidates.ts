import type { CatalogItem, SystemType } from "@/types/catalog";
import type { ContractorPreferences } from "@/types/contractor-preferences";
import { SLOT_TO_EQUIPMENT_TYPE, type BomSlot } from "./bom-slot-taxonomy";

export type FindCandidatesInput = {
  catalog: CatalogItem[];
  slot: BomSlot;
  targetTonnage: number | null;
  systemType: SystemType;
  preferences: ContractorPreferences | null;
  limit?: number;
};

const DEFAULT_LIMIT = 10;
const TONNAGE_TOLERANCE = 0.5;

/**
 * Ranked list of compatible catalog candidates for a major-equipment slot.
 * Ranking: exact-tonnage match > brand-preference match > usage_count desc
 * > unit_price asc (nulls last).
 */
export function findEquipmentCandidates({
  catalog,
  slot,
  targetTonnage,
  systemType,
  preferences,
  limit = DEFAULT_LIMIT,
}: FindCandidatesInput): CatalogItem[] {
  const targetEquipmentType = SLOT_TO_EQUIPMENT_TYPE[slot];

  const preferredBrands = (
    slot === "thermostat" && preferences?.thermostat_brand
      ? [preferences.thermostat_brand]
      : (preferences?.equipment_brands ?? [])
  )
    .map((b) => b?.toLowerCase().trim())
    .filter((b): b is string => Boolean(b));

  const filtered = catalog.filter((item) => {
    if (item.equipment_type !== targetEquipmentType) return false;
    if (item.system_type !== "universal" && item.system_type !== systemType)
      return false;
    if (targetTonnage !== null && item.tonnage !== null) {
      if (Math.abs(item.tonnage - targetTonnage) > TONNAGE_TOLERANCE) return false;
    }
    return true;
  });

  const scored = filtered.map((item) => {
    const brand = item.brand?.toLowerCase() ?? "";
    const brandMatch = brand !== "" && preferredBrands.includes(brand);
    const tonnageExact =
      targetTonnage !== null &&
      item.tonnage !== null &&
      Math.abs(item.tonnage - targetTonnage) < 0.01;
    return { item, brandMatch, tonnageExact };
  });

  scored.sort((a, b) => {
    if (a.tonnageExact !== b.tonnageExact) return a.tonnageExact ? -1 : 1;
    if (a.brandMatch !== b.brandMatch) return a.brandMatch ? -1 : 1;
    if (a.item.usage_count !== b.item.usage_count) {
      return b.item.usage_count - a.item.usage_count;
    }
    const pa = a.item.unit_price;
    const pb = b.item.unit_price;
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return pa - pb;
  });

  return scored.slice(0, limit).map((s) => s.item);
}
