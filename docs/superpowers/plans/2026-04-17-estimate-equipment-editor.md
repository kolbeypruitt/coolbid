# Estimate Equipment Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **IMPORTANT — dependency:** This plan depends on Phase 2 (branch `feature/bom-phase-2-equipment-picker`) being merged to `main` first. Phase 2 adds `estimates.selected_equipment`, the `EquipmentSlotPicker` + `EquipmentCandidateRow` components, and the `findEquipmentCandidates` function. If Phase 2 isn't merged yet, wait.

**Goal:** Add a dedicated `/estimates/[id]/equipment` route + "Edit Equipment" button on the estimate detail page so a contractor can change their major-equipment selections without re-running the whole wizard. Saving persists the new selections and regenerates the BOM with the AI accessory picker.

**Architecture:**
1. New server-rendered page at `src/app/(app)/estimates/[id]/equipment/page.tsx` loads the estimate + its rooms + current `selected_equipment`, then hands off to a client component.
2. New client component `EstimateEquipmentEditor` runs the same UX as Phase 2's wizard `EquipmentStep` but against LOCAL React state (not Zustand). It loads the catalog once, computes candidates per slot, and renders `EquipmentSlotPicker` cards (which already exist from Phase 2).
3. Save action is a server action that writes `selected_equipment` to the `estimates` row and immediately calls the existing `regenerateBom` so the new picks flow into a fresh BOM.
4. "Edit Equipment" button is added to `EstimateActions` on the detail page, linking to the new route.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase, shadcn/ui, Vitest. Reuses Phase 2's `findEquipmentCandidates`, `EquipmentSlotPicker`, `EquipmentCandidateRow`.

**Out of scope:**
- Editing rooms or customer info from this page — use the existing rooms/customer UI.
- Mobile-optimized layout beyond what Phase 2's slot pickers already provide.
- Visual diff of "old selection → new selection" before save.

---

## File structure

**Create:**
- `src/app/(app)/estimates/[id]/equipment/page.tsx` — server component: loads estimate + rooms + current selections
- `src/components/estimates/estimate-equipment-editor.tsx` — client component: picker UI + save/cancel buttons
- `src/lib/estimates/save-equipment-selections.ts` — server action: write selections + call regenerateBom
- `src/lib/estimates/__tests__/save-equipment-selections.test.ts` — unit tests for the action

**Modify:**
- `src/components/estimates/estimate-actions.tsx` — add "Edit Equipment" button linking to the new route

---

## Task 1: Server action — save selections + regenerate

**Files:**
- Create: `src/lib/estimates/save-equipment-selections.ts`
- Create: `src/lib/estimates/__tests__/save-equipment-selections.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/estimates/__tests__/save-equipment-selections.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("saveEquipmentSelections", () => {
  it("rejects when not authenticated", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user: null }, error: null }),
        },
      }),
    }));
    vi.doMock("@/lib/estimates/regenerate-bom", () => ({
      regenerateBom: vi.fn(),
    }));
    const { saveEquipmentSelections } = await import("../save-equipment-selections");
    const res = await saveEquipmentSelections("est-1", { ac_condenser: "c1" });
    expect(res.error).toBe("Not authenticated");
  });

  it("writes selections and calls regenerateBom on success", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    const regenerateMock = vi.fn().mockResolvedValue({});
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "u1" } },
            error: null,
          }),
        },
        from: () => ({ update: updateMock }),
      }),
    }));
    vi.doMock("@/lib/estimates/regenerate-bom", () => ({
      regenerateBom: regenerateMock,
    }));
    const { saveEquipmentSelections } = await import("../save-equipment-selections");
    const res = await saveEquipmentSelections("est-1", { ac_condenser: "c1" });
    expect(res.error).toBeUndefined();
    expect(updateMock).toHaveBeenCalledWith({
      selected_equipment: { ac_condenser: "c1" },
    });
    expect(regenerateMock).toHaveBeenCalledWith("est-1");
  });

  it("returns update error without calling regenerateBom", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: { message: "update failed" } }),
      }),
    });
    const regenerateMock = vi.fn();
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "u1" } },
            error: null,
          }),
        },
        from: () => ({ update: updateMock }),
      }),
    }));
    vi.doMock("@/lib/estimates/regenerate-bom", () => ({
      regenerateBom: regenerateMock,
    }));
    const { saveEquipmentSelections } = await import("../save-equipment-selections");
    const res = await saveEquipmentSelections("est-1", {});
    expect(res.error).toBe("update failed");
    expect(regenerateMock).not.toHaveBeenCalled();
  });

  it("propagates regenerateBom error", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    const regenerateMock = vi.fn().mockResolvedValue({
      error: "BOM generation produced no items",
    });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "u1" } },
            error: null,
          }),
        },
        from: () => ({ update: updateMock }),
      }),
    }));
    vi.doMock("@/lib/estimates/regenerate-bom", () => ({
      regenerateBom: regenerateMock,
    }));
    const { saveEquipmentSelections } = await import("../save-equipment-selections");
    const res = await saveEquipmentSelections("est-1", { ac_condenser: "c1" });
    expect(res.error).toBe("BOM generation produced no items");
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run src/lib/estimates/__tests__/save-equipment-selections.test.ts`
Expected: cannot-find-module `../save-equipment-selections`.

- [ ] **Step 3: Implement the server action**

```ts
// src/lib/estimates/save-equipment-selections.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { regenerateBom } from "@/lib/estimates/regenerate-bom";
import type { BomSlot } from "@/lib/hvac/bom-slot-taxonomy";

export type EquipmentSelections = Partial<Record<BomSlot, string>>;

/**
 * Write the contractor's major-equipment selections to the estimate and
 * trigger a BOM regeneration so the AI accessory picker sees the new
 * equipment specs. Scoped to the authenticated user's estimate via the
 * `.eq("user_id", ...)` filter — unauthorized users can't edit someone
 * else's selections even with a guessed estimate id.
 */
export async function saveEquipmentSelections(
  estimateId: string,
  selections: EquipmentSelections,
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return { error: "Not authenticated" };

  const { error: updErr } = await supabase
    .from("estimates")
    .update({ selected_equipment: selections })
    .eq("id", estimateId)
    .eq("user_id", user.id);
  if (updErr) return { error: updErr.message };

  const regenResult = await regenerateBom(estimateId);
  if (regenResult.error) return { error: regenResult.error };

  return {};
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx vitest run src/lib/estimates/__tests__/save-equipment-selections.test.ts`
Expected: 4/4 pass.

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/estimates/save-equipment-selections.ts src/lib/estimates/__tests__/save-equipment-selections.test.ts
git commit -m "feat(estimates): saveEquipmentSelections server action — writes selections + regenerates BOM"
```

---

## Task 2: Client component — `EstimateEquipmentEditor`

**Files:**
- Create: `src/components/estimates/estimate-equipment-editor.tsx`

This component is the self-contained editor. It accepts the estimate's saved selections + metadata as props, loads the catalog on mount, and renders `EquipmentSlotPicker` cards using Phase 2's components.

- [ ] **Step 1: Implement the editor**

```tsx
// src/components/estimates/estimate-equipment-editor.tsx
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { loadBomCatalog } from "@/lib/estimates/load-bom-catalog";
import { findEquipmentCandidates } from "@/lib/hvac/equipment-candidates";
import { EquipmentSlotPicker } from "@/components/estimator/equipment-slot-picker";
import { SYSTEM_TYPE_EQUIPMENT, EQUIPMENT_TYPE_LABELS } from "@/types/catalog";
import type { CatalogItem, SystemType } from "@/types/catalog";
import { calculateRoomLoad, calculateSystemTonnage } from "@/lib/hvac/load-calc";
import type { BomSlot } from "@/lib/hvac/bom-slot-taxonomy";
import type { ContractorPreferences } from "@/types/contractor-preferences";
import type { Room, ClimateZoneKey } from "@/types/hvac";
import { saveEquipmentSelections, type EquipmentSelections } from "@/lib/estimates/save-equipment-selections";

const EQUIPMENT_LABELS: Partial<Record<BomSlot, string>> = {
  ac_condenser: "AC Condenser",
  heat_pump_condenser: "Heat Pump Condenser",
  gas_furnace: "Gas Furnace",
  air_handler: "Air Handler",
  evap_coil: "Evaporator Coil",
  heat_strips: "Heat Strips",
  thermostat: "Thermostat",
};

type Props = {
  estimateId: string;
  climateZone: ClimateZoneKey;
  systemType: SystemType;
  rooms: Room[];
  initialSelections: EquipmentSelections;
};

export function EstimateEquipmentEditor({
  estimateId,
  climateZone,
  systemType,
  rooms,
  initialSelections,
}: Props) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [preferences, setPreferences] = useState<ContractorPreferences | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selections, setSelections] = useState<EquipmentSelections>(initialSelections);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
          supabase
            .from("profiles")
            .select("contractor_preferences")
            .eq("id", user.id)
            .single(),
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

  const { tonnage, designBTU } = useMemo(() => {
    const totalBTU = rooms.reduce(
      (sum, r) => sum + calculateRoomLoad(r, climateZone).btu,
      0,
    );
    return {
      tonnage: Math.max(calculateSystemTonnage(totalBTU), 2),
      designBTU: Math.ceil(totalBTU * 1.1),
    };
  }, [rooms, climateZone]);

  const requiredSlots: BomSlot[] = useMemo(
    () => [...(SYSTEM_TYPE_EQUIPMENT[systemType] as BomSlot[]), "thermostat"],
    [systemType],
  );

  function handleSelect(slot: BomSlot, id: string) {
    setSelections((prev) => ({ ...prev, [slot]: id }));
  }

  function handleClear(slot: BomSlot) {
    setSelections((prev) => {
      const { [slot]: _removed, ...rest } = prev;
      return rest;
    });
  }

  function handleSave() {
    setSaveError(null);
    startTransition(async () => {
      const res = await saveEquipmentSelections(estimateId, selections);
      if (res.error) {
        setSaveError(res.error);
      } else {
        router.push(`/estimates/${estimateId}`);
        router.refresh();
      }
    });
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">Failed to load catalog: {loadError}</p>
        <Button variant="outline" asChild>
          <a href={`/estimates/${estimateId}`}>Back to estimate</a>
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
        const label =
          EQUIPMENT_LABELS[slot] ?? EQUIPMENT_TYPE_LABELS[slot] ?? slot;
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
            description={isThermostat ? undefined : `Tonnage: ${tonnage}T target (±0.5T)`}
            candidates={candidates}
            selectedId={selections[slot]}
            onSelect={(id) => handleSelect(slot, id)}
            onClear={() => handleClear(slot)}
          />
        );
      })}

      {saveError && (
        <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-sm text-error">
          {saveError}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button variant="outline" asChild>
          <a href={`/estimates/${estimateId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Cancel
          </a>
        </Button>
        <Button onClick={handleSave} disabled={isPending} className="bg-gradient-brand hover-lift">
          <Save className="mr-2 h-4 w-4" />
          {isPending ? "Saving…" : "Save and Regenerate BOM"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/estimates/estimate-equipment-editor.tsx
git commit -m "feat(estimates): EstimateEquipmentEditor — edit major equipment selections post-save"
```

---

## Task 3: Server route — `/estimates/[id]/equipment`

**Files:**
- Create: `src/app/(app)/estimates/[id]/equipment/page.tsx`

- [ ] **Step 1: Implement the page**

```tsx
// src/app/(app)/estimates/[id]/equipment/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { dbRowToRoom } from "@/lib/estimates/db-row-to-room";
import { EstimateEquipmentEditor } from "@/components/estimates/estimate-equipment-editor";
import type { Database } from "@/types/database";
import type { ClimateZoneKey } from "@/types/hvac";
import type { SystemType } from "@/types/catalog";
import type { EquipmentSelections } from "@/lib/estimates/save-equipment-selections";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type RoomRow = Database["public"]["Tables"]["estimate_rooms"]["Row"];

export default async function EstimateEquipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [{ data: estimate }, { data: rooms }] = await Promise.all([
    supabase
      .from("estimates")
      .select("id, project_name, climate_zone, system_type, selected_equipment")
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("estimate_rooms")
      .select("*")
      .eq("estimate_id", id)
      .order("created_at"),
  ]);

  if (!estimate) notFound();

  const est = estimate as Pick<
    EstimateRow,
    "id" | "project_name" | "climate_zone" | "system_type" | "selected_equipment"
  >;
  const roomList = (rooms ?? []) as RoomRow[];
  const roomInputs = roomList.map((r, i) =>
    dbRowToRoom(r as Record<string, unknown>, i),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Link
          href={`/estimates/${id}`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "mt-0.5 text-txt-secondary hover:text-txt-primary",
          )}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-txt-primary">Edit Equipment</h1>
          <p className="text-sm text-txt-secondary mt-1">
            {est.project_name} — selecting major equipment regenerates the BOM
            with accessory picks keyed to your new picks.
          </p>
        </div>
      </div>

      <EstimateEquipmentEditor
        estimateId={est.id}
        climateZone={(est.climate_zone ?? "mixed") as ClimateZoneKey}
        systemType={est.system_type as SystemType}
        rooms={roomInputs}
        initialSelections={(est.selected_equipment ?? {}) as EquipmentSelections}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/estimates/\[id\]/equipment/page.tsx
git commit -m "feat(estimates): /estimates/[id]/equipment route — dedicated edit page"
```

---

## Task 4: "Edit Equipment" button in `EstimateActions`

**Files:**
- Modify: `src/components/estimates/estimate-actions.tsx`

- [ ] **Step 1: Read the file**

Run: `cat src/components/estimates/estimate-actions.tsx`

Note the existing button layout — there's already a "Regenerate BOM" button. We'll add "Edit Equipment" alongside it.

- [ ] **Step 2: Add the button**

Inside the `<div className="flex flex-wrap gap-2">` block that holds the existing buttons, add before the `<Button ... onClick={handleRegenerateBom}>`:

```tsx
        <Button variant="outline" size="sm" asChild>
          <a href={`/estimates/${estimateId}/equipment`}>
            <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
            Edit Equipment
          </a>
        </Button>
```

Update the lucide import at the top to include `Settings2`:

```tsx
import { FileText, Download, RefreshCw, Settings2 } from "lucide-react";
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/estimates/estimate-actions.tsx
git commit -m "feat(estimates): Edit Equipment button on estimate detail page"
```

---

## Task 5: Manual verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: Ready on localhost.

- [ ] **Step 2: Open an existing estimate with `selected_equipment` populated**

Pick an estimate where you've used the Phase 2 wizard to select major equipment. Navigate to `/estimates/{id}`.

Expected: "Edit Equipment" button visible alongside "Copy RFQ" / "Export CSV" / "Regenerate BOM".

- [ ] **Step 3: Click "Edit Equipment"**

Expected: navigates to `/estimates/{id}/equipment`. The sizing card shows the calculated tonnage/BTU. Slot cards render with candidates. The slots you previously selected should show a highlighted card (initialSelections hydrated into selections state).

- [ ] **Step 4: Change a selection**

Click a different candidate for any slot. The highlighted state should move. Click "Clear" — the selection disappears.

- [ ] **Step 5: Click "Save and Regenerate BOM"**

Expected: brief "Saving…" state, then redirect to `/estimates/{id}`. The estimate's Major Equipment section reflects the new picks. The Installation/Refrigerant/Electrical sections may differ too (regenerate-bom re-runs the AI accessory picker with the new major-equipment specs).

- [ ] **Step 6: Verify persistence**

Reopen the page (hard refresh). Same selections should show — they're stored in `estimates.selected_equipment`.

- [ ] **Step 7: Verify auth scoping**

If you have a second test account, manually construct a URL `/estimates/{someone-elses-id}/equipment`. Expected: `notFound()` (because the select uses `.eq("user_id", user.id)`).

- [ ] **Step 8: Capture findings**

If any slot consistently shows "No catalog items match this tonnage" when you know the catalog has rows, cross-check:
- Does `findEquipmentCandidates` filter them out (wrong `equipment_type` or `system_type`)?
- Is `bom_slot` classification still in progress for those rows (backfill status)?

---

## Self-review notes

- **Spec coverage:**
  - Server action + tests → Task 1 ✓
  - Client editor component → Task 2 ✓
  - Server-rendered page → Task 3 ✓
  - "Edit Equipment" button on detail page → Task 4 ✓
  - Manual verification → Task 5 ✓

- **Placeholder scan:** All steps have concrete code. `EquipmentSlotPicker` and `findEquipmentCandidates` are assumed to exist via Phase 2 — plan header flags this dependency explicitly.

- **Type consistency:** `EquipmentSelections` type is defined in Task 1 and reused in Tasks 2 and 3. `BomSlot` comes from `@/lib/hvac/bom-slot-taxonomy` throughout. `findEquipmentCandidates` signature in Task 2 matches Phase 2's Task 2.

- **Known open questions:**
  1. The `EquipmentSlotPicker` component's signature is assumed to match Phase 2's plan (slot, label, description, candidates, selectedId, onSelect, onClear). If session #2 changes that signature during execution, Task 2 needs a matching edit.
  2. `initialSelections` uses a loose `Record<string, string>` type cast because `Database` types from Supabase may render the jsonb column as `Json` or `unknown`. If Phase 2's Task 1 types the column precisely, this cast is unnecessary.

- **Risks:**
  1. Deep-linking to `/estimates/{id}/equipment` before Phase 2 merges gives a 404 — the route file itself will work, but the `EquipmentSlotPicker` import will fail to resolve. Don't merge until Phase 2 is in.
  2. If a user has zero rooms on an estimate, the tonnage calc reads zero and we display `2T` (the floor). The UX copy doesn't call this out — the user may wonder where the sizing came from. Not blocking; easy to add a note later.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-17-estimate-equipment-editor.md`.
