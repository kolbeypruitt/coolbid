"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
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

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogRow[]>([]);
  const [searching, setSearching] = useState(false);

  // Custom form state
  const [custom, setCustom] = useState({
    description: "",
    category: "",
    quantity: 1,
    unit: "ea",
    unit_cost: 0,
  });

  // Reset on open
  useEffect(() => {
    if (open) {
      setMode("search");
      setError(null);
      setQuery("");
      setResults([]);
      setCustom({ description: "", category: "", quantity: 1, unit: "ea", unit_cost: 0 });
    }
  }, [open]);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("equipment_catalog")
      .select("*")
      .or(`description.ilike.%${query.trim()}%,model_number.ilike.%${query.trim()}%`)
      .order("usage_count", { ascending: false })
      .limit(20);
    setResults(data ?? []);
    setSearching(false);
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
    onOpenChange(false);
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

          <div className="flex gap-2">
            <Input
              placeholder="Search parts..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button variant="outline" size="sm" onClick={handleSearch} disabled={searching}>
              <Search className="h-4 w-4" />
            </Button>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {searching && (
              <p className="py-4 text-center text-sm text-txt-tertiary">Searching...</p>
            )}
            {!searching && results.length === 0 && query.trim() && (
              <p className="py-4 text-center text-sm text-txt-tertiary">No results found.</p>
            )}
            {results.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleCatalogSelect(item)}
                disabled={saving}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-[rgba(6,182,212,0.05)] transition-colors"
              >
                <div>
                  <p className="font-medium text-txt-primary">{item.description}</p>
                  <p className="text-xs text-txt-tertiary">
                    {item.brand} · {item.model_number}
                    {item.tonnage ? ` · ${item.tonnage}T` : ""}
                  </p>
                </div>
                <span className="tabular-nums text-txt-primary font-medium">
                  {item.unit_price != null ? `$${item.unit_price.toFixed(2)}` : "No price"}
                </span>
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

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
