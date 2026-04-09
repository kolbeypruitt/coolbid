"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
  const [query, setQuery] = useState("");
  const [equipmentType, setEquipmentType] = useState<EquipmentType | "all">(
    "all"
  );
  const [sort, setSort] = useState<SortOption>("usage");
  const [showRetired, setShowRetired] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (equipmentType !== "all") params.set("equipment_type", equipmentType);
      if (sort !== "usage") params.set("sort", sort);
      if (showRetired) params.set("show_retired", "true");

      setLoading(true);
      fetch(`/api/catalog?${params.toString()}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data: CatalogItem[]) => {
          setItems(Array.isArray(data) ? data : []);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name !== "AbortError") setItems([]);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, equipmentType, sort, showRetired]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
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

        <label htmlFor="show-retired" className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
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
        <div role="status" className="py-16 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div role="status" className="py-16 text-center text-sm text-muted-foreground">
          No items found.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Model #</TableHead>
              <TableHead>Tonnage</TableHead>
              <TableHead>SEER</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Uses</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const src = SOURCE_BADGE[item.source];
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link
                      href={`/parts-database/${item.id}`}
                      className="block hover:underline"
                    >
                      {item.description || "—"}
                    </Link>
                  </TableCell>
                  <TableCell>{item.brand || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {item.model_number || "—"}
                  </TableCell>
                  <TableCell>
                    {item.tonnage != null ? `${item.tonnage} ton` : "—"}
                  </TableCell>
                  <TableCell>
                    {item.seer_rating != null ? item.seer_rating : "—"}
                  </TableCell>
                  <TableCell>
                    {item.unit_price != null
                      ? `$${item.unit_price.toFixed(2)}`
                      : "No price"}
                  </TableCell>
                  <TableCell>{item.supplier?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={src.variant}>{src.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.usage_count}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
