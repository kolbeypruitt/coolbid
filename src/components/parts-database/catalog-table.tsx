"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Search, Loader2 } from "lucide-react";

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
  EQUIPMENT_TYPE_LABELS,
} from "@/types/catalog";

type SortOption = "usage" | "price" | "updated";

const SOURCE_BADGE: Record<
  CatalogItem["source"],
  { label: string; variant: "outline" | "default" | "secondary" }
> = {
  starter: { label: "Starter", variant: "outline" },
  quote: { label: "Quoted", variant: "default" },
  manual: { label: "Manual", variant: "secondary" },
};

export function CatalogTable() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");
  const [equipmentType, setEquipmentType] = useState<EquipmentType | "all">(
    "all"
  );
  const [sort, setSort] = useState<SortOption>("usage");
  const [showRetired, setShowRetired] = useState(false);

  const fetchPage = useCallback(
    (offset: number, signal: AbortSignal) => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (equipmentType !== "all") params.set("equipment_type", equipmentType);
      if (sort !== "usage") params.set("sort", sort);
      if (showRetired) params.set("show_retired", "true");
      if (offset > 0) params.set("offset", String(offset));

      return fetch(`/api/catalog?${params.toString()}`, { signal })
        .then((res) => {
          if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`);
          return res.json();
        })
        .then((data: { items: CatalogItem[]; hasMore: boolean }) => data);
    },
    [query, equipmentType, sort, showRetired],
  );

  const loadMoreControllerRef = useRef<AbortController | null>(null);

  // Reset and fetch first page when filters change
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
      {/* Filters */}
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
              )
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

        <label htmlFor="show-retired" className="flex items-center gap-1.5 text-sm cursor-pointer select-none text-txt-secondary">
          <input
            id="show-retired"
            type="checkbox"
            checked={showRetired}
            onChange={(e) => setShowRetired(e.target.checked)}
            className="rounded border-border"
          />
          Show retired
        </label>
      </div>

      {/* Table */}
      {loading ? (
        <div role="status" className="py-16 text-center text-sm text-txt-secondary">
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div role="status" className="py-16 text-center text-sm text-txt-secondary">
          No items found.
        </div>
      ) : (
        <>
        <div className="overflow-x-auto rounded-md border border-border bg-bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">Description</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">Brand</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">Model #</TableHead>
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
              const src = SOURCE_BADGE[item.source];
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
                    {item.model_number || "—"}
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
                    {item.source === "starter" ? (
                      <Badge className="bg-bg-elevated text-txt-tertiary border border-border">{src.label}</Badge>
                    ) : item.source === "quote" ? (
                      <Badge className="bg-success-bg text-success border-none">{src.label}</Badge>
                    ) : (
                      <Badge className="bg-cool-blue-glow text-cool-blue-light border-none">{src.label}</Badge>
                    )}
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
