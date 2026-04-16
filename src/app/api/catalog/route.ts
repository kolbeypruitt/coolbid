import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { CatalogItem, EquipmentType, VendorProductRow } from "@/types/catalog";

const VALID_SORTS = [
  "usage_count",
  "unit_price",
  "updated_at",
  "description",
  "brand",
  "mpn",
  "tonnage",
  "seer_rating",
] as const;

const VALID_BROWSE_SORTS = ["name", "brand", "sku", "price"] as const;

const VALID_PAGE_SIZES = [25, 50, 100, 200] as const;
const DEFAULT_PAGE_SIZE = 25;

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

  const rawLimit = parseInt(searchParams.get("limit") || "", 10);
  const limit = (VALID_PAGE_SIZES as readonly number[]).includes(rawLimit)
    ? rawLimit
    : DEFAULT_PAGE_SIZE;

  const pageNum = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const offset = (pageNum - 1) * limit;

  const sortDirParam = searchParams.get("sort_dir")?.trim();

  if (browse === "vendor") {
    const browseSortParam = searchParams.get("sort")?.trim() || "name";
    const browseSort = (VALID_BROWSE_SORTS as readonly string[]).includes(browseSortParam)
      ? (browseSortParam as (typeof VALID_BROWSE_SORTS)[number])
      : "name";
    // price defaults descending, everything else ascending
    const browseAscending = sortDirParam ? sortDirParam === "asc" : browseSort !== "price";

    return browseVendorProducts({
      supabase,
      userId: user.id,
      q,
      offset,
      limit,
      sortField: browseSort,
      ascending: browseAscending,
      categoryRoot: searchParams.get("category_root")?.trim() || "",
      supplierId: searchParams.get("supplier_id")?.trim() || "",
    });
  }

  const equipmentType = searchParams.get("equipment_type")?.trim() || "";
  const supplierId = searchParams.get("supplier_id")?.trim() || "";
  const sortParam = searchParams.get("sort")?.trim() || "usage_count";

  const sort = (VALID_SORTS as readonly string[]).includes(sortParam)
    ? (sortParam as (typeof VALID_SORTS)[number])
    : "usage_count";

  const ascending = sortDirParam ? sortDirParam === "asc" : false;

  let dataQuery = supabase
    .from("equipment_catalog")
    .select("*, supplier:suppliers(name, is_active)")
    .eq("user_id", user.id)
    .order(sort, { ascending })
    .range(offset, offset + limit - 1);

  let countQuery = supabase
    .from("equipment_catalog")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (q) {
    const orFilter = `mpn.ilike.%${q}%,description.ilike.%${q}%,brand.ilike.%${q}%`;
    dataQuery = dataQuery.or(orFilter);
    countQuery = countQuery.or(orFilter);
  }

  if (equipmentType) {
    dataQuery = dataQuery.eq("equipment_type", equipmentType as EquipmentType);
    countQuery = countQuery.eq("equipment_type", equipmentType as EquipmentType);
  }

  if (supplierId) {
    dataQuery = dataQuery.eq("supplier_id", supplierId);
    countQuery = countQuery.eq("supplier_id", supplierId);
  }

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    dataQuery,
    countQuery,
  ]);

  if (error) {
    console.error("[GET /api/catalog]", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (countError) {
    console.error("[GET /api/catalog count]", countError.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const items = (data ?? []) as CatalogItem[];

  return NextResponse.json({ items, totalCount: count ?? 0 });
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
  limit,
  sortField,
  ascending,
  categoryRoot,
  supplierId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  q: string;
  offset: number;
  limit: number;
  sortField: (typeof VALID_BROWSE_SORTS)[number];
  ascending: boolean;
  categoryRoot: string;
  supplierId: string;
}) {
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
    return NextResponse.json({ items: [], totalCount: 0 });
  }

  const selectFields =
    "id, vendor_id, sku, mpn, name, brand, image_url, short_description, category_root, category_path, category_leaf, detail_url, price, price_text, last_priced_at, vendor:vendors(id, slug, name)";

  let productQuery = supabase
    .from("vendor_products")
    .select(selectFields)
    .in("vendor_id", vendorIds)
    .order(sortField, { ascending })
    .range(offset, offset + limit - 1);

  let countQuery = supabase
    .from("vendor_products")
    .select("id", { count: "exact", head: true })
    .in("vendor_id", vendorIds);

  if (q) {
    const orFilter = `name.ilike.%${q}%,brand.ilike.%${q}%,mpn.ilike.%${q}%,sku.ilike.%${q}%`;
    productQuery = productQuery.or(orFilter);
    countQuery = countQuery.or(orFilter);
  }

  if (categoryRoot) {
    productQuery = productQuery.eq("category_root", categoryRoot);
    countQuery = countQuery.eq("category_root", categoryRoot);
  }

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    productQuery,
    countQuery,
  ]);

  if (error) {
    console.error("[GET /api/catalog browse] product query", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (countError) {
    console.error("[GET /api/catalog browse] count query", countError.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const items = (data ?? []) as VendorProductRow[];

  return NextResponse.json({ items, totalCount: count ?? 0 });
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

  if (resolvedSource === "imported" && rest.vendor_product_id) {
    const { data: existing } = await supabase
      .from("equipment_catalog")
      .select("id")
      .eq("user_id", user.id)
      .eq("vendor_product_id", rest.vendor_product_id)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from("equipment_catalog")
        .update({ ...rest, source: resolvedSource })
        .eq("id", existing.id)
        .select("*, supplier:suppliers(name, is_active)")
        .single();

      if (error) {
        console.error("[POST /api/catalog import update]", error.message);
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
      console.error("[POST /api/catalog import insert]", error.message);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
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
