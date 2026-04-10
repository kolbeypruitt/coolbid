# Starter Supplier Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users toggle starter suppliers on/off from the settings page, hiding their starter equipment from the catalog and estimate builder.

**Architecture:** Add `is_active` column to `suppliers` table. New settings UI section reads starter suppliers and toggles `is_active`. Catalog API and catalog search dialog filter out starter equipment from inactive suppliers.

**Tech Stack:** Supabase (migration + client queries), Next.js App Router, React, shadcn/ui

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/010_supplier_is_active.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 010_supplier_is_active.sql
-- Add is_active toggle for starter supplier visibility
alter table suppliers
  add column is_active boolean not null default true;
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db push` (or however local migrations are applied)
Expected: Migration applies cleanly, all existing suppliers get `is_active = true`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/010_supplier_is_active.sql
git commit -m "feat: add is_active column to suppliers table"
```

---

### Task 2: Update TypeScript Database Types

**Files:**
- Modify: `src/types/database.ts:248-270` (suppliers type)

- [ ] **Step 1: Add `is_active` to suppliers Row type**

In the `suppliers.Row` type, add `is_active: boolean;` after the `is_starter` field:

```typescript
      suppliers: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          contact_email: string;
          contact_phone: string;
          brands: string[];
          is_starter: boolean;
          is_active: boolean;
          created_at: string;
        };
```

- [ ] **Step 2: Add `is_active` to suppliers Insert type**

Add `is_active?: boolean;` after `is_starter`:

```typescript
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          contact_email?: string;
          contact_phone?: string;
          brands?: string[];
          is_starter?: boolean;
          is_active?: boolean;
        };
```

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add is_active to suppliers TypeScript types"
```

---

### Task 3: Starter Supplier Toggles Component

**Files:**
- Create: `src/components/settings/starter-supplier-toggles.tsx`

This component:
- Fetches suppliers where `is_starter = true` for the current user
- Renders each as a row with supplier name, brands, and a checkbox toggle
- On toggle, immediately updates `is_active` in the DB (optimistic UI with rollback on error)
- Only renders if there are starter suppliers

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { Database } from "@/types/database";

type SupplierRow = Database["public"]["Tables"]["suppliers"]["Row"];

export function StarterSupplierToggles() {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("suppliers")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_starter", true)
        .order("name");

      setSuppliers(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function handleToggle(supplier: SupplierRow) {
    const newValue = !supplier.is_active;

    // Optimistic update
    setSuppliers((prev) =>
      prev.map((s) => (s.id === supplier.id ? { ...s, is_active: newValue } : s))
    );

    const supabase = createClient();
    const { error } = await supabase
      .from("suppliers")
      .update({ is_active: newValue })
      .eq("id", supplier.id);

    if (error) {
      // Rollback
      setSuppliers((prev) =>
        prev.map((s) =>
          s.id === supplier.id ? { ...s, is_active: !newValue } : s
        )
      );
    }
  }

  if (loading || suppliers.length === 0) return null;

  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader>
        <CardTitle className="text-txt-primary">Starter Parts Lists</CardTitle>
        <CardDescription className="text-txt-secondary">
          Toggle off a supplier to hide their starter equipment from your catalog
          and estimates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {suppliers.map((supplier) => (
          <label
            key={supplier.id}
            className="flex items-center justify-between rounded-md border border-border px-4 py-3 cursor-pointer hover:bg-[rgba(6,182,212,0.03)] transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-txt-primary">
                {supplier.name}
              </p>
              {supplier.brands.length > 0 && (
                <p className="text-xs text-txt-tertiary">
                  {supplier.brands.join(", ")}
                </p>
              )}
            </div>
            <input
              type="checkbox"
              checked={supplier.is_active}
              onChange={() => handleToggle(supplier)}
              className="rounded border-border"
            />
          </label>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings/starter-supplier-toggles.tsx
git commit -m "feat: add StarterSupplierToggles component"
```

---

### Task 4: Add Toggles Section to Settings Page

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Add import**

Add this import at the top of the file, after the existing component imports:

```typescript
import { StarterSupplierToggles } from "@/components/settings/starter-supplier-toggles";
```

- [ ] **Step 2: Add the section to the JSX**

Insert `<StarterSupplierToggles />` between the Logo card and the SubscriptionStatus card (after line 271, before line 274):

```tsx
      {/* Starter Parts Lists */}
      <StarterSupplierToggles />

      {/* Subscription */}
      <SubscriptionStatus />
```

- [ ] **Step 3: Verify in browser**

Run: Start the dev server and navigate to `/settings`
Expected: "Starter Parts Lists" card appears with toggles for each starter supplier the user selected during onboarding. Toggling a switch immediately updates (no save button needed). If the user has no starter suppliers, the section doesn't render.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/settings/page.tsx
git commit -m "feat: add starter supplier toggles to settings page"
```

---

### Task 5: Filter Starter Equipment in Catalog API

**Files:**
- Modify: `src/app/api/catalog/route.ts:88-93` (the GET query builder)

The catalog API already joins `supplier:suppliers(name)`. We need to filter out rows where the supplier is inactive AND the source is `starter`.

Supabase's `.select("*, supplier:suppliers(name)")` returns `supplier` as a nested object. We can't easily filter on a joined table's column with Supabase PostgREST in one query. Instead, we'll add a post-fetch filter (same pattern already used for `isRetiredStarter`).

- [ ] **Step 1: Update the select to include `is_active` from the supplier join**

Change the select on line 90 from:

```typescript
    .select("*, supplier:suppliers(name)")
```

to:

```typescript
    .select("*, supplier:suppliers(name, is_active)")
```

- [ ] **Step 2: Add filtering logic for inactive starter suppliers**

Add a helper function after the existing `isRetiredStarter` function (after line 58):

```typescript
function isFromInactiveStarter(item: CatalogItem): boolean {
  if (item.source !== "starter") return false;
  const supplier = item.supplier as { name: string; is_active: boolean } | null;
  return supplier?.is_active === false;
}
```

- [ ] **Step 3: Apply the filter in the GET handler**

Update the filtering logic (around lines 118-121). Change:

```typescript
  const filtered = showRetired
    ? allItems
    : allItems.filter((item) => !isRetiredStarter(item, allItems));
```

to:

```typescript
  const activeItems = allItems.filter((item) => !isFromInactiveStarter(item));

  const filtered = showRetired
    ? activeItems
    : activeItems.filter((item) => !isRetiredStarter(item, activeItems));
```

Note: inactive starter filtering always applies (not gated by `showRetired`). A user who toggled off a supplier never wants to see that starter data.

- [ ] **Step 4: Verify in browser**

Run: Toggle off a starter supplier in settings, navigate to `/parts-database`
Expected: Starter equipment from the toggled-off supplier no longer appears. Non-starter equipment (source = 'quote' or 'manual') from the same supplier still appears. Toggling the supplier back on restores the equipment.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/catalog/route.ts
git commit -m "feat: filter inactive starter equipment from catalog API"
```

---

### Task 6: Filter Starter Equipment in Catalog Search Dialog

**Files:**
- Modify: `src/components/estimates/catalog-search-dialog.tsx:52-59`

The catalog search dialog queries `equipment_catalog` directly via Supabase client. It needs to exclude starter items from inactive suppliers too.

- [ ] **Step 1: Update the query to join suppliers and filter**

Replace the query block (lines 52-59):

```typescript
    let q = supabase
      .from("equipment_catalog")
      .select("*")
      .or(
        `description.ilike.%${query.trim()}%,model_number.ilike.%${query.trim()}%`
      )
      .order("usage_count", { ascending: false })
      .limit(20);
```

with:

```typescript
    let q = supabase
      .from("equipment_catalog")
      .select("*, supplier:suppliers(name, is_active)")
      .or(
        `description.ilike.%${query.trim()}%,model_number.ilike.%${query.trim()}%`
      )
      .order("usage_count", { ascending: false })
      .limit(40);
```

Note: We fetch extra rows (40 instead of 20) to account for filtered-out items.

- [ ] **Step 2: Filter results after fetch**

Replace the results handling (line 65-66):

```typescript
    const { data } = await q;
    setResults(data ?? []);
```

with:

```typescript
    const { data } = await q;
    const visible = (data ?? []).filter((item) => {
      if (item.source !== "starter") return true;
      const supplier = item.supplier as { name: string; is_active: boolean } | null;
      return supplier?.is_active !== false;
    });
    setResults(visible.slice(0, 20) as CatalogRow[]);
```

- [ ] **Step 3: Verify in browser**

Run: Toggle off a starter supplier in settings, then create a new estimate and open the catalog search dialog
Expected: Starter equipment from the toggled-off supplier doesn't appear in search results.

- [ ] **Step 4: Commit**

```bash
git add src/components/estimates/catalog-search-dialog.tsx
git commit -m "feat: filter inactive starter equipment from catalog search dialog"
```
