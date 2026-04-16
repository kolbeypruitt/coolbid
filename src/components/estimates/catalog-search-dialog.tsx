"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { VendorProductRow } from "@/types/catalog";
import type { Database } from "@/types/database";

type CatalogRow = Database["public"]["Tables"]["equipment_catalog"]["Row"] & {
  supplier?: { name: string; is_active: boolean } | null;
};

/**
 * A unified search result. `kind: 'catalog'` rows already live in the
 * user's equipment_catalog; picking one is a direct insert into
 * estimate_bom_items. `kind: 'vendor'` rows come from a supplier's
 * global vendor_products catalog; picking one hands the caller the
 * vendor row and lets them decide how to materialize it (typically
 * POST /api/catalog with source='imported', then insert).
 */
export type CatalogSearchResult =
  | { kind: "catalog"; item: CatalogRow }
  | { kind: "vendor"; item: VendorProductRow };

export interface CatalogSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (result: CatalogSearchResult) => void;
  /** Optional equipment_type filter — only applied to catalog rows. */
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
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);

    const params = new URLSearchParams({ q: query.trim() });
    if (filterCategory) params.set("equipment_type", filterCategory);

    const browseParams = new URLSearchParams({
      browse: "vendor",
      q: query.trim(),
    });

    try {
      const [catalogRes, browseRes] = await Promise.all([
        fetch(`/api/catalog?${params.toString()}`).then((r) => r.json()),
        fetch(`/api/catalog?${browseParams.toString()}`).then((r) => r.json()),
      ]);

      const catalogRows = ((catalogRes.items ?? []) as CatalogRow[]).slice(0, 12);
      const vendorRows = ((browseRes.items ?? []) as VendorProductRow[]).slice(0, 12);

      // Dedupe: if a vendor row is already imported into the user's
      // catalog (matching SKU), prefer the catalog row.
      const catalogSkus = new Set(
        catalogRows.map((r) => r.model_number.toLowerCase()),
      );
      const filteredVendor = vendorRows.filter(
        (r) => !catalogSkus.has(r.sku.toLowerCase()),
      );

      const catalogItems: CatalogSearchResult[] = catalogRows.map((item) => ({
        kind: "catalog" as const,
        item,
      }));
      const vendorItems: CatalogSearchResult[] = filteredVendor.map((item) => ({
        kind: "vendor" as const,
        item,
      }));

      setResults([...catalogItems, ...vendorItems]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Searches your catalog and your active supplier product lines.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="Search by name, model, brand, SKU…"
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

        <div className="max-h-80 overflow-y-auto">
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
          {results.map((result) => {
            const isCatalog = result.kind === "catalog";
            const key = isCatalog
              ? `catalog-${result.item.id}`
              : `vendor-${result.item.id}`;
            const title = isCatalog
              ? result.item.description
              : result.item.name;
            const sub = isCatalog
              ? `${result.item.brand} · ${result.item.model_number}${
                  result.item.tonnage ? ` · ${result.item.tonnage}T` : ""
                }`
              : `${result.item.brand ?? "—"} · ${result.item.sku}${
                  result.item.vendor?.name ? ` · ${result.item.vendor.name}` : ""
                }`;
            const price = isCatalog ? result.item.unit_price : result.item.price;

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onSelect(result);
                  onOpenChange(false);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-[rgba(6,182,212,0.05)] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-txt-primary truncate">
                      {title}
                    </p>
                    <Badge
                      className={
                        isCatalog
                          ? "bg-success-bg text-success border-none text-[10px]"
                          : "bg-cool-blue-glow text-cool-blue-light border-none text-[10px]"
                      }
                    >
                      {isCatalog ? "Used before" : "Supplier"}
                    </Badge>
                  </div>
                  <p className="text-xs text-txt-tertiary truncate">{sub}</p>
                </div>
                <span className="tabular-nums text-txt-primary font-medium shrink-0">
                  {price != null ? `$${price.toFixed(2)}` : "No price"}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
