"use server";

import { createClient } from "@/lib/supabase/server";
import { generateBOM } from "@/lib/hvac/bom-generator";
import { toBomInsertRows } from "@/lib/estimates/bom-rows";
import { calcTotals } from "@/lib/estimates/recalc";
import type { ClimateZoneKey } from "@/types/hvac";
import { dbRowToRoom } from "@/lib/estimates/db-row-to-room";
import type { CatalogItem, SystemType } from "@/types/catalog";
import type { Database } from "@/types/database";

type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

export async function regenerateBom(estimateId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return { error: "Not authenticated" };

  // Load estimate + rooms in parallel
  const [{ data: estimate, error: estErr }, { data: rooms, error: roomErr }] =
    await Promise.all([
      supabase
        .from("estimates")
        .select("climate_zone, system_type, profit_margin, labor_rate, labor_hours, status")
        .eq("id", estimateId)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("estimate_rooms")
        .select("*")
        .eq("estimate_id", estimateId)
        .order("created_at"),
    ]);

  if (estErr || !estimate) return { error: "Estimate not found" };
  if (roomErr || !rooms || rooms.length === 0) return { error: "No rooms found on this estimate" };

  // Convert DB rows to Room type
  const roomInputs = rooms.map((r, i) => dbRowToRoom(r as Record<string, unknown>, i));

  // Fetch current catalog
  const { data: catalog, error: catErr } = await supabase
    .from("equipment_catalog")
    .select("*, supplier:suppliers(*)")
    .order("usage_count", { ascending: false });

  if (catErr) return { error: "Failed to load equipment catalog" };

  // Hide items from inactive suppliers (user toggled them off).
  const activeCatalog = ((catalog ?? []) as CatalogItem[]).filter(
    (item) => item.supplier?.is_active !== false,
  );

  // Generate new BOM
  const bom = generateBOM(
    roomInputs,
    estimate.climate_zone as ClimateZoneKey,
    estimate.system_type as SystemType,
    activeCatalog,
  );

  // Replace BOM items (only wipe if we have new items to insert)
  if (bom.items.length === 0) return { error: "BOM generation produced no items — catalog may be empty" };

  await supabase.from("estimate_bom_items").delete().eq("estimate_id", estimateId);
  const bomRows = toBomInsertRows(bom.items, estimateId);
  const { error: insertErr } = await supabase.from("estimate_bom_items").insert(bomRows);
  if (insertErr) return { error: insertErr.message };

  // Re-read inserted rows to get DB-shaped data for calcTotals
  const { data: insertedItems } = await supabase
    .from("estimate_bom_items")
    .select("*")
    .eq("estimate_id", estimateId);

  const { materialCost, totalPrice } = calcTotals(
    (insertedItems ?? []) as BomRow[],
    estimate.profit_margin,
    estimate.labor_rate,
    estimate.labor_hours,
  );

  const { error: updateErr } = await supabase
    .from("estimates")
    .update({
      total_material_cost: materialCost,
      total_price: totalPrice,
      ...(estimate.status === "sent" ? { status: "draft" as const } : {}),
    })
    .eq("id", estimateId);

  if (updateErr) return { error: updateErr.message };

  return {};
}
