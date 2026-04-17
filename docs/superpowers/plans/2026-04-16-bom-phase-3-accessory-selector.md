# BOM Phase 3 — AI Accessory Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (batch execution with checkpoints, this session). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After `generateBOM` picks major equipment, enrich the BOM by having Haiku 4.5 replace each "missing" accessory item with a compatible catalog pick based on the chosen major equipment's specs (line set connections match the condenser, breaker amps cover MCA, filter fits the furnace rack, refrigerant types match). Fallback to today's "Missing" behavior if no candidate fits or the LLM errors.

**Architecture:**
1. `CatalogItem` gets an optional `bom_specs` passthrough field; `BomItem` gets an optional `bom_slot` tag. Both are transient (not persisted to `estimate_bom_items`).
2. `bom-generator.ts` tags every item it produces (matched + missing) with the correct `bom_slot`. `classifiedRowToCatalogItem` propagates `bom_specs` from `vendor_products.bom_specs` onto `CatalogItem`.
3. New `accessory-picker.ts` defines a pure function `pickAccessories({ majorEquipment, requirements, candidatesBySlot, preferences }, client)`. It builds the prompt, calls the injected client, Zod-validates the reply, returns `{ [slot]: { pickId, reason } | null }`.
4. New `enrichBomWithAccessories(bom, catalog, preferences, client?)` runs after `generateBOM`. Without a client, it's a no-op (tests + dev). With a client, it asks the LLM to fill the missing accessory slots and replaces those BomItems with the picks.
5. `regenerate-bom.ts` and `use-estimator.ts` both construct the Anthropic-backed client and pass it through. Both already have an `anthropic` import path available.

**Tech Stack:** Next.js 16 App Router (Node runtime), `@anthropic-ai/sdk` (existing), Zod, Vitest.

**Out of scope:**
- Phase 2 equipment picker UI (user-driven major equipment selection).
- Re-classification of already-classified rows (handled by Phase 1.5 / PR #42).
- Contractor preferences beyond what `generateBOM` already passes — the enrichment step receives them but doesn't expand the prefs model.

---

## File structure

**Create:**
- `src/lib/hvac/accessory-picker.ts` — pure picker + enrichBomWithAccessories
- `src/lib/hvac/accessory-picker-llm.ts` — Anthropic-backed `AccessoryPickerClient` factory
- `src/lib/hvac/__tests__/accessory-picker.test.ts` — unit tests with mocked client

**Modify:**
- `src/types/catalog.ts` — add `bom_specs?: Record<string, unknown>` to `CatalogItem`
- `src/types/hvac.ts` — add `bom_slot?: BomSlot` to `BomItem`
- `src/lib/hvac/vendor-classifier.ts` — propagate `bom_specs` through `classifiedRowToCatalogItem` and widen `ClassifiedVendorRow` type if needed
- `src/lib/hvac/bom-generator.ts` — tag every item with its slot (inline edits at each `catalogToBomItem` + `missingItem` call site)
- `src/lib/estimates/regenerate-bom.ts` — call `enrichBomWithAccessories` after `generateBOM`
- `src/hooks/use-estimator.ts` — call `enrichBomWithAccessories` after `generateBOM`
- `src/lib/hvac/__tests__/bom-generator-vendor.test.ts` — add integration tests for enriched BOM
- `src/lib/estimates/bom-rows.ts` — verify the transient `bom_slot` field on `BomItem` doesn't leak into DB inserts (it shouldn't since `toBomInsertRows` selects explicit fields, but worth a test)

---

## Task 1: Type additions (`CatalogItem.bom_specs` and `BomItem.bom_slot`)

**Files:**
- Modify: `src/types/catalog.ts` — add `bom_specs?` to `CatalogItem`
- Modify: `src/types/hvac.ts` — add `bom_slot?` to `BomItem`

- [ ] **Step 1: Add `bom_specs` to `CatalogItem` in `src/types/catalog.ts`**

Read the file first. Find the `CatalogItem` type definition (around line 69-92 in the current layout — look for `export type CatalogItem = {`). Inside the type body, AFTER `unit_of_measure: string;` but BEFORE the `source:` line, add:

```ts
  /**
   * When this CatalogItem was produced by the LLM classifier adapter
   * (classifiedRowToCatalogItem), holds the canonical slot-specific specs
   * the LLM extracted. Used by the Phase 3 accessory picker to reason
   * about compatibility. Transient — never persisted.
   */
  bom_specs?: Record<string, unknown>;
```

- [ ] **Step 2: Add `bom_slot` to `BomItem` in `src/types/hvac.ts`**

Read the file. Find `export type BomItem = {` (line 30 in the current layout). Widen the closing line to add `bom_slot?`. The current definition is:

```ts
export type BomItem = {
  partId: string; name: string; category: string; qty: number; unit: string;
  price: number | null; supplier: string; sku: string; notes: string; source: "starter" | "quote" | "manual" | "imported" | "missing";
  brand: string;
};
```

Change to:

```ts
export type BomItem = {
  partId: string; name: string; category: string; qty: number; unit: string;
  price: number | null; supplier: string; sku: string; notes: string; source: "starter" | "quote" | "manual" | "imported" | "missing";
  brand: string;
  /**
   * Phase 3 slot tag. Set by bom-generator.ts when creating items so the
   * accessory enrichment step can pair "missing" items with the right
   * classified candidates. Transient — stripped before DB insert by
   * toBomInsertRows in src/lib/estimates/bom-rows.ts.
   */
  bom_slot?: import("@/lib/hvac/bom-slot-taxonomy").BomSlot;
};
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0. If existing code depends on the exact shape of `BomItem` (e.g., `satisfies BomItem` in tests), it still passes because the new field is optional.

- [ ] **Step 4: Commit**

```bash
git add src/types/catalog.ts src/types/hvac.ts
git commit -m "types(hvac): add transient bom_specs/bom_slot fields for Phase 3 enrichment"
```

---

## Task 2: Propagate `bom_specs` through `classifiedRowToCatalogItem`

**Files:**
- Modify: `src/lib/hvac/vendor-classifier.ts`
- Modify: `src/lib/hvac/__tests__/bom-generator-vendor.test.ts` — existing test of the adapter needs an assertion on `bom_specs`

- [ ] **Step 1: Add a failing test**

Open `src/lib/hvac/__tests__/bom-generator-vendor.test.ts`. Find the `describe("classifiedRowToCatalogItem")` block. Under the first test ("maps an LLM-classified ac_condenser row..."), add assertions on `bom_specs`:

Locate this test in the file:

```ts
  it("maps an LLM-classified ac_condenser row to a CatalogItem with tonnage", () => {
```

Find the final `expect(item?.brand).toBe("Goodman");` line. After it, before the closing `});`, add:

```ts
    expect(item?.bom_specs).toEqual({ tonnage: 3, seer: 16, refrigerant: "r410a" });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/hvac/__tests__/bom-generator-vendor.test.ts`
Expected: one test fails — `expected undefined to deeply equal { tonnage: 3, seer: 16, refrigerant: 'r410a' }`.

- [ ] **Step 3: Update `classifiedRowToCatalogItem`**

Read `src/lib/hvac/vendor-classifier.ts`. Find `export function classifiedRowToCatalogItem(row: ClassifiedVendorRow): CatalogItem | null {`. In the `return {` block, AFTER the `unit_of_measure: "ea",` line, add:

```ts
    bom_specs: row.bom_specs ?? undefined,
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/hvac/__tests__/bom-generator-vendor.test.ts`
Expected: all pass.

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/hvac/vendor-classifier.ts src/lib/hvac/__tests__/bom-generator-vendor.test.ts
git commit -m "feat(classifier): propagate bom_specs through classifiedRowToCatalogItem"
```

---

## Task 3: Tag BomItems with `bom_slot` in `bom-generator.ts`

**Files:**
- Modify: `src/lib/hvac/bom-generator.ts`

This task attaches a `bom_slot` label to every BomItem produced, so the enrichment step can pair missing items with classified candidates from the same slot. The changes are mechanical — at each call site, pass the slot or spread it onto the result.

- [ ] **Step 1: Extend `catalogToBomItem` signature to accept an optional slot**

Read `src/lib/hvac/bom-generator.ts`. Find `function catalogToBomItem(item: CatalogItem, qty: number, notes: string): BomItem {`. Replace the signature + body with:

```ts
import type { BomSlot } from "./bom-slot-taxonomy";

// ... (rest of existing imports unchanged)

function catalogToBomItem(
  item: CatalogItem,
  qty: number,
  notes: string,
  slot?: BomSlot,
): BomItem {
  return {
    partId: item.id,
    name: item.description ?? "",
    category: getCategoryFromType(item.equipment_type),
    qty,
    unit: item.unit_of_measure ?? "ea",
    price: item.unit_price,
    supplier: item.supplier?.name ?? item.brand ?? "",
    sku: item.mpn ?? "",
    notes,
    source: item.source,
    brand: item.brand ?? "",
    bom_slot: slot,
  };
}
```

(Note: the `BomSlot` import goes at the top of the file alongside existing type imports.)

- [ ] **Step 2: Extend `missingItem` signature similarly**

Find `function missingItem(`. Replace with:

```ts
function missingItem(
  eqType: EquipmentType,
  label: string,
  qty: number,
  notes = "No matching equipment — add to catalog or upload a quote",
  slot?: BomSlot,
): BomItem {
  return {
    partId: "",
    name: label,
    category: getCategoryFromType(eqType),
    qty,
    unit: "ea",
    price: null,
    supplier: "",
    sku: "",
    notes,
    source: "missing",
    brand: "",
    bom_slot: slot,
  };
}
```

- [ ] **Step 3: Update major-equipment loop to pass slot**

Find the loop starting with `for (const eqType of equipmentTypes) {` (around line 203). Inside the loop, there are two `catalogToBomItem(found.item, qty, found.notes)` and `missingItem(eqType, label, qty)` calls. Change them to pass `eqType` as the slot (safe because the major-equipment `EquipmentType` values match `BomSlot` values 1:1 for this list):

```ts
    if (found) {
      items.push(catalogToBomItem(found.item, qty, found.notes, eqType as BomSlot));
    } else {
      const label = isThermostat
        ? (EQUIPMENT_TYPE_LABELS[eqType] ?? eqType)
        : `${equipTonnage}T ${EQUIPMENT_TYPE_LABELS[eqType] ?? eqType}`;
      items.push(missingItem(eqType, label, qty, undefined, eqType as BomSlot));
    }
```

- [ ] **Step 4: Update ductwork call sites**

Find the "// Ductwork" comment block (around line 221-260). There are five `findCatalogItemByKeyword(catalog, "ductwork", ...)` call groups: trunk, 8" flex, 6" flex, supply plenum, return plenum.

Update each group's two branches (`items.push(catalogToBomItem(...))` and `items.push(...missingItem(...))`) to pass the slot. Example for trunk:

```ts
  const trunk = findCatalogItemByKeyword(catalog, "ductwork", systemType, trunkModelKw, trunkDescKw, brands);
  if (trunk) {
    items.push(catalogToBomItem(trunk.item, trunkLen, trunk.notes, "ductwork_trunk"));
  } else {
    const trunkLabel = tonnage <= 3 ? "8\"x12\" Sheet Metal Trunk" : tonnage <= 4 ? "10\"x14\" Sheet Metal Trunk" : "12\"x16\" Sheet Metal Trunk";
    items.push({ ...missingItem("ductwork", trunkLabel, trunkLen, undefined, "ductwork_trunk"), unit: "ft" });
  }
```

Do the same for:
- **8" flex**: slot = `"flex_duct"`
- **6" flex**: slot = `"flex_duct"`
- **supply plenum**: slot = `"supply_plenum"`
- **return plenum**: slot = `"return_plenum"`

- [ ] **Step 5: Update registers + grille call sites**

Find `// Registers — use preferred style keywords if set` (around line 262). Two register branches (large + small). Pass slot `"supply_register"` to both matched and missing calls.

Find `// Return grilles — use preferred sizing if set` (around line 286). One branch. Pass slot `"return_grille"`.

- [ ] **Step 6: Update refrigerant + lineset**

Find `// Refrigerant & Lines`. Two groups: lineset, refrigerant canister.

- **lineset**: slot = `"line_set"`
- **refrigerant (bulk)**: slot = `"refrigerant"`

- [ ] **Step 7: Update electrical**

Find `// Electrical`. Three groups: disconnect, whip, breaker.

- **disconnect**: slot = `"disconnect"`
- **whip**: slot = `"conduit_whip"`
- **breaker**: slot = `"breaker"`

- [ ] **Step 8: Update installation items**

Find `// Installation items`. Multiple groups: condensate pump (conditional on attic/closet), p-trap, drain, filter, mastic, foil tape, pad, hanger.

- **cpump**: slot = `"condensate_pump"`
- **ptrap**: slot = `"p_trap"`
- **drain**: slot = `"drain_line"`
- **filter**: slot = `"filter"`
- **mastic**: slot = `"duct_mastic"`
- **foilTape**: slot = `"foil_tape"`
- **pad**: slot = `"condenser_pad"`
- **hanger**: slot = `"hanger_strap"`

- [ ] **Step 9: Run existing tests to ensure nothing broke**

Run: `npx vitest run`
Expected: all 153 passing (tagging is additive; no behavior change).

- [ ] **Step 10: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add src/lib/hvac/bom-generator.ts
git commit -m "feat(bom): tag BomItems with bom_slot so Phase 3 enrichment can pair missing items with classified candidates"
```

---

## Task 4: Accessory picker module (pure + LLM client, TDD)

**Files:**
- Create: `src/lib/hvac/accessory-picker.ts` — pure picker (dependency-injected client) + `enrichBomWithAccessories`
- Create: `src/lib/hvac/accessory-picker-llm.ts` — Anthropic-backed `AccessoryPickerClient` factory
- Create: `src/lib/hvac/__tests__/accessory-picker.test.ts` — unit tests with mocked client

- [ ] **Step 1: Write failing tests for the pure picker**

Create `src/lib/hvac/__tests__/accessory-picker.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  pickAccessories,
  enrichBomWithAccessories,
  type AccessoryPickerClient,
  type MajorEquipmentContext,
} from "../accessory-picker";
import type { CatalogItem } from "@/types/catalog";
import type { BomItem, BomResult } from "@/types/hvac";

function catalogItem(over: Partial<CatalogItem>): CatalogItem {
  return {
    id: "c1",
    user_id: "",
    supplier_id: null,
    vendor_product_id: null,
    mpn: "MPN",
    description: "",
    equipment_type: "refrigerant",
    system_type: "universal",
    brand: "",
    tonnage: null,
    seer_rating: null,
    btu_capacity: null,
    stages: null,
    refrigerant_type: null,
    unit_price: 100,
    unit_of_measure: "ea",
    source: "imported",
    usage_count: 0,
    last_quoted_date: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function bomItem(over: Partial<BomItem>): BomItem {
  return {
    partId: "",
    name: "",
    category: "",
    qty: 1,
    unit: "ea",
    price: null,
    supplier: "",
    sku: "",
    notes: "",
    source: "missing",
    brand: "",
    ...over,
  };
}

function bomResult(items: BomItem[]): BomResult {
  return {
    items,
    summary: {
      designBTU: 30000,
      tonnage: 3,
      totalCFM: 1200,
      totalRegs: 8,
      retCount: 2,
      condSqft: 1500,
      zones: 1,
    },
    roomLoads: [],
  };
}

describe("pickAccessories", () => {
  it("returns the LLM picks merged with slot ids verbatim", async () => {
    const fakeClient: AccessoryPickerClient = {
      pick: vi.fn().mockResolvedValue({
        line_set: { pick_id: "vendor:line1", reason: "3/8x7/8 matches" },
        breaker: { pick_id: "vendor:brk1", reason: "30A covers 21A MCA" },
      }),
    };

    const out = await pickAccessories(
      {
        majorEquipment: [
          {
            slot: "ac_condenser",
            name: "3 Ton AC",
            specs: { tonnage: 3, mca: 21, liquid_size: "3/8", suction_size: "7/8" },
          },
        ],
        requirements: [
          { slot: "line_set", quantity: 1, fallbackLabel: "Line Set" },
          { slot: "breaker", quantity: 1, fallbackLabel: "Breaker" },
        ],
        candidatesBySlot: {
          line_set: [catalogItem({ id: "vendor:line1" })],
          breaker: [catalogItem({ id: "vendor:brk1" })],
        },
        preferences: null,
      },
      fakeClient,
    );

    expect(out.line_set).toEqual({ pickId: "vendor:line1", reason: "3/8x7/8 matches" });
    expect(out.breaker).toEqual({ pickId: "vendor:brk1", reason: "30A covers 21A MCA" });
  });

  it("drops a slot's pick when pick_id isn't in the candidate list", async () => {
    const fakeClient: AccessoryPickerClient = {
      pick: vi.fn().mockResolvedValue({
        line_set: { pick_id: "vendor:hallucinated", reason: "made up" },
      }),
    };

    const out = await pickAccessories(
      {
        majorEquipment: [],
        requirements: [{ slot: "line_set", quantity: 1, fallbackLabel: "Line Set" }],
        candidatesBySlot: { line_set: [catalogItem({ id: "vendor:real" })] },
        preferences: null,
      },
      fakeClient,
    );

    expect(out.line_set).toEqual({ pickId: null, reason: "made up" });
  });

  it("returns an empty object when no requirements are given", async () => {
    const fakeClient: AccessoryPickerClient = { pick: vi.fn() };
    const out = await pickAccessories(
      {
        majorEquipment: [],
        requirements: [],
        candidatesBySlot: {},
        preferences: null,
      },
      fakeClient,
    );
    expect(out).toEqual({});
    expect(fakeClient.pick).not.toHaveBeenCalled();
  });
});

describe("enrichBomWithAccessories", () => {
  it("replaces missing BomItems with picked candidates", async () => {
    const condenser = catalogItem({
      id: "vendor:ac",
      equipment_type: "ac_condenser",
      description: "3 Ton AC",
      bom_specs: { tonnage: 3, mca: 21, liquid_size: "3/8", suction_size: "7/8" },
    });
    const linesetCandidate = catalogItem({
      id: "vendor:line1",
      equipment_type: "refrigerant",
      description: "3/8x7/8 25ft Line Set",
      brand: "Mueller",
      bom_specs: { liquid_size: "3/8", suction_size: "7/8", length_ft: 25 },
    });

    const bom = bomResult([
      bomItem({
        partId: "vendor:ac",
        source: "imported",
        bom_slot: "ac_condenser",
        name: "3 Ton AC",
        category: "Major Equipment",
      }),
      bomItem({
        source: "missing",
        bom_slot: "line_set",
        name: "Line Set (25ft)",
        category: "Refrigerant & Lines",
        qty: 1,
      }),
    ]);

    const fakeClient: AccessoryPickerClient = {
      pick: vi.fn().mockResolvedValue({
        line_set: { pick_id: "vendor:line1", reason: "sizes match" },
      }),
    };

    const enriched = await enrichBomWithAccessories(
      bom,
      [condenser, linesetCandidate],
      null,
      fakeClient,
    );

    const linesetItem = enriched.items.find((i) => i.bom_slot === "line_set");
    expect(linesetItem?.source).toBe("imported");
    expect(linesetItem?.partId).toBe("vendor:line1");
    expect(linesetItem?.qty).toBe(1);
    expect(linesetItem?.brand).toBe("Mueller");
    expect(linesetItem?.notes).toContain("sizes match");
  });

  it("leaves items untouched when no client is provided", async () => {
    const bom = bomResult([
      bomItem({ source: "missing", bom_slot: "line_set", name: "Line Set" }),
    ]);
    const enriched = await enrichBomWithAccessories(bom, [], null, undefined);
    expect(enriched.items[0].source).toBe("missing");
  });

  it("leaves a missing item alone if the LLM returns pickId: null", async () => {
    const fakeClient: AccessoryPickerClient = {
      pick: vi.fn().mockResolvedValue({
        p_trap: { pick_id: null, reason: "no 3/4\" PVC trap in catalog" },
      }),
    };
    const bom = bomResult([
      bomItem({ source: "missing", bom_slot: "p_trap", name: "P-Trap" }),
    ]);
    const enriched = await enrichBomWithAccessories(
      bom,
      [catalogItem({ id: "x", equipment_type: "installation", bom_specs: { size_inches: 1 } })],
      null,
      fakeClient,
    );
    expect(enriched.items[0].source).toBe("missing");
    expect(enriched.items[0].notes).toContain("no 3/4");
  });

  it("swallows LLM errors and returns the original BOM", async () => {
    const fakeClient: AccessoryPickerClient = {
      pick: vi.fn().mockRejectedValue(new Error("timeout")),
    };
    const bom = bomResult([
      bomItem({ source: "missing", bom_slot: "line_set", name: "Line Set" }),
    ]);
    const enriched = await enrichBomWithAccessories(bom, [], null, fakeClient);
    expect(enriched).toBe(bom);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/hvac/__tests__/accessory-picker.test.ts`
Expected: cannot-find-module `../accessory-picker`.

- [ ] **Step 3: Implement `src/lib/hvac/accessory-picker.ts`**

```ts
import { z } from "zod";
import type { CatalogItem } from "@/types/catalog";
import type { BomItem, BomResult } from "@/types/hvac";
import type { ContractorPreferences } from "@/types/contractor-preferences";
import { BOM_SLOT_VALUES, type BomSlot } from "./bom-slot-taxonomy";

// Picker input shapes -------------------------------------------------

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

// Client contract (injected so tests can mock) ------------------------

export type RawPickResult = {
  pick_id: string | null;
  reason: string;
};

export interface AccessoryPickerClient {
  pick(input: PickerInput): Promise<Record<string, RawPickResult>>;
}

// Zod validation of the LLM's reply -----------------------------------

const PICK_SHAPE = z.object({
  pick_id: z.string().nullable(),
  reason: z.string(),
});

// Public API ----------------------------------------------------------

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
      // LLM hallucinated an id that isn't in the candidate list — drop it.
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

// Integration helper that wraps a full BomResult ----------------------

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

  // 1. Major equipment context (anything tagged with a major slot).
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const majorEquipment: MajorEquipmentContext[] = [];
  for (const item of bom.items) {
    if (!item.bom_slot || !MAJOR_SLOTS.has(item.bom_slot)) continue;
    if (item.source === "missing") continue;
    const catalogItem = catalogById.get(item.partId);
    majorEquipment.push({
      slot: item.bom_slot,
      name: item.name,
      specs: (catalogItem?.bom_specs as Record<string, unknown>) ?? {},
    });
  }

  // 2. Missing accessory requirements + indices.
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

  // 3. Candidates per slot (classified rows only — skip runtime-inferred
  //    items that have no bom_specs).
  const candidatesBySlot: Partial<Record<BomSlot, CatalogItem[]>> = {};
  for (const m of missing) {
    if (candidatesBySlot[m.requirement.slot]) continue;
    const slotCandidates = catalog
      .filter((c) => c.bom_specs && c.id.startsWith("vendor:"))
      .filter((c) => /* classifier-slot filter */ classifierSlotMatches(c, m.requirement.slot))
      .slice(0, 20);
    candidatesBySlot[m.requirement.slot] = slotCandidates;
  }

  // 4. Call the picker. Swallow errors — fall back to the unchanged BOM.
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

  // 5. Apply picks back onto the BOM.
  const items = [...bom.items];
  for (const m of missing) {
    const pick = picks[m.requirement.slot];
    if (!pick) continue;
    if (pick.pickId === null) {
      // Leave missing; update the note with the LLM's reasoning.
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

function classifierSlotMatches(item: CatalogItem, slot: BomSlot): boolean {
  // The classifier adapter stores the slot implicitly via equipment_type +
  // the shape of bom_specs. We rely on equipment_type's 1:1 / 1:many
  // mapping defined in SLOT_TO_EQUIPMENT_TYPE — match by comparing.
  // (A more direct `bom_slot` column on CatalogItem would be cleaner; left
  // out because CatalogItem is shared with the user's equipment_catalog
  // where the slot concept doesn't apply.)
  const { SLOT_TO_EQUIPMENT_TYPE } = require("./bom-slot-taxonomy") as typeof import("./bom-slot-taxonomy");
  return SLOT_TO_EQUIPMENT_TYPE[slot] === item.equipment_type;
}
```

Note: the `classifierSlotMatches` helper uses `require` to avoid a circular import; in practice this file + `bom-slot-taxonomy.ts` don't actually import each other (the helper is inlined at the bottom). Feel free to replace with a top-level `import` when you verify the module graph doesn't cycle.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/hvac/__tests__/accessory-picker.test.ts`
Expected: all 7 pass.

- [ ] **Step 5: Implement the Anthropic-backed client `src/lib/hvac/accessory-picker-llm.ts`**

```ts
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

Preference ordering (break ties in this order):
1. Contractor brand preferences, if any match.
2. Lower unit_price.

Output JSON format (return exactly one object, no commentary):
{
  "line_set": { "pick_id": "<candidate_id or null>", "reason": "<one sentence>" },
  "breaker":  { "pick_id": "...", "reason": "..." },
  ...
}

Rules:
- Every requirement slot must appear in the output exactly once.
- pick_id MUST be a candidate_id from the provided list, or null if no candidate is compatible.
- Use pick_id: null generously — fabricating an id the user can't resolve is worse than "missing".
- Keep reasons concise (<= 120 chars). Cite the spec you matched on.`;

export function createAnthropicAccessoryPicker(
  client: Anthropic,
  opts: { model?: string } = {},
): AccessoryPickerClient {
  const model = opts.model ?? "claude-haiku-4-5-20251001";
  return {
    async pick(input: PickerInput): Promise<Record<string, RawPickResult>> {
      // Compact candidate shape so we stay well under the context budget.
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
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: all pass (157+).

- [ ] **Step 7: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/lib/hvac/accessory-picker.ts src/lib/hvac/accessory-picker-llm.ts src/lib/hvac/__tests__/accessory-picker.test.ts
git commit -m "feat(bom): AI accessory picker — Haiku-driven compatibility-aware selection with hallucination guard"
```

---

## Task 5: Wire `enrichBomWithAccessories` into the two generate paths

**Files:**
- Modify: `src/lib/estimates/regenerate-bom.ts`
- Modify: `src/hooks/use-estimator.ts`

- [ ] **Step 1: Wire into `regenerate-bom.ts`**

Read the file. Find the line `const bom = generateBOM(...)` (around line 79 in the current layout). After the `generateBOM` call + any quantity multipliers, insert the enrichment step:

```ts
import { anthropic } from "@/lib/anthropic";
import { enrichBomWithAccessories } from "@/lib/hvac/accessory-picker";
import { createAnthropicAccessoryPicker } from "@/lib/hvac/accessory-picker-llm";
```

Then AFTER `const bom = generateBOM(...)`:

```ts
  const picker = createAnthropicAccessoryPicker(anthropic);
  const enriched = await enrichBomWithAccessories(bom, activeCatalog, preferences, picker);

  // Replace BOM items (only wipe if we have new items to insert)
  if (enriched.items.length === 0) return { error: "BOM generation produced no items — catalog may be empty" };
```

…and use `enriched` instead of `bom` for the remaining persistence logic (`await supabase.from("estimate_bom_items").delete()...`, the insert, the totals recompute).

- [ ] **Step 2: Wire into `use-estimator.ts`**

Read `src/hooks/use-estimator.ts`. Find the `generateBom:` action (around line 384) and the `const bom = generateBOM(...)` call inside it. After the existing multi-unit multiplier block, before `set({ bom, step: "bom" });`, insert:

```ts
      // Phase 3: fill "missing" accessory slots via Haiku before we commit.
      const picker = createAnthropicAccessoryPicker(anthropic);
      const enriched = await enrichBomWithAccessories(bom, activeCatalog, preferences, picker);
      Object.assign(bom, enriched); // preserve identity for the set() below
```

Add imports at the top of the file:

```ts
import { anthropic } from "@/lib/anthropic";
import { enrichBomWithAccessories } from "@/lib/hvac/accessory-picker";
import { createAnthropicAccessoryPicker } from "@/lib/hvac/accessory-picker-llm";
```

Note: `@/lib/anthropic` is a server module (uses `ANTHROPIC_API_KEY`). This is already imported client-side in other files in the codebase? Verify by `grep -n "@/lib/anthropic" src/hooks/` — if this import isn't safe from the client, the enrichment call should move to a server action. If it IS safe (the current convention), proceed as above.

**If `@/lib/anthropic` is server-only**, instead of importing the Anthropic client directly in `use-estimator.ts`, extract the enrichment into a server action:
  - Create `src/lib/estimates/enrich-bom-action.ts` with `"use server"` and an async function `enrichBomViaAI(bom, catalog, preferences)`.
  - Call that from `use-estimator.ts` instead.

If unsure, go the server-action route — it's always safe.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: all pass. If the wizard-side test `use-estimator` mocks break, fix them by importing the real function and passing `undefined` for the client (falls back to the unchanged BOM).

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/estimates/regenerate-bom.ts src/hooks/use-estimator.ts src/lib/estimates/enrich-bom-action.ts 2>/dev/null || true
git commit -m "feat(bom): wire AI accessory enrichment into regenerate-bom + use-estimator flows"
```

(If you took the server-action branch, the `src/lib/estimates/enrich-bom-action.ts` file exists; the trailing `|| true` keeps `git add` quiet if not.)

---

## Task 6: Integration test — full BOM with classified accessories

**Files:**
- Modify: `src/lib/hvac/__tests__/bom-generator-vendor.test.ts` — add an end-to-end test

- [ ] **Step 1: Add the integration test**

Append to `src/lib/hvac/__tests__/bom-generator-vendor.test.ts`:

```ts
import { enrichBomWithAccessories, type AccessoryPickerClient } from "../accessory-picker";

describe("generateBOM + enrichBomWithAccessories end-to-end", () => {
  it("replaces a missing line set with a compatible LLM pick", async () => {
    // Major equipment catalog (what generateBOM picks from)
    const condenser = {
      id: "vendor:ac1",
      user_id: "",
      supplier_id: null,
      vendor_product_id: "ac1",
      mpn: "GSX160361",
      description: "3 Ton AC Condenser",
      equipment_type: "ac_condenser" as const,
      system_type: "universal" as const,
      brand: "Goodman",
      tonnage: 3,
      seer_rating: null,
      btu_capacity: null,
      stages: null,
      refrigerant_type: null,
      unit_price: 2000,
      unit_of_measure: "ea",
      source: "imported" as const,
      usage_count: 0,
      last_quoted_date: null,
      created_at: "",
      updated_at: "",
      bom_specs: { tonnage: 3, mca: 21, liquid_size: "3/8", suction_size: "7/8", refrigerant: "r410a" },
    };
    const lineSet = {
      ...condenser,
      id: "vendor:line1",
      mpn: "LS-3825",
      description: "3/8 x 7/8 Line Set 25ft",
      equipment_type: "refrigerant" as const,
      tonnage: null,
      bom_specs: { liquid_size: "3/8", suction_size: "7/8", length_ft: 25 },
    };
    const catalog = [condenser, lineSet];

    const bom = generateBOM([room(1500)], "mixed", "gas_ac", catalog);

    // Pre-enrichment: line set slot should be "missing" because the
    // current bom-generator's keyword search wouldn't find "25ft" in
    // the MPN "LS-3825" (actually it might — don't assume; just check
    // we have a line_set slot item at all).
    const lineSlotBefore = bom.items.find((i) => i.bom_slot === "line_set");
    expect(lineSlotBefore).toBeDefined();

    const client: AccessoryPickerClient = {
      pick: vi.fn().mockResolvedValue({
        line_set: { pick_id: "vendor:line1", reason: "3/8 x 7/8 matches condenser connections" },
      }),
    };
    const enriched = await enrichBomWithAccessories(bom, catalog, null, client);

    const lineSlotAfter = enriched.items.find((i) => i.bom_slot === "line_set");
    expect(lineSlotAfter?.partId).toBe("vendor:line1");
    expect(lineSlotAfter?.source).toBe("imported");
    expect(lineSlotAfter?.notes).toContain("3/8 x 7/8");
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/lib/hvac/__tests__/bom-generator-vendor.test.ts`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hvac/__tests__/bom-generator-vendor.test.ts
git commit -m "test(bom): end-to-end — generateBOM + accessory enrichment replaces missing line set"
```

---

## Task 7: Verify `bom_slot` doesn't leak into DB

**Files:**
- Read: `src/lib/estimates/bom-rows.ts` — confirm explicit-field selection

- [ ] **Step 1: Read the file and verify**

Run: `cat src/lib/estimates/bom-rows.ts`

Expected: `toBomInsertRows` returns an object literal with explicit fields (estimate_id, category, description, quantity, unit, unit_cost, total_cost, part_id, supplier, sku, notes, source). `bom_slot` is NOT in the list — good, it stays in memory only.

If `bom_slot` IS accidentally included, remove it.

- [ ] **Step 2: Add a belt-and-suspenders test**

Append to `src/lib/estimates/__tests__/bom-rows.test.ts` if that file exists, otherwise create it:

```ts
import { describe, it, expect } from "vitest";
import { toBomInsertRows } from "../bom-rows";
import type { BomItem } from "@/types/hvac";

describe("toBomInsertRows", () => {
  it("does not leak transient bom_slot field into the insert payload", () => {
    const item: BomItem = {
      partId: "x",
      name: "n",
      category: "c",
      qty: 1,
      unit: "ea",
      price: 10,
      supplier: "s",
      sku: "sku",
      notes: "",
      source: "imported",
      brand: "b",
      bom_slot: "line_set",
    };
    const [row] = toBomInsertRows([item], "estimate-id");
    expect(row).not.toHaveProperty("bom_slot");
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run src/lib/estimates/__tests__/bom-rows.test.ts`
Expected: pass.

- [ ] **Step 4: Commit if any new test was added**

```bash
git add src/lib/estimates/__tests__/bom-rows.test.ts 2>/dev/null || true
git commit --allow-empty -m "test(estimates): bom_slot is transient — doesn't reach estimate_bom_items" 2>/dev/null || true
```

(If no changes were needed, this step is a no-op — the trailing `|| true` keeps it quiet.)

---

## Task 8: Manual verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: Ready on localhost. `ANTHROPIC_API_KEY` must be set in `.env.local`.

- [ ] **Step 2: Open an estimate with classified vendor_products available**

Navigate to `/estimates/<id>` for any estimate that has rooms. Click "Regenerate BOM".

Expected: the Installation section (previously all "Missing") should now contain picks sourced from classified vendor_products with source = "Imported" badges. Some rows may still be "Missing" if no compatible candidates exist — that's the correct fallback.

- [ ] **Step 3: Check logs**

Look at the dev server terminal output. Expected: no errors from the accessory picker. If you see `[enrichBomWithAccessories] picker failed:` — the LLM call threw; check the error message (likely an invalid `ANTHROPIC_API_KEY` or a bad prompt).

- [ ] **Step 4: No commit — just capture findings**

If the picks look wrong (e.g., picks a 2.5-ton line set for a 3-ton condenser), note the case and open a follow-up issue to adjust the SYSTEM_PROMPT. Don't hand-patch the prompt inline without a representative sample (~10 failures).

---

## Self-review notes

- **Spec coverage:**
  - Type additions → Task 1 ✓
  - `bom_specs` propagation → Task 2 ✓
  - Slot tagging → Task 3 ✓
  - Pure picker + LLM client → Task 4 ✓
  - Integration → Task 5 ✓
  - E2E test → Task 6 ✓
  - DB isolation verified → Task 7 ✓
  - Manual verification → Task 8 ✓

- **Placeholder scan:** Every code step contains real code. The one open question — whether `@/lib/anthropic` is safe to import from client-side `use-estimator.ts` — is flagged with explicit handling (move to server action if unsafe). Commands have expected output.

- **Type consistency:** `BomSlot`, `AccessoryPickerClient`, `PickerInput`, `MajorEquipmentContext`, `AccessoryRequirement`, `RawPickResult`, `PickedAccessory` are all defined in Task 4 and referenced consistently in Tasks 5–8. The `import("@/lib/hvac/bom-slot-taxonomy").BomSlot` form used in `BomItem` (Task 1) avoids a circular import with `hvac.ts`.

- **Dependency order:** Tasks are sequential. Task 1 adds types; Task 2 uses them; Task 3 emits the new field; Task 4 consumes it; Task 5 wires into callers; Task 6 tests end-to-end; Task 7 verifies isolation; Task 8 is manual.

- **Risks noted for follow-ups:**
  1. The `classifierSlotMatches` helper uses `SLOT_TO_EQUIPMENT_TYPE` which is many-to-one (several slots map to the same equipment_type). That means candidate lists may include wrong-slot items (e.g., a line set candidate list might accept any "refrigerant" equipment_type row, including bulk refrigerant). Fix in a follow-up by either (a) storing `bom_slot` directly on vendor_products selects, or (b) adding a `bom_slot` field to `CatalogItem` itself (currently the adapter doesn't preserve it).
  2. `use-estimator.ts` running the Anthropic client directly from browser is explicitly flagged — prefer the server-action route unless verified safe.
  3. The system prompt doesn't yet distinguish "this contractor already owns this brand" signals beyond the brands array. Good enough for v1.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-16-bom-phase-3-accessory-selector.md`.
