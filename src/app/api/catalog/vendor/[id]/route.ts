import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: supplierRows, error: supplierErr } = await supabase
    .from("suppliers")
    .select("vendor_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .not("vendor_id", "is", null);

  if (supplierErr) {
    console.error("[GET /api/catalog/vendor/:id] supplier lookup", supplierErr.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const vendorIds = new Set(
    ((supplierRows ?? []) as Array<{ vendor_id: string | null }>)
      .map((r) => r.vendor_id)
      .filter((v): v is string => Boolean(v)),
  );

  const { data, error } = await supabase
    .from("vendor_products")
    .select(
      "id, vendor_id, sku, mpn, name, brand, image_url, short_description, category_root, category_path, category_leaf, detail_url, price, price_text, last_priced_at, specifications, features, documents, additional_images, vendor:vendors(id, slug, name)",
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const product = data as Record<string, unknown>;
  if (!vendorIds.has(product.vendor_id as string)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(product);
}
