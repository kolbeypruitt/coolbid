# Parts Database Enhancements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the parts database with URL-driven state, supplier filtering, column sorting, and proper page-based pagination.

**Architecture:** Replace React-only state with URL search params so tab/filter/sort/page state is shareable via links. Add a `/api/suppliers` endpoint for the supplier filter dropdown. Replace "load more" with page-based pagination including page size selector. Make all table columns sortable via clickable headers.

**Tech Stack:** Next.js App Router, `useSearchParams` + `useRouter`, Supabase, shadcn/ui components

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/app/api/suppliers/route.ts` | Create | Returns user's active suppliers for filter dropdowns |
| `src/app/api/catalog/route.ts` | Modify | Add `limit`, `sort_dir`, `page` params; return `totalCount` |
| `src/components/parts-database/catalog-table.tsx` | Rewrite | URL-driven state, supplier filter, sortable headers, page pagination |

---

### Task 1: Suppliers API Endpoint

**Files:**
- Create: `src/app/api/suppliers/route.ts`

- [ ] **Step 1: Create the suppliers endpoint**

```ts
// src/app/api/suppliers/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, vendor_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("[GET /api/suppliers]", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
```

- [ ] **Step 2: Verify endpoint works**

Run: `curl localhost:3000/api/suppliers` (while logged in via browser — or test via browser devtools)
Expected: JSON array of suppliers with `id`, `name`, `vendor_id` fields.

- [ ] **Step 3: Commit**

```
feat: add GET /api/suppliers endpoint for filter dropdowns
```

---

### Task 2: Update Catalog API for Pagination & Sorting

**Files:**
- Modify: `src/app/api/catalog/route.ts`

The API needs three changes:
1. Accept `limit` param (page size: 25, 50, 100, 200; default 25)
2. Accept `sort_dir` param (`asc` or `desc`; default depends on sort field)
3. Return `totalCount` alongside items so the UI can render page numbers

- [ ] **Step 1: Update the GET handler for my-parts queries**

In `src/app/api/catalog/route.ts`, update the GET handler. Replace the fixed `PAGE_SIZE` with a dynamic `limit` param, add sort direction support, and add a count query.

Replace the existing `PAGE_SIZE` constant and GET function (lines 42–119) with:

```ts
const VALID_PAGE_SIZES = [25, 50, 100, 200] as const;
const DEFAULT_PAGE_SIZE = 25;

// ...existing sanitizeIlike function stays...

export async function GET(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const browse = searchParams.get("browse")?.trim() || "";
  const q = sanitizeIlike(searchParams.get("q")?.trim() || "");

  const rawLimit = parseInt(searchParams.get("limit") || "", 10);
  const limit = (VALID_PAGE_SIZES as readonly number[]).includes(rawLimit)
    ? rawLimit
    : DEFAULT_PAGE_SIZE;

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const offset = (page - 1) * limit;

  if (browse === "vendor") {
    return browseVendorProducts({
      supabase,
      userId: user.id,
      q,
      offset,
      limit,
      categoryRoot: searchParams.get("category_root")?.trim() || "",
      supplierId: searchParams.get("supplier_id")?.trim() || "",
      sortField: searchParams.get("sort")?.trim() || "name",
      sortDir: searchParams.get("sort_dir")?.trim() || "",
    });
  }

  const equipmentType = searchParams.get("equipment_type")?.trim() || "";
  const supplierId = searchParams.get("supplier_id")?.trim() || "";
  const sortParam = searchParams.get("sort")?.trim() || "usage_count";
  const sortDirParam = searchParams.get("sort_dir")?.trim() || "";

  const sort = (
    VALID_SORTS as readonly string[]
  ).includes(sortParam)
    ? (sortParam as (typeof VALID_SORTS)[number])
    : "usage_count";

  const ascending = sortDirParam === "asc";

  // Build count query with same filters
  let countQuery = supabase
    .from("equipment_catalog")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  let query = supabase
    .from("equipment_catalog")
    .select("*, supplier:suppliers(name, is_active)")
    .eq("user_id", user.id)
    .order(sort, { ascending })
    .range(offset, offset + limit - 1);

  if (q) {
    const filter = `mpn.ilike.%${q}%,description.ilike.%${q}%,brand.ilike.%${q}%`;
    query = query.or(filter);
    countQuery = countQuery.or(filter);
  }

  if (equipmentType) {
    query = query.eq("equipment_type", equipmentType as EquipmentType);
    countQuery = countQuery.eq("equipment_type", equipmentType as EquipmentType);
  }

  if (supplierId) {
    query = query.eq("supplier_id", supplierId);
    countQuery = countQuery.eq("supplier_id", supplierId);
  }

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    query,
    countQuery,
  ]);

  if (error || countError) {
    console.error("[GET /api/catalog]", error?.message ?? countError?.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({
    items: (data ?? []) as CatalogItem[],
    totalCount: count ?? 0,
  });
}
```

- [ ] **Step 2: Update browseVendorProducts for pagination & sorting**

Update the `browseVendorProducts` function signature and body. Add `limit`, `sortField`, and `sortDir` params. Add count query.

The valid sort fields for browse are: `name`, `brand`, `sku`, `price`.

```ts
async function browseVendorProducts({
  supabase,
  userId,
  q,
  offset,
  limit,
  categoryRoot,
  supplierId,
  sortField,
  sortDir,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  q: string;
  offset: number;
  limit: number;
  categoryRoot: string;
  supplierId: string;
  sortField: string;
  sortDir: string;
}) {
  let supplierQuery = supabase
    .from("suppliers")
    .select("vendor_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .not("vendor_id", "is", null);

  if (supplierId) {
    supplierQuery = supplierQuery.eq("id", supplierId);
  }

  const { data: supplierRows, error: supplierErr } = await supplierQuery;

  if (supplierErr) {
    console.error("[GET /api/catalog browse] supplier lookup", supplierErr.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const vendorIds = Array.from(
    new Set(
      ((supplierRows ?? []) as Array<{ vendor_id: string | null }>)
        .map((r) => r.vendor_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );

  if (vendorIds.length === 0) {
    return NextResponse.json({ items: [], totalCount: 0 });
  }

  const BROWSE_SORT_FIELDS = ["name", "brand", "sku", "price"] as const;
  const validSort = (BROWSE_SORT_FIELDS as readonly string[]).includes(sortField)
    ? sortField
    : "name";
  const ascending = sortDir === "desc" ? false : true;

  const selectCols =
    "id, vendor_id, sku, mpn, name, brand, image_url, short_description, category_root, category_path, category_leaf, detail_url, price, price_text, last_priced_at, vendor:vendors(id, slug, name)";

  let countQuery = supabase
    .from("vendor_products")
    .select("id", { count: "exact", head: true })
    .in("vendor_id", vendorIds);

  let productQuery = supabase
    .from("vendor_products")
    .select(selectCols)
    .in("vendor_id", vendorIds)
    .order(validSort, { ascending })
    .range(offset, offset + limit - 1);

  if (q) {
    const filter = `name.ilike.%${q}%,brand.ilike.%${q}%,mpn.ilike.%${q}%,sku.ilike.%${q}%`;
    productQuery = productQuery.or(filter);
    countQuery = countQuery.or(filter);
  }

  if (categoryRoot) {
    productQuery = productQuery.eq("category_root", categoryRoot);
    countQuery = countQuery.eq("category_root", categoryRoot);
  }

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    productQuery,
    countQuery,
  ]);

  if (error || countError) {
    console.error("[GET /api/catalog browse]", error?.message ?? countError?.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({
    items: (data ?? []) as VendorProductRow[],
    totalCount: count ?? 0,
  });
}
```

- [ ] **Step 3: Verify API changes**

Test via browser devtools or curl:
- `/api/catalog?limit=25&page=1` → returns `{ items: [...], totalCount: N }`
- `/api/catalog?sort=unit_price&sort_dir=asc&limit=50` → sorted ascending by price
- `/api/catalog?browse=vendor&limit=25&page=2` → page 2 of vendor products

- [ ] **Step 4: Commit**

```
feat: catalog API — add page/limit params, totalCount, sort direction
```

---

### Task 3: Rewrite CatalogTable with URL State, Filters, Sorting & Pagination

**Files:**
- Rewrite: `src/components/parts-database/catalog-table.tsx`

This is the big task. The component needs:
1. All filter/sort/tab/page state driven by URL search params
2. Supplier filter dropdown (fetched from `/api/suppliers`)
3. Clickable column headers for sorting (with asc/desc toggle)
4. Page-based pagination with page size selector (25, 50, 100, 200)

- [ ] **Step 1: Rewrite the full component**

Replace the entire contents of `src/components/parts-database/catalog-table.tsx` with the implementation below.

Key design decisions:
- `useSearchParams()` + `useRouter().replace()` for URL state
- Default tab is `browse` (no `tab` param = browse; `tab=my-parts` = my parts)
- Helper `setParam`/`removeParam` functions to update URL without full page reload
- Sort state: `sort` param for field, `dir` param for direction. Clicking same column toggles direction. Clicking different column sets new sort with default direction.
- Pagination: `page` and `pageSize` params. Page resets to 1 when filters change.
- Supplier list fetched once on mount.

```tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Loader2,
  Plus,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type CatalogItem,
  type EquipmentType,
  type VendorProductRow,
  EQUIPMENT_TYPE_LABELS,
} from "@/types/catalog";

type Tab = "my-parts" | "browse";

const PAGE_SIZES = [25, 50, 100, 200] as const;

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  quote: {
    label: "Quoted",
    className: "bg-success-bg text-success border-none",
  },
  imported: {
    label: "Imported",
    className: "bg-cool-blue-glow text-cool-blue-light border-none",
  },
  manual: {
    label: "Manual",
    className: "bg-cool-blue-glow text-cool-blue-light border-none",
  },
  starter: {
    label: "Starter",
    className: "bg-bg-elevated text-txt-tertiary border border-border",
  },
};

type SupplierOption = { id: string; name: string; vendor_id: string | null };

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function useUrlState() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const get = useCallback(
    (key: string) => searchParams.get(key) ?? "",
    [searchParams],
  );

  const set = useCallback(
    (updates: Record<string, string>, remove?: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const key of remove ?? []) params.delete(key);
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router],
  );

  return { get, set, searchParams };
}

// ---------------------------------------------------------------------------
// Sort icon
// ---------------------------------------------------------------------------

function SortIcon({
  field,
  activeField,
  dir,
}: {
  field: string;
  activeField: string;
  dir: string;
}) {
  if (field !== activeField)
    return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-30" />;
  return dir === "asc" ? (
    <ArrowUp className="ml-1 inline h-3 w-3" />
  ) : (
    <ArrowDown className="ml-1 inline h-3 w-3" />
  );
}

// ---------------------------------------------------------------------------
// Sortable header
// ---------------------------------------------------------------------------

function SortableHead({
  label,
  field,
  activeSort,
  activeDir,
  onSort,
  className,
}: {
  label: string;
  field: string;
  activeSort: string;
  activeDir: string;
  onSort: (field: string) => void;
  className?: string;
}) {
  return (
    <TableHead
      className={`text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card cursor-pointer select-none hover:text-txt-secondary ${className ?? ""}`}
      onClick={() => onSort(field)}
    >
      {label}
      <SortIcon field={field} activeField={activeSort} dir={activeDir} />
    </TableHead>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function Pagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="flex items-center justify-between px-1 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-txt-tertiary">
          {totalCount} result{totalCount !== 1 ? "s" : ""}
        </span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v))}
        >
          <SelectTrigger className="h-7 w-20 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s} rows
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-txt-secondary tabular-nums px-2">
          {page} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function CatalogTable() {
  const { get, set } = useUrlState();

  const tab: Tab = get("tab") === "my-parts" ? "my-parts" : "browse";

  function switchTab(t: Tab) {
    // Reset all filters when switching tabs
    set(
      { tab: t === "browse" ? "" : t },
      ["q", "sort", "dir", "page", "pageSize", "equipment_type", "category_root", "supplier_id"],
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => switchTab("my-parts")}
          className={
            tab === "my-parts"
              ? "px-4 py-2 text-sm font-medium text-txt-primary border-b-2 border-accent"
              : "px-4 py-2 text-sm text-txt-secondary hover:text-txt-primary"
          }
        >
          My parts
        </button>
        <button
          type="button"
          onClick={() => switchTab("browse")}
          className={
            tab === "browse"
              ? "px-4 py-2 text-sm font-medium text-txt-primary border-b-2 border-accent"
              : "px-4 py-2 text-sm text-txt-secondary hover:text-txt-primary"
          }
        >
          Supplier catalogs
        </button>
      </div>

      {tab === "my-parts" ? <MyPartsTab /> : <BrowseTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// My Parts
// ---------------------------------------------------------------------------

const MY_PARTS_DEFAULT_SORT = "usage_count";
const MY_PARTS_DEFAULT_DIR = "desc";

const MY_PARTS_SORT_FIELDS: Record<string, string> = {
  description: "description",
  brand: "brand",
  mpn: "mpn",
  tonnage: "tonnage",
  seer_rating: "seer_rating",
  unit_price: "unit_price",
  usage_count: "usage_count",
  updated_at: "updated_at",
};

function MyPartsTab() {
  const { get, set } = useUrlState();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  const query = get("q");
  const equipmentType = get("equipment_type") || "all";
  const supplierId = get("supplier_id") || "all";
  const sort = get("sort") || MY_PARTS_DEFAULT_SORT;
  const dir = get("dir") || MY_PARTS_DEFAULT_DIR;
  const page = Math.max(1, parseInt(get("page") || "1", 10) || 1);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(
    parseInt(get("pageSize") || "", 10),
  )
    ? parseInt(get("pageSize"), 10)
    : 25;

  // Fetch suppliers once
  useEffect(() => {
    fetch("/api/suppliers")
      .then((r) => r.json())
      .then((data) => setSuppliers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const fetchRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(() => {
    fetchRef.current?.abort();
    const controller = new AbortController();
    fetchRef.current = controller;

    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (equipmentType !== "all") params.set("equipment_type", equipmentType);
    if (supplierId !== "all") params.set("supplier_id", supplierId);
    params.set("sort", sort);
    params.set("sort_dir", dir);
    params.set("page", String(page));
    params.set("limit", String(pageSize));

    setLoading(true);
    fetch(`/api/catalog?${params.toString()}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data: { items: CatalogItem[]; totalCount: number }) => {
        setItems(Array.isArray(data.items) ? data.items : []);
        setTotalCount(data.totalCount ?? 0);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") {
          setItems([]);
          setTotalCount(0);
        }
      })
      .finally(() => setLoading(false));
  }, [query, equipmentType, supplierId, sort, dir, page, pageSize]);

  useEffect(() => {
    const timer = setTimeout(fetchData, 300);
    return () => {
      clearTimeout(timer);
      fetchRef.current?.abort();
    };
  }, [fetchData]);

  function handleSort(field: string) {
    const sortField = MY_PARTS_SORT_FIELDS[field] ?? MY_PARTS_DEFAULT_SORT;
    if (sort === sortField) {
      set({ dir: dir === "asc" ? "desc" : "asc", page: "1" });
    } else {
      set({ sort: sortField, dir: "desc", page: "1" });
    }
  }

  function setFilter(key: string, value: string) {
    set({ [key]: value === "all" ? "" : value, page: "1" });
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-card border border-border rounded-md p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search description, model, brand…"
            value={query}
            onChange={(e) => set({ q: e.target.value, page: "1" })}
            className="pl-8"
          />
        </div>

        <Select
          value={equipmentType}
          onValueChange={(val) => setFilter("equipment_type", val)}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All equipment types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All equipment types</SelectItem>
            {(Object.keys(EQUIPMENT_TYPE_LABELS) as EquipmentType[]).map(
              (type) => (
                <SelectItem key={type} value={type}>
                  {EQUIPMENT_TYPE_LABELS[type]}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>

        <Select
          value={supplierId}
          onValueChange={(val) => setFilter("supplier_id", val)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All suppliers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All suppliers</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div
          role="status"
          className="py-16 text-center text-sm text-txt-secondary"
        >
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div
          role="status"
          className="py-16 text-center text-sm text-txt-secondary"
        >
          No items yet. Browse your supplier catalogs or upload a quote to add
          parts.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-border bg-bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Description" field="description" activeSort={sort} activeDir={dir} onSort={handleSort} />
                  <SortableHead label="Brand" field="brand" activeSort={sort} activeDir={dir} onSort={handleSort} />
                  <SortableHead label="MPN" field="mpn" activeSort={sort} activeDir={dir} onSort={handleSort} />
                  <SortableHead label="Tonnage" field="tonnage" activeSort={sort} activeDir={dir} onSort={handleSort} />
                  <SortableHead label="SEER" field="seer_rating" activeSort={sort} activeDir={dir} onSort={handleSort} />
                  <SortableHead label="Price" field="unit_price" activeSort={sort} activeDir={dir} onSort={handleSort} />
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">
                    Supplier
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">
                    Source
                  </TableHead>
                  <SortableHead label="Uses" field="usage_count" activeSort={sort} activeDir={dir} onSort={handleSort} className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const src =
                    SOURCE_BADGE[item.source] ?? SOURCE_BADGE.manual;
                  return (
                    <TableRow
                      key={item.id}
                      className="hover:bg-[rgba(6,182,212,0.03)] transition-colors border-b border-border"
                    >
                      <TableCell className="text-sm text-txt-secondary py-3 px-3">
                        <Link
                          href={`/parts-database/${item.id}`}
                          className="block hover:underline"
                        >
                          {item.description || "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-txt-secondary py-3 px-3">
                        {item.brand || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs py-3 px-3 text-txt-secondary">
                        <Link
                          href={`/parts-database/${item.id}`}
                          className="block hover:underline"
                        >
                          {item.mpn || "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm py-3 px-3 tabular-nums text-txt-primary font-medium">
                        {item.tonnage != null ? `${item.tonnage} ton` : "—"}
                      </TableCell>
                      <TableCell className="text-sm py-3 px-3 tabular-nums text-txt-primary font-medium">
                        {item.seer_rating != null ? item.seer_rating : "—"}
                      </TableCell>
                      <TableCell className="text-sm py-3 px-3 tabular-nums text-txt-primary font-medium">
                        {item.unit_price != null
                          ? `$${item.unit_price.toFixed(2)}`
                          : "No price"}
                      </TableCell>
                      <TableCell className="text-sm text-txt-secondary py-3 px-3">
                        {item.supplier?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm py-3 px-3">
                        <Badge className={src.className}>{src.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm py-3 px-3 tabular-nums text-txt-primary font-medium text-right">
                        {item.usage_count}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={(p) => set({ page: String(p) })}
            onPageSizeChange={(s) => set({ pageSize: String(s), page: "1" })}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Browse (Supplier Catalogs)
// ---------------------------------------------------------------------------

const BROWSE_DEFAULT_SORT = "name";
const BROWSE_DEFAULT_DIR = "asc";

const BROWSE_SORT_FIELDS: Record<string, string> = {
  name: "name",
  brand: "brand",
  sku: "sku",
  price: "price",
};

function BrowseTab() {
  const { get, set } = useUrlState();
  const [items, setItems] = useState<VendorProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [importing, setImporting] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  const query = get("q");
  const categoryRoot = get("category_root") || "all";
  const supplierId = get("supplier_id") || "all";
  const sort = get("sort") || BROWSE_DEFAULT_SORT;
  const dir = get("dir") || BROWSE_DEFAULT_DIR;
  const page = Math.max(1, parseInt(get("page") || "1", 10) || 1);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(
    parseInt(get("pageSize") || "", 10),
  )
    ? parseInt(get("pageSize"), 10)
    : 25;

  useEffect(() => {
    fetch("/api/suppliers")
      .then((r) => r.json())
      .then((data) => setSuppliers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const fetchRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(() => {
    fetchRef.current?.abort();
    const controller = new AbortController();
    fetchRef.current = controller;

    const params = new URLSearchParams({ browse: "vendor" });
    if (query.trim()) params.set("q", query.trim());
    if (categoryRoot !== "all") params.set("category_root", categoryRoot);
    if (supplierId !== "all") params.set("supplier_id", supplierId);
    params.set("sort", sort);
    params.set("sort_dir", dir);
    params.set("page", String(page));
    params.set("limit", String(pageSize));

    setLoading(true);
    fetch(`/api/catalog?${params.toString()}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Browse fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data: { items: VendorProductRow[]; totalCount: number }) => {
        setItems(Array.isArray(data.items) ? data.items : []);
        setTotalCount(data.totalCount ?? 0);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") {
          setItems([]);
          setTotalCount(0);
        }
      })
      .finally(() => setLoading(false));
  }, [query, categoryRoot, supplierId, sort, dir, page, pageSize]);

  useEffect(() => {
    const timer = setTimeout(fetchData, 300);
    return () => {
      clearTimeout(timer);
      fetchRef.current?.abort();
    };
  }, [fetchData]);

  function handleSort(field: string) {
    const sortField = BROWSE_SORT_FIELDS[field] ?? BROWSE_DEFAULT_SORT;
    if (sort === sortField) {
      set({ dir: dir === "asc" ? "desc" : "asc", page: "1" });
    } else {
      set({ sort: sortField, dir: "asc", page: "1" });
    }
  }

  function setFilter(key: string, value: string) {
    set({ [key]: value === "all" ? "" : value, page: "1" });
  }

  async function handleImport(row: VendorProductRow) {
    setImporting(row.id);
    setError(null);
    try {
      const res = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "imported",
          vendor_product_id: row.id,
          mpn: row.sku,
          description: row.name,
          equipment_type: "installation",
          brand: row.brand ?? "",
          unit_price: row.price ?? null,
          unit_of_measure: "ea",
        }),
      });
      if (!res.ok) {
        throw new Error(`Import failed: ${res.status}`);
      }
      setImportedIds((prev) => new Set(prev).add(row.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-card border border-border rounded-md p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name, brand, MPN, SKU…"
            value={query}
            onChange={(e) => set({ q: e.target.value, page: "1" })}
            className="pl-8"
          />
        </div>

        <Select
          value={categoryRoot}
          onValueChange={(val) => setFilter("category_root", val)}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="HVAC-Equipment">HVAC Equipment</SelectItem>
            <SelectItem value="HVACR-Parts">HVACR Parts</SelectItem>
            <SelectItem value="Hydronics-Plumbing">
              Hydronics & Plumbing
            </SelectItem>
            <SelectItem value="Motors">Motors</SelectItem>
            <SelectItem value="Refrigeration">Refrigeration</SelectItem>
            <SelectItem value="Supplies">Supplies</SelectItem>
            <SelectItem value="Testing-Tools-Training">
              Testing, Tools & Training
            </SelectItem>
            <SelectItem value="Thermostats">Thermostats</SelectItem>
            <SelectItem value="Ventilation-IAQ">Ventilation & IAQ</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={supplierId}
          onValueChange={(val) => setFilter("supplier_id", val)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All suppliers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All suppliers</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {loading ? (
        <div
          role="status"
          className="py-16 text-center text-sm text-txt-secondary"
        >
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div
          role="status"
          className="py-16 text-center text-sm text-txt-secondary"
        >
          {query.trim() || categoryRoot !== "all"
            ? "No matching products. Try a different search or category."
            : "No supplier catalogs available. Pick suppliers in Settings to browse their product lines."}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-border bg-bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Name" field="name" activeSort={sort} activeDir={dir} onSort={handleSort} />
                  <SortableHead label="Brand" field="brand" activeSort={sort} activeDir={dir} onSort={handleSort} />
                  <SortableHead label="SKU" field="sku" activeSort={sort} activeDir={dir} onSort={handleSort} />
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">
                    Category
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">
                    Supplier
                  </TableHead>
                  <SortableHead label="Price" field="price" activeSort={sort} activeDir={dir} onSort={handleSort} />
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card text-right">
                    &nbsp;
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow
                    key={row.id}
                    className="hover:bg-[rgba(6,182,212,0.03)] transition-colors border-b border-border"
                  >
                    <TableCell className="text-sm text-txt-secondary py-3 px-3">
                      <Link
                        href={`/parts-database/vendor/${row.id}`}
                        className="block hover:underline"
                      >
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-txt-secondary py-3 px-3">
                      {row.brand ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs py-3 px-3 text-txt-secondary">
                      <Link
                        href={`/parts-database/vendor/${row.id}`}
                        className="block hover:underline"
                      >
                        {row.sku}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs py-3 px-3 text-txt-tertiary">
                      {row.category_leaf ?? row.category_root ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-txt-secondary py-3 px-3">
                      {row.vendor?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm py-3 px-3 tabular-nums text-txt-primary font-medium">
                      {row.price != null
                        ? `$${row.price.toFixed(2)}`
                        : "No price"}
                    </TableCell>
                    <TableCell className="py-3 px-3 text-right flex items-center justify-end gap-1">
                      {row.detail_url && (
                        <a
                          href={row.detail_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-md p-1.5 text-txt-tertiary hover:text-txt-primary hover:bg-muted/50 transition-colors"
                          title="View on supplier site"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleImport(row)}
                        disabled={
                          importing === row.id || importedIds.has(row.id)
                        }
                      >
                        {importing === row.id ? (
                          <Loader2
                            aria-hidden
                            className="h-3.5 w-3.5 animate-spin"
                          />
                        ) : importedIds.has(row.id) ? (
                          "Imported"
                        ) : (
                          <>
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Import
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={(p) => set({ page: String(p) })}
            onPageSizeChange={(s) => set({ pageSize: String(s), page: "1" })}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the page builds without type errors**

Run: `npx next build` or check the dev server at `localhost:3000/parts-database`
Expected: No type errors. Page loads with browse tab by default.

- [ ] **Step 3: Test URL state manually**

1. Load `/parts-database` → should show Supplier catalogs (browse tab)
2. Click "My parts" → URL becomes `?tab=my-parts`
3. Type in search → URL gets `&q=...`
4. Select a supplier filter → URL gets `&supplier_id=...`
5. Click a column header → URL gets `&sort=...&dir=...`
6. Change page size → URL gets `&pageSize=50`
7. Click next page → URL gets `&page=2`
8. Copy the URL, open in new tab → same view loads
9. Changing any filter resets page to 1

- [ ] **Step 4: Commit**

```
feat: parts database — URL state, supplier filter, column sorting, pagination
```

---

### Task 4: Wrap Page in Suspense (Required for useSearchParams)

**Files:**
- Modify: `src/app/(app)/parts-database/page.tsx`

`useSearchParams()` requires a `<Suspense>` boundary in Next.js App Router to avoid the whole page opting into client-side rendering.

- [ ] **Step 1: Add Suspense wrapper**

In `src/app/(app)/parts-database/page.tsx`, wrap `<CatalogTable />` in `<Suspense>`:

```tsx
import { Suspense } from "react";
// ... existing imports ...

export default function PartsDatabasePage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-txt-primary">Parts Database</h1>
        <Link
          href="/parts-database/upload"
          className={cn(buttonVariants(), "bg-gradient-brand hover-lift")}
        >
          <Upload className="mr-2 size-4" />
          Upload Quote
        </Link>
      </div>
      <EmailConnectionsSection />
      <Suspense>
        <CatalogTable />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 2: Verify no hydration warnings in dev console**

Run dev server. Load `/parts-database`. Check browser console — no `useSearchParams` warnings.

- [ ] **Step 3: Commit**

```
fix: wrap CatalogTable in Suspense for useSearchParams
```
