"use server";

import { createClient } from "@/lib/supabase/server";
import { loadEquipmentCandidates } from "./load-equipment-candidates";
import { calculateRoomLoad, calculateSystemTonnage } from "@/lib/hvac/load-calc";
import { dbRowToRoom } from "./db-row-to-room";
import type { ClimateZoneKey } from "@/types/hvac";
import type { CatalogItem, SystemType } from "@/types/catalog";
import type { ContractorPreferences } from "@/types/contractor-preferences";
import type { BomSlot } from "@/lib/hvac/bom-slot-taxonomy";

/**
 * Lazy-invoked by the change-equipment dialog when the user opens it.
 * Running this server-side on every estimate page view cost ~8s because
 * it pages through thousands of vendor_products rows — so the page no
 * longer prefetches; the dialog pays the latency only if the user asks.
 */
export async function fetchEquipmentCandidates(estimateId: string): Promise<
  | { error: string }
  | {
      candidatesBySlot: Partial<Record<BomSlot, CatalogItem[]>>;
      tonnage: number;
    }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return { error: "Not authenticated" };

  const [
    { data: estimate, error: estErr },
    { data: rooms, error: roomErr },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from("estimates")
      .select("system_type, climate_zone")
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
  if (roomErr) return { error: roomErr.message };
  if (!estimate.system_type) return { error: "Estimate has no system type" };

  const climateZone = (estimate.climate_zone ?? "mixed") as ClimateZoneKey;
  const roomList = rooms ?? [];
  const totalBTU = roomList.reduce(
    (s, r) =>
      s +
      calculateRoomLoad(
        dbRowToRoom(r as Record<string, unknown>, 0),
        climateZone,
      ).btu,
    0,
  );
  const tonnage = Math.max(calculateSystemTonnage(totalBTU), 2);
  const preferences =
    ((profile as { contractor_preferences?: ContractorPreferences } | null)
      ?.contractor_preferences) ?? null;

  const candidatesBySlot = await loadEquipmentCandidates(
    supabase,
    user.id,
    estimate.system_type as SystemType,
    tonnage,
    preferences,
  );
  return { candidatesBySlot, tonnage };
}
