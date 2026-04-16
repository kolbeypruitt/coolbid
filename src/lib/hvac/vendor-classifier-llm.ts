import Anthropic from "@anthropic-ai/sdk";
import type { VendorProductRow } from "@/types/catalog";
import {
  BOM_SLOT_VALUES,
  CLASSIFIER_VERSION,
  validateBomSpecs,
  type BomSlot,
} from "./bom-slot-taxonomy";

export type ClassificationResult = {
  id: string;
  bom_slot: BomSlot | null;
  bom_specs: Record<string, unknown> | null;
};

type RawLLMResult = {
  id: string;
  bom_slot: string | null;
  bom_specs: Record<string, unknown> | null;
};

export interface ClassifierClient {
  classify(batch: VendorProductRow[]): Promise<RawLLMResult[]>;
}

export async function classifyVendorProductsBatch(
  batch: VendorProductRow[],
  client: ClassifierClient,
): Promise<ClassificationResult[]> {
  const raw = await client.classify(batch);
  const byId = new Map<string, RawLLMResult>();
  for (const r of raw) byId.set(r.id, r);

  return batch.map((row) => {
    const r = byId.get(row.id);
    if (!r || !r.bom_slot) {
      return { id: row.id, bom_slot: null, bom_specs: null };
    }
    if (!(BOM_SLOT_VALUES as readonly string[]).includes(r.bom_slot)) {
      return { id: row.id, bom_slot: null, bom_specs: null };
    }
    const validated = validateBomSpecs(r.bom_slot, r.bom_specs ?? {});
    if (!validated.success) {
      return { id: row.id, bom_slot: null, bom_specs: null };
    }
    return {
      id: row.id,
      bom_slot: r.bom_slot as BomSlot,
      bom_specs: validated.data as Record<string, unknown>,
    };
  });
}

export { CLASSIFIER_VERSION };

const SYSTEM_PROMPT = `You classify HVAC vendor catalog rows into canonical BOM slots.

Given a batch of product rows (name, brand, category path, scraped specifications), for each row return:
  - id (echoed)
  - bom_slot: one of ${BOM_SLOT_VALUES.join(", ")} — or null if the row is not an HVAC BOM component (tools, boilers, hydronics, safety gear, etc.)
  - bom_specs: a canonical object matching the slot's schema. NULL iff bom_slot is null.

Rules:
- Split-system accessories (TXV kits, line-set covers, etc.) are NOT condensers even when listed under Residential-Unitary/Split-Systems. Return null.
- Packaged units (RTUs, PTACs, vertical units) are NOT in the slot list. Return null.
- For ac_condenser / heat_pump_condenser / gas_furnace / air_handler / evap_coil: tonnage (or btu_output for furnaces) is REQUIRED. If you can't extract it, return null for that row.
- Refrigerant field uses lowercase: r410a, r454b, r32, r22, other.
- Sizes like "3/8" or "7/8" are strings, not numbers (preserve fraction).
- If scraped specs contradict the product name, trust the name + category_leaf.
- Return every input id exactly once.`;

export function createAnthropicClassifier(
  client: Anthropic,
  opts: { model?: string } = {},
): ClassifierClient {
  const model = opts.model ?? "claude-haiku-4-5-20251001";
  return {
    async classify(batch) {
      if (batch.length === 0) return [];
      const inputs = batch.map((row) => ({
        id: row.id,
        name: row.name,
        brand: row.brand,
        category_path: row.category_path,
        category_leaf: row.category_leaf,
        short_description: row.short_description,
      }));
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Classify these rows. Reply with a single JSON array of objects {id, bom_slot, bom_specs}. No commentary.\n\n${JSON.stringify(inputs)}`,
          },
        ],
      });
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];
      try {
        const parsed = JSON.parse(jsonMatch[0]) as RawLLMResult[];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
  };
}
