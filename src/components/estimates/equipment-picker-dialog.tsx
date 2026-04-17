"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Wrench,
  Loader2,
  AlertTriangle,
  Sparkles,
  Check,
  ChevronDown,
  SkipForward,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EquipmentSlotPicker } from "@/components/estimator/equipment-slot-picker";
import {
  SYSTEM_TYPE_EQUIPMENT,
  EQUIPMENT_TYPE_LABELS,
  type CatalogItem,
  type EquipmentType,
  type SystemType,
} from "@/types/catalog";
import type { BomSlot } from "@/lib/hvac/bom-slot-taxonomy";
import { updateSelectedEquipment } from "@/lib/estimates/update-equipment";
import { fetchEquipmentCandidates } from "@/lib/estimates/equipment-candidates-action";

type Props = {
  estimateId: string;
  systemType: SystemType;
  initialSelected: Partial<Record<BomSlot, string>>;
};

// Rank bom_specs-having items first so users trying to unlock accessory
// matching can see the good options at the top.
function specsFirst(items: CatalogItem[]): CatalogItem[] {
  return [...items].sort((a, b) => {
    const aHas = a.bom_specs && Object.keys(a.bom_specs).length > 0 ? 1 : 0;
    const bHas = b.bom_specs && Object.keys(b.bom_specs).length > 0 ? 1 : 0;
    return bHas - aHas;
  });
}

type CollapsedProps = {
  label: string;
  pickedItem: CatalogItem | undefined;
  isSkipped: boolean;
  onExpand: () => void;
  onClear: () => void;
};

function CollapsedSlotRow({
  label,
  pickedItem,
  isSkipped,
  onExpand,
  onClear,
}: CollapsedProps) {
  const summary = pickedItem
    ? pickedItem.description || pickedItem.mpn || "Picked"
    : isSkipped
      ? "Skipped"
      : "Not picked";
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-card/40 px-3 py-2.5">
      {pickedItem ? (
        <Check className="h-4 w-4 shrink-0 text-success" />
      ) : (
        <SkipForward className="h-4 w-4 shrink-0 text-txt-tertiary" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary">
          {label}
        </div>
        <div className="truncate text-sm text-txt-primary">{summary}</div>
      </div>
      {(pickedItem || isSkipped) && (
        <Button variant="ghost" size="sm" onClick={onClear} type="button">
          Clear
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={onExpand} type="button">
        <ChevronDown className="mr-1 h-4 w-4" />
        Change
      </Button>
    </div>
  );
}

export function EquipmentPickerDialog({
  estimateId,
  systemType,
  initialSelected,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] =
    useState<Partial<Record<BomSlot, string>>>(initialSelected);
  const [skipped, setSkipped] = useState<Set<BomSlot>>(new Set());
  const [activeSlot, setActiveSlot] = useState<BomSlot | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [candidatesBySlot, setCandidatesBySlot] = useState<
    Partial<Record<BomSlot, CatalogItem[]>> | null
  >(null);
  const [tonnage, setTonnage] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const requiredSlots = useMemo<BomSlot[]>(
    () => [...(SYSTEM_TYPE_EQUIPMENT[systemType] as BomSlot[]), "thermostat"],
    [systemType],
  );

  useEffect(() => {
    if (!open || candidatesBySlot !== null) return;
    setLoading(true);
    setError(null);
    fetchEquipmentCandidates(estimateId)
      .then((res) => {
        if ("error" in res) setError(res.error);
        else {
          setCandidatesBySlot(res.candidatesBySlot);
          setTonnage(res.tonnage);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [open, estimateId, candidatesBySlot]);

  // When candidates finish loading (first open), focus the first unresolved
  // slot so the user lands on an actionable step.
  useEffect(() => {
    if (!candidatesBySlot || activeSlot !== null) return;
    const first = requiredSlots.find(
      (s) => !(s in selected) && !skipped.has(s),
    );
    setActiveSlot(first ?? null);
  }, [candidatesBySlot, requiredSlots, selected, skipped, activeSlot]);

  const rankedBySlot = useMemo<Partial<Record<BomSlot, CatalogItem[]>>>(() => {
    if (!candidatesBySlot) return {};
    const map: Partial<Record<BomSlot, CatalogItem[]>> = {};
    for (const slot of requiredSlots) {
      map[slot] = specsFirst(candidatesBySlot[slot] ?? []);
    }
    return map;
  }, [candidatesBySlot, requiredSlots]);

  function nextSlotAfter(slot: BomSlot): BomSlot | null {
    const idx = requiredSlots.indexOf(slot);
    for (let i = idx + 1; i < requiredSlots.length; i++) {
      const s = requiredSlots[i];
      if (!(s in selected) && !skipped.has(s)) return s;
    }
    // Nothing ahead; fall back to any unresolved slot earlier in the list
    // so the user can still revisit before saving.
    const earlier = requiredSlots.find(
      (s) => !(s in selected) && !skipped.has(s),
    );
    return earlier ?? null;
  }

  function handleSelect(slot: BomSlot, id: string) {
    setSelected((prev) => ({ ...prev, [slot]: id }));
    setSkipped((prev) => {
      if (!prev.has(slot)) return prev;
      const next = new Set(prev);
      next.delete(slot);
      return next;
    });
    setActiveSlot(nextSlotAfter(slot));
  }

  function handleSkip(slot: BomSlot) {
    setSkipped((prev) => {
      const next = new Set(prev);
      next.add(slot);
      return next;
    });
    setSelected((prev) => {
      if (!(slot in prev)) return prev;
      const next = { ...prev };
      delete next[slot];
      return next;
    });
    setActiveSlot(nextSlotAfter(slot));
  }

  function handleClear(slot: BomSlot) {
    setSelected((prev) => {
      if (!(slot in prev)) return prev;
      const next = { ...prev };
      delete next[slot];
      return next;
    });
    setSkipped((prev) => {
      if (!prev.has(slot)) return prev;
      const next = new Set(prev);
      next.delete(slot);
      return next;
    });
    setActiveSlot(slot);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await updateSelectedEquipment(estimateId, selected);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    if (next) {
      setSelected(initialSelected);
      setSkipped(new Set());
      setActiveSlot(null);
    }
    setError(null);
    setOpen(next);
  }

  const allResolved = requiredSlots.every(
    (s) => s in selected || skipped.has(s),
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" type="button" />}>
        <Wrench className="mr-1.5 h-4 w-4" />
        Change equipment
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[min(95vw,56rem)] max-w-none overflow-y-auto sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Change major equipment</DialogTitle>
          <DialogDescription>
            Pick one piece at a time. Skip anything this job doesn&apos;t need
            (no gas furnace, no heat strips, etc.). Saving regenerates the BOM
            with your picks.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-6 text-sm text-txt-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading candidates from your vendors…
          </div>
        )}

        {!loading && candidatesBySlot && (
          <div className="space-y-3 py-2">
            {requiredSlots.map((slot) => {
              const label = EQUIPMENT_TYPE_LABELS[slot as EquipmentType] ?? slot;
              const isActive = activeSlot === slot;
              const isSkipped = skipped.has(slot);
              const candidates = rankedBySlot[slot] ?? [];
              const pickedItem = selected[slot]
                ? candidates.find((c) => c.id === selected[slot])
                : undefined;

              if (!isActive) {
                return (
                  <CollapsedSlotRow
                    key={slot}
                    label={label}
                    pickedItem={pickedItem}
                    isSkipped={isSkipped}
                    onExpand={() => setActiveSlot(slot)}
                    onClear={() => handleClear(slot)}
                  />
                );
              }

              return (
                <div key={slot} className="space-y-2">
                  <EquipmentSlotPicker
                    slot={slot}
                    label={label}
                    description={
                      slot === "thermostat"
                        ? undefined
                        : tonnage
                          ? `Tonnage: ${tonnage}T target (±0.5T)`
                          : undefined
                    }
                    candidates={candidates}
                    selectedId={selected[slot]}
                    onSelect={(id) => handleSelect(slot, id)}
                    onClear={() => handleClear(slot)}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => handleSkip(slot)}
                    >
                      <SkipForward className="mr-1 h-4 w-4" />
                      Skip — not needed
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-error bg-error-bg px-3 py-2 text-sm text-error">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isPending || loading || !candidatesBySlot || !allResolved}
            className="bg-gradient-brand hover-lift"
            title={!allResolved ? "Pick or skip every slot to continue" : undefined}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Saving &amp; regenerating…
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 h-4 w-4" />
                Save &amp; regenerate BOM
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
