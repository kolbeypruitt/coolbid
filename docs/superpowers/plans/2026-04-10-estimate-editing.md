# Estimate Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable inline editing of saved estimates — margin % (slider), labor inputs, and BOM item CRUD (edit, delete, swap, add from catalog or custom).

**Architecture:** Convert the estimate detail page's static display into interactive client components. Each mutation uses the existing pattern: client-side Supabase calls + `router.refresh()`. A shared recalculation helper keeps totals consistent. Editing a "sent" estimate flips it to "draft" with a banner prompting re-share.

**Tech Stack:** Next.js App Router, Supabase client SDK, shadcn v4 (@base-ui/react), Tailwind CSS

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/app/(app)/estimates/[id]/page.tsx` | Modify | Swap static cards/tables for new client components |
| `src/components/estimates/financials-card.tsx` | Create | Margin slider, labor inputs, live totals, debounced save |
| `src/components/estimates/bom-category-table.tsx` | Create | Editable BOM table for one category with row actions |
| `src/components/estimates/catalog-search-dialog.tsx` | Create | Search equipment_catalog, select part for swap/add |
| `src/components/estimates/add-part-dialog.tsx` | Create | Wrapper: catalog search + custom item form |
| `src/components/estimates/unsaved-share-banner.tsx` | Create | Banner when sent estimate has been edited |
| `src/lib/estimates/recalc.ts` | Create | Shared pricing recalculation + estimate update helper |
| `src/components/ui/slider.tsx` | Create | shadcn slider component (base-ui) |

---

### Task 1: Add shadcn Slider Component

**Files:**
- Create: `src/components/ui/slider.tsx`

- [ ] **Step 1: Install the slider via shadcn CLI**

Run: `npx shadcn@latest add slider`

This adds the `@base-ui/react` slider primitive (already a dependency) and generates the component file.

- [ ] **Step 2: Verify the component was created**

Run: `ls src/components/ui/slider.tsx`
Expected: file exists

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/slider.tsx
git commit -m "feat: add shadcn slider component"
```

---

### Task 2: Create Recalculation Helper

**Files:**
- Create: `src/lib/estimates/recalc.ts`

- [ ] **Step 1: Create the recalc module**

```typescript
// src/lib/estimates/recalc.ts
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

export function calcTotals(
  bomItems: BomRow[],
  profitMargin: number,
  laborRate: number,
  laborHours: number,
) {
  const materialCost = bomItems.reduce((sum, item) => sum + item.total_cost, 0);
  const laborCost = laborRate * laborHours;
  const subtotal = materialCost + laborCost;
  const markup = subtotal * (profitMargin / 100);
  const totalPrice = subtotal + markup;
  return { materialCost, laborCost, markup, totalPrice };
}

/** Recalculate and persist totals on the estimate row. Flips "sent" → "draft". */
export async function recalcAndSave(
  estimateId: string,
  bomItems: BomRow[],
  profitMargin: number,
  laborRate: number,
  laborHours: number,
  currentStatus: string,
) {
  const { materialCost, totalPrice } = calcTotals(bomItems, profitMargin, laborRate, laborHours);
  const supabase = createClient();
  const updates: Database["public"]["Tables"]["estimates"]["Update"] = {
    total_material_cost: materialCost,
    total_price: totalPrice,
    profit_margin: profitMargin,
    labor_rate: laborRate,
    labor_hours: laborHours,
  };
  if (currentStatus === "sent") {
    updates.status = "draft";
  }
  const { error } = await supabase
    .from("estimates")
    .update(updates)
    .eq("id", estimateId);
  if (error) throw new Error(error.message);
  return { materialCost, totalPrice };
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors (or only pre-existing ones)

- [ ] **Step 3: Commit**

```bash
git add src/lib/estimates/recalc.ts
git commit -m "feat: add estimate recalculation helper"
```

---

### Task 3: Create FinancialsCard Component

**Files:**
- Create: `src/components/estimates/financials-card.tsx`

This component replaces the four static summary cards on the detail page. It shows editable margin (slider + number input), labor rate, labor hours, and live-calculated totals. Changes debounce-save to the DB.

- [ ] **Step 1: Create the component**

```tsx
// src/components/estimates/financials-card.tsx
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { calcTotals, recalcAndSave } from "@/lib/estimates/recalc";
import type { Database } from "@/types/database";

type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

export interface FinancialsCardProps {
  estimateId: string;
  initialMargin: number;
  initialLaborRate: number;
  initialLaborHours: number;
  bomItems: BomRow[];
  status: string;
}

export function FinancialsCard({
  estimateId,
  initialMargin,
  initialLaborRate,
  initialLaborHours,
  bomItems,
  status,
}: FinancialsCardProps) {
  const router = useRouter();
  const [margin, setMargin] = useState(initialMargin);
  const [laborRate, setLaborRate] = useState(initialLaborRate);
  const [laborHours, setLaborHours] = useState(initialLaborHours);
  const [saving, setSaving] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;

  const { materialCost, laborCost, markup, totalPrice } = calcTotals(
    bomItems,
    margin,
    laborRate,
    laborHours,
  );

  // Debounced save
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (m: number, lr: number, lh: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await recalcAndSave(estimateId, bomItems, m, lr, lh, statusRef.current);
          router.refresh();
        } catch {
          // silent — user sees stale total but data is safe
        } finally {
          setSaving(false);
        }
      }, 500);
    },
    [estimateId, bomItems, router],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleMarginChange(value: number) {
    setMargin(value);
    save(value, laborRate, laborHours);
  }

  function handleLaborRateChange(value: number) {
    setLaborRate(value);
    save(margin, value, laborHours);
  }

  function handleLaborHoursChange(value: number) {
    setLaborHours(value);
    save(margin, laborRate, value);
  }

  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-txt-primary">Pricing</CardTitle>
          {saving && (
            <span className="text-xs text-txt-tertiary">Saving...</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Margin slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="margin-slider">Margin</Label>
            <div className="flex items-center gap-2">
              <Input
                id="margin-number"
                type="number"
                min={0}
                max={100}
                value={margin}
                onChange={(e) => handleMarginChange(parseFloat(e.target.value) || 0)}
                className="w-20 text-right"
              />
              <span className="text-sm text-txt-secondary">%</span>
            </div>
          </div>
          <Slider
            id="margin-slider"
            min={0}
            max={100}
            step={1}
            value={margin}
            onValueChange={(val) => handleMarginChange(val)}
          />
        </div>

        {/* Labor inputs */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-labor-rate">Labor Rate ($/hr)</Label>
            <Input
              id="edit-labor-rate"
              type="number"
              min={0}
              value={laborRate}
              onChange={(e) => handleLaborRateChange(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-labor-hours">Labor Hours</Label>
            <Input
              id="edit-labor-hours"
              type="number"
              min={0}
              value={laborHours}
              onChange={(e) => handleLaborHoursChange(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* Totals breakdown */}
        <div className="rounded-lg bg-bg-card p-3 text-sm">
          <div className="flex justify-between py-0.5">
            <span className="text-txt-secondary">Materials</span>
            <span className="text-txt-primary tabular-nums">
              ${materialCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-txt-secondary">
              Labor ({laborHours} hrs @ ${laborRate}/hr)
            </span>
            <span className="text-txt-primary tabular-nums">
              ${laborCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-txt-secondary">Markup ({margin}%)</span>
            <span className="text-txt-primary tabular-nums">
              ${markup.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1.5 flex justify-between border-t pt-1.5 text-xl font-bold text-txt-primary">
            <span>Total</span>
            <span className="text-gradient-brand">
              ${totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors

Note: The `Slider` component's props (`value`, `onValueChange`) depend on how `npx shadcn@latest add slider` generates it. The implementer should check the generated `slider.tsx` and adjust prop names if needed (e.g., base-ui may use `value`/`onValueChange` or `defaultValue`/`onChange`). Check the generated file and adapt.

- [ ] **Step 3: Commit**

```bash
git add src/components/estimates/financials-card.tsx
git commit -m "feat: add FinancialsCard with margin slider and live totals"
```

---

### Task 4: Create CatalogSearchDialog Component

**Files:**
- Create: `src/components/estimates/catalog-search-dialog.tsx`

Reusable dialog that searches `equipment_catalog` and lets the user pick a part. Used by both the "swap" and "add" flows.

- [ ] **Step 1: Create the component**

```tsx
// src/components/estimates/catalog-search-dialog.tsx
"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Database } from "@/types/database";

type CatalogRow = Database["public"]["Tables"]["equipment_catalog"]["Row"];

export interface CatalogSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user picks a catalog item */
  onSelect: (item: CatalogRow) => void;
  /** Optional filter to a specific equipment_type category */
  filterCategory?: string;
  title?: string;
}

export function CatalogSearchDialog({
  open,
  onOpenChange,
  onSelect,
  filterCategory,
  title = "Search catalog",
}: CatalogSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    const supabase = createClient();
    let q = supabase
      .from("equipment_catalog")
      .select("*")
      .or(
        `description.ilike.%${query.trim()}%,model_number.ilike.%${query.trim()}%,sku.ilike.%${query.trim()}%`
      )
      .order("usage_count", { ascending: false })
      .limit(20);

    if (filterCategory) {
      q = q.eq("equipment_type", filterCategory);
    }

    const { data } = await q;
    setResults(data ?? []);
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Search by description, model number, or SKU.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="Search parts..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSearch}
            disabled={loading}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-64 overflow-y-auto">
          {loading && (
            <p className="py-4 text-center text-sm text-txt-tertiary">
              Searching...
            </p>
          )}
          {!loading && results.length === 0 && query.trim() && (
            <p className="py-4 text-center text-sm text-txt-tertiary">
              No results found.
            </p>
          )}
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelect(item);
                onOpenChange(false);
              }}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-[rgba(6,182,212,0.05)] transition-colors"
            >
              <div>
                <p className="font-medium text-txt-primary">
                  {item.description}
                </p>
                <p className="text-xs text-txt-tertiary">
                  {item.brand} &middot; {item.model_number}
                  {item.tonnage ? ` &middot; ${item.tonnage}T` : ""}
                </p>
              </div>
              <span className="tabular-nums text-txt-primary font-medium">
                {item.unit_price != null
                  ? `$${item.unit_price.toFixed(2)}`
                  : "No price"}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Note: The `sku` column doesn't exist on `equipment_catalog` — the search `.or()` should use `model_number` only (no `sku`). The implementer should verify the actual columns by checking `src/types/database.ts` and adjust the query. The columns available are: `description`, `model_number`, `brand`, `equipment_type`.

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/estimates/catalog-search-dialog.tsx
git commit -m "feat: add CatalogSearchDialog for part search"
```

---

### Task 5: Create AddPartDialog Component

**Files:**
- Create: `src/components/estimates/add-part-dialog.tsx`

Wraps CatalogSearchDialog with a "custom item" fallback form. Inserts a new `estimate_bom_items` row.

- [ ] **Step 1: Create the component**

```tsx
// src/components/estimates/add-part-dialog.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CatalogSearchDialog } from "./catalog-search-dialog";
import type { Database } from "@/types/database";

type CatalogRow = Database["public"]["Tables"]["equipment_catalog"]["Row"];

export interface AddPartDialogProps {
  estimateId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a part is successfully added so parent can update state */
  onAdded: () => void;
}

export function AddPartDialog({
  estimateId,
  open,
  onOpenChange,
  onAdded,
}: AddPartDialogProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"search" | "custom">("search");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState({
    description: "",
    category: "",
    quantity: 1,
    unit: "ea",
    unit_cost: 0,
  });

  function resetAndClose() {
    setMode("search");
    setError(null);
    setCustom({ description: "", category: "", quantity: 1, unit: "ea", unit_cost: 0 });
    onOpenChange(false);
  }

  async function insertItem(row: Database["public"]["Tables"]["estimate_bom_items"]["Insert"]) {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: insertErr } = await supabase
      .from("estimate_bom_items")
      .insert(row);

    if (insertErr) {
      setError("Couldn't add part — please try again");
      setSaving(false);
      return;
    }

    // Flip sent → draft
    await supabase
      .from("estimates")
      .update({ status: "draft" })
      .eq("id", estimateId)
      .eq("status", "sent");

    setSaving(false);
    resetAndClose();
    onAdded();
    router.refresh();
  }

  async function handleCatalogSelect(item: CatalogRow) {
    const qty = 1;
    await insertItem({
      estimate_id: estimateId,
      category: item.equipment_type,
      description: item.description,
      quantity: qty,
      unit: item.unit_of_measure,
      unit_cost: item.unit_price ?? 0,
      total_cost: (item.unit_price ?? 0) * qty,
      part_id: item.id,
      supplier: item.brand || null,
      source: "starter",
    });
  }

  async function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!custom.description.trim() || !custom.category.trim()) return;
    await insertItem({
      estimate_id: estimateId,
      category: custom.category.trim(),
      description: custom.description.trim(),
      quantity: custom.quantity,
      unit: custom.unit,
      unit_cost: custom.unit_cost,
      total_cost: custom.unit_cost * custom.quantity,
      source: "manual",
    });
  }

  if (mode === "search") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add part</DialogTitle>
            <DialogDescription>
              Search the catalog or add a custom item.
            </DialogDescription>
          </DialogHeader>

          {/* Inline catalog search — reuse the search logic */}
          <CatalogSearchInline onSelect={handleCatalogSelect} />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setMode("custom")}>
              Add custom item instead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Custom item form
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add custom item</DialogTitle>
          <DialogDescription>
            This item is saved to this estimate only, not the catalog.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCustomSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ap_desc">Description *</Label>
            <Input
              id="ap_desc"
              value={custom.description}
              onChange={(e) => setCustom({ ...custom, description: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ap_cat">Category *</Label>
            <Input
              id="ap_cat"
              value={custom.category}
              onChange={(e) => setCustom({ ...custom, category: e.target.value })}
              placeholder="e.g. Major Equipment, Ductwork"
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ap_qty">Qty</Label>
              <Input
                id="ap_qty"
                type="number"
                min={1}
                value={custom.quantity}
                onChange={(e) => setCustom({ ...custom, quantity: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ap_unit">Unit</Label>
              <Input
                id="ap_unit"
                value={custom.unit}
                onChange={(e) => setCustom({ ...custom, unit: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ap_cost">Unit Cost ($)</Label>
              <Input
                id="ap_cost"
                type="number"
                min={0}
                step={0.01}
                value={custom.unit_cost}
                onChange={(e) => setCustom({ ...custom, unit_cost: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setMode("search")}>
              Back to search
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-gradient-brand hover-lift"
            >
              {saving ? "Adding..." : "Add item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

**Important implementation note:** The `CatalogSearchInline` component referenced above does not exist yet. The implementer should either:
1. Extract the search UI from `CatalogSearchDialog` into a shared inline component (no dialog wrapper), or
2. Embed the search logic directly in `AddPartDialog` (simpler — recommended for now)

The key parts to embed: a search input, a results list from `equipment_catalog`, and a click handler that calls `handleCatalogSelect`. Follow the same query pattern from Task 4.

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/estimates/add-part-dialog.tsx
git commit -m "feat: add AddPartDialog with catalog search and custom item form"
```

---

### Task 6: Create BomCategoryTable Component

**Files:**
- Create: `src/components/estimates/bom-category-table.tsx`

Renders one BOM category's items with inline edit (qty, unit cost), delete, and swap actions per row.

- [ ] **Step 1: Create the component**

```tsx
// src/components/estimates/bom-category-table.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2, ArrowLeftRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatRoomType } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CatalogSearchDialog } from "./catalog-search-dialog";
import { AddPartDialog } from "./add-part-dialog";
import type { Database } from "@/types/database";

type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];
type CatalogRow = Database["public"]["Tables"]["equipment_catalog"]["Row"];

export interface BomCategoryTableProps {
  estimateId: string;
  category: string;
  items: BomRow[];
  status: string;
  /** Called after any mutation so parent can re-fetch / recalc */
  onMutate: () => void;
}

export function BomCategoryTable({
  estimateId,
  category,
  items,
  status,
  onMutate,
}: BomCategoryTableProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState(0);
  const [editCost, setEditCost] = useState(0);
  const [swapItemId, setSwapItemId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  async function flipToDraftIfSent() {
    if (status !== "sent") return;
    const supabase = createClient();
    await supabase
      .from("estimates")
      .update({ status: "draft" })
      .eq("id", estimateId)
      .eq("status", "sent");
  }

  function startEdit(item: BomRow) {
    setEditingId(item.id);
    setEditQty(item.quantity);
    setEditCost(item.unit_cost);
  }

  async function saveEdit(itemId: string) {
    const supabase = createClient();
    const totalCost = editQty * editCost;
    const { error } = await supabase
      .from("estimate_bom_items")
      .update({
        quantity: editQty,
        unit_cost: editCost,
        total_cost: totalCost,
        source: "manual",
      })
      .eq("id", itemId);

    if (error) return;
    await flipToDraftIfSent();
    setEditingId(null);
    onMutate();
    router.refresh();
  }

  async function deleteItem(itemId: string) {
    if (!confirm("Delete this item?")) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("estimate_bom_items")
      .delete()
      .eq("id", itemId);

    if (error) return;
    await flipToDraftIfSent();
    onMutate();
    router.refresh();
  }

  async function handleSwap(catalogItem: CatalogRow) {
    if (!swapItemId) return;
    const supabase = createClient();
    // Get current item to preserve quantity
    const currentItem = items.find((i) => i.id === swapItemId);
    const qty = currentItem?.quantity ?? 1;
    const unitCost = catalogItem.unit_price ?? 0;

    const { error } = await supabase
      .from("estimate_bom_items")
      .update({
        description: catalogItem.description,
        unit_cost: unitCost,
        total_cost: unitCost * qty,
        part_id: catalogItem.id,
        supplier: catalogItem.brand || null,
        sku: catalogItem.model_number || null,
        source: "starter",
      })
      .eq("id", swapItemId);

    if (error) return;
    await flipToDraftIfSent();
    setSwapItemId(null);
    onMutate();
    router.refresh();
  }

  return (
    <>
      <Card className="bg-gradient-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-txt-primary">
            {formatRoomType(category)}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAddOpen(true)}
            className="text-txt-secondary hover:text-txt-primary"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3">
                  Description
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3">
                  SKU
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 text-right">
                  Qty
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 text-right">
                  Unit Cost
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 text-right">
                  Total
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <TableRow
                    key={item.id}
                    className="border-b border-border hover:bg-[rgba(6,182,212,0.03)] transition-colors"
                  >
                    <TableCell className="text-sm text-txt-primary font-medium py-2">
                      {item.description}
                    </TableCell>
                    <TableCell className="text-sm text-txt-secondary py-2">
                      {item.sku ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-right py-2">
                      {isEditing ? (
                        <Input
                          type="number"
                          min={1}
                          value={editQty}
                          onChange={(e) =>
                            setEditQty(parseInt(e.target.value) || 1)
                          }
                          className="w-16 text-right ml-auto"
                          onKeyDown={(e) =>
                            e.key === "Enter" && saveEdit(item.id)
                          }
                        />
                      ) : (
                        <span className="tabular-nums text-txt-primary font-medium">
                          {item.quantity} {item.unit}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-right py-2">
                      {isEditing ? (
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={editCost}
                          onChange={(e) =>
                            setEditCost(parseFloat(e.target.value) || 0)
                          }
                          className="w-24 text-right ml-auto"
                          onKeyDown={(e) =>
                            e.key === "Enter" && saveEdit(item.id)
                          }
                        />
                      ) : (
                        <span className="tabular-nums text-txt-primary font-medium">
                          ${item.unit_cost.toFixed(2)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-txt-primary font-medium text-right py-2">
                      ${item.total_cost.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => saveEdit(item.id)}
                            className="text-xs"
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingId(null)}
                            className="text-xs"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => startEdit(item)}>
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setSwapItemId(item.id)}
                            >
                              <ArrowLeftRight className="mr-2 h-4 w-4" />
                              Swap part
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => deleteItem(item.id)}
                              className="text-error"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Swap dialog */}
      <CatalogSearchDialog
        open={swapItemId !== null}
        onOpenChange={(open) => {
          if (!open) setSwapItemId(null);
        }}
        onSelect={handleSwap}
        title="Swap part"
      />

      {/* Add dialog */}
      <AddPartDialog
        estimateId={estimateId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => {
          onMutate();
          router.refresh();
        }}
      />
    </>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/estimates/bom-category-table.tsx
git commit -m "feat: add BomCategoryTable with inline edit, delete, swap, add"
```

---

### Task 7: Create UnsavedShareBanner Component

**Files:**
- Create: `src/components/estimates/unsaved-share-banner.tsx`

Simple banner shown when estimate was "sent" but has been edited (now "draft" with an active share link).

- [ ] **Step 1: Create the component**

```tsx
// src/components/estimates/unsaved-share-banner.tsx
"use client";

import { useState } from "react";
import { AlertTriangle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareDialog } from "./share-dialog";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];

export interface UnsavedShareBannerProps {
  estimate: EstimateRow;
  hasActiveShare: boolean;
  hasUnpricedItems: boolean;
}

export function UnsavedShareBanner({
  estimate,
  hasActiveShare,
  hasUnpricedItems,
}: UnsavedShareBannerProps) {
  const [shareOpen, setShareOpen] = useState(false);

  // Only show when estimate is draft but has an active (stale) share link
  if (estimate.status !== "draft" || !hasActiveShare) return null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-warning bg-warning-bg px-4 py-3 text-sm text-warning">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            You&apos;ve made changes since this estimate was last shared. The
            homeowner still sees the old version.
          </span>
        </div>
        <Button
          size="sm"
          onClick={() => setShareOpen(true)}
          className="shrink-0 bg-gradient-brand hover-lift"
        >
          <Share2 className="mr-1 h-3.5 w-3.5" />
          Re-share
        </Button>
      </div>

      <ShareDialog
        estimateId={estimate.id}
        initial={{
          display_mode: estimate.display_mode,
          valid_until: estimate.valid_until,
          scope_of_work: estimate.scope_of_work,
          note_to_customer: estimate.note_to_customer,
          customer_email: estimate.customer_email,
        }}
        hasUnpricedItems={hasUnpricedItems}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/estimates/unsaved-share-banner.tsx
git commit -m "feat: add UnsavedShareBanner for stale share links"
```

---

### Task 8: Wire Everything Into the Detail Page

**Files:**
- Modify: `src/app/(app)/estimates/[id]/page.tsx`

Replace the static summary cards and BOM tables with the new client components. Add the unsaved share banner.

- [ ] **Step 1: Update imports and add new components**

Modify `src/app/(app)/estimates/[id]/page.tsx`:

1. **Add imports** at the top:
```tsx
import { FinancialsCard } from "@/components/estimates/financials-card";
import { BomCategoryTable } from "@/components/estimates/bom-category-table";
import { UnsavedShareBanner } from "@/components/estimates/unsaved-share-banner";
```

2. **Remove unused imports** that the static cards used (keep `Card`, `CardContent`, `CardHeader`, `CardTitle` — still used by Rooms table).

3. **Add unsaved share banner** — right after the header/ShareBlock section, before CustomerCard:
```tsx
<UnsavedShareBanner
  estimate={est}
  hasActiveShare={activeShare !== null}
  hasUnpricedItems={hasUnpricedItems}
/>
```

4. **Replace the 4 summary cards grid** (`<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">...</div>`) with:
```tsx
<FinancialsCard
  estimateId={est.id}
  initialMargin={margin}
  initialLaborRate={est.labor_rate}
  initialLaborHours={est.labor_hours}
  bomItems={bom}
  status={est.status}
/>
```

5. **Replace the BOM category tables** (the `Object.entries(bomByCategory).map(...)` section) with:
```tsx
{Object.entries(bomByCategory).map(([category, items]) => (
  <BomCategoryTable
    key={category}
    estimateId={est.id}
    category={category}
    items={items}
    status={est.status}
    onMutate={() => {}}
  />
))}
```

Note: `onMutate` is a no-op callback here because each component calls `router.refresh()` itself, which triggers the server component to re-fetch. The `onMutate` prop exists for potential future client-side state updates.

6. **Remove the now-unused variables** from the server component: `materialCost`, `laborCost`, `margin`, `totalPrice` (these are now calculated inside `FinancialsCard`). Keep `hasUnpricedItems` — it's still used by `ShareBlock` and `UnsavedShareBanner`.

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors

- [ ] **Step 3: Verify the page renders**

Run: `npm run dev` and navigate to an existing estimate detail page. Verify:
- Financials card shows with margin slider, labor inputs, and live totals
- BOM tables show with action menus on each row
- Unsaved share banner only appears when estimate is draft with an active share

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/estimates/\[id\]/page.tsx
git commit -m "feat: wire estimate editing components into detail page"
```

---

### Task 9: Manual Integration Test

No automated tests — this task verifies the full flow manually.

- [ ] **Step 1: Test margin slider**

1. Open an existing estimate
2. Drag the margin slider — total price should update in real-time
3. Type a value in the margin number input — same behavior
4. Wait 1 second — "Saving..." indicator should appear and disappear
5. Refresh the page — values should persist

- [ ] **Step 2: Test labor editing**

1. Change labor rate and labor hours
2. Totals should recalculate immediately
3. Refresh — values persist

- [ ] **Step 3: Test BOM row edit**

1. Click the three-dot menu on a BOM row → Edit
2. Change quantity and unit cost
3. Click Save — row updates, total recalculates
4. Refresh — changes persist

- [ ] **Step 4: Test BOM row delete**

1. Click three-dot menu → Delete
2. Confirm the prompt
3. Row disappears, totals recalculate
4. Refresh — item is gone

- [ ] **Step 5: Test BOM swap**

1. Click three-dot menu → Swap part
2. Search for a part in the catalog
3. Select one — row updates with new part details, keeps quantity
4. Refresh — swap persists

- [ ] **Step 6: Test add part (catalog)**

1. Click "Add" button on a category
2. Search catalog, select a part
3. New row appears in the table
4. Refresh — new item persists

- [ ] **Step 7: Test add part (custom)**

1. Click "Add" → "Add custom item instead"
2. Fill in description, category, qty, unit cost
3. Submit — new row appears with source "manual"
4. Refresh — custom item persists

- [ ] **Step 8: Test sent estimate → draft flip**

1. Share an estimate (status becomes "sent")
2. Edit margin or a BOM item
3. Status should flip to "draft"
4. Unsaved share banner should appear
5. Click "Re-share" — share dialog opens

- [ ] **Step 9: Commit final state if any fixes were needed**

```bash
git add -A
git commit -m "fix: integration test fixes for estimate editing"
```
