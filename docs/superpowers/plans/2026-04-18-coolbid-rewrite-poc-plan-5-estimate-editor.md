# coolbid-rewrite-poc — Plan 5 of 7: Estimate Editor & Recalc

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `/estimates/[id]` page with a real editor. Contractor can adjust margin, labor rate, BOM line quantities + unit prices, labor hours, narrative, and code callouts; add/remove BOM lines and labor lines; toggle customer view. Every edit triggers a server-side recalc and the totals update. Regenerate button re-runs the AI pipeline against the same intake (deferred to fast-follow if scope tightens).

**Architecture:** Server component fetches the full estimate (estimate row + bom_items + labor_lines) and hands it to a client component that holds editable state. Edits go through Next 16 server actions per logical operation (update bom item, update labor line, update estimate fields, add/delete row). After every mutation the action computes new totals and `revalidatePath("/estimates/[id]")` so the server-rendered totals are fresh.

**Edit pattern:** Per-cell editable inputs with **debounced save on blur** (text/number) or **immediate save** (selects, sliders). Optimistic local state, server confirms via revalidation. No drag-to-reorder in POC — `position` is fixed.

**Tech Stack:** Next 16 server actions, shadcn slider + select + dialog primitives, Sonner toasts, Zod validation server-side.

**Spec:** `docs/superpowers/specs/2026-04-18-coolbid-rewrite-poc-design.md` §5.7 (the editor).

**Plan 4 handoff state:** POC repo `main` at `8b2866e`. Estimates can be created via `/estimates/new`. `estimate_bom_items` + `estimate_labor_lines` populated. `/estimates/[id]` is a placeholder 404 from Plan 1 (well — actually it doesn't exist; the placeholder is just `/estimates/page.tsx`).

**Commit discipline:** `feature/plan-5-estimate-editor` in POC repo. Plan doc on `main` in coolbid via `/commit`. One commit per task.

---

## Task 1: Feature branch + plan import

- [ ] **Step 1:** Branch + import

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
git checkout main
git pull
git checkout -b feature/plan-5-estimate-editor
cp /Users/kolbeypruitt/Workspace/coolbid/docs/superpowers/plans/2026-04-18-coolbid-rewrite-poc-plan-5-estimate-editor.md \
   docs/plans/plan-5-estimate-editor.md
git add docs/plans/plan-5-estimate-editor.md
git commit -m "docs: import plan-5 (estimate editor)"
```

---

## Task 2: shadcn primitives needed

- [ ] **Step 1:** Install slider + alert-dialog (we have table + dialog + select + switch + textarea + input from earlier plans)

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx shadcn@latest add slider alert-dialog
```

If prompted about overwrites: answer no. If new peer deps: include in commit.

- [ ] **Step 2:** Verify + commit

```bash
npx tsc --noEmit
git add src/components/ui/slider.tsx src/components/ui/alert-dialog.tsx package.json package-lock.json
git commit -m "feat(ui): shadcn slider + alert-dialog primitives"
```

---

## Task 3: Estimate loader

**Files:**
- Create: `src/lib/estimates/load.ts`

- [ ] **Step 1:** Write the loader

```ts
// src/lib/estimates/load.ts
import { createClient } from "@/lib/supabase/server";
import type {
  EstimateRow, BomItemRow, LaborLineRow, IntakeAttachment, ParsedJobSpec,
} from "@/types/estimate";

export type LoadedEstimate = {
  estimate: EstimateRow;
  bomItems: BomItemRow[];
  laborLines: LaborLineRow[];
};

export async function loadEstimate(estimateId: string): Promise<LoadedEstimate | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", estimateId)
    .eq("contractor_id", user.id)
    .maybeSingle();
  if (estErr || !estimate) return null;

  const [bomResult, laborResult] = await Promise.all([
    supabase
      .from("estimate_bom_items")
      .select("*")
      .eq("estimate_id", estimateId)
      .order("position", { ascending: true }),
    supabase
      .from("estimate_labor_lines")
      .select("*")
      .eq("estimate_id", estimateId)
      .order("position", { ascending: true }),
  ]);

  if (bomResult.error) {
    console.error("loadEstimate bom:", bomResult.error);
    return null;
  }
  if (laborResult.error) {
    console.error("loadEstimate labor:", laborResult.error);
    return null;
  }

  return {
    estimate,
    bomItems: bomResult.data ?? [],
    laborLines: laborResult.data ?? [],
  };
}

// Helper to coerce jsonb columns when reading
export function attachmentsFromRow(estimate: EstimateRow): IntakeAttachment[] {
  const raw = estimate.intake_attachments;
  if (!Array.isArray(raw)) return [];
  return raw as IntakeAttachment[];
}

export function jobSpecFromRow(estimate: EstimateRow): ParsedJobSpec | null {
  const raw = estimate.parsed_job_spec;
  if (!raw || typeof raw !== "object") return null;
  return raw as ParsedJobSpec;
}

export function calloutsFromRow(estimate: EstimateRow): string[] {
  const raw = estimate.code_callouts;
  if (!Array.isArray(raw)) return [];
  return raw as string[];
}
```

- [ ] **Step 2:** Verify + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit
git add src/lib/estimates/load.ts
git commit -m "feat(estimates): loadEstimate + jsonb-column accessors"
```

---

## Task 4: Recalc helper

**Files:**
- Create: `src/lib/estimates/recalc.ts`

- [ ] **Step 1:** Write the recalc

```ts
// src/lib/estimates/recalc.ts
"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeTotals } from "./totals";

// Reads bom + labor + margin from the DB and writes new totals onto the estimate row.
// Caller must already have RLS-scoped supabase client (e.g. createClient() from server).
export async function recalcEstimate(
  supabase: SupabaseClient,
  estimateId: string,
): Promise<{ ok: boolean; error?: string }> {
  const [estResult, bomResult, laborResult] = await Promise.all([
    supabase.from("estimates").select("margin_pct").eq("id", estimateId).maybeSingle(),
    supabase.from("estimate_bom_items").select("quantity, unit_price").eq("estimate_id", estimateId),
    supabase.from("estimate_labor_lines").select("hours, rate_per_hour").eq("estimate_id", estimateId),
  ]);
  if (estResult.error || !estResult.data) {
    return { ok: false, error: estResult.error?.message ?? "estimate not found" };
  }
  if (bomResult.error) return { ok: false, error: bomResult.error.message };
  if (laborResult.error) return { ok: false, error: laborResult.error.message };

  const totals = computeTotals(
    (bomResult.data ?? []).map((r) => ({ quantity: Number(r.quantity), unit_price: Number(r.unit_price) })),
    (laborResult.data ?? []).map((r) => ({ hours: Number(r.hours), rate_per_hour: Number(r.rate_per_hour) })),
    Number(estResult.data.margin_pct ?? 0),
  );

  const { error: updateError } = await supabase
    .from("estimates")
    .update({
      subtotal_materials: totals.subtotal_materials,
      subtotal_labor: totals.subtotal_labor,
      markup_amount: totals.markup_amount,
      total: totals.total,
    })
    .eq("id", estimateId);
  if (updateError) return { ok: false, error: updateError.message };

  return { ok: true };
}
```

- [ ] **Step 2:** Verify + commit

```bash
npx tsc --noEmit
git add src/lib/estimates/recalc.ts
git commit -m "feat(estimates): recalcEstimate — recompute totals from current rows"
```

---

## Task 5: Estimate server actions

**Files:**
- Create: `src/lib/estimates/actions.ts`

- [ ] **Step 1:** Write the actions

```ts
// src/lib/estimates/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recalcEstimate } from "./recalc";
import { LABOR_CATEGORIES } from "@/lib/catalog/slot-taxonomy";

export type ActionResult = { ok: true } | { ok: false; error: string };

const EstimateFieldsSchema = z.object({
  margin_pct: z.coerce.number().min(0).max(100).optional(),
  labor_rate_per_hour: z.coerce.number().nonnegative().max(500).optional(),
  customer_view: z.enum(["detailed", "summary"]).optional(),
  customer_name: z.string().trim().max(200).nullable().optional(),
  customer_address: z.string().trim().max(500).nullable().optional(),
  customer_email: z.string().trim().max(200).nullable().optional(),
  customer_phone: z.string().trim().max(40).nullable().optional(),
  narrative: z.string().trim().max(8000).optional(),
});

const BomItemPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  unit: z.enum(["each", "ft", "lb", "job"]).optional(),
  quantity: z.coerce.number().nonnegative().max(100000).optional(),
  unit_price: z.coerce.number().nonnegative().max(1000000).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const BomItemInsertSchema = z.object({
  slot: z.string().trim().min(1).max(120),
  customer_category: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  unit: z.enum(["each", "ft", "lb", "job"]),
  quantity: z.coerce.number().nonnegative().max(100000),
  unit_price: z.coerce.number().nonnegative().max(1000000),
});

const LaborLinePatchSchema = z.object({
  category: z.string().trim().min(1).max(120).optional(),
  hours: z.coerce.number().nonnegative().max(200).optional(),
  rate_per_hour: z.coerce.number().nonnegative().max(500).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const LaborLineInsertSchema = z.object({
  category: z.string().trim().min(1).max(120),
  hours: z.coerce.number().nonnegative().max(200),
});

const CalloutsSchema = z.array(z.string().trim().max(500)).max(10);

export async function updateEstimateFields(
  estimateId: string,
  patch: Record<string, unknown>,
): Promise<ActionResult> {
  const parsed = EstimateFieldsSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid fields" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  // If labor rate changed, also propagate to all labor lines (POC: single rate)
  if (parsed.data.labor_rate_per_hour !== undefined) {
    const { error: rateError } = await supabase
      .from("estimate_labor_lines")
      .update({ rate_per_hour: parsed.data.labor_rate_per_hour })
      .eq("estimate_id", estimateId);
    if (rateError) return { ok: false, error: `labor rate propagation failed: ${rateError.message}` };
  }

  const { error } = await supabase.from("estimates").update(parsed.data).eq("id", estimateId).eq("contractor_id", user.id);
  if (error) return { ok: false, error: error.message };

  const recalc = await recalcEstimate(supabase, estimateId);
  if (!recalc.ok) return { ok: false, error: recalc.error ?? "recalc failed" };

  revalidatePath(`/estimates/${estimateId}`);
  return { ok: true };
}

export async function updateCallouts(estimateId: string, callouts: string[]): Promise<ActionResult> {
  const parsed = CalloutsSchema.safeParse(callouts);
  if (!parsed.success) return { ok: false, error: "invalid callouts" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  const { error } = await supabase
    .from("estimates")
    .update({ code_callouts: parsed.data })
    .eq("id", estimateId)
    .eq("contractor_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/estimates/${estimateId}`);
  return { ok: true };
}

export async function updateBomItem(
  estimateId: string,
  itemId: string,
  patch: Record<string, unknown>,
): Promise<ActionResult> {
  const parsed = BomItemPatchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid patch" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  // RLS handles auth scoping via the estimate FK
  const { error } = await supabase
    .from("estimate_bom_items")
    .update(parsed.data)
    .eq("id", itemId)
    .eq("estimate_id", estimateId);
  if (error) return { ok: false, error: error.message };

  const recalc = await recalcEstimate(supabase, estimateId);
  if (!recalc.ok) return { ok: false, error: recalc.error ?? "recalc failed" };

  revalidatePath(`/estimates/${estimateId}`);
  return { ok: true };
}

export async function addBomItem(
  estimateId: string,
  fields: Record<string, unknown>,
): Promise<ActionResult & { id?: string }> {
  const parsed = BomItemInsertSchema.safeParse(fields);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid fields" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  // Compute next position (one greater than current max)
  const { data: existing, error: posError } = await supabase
    .from("estimate_bom_items")
    .select("position")
    .eq("estimate_id", estimateId)
    .order("position", { ascending: false })
    .limit(1);
  if (posError) return { ok: false, error: posError.message };
  const nextPos = (existing?.[0]?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("estimate_bom_items")
    .insert({
      estimate_id: estimateId,
      position: nextPos,
      slot: parsed.data.slot,
      customer_category: parsed.data.customer_category,
      catalog_item_id: null,
      name: parsed.data.name,
      unit: parsed.data.unit,
      quantity: parsed.data.quantity,
      unit_price: parsed.data.unit_price,
      source: "contractor_added",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };

  const recalc = await recalcEstimate(supabase, estimateId);
  if (!recalc.ok) return { ok: false, error: recalc.error ?? "recalc failed" };

  revalidatePath(`/estimates/${estimateId}`);
  return { ok: true, id: data.id };
}

export async function deleteBomItem(estimateId: string, itemId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  const { error } = await supabase
    .from("estimate_bom_items")
    .delete()
    .eq("id", itemId)
    .eq("estimate_id", estimateId);
  if (error) return { ok: false, error: error.message };

  const recalc = await recalcEstimate(supabase, estimateId);
  if (!recalc.ok) return { ok: false, error: recalc.error ?? "recalc failed" };

  revalidatePath(`/estimates/${estimateId}`);
  return { ok: true };
}

export async function updateLaborLine(
  estimateId: string,
  lineId: string,
  patch: Record<string, unknown>,
): Promise<ActionResult> {
  const parsed = LaborLinePatchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid patch" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  const { error } = await supabase
    .from("estimate_labor_lines")
    .update(parsed.data)
    .eq("id", lineId)
    .eq("estimate_id", estimateId);
  if (error) return { ok: false, error: error.message };

  const recalc = await recalcEstimate(supabase, estimateId);
  if (!recalc.ok) return { ok: false, error: recalc.error ?? "recalc failed" };

  revalidatePath(`/estimates/${estimateId}`);
  return { ok: true };
}

export async function addLaborLine(
  estimateId: string,
  fields: Record<string, unknown>,
): Promise<ActionResult & { id?: string }> {
  const parsed = LaborLineInsertSchema.safeParse(fields);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid fields" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  // Inherit estimate's labor_rate_per_hour
  const { data: estimate, error: estError } = await supabase
    .from("estimates")
    .select("labor_rate_per_hour")
    .eq("id", estimateId)
    .maybeSingle();
  if (estError || !estimate) return { ok: false, error: estError?.message ?? "estimate not found" };

  const { data: existing, error: posError } = await supabase
    .from("estimate_labor_lines")
    .select("position")
    .eq("estimate_id", estimateId)
    .order("position", { ascending: false })
    .limit(1);
  if (posError) return { ok: false, error: posError.message };
  const nextPos = (existing?.[0]?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("estimate_labor_lines")
    .insert({
      estimate_id: estimateId,
      position: nextPos,
      category: parsed.data.category,
      hours: parsed.data.hours,
      rate_per_hour: Number(estimate.labor_rate_per_hour),
      source: "contractor_added",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };

  const recalc = await recalcEstimate(supabase, estimateId);
  if (!recalc.ok) return { ok: false, error: recalc.error ?? "recalc failed" };

  revalidatePath(`/estimates/${estimateId}`);
  return { ok: true, id: data.id };
}

export async function deleteLaborLine(estimateId: string, lineId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  const { error } = await supabase
    .from("estimate_labor_lines")
    .delete()
    .eq("id", lineId)
    .eq("estimate_id", estimateId);
  if (error) return { ok: false, error: error.message };

  const recalc = await recalcEstimate(supabase, estimateId);
  if (!recalc.ok) return { ok: false, error: recalc.error ?? "recalc failed" };

  revalidatePath(`/estimates/${estimateId}`);
  return { ok: true };
}

export const KNOWN_LABOR_CATEGORIES = LABOR_CATEGORIES;
```

- [ ] **Step 2:** Verify + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint
git add src/lib/estimates/actions.ts
git commit -m "feat(estimates): server actions (update/add/delete bom + labor + estimate fields)"
```

---

## Task 6: Financials card client component

**Files:**
- Create: `src/components/estimate-editor/financials-card.tsx`

- [ ] **Step 1:** Write the component

```tsx
// src/components/estimate-editor/financials-card.tsx
"use client";

import { useState, useTransition, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { updateEstimateFields } from "@/lib/estimates/actions";
import { toast } from "sonner";
import type { EstimateRow } from "@/types/estimate";

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type Props = { estimate: EstimateRow };

export function FinancialsCard({ estimate }: Props) {
  const [marginPct, setMarginPct] = useState(Number(estimate.margin_pct));
  const [laborRate, setLaborRate] = useState(Number(estimate.labor_rate_per_hour));
  const [customerView, setCustomerView] = useState<"detailed" | "summary">(
    (estimate.customer_view as "detailed" | "summary") ?? "detailed",
  );
  const [pending, startTransition] = useTransition();

  // Re-sync local state if the server-rendered estimate updates (after revalidation)
  useEffect(() => {
    setMarginPct(Number(estimate.margin_pct));
    setLaborRate(Number(estimate.labor_rate_per_hour));
    setCustomerView((estimate.customer_view as "detailed" | "summary") ?? "detailed");
  }, [estimate.margin_pct, estimate.labor_rate_per_hour, estimate.customer_view]);

  function save(patch: Record<string, unknown>) {
    startTransition(async () => {
      const result = await updateEstimateFields(estimate.id, patch);
      if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Financials</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="margin">Margin: {marginPct.toFixed(0)}%</Label>
          <Slider
            id="margin"
            min={0}
            max={80}
            step={1}
            value={[marginPct]}
            onValueChange={(v) => setMarginPct(v[0] ?? 0)}
            onValueCommit={(v) => save({ margin_pct: v[0] ?? 0 })}
            disabled={pending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="labor_rate">Labor rate ($/hr)</Label>
          <Input
            id="labor_rate"
            type="number"
            step="1"
            min="0"
            max="500"
            value={laborRate}
            onChange={(e) => setLaborRate(Number(e.target.value))}
            onBlur={() => save({ labor_rate_per_hour: laborRate })}
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">Applies to all labor lines.</p>
        </div>

        <div className="space-y-2 pt-4 border-t">
          <div className="flex justify-between text-sm">
            <span>Materials</span><span>{formatUsd(Number(estimate.subtotal_materials))}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Labor</span><span>{formatUsd(Number(estimate.subtotal_labor))}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Markup</span><span>{formatUsd(Number(estimate.markup_amount))}</span>
          </div>
          <div className="flex justify-between text-lg font-bold pt-2 border-t">
            <span>Total</span><span>{formatUsd(Number(estimate.total))}</span>
          </div>
        </div>

        <div className="space-y-2 pt-4 border-t">
          <Label>Customer view</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="customer_view"
                checked={customerView === "detailed"}
                onChange={() => { setCustomerView("detailed"); save({ customer_view: "detailed" }); }}
                disabled={pending}
              />
              Detailed
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="customer_view"
                checked={customerView === "summary"}
                onChange={() => { setCustomerView("summary"); save({ customer_view: "summary" }); }}
                disabled={pending}
              />
              Summary
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2:** Verify + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
mkdir -p src/components/estimate-editor
npx tsc --noEmit && npm run lint
git add src/components/estimate-editor/financials-card.tsx
git commit -m "feat(editor): financials card with margin slider + labor rate + totals + customer view"
```

---

## Task 7: BOM table client component

**Files:**
- Create: `src/components/estimate-editor/bom-table.tsx`

- [ ] **Step 1:** Write the table

```tsx
// src/components/estimate-editor/bom-table.tsx
"use client";

import { useState, useTransition } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, AlertCircle } from "lucide-react";
import { updateBomItem, addBomItem, deleteBomItem } from "@/lib/estimates/actions";
import { toast } from "sonner";
import type { BomItemRow } from "@/types/estimate";

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type Props = {
  estimateId: string;
  bomItems: BomItemRow[];
};

export function BomTable({ estimateId, bomItems }: Props) {
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);

  function saveField(itemId: string, field: string, value: unknown) {
    startTransition(async () => {
      const result = await updateBomItem(estimateId, itemId, { [field]: value });
      if (!result.ok) toast.error(result.error);
    });
  }

  function deleteRow(itemId: string) {
    if (!confirm("Delete this line?")) return;
    startTransition(async () => {
      const result = await deleteBomItem(estimateId, itemId);
      if (!result.ok) toast.error(result.error);
    });
  }

  const unmappedCount = bomItems.filter((i) => i.source === "ai_generated_unmapped").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Bill of Materials</h2>
          <p className="text-sm text-muted-foreground">
            {bomItems.length} items
            {unmappedCount > 0 && (
              <>
                {" · "}
                <span className="text-amber-600 dark:text-amber-500">
                  {unmappedCount} need price
                </span>
              </>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="size-4 mr-2" />
          Add line
        </Button>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-24">Qty</TableHead>
              <TableHead className="w-20">Unit</TableHead>
              <TableHead className="w-32">Unit price</TableHead>
              <TableHead className="w-32">Line total</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bomItems.map((item) => (
              <BomRow
                key={item.id}
                estimateId={estimateId}
                item={item}
                pending={pending}
                onSaveField={saveField}
                onDelete={() => deleteRow(item.id)}
              />
            ))}
            {showAdd && (
              <BomAddRow
                estimateId={estimateId}
                onCancel={() => setShowAdd(false)}
                onSaved={() => setShowAdd(false)}
              />
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function BomRow({
  estimateId,
  item,
  pending,
  onSaveField,
  onDelete,
}: {
  estimateId: string;
  item: BomItemRow;
  pending: boolean;
  onSaveField: (id: string, field: string, value: unknown) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(Number(item.quantity));
  const [unitPrice, setUnitPrice] = useState(Number(item.unit_price));

  const lineTotal = Number((quantity * unitPrice).toFixed(2));
  const isUnmapped = item.source === "ai_generated_unmapped";

  return (
    <TableRow className={isUnmapped ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
      <TableCell className="text-xs whitespace-nowrap">
        {item.customer_category}
        {isUnmapped && (
          <Badge variant="outline" className="ml-2 text-xs gap-1 text-amber-700 border-amber-400">
            <AlertCircle className="size-3" />
            Set price
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== item.name && onSaveField(item.id, "name", name)}
          disabled={pending}
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          onBlur={() => quantity !== Number(item.quantity) && onSaveField(item.id, "quantity", quantity)}
          disabled={pending}
          className="h-8"
        />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{item.unit}</TableCell>
      <TableCell>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={unitPrice}
          onChange={(e) => setUnitPrice(Number(e.target.value))}
          onBlur={() => unitPrice !== Number(item.unit_price) && onSaveField(item.id, "unit_price", unitPrice)}
          disabled={pending}
          className="h-8"
        />
      </TableCell>
      <TableCell className="text-sm font-medium">{formatUsd(lineTotal)}</TableCell>
      <TableCell>
        <Button variant="ghost" size="sm" onClick={onDelete} disabled={pending}>
          <Trash2 className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function BomAddRow({
  estimateId,
  onCancel,
  onSaved,
}: {
  estimateId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [slot, setSlot] = useState("misc.fittings");
  const [customerCategory, setCustomerCategory] = useState("Misc");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<"each" | "ft" | "lb" | "job">("each");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);

  function handleSave() {
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    startTransition(async () => {
      const result = await addBomItem(estimateId, {
        slot, customer_category: customerCategory, name, unit, quantity, unit_price: unitPrice,
      });
      if (result.ok) onSaved();
      else toast.error(result.error);
    });
  }

  return (
    <TableRow className="bg-muted/40">
      <TableCell>
        <Input value={customerCategory} onChange={(e) => setCustomerCategory(e.target.value)} className="h-8" placeholder="Category" />
      </TableCell>
      <TableCell>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" placeholder="New line item name" autoFocus />
      </TableCell>
      <TableCell>
        <Input type="number" step="0.01" min="0" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="h-8" />
      </TableCell>
      <TableCell>
        <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} className="h-8 border rounded-md text-sm px-2 bg-transparent">
          <option value="each">each</option>
          <option value="ft">ft</option>
          <option value="lb">lb</option>
          <option value="job">job</option>
        </select>
      </TableCell>
      <TableCell>
        <Input type="number" step="0.01" min="0" value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value))} className="h-8" />
      </TableCell>
      <TableCell className="text-sm">{formatUsd(quantity * unitPrice)}</TableCell>
      <TableCell className="flex gap-1">
        <Button size="sm" onClick={handleSave} disabled={pending}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>×</Button>
      </TableCell>
    </TableRow>
  );
}
```

Note: the slot dropdown for newly-added rows is intentionally not exposed in this simple add-row UI. Contractor-added rows default to `slot="misc.fittings"` and contractor edits the customer_category freely. The slot is mostly cosmetic for contractor-added rows since they don't go through AI mapping.

- [ ] **Step 2:** Verify + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint
git add src/components/estimate-editor/bom-table.tsx
git commit -m "feat(editor): BOM table with inline edits + add/delete row + unmapped badge"
```

---

## Task 8: Labor table client component

**Files:**
- Create: `src/components/estimate-editor/labor-table.tsx`

- [ ] **Step 1:** Write the labor table

```tsx
// src/components/estimate-editor/labor-table.tsx
"use client";

import { useState, useTransition } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { updateLaborLine, addLaborLine, deleteLaborLine, KNOWN_LABOR_CATEGORIES } from "@/lib/estimates/actions";
import { toast } from "sonner";
import type { LaborLineRow } from "@/types/estimate";

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type Props = {
  estimateId: string;
  laborLines: LaborLineRow[];
};

export function LaborTable({ estimateId, laborLines }: Props) {
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);

  function saveField(lineId: string, field: string, value: unknown) {
    startTransition(async () => {
      const result = await updateLaborLine(estimateId, lineId, { [field]: value });
      if (!result.ok) toast.error(result.error);
    });
  }

  function deleteRow(lineId: string) {
    if (!confirm("Delete this labor line?")) return;
    startTransition(async () => {
      const result = await deleteLaborLine(estimateId, lineId);
      if (!result.ok) toast.error(result.error);
    });
  }

  const totalHours = laborLines.reduce((acc, l) => acc + Number(l.hours), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Labor</h2>
          <p className="text-sm text-muted-foreground">{laborLines.length} categories · {totalHours} total hours</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="size-4 mr-2" />
          Add labor
        </Button>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="w-20">Hours</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-32">Line total</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {laborLines.map((line) => (
              <LaborRow
                key={line.id}
                line={line}
                pending={pending}
                onSaveField={(field, value) => saveField(line.id, field, value)}
                onDelete={() => deleteRow(line.id)}
              />
            ))}
            {showAdd && (
              <LaborAddRow
                estimateId={estimateId}
                onCancel={() => setShowAdd(false)}
                onSaved={() => setShowAdd(false)}
              />
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LaborRow({
  line,
  pending,
  onSaveField,
  onDelete,
}: {
  line: LaborLineRow;
  pending: boolean;
  onSaveField: (field: string, value: unknown) => void;
  onDelete: () => void;
}) {
  const [hours, setHours] = useState(Number(line.hours));
  const [notes, setNotes] = useState(line.notes ?? "");

  const lineTotal = Number((hours * Number(line.rate_per_hour)).toFixed(2));

  return (
    <TableRow>
      <TableCell className="text-sm">{line.category}</TableCell>
      <TableCell>
        <Input
          type="number"
          step="0.25"
          min="0"
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          onBlur={() => hours !== Number(line.hours) && onSaveField("hours", hours)}
          disabled={pending}
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (line.notes ?? "") && onSaveField("notes", notes || null)}
          disabled={pending}
          className="h-8"
        />
      </TableCell>
      <TableCell className="text-sm font-medium">{formatUsd(lineTotal)}</TableCell>
      <TableCell>
        <Button variant="ghost" size="sm" onClick={onDelete} disabled={pending}>
          <Trash2 className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function LaborAddRow({
  estimateId,
  onCancel,
  onSaved,
}: {
  estimateId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<string>(KNOWN_LABOR_CATEGORIES[0]);
  const [hours, setHours] = useState(1);

  function handleSave() {
    startTransition(async () => {
      const result = await addLaborLine(estimateId, { category, hours });
      if (result.ok) onSaved();
      else toast.error(result.error);
    });
  }

  return (
    <TableRow className="bg-muted/40">
      <TableCell>
        <Input value={category} onChange={(e) => setCategory(e.target.value)} className="h-8" list="labor-categories" />
        <datalist id="labor-categories">
          {KNOWN_LABOR_CATEGORIES.map((c) => <option key={c} value={c} />)}
        </datalist>
      </TableCell>
      <TableCell>
        <Input type="number" step="0.25" min="0" value={hours} onChange={(e) => setHours(Number(e.target.value))} className="h-8" />
      </TableCell>
      <TableCell colSpan={2} />
      <TableCell className="flex gap-1">
        <Button size="sm" onClick={handleSave} disabled={pending}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>×</Button>
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 2:** Verify + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint
git add src/components/estimate-editor/labor-table.tsx
git commit -m "feat(editor): labor table with inline edits + add/delete + datalist autocomplete"
```

---

## Task 9: Narrative + code callouts editors

**Files:**
- Create: `src/components/estimate-editor/narrative-editor.tsx`
- Create: `src/components/estimate-editor/callouts-editor.tsx`

- [ ] **Step 1:** Narrative editor

```tsx
// src/components/estimate-editor/narrative-editor.tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { updateEstimateFields } from "@/lib/estimates/actions";
import { toast } from "sonner";

type Props = {
  estimateId: string;
  initialNarrative: string;
};

export function NarrativeEditor({ estimateId, initialNarrative }: Props) {
  const [text, setText] = useState(initialNarrative);
  const [pending, startTransition] = useTransition();
  const lastSaved = useRef(initialNarrative);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setText(initialNarrative);
    lastSaved.current = initialNarrative;
  }, [initialNarrative]);

  function scheduleSave(value: string) {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (value === lastSaved.current) return;
      startTransition(async () => {
        const result = await updateEstimateFields(estimateId, { narrative: value });
        if (result.ok) lastSaved.current = value;
        else toast.error(result.error);
      });
    }, 1000);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="narrative">Scope of Work</Label>
        {pending && <span className="text-xs text-muted-foreground">Saving…</span>}
      </div>
      <Textarea
        id="narrative"
        rows={8}
        value={text}
        onChange={(e) => { setText(e.target.value); scheduleSave(e.target.value); }}
      />
    </div>
  );
}
```

- [ ] **Step 2:** Callouts editor

```tsx
// src/components/estimate-editor/callouts-editor.tsx
"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { updateCallouts } from "@/lib/estimates/actions";
import { toast } from "sonner";

type Props = {
  estimateId: string;
  initialCallouts: string[];
};

export function CalloutsEditor({ estimateId, initialCallouts }: Props) {
  const [callouts, setCallouts] = useState<string[]>(initialCallouts);
  const [pending, startTransition] = useTransition();

  function persist(next: string[]) {
    startTransition(async () => {
      const result = await updateCallouts(estimateId, next);
      if (!result.ok) toast.error(result.error);
    });
  }

  function update(i: number, value: string) {
    const next = [...callouts];
    next[i] = value;
    setCallouts(next);
  }

  function commit(i: number) {
    if (callouts[i] !== initialCallouts[i]) persist(callouts);
  }

  function add() {
    const next = [...callouts, "Contractor should verify: "];
    setCallouts(next);
    persist(next);
  }

  function remove(i: number) {
    const next = callouts.filter((_, idx) => idx !== i);
    setCallouts(next);
    persist(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Code & Compliance Notes</Label>
        <Button variant="outline" size="sm" onClick={add} disabled={pending || callouts.length >= 10}>
          <Plus className="size-4 mr-2" />
          Add note
        </Button>
      </div>
      {callouts.length === 0 && (
        <p className="text-sm text-muted-foreground">No notes. Add jurisdiction-specific reminders if needed.</p>
      )}
      {callouts.map((note, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={note}
            onChange={(e) => update(i, e.target.value)}
            onBlur={() => commit(i)}
            disabled={pending}
          />
          <Button variant="ghost" size="sm" onClick={() => remove(i)} disabled={pending}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3:** Verify + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint
git add src/components/estimate-editor/narrative-editor.tsx src/components/estimate-editor/callouts-editor.tsx
git commit -m "feat(editor): narrative editor (debounced) + callouts editor (per-line save)"
```

---

## Task 10: Customer info editor

**Files:**
- Create: `src/components/estimate-editor/customer-info.tsx`

- [ ] **Step 1:** Write it

```tsx
// src/components/estimate-editor/customer-info.tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateEstimateFields } from "@/lib/estimates/actions";
import { toast } from "sonner";
import type { EstimateRow } from "@/types/estimate";

type Props = { estimate: EstimateRow };

export function CustomerInfo({ estimate }: Props) {
  const [name, setName] = useState(estimate.customer_name ?? "");
  const [address, setAddress] = useState(estimate.customer_address ?? "");
  const [phone, setPhone] = useState(estimate.customer_phone ?? "");
  const [email, setEmail] = useState(estimate.customer_email ?? "");
  const [pending, startTransition] = useTransition();
  const lastSaved = useRef({ name, address, phone, email });

  useEffect(() => {
    setName(estimate.customer_name ?? "");
    setAddress(estimate.customer_address ?? "");
    setPhone(estimate.customer_phone ?? "");
    setEmail(estimate.customer_email ?? "");
    lastSaved.current = {
      name: estimate.customer_name ?? "",
      address: estimate.customer_address ?? "",
      phone: estimate.customer_phone ?? "",
      email: estimate.customer_email ?? "",
    };
  }, [estimate.customer_name, estimate.customer_address, estimate.customer_phone, estimate.customer_email]);

  function save(field: "customer_name" | "customer_address" | "customer_phone" | "customer_email", value: string) {
    startTransition(async () => {
      const result = await updateEstimateFields(estimate.id, { [field]: value || null });
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cust_name">Name</Label>
            <Input id="cust_name" value={name} onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== lastSaved.current.name && (lastSaved.current.name = name, save("customer_name", name))}
              disabled={pending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust_phone">Phone</Label>
            <Input id="cust_phone" value={phone} onChange={(e) => setPhone(e.target.value)}
              onBlur={() => phone !== lastSaved.current.phone && (lastSaved.current.phone = phone, save("customer_phone", phone))}
              disabled={pending} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cust_address">Address</Label>
          <Input id="cust_address" value={address} onChange={(e) => setAddress(e.target.value)}
            onBlur={() => address !== lastSaved.current.address && (lastSaved.current.address = address, save("customer_address", address))}
            disabled={pending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cust_email">Email</Label>
          <Input id="cust_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            onBlur={() => email !== lastSaved.current.email && (lastSaved.current.email = email, save("customer_email", email))}
            disabled={pending} />
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2:** Verify + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint
git add src/components/estimate-editor/customer-info.tsx
git commit -m "feat(editor): customer info card with onBlur saves"
```

---

## Task 11: /estimates/[id] page

**Files:**
- Create: `src/app/(app)/estimates/[id]/page.tsx`

- [ ] **Step 1:** Write the page

```tsx
// src/app/(app)/estimates/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadEstimate, calloutsFromRow } from "@/lib/estimates/load";
import { CustomerInfo } from "@/components/estimate-editor/customer-info";
import { FinancialsCard } from "@/components/estimate-editor/financials-card";
import { BomTable } from "@/components/estimate-editor/bom-table";
import { LaborTable } from "@/components/estimate-editor/labor-table";
import { NarrativeEditor } from "@/components/estimate-editor/narrative-editor";
import { CalloutsEditor } from "@/components/estimate-editor/callouts-editor";

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const loaded = await loadEstimate(id);
  if (!loaded) notFound();

  const { estimate, bomItems, laborLines } = loaded;
  const callouts = calloutsFromRow(estimate);

  return (
    <div className="p-8 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Link href="/estimates" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4 mr-1" />
            All estimates
          </Link>
          <h1 className="text-3xl font-bold">
            {estimate.customer_name || "Untitled estimate"}
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            {estimate.id.slice(0, 8)} · created {new Date(estimate.created_at).toLocaleString()}
          </p>
        </div>
        <Button disabled title="Share — wired in Plan 6">
          <Share2 className="size-4 mr-2" />
          Share
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6 min-w-0">
          <CustomerInfo estimate={estimate} />
          <BomTable estimateId={estimate.id} bomItems={bomItems} />
          <LaborTable estimateId={estimate.id} laborLines={laborLines} />
          <NarrativeEditor estimateId={estimate.id} initialNarrative={estimate.narrative ?? ""} />
          <CalloutsEditor estimateId={estimate.id} initialCallouts={callouts} />
        </div>
        <div className="space-y-6">
          <FinancialsCard estimate={estimate} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** Verify + build

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint && npm run build
```

Expected: clean. `/estimates/[id]` shows as a dynamic `ƒ` route.

- [ ] **Step 3:** Commit

```bash
git add 'src/app/(app)/estimates/[id]/page.tsx'
git commit -m "feat(estimates): /estimates/[id] editor wires all sections"
```

---

## Task 12: Smoke + merge

- [ ] **Step 1:** Build + tests pass

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint && npm run build
npm test
```

Expected: 21 tests passing (no new tests added in this plan; all are UI). Build clean.

- [ ] **Step 2:** REST smoke — exercise the action endpoints via direct DB writes (similar pattern to Plan 4)

```bash
# Pick an existing estimate from the DB to use as smoke target.
# This validates the recalc + RLS + action shapes without driving the browser.

SUPABASE_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2)
SERVICE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2)

# Find any estimate
ESTIMATE_JSON=$(curl -s "$SUPABASE_URL/rest/v1/estimates?select=id,contractor_id,total,subtotal_materials,subtotal_labor,markup_amount,margin_pct,labor_rate_per_hour&limit=1" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY")
echo "Initial estimate state:"
echo "$ESTIMATE_JSON"

EID=$(echo "$ESTIMATE_JSON" | grep -oP '"id":"\K[^"]+' | head -1)
CID=$(echo "$ESTIMATE_JSON" | grep -oP '"contractor_id":"\K[^"]+' | head -1)

if [ -z "$EID" ]; then
  echo "No estimates exist to smoke-test against. Create one via the browser first."
  exit 1
fi

echo "Smoke target estimate id: $EID"

# Update the margin_pct via direct DB update (simulating what updateEstimateFields would do)
curl -sX PATCH "$SUPABASE_URL/rest/v1/estimates?id=eq.$EID" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"margin_pct": 50}' > /dev/null

echo "After margin bump to 50%:"
curl -s "$SUPABASE_URL/rest/v1/estimates?id=eq.$EID&select=margin_pct,subtotal_materials,subtotal_labor,markup_amount,total" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
```

The direct PATCH bypasses our recalcEstimate helper, so the DB row will have new margin but stale totals. The real test of recalc happens in the browser (next step). The above just confirms the row is reachable.

- [ ] **Step 3:** Manual browser smoke (USER ACTION required before merge)

The same browser-cookie issue from Plan 4 applies. Hand the user a checklist:

1. `cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc && npm run dev`
2. Sign in
3. Open `/estimates/<your existing estimate uuid>` (the one from your earlier smoke)
4. Verify the editor renders: customer card top-left, BOM table mid, labor table below, narrative + callouts at bottom, financials card pinned right
5. Try each interaction:
   - Drag the margin slider → totals on right update after release
   - Change labor rate → totals update on blur, all labor line totals update
   - Edit a BOM quantity → line total + grand total update on blur
   - Edit a BOM unit price → ditto
   - Edit a labor hour → ditto
   - Click "+ Add line" on BOM → fill, Save → row appears with line total
   - Click trash icon on BOM row → confirm → row gone, totals adjust
   - Same for labor add/delete
   - Edit narrative — autosave kicks in 1s after stop typing
   - Add a callout, edit text, delete one
   - Toggle Detailed/Summary radio → saves
   - Edit customer name, phone, etc → saves on blur
6. Refresh page → all changes persisted
7. Verify in Supabase Dashboard → `estimates` row reflects all edits

Report any UI bug, broken save, or unexpected revert.

- [ ] **Step 4:** Merge + push (after user confirms smoke passed)

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
git checkout main
git merge --no-ff feature/plan-5-estimate-editor -m "feat: complete Plan 5 — estimate editor + recalc"
git branch -d feature/plan-5-estimate-editor
git push origin main
```

DO NOT merge before the user confirms the browser smoke. Report DONE_WITH_CONCERNS until they do.

## Plan 5 Done — what works now

✅ Full editable estimate at `/estimates/[id]`
✅ Inline edits with onBlur saves and server-side recalc
✅ Margin slider, labor rate input, customer view toggle, customer info, BOM table, labor table, narrative, callouts — all editable
✅ Add/delete BOM and labor rows
✅ Unmapped (zero-priced) AI items flagged with yellow "Set price" badge
✅ Totals stay consistent across every edit

## Deferred / fast-follow

- Per-line labor rate override (POC: single rate from estimate)
- Drag-to-reorder (POC: position fixed)
- Regenerate button (re-run AI against same intake) — explicit follow-up plan
- Inline cell-level validation feedback beyond Sonner toasts
- Optimistic updates (POC: server confirms via revalidation, ~200-500ms perceived latency per edit)

## Next: Plan 6 — Share & Public View
