import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogItem, SystemType } from "@/types/catalog";
import type { ContractorPreferences } from "@/types/contractor-preferences";
import { SYSTEM_TYPE_EQUIPMENT } from "@/types/catalog";
import {
  classifiedRowToCatalogItem,
  type ClassifiedVendorRow,
} from "@/lib/hvac/vendor-classifier";
import { findEquipmentCandidates } from "@/lib/hvac/equipment-candidates";
import {
  SLOT_TO_EQUIPMENT_TYPE,
  type BomSlot,
} from "@/lib/hvac/bom-slot-taxonomy";

const VENDOR_SELECT =
  "id, vendor_id, sku, mpn, name, brand, image_url, short_description, category_root, category_path, category_leaf, detail_url, price, price_text, last_priced_at, vendor:vendors(id, slug, name), bom_slot, bom_specs";

const PER_SLOT_LIMIT = 25;
const PER_SLOT_FETCH = 200;

/**
 * Server-only: resolves candidate lists for the major-equipment slots
 * (condenser, furnace, coil, air handler, heat strips, thermostat) without
 * shipping the whole vendor catalog to the client.
 *
 * Strategy: one targeted query per slot (parallel), each filtered by
 * bom_slot = slot and LIMIT 200. In-memory rank with findEquipmentCandidates
 * then cut to top N. This intentionally only surfaces LLM-classified vendor
 * rows — they have the bom_specs the accessory picker needs (mca, filter
 * size, refrigerant, line sizes). Unclassified vendor rows without specs
 * defeat the whole "pick equipment to unlock accessory matching" point of
 * this dialog, so we don't offer them here.
 *
 * User equipment_catalog is always included so previously quoted items stay
 * pickable even if the vendor hasn't been classified yet.
 */
export async function loadEquipmentCandidates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>,
  userId: string,
  systemType: SystemType,
  tonnage: number,
  preferences: ContractorPreferences | null,
): Promise<Partial<Record<BomSlot, CatalogItem[]>>> {
  const majorSlots: BomSlot[] = [
    ...(SYSTEM_TYPE_EQUIPMENT[systemType] as BomSlot[]),
    "thermostat",
  ];

  const [
    { data: userCat, error: userCatErr },
    { data: supplierRows, error: supplierErr },
  ] = await Promise.all([
    supabase
      .from("equipment_catalog")
      .select("*, supplier:suppliers(*)")
      .eq("user_id", userId)
      .in(
        "equipment_type",
        majorSlots.map((s) => SLOT_TO_EQUIPMENT_TYPE[s]),
      )
      .order("usage_count", { ascending: false }),
    supabase
      .from("suppliers")
      .select("vendor_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .not("vendor_id", "is", null),
  ]);
  if (userCatErr) throw new Error(`equipment_catalog: ${userCatErr.message}`);
  if (supplierErr) throw new Error(`suppliers: ${supplierErr.message}`);

  const activeUserCat = ((userCat ?? []) as CatalogItem[]).filter(
    (i) => i.supplier?.is_active !== false,
  );

  const vendorIds = Array.from(
    new Set(
      ((supplierRows ?? []) as Array<{ vendor_id: string | null }>)
        .map((r) => r.vendor_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );

  // Parallel per-slot fetches. Each filters by bom_slot, so we only pull
  // the rows the classifier already recognized — a few hundred max per slot.
  const perSlotVendorItems = await Promise.all(
    majorSlots.map(async (slot) => {
      if (vendorIds.length === 0) return [] as CatalogItem[];
      const { data, error } = await supabase
        .from("vendor_products")
        .select(VENDOR_SELECT)
        .in("vendor_id", vendorIds)
        .eq("bom_slot", slot)
        .limit(PER_SLOT_FETCH);
      if (error) throw new Error(`vendor_products(${slot}): ${error.message}`);
      const rows = (data ?? []) as unknown as ClassifiedVendorRow[];
      const items: CatalogItem[] = [];
      for (const row of rows) {
        const item = classifiedRowToCatalogItem(row);
        if (item) items.push(item);
      }
      return items;
    }),
  );

  const out: Partial<Record<BomSlot, CatalogItem[]>> = {};
  for (let i = 0; i < majorSlots.length; i++) {
    const slot = majorSlots[i];
    const slotCatalog = [...activeUserCat, ...perSlotVendorItems[i]];
    out[slot] = findEquipmentCandidates({
      catalog: slotCatalog,
      slot,
      targetTonnage: slot === "thermostat" ? null : tonnage,
      systemType,
      preferences,
      limit: PER_SLOT_LIMIT,
    });
  }
  return out;
}
