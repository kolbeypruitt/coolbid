import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const updateCatalogSchema = z.object({
  model_number: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  equipment_type: z
    .enum([
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
    ])
    .optional(),
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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("equipment_catalog")
    .select(
      "*, supplier:suppliers(name), price_history(*, ordered:quote_date.desc), quote_lines(*)"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    console.error("[GET /api/catalog/:id]", {
      itemId: id,
      userId: user.id,
      dbError: error?.message ?? "no row returned",
    });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const parsed = updateCatalogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("equipment_catalog")
    .update(parsed.data)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*, supplier:suppliers(name)")
    .single();

  if (error || !data) {
    console.error("[PUT /api/catalog/:id]", error?.message);
    return NextResponse.json({ error: "Not found or update failed" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("equipment_catalog")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[DELETE /api/catalog/:id]", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
