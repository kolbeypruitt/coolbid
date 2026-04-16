# BOM Matching v3 — Phase 1: LLM Classifier for vendor_products

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate `vendor_products.bom_slot` (enum) and `vendor_products.bom_specs` (canonical jsonb) for every HVAC-relevant row via an LLM classifier, so later phases can show a tonnage-filtered equipment picker and run an AI accessory selector over compatibility-typed specs instead of fragile substring matching.

**Architecture:**
1. Schema adds `bom_slot text`, `bom_specs jsonb`, `bom_classifier_version int`, `bom_classified_at timestamptz` to `vendor_products`. Indexed on `bom_slot` for slot-based filtering.
2. Taxonomy file (`src/lib/hvac/bom-slot-taxonomy.ts`) defines the enum of slots and a Zod schema for the canonical `bom_specs` shape per slot. Single source of truth — classifier and consumers read from it.
3. Classifier module (`src/lib/hvac/vendor-classifier-llm.ts`) is a pure function: `(batch: VendorProductRow[]) => Promise<ClassificationResult[]>`. Uses Claude Haiku 4.5 via the existing `src/lib/anthropic.ts` client with tool-use structured output and Zod validation against the taxonomy.
4. Admin-authed API route (`src/app/api/internal/classify-vendor-products/route.ts`) pulls a batch of rows `where bom_slot IS NULL`, classifies them, writes results back. Same route handles both the initial backfill (repeated hits) and incremental daily deltas.
5. `loadBomCatalog` is updated to prefer structured `bom_slot` + `bom_specs` when present and fall back to the existing runtime classifier for un-classified rows. Backfill can run in the background without breaking today's BOM generation.

**Tech Stack:** Next.js 16 App Router (Node runtime), Supabase, `@anthropic-ai/sdk` (already in the repo), Zod, Vitest, cron-job.org for scheduling.

**Out of scope (future phases):**
- Phase 2: Equipment picker UI that reads `bom_specs.tonnage` to filter candidate condensers/furnaces/coils for user selection.
- Phase 3: AI accessory generator that takes the user's selected major equipment + classified accessory candidates and fills the rest of the BOM with compatibility reasoning.

---

## File structure

**Create:**
- `supabase/migrations/019_vendor_products_bom_classification.sql`
- `src/lib/hvac/bom-slot-taxonomy.ts` — the enum + Zod spec schemas + slot→`EquipmentType` map
- `src/lib/hvac/__tests__/bom-slot-taxonomy.test.ts`
- `src/lib/hvac/vendor-classifier-llm.ts` — pure classifier function
- `src/lib/hvac/__tests__/vendor-classifier-llm.test.ts`
- `src/app/api/internal/classify-vendor-products/route.ts`
- `src/app/api/internal/classify-vendor-products/__tests__/route.test.ts`
- `scripts/backfill-vendor-classification.mjs` — bash-runnable backfill loop
- `docs/ops/vendor-products-classifier.md` — runbook for operators

**Modify:**
- `src/types/database.ts` — regenerated after migration to include the new columns
- `src/lib/estimates/load-bom-catalog.ts` — use `bom_slot` when present, runtime fallback otherwise
- `src/lib/hvac/vendor-classifier.ts` — add small adapter `classifiedRowToCatalogItem(row)` that reads `bom_slot`+`bom_specs`, keeps the category-based `deriveEquipmentType` as a fallback

---

## Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/019_vendor_products_bom_classification.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 019_vendor_products_bom_classification.sql
-- Add LLM-populated classification columns to vendor_products.
--   bom_slot            — canonical slot enum from bom-slot-taxonomy.ts.
--                         NULL = unclassified OR explicitly non-HVAC (hole saw,
--                         boiler, etc.). Only non-NULL rows are candidates for
--                         BOM generation.
--   bom_specs           — canonical spec shape, schema varies per slot (see
--                         bom-slot-taxonomy.ts). NULL iff bom_slot IS NULL.
--   bom_classifier_v    — the classifier version that wrote this row; bump
--                         when taxonomy changes materially so we can null the
--                         affected rows and re-classify.
--   bom_classified_at   — audit trail for when the LLM touched this row.
alter table public.vendor_products
  add column if not exists bom_slot            text,
  add column if not exists bom_specs           jsonb,
  add column if not exists bom_classifier_v    integer,
  add column if not exists bom_classified_at   timestamptz;

create index if not exists vendor_products_bom_slot_idx
  on public.vendor_products (bom_slot)
  where bom_slot is not null;

-- Partial index on unclassified rows lets the classifier cron find work fast
-- even as the catalog grows past 100k.
create index if not exists vendor_products_unclassified_idx
  on public.vendor_products (id)
  where bom_slot is null and bom_classified_at is null;

comment on column public.vendor_products.bom_slot is
  'Canonical BOM slot enum. See src/lib/hvac/bom-slot-taxonomy.ts. NULL = not-yet-classified or explicitly non-HVAC.';
comment on column public.vendor_products.bom_specs is
  'Canonical slot-specific specs (Zod-validated). Shape depends on bom_slot.';
```

- [ ] **Step 2: Apply locally**

Run: `npx supabase db push` (or the project's usual dev apply command — check `package.json` scripts).
Expected: no errors; `\d public.vendor_products` shows the four new columns.

- [ ] **Step 3: Regenerate types**

Run: `npx supabase gen types typescript --local > src/types/database.ts` (use whatever command the repo currently uses; `grep -R "gen types" .github package.json docs` if unsure).
Expected: `src/types/database.ts` now includes `bom_slot`, `bom_specs`, `bom_classifier_v`, `bom_classified_at` on the `vendor_products` row type.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/019_vendor_products_bom_classification.sql src/types/database.ts
git commit -m "feat(db): add bom_slot/bom_specs classification columns to vendor_products"
```

---

## Task 2: Taxonomy file

**Files:**
- Create: `src/lib/hvac/bom-slot-taxonomy.ts`
- Create: `src/lib/hvac/__tests__/bom-slot-taxonomy.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/hvac/__tests__/bom-slot-taxonomy.test.ts
import { describe, it, expect } from "vitest";
import {
  BOM_SLOT_VALUES,
  BOM_SPEC_SCHEMAS,
  SLOT_TO_EQUIPMENT_TYPE,
  CLASSIFIER_VERSION,
  validateBomSpecs,
} from "../bom-slot-taxonomy";

describe("bom-slot-taxonomy", () => {
  it("every slot has a Zod schema", () => {
    for (const slot of BOM_SLOT_VALUES) {
      expect(BOM_SPEC_SCHEMAS[slot]).toBeDefined();
    }
  });

  it("every slot maps to an equipment_type", () => {
    for (const slot of BOM_SLOT_VALUES) {
      expect(SLOT_TO_EQUIPMENT_TYPE[slot]).toBeDefined();
    }
  });

  it("validateBomSpecs accepts a valid ac_condenser spec", () => {
    const result = validateBomSpecs("ac_condenser", {
      tonnage: 3,
      seer: 16,
      refrigerant: "r410a",
      mca: 21,
      max_fuse: 35,
      liquid_size: "3/8",
      suction_size: "7/8",
      voltage: 208,
      phase: 1,
      stages: 1,
    });
    expect(result.success).toBe(true);
  });

  it("validateBomSpecs rejects an ac_condenser missing tonnage", () => {
    const result = validateBomSpecs("ac_condenser", {
      seer: 16,
      refrigerant: "r410a",
    });
    expect(result.success).toBe(false);
  });

  it("validateBomSpecs accepts a line_set with required sizes + length", () => {
    const result = validateBomSpecs("line_set", {
      liquid_size: "3/8",
      suction_size: "7/8",
      length_ft: 25,
    });
    expect(result.success).toBe(true);
  });

  it("validateBomSpecs rejects an unknown slot", () => {
    // @ts-expect-error — runtime check
    const result = validateBomSpecs("made_up_slot", {});
    expect(result.success).toBe(false);
  });

  it("CLASSIFIER_VERSION is a positive integer", () => {
    expect(Number.isInteger(CLASSIFIER_VERSION)).toBe(true);
    expect(CLASSIFIER_VERSION).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/hvac/__tests__/bom-slot-taxonomy.test.ts`
Expected: cannot-find-module for `../bom-slot-taxonomy`.

- [ ] **Step 3: Implement the taxonomy file**

```ts
// src/lib/hvac/bom-slot-taxonomy.ts
import { z, type ZodTypeAny } from "zod";
import type { EquipmentType } from "@/types/catalog";

/**
 * Increment when the slot list or any per-slot spec schema changes in a way
 * that invalidates previously-classified rows. The classifier writes this
 * number into vendor_products.bom_classifier_v so we can selectively null
 * and re-classify affected rows.
 */
export const CLASSIFIER_VERSION = 1;

/**
 * The full enum of BOM slots. Order is presentation-stable; grouped by how
 * they're selected:
 *   - Major equipment (Phase 2 UI: user picks from filtered candidates)
 *   - Accessories (Phase 3: AI picks based on selected major equipment)
 *
 * Keep in sync with BOM_SPEC_SCHEMAS and SLOT_TO_EQUIPMENT_TYPE below.
 */
export const BOM_SLOT_VALUES = [
  // Major equipment — user picks
  "ac_condenser",
  "heat_pump_condenser",
  "gas_furnace",
  "air_handler",
  "evap_coil",
  "heat_strips",
  "thermostat",

  // Ductwork
  "ductwork_trunk",
  "flex_duct",
  "supply_plenum",
  "return_plenum",

  // Distribution
  "supply_register",
  "return_grille",

  // Refrigerant
  "line_set",
  "refrigerant",

  // Electrical
  "disconnect",
  "conduit_whip",
  "breaker",

  // Condensate
  "condensate_pump",
  "p_trap",
  "drain_line",

  // Filtration
  "filter",

  // Installation supplies
  "duct_mastic",
  "foil_tape",
  "condenser_pad",
  "hanger_strap",
] as const;

export type BomSlot = (typeof BOM_SLOT_VALUES)[number];

const REFRIGERANT = z.enum(["r410a", "r454b", "r32", "r22", "other"]);

export const BOM_SPEC_SCHEMAS = {
  ac_condenser: z.object({
    tonnage: z.number().positive(),
    seer: z.number().positive().optional(),
    eer: z.number().positive().optional(),
    refrigerant: REFRIGERANT.optional(),
    mca: z.number().positive().optional(),
    max_fuse: z.number().positive().optional(),
    liquid_size: z.string().optional(),
    suction_size: z.string().optional(),
    voltage: z.number().positive().optional(),
    phase: z.union([z.literal(1), z.literal(3)]).optional(),
    stages: z.number().int().positive().optional(),
  }),
  heat_pump_condenser: z.object({
    tonnage: z.number().positive(),
    seer: z.number().positive().optional(),
    hspf: z.number().positive().optional(),
    refrigerant: REFRIGERANT.optional(),
    mca: z.number().positive().optional(),
    max_fuse: z.number().positive().optional(),
    liquid_size: z.string().optional(),
    suction_size: z.string().optional(),
    voltage: z.number().positive().optional(),
    phase: z.union([z.literal(1), z.literal(3)]).optional(),
    stages: z.number().int().positive().optional(),
  }),
  gas_furnace: z.object({
    btu_output: z.number().positive(),
    afue: z.number().positive().optional(),
    stages: z.number().int().positive().optional(),
    blower_cfm: z.number().positive().optional(),
    filter_size: z.string().optional(),
    gas_type: z.enum(["natural", "propane", "dual"]).optional(),
    voltage: z.number().positive().optional(),
  }),
  air_handler: z.object({
    tonnage: z.number().positive(),
    cfm: z.number().positive().optional(),
    filter_size: z.string().optional(),
    voltage: z.number().positive().optional(),
    drain_size: z.string().optional(),
  }),
  evap_coil: z.object({
    tonnage: z.number().positive(),
    refrigerant: REFRIGERANT.optional(),
    cabinet_width: z.number().positive().optional(),
    drain_size: z.string().optional(),
    configuration: z.enum(["uncased", "cased", "slab"]).optional(),
  }),
  heat_strips: z.object({
    kw: z.number().positive(),
    voltage: z.number().positive().optional(),
    breaker_size: z.number().positive().optional(),
  }),
  thermostat: z.object({
    wifi: z.boolean().optional(),
    smart: z.boolean().optional(),
    stages: z.number().int().positive().optional(),
    programmable: z.boolean().optional(),
  }),
  ductwork_trunk: z.object({
    width_inches: z.number().positive(),
    height_inches: z.number().positive(),
    length_ft: z.number().positive().optional(),
    material: z.enum(["galvanized", "aluminum", "fiberboard"]).optional(),
  }),
  flex_duct: z.object({
    diameter_inches: z.number().positive(),
    length_ft: z.number().positive(),
    insulation_r: z.number().positive().optional(),
  }),
  supply_plenum: z.object({
    width_inches: z.number().positive().optional(),
    height_inches: z.number().positive().optional(),
    material: z.string().optional(),
  }),
  return_plenum: z.object({
    width_inches: z.number().positive().optional(),
    height_inches: z.number().positive().optional(),
    material: z.string().optional(),
  }),
  supply_register: z.object({
    width_inches: z.number().positive(),
    height_inches: z.number().positive(),
    style: z.enum(["sidewall", "floor", "ceiling", "diffuser"]).optional(),
  }),
  return_grille: z.object({
    width_inches: z.number().positive(),
    height_inches: z.number().positive(),
    style: z.enum(["sidewall", "floor", "ceiling"]).optional(),
  }),
  line_set: z.object({
    liquid_size: z.string(),
    suction_size: z.string(),
    length_ft: z.number().positive(),
    insulation_inches: z.number().positive().optional(),
  }),
  refrigerant: z.object({
    type: REFRIGERANT,
    weight_lb: z.number().positive(),
  }),
  disconnect: z.object({
    amps: z.number().positive(),
    fused: z.boolean(),
    voltage: z.number().positive().optional(),
  }),
  conduit_whip: z.object({
    size_inches: z.number().positive(),
    length_ft: z.number().positive(),
  }),
  breaker: z.object({
    amps: z.number().positive(),
    poles: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    voltage: z.number().positive().optional(),
  }),
  condensate_pump: z.object({
    flow_gph: z.number().positive(),
    head_ft: z.number().positive().optional(),
    voltage: z.number().positive().optional(),
  }),
  p_trap: z.object({
    size_inches: z.number().positive(),
    material: z.enum(["pvc", "copper", "steel"]).optional(),
  }),
  drain_line: z.object({
    size_inches: z.number().positive(),
    length_ft: z.number().positive(),
    material: z.enum(["pvc", "copper"]).optional(),
  }),
  filter: z.object({
    width_inches: z.number().positive(),
    height_inches: z.number().positive(),
    depth_inches: z.number().positive(),
    merv: z.number().int().positive().optional(),
  }),
  duct_mastic: z.object({
    volume: z.string(), // "1 gal", "5 gal", etc.
  }),
  foil_tape: z.object({
    width_inches: z.number().positive(),
    length_yd: z.number().positive(),
  }),
  condenser_pad: z.object({
    width_inches: z.number().positive(),
    depth_inches: z.number().positive(),
    height_inches: z.number().positive(),
    material: z.string().optional(),
  }),
  hanger_strap: z.object({
    width_inches: z.number().positive(),
    length_ft: z.number().positive(),
    material: z.enum(["galvanized", "copper", "perforated"]).optional(),
  }),
} satisfies Record<BomSlot, ZodTypeAny>;

export type BomSpecsFor<S extends BomSlot> = z.infer<(typeof BOM_SPEC_SCHEMAS)[S]>;

/**
 * Map each slot to the coarser EquipmentType the existing BOM generator uses.
 * Lets loadBomCatalog emit CatalogItem rows that the current generator can
 * still consume while Phase 2/3 are being built.
 */
export const SLOT_TO_EQUIPMENT_TYPE: Record<BomSlot, EquipmentType> = {
  ac_condenser: "ac_condenser",
  heat_pump_condenser: "heat_pump_condenser",
  gas_furnace: "gas_furnace",
  air_handler: "air_handler",
  evap_coil: "evap_coil",
  heat_strips: "heat_strips",
  thermostat: "thermostat",
  ductwork_trunk: "ductwork",
  flex_duct: "ductwork",
  supply_plenum: "ductwork",
  return_plenum: "ductwork",
  supply_register: "register",
  return_grille: "grille",
  line_set: "refrigerant",
  refrigerant: "refrigerant",
  disconnect: "electrical",
  conduit_whip: "electrical",
  breaker: "electrical",
  condensate_pump: "installation",
  p_trap: "installation",
  drain_line: "installation",
  filter: "installation",
  duct_mastic: "installation",
  foil_tape: "installation",
  condenser_pad: "installation",
  hanger_strap: "installation",
};

export function validateBomSpecs(
  slot: string,
  specs: unknown,
): { success: true; data: unknown } | { success: false; error: string } {
  if (!(BOM_SLOT_VALUES as readonly string[]).includes(slot)) {
    return { success: false, error: `Unknown slot: ${slot}` };
  }
  const schema = BOM_SPEC_SCHEMAS[slot as BomSlot];
  const parsed = schema.safeParse(specs);
  if (parsed.success) return { success: true, data: parsed.data };
  return { success: false, error: parsed.error.message };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/hvac/__tests__/bom-slot-taxonomy.test.ts`
Expected: all 7 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hvac/bom-slot-taxonomy.ts src/lib/hvac/__tests__/bom-slot-taxonomy.test.ts
git commit -m "feat(hvac): BOM slot taxonomy + Zod spec schemas"
```

---

## Task 3: LLM classifier module

**Files:**
- Create: `src/lib/hvac/vendor-classifier-llm.ts`
- Create: `src/lib/hvac/__tests__/vendor-classifier-llm.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/hvac/__tests__/vendor-classifier-llm.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  classifyVendorProductsBatch,
  type ClassifierClient,
} from "../vendor-classifier-llm";
import type { VendorProductRow } from "@/types/catalog";

function row(o: Partial<VendorProductRow>): VendorProductRow {
  return {
    id: o.id ?? "id-1",
    vendor_id: "v1",
    sku: "SKU",
    mpn: null,
    name: "",
    brand: null,
    image_url: null,
    short_description: null,
    category_root: null,
    category_path: null,
    category_leaf: null,
    detail_url: null,
    price: null,
    price_text: null,
    last_priced_at: null,
    vendor: null,
    ...o,
  };
}

describe("classifyVendorProductsBatch", () => {
  it("parses a valid LLM response into typed results", async () => {
    const fakeClient: ClassifierClient = {
      classify: vi.fn().mockResolvedValue([
        {
          id: "id-1",
          bom_slot: "ac_condenser",
          bom_specs: { tonnage: 3, seer: 16, refrigerant: "r410a" },
        },
        { id: "id-2", bom_slot: null, bom_specs: null },
      ]),
    };

    const out = await classifyVendorProductsBatch(
      [
        row({ id: "id-1", name: "3 Ton AC Condenser" }),
        row({ id: "id-2", name: "Hole Saw 3/4" }),
      ],
      fakeClient,
    );

    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      id: "id-1",
      bom_slot: "ac_condenser",
      bom_specs: { tonnage: 3, seer: 16, refrigerant: "r410a" },
    });
    expect(out[1]).toEqual({ id: "id-2", bom_slot: null, bom_specs: null });
  });

  it("drops an entry when bom_specs fails Zod validation", async () => {
    const fakeClient: ClassifierClient = {
      classify: vi.fn().mockResolvedValue([
        {
          id: "id-1",
          bom_slot: "ac_condenser",
          bom_specs: { seer: 16 }, // missing required tonnage
        },
      ]),
    };

    const out = await classifyVendorProductsBatch(
      [row({ id: "id-1" })],
      fakeClient,
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ id: "id-1", bom_slot: null, bom_specs: null });
  });

  it("drops an entry when bom_slot is not in the taxonomy", async () => {
    const fakeClient: ClassifierClient = {
      classify: vi.fn().mockResolvedValue([
        { id: "id-1", bom_slot: "invented_slot", bom_specs: {} },
      ]),
    };

    const out = await classifyVendorProductsBatch(
      [row({ id: "id-1" })],
      fakeClient,
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ id: "id-1", bom_slot: null, bom_specs: null });
  });

  it("returns null entries for ids the LLM omits", async () => {
    const fakeClient: ClassifierClient = {
      classify: vi.fn().mockResolvedValue([
        // LLM dropped id-2
        { id: "id-1", bom_slot: null, bom_specs: null },
      ]),
    };

    const out = await classifyVendorProductsBatch(
      [row({ id: "id-1" }), row({ id: "id-2" })],
      fakeClient,
    );

    expect(out).toHaveLength(2);
    expect(out.map((r) => r.id).sort()).toEqual(["id-1", "id-2"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/hvac/__tests__/vendor-classifier-llm.test.ts`
Expected: cannot-find-module `../vendor-classifier-llm`.

- [ ] **Step 3: Implement the classifier module**

```ts
// src/lib/hvac/vendor-classifier-llm.ts
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

/**
 * Pure classifier: given a batch of vendor_products rows, returns a typed
 * ClassificationResult for every input id (nulls for non-HVAC rows or rows
 * the LLM failed to classify cleanly). Callers persist the results.
 *
 * Validation is strict: if bom_slot isn't in the taxonomy OR bom_specs
 * fails the per-slot Zod schema, the row is recorded as
 * { bom_slot: null, bom_specs: null } so it's treated as unclassified
 * rather than stored with bad data.
 */
export async function classifyVendorProductsBatch(
  batch: VendorProductRow[],
  client: ClassifierClient,
): Promise<ClassificationResult[]> {
  const raw = await client.classify(batch);
  const byId = new Map<string, RawLLMResult>();
  for (const r of raw) byId.set(r.id, r);

  return batch.map((row) => {
    const r = byId.get(row.id);
    if (!r) return { id: row.id, bom_slot: null, bom_specs: null };
    if (!r.bom_slot) return { id: row.id, bom_slot: null, bom_specs: null };
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
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/hvac/__tests__/vendor-classifier-llm.test.ts`
Expected: all 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hvac/vendor-classifier-llm.ts src/lib/hvac/__tests__/vendor-classifier-llm.test.ts
git commit -m "feat(hvac): LLM classifier module with Zod-validated batch output"
```

---

## Task 4: Classifier API route

**Files:**
- Create: `src/app/api/internal/classify-vendor-products/route.ts`
- Create: `src/app/api/internal/classify-vendor-products/__tests__/route.test.ts`

- [ ] **Step 1: Decide on admin-auth secret**

Add `INTERNAL_API_TOKEN` to `.env.local` (generate via `openssl rand -base64 32`) and to Vercel project env vars (Preview + Production). The route rejects any request without `Authorization: Bearer $INTERNAL_API_TOKEN`.

No code for this step — just document/set the env.

- [ ] **Step 2: Write failing tests**

```ts
// src/app/api/internal/classify-vendor-products/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv, INTERNAL_API_TOKEN: "test-token" };
});

describe("POST /api/internal/classify-vendor-products", () => {
  it("rejects missing Authorization header with 401", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://x/api/internal/classify-vendor-products", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects wrong token with 401", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://x/api/internal/classify-vendor-products", {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 and reports zero remaining when no unclassified rows", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: () => ({
          select: () => ({
            is: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }),
      }),
    }));
    vi.doMock("@/lib/hvac/vendor-classifier-llm", () => ({
      classifyVendorProductsBatch: vi.fn().mockResolvedValue([]),
      createAnthropicClassifier: vi.fn(),
      CLASSIFIER_VERSION: 1,
    }));
    const { POST } = await import("../route");
    const req = new Request("http://x/api/internal/classify-vendor-products", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ classified: 0, remaining: 0 });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/app/api/internal/classify-vendor-products/__tests__/route.test.ts`
Expected: cannot-find-module `../route`.

- [ ] **Step 4: Implement the route**

```ts
// src/app/api/internal/classify-vendor-products/route.ts
import { NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VendorProductRow } from "@/types/catalog";
import {
  classifyVendorProductsBatch,
  createAnthropicClassifier,
  CLASSIFIER_VERSION,
} from "@/lib/hvac/vendor-classifier-llm";

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

  const { data: rows, error } = await supabase
    .from("vendor_products")
    .select(
      "id, vendor_id, sku, mpn, name, brand, image_url, short_description, category_root, category_path, category_leaf, detail_url, price, price_text, last_priced_at",
    )
    .is("bom_slot", null)
    .is("bom_classified_at", null)
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
  // Write results row-by-row (small batches; typing an `.in()` upsert across
  // heterogeneous columns is awkward and slower than N small updates here).
  let written = 0;
  for (const r of results) {
    const { error: updErr } = await supabase
      .from("vendor_products")
      .update({
        bom_slot: r.bom_slot,
        bom_specs: r.bom_specs,
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
    .is("bom_classified_at", null);

  return NextResponse.json({ classified: written, remaining: remaining ?? 0 });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/api/internal/classify-vendor-products/__tests__/route.test.ts`
Expected: all 3 pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/internal/classify-vendor-products/route.ts src/app/api/internal/classify-vendor-products/__tests__/route.test.ts
git commit -m "feat(api): admin-authed classifier endpoint with Haiku batch processing"
```

---

## Task 5: Wire classified data into `loadBomCatalog`

**Files:**
- Modify: `src/lib/hvac/vendor-classifier.ts` (add adapter for classified rows)
- Modify: `src/lib/estimates/load-bom-catalog.ts`

- [ ] **Step 1: Add classified-row adapter to `vendor-classifier.ts`**

Append to the bottom of `src/lib/hvac/vendor-classifier.ts`:

```ts
import { SLOT_TO_EQUIPMENT_TYPE, type BomSlot } from "./bom-slot-taxonomy";

/**
 * Shape returned by loadBomCatalog when vendor_products has been LLM-classified.
 * Separate from VendorProductRow because the DB select is narrower.
 */
export type ClassifiedVendorRow = VendorProductRow & {
  bom_slot: string | null;
  bom_specs: Record<string, unknown> | null;
};

/**
 * Convert an LLM-classified vendor_products row into CatalogItem shape.
 * Pulls tonnage out of bom_specs when available so the existing BOM
 * generator's tonnage filter works on vendor rows.
 */
export function classifiedRowToCatalogItem(
  row: ClassifiedVendorRow,
): CatalogItem | null {
  if (!row.bom_slot) return null;
  const slot = row.bom_slot as BomSlot;
  const equipment_type = SLOT_TO_EQUIPMENT_TYPE[slot];
  if (!equipment_type) return null;

  const specs = (row.bom_specs ?? {}) as { tonnage?: number };
  const tonnage = typeof specs.tonnage === "number" ? specs.tonnage : null;

  const description = [row.name, row.short_description]
    .filter(Boolean)
    .join(" — ");

  return {
    id: `vendor:${row.id}`,
    user_id: "",
    supplier_id: null,
    vendor_product_id: row.id,
    mpn: row.mpn ?? row.sku,
    description,
    equipment_type,
    system_type: "universal",
    brand: row.brand ?? "",
    tonnage,
    seer_rating: null,
    btu_capacity: null,
    stages: null,
    refrigerant_type: null,
    unit_price: row.price,
    unit_of_measure: "ea",
    source: "imported",
    usage_count: 0,
    last_quoted_date: null,
    created_at: "",
    updated_at: "",
  };
}
```

Add the existing-import augmentation at the top of the file:

```ts
import type { CatalogItem, EquipmentType, VendorProductRow } from "@/types/catalog";
```
(unchanged — verify already present).

- [ ] **Step 2: Update `load-bom-catalog.ts` to prefer classified data**

Replace the `loadBomCatalog` function body's vendor-fetch block with:

```ts
const { data: vendorRows, error: vendorErr } = await supabase
  .from("vendor_products")
  .select(VENDOR_SELECT + ", bom_slot, bom_specs")
  .in("vendor_id", vendorIds)
  .or(VENDOR_CATEGORY_FILTERS)
  .limit(VENDOR_FETCH_LIMIT);

if (vendorErr) throw new Error(`vendor_products: ${vendorErr.message}`);

const classifiedItems: CatalogItem[] = [];
const unclassifiedRows: VendorProductRow[] = [];
for (const row of (vendorRows ?? []) as unknown as ClassifiedVendorRow[]) {
  if (row.bom_slot) {
    const item = classifiedRowToCatalogItem(row);
    if (item) classifiedItems.push(item);
  } else {
    unclassifiedRows.push(row);
  }
}

const runtimeClassified = classifyVendorProducts(unclassifiedRows);
return [...activeUserCat, ...classifiedItems, ...runtimeClassified];
```

Update imports:

```ts
import {
  classifyVendorProducts,
  classifiedRowToCatalogItem,
  type ClassifiedVendorRow,
} from "@/lib/hvac/vendor-classifier";
```

- [ ] **Step 3: Add an integration test that exercises both paths**

Append to `src/lib/hvac/__tests__/bom-generator-vendor.test.ts`:

```ts
import { classifiedRowToCatalogItem, type ClassifiedVendorRow } from "../vendor-classifier";

describe("classifiedRowToCatalogItem", () => {
  it("maps an LLM-classified ac_condenser row to a CatalogItem with tonnage", () => {
    const row: ClassifiedVendorRow = {
      id: "abc",
      vendor_id: "v1",
      sku: "SKU",
      mpn: "GSX160361",
      name: "3 Ton AC Condensing Unit",
      brand: "Goodman",
      image_url: null,
      short_description: null,
      category_root: null,
      category_path: null,
      category_leaf: null,
      detail_url: null,
      price: 2000,
      price_text: null,
      last_priced_at: null,
      vendor: null,
      bom_slot: "ac_condenser",
      bom_specs: { tonnage: 3, seer: 16, refrigerant: "r410a" },
    };
    const item = classifiedRowToCatalogItem(row);
    expect(item?.equipment_type).toBe("ac_condenser");
    expect(item?.tonnage).toBe(3);
    expect(item?.brand).toBe("Goodman");
  });

  it("returns null for rows where bom_slot is null", () => {
    const row: ClassifiedVendorRow = {
      id: "abc",
      vendor_id: "v1",
      sku: "SKU",
      mpn: null,
      name: "Hole Saw",
      brand: "Greenlee",
      image_url: null,
      short_description: null,
      category_root: null,
      category_path: null,
      category_leaf: null,
      detail_url: null,
      price: null,
      price_text: null,
      last_priced_at: null,
      vendor: null,
      bom_slot: null,
      bom_specs: null,
    };
    expect(classifiedRowToCatalogItem(row)).toBeNull();
  });
});
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass (existing 135 + the new ones).

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/hvac/vendor-classifier.ts src/lib/estimates/load-bom-catalog.ts src/lib/hvac/__tests__/bom-generator-vendor.test.ts
git commit -m "feat(bom): loadBomCatalog prefers LLM-classified rows, falls back to runtime"
```

---

## Task 6: Backfill script + operations doc

**Files:**
- Create: `scripts/backfill-vendor-classification.mjs`
- Create: `docs/ops/vendor-products-classifier.md`

- [ ] **Step 1: Write the backfill script**

```js
#!/usr/bin/env node
// scripts/backfill-vendor-classification.mjs
// One-shot runner that hammers /api/internal/classify-vendor-products until
// the `remaining` count reaches 0. Safe to run repeatedly; the endpoint is
// idempotent (only touches bom_classified_at IS NULL rows).
//
// Usage:
//   BASE_URL=http://localhost:3000 INTERNAL_API_TOKEN=... \
//     node scripts/backfill-vendor-classification.mjs
// Or against production (manual, from a workstation):
//   BASE_URL=https://coolbid.app INTERNAL_API_TOKEN=... \
//     node scripts/backfill-vendor-classification.mjs

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const token = process.env.INTERNAL_API_TOKEN;
if (!token) {
  console.error("INTERNAL_API_TOKEN must be set");
  process.exit(1);
}

const url = `${baseUrl}/api/internal/classify-vendor-products`;
let totalClassified = 0;
let iterations = 0;
const startedAt = Date.now();

while (true) {
  iterations += 1;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status}`, await res.text());
    process.exit(1);
  }
  const { classified, remaining } = await res.json();
  totalClassified += classified;
  console.log(
    `iter=${iterations} classified=${classified} total=${totalClassified} remaining=${remaining}`,
  );
  if (remaining === 0 || classified === 0) break;
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`Done. Total classified: ${totalClassified} in ${elapsed}s.`);
```

- [ ] **Step 2: Write the operations doc**

```md
# vendor_products classifier

## Overview

`vendor_products.bom_slot` and `bom_specs` are populated by the LLM classifier at
`POST /api/internal/classify-vendor-products`. The endpoint processes 25 rows
per call; cron-job.org hits it every 15 minutes to catch new scraper deltas.
The one-time initial backfill is driven by `scripts/backfill-vendor-classification.mjs`.

## Environment variables

- `INTERNAL_API_TOKEN` — bearer token required on the endpoint. Set in
  Vercel for all environments; set in `.env.local` for dev. Generate with
  `openssl rand -base64 32`.
- `ANTHROPIC_API_KEY` — already configured; used by `@/lib/anthropic`.

## Initial backfill

Run from a workstation once after the migration lands:

\`\`\`
BASE_URL=https://coolbid.app \\
  INTERNAL_API_TOKEN=<token> \\
  node scripts/backfill-vendor-classification.mjs
\`\`\`

Expected: ~1200 iterations (30k rows at 25/batch), ~1 hour wall clock,
~$5–10 in Anthropic spend.

## Recurring cron

Set up in cron-job.org (NOT vercel.json) per the project's cron policy:

- URL: `https://coolbid.app/api/internal/classify-vendor-products`
- Method: POST
- Header: `Authorization: Bearer <token>`
- Schedule: every 15 minutes
- Retry policy: 2 retries with 60s backoff

A no-op when there are zero unclassified rows (~50ms response).

## Re-classifying after taxonomy changes

1. Bump `CLASSIFIER_VERSION` in `src/lib/hvac/bom-slot-taxonomy.ts`.
2. Run (one-off) to null out older rows:

\`\`\`sql
update vendor_products
  set bom_slot = null, bom_specs = null, bom_classified_at = null
  where bom_classifier_v < <new version>;
\`\`\`

3. The backfill script (or the next few cron hits) will re-classify them.

## Monitoring

Check total unclassified count:

\`\`\`sql
select count(*) from vendor_products
  where bom_slot is null and bom_classified_at is null;
\`\`\`

If this grows between cron runs, investigate — the scraper is adding rows
faster than we classify (unlikely at 25/15min = 100/hr).
```

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-vendor-classification.mjs docs/ops/vendor-products-classifier.md
git commit -m "chore(ops): vendor_products classifier backfill script + runbook"
```

---

## Task 7: Verify end-to-end in dev

- [ ] **Step 1: Apply migration + regenerate types locally if not already done**

Already done in Task 1.

- [ ] **Step 2: Set `INTERNAL_API_TOKEN` in `.env.local`**

```bash
echo "INTERNAL_API_TOKEN=$(openssl rand -base64 32)" >> .env.local
```

- [ ] **Step 3: Start the dev server**

```bash
npm run dev
```
Expected: Ready on localhost:3000 with no startup errors.

- [ ] **Step 4: Hit the classifier endpoint once**

```bash
curl -X POST http://localhost:3000/api/internal/classify-vendor-products \
  -H "Authorization: Bearer $(grep INTERNAL_API_TOKEN .env.local | cut -d= -f2)"
```
Expected JSON: `{"classified": 25, "remaining": <~29975>}` (numbers will vary).

- [ ] **Step 5: Spot-check a classified row**

```bash
psql "$SUPABASE_DB_URL" -c "
  select name, bom_slot, bom_specs
    from vendor_products
    where bom_slot is not null
    order by bom_classified_at desc
    limit 10;
"
```
Expected: a mix of slots with sensible specs (e.g., `ac_condenser` rows have a `tonnage` number). If any look wrong, capture the `name` + `bom_slot` + `bom_specs` and adjust the SYSTEM_PROMPT in `vendor-classifier-llm.ts`.

- [ ] **Step 6: Run the backfill script against dev**

```bash
BASE_URL=http://localhost:3000 \
  INTERNAL_API_TOKEN=$(grep INTERNAL_API_TOKEN .env.local | cut -d= -f2) \
  node scripts/backfill-vendor-classification.mjs
```
Expected: runs to completion (remaining reaches 0). ~1 hr.

- [ ] **Step 7: Confirm `loadBomCatalog` picks up the classified rows**

Open an existing estimate and click "Regenerate BOM". Compare the Installation section to before: previously-missing rows should now have source badges and prices pulled from vendor_products (where the LLM classified an appropriate row). Some slots may still be Missing — that's Phase 3's job to fix.

- [ ] **Step 8: No commit for verification, but capture findings**

If the classifier is mislabeling common categories, open a follow-up issue; don't hand-patch the SYSTEM_PROMPT until you have a representative sample of ~10–20 failures.

---

## Self-review notes

- **Spec coverage:**
  - Schema migration → Task 1 ✓
  - Taxonomy + Zod schemas → Task 2 ✓
  - LLM classifier module → Task 3 ✓
  - Admin-authed API route → Task 4 ✓
  - `loadBomCatalog` integration → Task 5 ✓
  - Backfill script + runbook → Task 6 ✓
  - End-to-end verification → Task 7 ✓

- **No-placeholder scan:** Every code step contains actual code. Commands have expected output. `CLASSIFIER_VERSION = 1` is concrete.

- **Type consistency:** `BomSlot`, `ClassificationResult`, `ClassifierClient`, `ClassifiedVendorRow`, and `SLOT_TO_EQUIPMENT_TYPE` are all referenced consistently across tasks. Zod `BOM_SPEC_SCHEMAS` is defined once and consumed by `validateBomSpecs` (Task 2) and by `classifyVendorProductsBatch` (Task 3).

- **Dependency order:** Tasks are strictly sequential. Task 1 adds the columns; Task 2 adds the taxonomy; Task 3's classifier imports from Task 2; Task 4's route imports from Task 3 + Task 2's `CLASSIFIER_VERSION`; Task 5 imports from Task 2 (`SLOT_TO_EQUIPMENT_TYPE`); Task 6 depends on Task 4's endpoint URL. Don't parallelize.

- **Risks flagged for Phase 2/3:**
  1. Classifier quality on Johnstone rows with NULL `specifications` — the prompt only gets name + category + short_description. Monitor accuracy; if bad, richer prompts or fine-tuning may be warranted before Phase 3.
  2. Contractor-entered `equipment_catalog` rows don't get classified here (different table). Phase 2's add-part form should let the contractor pick the slot explicitly.
  3. `bom_classifier_v` is integer; the re-classification SQL in the ops doc assumes we'll never need per-slot selective re-classification. If that becomes necessary, we can filter by `bom_slot IN (...)` in the null-out query.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-16-bom-matching-phase-1-classifier.md`.
