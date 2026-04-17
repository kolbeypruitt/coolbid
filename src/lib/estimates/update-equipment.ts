"use server";

import { createClient } from "@/lib/supabase/server";
import { regenerateBom } from "./regenerate-bom";
import {
  BOM_SLOT_VALUES,
  type BomSlot,
} from "@/lib/hvac/bom-slot-taxonomy";

const MAJOR_SLOTS = new Set<BomSlot>([
  "ac_condenser",
  "heat_pump_condenser",
  "gas_furnace",
  "air_handler",
  "evap_coil",
  "heat_strips",
  "thermostat",
]);

export async function updateSelectedEquipment(
  estimateId: string,
  selected: Partial<Record<BomSlot, string>>,
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return { error: "Not authenticated" };

  // Whitelist: drop anything that isn't a known major slot, drop blank ids.
  const cleaned: Partial<Record<BomSlot, string>> = {};
  for (const [slot, id] of Object.entries(selected)) {
    if (!(BOM_SLOT_VALUES as readonly string[]).includes(slot)) continue;
    if (!MAJOR_SLOTS.has(slot as BomSlot)) continue;
    if (typeof id !== "string" || id.trim() === "") continue;
    cleaned[slot as BomSlot] = id.trim();
  }

  const { error: updateErr } = await supabase
    .from("estimates")
    .update({ selected_equipment: cleaned })
    .eq("id", estimateId)
    .eq("user_id", user.id);
  if (updateErr) return { error: updateErr.message };

  return regenerateBom(estimateId);
}
