"use server";

import type { BomResult } from "@/types/hvac";
import type { CatalogItem } from "@/types/catalog";
import type { ContractorPreferences } from "@/types/contractor-preferences";
import { anthropic } from "@/lib/anthropic";
import { enrichBomWithAccessories } from "@/lib/hvac/accessory-picker";
import { createAnthropicAccessoryPicker } from "@/lib/hvac/accessory-picker-llm";

/**
 * Server action wrapping the AI enrichment step so the Anthropic SDK +
 * ANTHROPIC_API_KEY never reach the browser bundle. Called from
 * use-estimator.ts after the deterministic generateBOM pass.
 */
export async function enrichBomViaAI(
  bom: BomResult,
  catalog: CatalogItem[],
  preferences: ContractorPreferences | null,
): Promise<BomResult> {
  const picker = createAnthropicAccessoryPicker(anthropic);
  return enrichBomWithAccessories(bom, catalog, preferences, picker);
}
