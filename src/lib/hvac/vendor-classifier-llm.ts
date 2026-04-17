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

Given a batch of product rows (name, brand, mpn, category path, short description), for each row return:
  - id (echoed)
  - bom_slot: one of ${BOM_SLOT_VALUES.join(", ")} — or null if the row is not an HVAC BOM component (tools, boilers, hydronics, safety gear, etc.)
  - bom_specs: a canonical object matching the slot's schema. NULL iff bom_slot is null.

Rules:
- Split-system accessories (TXV kits, line-set covers, etc.) are NOT condensers even when listed under Residential-Unitary/Split-Systems. Return null.
- Packaged units (RTUs, PTACs, vertical units) are NOT in the slot list. Return null.
- **Extract only what the source data states.** Name, short_description, and mpn are all authoritative sources. If a spec is stated OR encoded in the MPN via a well-known convention, extract it. Otherwise omit it or set it to null. Do NOT fabricate values from the brand, category, or vibes.
  - MPN tonnage codes you CAN decode:
    - Goodman/Amana 3-digit padded: GSX160**036**1 → 036 → 3 ton (018=1.5, 024=2, 030=2.5, 036=3, 042=3.5, 048=4, 060=5)
    - Locke/Daikin 2-digit direct: CE**48**B44 → 48 → 4 ton (18=1.5, 24=2, 30=2.5, 36=3, 42=3.5, 48=4, 60=5)
    - First numeric pair in the MPN wins when multiple codes appear (CAUFA**18**18 → 1.5 ton)
  - Example: "Cased Upflow/Downflow Evaporator Coil - CC Series Goodman Matches", mpn=CE48B44 → {"bom_slot":"evap_coil","bom_specs":{"tonnage":4}}
  - Example: "3 Ton AC Condenser GSX160361 R-410A" → {"bom_slot":"ac_condenser","bom_specs":{"tonnage":3,"refrigerant":"r410a"}}
  - Example: name with no tonnage, mpn with no recognizable code → {"bom_slot":"evap_coil","bom_specs":{}}
- Gas furnace MPNs encode HEATING capacity (K BTU), NOT tonnage — "GMSS96**080**3" has 080 = 80K BTU. Don't read MPN codes as tonnage on gas_furnace rows.
- Refrigerant field uses lowercase: r410a, r454b, r32, r22, other. "R-32" → "r32". "R-454B" or "R-454" → "r454b".
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
        mpn: row.mpn,
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
