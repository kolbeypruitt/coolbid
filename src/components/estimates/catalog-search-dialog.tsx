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
        `description.ilike.%${query.trim()}%,model_number.ilike.%${query.trim()}%`
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
                  {item.brand} · {item.model_number}
                  {item.tonnage ? ` · ${item.tonnage}T` : ""}
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
