import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { CatalogItem, EquipmentType } from "@/types/catalog";

const VALID_SORTS = ["usage_count", "unit_price", "updated_at"] as const;

const createCatalogSchema = z.object({
  model_number: z.string().trim().min(1),
  description: z.string().trim().min(1),
  equipment_type: z.enum([
    "ac_condenser",
    "heat_pump_condenser",
    "gas_furnace",
    "air_handler",
    "heat_strips",
    "evap_coil",
    "thermostat",
    "ductwork",
    "register",
    "grille",
    "refrigerant",
    "electrical",
    "installation",
  ]),
  supplier_id: z.string().uuid().nullable().optional(),
  system_type: z
    .enum(["heat_pump", "gas_ac", "electric", "dual_fuel", "universal"])
    .optional(),
  brand: z.string().trim().optional(),
  tonnage: z.number().nullable().optional(),
  seer_rating: z.number().nullable().optional(),
  btu_capacity: z.number().nullable().optional(),
  stages: z.number().int().nullable().optional(),
  refrigerant_type: z.string().trim().nullable().optional(),
  unit_price: z.number().nullable().optional(),
  unit_of_measure: z.string().trim().optional(),
});

const PAGE_SIZE = 100;

function isRetiredStarter(
  item: CatalogItem,
  allItems: CatalogItem[]
): boolean {
  if (item.source !== "starter") return false;

  return allItems.some(
    (other) =>
      other.id !== item.id &&
      other.user_id === item.user_id &&
      other.source === "quote" &&
      other.equipment_type === item.equipment_type &&
      item.tonnage !== null &&
      other.tonnage !== null &&
      Math.abs(other.tonnage - item.tonnage) <= 0.5
  );
}

function isFromInactiveStarter(item: CatalogItem): boolean {
  if (item.source !== "starter") return false;
  const supplier = item.supplier as { name: string; is_active: boolean } | null;
  return supplier?.is_active === false;
}

export async function GET(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const equipmentType = searchParams.get("equipment_type")?.trim() || "";
  const supplierId = searchParams.get("supplier_id")?.trim() || "";
  const sortParam = searchParams.get("sort")?.trim() || "usage_count";
  const showRetired = searchParams.get("show_retired") === "true";
  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);

  const sort = (
    VALID_SORTS as readonly string[]
  ).includes(sortParam)
    ? (sortParam as (typeof VALID_SORTS)[number])
    : "usage_count";

  // Fetch extra rows so we can filter retired items and still fill a page
  const fetchSize = showRetired ? PAGE_SIZE + 1 : PAGE_SIZE * 2;

  let query = supabase
    .from("equipment_catalog")
    .select("*, supplier:suppliers(name, is_active)")
    .eq("user_id", user.id)
    .order(sort, { ascending: false })
    .range(offset, offset + fetchSize - 1);

  if (q) {
    query = query.or(
      `model_number.ilike.%${q}%,description.ilike.%${q}%,brand.ilike.%${q}%`
    );
  }

  if (equipmentType) {
    query = query.eq("equipment_type", equipmentType as EquipmentType);
  }

  if (supplierId) {
    query = query.eq("supplier_id", supplierId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[GET /api/catalog]", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const allItems = (data ?? []) as CatalogItem[];

  const activeItems = allItems.filter((item) => !isFromInactiveStarter(item));

  const filtered = showRetired
    ? activeItems
    : activeItems.filter((item) => !isRetiredStarter(item, activeItems));

  const page = filtered.slice(0, PAGE_SIZE);
  const hasMore = showRetired
    ? allItems.length > PAGE_SIZE
    : filtered.length > PAGE_SIZE || (allItems.length === fetchSize && filtered.length === PAGE_SIZE);

  return NextResponse.json({ items: page, hasMore });
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createCatalogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("equipment_catalog")
    .insert({ ...parsed.data, source: "manual", user_id: user.id })
    .select("*, supplier:suppliers(name, is_active)")
    .single();

  if (error) {
    console.error("[POST /api/catalog]", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
