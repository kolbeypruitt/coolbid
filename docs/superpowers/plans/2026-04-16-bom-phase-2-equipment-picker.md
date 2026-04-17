# BOM Phase 2 — Major Equipment Picker UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (batch execution with checkpoints, this session) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert a new wizard step between "rooms" and "bom" where the contractor selects major equipment (condenser, furnace/air-handler, coil, thermostat, heat strips) from filtered-by-tonnage candidates. Selections drive BOM generation (auto-pick becomes the fallback for skipped slots) and feed the AI accessory picker with ground-truth specs. Selections persist on `estimates.selected_equipment` so regenerations respect them.

**Architecture:**
1. New wizard step `equipment` inserted into `STEP_ORDER` between `rooms` and `bom`. Zustand gains `selectedEquipment: Partial<Record<BomSlot, string>>` (slot → `CatalogItem.id`) plus `setSelectedEquipment(slot, id)` / `clearSelectedEquipment(slot)`.
2. A pure filtering module (`src/lib/hvac/equipment-candidates.ts`) returns the top-N candidates for a given `(slot, tonnage, preferences, systemType)` tuple from the loaded catalog.
3. Three React components: `EquipmentStep` (step container), `EquipmentSlotPicker` (per-slot card + candidate list), `EquipmentCandidateRow` (one candidate with image + specs + price).
4. `generateBOM` gets a new optional `selectedEquipmentIds?: Partial<Record<BomSlot, string>>` param. For each major slot, it uses the user's pick first and only falls back to `findCatalogItem` if the user didn't pick or the picked id isn't in the catalog.
5. Persistence: `estimates.selected_equipment jsonb` stores the map. `bom-step.tsx` `handleFinish` writes it on save. `regenerate-bom.ts` reads it back and passes it to `generateBOM`. `use-estimator.ts` hydrates it when resuming a draft.

**Tech Stack:** Next.js 16 App Router, React 19, shadcn/ui (Card, Button, Badge, Separator already in the repo), Zustand, Supabase, Vitest.

**Out of scope:**
- Editing selections from the estimate detail page (post-save). For v1, users go back through the wizard to change major equipment. Can add an "Edit Equipment" button later.
- Brand/price filter UI within a slot. The candidate list is pre-sorted by contractor preferences + usage_count + price; we don't add in-slot filters or search.
- Images: vendor_products has `image_url`; equipment_catalog doesn't. We render images when present, a neutral placeholder otherwise.
- Multi-unit differentiation. Per the existing multi-unit multiplier, the same equipment selection applies to all identical units.

---

## File structure

**Create:**
- `supabase/migrations/<timestamp>_estimates_selected_equipment.sql` — add `selected_equipment jsonb` column to `estimates`
- `src/lib/hvac/equipment-candidates.ts` — pure filtering + ranking logic
- `src/lib/hvac/__tests__/equipment-candidates.test.ts`
- `src/components/estimator/equipment-step.tsx` — step container
- `src/components/estimator/equipment-slot-picker.tsx` — per-slot card
- `src/components/estimator/equipment-candidate-row.tsx` — one candidate display

**Modify:**
- `src/types/database.ts` — add `selected_equipment` to estimates Row/Insert
- `src/hooks/use-estimator.ts` — new state, new actions, new step "equipment" in `STEP_ORDER`, load/persist `selected_equipment`
- `src/lib/hvac/bom-generator.ts` — accept `selectedEquipmentIds` param; prefer user's picks over auto-match
- `src/lib/estimates/regenerate-bom.ts` — fetch `selected_equipment` from estimates, pass to `generateBOM`
- `src/components/estimator/bom-step.tsx` `handleFinish` — persist `selected_equipment` to the estimate row
- `src/app/(app)/estimates/new/page.tsx` — add `EquipmentStep` rendering + step-indicator entry

---

## Task 1: Schema migration + type additions

**Files:**
- Create: `supabase/migrations/<NEXT_TIMESTAMP>_estimates_selected_equipment.sql` — use `20260416120000` or a later timestamp to sort after existing migrations
- Modify: `src/types/database.ts`

- [ ] **Step 1: Write the migration**

Pick a timestamp after the latest (most recent is `20260401070000`). Use `20260416120000_estimates_selected_equipment.sql`:

```sql
-- 20260416120000_estimates_selected_equipment.sql
-- Phase 2: store the contractor's major-equipment selections so BOM
-- regeneration respects them. Shape: { [bom_slot]: catalog_item_id }.
-- Slots that aren't present fall back to generateBOM's auto-matcher.
alter table public.estimates
  add column if not exists selected_equipment jsonb not null default '{}'::jsonb;

comment on column public.estimates.selected_equipment is
  'Map of BomSlot → CatalogItem.id for contractor-selected major equipment. See src/lib/hvac/bom-slot-taxonomy.ts for slot values.';
```

- [ ] **Step 2: Apply migration**

Run: `supabase db push`
Expected: applied successfully; no errors.

- [ ] **Step 3: Update `src/types/database.ts`**

Read the file, find the `estimates` table type (search for `estimates: {`). In the `Row` block, add after the last existing field (preserve existing fields):

```ts
          selected_equipment: Record<string, string>;
```

In the `Insert` block, add (optional with default):

```ts
          selected_equipment?: Record<string, string>;
```

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260416120000_estimates_selected_equipment.sql src/types/database.ts
git commit -m "feat(db): add estimates.selected_equipment jsonb for Phase 2 equipment picker"
```

---

## Task 2: Pure candidate-filtering module

**Files:**
- Create: `src/lib/hvac/equipment-candidates.ts`
- Create: `src/lib/hvac/__tests__/equipment-candidates.test.ts`

This module exposes `findEquipmentCandidates({ catalog, slot, targetTonnage, systemType, preferences, limit })` → `CatalogItem[]`. Behavior:
- Filter by `equipment_type === SLOT_TO_EQUIPMENT_TYPE[slot]` AND `system_type === "universal" || system_type === currentSystemType`
- If `targetTonnage` is provided, keep items whose `tonnage` is either null OR within ±0.5 of the target (null tonnage = "might be compatible, show it near the bottom")
- Sort in order: exact-tonnage match first, then brand-preference match, then `usage_count` desc, then `unit_price` asc (nulls last)
- Return top `limit` (default 10)

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/hvac/__tests__/equipment-candidates.test.ts
import { describe, it, expect } from "vitest";
import { findEquipmentCandidates } from "../equipment-candidates";
import type { CatalogItem } from "@/types/catalog";

function item(over: Partial<CatalogItem>): CatalogItem {
  return {
    id: "c1",
    user_id: "",
    supplier_id: null,
    vendor_product_id: null,
    mpn: "",
    description: "",
    equipment_type: "ac_condenser",
    system_type: "universal",
    brand: "",
    tonnage: null,
    seer_rating: null,
    btu_capacity: null,
    stages: null,
    refrigerant_type: null,
    unit_price: null,
    unit_of_measure: "ea",
    source: "manual",
    usage_count: 0,
    last_quoted_date: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("findEquipmentCandidates", () => {
  it("filters by equipment_type derived from slot", () => {
    const catalog = [
      item({ id: "a", equipment_type: "ac_condenser", tonnage: 3 }),
      item({ id: "b", equipment_type: "gas_furnace", btu_capacity: 80000 }),
    ];
    const out = findEquipmentCandidates({
      catalog,
      slot: "ac_condenser",
      targetTonnage: 3,
      systemType: "gas_ac",
      preferences: null,
    });
    expect(out.map((c) => c.id)).toEqual(["a"]);
  });

  it("filters by tonnage within ±0.5 of target", () => {
    const catalog = [
      item({ id: "exact", equipment_type: "ac_condenser", tonnage: 3 }),
      item({ id: "close", equipment_type: "ac_condenser", tonnage: 2.5 }),
      item({ id: "far", equipment_type: "ac_condenser", tonnage: 5 }),
    ];
    const out = findEquipmentCandidates({
      catalog,
      slot: "ac_condenser",
      targetTonnage: 3,
      systemType: "gas_ac",
      preferences: null,
    });
    expect(out.map((c) => c.id).sort()).toEqual(["close", "exact"]);
  });

  it("keeps items with null tonnage (ranked after tonnage-matching ones)", () => {
    const catalog = [
      item({ id: "untyped", equipment_type: "ac_condenser", tonnage: null }),
      item({ id: "exact", equipment_type: "ac_condenser", tonnage: 3 }),
    ];
    const out = findEquipmentCandidates({
      catalog,
      slot: "ac_condenser",
      targetTonnage: 3,
      systemType: "gas_ac",
      preferences: null,
    });
    expect(out[0].id).toBe("exact");
    expect(out.map((c) => c.id)).toContain("untyped");
  });

  it("respects system_type: matches target or universal", () => {
    const catalog = [
      item({ id: "universal", equipment_type: "ac_condenser", tonnage: 3, system_type: "universal" }),
      item({ id: "gas_ac", equipment_type: "ac_condenser", tonnage: 3, system_type: "gas_ac" }),
      item({ id: "hp_only", equipment_type: "ac_condenser", tonnage: 3, system_type: "heat_pump" }),
    ];
    const out = findEquipmentCandidates({
      catalog,
      slot: "ac_condenser",
      targetTonnage: 3,
      systemType: "gas_ac",
      preferences: null,
    });
    expect(out.map((c) => c.id).sort()).toEqual(["gas_ac", "universal"]);
  });

  it("ranks brand-preference matches ahead of non-matches at same tonnage", () => {
    const catalog = [
      item({ id: "goodman", equipment_type: "ac_condenser", tonnage: 3, brand: "Goodman", usage_count: 10 }),
      item({ id: "carrier", equipment_type: "ac_condenser", tonnage: 3, brand: "Carrier", usage_count: 5 }),
    ];
    const out = findEquipmentCandidates({
      catalog,
      slot: "ac_condenser",
      targetTonnage: 3,
      systemType: "gas_ac",
      preferences: { equipment_brands: ["Carrier"] },
    });
    expect(out[0].id).toBe("carrier");
  });

  it("falls back to usage_count desc when no brand preference match", () => {
    const catalog = [
      item({ id: "rare", equipment_type: "ac_condenser", tonnage: 3, brand: "Trane", usage_count: 1 }),
      item({ id: "common", equipment_type: "ac_condenser", tonnage: 3, brand: "Goodman", usage_count: 20 }),
    ];
    const out = findEquipmentCandidates({
      catalog,
      slot: "ac_condenser",
      targetTonnage: 3,
      systemType: "gas_ac",
      preferences: null,
    });
    expect(out[0].id).toBe("common");
  });

  it("handles thermostat slot (no tonnage filter)", () => {
    const catalog = [
      item({ id: "smart", equipment_type: "thermostat", brand: "Ecobee" }),
      item({ id: "simple", equipment_type: "thermostat", brand: "Honeywell" }),
    ];
    const out = findEquipmentCandidates({
      catalog,
      slot: "thermostat",
      targetTonnage: null,
      systemType: "gas_ac",
      preferences: { thermostat_brand: "Honeywell" },
    });
    expect(out[0].id).toBe("simple");
  });

  it("limits results to the `limit` parameter", () => {
    const catalog = Array.from({ length: 20 }, (_, i) =>
      item({ id: `c${i}`, equipment_type: "ac_condenser", tonnage: 3 }),
    );
    const out = findEquipmentCandidates({
      catalog,
      slot: "ac_condenser",
      targetTonnage: 3,
      systemType: "gas_ac",
      preferences: null,
      limit: 5,
    });
    expect(out).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/hvac/__tests__/equipment-candidates.test.ts`
Expected: cannot-find-module `../equipment-candidates`.

- [ ] **Step 3: Implement `src/lib/hvac/equipment-candidates.ts`**

```ts
import type { CatalogItem, SystemType } from "@/types/catalog";
import type { ContractorPreferences } from "@/types/contractor-preferences";
import { SLOT_TO_EQUIPMENT_TYPE, type BomSlot } from "./bom-slot-taxonomy";

export type FindCandidatesInput = {
  catalog: CatalogItem[];
  slot: BomSlot;
  targetTonnage: number | null;
  systemType: SystemType;
  preferences: ContractorPreferences | null;
  limit?: number;
};

const DEFAULT_LIMIT = 10;
const TONNAGE_TOLERANCE = 0.5;

/**
 * Returns a ranked list of compatible catalog candidates for a major-equipment
 * slot. Ranking: exact-tonnage match > brand-preference match > usage_count
 * desc > unit_price asc (nulls last). Use with the Phase 2 equipment picker UI.
 */
export function findEquipmentCandidates({
  catalog,
  slot,
  targetTonnage,
  systemType,
  preferences,
  limit = DEFAULT_LIMIT,
}: FindCandidatesInput): CatalogItem[] {
  const targetEquipmentType = SLOT_TO_EQUIPMENT_TYPE[slot];

  const preferredBrands = (
    slot === "thermostat" && preferences?.thermostat_brand
      ? [preferences.thermostat_brand]
      : (preferences?.equipment_brands ?? [])
  )
    .map((b) => b?.toLowerCase().trim())
    .filter((b): b is string => Boolean(b));

  const filtered = catalog.filter((item) => {
    if (item.equipment_type !== targetEquipmentType) return false;
    if (item.system_type !== "universal" && item.system_type !== systemType)
      return false;
    if (targetTonnage !== null && item.tonnage !== null) {
      if (Math.abs(item.tonnage - targetTonnage) > TONNAGE_TOLERANCE) return false;
    }
    return true;
  });

  const scored = filtered.map((item) => {
    const brand = item.brand?.toLowerCase() ?? "";
    const brandMatch = brand !== "" && preferredBrands.includes(brand);
    const tonnageExact =
      targetTonnage !== null &&
      item.tonnage !== null &&
      Math.abs(item.tonnage - targetTonnage) < 0.01;
    return { item, brandMatch, tonnageExact };
  });

  scored.sort((a, b) => {
    // Exact tonnage match first
    if (a.tonnageExact !== b.tonnageExact) return a.tonnageExact ? -1 : 1;
    // Brand preference next
    if (a.brandMatch !== b.brandMatch) return a.brandMatch ? -1 : 1;
    // Usage count desc
    if (a.item.usage_count !== b.item.usage_count) {
      return b.item.usage_count - a.item.usage_count;
    }
    // Price asc (nulls last)
    const pa = a.item.unit_price;
    const pb = b.item.unit_price;
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return pa - pb;
  });

  return scored.slice(0, limit).map((s) => s.item);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/hvac/__tests__/equipment-candidates.test.ts`
Expected: 8/8 pass.

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/hvac/equipment-candidates.ts src/lib/hvac/__tests__/equipment-candidates.test.ts
git commit -m "feat(hvac): findEquipmentCandidates — filter+rank catalog for Phase 2 picker"
```

---

## Task 3: Zustand state + new wizard step

**Files:**
- Modify: `src/hooks/use-estimator.ts`

- [ ] **Step 1: Read the file**

Run: `cat src/hooks/use-estimator.ts`
Note the current `EstimatorStep` union, the `STEP_ORDER` array, the state shape, and how existing actions are structured.

- [ ] **Step 2: Add "equipment" to EstimatorStep union and STEP_ORDER**

Replace the existing type at line ~16:

```ts
type EstimatorStep = "customer" | "upload" | "select_pages" | "analyzing" | "rooms" | "equipment" | "bom";
```

Replace the existing `STEP_ORDER` at ~line 127:

```ts
const STEP_ORDER: EstimatorStep[] = ["customer", "upload", "select_pages", "analyzing", "rooms", "equipment", "bom"];
```

- [ ] **Step 3: Add selectedEquipment to state**

Find the `EstimatorState` type definition. Add the field alongside other state fields (right after `rooms: Room[];` is a clean spot):

```ts
  selectedEquipment: Partial<Record<import("@/lib/hvac/bom-slot-taxonomy").BomSlot, string>>;
```

In `initialState()`, add:

```ts
    selectedEquipment: {},
```

- [ ] **Step 4: Add actions**

In the `EstimatorActions` type, add:

```ts
  setSelectedEquipment: (slot: import("@/lib/hvac/bom-slot-taxonomy").BomSlot, id: string) => void;
  clearSelectedEquipment: (slot: import("@/lib/hvac/bom-slot-taxonomy").BomSlot) => void;
```

In the store's action implementations (alongside `setSelectedRoomIndex`):

```ts
  setSelectedEquipment: (slot, id) =>
    set((state) => ({
      selectedEquipment: { ...state.selectedEquipment, [slot]: id },
    })),

  clearSelectedEquipment: (slot) =>
    set((state) => {
      const { [slot]: _removed, ...rest } = state.selectedEquipment;
      return { selectedEquipment: rest };
    }),
```

- [ ] **Step 5: Pass selectedEquipment into generateBom**

Find the `generateBom: async () => {` action (around line 384). In the destructuring line at the top, add `selectedEquipment`:

```ts
const { rooms, climateZone, systemType, analysisResult, knownUnits, hvacPerUnit, identicalUnits, estimateId, selectedEquipment } = get();
```

Then pass it to the existing `generateBOM(...)` call as the new parameter we'll add in Task 5. For now, add the parameter to the call so Task 5's change is a pure implementation step (TypeScript will complain until Task 5 lands — that's expected):

Find the existing call (around line 414):

```ts
      const bom = generateBOM(
        rooms,
        climateZone,
        systemType,
        activeCatalog,
        analysisResult?.building,
        analysisResult?.hvac_notes,
        preferences,
      );
```

Change to:

```ts
      const bom = generateBOM(
        rooms,
        climateZone,
        systemType,
        activeCatalog,
        analysisResult?.building,
        analysisResult?.hvac_notes,
        preferences,
        selectedEquipment,
      );
```

(If TypeScript errors here, that's expected — it's satisfied after Task 5.)

- [ ] **Step 6: Add a `resumeFromDb` loader action to hydrate `selectedEquipment`**

We don't have an explicit "resume draft" flow for selectedEquipment, but `createDraft` already creates a new row. For editing an existing estimate via the wizard (rare today), selectedEquipment would hydrate via the same path we'll add to `regenerate-bom.ts` in Task 6. For the wizard's happy path (new estimate), `selectedEquipment` starts empty and is built up as the user clicks picker cards. No extra loader needed in this task.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/use-estimator.ts
git commit -m "feat(estimator): selectedEquipment state + equipment step in wizard order"
```

Note: the `bom = generateBOM(..., selectedEquipment)` call will be unresolved by TypeScript until Task 5. Don't merge this commit alone — it's part of a sequence.

---

## Task 4: Equipment picker UI components

**Files:**
- Create: `src/components/estimator/equipment-candidate-row.tsx`
- Create: `src/components/estimator/equipment-slot-picker.tsx`
- Create: `src/components/estimator/equipment-step.tsx`

- [ ] **Step 1: `EquipmentCandidateRow`**

```tsx
// src/components/estimator/equipment-candidate-row.tsx
"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { CatalogItem } from "@/types/catalog";

type Props = {
  item: CatalogItem;
  selected: boolean;
  onSelect: () => void;
};

function formatPrice(price: number | null): string {
  if (price === null) return "—";
  return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatSpec(label: string, value: string | number | null): string | null {
  if (value === null || value === undefined || value === "") return null;
  return `${label} ${value}`;
}

export function EquipmentCandidateRow({ item, selected, onSelect }: Props) {
  const vendorImage =
    (item as unknown as { image_url?: string | null }).image_url ?? null;

  const specs = [
    item.tonnage !== null ? `${item.tonnage}T` : null,
    formatSpec("SEER", item.seer_rating),
    item.refrigerant_type,
    item.stages ? `${item.stages}-stage` : null,
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
        "hover:bg-[rgba(6,182,212,0.05)] focus:outline-none focus:ring-2 focus:ring-accent",
        selected
          ? "border-accent bg-[rgba(6,182,212,0.08)] shadow-[0_0_18px_rgba(6,182,212,0.12)]"
          : "border-border bg-bg-card/60",
      )}
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-bg-elevated">
        {vendorImage ? (
          <Image src={vendorImage} alt="" fill className="object-cover" sizes="48px" unoptimized />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-txt-primary">
            {item.description || item.mpn || "Unnamed"}
          </span>
          {item.source === "quote" && (
            <Badge className="bg-success-bg text-success border-none text-[10px]">Quoted</Badge>
          )}
          {item.source === "imported" && (
            <Badge className="bg-cool-blue-glow text-cool-blue-light border-none text-[10px]">
              Imported
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-txt-tertiary">
          {item.brand && <span className="truncate">{item.brand}</span>}
          {specs.length > 0 && (
            <span className="truncate">{specs.join(" · ")}</span>
          )}
          {item.mpn && <span className="font-mono text-[10px]">{item.mpn}</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold text-txt-primary tabular-nums">
          {formatPrice(item.unit_price)}
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: `EquipmentSlotPicker`**

```tsx
// src/components/estimator/equipment-slot-picker.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EquipmentCandidateRow } from "./equipment-candidate-row";
import type { CatalogItem } from "@/types/catalog";
import type { BomSlot } from "@/lib/hvac/bom-slot-taxonomy";

type Props = {
  slot: BomSlot;
  label: string;
  description?: string;
  candidates: CatalogItem[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onClear: () => void;
};

export function EquipmentSlotPicker({
  label,
  description,
  candidates,
  selectedId,
  onSelect,
  onClear,
}: Props) {
  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-txt-primary">{label}</CardTitle>
          {description && (
            <p className="mt-1 text-xs text-txt-tertiary">{description}</p>
          )}
        </div>
        {selectedId && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {candidates.length === 0 ? (
          <p className="text-sm text-txt-secondary">
            No catalog items match this tonnage. The BOM generator will flag this
            slot as Missing; upload a supplier quote or link a supplier to fill it.
          </p>
        ) : (
          candidates.map((item) => (
            <EquipmentCandidateRow
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              onSelect={() => onSelect(item.id)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: `EquipmentStep` — the container**

```tsx
// src/components/estimator/equipment-step.tsx
"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEstimator } from "@/hooks/use-estimator";
import { createClient } from "@/lib/supabase/client";
import { loadBomCatalog } from "@/lib/estimates/load-bom-catalog";
import { findEquipmentCandidates } from "@/lib/hvac/equipment-candidates";
import { SYSTEM_TYPE_EQUIPMENT, EQUIPMENT_TYPE_LABELS } from "@/types/catalog";
import type { CatalogItem } from "@/types/catalog";
import { calculateRoomLoad, calculateSystemTonnage } from "@/lib/hvac/load-calc";
import type { BomSlot } from "@/lib/hvac/bom-slot-taxonomy";
import { EquipmentSlotPicker } from "./equipment-slot-picker";
import type { ContractorPreferences } from "@/types/contractor-preferences";

const EQUIPMENT_LABELS: Partial<Record<BomSlot, string>> = {
  ac_condenser: "AC Condenser",
  heat_pump_condenser: "Heat Pump Condenser",
  gas_furnace: "Gas Furnace",
  air_handler: "Air Handler",
  evap_coil: "Evaporator Coil",
  heat_strips: "Heat Strips",
  thermostat: "Thermostat",
};

export function EquipmentStep() {
  const {
    rooms,
    climateZone,
    systemType,
    selectedEquipment,
    setStep,
    setSelectedEquipment,
    clearSelectedEquipment,
  } = useEstimator();

  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [preferences, setPreferences] = useState<ContractorPreferences | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load the catalog + contractor preferences once when the step mounts.
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setCatalog([]);
          return;
        }
        const [cat, { data: prefsRow }] = await Promise.all([
          loadBomCatalog(supabase, user.id),
          supabase.from("profiles").select("contractor_preferences").eq("id", user.id).single(),
        ]);
        setCatalog(cat);
        setPreferences(
          (prefsRow?.contractor_preferences as ContractorPreferences | null) ?? null,
        );
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load catalog");
        setCatalog([]);
      }
    })();
  }, []);

  // Compute required tonnage from room loads (same calc used by generateBOM).
  const totalBTU = rooms.reduce(
    (sum, r) => sum + calculateRoomLoad(r, climateZone).btu,
    0,
  );
  const tonnage = Math.max(calculateSystemTonnage(totalBTU), 2);
  const designBTU = Math.ceil(totalBTU * 1.1);

  // SYSTEM_TYPE_EQUIPMENT gives the major-equipment EquipmentTypes for the
  // selected system. We also always include thermostat. The list uses
  // EquipmentType string values that match BomSlot names for all major slots.
  const requiredSlots: BomSlot[] = [
    ...(SYSTEM_TYPE_EQUIPMENT[systemType] as BomSlot[]),
    "thermostat",
  ];

  if (loadError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">Failed to load catalog: {loadError}</p>
        <Button variant="outline" onClick={() => setStep("rooms")}>
          Back to Rooms
        </Button>
      </div>
    );
  }

  if (catalog === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-txt-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading catalog…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-card border-b-accent shadow-[0_0_24px_rgba(6,182,212,0.06)]">
        <CardHeader>
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary">
            Sizing
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-txt-tertiary">
              System Size
            </div>
            <div className="text-2xl font-bold text-txt-primary">{tonnage}T</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-txt-tertiary">
              Design BTU
            </div>
            <div className="text-2xl font-bold text-txt-primary">
              {designBTU.toLocaleString()}
            </div>
          </div>
        </CardContent>
      </Card>

      {requiredSlots.map((slot) => {
        const label = EQUIPMENT_LABELS[slot] ?? EQUIPMENT_TYPE_LABELS[slot] ?? slot;
        const isThermostat = slot === "thermostat";
        const candidates = findEquipmentCandidates({
          catalog,
          slot,
          targetTonnage: isThermostat ? null : tonnage,
          systemType,
          preferences,
          limit: 10,
        });

        return (
          <EquipmentSlotPicker
            key={slot}
            slot={slot}
            label={label}
            description={
              isThermostat
                ? undefined
                : `Tonnage: ${tonnage}T target (±0.5T)`
            }
            candidates={candidates}
            selectedId={selectedEquipment[slot]}
            onSelect={(id) => setSelectedEquipment(slot, id)}
            onClear={() => clearSelectedEquipment(slot)}
          />
        );
      })}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button variant="outline" onClick={() => setStep("rooms")}>
          Back to Rooms
        </Button>
        <Button onClick={() => setStep("bom")} className="bg-gradient-brand hover-lift">
          Continue to BOM
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire into the wizard page**

Modify `src/app/(app)/estimates/new/page.tsx`. Add the import:

```tsx
import { EquipmentStep } from "@/components/estimator/equipment-step";
```

In the `STEPS` array, insert before `{ key: "bom", label: "BOM" }`:

```tsx
  { key: "equipment", label: "Equipment" },
```

In the render section, add before `{step === "bom" && <BomStep />}`:

```tsx
      {step === "equipment" && <EquipmentStep />}
```

- [ ] **Step 5: Route the "Next" button from rooms-step to "equipment"**

Read `src/components/estimator/rooms-step.tsx`. Find the action that moves forward (likely a call to `setStep("bom")` or `nextStep()`). If it's `nextStep()`, no change needed — `STEP_ORDER` handles it. If it's `setStep("bom")`, change to `setStep("equipment")`.

- [ ] **Step 6: Route the "generate BOM" action to read from selectedEquipment**

This is already done in Task 3 step 5 — `generateBom` now passes `selectedEquipment` to `generateBOM`.

- [ ] **Step 7: Type check**

Run: `npx tsc --noEmit`
Expected: one error — `generateBOM` doesn't accept an 8th parameter yet. Task 5 fixes this.

- [ ] **Step 8: Commit**

```bash
git add src/components/estimator/equipment-candidate-row.tsx \
        src/components/estimator/equipment-slot-picker.tsx \
        src/components/estimator/equipment-step.tsx \
        src/app/\(app\)/estimates/new/page.tsx \
        src/components/estimator/rooms-step.tsx
git commit -m "feat(estimator): equipment picker UI — step + slot pickers + candidate rows"
```

---

## Task 5: `generateBOM` accepts selectedEquipmentIds

**Files:**
- Modify: `src/lib/hvac/bom-generator.ts`

- [ ] **Step 1: Extend `generateBOM` signature**

Read `src/lib/hvac/bom-generator.ts`. Find the `generateBOM` signature (around line 158). Change to:

```ts
export function generateBOM(
  rooms: Room[],
  climateZone: ClimateZoneKey,
  systemType: SystemType,
  catalog: CatalogItem[],
  building?: BuildingInfo,
  hvacNotes?: HvacNotes,
  preferences?: ContractorPreferences | null,
  selectedEquipmentIds?: Partial<Record<import("./bom-slot-taxonomy").BomSlot, string>>,
): BomResult {
```

- [ ] **Step 2: Use selectedEquipmentIds in the major-equipment loop**

Find the major-equipment loop (around line 203):

```ts
  for (const eqType of equipmentTypes) {
    const isThermostat = eqType === "thermostat";
    const qty = isThermostat ? zones : 1;
    const searchTonnage = isThermostat ? null : equipTonnage;
    const found = findCatalogItem(
      catalog, eqType, searchTonnage, systemType,
      isThermostat ? tstatBrands : brands,
    );
    if (found) {
      items.push(catalogToBomItem(found.item, qty, found.notes, eqType as BomSlot));
    } else {
      const label = isThermostat
        ? (EQUIPMENT_TYPE_LABELS[eqType] ?? eqType)
        : `${equipTonnage}T ${EQUIPMENT_TYPE_LABELS[eqType] ?? eqType}`;
      items.push(missingItem(eqType, label, qty, undefined, eqType as BomSlot));
    }
  }
```

Change to:

```ts
  for (const eqType of equipmentTypes) {
    const isThermostat = eqType === "thermostat";
    const qty = isThermostat ? zones : 1;
    const searchTonnage = isThermostat ? null : equipTonnage;
    const slot = eqType as BomSlot;

    // Prefer the contractor's explicit selection if one exists and the
    // item is still in the catalog. Fall back to auto-matching.
    const selectedId = selectedEquipmentIds?.[slot];
    let selectedCatalogItem: CatalogItem | undefined;
    if (selectedId) {
      selectedCatalogItem = catalog.find((c) => c.id === selectedId);
    }

    if (selectedCatalogItem) {
      items.push(
        catalogToBomItem(
          selectedCatalogItem,
          qty,
          "User-selected equipment",
          slot,
        ),
      );
      continue;
    }

    const found = findCatalogItem(
      catalog, eqType, searchTonnage, systemType,
      isThermostat ? tstatBrands : brands,
    );
    if (found) {
      items.push(catalogToBomItem(found.item, qty, found.notes, slot));
    } else {
      const label = isThermostat
        ? (EQUIPMENT_TYPE_LABELS[eqType] ?? eqType)
        : `${equipTonnage}T ${EQUIPMENT_TYPE_LABELS[eqType] ?? eqType}`;
      items.push(missingItem(eqType, label, qty, undefined, slot));
    }
  }
```

- [ ] **Step 3: Add the BomSlot import at the top if not already present**

Find the imports block (lines 1-6). If `BomSlot` isn't imported, add:

```ts
import type { BomSlot } from "./bom-slot-taxonomy";
```

(The existing `catalogToBomItem` already uses `BomSlot` from Phase 3, so this may already exist.)

- [ ] **Step 4: Unit test the selection path**

Append to `src/lib/hvac/__tests__/bom-generator-vendor.test.ts`:

```ts
describe("generateBOM with user-selected major equipment", () => {
  it("uses the selected catalog item instead of auto-matching", () => {
    const catalog = [
      {
        id: "user-pick",
        user_id: "",
        supplier_id: null,
        vendor_product_id: null,
        mpn: "USER-AC",
        description: "Contractor's preferred AC",
        equipment_type: "ac_condenser" as const,
        system_type: "universal" as const,
        brand: "Trane",
        tonnage: 3,
        seer_rating: null,
        btu_capacity: null,
        stages: null,
        refrigerant_type: null,
        unit_price: 3500,
        unit_of_measure: "ea",
        source: "quote" as const,
        usage_count: 0,
        last_quoted_date: null,
        created_at: "",
        updated_at: "",
      },
      {
        id: "auto-match-goodman",
        user_id: "",
        supplier_id: null,
        vendor_product_id: null,
        mpn: "GSX160361",
        description: "Goodman 3T",
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
        usage_count: 100,
        last_quoted_date: null,
        created_at: "",
        updated_at: "",
      },
    ];
    const bom = generateBOM(
      [room(1500)],
      "mixed",
      "gas_ac",
      catalog,
      undefined,
      undefined,
      null,
      { ac_condenser: "user-pick" },
    );
    const acRow = bom.items.find(
      (i) => i.category === "Major Equipment" && i.name.includes("preferred AC"),
    );
    expect(acRow?.partId).toBe("user-pick");
    expect(acRow?.brand).toBe("Trane");
  });

  it("falls back to auto-match when selectedEquipmentIds doesn't name a slot", () => {
    const catalog = [
      {
        id: "auto",
        user_id: "",
        supplier_id: null,
        vendor_product_id: null,
        mpn: "AUTO",
        description: "Auto-matched",
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
        usage_count: 10,
        last_quoted_date: null,
        created_at: "",
        updated_at: "",
      },
    ];
    const bom = generateBOM(
      [room(1500)],
      "mixed",
      "gas_ac",
      catalog,
      undefined,
      undefined,
      null,
      {}, // no selection
    );
    const acRow = bom.items.find((i) => i.bom_slot === "ac_condenser");
    expect(acRow?.partId).toBe("auto");
  });

  it("falls back to auto-match when the selected id isn't in the catalog", () => {
    const catalog = [
      {
        id: "auto",
        user_id: "",
        supplier_id: null,
        vendor_product_id: null,
        mpn: "AUTO",
        description: "Auto-matched",
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
        usage_count: 10,
        last_quoted_date: null,
        created_at: "",
        updated_at: "",
      },
    ];
    const bom = generateBOM(
      [room(1500)],
      "mixed",
      "gas_ac",
      catalog,
      undefined,
      undefined,
      null,
      { ac_condenser: "stale-id-no-longer-in-catalog" },
    );
    const acRow = bom.items.find((i) => i.bom_slot === "ac_condenser");
    expect(acRow?.partId).toBe("auto");
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/hvac/__tests__/bom-generator-vendor.test.ts`
Expected: all pass.

- [ ] **Step 6: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0 (Task 3's trailing error from the 8th-param call is now resolved).

- [ ] **Step 7: Commit**

```bash
git add src/lib/hvac/bom-generator.ts src/lib/hvac/__tests__/bom-generator-vendor.test.ts
git commit -m "feat(bom): generateBOM honors contractor's selectedEquipmentIds before auto-match"
```

---

## Task 6: Persistence — save on finish, load on regenerate

**Files:**
- Modify: `src/components/estimator/bom-step.tsx`
- Modify: `src/lib/estimates/regenerate-bom.ts`
- Modify: `src/hooks/use-estimator.ts` (add `selectedEquipment` to the fields written by `handleFinish`)

- [ ] **Step 1: Persist `selected_equipment` in `handleFinish`**

Read `src/components/estimator/bom-step.tsx`. Find `handleFinish` — specifically the `.update({ ... })` call on the `estimates` table. Add `selected_equipment: selectedEquipment` to the payload.

Pull the field from the estimator hook at the top of `BomStep`:

```tsx
  const {
    bom, rooms, estimateId,
    profitMargin, laborRate, laborHours,
    projectName, customerName, jobAddress, customerEmail, customerPhone,
    supplierName, climateZone, systemType,
    knownTotalSqft, knownUnits, hvacPerUnit,
    selectedEquipment,     // ← add this
    setFinancials, setProjectInfo, setStep, setError,
  } = useEstimator();
```

In the `handleFinish` `.update({...})` block, add alongside `system_type`:

```tsx
          selected_equipment: selectedEquipment,
```

- [ ] **Step 2: Load + pass `selected_equipment` in `regenerate-bom.ts`**

Read `src/lib/estimates/regenerate-bom.ts`. Find the estimate select (around line 31-36):

```ts
    supabase
      .from("estimates")
      .select("climate_zone, system_type, profit_margin, labor_rate, labor_hours, status")
      .eq("id", estimateId)
      .eq("user_id", user.id)
      .single(),
```

Add `selected_equipment` to the select:

```ts
    supabase
      .from("estimates")
      .select("climate_zone, system_type, profit_margin, labor_rate, labor_hours, status, selected_equipment")
      .eq("id", estimateId)
      .eq("user_id", user.id)
      .single(),
```

Then find the `generateBOM(...)` call (around line 79). Add the new argument:

```ts
  const bom = generateBOM(
    roomInputs,
    estimate.climate_zone as ClimateZoneKey,
    estimate.system_type as SystemType,
    activeCatalog,
    undefined,
    undefined,
    preferences,
    (estimate.selected_equipment ?? {}) as Partial<Record<import("@/lib/hvac/bom-slot-taxonomy").BomSlot, string>>,
  );
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/estimator/bom-step.tsx src/lib/estimates/regenerate-bom.ts
git commit -m "feat(estimates): persist selected_equipment on finish; regenerate honors it"
```

---

## Task 7: End-to-end test — wizard step → BOM uses selection

**Files:**
- Modify: `src/lib/hvac/__tests__/bom-generator-vendor.test.ts`

(Already covered in Task 5 — the three selection tests exercise the generator contract. Skip a dedicated E2E test; the integration is exercised via those unit tests + manual verification below.)

- [ ] **Step 1: No code change — verify Task 5's tests cover the contract**

Run: `npx vitest run src/lib/hvac/__tests__/bom-generator-vendor.test.ts -t "user-selected"`
Expected: 3 tests for the selection path all pass.

---

## Task 8: Manual verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: Ready on localhost. Make sure `ANTHROPIC_API_KEY` and `INTERNAL_API_TOKEN` are set in `.env.local`.

- [ ] **Step 2: Create a new estimate**

Navigate to `/estimates/new`. Run through the wizard: customer → upload (use a saved floorplan) → select pages → analyzing → rooms. After rooms, the wizard should land on the new **Equipment** step.

Expected:
- Top card shows system size + design BTU (computed from room loads).
- One slot card per required equipment type for the selected system_type, plus a thermostat card at the end.
- Each card shows up to 10 candidates sorted by (exact tonnage > brand preference > usage_count > price).
- Clicking a candidate highlights it. Selecting a second candidate within the same slot replaces the selection.
- "Clear" button removes the selection; "Continue to BOM" proceeds.

- [ ] **Step 3: Verify BOM uses selections**

In the BOM step, the Major Equipment rows should reflect the picks you made. Source badges should match whatever the picked catalog item was (Quoted/Imported/Manual).

- [ ] **Step 4: Verify persistence**

Click "Done — View Estimate". Open the estimate detail page. Click "Regenerate BOM". Major Equipment should remain the same (persistence working). Clear your selections via DB if you want to verify the auto-match fallback.

- [ ] **Step 5: Verify skip-a-slot fallback**

Go back into the wizard via a new estimate. On the Equipment step, leave one slot (e.g., thermostat) unselected. Click Continue. Generated BOM should show an auto-matched thermostat (the behavior that exists today). Selected slots reflect picks; unselected slots fall back. No regression.

- [ ] **Step 6: Capture findings**

If the picker shows 0 candidates for a slot your catalog should cover, check whether your catalog has items with `equipment_type = <slot>` and `system_type IN (universal, <your system>)` — most likely a classifier gap (PR B follow-up). If sorting looks wrong, check `preferences.equipment_brands` in contractor preferences.

---

## Self-review notes

- **Spec coverage:**
  - Schema + types → Task 1 ✓
  - Filtering logic → Task 2 ✓
  - Wizard state + step insertion → Task 3 ✓
  - UI components → Task 4 ✓
  - generateBOM honors selections → Task 5 ✓
  - Persistence + regenerate → Task 6 ✓
  - E2E test coverage → Task 7 (reuses Task 5 tests) ✓
  - Manual verification → Task 8 ✓

- **Placeholder scan:** Every code block has concrete code. Commands have expected output. One "if not already present" case in Task 5 step 3 — flagged explicitly because Phase 3 may or may not have left the import in place; agent must check.

- **Type consistency:** `BomSlot` is used throughout. `selectedEquipment: Partial<Record<BomSlot, string>>` is consistent across Zustand state (Task 3), `EquipmentStep` UI (Task 4), generateBOM param (Task 5), and `regenerate-bom` argument (Task 6). `setSelectedEquipment`/`clearSelectedEquipment` action signatures stay identical through Task 3 and Task 4 usage.

- **Known open questions for the executing agent:**
  1. Task 4 step 4 edits `rooms-step.tsx` to advance to `equipment` instead of `bom`. If rooms-step uses `nextStep()` (which follows `STEP_ORDER`), no explicit edit is needed. Check before editing.
  2. The `EquipmentStep` loads the catalog inside a `useEffect`. This fires every time the step mounts — if the contractor jumps back and forth, the fetch re-runs. Acceptable for v1 given catalog size is <15k rows; cache in Zustand state if it becomes a perf issue.
  3. No "Edit Equipment" button on the estimate detail page — selections only editable via the wizard. Follow-up work if requested.
  4. The `EquipmentCandidateRow` uses `Image` from `next/image` with `unoptimized`. For vendor_products URLs this is fine; if Johnstone/Locke block hotlinking, fall back to a standard `<img>` tag.

- **Risks:**
  1. If a user's equipment_catalog doesn't classify cleanly into BomSlot, they may see zero candidates. The UI's empty-state copy explains this; a follow-up PR could add an "add from quote" shortcut.
  2. The Zustand `selectedEquipment` is not rehydrated from DB on wizard resume. For the current flow (new estimate → finish), this is fine. If we add "resume draft" later, hydrate in `createDraft` or a new `resumeEstimate` action.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-16-bom-phase-2-equipment-picker.md`.
