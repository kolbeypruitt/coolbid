import { z } from "zod";
import type { CatalogItem } from "@/types/catalog";
import type { BomItem, BomResult } from "@/types/hvac";
import type { ContractorPreferences } from "@/types/contractor-preferences";
import {
  BOM_SLOT_VALUES,
  SLOT_TO_EQUIPMENT_TYPE,
  type BomSlot,
} from "./bom-slot-taxonomy";

export type MajorEquipmentContext = {
  slot: BomSlot;
  name: string;
  specs: Record<string, unknown>;
};

export type AccessoryRequirement = {
  slot: BomSlot;
  quantity: number;
  fallbackLabel: string;
};

export type PickerInput = {
  majorEquipment: MajorEquipmentContext[];
  requirements: AccessoryRequirement[];
  candidatesBySlot: Partial<Record<BomSlot, CatalogItem[]>>;
  preferences: ContractorPreferences | null;
};

export type RawPickResult = {
  pick_id: string | null;
  reason: string;
};

export interface AccessoryPickerClient {
  pick(input: PickerInput): Promise<Record<string, RawPickResult>>;
}

const PICK_SHAPE = z.object({
  pick_id: z.string().nullable(),
  reason: z.string(),
});

export type PickedAccessory = { pickId: string | null; reason: string };

/**
 * Pure accessory picker. Given context + candidates + an injected client,
 * returns a slot→pick map. pickId is null if the LLM said "nothing fits"
 * OR if the LLM's pick_id isn't in the candidate list (hallucination
 * guard — we keep the reason for the UI but drop the bogus id).
 */
export async function pickAccessories(
  input: PickerInput,
  client: AccessoryPickerClient,
): Promise<Partial<Record<BomSlot, PickedAccessory>>> {
  if (input.requirements.length === 0) return {};

  const raw = await client.pick(input);
  const out: Partial<Record<BomSlot, PickedAccessory>> = {};

  for (const req of input.requirements) {
    const entry = raw[req.slot];
    const parsed = PICK_SHAPE.safeParse(entry);
    if (!parsed.success) {
      out[req.slot] = { pickId: null, reason: "LLM returned malformed pick" };
      continue;
    }
    const candidates = input.candidatesBySlot[req.slot] ?? [];
    const candidateIds = new Set(candidates.map((c) => c.id));
    if (parsed.data.pick_id && !candidateIds.has(parsed.data.pick_id)) {
      out[req.slot] = { pickId: null, reason: parsed.data.reason };
      continue;
    }
    out[req.slot] = {
      pickId: parsed.data.pick_id,
      reason: parsed.data.reason,
    };
  }

  return out;
}

const MAJOR_SLOTS: ReadonlySet<BomSlot> = new Set<BomSlot>([
  "ac_condenser",
  "heat_pump_condenser",
  "gas_furnace",
  "air_handler",
  "evap_coil",
  "heat_strips",
  "thermostat",
]);

const ACCESSORY_SLOTS: ReadonlySet<BomSlot> = new Set(
  BOM_SLOT_VALUES.filter((s) => !MAJOR_SLOTS.has(s)) as BomSlot[],
);

/**
 * After generateBOM runs, ask the LLM to fill every `source === "missing"`
 * accessory slot with a compatible catalog pick. If `client` is undefined,
 * returns the BOM unchanged (used in dev + tests without the Anthropic
 * dependency). Errors from the client are swallowed — enrichment is
 * best-effort; the baseline BOM from generateBOM is always a valid result.
 */
export async function enrichBomWithAccessories(
  bom: BomResult,
  catalog: CatalogItem[],
  preferences: ContractorPreferences | null,
  client: AccessoryPickerClient | undefined,
): Promise<BomResult> {
  if (!client) return bom;

  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const majorEquipment: MajorEquipmentContext[] = [];
  for (const item of bom.items) {
    if (!item.bom_slot || !MAJOR_SLOTS.has(item.bom_slot)) continue;
    if (item.source === "missing") continue;
    const catalogEntry = catalogById.get(item.partId);
    majorEquipment.push({
      slot: item.bom_slot,
      name: item.name,
      specs: (catalogEntry?.bom_specs as Record<string, unknown>) ?? {},
    });
  }

  type Missing = { index: number; requirement: AccessoryRequirement };
  const missing: Missing[] = [];
  for (let i = 0; i < bom.items.length; i++) {
    const it = bom.items[i];
    if (it.source !== "missing" || !it.bom_slot) continue;
    if (!ACCESSORY_SLOTS.has(it.bom_slot)) continue;
    missing.push({
      index: i,
      requirement: {
        slot: it.bom_slot,
        quantity: it.qty,
        fallbackLabel: it.name,
      },
    });
  }
  if (missing.length === 0) return bom;

  const candidatesBySlot: Partial<Record<BomSlot, CatalogItem[]>> = {};
  for (const m of missing) {
    if (candidatesBySlot[m.requirement.slot]) continue;
    const slotCandidates = catalog
      .filter((c) => c.bom_specs && c.id.startsWith("vendor:"))
      .filter((c) => SLOT_TO_EQUIPMENT_TYPE[m.requirement.slot] === c.equipment_type)
      .slice(0, 20);
    candidatesBySlot[m.requirement.slot] = slotCandidates;
  }

  let picks: Partial<Record<BomSlot, PickedAccessory>>;
  try {
    picks = await pickAccessories(
      {
        majorEquipment,
        requirements: missing.map((m) => m.requirement),
        candidatesBySlot,
        preferences,
      },
      client,
    );
  } catch (err) {
    console.error("[enrichBomWithAccessories] picker failed:", err);
    return bom;
  }

  const items: BomItem[] = [...bom.items];
  for (const m of missing) {
    const pick = picks[m.requirement.slot];
    if (!pick) continue;
    if (pick.pickId === null) {
      items[m.index] = {
        ...items[m.index],
        notes: pick.reason || items[m.index].notes,
      };
      continue;
    }
    const picked = catalogById.get(pick.pickId);
    if (!picked) continue;
    items[m.index] = {
      ...items[m.index],
      partId: picked.id,
      name: picked.description ?? items[m.index].name,
      source: picked.source,
      price: picked.unit_price,
      supplier: picked.supplier?.name ?? picked.brand ?? "",
      sku: picked.mpn ?? "",
      brand: picked.brand ?? "",
      notes: pick.reason,
    };
  }

  return { ...bom, items };
}
