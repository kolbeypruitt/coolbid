# coolbid-rewrite-poc — Plan 3 of 7: Catalog Editor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/catalog` placeholder with a real editable table of the contractor's catalog. Contractor can see all 35 seeded rows, edit any field via a dialog, add custom rows, and toggle rows inactive. Server actions handle writes. No inline editing for POC — row-level edit dialog is simpler and less buggy.

**Architecture:** Server component at `/catalog` fetches the contractor's rows grouped by `customer_category`. A client `<CatalogTable>` renders with per-row Edit buttons and a top "Add item" button. Edits go through server actions that validate with Zod and call `revalidatePath` on success.

**Tech Stack:** Next 16 server actions, shadcn `table` + `dialog` + `switch` primitives, Zod for validation.

**Spec:** `docs/superpowers/specs/2026-04-18-coolbid-rewrite-poc-design.md` §5.10.

**Plan 2 handoff state:** POC repo `main` has 28 commits, merged `feature/plan-2-schema-onboarding-settings`. `contractor_catalog` table exists with 35 seeded rows per onboarded user. Types regenerated. Server actions + onboarding + settings all work. Pushed to `origin/main`.

**Commit discipline:** feature branch `feature/plan-3-catalog-editor` in POC repo. Plan doc on `main` in coolbid via `/commit`. Each task ends in one commit.

---

## Task 1: Feature branch + plan import

- [ ] **Step 1:** Branch + copy plan doc

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
git checkout main
git pull
git checkout -b feature/plan-3-catalog-editor
cp /Users/kolbeypruitt/Workspace/coolbid/docs/superpowers/plans/2026-04-18-coolbid-rewrite-poc-plan-3-catalog-editor.md \
   docs/plans/plan-3-catalog-editor.md
```

- [ ] **Step 2:** Commit

```bash
git add docs/plans/plan-3-catalog-editor.md
git commit -m "docs: import plan-3 (catalog editor)"
```

---

## Task 2: Install shadcn primitives

- [ ] **Step 1:** Install table, dialog, switch, badge

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx shadcn@latest add table dialog switch badge
```

If prompted to overwrite existing files, answer "no". If new deps land in `package.json`, stage them.

- [ ] **Step 2:** Verify compile + commit

```bash
npx tsc --noEmit && npm run lint
git add src/components/ui/table.tsx src/components/ui/dialog.tsx src/components/ui/switch.tsx src/components/ui/badge.tsx package.json package-lock.json
git commit -m "feat(ui): shadcn table + dialog + switch + badge primitives"
```

---

## Task 3: Catalog server actions

**Files:**
- Create: `src/lib/catalog/actions.ts`

- [ ] **Step 1:** Write the actions

```ts
// src/lib/catalog/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ItemPatchSchema = z.object({
  id: z.string().uuid(),
  slot: z.string().trim().min(1).max(120),
  customer_category: z.string().trim().min(1).max(80),
  tier: z.enum(["good", "better", "best"]).nullable(),
  name: z.string().trim().min(1).max(200),
  unit: z.enum(["each", "ft", "lb", "job"]),
  default_quantity: z.coerce.number().nonnegative().max(100000).nullable(),
  price_low: z.coerce.number().nonnegative().max(1000000),
  price_mid: z.coerce.number().nonnegative().max(1000000),
  price_high: z.coerce.number().nonnegative().max(1000000),
  notes: z.string().trim().max(2000).nullable(),
});

const ItemInsertSchema = ItemPatchSchema.omit({ id: true });

export type CatalogActionState = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
};

function zodIssuesToErrors(issues: z.ZodIssue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0]?.toString() ?? "_";
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

function normalizeNullable(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = v.toString().trim();
  return s === "" ? null : s;
}

export async function updateCatalogItem(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const raw = {
    id: formData.get("id"),
    slot: formData.get("slot"),
    customer_category: formData.get("customer_category"),
    tier: normalizeNullable(formData.get("tier")),
    name: formData.get("name"),
    unit: formData.get("unit"),
    default_quantity: normalizeNullable(formData.get("default_quantity")),
    price_low: formData.get("price_low"),
    price_mid: formData.get("price_mid"),
    price_high: formData.get("price_high"),
    notes: normalizeNullable(formData.get("notes")),
  };
  const parsed = ItemPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: zodIssuesToErrors(parsed.error.issues), message: "Please fix the highlighted fields." };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { error } = await supabase
    .from("contractor_catalog")
    .update({
      slot: data.slot,
      customer_category: data.customer_category,
      tier: data.tier,
      name: data.name,
      unit: data.unit,
      default_quantity: data.default_quantity,
      price_low: data.price_low,
      price_mid: data.price_mid,
      price_high: data.price_high,
      notes: data.notes,
    })
    .eq("id", data.id)
    .eq("contractor_id", user.id);
  if (error) return { ok: false, message: `Save failed: ${error.message}` };

  revalidatePath("/catalog");
  return { ok: true, message: "Saved." };
}

export async function addCatalogItem(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const raw = {
    slot: formData.get("slot"),
    customer_category: formData.get("customer_category"),
    tier: normalizeNullable(formData.get("tier")),
    name: formData.get("name"),
    unit: formData.get("unit"),
    default_quantity: normalizeNullable(formData.get("default_quantity")),
    price_low: formData.get("price_low"),
    price_mid: formData.get("price_mid"),
    price_high: formData.get("price_high"),
    notes: normalizeNullable(formData.get("notes")),
  };
  const parsed = ItemInsertSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: zodIssuesToErrors(parsed.error.issues), message: "Please fix the highlighted fields." };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { error } = await supabase.from("contractor_catalog").insert({
    contractor_id: user.id,
    slot: data.slot,
    customer_category: data.customer_category,
    tier: data.tier,
    name: data.name,
    unit: data.unit,
    default_quantity: data.default_quantity,
    price_low: data.price_low,
    price_mid: data.price_mid,
    price_high: data.price_high,
    notes: data.notes,
    source: "custom",
  });
  if (error) return { ok: false, message: `Add failed: ${error.message}` };

  revalidatePath("/catalog");
  return { ok: true, message: "Added." };
}

export async function toggleCatalogItemActive(
  itemId: string,
  nextActive: boolean,
): Promise<{ ok: boolean; message?: string }> {
  if (typeof itemId !== "string" || !itemId) return { ok: false, message: "Bad id." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { error } = await supabase
    .from("contractor_catalog")
    .update({ is_active: nextActive })
    .eq("id", itemId)
    .eq("contractor_id", user.id);
  if (error) return { ok: false, message: `Toggle failed: ${error.message}` };

  revalidatePath("/catalog");
  return { ok: true };
}
```

- [ ] **Step 2:** Verify compile + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
mkdir -p src/lib/catalog
npx tsc --noEmit && npm run lint
git add src/lib/catalog/actions.ts
git commit -m "feat(catalog): update/add/toggle server actions with Zod validation"
```

---

## Task 4: Catalog data loader

**Files:**
- Create: `src/lib/catalog/load.ts`

- [ ] **Step 1:** Write the loader

```ts
// src/lib/catalog/load.ts
import { createClient } from "@/lib/supabase/server";
import { catalogRowToItem, type CatalogItem } from "@/types/catalog";

export async function loadContractorCatalog(): Promise<CatalogItem[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("contractor_catalog")
    .select("*")
    .eq("contractor_id", user.id)
    .order("customer_category", { ascending: true })
    .order("slot", { ascending: true })
    .order("tier", { ascending: true, nullsFirst: true })
    .order("name", { ascending: true });
  if (error) {
    console.error("loadContractorCatalog:", error);
    return [];
  }
  return (data ?? []).map(catalogRowToItem);
}
```

- [ ] **Step 2:** Verify + commit

```bash
npx tsc --noEmit
git add src/lib/catalog/load.ts
git commit -m "feat(catalog): server-side loader for contractor's catalog"
```

---

## Task 5: Catalog item edit dialog (client component)

**Files:**
- Create: `src/components/catalog/catalog-edit-dialog.tsx`

- [ ] **Step 1:** Write the dialog

```tsx
// src/components/catalog/catalog-edit-dialog.tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { updateCatalogItem, type CatalogActionState } from "@/lib/catalog/actions";
import type { CatalogItem } from "@/types/catalog";

const TIERS: Array<{ value: string; label: string }> = [
  { value: "", label: "— none —" },
  { value: "good", label: "good" },
  { value: "better", label: "better" },
  { value: "best", label: "best" },
];
const UNITS = ["each", "ft", "lb", "job"] as const;

type Props = {
  item: CatalogItem;
  trigger: React.ReactNode;
};

export function CatalogEditDialog({ item, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<CatalogActionState, FormData>(
    updateCatalogItem,
    { ok: true },
  );
  const err = state.errors ?? {};

  // Close on successful save
  if (state.ok && state.message === "Saved." && open) {
    // Defer to avoid setState during render.
    queueMicrotask(() => setOpen(false));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit catalog item</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={item.id} />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="slot">Slot</Label>
              <Input id="slot" name="slot" defaultValue={item.slot} required />
              {err.slot && <p className="text-sm text-destructive">{err.slot}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_category">Customer category</Label>
              <Input id="customer_category" name="customer_category" defaultValue={item.customerCategory} required />
              {err.customer_category && <p className="text-sm text-destructive">{err.customer_category}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={item.name} required />
            {err.name && <p className="text-sm text-destructive">{err.name}</p>}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tier">Tier</Label>
              <Select name="tier" defaultValue={item.tier ?? ""}>
                <SelectTrigger id="tier"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Select name="unit" defaultValue={item.unit}>
                <SelectTrigger id="unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="default_quantity">Default qty</Label>
              <Input id="default_quantity" name="default_quantity" type="number" step="0.01" min="0" defaultValue={item.defaultQuantity ?? ""} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price_low">Price low</Label>
              <Input id="price_low" name="price_low" type="number" step="0.01" min="0" defaultValue={item.priceLow} required />
              {err.price_low && <p className="text-sm text-destructive">{err.price_low}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="price_mid">Price mid</Label>
              <Input id="price_mid" name="price_mid" type="number" step="0.01" min="0" defaultValue={item.priceMid} required />
              {err.price_mid && <p className="text-sm text-destructive">{err.price_mid}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="price_high">Price high</Label>
              <Input id="price_high" name="price_high" type="number" step="0.01" min="0" defaultValue={item.priceHigh} required />
              {err.price_high && <p className="text-sm text-destructive">{err.price_high}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={item.notes ?? ""} />
          </div>
          {state.message && !state.ok && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2:** Verify compile + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
mkdir -p src/components/catalog
npx tsc --noEmit && npm run lint
git add src/components/catalog/catalog-edit-dialog.tsx
git commit -m "feat(catalog): row-level edit dialog"
```

---

## Task 6: Catalog add-item dialog

**Files:**
- Create: `src/components/catalog/catalog-add-dialog.tsx`

- [ ] **Step 1:** Write the add dialog

```tsx
// src/components/catalog/catalog-add-dialog.tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { addCatalogItem, type CatalogActionState } from "@/lib/catalog/actions";

const TIERS: Array<{ value: string; label: string }> = [
  { value: "", label: "— none —" },
  { value: "good", label: "good" },
  { value: "better", label: "better" },
  { value: "best", label: "best" },
];
const UNITS = ["each", "ft", "lb", "job"] as const;

export function CatalogAddDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<CatalogActionState, FormData>(
    addCatalogItem,
    { ok: true },
  );
  const err = state.errors ?? {};

  if (state.ok && state.message === "Added." && open) {
    queueMicrotask(() => setOpen(false));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add catalog item</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="slot">Slot</Label>
              <Input id="slot" name="slot" placeholder="e.g. major_equipment.condenser" required />
              {err.slot && <p className="text-sm text-destructive">{err.slot}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_category">Customer category</Label>
              <Input id="customer_category" name="customer_category" placeholder="e.g. Major Equipment" required />
              {err.customer_category && <p className="text-sm text-destructive">{err.customer_category}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="e.g. AC Condenser, 5-ton premium" required />
            {err.name && <p className="text-sm text-destructive">{err.name}</p>}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tier">Tier</Label>
              <Select name="tier" defaultValue="">
                <SelectTrigger id="tier"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Select name="unit" defaultValue="each">
                <SelectTrigger id="unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="default_quantity">Default qty</Label>
              <Input id="default_quantity" name="default_quantity" type="number" step="0.01" min="0" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price_low">Price low</Label>
              <Input id="price_low" name="price_low" type="number" step="0.01" min="0" required />
              {err.price_low && <p className="text-sm text-destructive">{err.price_low}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="price_mid">Price mid</Label>
              <Input id="price_mid" name="price_mid" type="number" step="0.01" min="0" required />
              {err.price_mid && <p className="text-sm text-destructive">{err.price_mid}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="price_high">Price high</Label>
              <Input id="price_high" name="price_high" type="number" step="0.01" min="0" required />
              {err.price_high && <p className="text-sm text-destructive">{err.price_high}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
          {state.message && !state.ok && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add item"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2:** Verify + commit

```bash
npx tsc --noEmit && npm run lint
git add src/components/catalog/catalog-add-dialog.tsx
git commit -m "feat(catalog): add-item dialog"
```

---

## Task 7: Active toggle (client component)

**Files:**
- Create: `src/components/catalog/catalog-active-toggle.tsx`

- [ ] **Step 1:** Write the toggle

```tsx
// src/components/catalog/catalog-active-toggle.tsx
"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleCatalogItemActive } from "@/lib/catalog/actions";
import { toast } from "sonner";

type Props = {
  itemId: string;
  initialActive: boolean;
};

export function CatalogActiveToggle({ itemId, initialActive }: Props) {
  const [active, setActive] = useState(initialActive);
  const [pending, startTransition] = useTransition();

  return (
    <Switch
      checked={active}
      disabled={pending}
      onCheckedChange={(next) => {
        // Optimistic
        setActive(next);
        startTransition(async () => {
          const result = await toggleCatalogItemActive(itemId, next);
          if (!result.ok) {
            // Roll back
            setActive(!next);
            toast.error(result.message ?? "Toggle failed");
          }
        });
      }}
      aria-label={active ? "Active" : "Inactive"}
    />
  );
}
```

- [ ] **Step 2:** Verify + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint
git add src/components/catalog/catalog-active-toggle.tsx
git commit -m "feat(catalog): active toggle with optimistic UI + rollback"
```

---

## Task 8: Catalog table (server component that renders rows + client children)

**Files:**
- Create: `src/components/catalog/catalog-table.tsx`

- [ ] **Step 1:** Write the table

```tsx
// src/components/catalog/catalog-table.tsx
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CatalogEditDialog } from "./catalog-edit-dialog";
import { CatalogAddDialog } from "./catalog-add-dialog";
import { CatalogActiveToggle } from "./catalog-active-toggle";
import type { CatalogItem } from "@/types/catalog";

type Props = {
  items: CatalogItem[];
};

function formatRange(low: number, mid: number, high: number): string {
  return `$${low.toFixed(0)} / $${mid.toFixed(0)} / $${high.toFixed(0)}`;
}

export function CatalogTable({ items }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {items.length} items
          </h2>
          <p className="text-sm text-muted-foreground">
            Prices are low / mid / high per unit. Contractor edits override seeded values.
          </p>
        </div>
        <CatalogAddDialog
          trigger={
            <Button>
              <Plus className="size-4 mr-2" />
              Add item
            </Button>
          }
        />
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Slot</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Price range</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className={item.isActive ? "" : "opacity-50"}>
                <TableCell className="whitespace-nowrap">{item.customerCategory}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{item.slot}</TableCell>
                <TableCell className="max-w-xs">
                  {item.name}
                  {item.source === "custom" && (
                    <Badge variant="outline" className="ml-2 text-xs">custom</Badge>
                  )}
                </TableCell>
                <TableCell>{item.tier ?? "—"}</TableCell>
                <TableCell>{item.unit}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatRange(item.priceLow, item.priceMid, item.priceHigh)}
                </TableCell>
                <TableCell>
                  <CatalogActiveToggle itemId={item.id} initialActive={item.isActive} />
                </TableCell>
                <TableCell>
                  <CatalogEditDialog
                    item={item}
                    trigger={
                      <Button variant="ghost" size="sm">
                        <Pencil className="size-4" />
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** Verify compile + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint
git add src/components/catalog/catalog-table.tsx
git commit -m "feat(catalog): table with edit dialog + add dialog + active toggle"
```

---

## Task 9: /catalog page wires it all together

**Files:**
- Modify: `src/app/(app)/catalog/page.tsx`

- [ ] **Step 1:** Replace the placeholder

```tsx
// src/app/(app)/catalog/page.tsx
import { loadContractorCatalog } from "@/lib/catalog/load";
import { CatalogTable } from "@/components/catalog/catalog-table";

export default async function CatalogPage() {
  const items = await loadContractorCatalog();

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Catalog</h1>
        <p className="text-muted-foreground">
          Your personal ballpark pricing. Edit anything — these prices are what go into every estimate.
        </p>
      </div>
      <CatalogTable items={items} />
    </div>
  );
}
```

- [ ] **Step 2:** Verify build passes

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint && npm run build
```

Expected: clean. `/catalog` should be a dynamic `ƒ` route.

- [ ] **Step 3:** Commit

```bash
git add 'src/app/(app)/catalog/page.tsx'
git commit -m "feat(catalog): page renders the editable table"
```

---

## Task 10: Smoke verification + merge

- [ ] **Step 1:** Boot dev server

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npm run dev &> /tmp/coolbid-poc-dev.log &
DEV_PID=$!
sleep 5
PORT=$(grep -oP 'http://localhost:\K[0-9]+' /tmp/coolbid-poc-dev.log | head -1)
echo "Dev server on port $PORT"
```

- [ ] **Step 2:** Create + onboard a smoke user

```bash
SUPABASE_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2)
SERVICE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2)
ANON_KEY=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2)

TEST_EMAIL="smoketest-$(date +%s)@coolbid-poc.invalid"
TEST_PASSWORD="SmokeTest-$(openssl rand -hex 4)"

SIGNUP=$(curl -sX POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"email_confirm\":true}")
USER_ID=$(echo "$SIGNUP" | grep -oP '"id":"\K[^"]+' | head -1)

TOKEN_JSON=$(curl -sX POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")
ACCESS_TOKEN=$(echo "$TOKEN_JSON" | grep -oP '"access_token":"\K[^"]+')

curl -sX POST "$SUPABASE_URL/rest/v1/contractors" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
  -d "{\"id\":\"$USER_ID\",\"company_name\":\"Smoke HVAC\",\"region_code\":\"US-SOUTH-CENTRAL\",\"region_multiplier\":0.92,\"default_labor_rate\":95,\"default_margin_pct\":35,\"default_customer_view\":\"detailed\",\"onboarded_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"

curl -sX POST "$SUPABASE_URL/rest/v1/rpc/seed_contractor_catalog" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"p_contractor_id\":\"$USER_ID\",\"p_region_multiplier\":0.92}"
```

- [ ] **Step 3:** Verify PATCH on a row works (simulates Edit dialog submit)

```bash
# Pick a row, change its price_mid, verify it persists
ROW_ID=$(curl -s "$SUPABASE_URL/rest/v1/contractor_catalog?contractor_id=eq.$USER_ID&slot=eq.permits.permit_fee&select=id" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ACCESS_TOKEN" | grep -oP '"id":"\K[^"]+' | head -1)

curl -sX PATCH "$SUPABASE_URL/rest/v1/contractor_catalog?id=eq.$ROW_ID" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"price_mid": 200}' | head -5

# Verify
curl -s "$SUPABASE_URL/rest/v1/contractor_catalog?id=eq.$ROW_ID&select=price_mid" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ACCESS_TOKEN"
```

Expected: `price_mid` now `200.00`.

- [ ] **Step 4:** Verify INSERT of a custom row works

```bash
curl -sX POST "$SUPABASE_URL/rest/v1/contractor_catalog" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{
    \"contractor_id\":\"$USER_ID\",
    \"slot\":\"major_equipment.condenser\",
    \"customer_category\":\"Major Equipment\",
    \"tier\":\"best\",
    \"name\":\"Smoke-test custom condenser\",
    \"unit\":\"each\",
    \"price_low\":6000,
    \"price_mid\":6500,
    \"price_high\":7000,
    \"source\":\"custom\"
  }" | head -5
```

Expected: 201 with the inserted row echoed.

- [ ] **Step 5:** Verify count went from 35 → 36

```bash
curl -sI "$SUPABASE_URL/rest/v1/contractor_catalog?contractor_id=eq.$USER_ID&select=id" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Prefer: count=exact" | grep -i content-range
```

Expected: `content-range: 0-35/36`.

- [ ] **Step 6:** Verify toggle sets `is_active=false`

```bash
curl -sX PATCH "$SUPABASE_URL/rest/v1/contractor_catalog?id=eq.$ROW_ID" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_active": false}'
curl -s "$SUPABASE_URL/rest/v1/contractor_catalog?id=eq.$ROW_ID&select=is_active" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ACCESS_TOKEN"
```

Expected: `[{"is_active":false}]`.

- [ ] **Step 7:** Cleanup + build

```bash
kill $DEV_PID 2>/dev/null
curl -sX DELETE "$SUPABASE_URL/auth/v1/admin/users/$USER_ID" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
npm run build
```

Expected: clean build.

- [ ] **Step 8:** Merge + push

```bash
git checkout main
git merge --no-ff feature/plan-3-catalog-editor -m "feat: complete Plan 3 — catalog editor"
git branch -d feature/plan-3-catalog-editor
git push origin main
```

## Plan 3 Done — what works now

✅ `/catalog` renders the 35 seeded rows grouped by category
✅ Contractor can edit any row via dialog → server action validates via Zod + writes to DB
✅ Contractor can add custom rows via dialog
✅ Active toggle per row with optimistic UI + server rollback on error
✅ RLS enforced: actions write only to `contractor_id = auth.uid()`

## Deferred (fast-follow)

- Filter by slot / category / tier
- Search by name
- Bulk toggle / bulk delete
- Inline editing (single-click to edit cell)
- "Reset row to seed value" button
- Export/import CSV

## Next: Plan 4 — AI Pipeline & Intake
