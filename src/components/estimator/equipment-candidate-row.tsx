"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { CatalogItem } from "@/types/catalog";

type Props = {
  item: CatalogItem;
  selected: boolean;
  onSelect: () => void;
};

function formatPrice(price: number | null): string {
  if (price === null) return "—";
  return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatSpec(label: string, value: string | number | null): string | null {
  if (value === null || value === undefined || value === "") return null;
  return `${label} ${value}`;
}

export function EquipmentCandidateRow({ item, selected, onSelect }: Props) {
  const specs = [
    item.tonnage !== null ? `${item.tonnage}T` : null,
    formatSpec("SEER", item.seer_rating),
    item.refrigerant_type,
    item.stages ? `${item.stages}-stage` : null,
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
        "hover:bg-[rgba(6,182,212,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        selected
          ? "border-accent bg-[rgba(6,182,212,0.08)] shadow-[0_0_18px_rgba(6,182,212,0.12)]"
          : "border-border bg-bg-card/60",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <span className="text-sm font-medium text-txt-primary break-words">
            {item.description || item.mpn || "Unnamed"}
          </span>
          {item.source === "quote" && (
            <Badge className="bg-success-bg text-success border-none text-[10px] shrink-0">Quoted</Badge>
          )}
          {item.source === "imported" && (
            <Badge className="bg-cool-blue-glow text-cool-blue-light border-none text-[10px] shrink-0">
              Imported
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-txt-tertiary">
          {item.brand && <span>{item.brand}</span>}
          {specs.length > 0 && <span>{specs.join(" · ")}</span>}
          {item.mpn && <span className="font-mono text-[10px]">{item.mpn}</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold text-txt-primary tabular-nums">
          {formatPrice(item.unit_price)}
        </div>
      </div>
    </button>
  );
}
