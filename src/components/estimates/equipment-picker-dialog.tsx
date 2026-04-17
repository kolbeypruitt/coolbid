"use client";

import { useMemo, useState, useTransition } from "react";
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
import { findEquipmentCandidates } from "@/lib/hvac/equipment-candidates";
import {
  SYSTEM_TYPE_EQUIPMENT,
  EQUIPMENT_TYPE_LABELS,
  type CatalogItem,
  type EquipmentType,
  type SystemType,
} from "@/types/catalog";
import type { BomSlot } from "@/lib/hvac/bom-slot-taxonomy";
import type { ContractorPreferences } from "@/types/contractor-preferences";
import { updateSelectedEquipment } from "@/lib/estimates/update-equipment";

type Props = {
  estimateId: string;
  systemType: SystemType;
  tonnage: number;
  catalog: CatalogItem[];
  preferences: ContractorPreferences | null;
  initialSelected: Partial<Record<BomSlot, string>>;
};

// Rank bom_specs-having items first so users trying to unlock accessory
// matching can see the good options at the top. findEquipmentCandidates
// already sorts by tonnage/brand/usage; we re-sort stably after.
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
  tonnage,
  catalog,
  preferences,
  initialSelected,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] =
    useState<Partial<Record<BomSlot, string>>>(initialSelected);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const requiredSlots = useMemo<BomSlot[]>(
    () => [...(SYSTEM_TYPE_EQUIPMENT[systemType] as BomSlot[]), "thermostat"],
    [systemType],
  );

  const candidatesBySlot = useMemo<Partial<Record<BomSlot, CatalogItem[]>>>(() => {
    const map: Partial<Record<BomSlot, CatalogItem[]>> = {};
    for (const slot of requiredSlots) {
      const ranked = findEquipmentCandidates({
        catalog,
        slot,
        targetTonnage: slot === "thermostat" ? null : tonnage,
        systemType,
        preferences,
        limit: 25,
      });
      map[slot] = specsFirst(ranked);
    }
    return map;
  }, [catalog, requiredSlots, tonnage, systemType, preferences]);

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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change major equipment</DialogTitle>
          <DialogDescription>
            Pick a different condenser, furnace, coil, or thermostat. The BOM
            regenerates with your new picks when you save. Items ranked first
            have classifier specs (MCA, refrigerant, filter size) that help
            accessory matching land accurate picks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {requiredSlots.map((slot) => {
            const label = EQUIPMENT_TYPE_LABELS[slot as EquipmentType] ?? slot;
            const isThermostat = slot === "thermostat";
            const candidates = candidatesBySlot[slot] ?? [];
            return (
              <EquipmentSlotPicker
                key={slot}
                slot={slot}
                label={label}
                description={
                  isThermostat
                    ? undefined
                    : `Tonnage: ${tonnage}T target (±0.5T)`
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
            disabled={isPending}
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
