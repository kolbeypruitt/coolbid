import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { CatalogItem, EquipmentType, VendorProductRow } from "@/types/catalog";

const VALID_SORTS = ["usage_count", "unit_price", "updated_at"] as const;

const createCatalogSchema = z.object({
  mpn: z.string().trim().min(1),
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
  vendor_product_id: z.string().uuid().nullable().optional(),
  source: z.enum(["manual", "imported"]).optional(),
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

// Escape % and , so a user-typed search term can't break the PostgREST
// `or()` filter syntax.
function sanitizeIlike(input: string): string {
  return input.replace(/[%,]/g, " ");
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
  const browse = searchParams.get("browse")?.trim() || "";
  const q = sanitizeIlike(searchParams.get("q")?.trim() || "");
  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);

  if (browse === "vendor") {
    return browseVendorProducts({
      supabase,
      userId: user.id,
      q,
      offset,
      categoryRoot: searchParams.get("category_root")?.trim() || "",
      supplierId: searchParams.get("supplier_id")?.trim() || "",
    });
  }

  const equipmentType = searchParams.get("equipment_type")?.trim() || "";
  const supplierId = searchParams.get("supplier_id")?.trim() || "";
  const sortParam = searchParams.get("sort")?.trim() || "usage_count";

  const sort = (
    VALID_SORTS as readonly string[]
  ).includes(sortParam)
    ? (sortParam as (typeof VALID_SORTS)[number])
    : "usage_count";

  let query = supabase
    .from("equipment_catalog")
    .select("*, supplier:suppliers(name, is_active)")
    .eq("user_id", user.id)
    .order(sort, { ascending: false })
    .range(offset, offset + PAGE_SIZE);

  if (q) {
    query = query.or(
      `mpn.ilike.%${q}%,description.ilike.%${q}%,brand.ilike.%${q}%`,
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
  const page = allItems.slice(0, PAGE_SIZE);
  const hasMore = allItems.length > PAGE_SIZE;

  return NextResponse.json({ items: page, hasMore });
}

/**
 * Return vendor_products scoped to the user's active suppliers'
 * linked vendors. This is the "browse supplier catalogs" path used
 * by the parts database tab and the estimate search dialog.
 */
async function browseVendorProducts({
  supabase,
  userId,
  q,
  offset,
  categoryRoot,
  supplierId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  q: string;
  offset: number;
  categoryRoot: string;
  supplierId: string;
}) {
  // 1. Which vendors is this user opted into? Derived from their
  //    active supplier rows. A specific `supplier_id` filter narrows
  //    to that one vendor.
  let supplierQuery = supabase
    .from("suppliers")
    .select("vendor_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .not("vendor_id", "is", null);

  if (supplierId) {
    supplierQuery = supplierQuery.eq("id", supplierId);
  }

  const { data: supplierRows, error: supplierErr } = await supplierQuery;

  if (supplierErr) {
    console.error("[GET /api/catalog browse] supplier lookup", supplierErr.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const vendorIds = Array.from(
    new Set(
      ((supplierRows ?? []) as Array<{ vendor_id: string | null }>)
        .map((r) => r.vendor_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );

  if (vendorIds.length === 0) {
    return NextResponse.json({ items: [], hasMore: false });
  }

  let productQuery = supabase
    .from("vendor_products")
    .select(
      "id, vendor_id, sku, mpn, name, brand, image_url, short_description, category_root, category_path, category_leaf, detail_url, price, price_text, last_priced_at, vendor:vendors(id, slug, name)",
    )
    .in("vendor_id", vendorIds)
    .order("name", { ascending: true })
    .range(offset, offset + PAGE_SIZE);

  if (q) {
    productQuery = productQuery.or(
      `name.ilike.%${q}%,brand.ilike.%${q}%,mpn.ilike.%${q}%,sku.ilike.%${q}%`,
    );
  }

  if (categoryRoot) {
    productQuery = productQuery.eq("category_root", categoryRoot);
  }

  const { data, error } = await productQuery;

  if (error) {
    console.error("[GET /api/catalog browse] product query", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const rows = (data ?? []) as VendorProductRow[];
  const page = rows.slice(0, PAGE_SIZE);
  const hasMore = rows.length > PAGE_SIZE;

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
      { status: 400 },
    );
  }

  const { source, ...rest } = parsed.data;
  const resolvedSource = source ?? "manual";

  // If this is an import from a vendor_product, idempotently upsert
  // on (user_id, vendor_product_id) so a second pick of the same SKU
  // reuses the existing row instead of creating a duplicate.
  if (resolvedSource === "imported" && rest.vendor_product_id) {
    const { data, error } = await supabase
      .from("equipment_catalog")
      .upsert(
        { ...rest, source: resolvedSource, user_id: user.id },
        { onConflict: "user_id,vendor_product_id", ignoreDuplicates: false },
      )
      .select("*, supplier:suppliers(name, is_active)")
      .single();

    if (error) {
      console.error("[POST /api/catalog import]", error.message);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
  }

  const { data, error } = await supabase
    .from("equipment_catalog")
    .insert({ ...rest, source: resolvedSource, user_id: user.id })
    .select("*, supplier:suppliers(name, is_active)")
    .single();

  if (error) {
    console.error("[POST /api/catalog]", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
