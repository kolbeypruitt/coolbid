import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogItem, SystemType, VendorProductRow } from "@/types/catalog";
import type { ContractorPreferences } from "@/types/contractor-preferences";
import {
  SYSTEM_TYPE_EQUIPMENT,
  type EquipmentType,
} from "@/types/catalog";
import {
  classifyVendorProduct,
  classifiedRowToCatalogItem,
  type ClassifiedVendorRow,
} from "@/lib/hvac/vendor-classifier";
import { findEquipmentCandidates } from "@/lib/hvac/equipment-candidates";
import {
  SLOT_TO_EQUIPMENT_TYPE,
  type BomSlot,
} from "@/lib/hvac/bom-slot-taxonomy";

const MAJOR_EQUIPMENT_TYPES: ReadonlySet<EquipmentType> = new Set([
  "ac_condenser",
  "heat_pump_condenser",
  "gas_furnace",
  "air_handler",
  "evap_coil",
  "heat_strips",
  "thermostat",
]);

const VENDOR_SELECT =
  "id, vendor_id, sku, mpn, name, brand, image_url, short_description, category_root, category_path, category_leaf, detail_url, price, price_text, last_priced_at, vendor:vendors(id, slug, name), bom_slot, bom_specs";

const PAGE_SIZE = 1000;
const PER_SLOT_LIMIT = 25;

/**
 * Server-only: resolves candidate lists for the major-equipment slots
 * (condenser, furnace, coil, air handler, heat strips, thermostat) without
 * shipping the whole vendor catalog to the client.
 *
 * Strategy: query vendor_products scoped to the user's linked vendors and
 * to just the major-equipment taxonomy, classify in-memory, run the same
 * findEquipmentCandidates ranking the dialog used to apply client-side,
 * and return a slot→top-N map. Keeps the Change Equipment dialog's prop
 * payload small (≈ 7 slots × 25 rows) and avoids the 20 k-row download.
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

  const vendorItems: CatalogItem[] = [];
  if (vendorIds.length > 0) {
    // Fetch vendor_products filtered to major-equipment taxonomy. Path-based
    // rules target Johnstone; leaf-based rules target Locke's generic
    // "HVAC Supplies & Accessories" bucket where the LLM classifier has
    // tagged major equipment via bom_slot.
    const filters = [
      "category_path.ilike.%residential-unitary/%",
      "category_path.ilike.%specialty/heaters-furnaces%",
      "category_path.ilike.%thermostats%",
      "category_leaf.ilike.%hvac supplies%",
      "category_leaf.ilike.%thermostat%",
    ].join(",");

    for (let offset = 0; offset < 20000; offset += PAGE_SIZE) {
      const end = offset + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("vendor_products")
        .select(VENDOR_SELECT)
        .in("vendor_id", vendorIds)
        .or(filters)
        .order("id", { ascending: true })
        .range(offset, end);
      if (error) throw new Error(`vendor_products: ${error.message}`);
      const page = (data ?? []) as unknown as ClassifiedVendorRow[];
      for (const row of page) {
        const item = row.bom_slot
          ? classifiedRowToCatalogItem(row)
          : classifyVendorProduct(row as VendorProductRow);
        if (item && MAJOR_EQUIPMENT_TYPES.has(item.equipment_type)) {
          vendorItems.push(item);
        }
      }
      if (page.length < PAGE_SIZE) break;
    }
  }

  const catalog: CatalogItem[] = [...activeUserCat, ...vendorItems];

  const out: Partial<Record<BomSlot, CatalogItem[]>> = {};
  for (const slot of majorSlots) {
    out[slot] = findEquipmentCandidates({
      catalog,
      slot,
      targetTonnage: slot === "thermostat" ? null : tonnage,
      systemType,
      preferences,
      limit: PER_SLOT_LIMIT,
    });
  }
  return out;
}

