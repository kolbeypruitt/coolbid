"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Loader2, Plus, ExternalLink } from "lucide-react";

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

type SortOption = "usage" | "price" | "updated";
type Tab = "my-parts" | "browse";

const SOURCE_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  quote: { label: "Quoted", className: "bg-success-bg text-success border-none" },
  imported: { label: "Imported", className: "bg-cool-blue-glow text-cool-blue-light border-none" },
  manual: { label: "Manual", className: "bg-cool-blue-glow text-cool-blue-light border-none" },
  starter: { label: "Starter", className: "bg-bg-elevated text-txt-tertiary border border-border" },
};

export function CatalogTable() {
  const [tab, setTab] = useState<Tab>("my-parts");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setTab("my-parts")}
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
          onClick={() => setTab("browse")}
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

function MyPartsTab() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");
  const [equipmentType, setEquipmentType] = useState<EquipmentType | "all">(
    "all",
  );
  const [sort, setSort] = useState<SortOption>("usage");

  const fetchPage = useCallback(
    (offset: number, signal: AbortSignal) => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (equipmentType !== "all") params.set("equipment_type", equipmentType);
      if (sort !== "usage") params.set("sort", sort);
      if (offset > 0) params.set("offset", String(offset));

      return fetch(`/api/catalog?${params.toString()}`, { signal })
        .then((res) => {
          if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`);
          return res.json();
        })
        .then((data: { items: CatalogItem[]; hasMore: boolean }) => data);
    },
    [query, equipmentType, sort],
  );

  const loadMoreControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadMoreControllerRef.current?.abort();

    const timer = setTimeout(() => {
      setLoading(true);
      fetchPage(0, controller.signal)
        .then((data) => {
          setItems(Array.isArray(data.items) ? data.items : []);
          setHasMore(data.hasMore ?? false);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name !== "AbortError") {
            setItems([]);
            setHasMore(false);
          }
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
      loadMoreControllerRef.current?.abort();
    };
  }, [fetchPage]);

  function loadMore() {
    loadMoreControllerRef.current?.abort();
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setLoadingMore(true);
    fetchPage(items.length, controller.signal)
      .then((data) => {
        setItems((prev) => [...prev, ...(data.items ?? [])]);
        setHasMore(data.hasMore ?? false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") {
          setHasMore(false);
        }
      })
      .finally(() => setLoadingMore(false));
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-card border border-border rounded-md p-4 space-y-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search description, model, brand…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select
          value={equipmentType}
          onValueChange={(val) =>
            setEquipmentType((val ?? "all") as EquipmentType | "all")
          }
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
          value={sort}
          onValueChange={(val) => setSort((val ?? "usage") as SortOption)}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="usage">Usage count</SelectItem>
            <SelectItem value="price">Price</SelectItem>
            <SelectItem value="updated">Last updated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div role="status" className="py-16 text-center text-sm text-txt-secondary">
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div role="status" className="py-16 text-center text-sm text-txt-secondary">
          No items yet. Browse your supplier catalogs or upload a quote to add
          parts.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-border bg-bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">Description</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">Brand</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">MPN</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">Tonnage</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">SEER</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">Price</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">Supplier</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">Source</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card text-right">Uses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const src = SOURCE_BADGE[item.source] ?? SOURCE_BADGE.manual;
                  return (
                    <TableRow key={item.id} className="hover:bg-[rgba(6,182,212,0.03)] transition-colors border-b border-border">
                      <TableCell className="text-sm text-txt-secondary py-3 px-3">
                        <Link
                          href={`/parts-database/${item.id}`}
                          className="block hover:underline"
                        >
                          {item.description || "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-txt-secondary py-3 px-3">{item.brand || "—"}</TableCell>
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
                      <TableCell className="text-sm text-txt-secondary py-3 px-3">{item.supplier?.name ?? "—"}</TableCell>
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
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-txt-tertiary">
              {items.length} item{items.length !== 1 ? "s" : ""}
            </span>
            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                onClick={loadMore}
                disabled={loadingMore}
                className="text-txt-secondary hover:text-txt-primary"
              >
                {loadingMore && <Loader2 aria-hidden className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BrowseTab() {
  const router = useRouter();
  const [items, setItems] = useState<VendorProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryRoot, setCategoryRoot] = useState("all");
  const [importing, setImporting] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    (offset: number, signal: AbortSignal) => {
      const params = new URLSearchParams({ browse: "vendor" });
      if (query.trim()) params.set("q", query.trim());
      if (categoryRoot !== "all") params.set("category_root", categoryRoot);
      if (offset > 0) params.set("offset", String(offset));

      return fetch(`/api/catalog?${params.toString()}`, { signal })
        .then((res) => {
          if (!res.ok) throw new Error(`Browse fetch failed: ${res.status}`);
          return res.json();
        })
        .then((data: { items: VendorProductRow[]; hasMore: boolean }) => data);
    },
    [query, categoryRoot],
  );

  const loadMoreControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadMoreControllerRef.current?.abort();

    const timer = setTimeout(() => {
      setLoading(true);
      fetchPage(0, controller.signal)
        .then((data) => {
          setItems(Array.isArray(data.items) ? data.items : []);
          setHasMore(data.hasMore ?? false);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name !== "AbortError") {
            setItems([]);
            setHasMore(false);
          }
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
      loadMoreControllerRef.current?.abort();
    };
  }, [fetchPage]);

  function loadMore() {
    loadMoreControllerRef.current?.abort();
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setLoadingMore(true);
    fetchPage(items.length, controller.signal)
      .then((data) => {
        setItems((prev) => [...prev, ...(data.items ?? [])]);
        setHasMore(data.hasMore ?? false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") {
          setHasMore(false);
        }
      })
      .finally(() => setLoadingMore(false));
  }

  async function handleImport(row: VendorProductRow, navigate = false) {
    const existing = importedIds.get(row.id);
    if (existing && navigate) {
      router.push(`/parts-database/${existing}`);
      return;
    }
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
      const catalogItem = (await res.json()) as { id: string };
      setImportedIds((prev) => new Map(prev).set(row.id, catalogItem.id));
      if (navigate) {
        router.push(`/parts-database/${catalogItem.id}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-card border border-border rounded-md p-4 space-y-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name, brand, MPN, SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select
          value={categoryRoot}
          onValueChange={(val) => setCategoryRoot(val ?? "all")}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="HVAC-Equipment">HVAC Equipment</SelectItem>
            <SelectItem value="HVACR-Parts">HVACR Parts</SelectItem>
            <SelectItem value="Hydronics-Plumbing">Hydronics & Plumbing</SelectItem>
            <SelectItem value="Motors">Motors</SelectItem>
            <SelectItem value="Refrigeration">Refrigeration</SelectItem>
            <SelectItem value="Supplies">Supplies</SelectItem>
            <SelectItem value="Testing-Tools-Training">Testing, Tools & Training</SelectItem>
            <SelectItem value="Thermostats">Thermostats</SelectItem>
            <SelectItem value="Ventilation-IAQ">Ventilation & IAQ</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {loading ? (
        <div role="status" className="py-16 text-center text-sm text-txt-secondary">
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div role="status" className="py-16 text-center text-sm text-txt-secondary">
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
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">Name</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">Brand</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">SKU</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">Category</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">Supplier</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">Price</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card text-right">&nbsp;</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow
                    key={row.id}
                    className="hover:bg-[rgba(6,182,212,0.03)] transition-colors border-b border-border"
                  >
                    <TableCell className="text-sm text-txt-secondary py-3 px-3">
                      <button
                        type="button"
                        onClick={() => handleImport(row, true)}
                        disabled={importing === row.id}
                        className="text-left hover:underline cursor-pointer disabled:cursor-wait"
                      >
                        {row.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-txt-secondary py-3 px-3">
                      {row.brand ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs py-3 px-3 text-txt-secondary">
                      <button
                        type="button"
                        onClick={() => handleImport(row, true)}
                        disabled={importing === row.id}
                        className="text-left hover:underline cursor-pointer disabled:cursor-wait"
                      >
                        {row.sku}
                      </button>
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
                        disabled={importing === row.id || importedIds.has(row.id)}
                      >
                        {importing === row.id ? (
                          <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
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
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-txt-tertiary">
              {items.length} product{items.length !== 1 ? "s" : ""}
            </span>
            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                onClick={loadMore}
                disabled={loadingMore}
                className="text-txt-secondary hover:text-txt-primary"
              >
                {loadingMore && <Loader2 aria-hidden className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
