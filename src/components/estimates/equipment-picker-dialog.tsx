"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Wrench, Loader2, AlertTriangle, Sparkles } from "lucide-react";
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

export function EquipmentPickerDialog({
  estimateId,
  systemType,
  initialSelected,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] =
    useState<Partial<Record<BomSlot, string>>>(initialSelected);
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

  // Fetch candidates the first time the dialog opens. Sequential paging
  // through vendor_products takes several seconds, so we don't prefetch
  // on the estimate page — only when the user actually asks for it.
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

  const rankedBySlot = useMemo<Partial<Record<BomSlot, CatalogItem[]>>>(() => {
    if (!candidatesBySlot) return {};
    const map: Partial<Record<BomSlot, CatalogItem[]>> = {};
    for (const slot of requiredSlots) {
      map[slot] = specsFirst(candidatesBySlot[slot] ?? []);
    }
    return map;
  }, [candidatesBySlot, requiredSlots]);

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
    if (next) setSelected(initialSelected);
    setError(null);
    setOpen(next);
  }

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
            Pick a different condenser, furnace, coil, or thermostat. The BOM
            regenerates with your new picks when you save. Items ranked first
            have classifier specs (MCA, refrigerant, filter size) that help
            accessory matching land accurate picks.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-6 text-sm text-txt-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading candidates from your vendors…
          </div>
        )}

        {!loading && candidatesBySlot && (
          <div className="space-y-4 py-2">
            {requiredSlots.map((slot) => {
              const label = EQUIPMENT_TYPE_LABELS[slot as EquipmentType] ?? slot;
              const isThermostat = slot === "thermostat";
              const candidates = rankedBySlot[slot] ?? [];
              return (
                <EquipmentSlotPicker
                  key={slot}
                  slot={slot}
                  label={label}
                  description={
                    isThermostat
                      ? undefined
                      : tonnage
                        ? `Tonnage: ${tonnage}T target (±0.5T)`
                        : undefined
                  }
                  candidates={candidates}
                  selectedId={selected[slot]}
                  onSelect={(id) =>
                    setSelected((prev) => ({ ...prev, [slot]: id }))
                  }
                  onClear={() =>
                    setSelected((prev) => {
                      const next = { ...prev };
                      delete next[slot];
                      return next;
                    })
                  }
                />
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
            disabled={isPending || loading || !candidatesBySlot}
            className="bg-gradient-brand hover-lift"
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
