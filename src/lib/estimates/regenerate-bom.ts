"use server";

import { createClient } from "@/lib/supabase/server";
import { generateBOM } from "@/lib/hvac/bom-generator";
import { toBomInsertRows } from "@/lib/estimates/bom-rows";
import { calcTotals } from "@/lib/estimates/recalc";
import { loadBomCatalog } from "@/lib/estimates/load-bom-catalog";
import type { ClimateZoneKey } from "@/types/hvac";
import { dbRowToRoom } from "@/lib/estimates/db-row-to-room";
import type { SystemType } from "@/types/catalog";
import type { Database } from "@/types/database";
import { renderContractorPreferencesPrompt } from "@/lib/contractor-preferences/render-prompt";
import type { ContractorPreferences } from "@/types/contractor-preferences";
import type { BomSlot } from "@/lib/hvac/bom-slot-taxonomy";
import { anthropic } from "@/lib/anthropic";
import { enrichBomWithAccessories } from "@/lib/hvac/accessory-picker";
import { createAnthropicAccessoryPicker } from "@/lib/hvac/accessory-picker-llm";

type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

export async function regenerateBom(estimateId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return { error: "Not authenticated" };

  // Load estimate + rooms + preferences in parallel
  const [
    { data: estimate, error: estErr },
    { data: rooms, error: roomErr },
    { data: prefsRow },
  ] = await Promise.all([
    supabase
      .from("estimates")
      .select("climate_zone, system_type, profit_margin, labor_rate, labor_hours, status, selected_equipment")
      .eq("id", estimateId)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("estimate_rooms")
      .select("*")
      .eq("estimate_id", estimateId)
      .order("created_at"),
    supabase
      .from("profiles")
      .select("contractor_preferences")
      .eq("id", user.id)
      .single(),
  ]);

  if (estErr || !estimate) return { error: "Estimate not found" };
  if (roomErr || !rooms || rooms.length === 0) return { error: "No rooms found on this estimate" };

  // Convert DB rows to Room type
  const roomInputs = rooms.map((r, i) => dbRowToRoom(r as Record<string, unknown>, i));

  let activeCatalog;
  try {
    activeCatalog = await loadBomCatalog(supabase, user.id);
  } catch (err) {
    console.error("[regenerate-bom] loadBomCatalog failed:", err);
    return {
      error: `Failed to load catalog: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }

  // TODO(ai-bom-generator): when the AI-powered BOM generator lands, pass
  // `preferencesPrompt` as additional system-prompt context. For now the
  // deterministic generator ignores it; we render + debug-log to prove the
  // data pipeline works end-to-end.
  const preferences =
    (prefsRow?.contractor_preferences as ContractorPreferences | null) ?? null;
  const preferencesPrompt = renderContractorPreferencesPrompt(preferences);
  if (preferencesPrompt && process.env.NODE_ENV !== "production") {
    console.debug("[contractor-prefs-prompt][regenerate-bom]", preferencesPrompt);
  }

  const bom = generateBOM(
    roomInputs,
    estimate.climate_zone as ClimateZoneKey,
    estimate.system_type as SystemType,
    activeCatalog,
    undefined,
    undefined,
    preferences,
    (estimate.selected_equipment ?? {}) as Partial<Record<BomSlot, string>>,
  );

  const picker = createAnthropicAccessoryPicker(anthropic);
  const enriched = await enrichBomWithAccessories(bom, activeCatalog, preferences, picker);

  // Replace BOM items (only wipe if we have new items to insert)
  if (enriched.items.length === 0) return { error: "BOM generation produced no items — catalog may be empty" };

  await supabase.from("estimate_bom_items").delete().eq("estimate_id", estimateId);
  const bomRows = toBomInsertRows(enriched.items, estimateId);
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
