import { NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VendorProductRow } from "@/types/catalog";
import type { Json } from "@/types/database";
import {
  classifyVendorProductsBatch,
  createAnthropicClassifier,
  CLASSIFIER_VERSION,
} from "@/lib/hvac/vendor-classifier-llm";
import { VENDOR_CATEGORY_FILTERS } from "@/lib/hvac/vendor-category-filters";

export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH_SIZE = 25;

export async function POST(req: Request) {
  const expected = process.env.INTERNAL_API_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Pick rows that have never been classified (bom_classified_at IS NULL)
  // AND fall under an HVAC-relevant category. The category prefilter keeps
  // us from wasting LLM calls on tools, plumbing, hydronics etc. that the
  // BOM generator can't use anyway. Non-matching rows stay unclassified
  // forever (harmless — they're never queried by loadBomCatalog).
  //
  // Taxonomy/prompt changes don't auto-trigger re-classification. For a
  // targeted rescan, reset the affected rows via SQL first:
  //   UPDATE vendor_products SET bom_slot = NULL, bom_specs = NULL,
  //     bom_classified_at = NULL WHERE bom_slot IN (...);
  // Then rerun the backfill script.
  const { data: rows, error } = await supabase
    .from("vendor_products")
    .select(
      "id, vendor_id, sku, mpn, name, brand, image_url, short_description, category_root, category_path, category_leaf, detail_url, price, price_text, last_priced_at",
    )
    .is("bom_slot", null)
    .is("bom_classified_at", null)
    .or(VENDOR_CATEGORY_FILTERS)
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ classified: 0, remaining: 0 });
  }

  const classifier = createAnthropicClassifier(anthropic);
  const results = await classifyVendorProductsBatch(
    rows as unknown as VendorProductRow[],
    classifier,
  );

  const now = new Date().toISOString();
  let written = 0;
  for (const r of results) {
    const { error: updErr } = await supabase
      .from("vendor_products")
      .update({
        bom_slot: r.bom_slot,
        bom_specs: r.bom_specs as Json | null,
        bom_classifier_v: CLASSIFIER_VERSION,
        bom_classified_at: now,
      })
      .eq("id", r.id);
    if (updErr) {
      console.error("[classify-vendor-products] update failed", r.id, updErr.message);
      continue;
    }
    written += 1;
  }

  const { count: remaining } = await supabase
    .from("vendor_products")
    .select("id", { count: "exact", head: true })
    .is("bom_slot", null)
    .is("bom_classified_at", null)
    .or(VENDOR_CATEGORY_FILTERS);

  return NextResponse.json({ classified: written, remaining: remaining ?? 0 });
}
