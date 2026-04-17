"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EquipmentCandidateRow } from "./equipment-candidate-row";
import type { CatalogItem } from "@/types/catalog";
import type { BomSlot } from "@/lib/hvac/bom-slot-taxonomy";

type Props = {
  slot: BomSlot;
  label: string;
  description?: string;
  candidates: CatalogItem[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onClear: () => void;
};

export function EquipmentSlotPicker({
  label,
  description,
  candidates,
  selectedId,
  onSelect,
  onClear,
}: Props) {
  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-txt-primary">{label}</CardTitle>
          {description && (
            <p className="mt-1 text-xs text-txt-tertiary">{description}</p>
          )}
        </div>
        {selectedId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            aria-label={`Clear ${label} selection`}
          >
            Clear
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {candidates.length === 0 ? (
          <p className="text-sm text-txt-secondary">
            No catalog items match this tonnage. The BOM generator will flag this
            slot as Missing; upload a supplier quote or link a supplier to fill it.
          </p>
        ) : (
          candidates.map((item) => (
            <EquipmentCandidateRow
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              onSelect={() => onSelect(item.id)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
