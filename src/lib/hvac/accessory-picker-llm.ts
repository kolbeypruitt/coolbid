import Anthropic from "@anthropic-ai/sdk";
import type {
  AccessoryPickerClient,
  PickerInput,
  RawPickResult,
} from "./accessory-picker";

const SYSTEM_PROMPT = `You are an HVAC accessory selector.

Given major equipment already chosen for an installation and a list of
accessory slots that need to be filled, pick the single best catalog
candidate for each slot.

Compatibility rules (STRICT — never pick a candidate that violates these):
- line_set: liquid_size AND suction_size MUST match the condenser's connection sizes.
- breaker: amps MUST be >= condenser.mca and >= furnace blower amps.
- disconnect: amps MUST be >= the breaker you picked (or >= condenser.mca if no breaker).
- filter: width/height dimensions MUST match the furnace/air_handler filter_size. depth usually 1" unless specified.
- refrigerant (bulk): type MUST match the condenser's refrigerant.
- conduit_whip: size_inches must match the circuit (typically 3/4" for residential splits).
- drain_line / p_trap: size_inches typically matches the coil/air_handler drain_size.

Contractor preferences (honor when present):
- preferences.supply_register_style: prefer registers whose description/specs match this style (e.g. "rectangular_4x12", "sidewall", "floor"). Skip candidates whose style clearly conflicts (e.g. a "Floor Register" when style is "sidewall").
- preferences.return_grille_sizing: prefer grilles matching the preferred dimensions. "oversized_24x24" means W≥24 AND H≥24.
- preferences.filter_size / preferences.filter_merv: filter picks MUST match the size; MERV matches when possible, else closest at or above.
- preferences.equipment_brands / preferences.thermostat_brand: prefer matches, not required.

When a spec can't be verified from provided data, pick the closest credible match in the candidate list rather than null — "null" is only correct when NO candidate could plausibly fit. Cite the match reason.

Output JSON format (return exactly one object, no commentary):
{
  "line_set": { "pick_id": "<candidate_id or null>", "reason": "<one sentence>" },
  "breaker":  { "pick_id": "...", "reason": "..." },
  ...
}

Rules:
- Every requirement slot must appear in the output exactly once.
- pick_id MUST be a candidate_id from the provided list, or null if no candidate is compatible.
- Return null only when every candidate would violate a STRICT rule, or when the candidate list is empty. If no candidate is perfect but some are credible (dimensions close, refrigerant/style/amps match even if other specs are unknown), pick the best available and say so in the reason. Missing specs on a candidate are not a reason to return null.
- Keep reasons concise (<= 120 chars). Cite the spec you matched on.`;

export function createAnthropicAccessoryPicker(
  client: Anthropic,
  opts: { model?: string } = {},
): AccessoryPickerClient {
  const model = opts.model ?? "claude-haiku-4-5-20251001";
  return {
    async pick(input: PickerInput): Promise<Record<string, RawPickResult>> {
      const compactCandidates: Record<string, unknown> = {};
      for (const [slot, items] of Object.entries(input.candidatesBySlot)) {
        if (!items) continue;
        compactCandidates[slot] = items.map((c) => ({
          id: c.id,
          name: c.description,
          brand: c.brand,
          price: c.unit_price,
          specs: c.bom_specs ?? null,
        }));
      }

      const userPayload = {
        major_equipment: input.majorEquipment,
        requirements: input.requirements.map((r) => ({
          slot: r.slot,
          quantity: r.quantity,
          fallback_label: r.fallbackLabel,
        })),
        candidates_by_slot: compactCandidates,
        preferences: {
          brands: input.preferences?.equipment_brands ?? [],
          thermostat_brand: input.preferences?.thermostat_brand ?? null,
          supply_register_style: input.preferences?.supply_register_style ?? null,
          return_grille_sizing: input.preferences?.return_grille_sizing ?? null,
          filter_size: input.preferences?.filter_size ?? null,
          filter_merv: input.preferences?.filter_merv ?? null,
        },
      };

      const response = await client.messages.create({
        model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Pick one candidate per slot. Reply with a single JSON object mapping each requirement's slot to {pick_id, reason}. No commentary.\n\n${JSON.stringify(userPayload)}`,
          },
        ],
      });

      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return {};
      try {
        const parsed = JSON.parse(match[0]) as Record<string, RawPickResult>;
        return parsed;
      } catch {
        return {};
      }
    },
  };
}
