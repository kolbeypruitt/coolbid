"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEstimator } from "@/hooks/use-estimator";
import { createClient } from "@/lib/supabase/client";
import { loadBomCatalog } from "@/lib/estimates/load-bom-catalog";
import { findEquipmentCandidates } from "@/lib/hvac/equipment-candidates";
import {
  SYSTEM_TYPE_EQUIPMENT,
  EQUIPMENT_TYPE_LABELS,
  type EquipmentType,
} from "@/types/catalog";
import type { CatalogItem } from "@/types/catalog";
import { calculateRoomLoad, calculateSystemTonnage } from "@/lib/hvac/load-calc";
import type { BomSlot } from "@/lib/hvac/bom-slot-taxonomy";
import { EquipmentSlotPicker } from "./equipment-slot-picker";
import type { ContractorPreferences } from "@/types/contractor-preferences";

export function EquipmentStep() {
  const {
    rooms,
    climateZone,
    systemType,
    selectedEquipment,
    setStep,
    setSelectedEquipment,
    clearSelectedEquipment,
    setError,
    generateBom,
  } = useEstimator();

  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [preferences, setPreferences] = useState<ContractorPreferences | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) {
          setCatalog([]);
          return;
        }
        const [cat, { data: prefsRow }] = await Promise.all([
          loadBomCatalog(supabase, user.id),
          supabase.from("profiles").select("contractor_preferences").eq("id", user.id).single(),
        ]);
        if (cancelled) return;
        setCatalog(cat);
        setPreferences(
          (prefsRow?.contractor_preferences as ContractorPreferences | null) ?? null,
        );
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load catalog");
        setCatalog([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const totalBTU = rooms.reduce(
    (sum, r) => sum + calculateRoomLoad(r, climateZone).btu,
    0,
  );
  const tonnage = Math.max(calculateSystemTonnage(totalBTU), 2);
  const designBTU = Math.ceil(totalBTU * 1.1);

  const requiredSlots = useMemo<BomSlot[]>(
    () => [...(SYSTEM_TYPE_EQUIPMENT[systemType] as BomSlot[]), "thermostat"],
    [systemType],
  );

  const candidatesBySlot = useMemo<Partial<Record<BomSlot, CatalogItem[]>>>(() => {
    if (!catalog) return {};
    const map: Partial<Record<BomSlot, CatalogItem[]>> = {};
    for (const slot of requiredSlots) {
      map[slot] = findEquipmentCandidates({
        catalog,
        slot,
        targetTonnage: slot === "thermostat" ? null : tonnage,
        systemType,
        preferences,
        limit: 10,
      });
    }
    return map;
  }, [catalog, requiredSlots, tonnage, systemType, preferences]);

  if (loadError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">Failed to load catalog: {loadError}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setLoadError(null);
              setCatalog(null);
              setLoadAttempt((n) => n + 1);
            }}
          >
            Retry
          </Button>
          <Button variant="outline" onClick={() => setStep("rooms")}>
            Back to Rooms
          </Button>
        </div>
      </div>
    );
  }

  if (catalog === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-txt-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading catalog…
      </div>
    );
  }

  async function handleContinue() {
    if (generating) return;
    setError(null);
    setGenerating(true);
    try {
      await generateBom();
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-card border-b-accent shadow-[0_0_24px_rgba(6,182,212,0.06)]">
        <CardHeader>
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary">
            Sizing
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-txt-tertiary">
              System Size
            </div>
            <div className="text-2xl font-bold text-txt-primary">{tonnage}T</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-txt-tertiary">
              Design BTU
            </div>
            <div className="text-2xl font-bold text-txt-primary">
              {designBTU.toLocaleString()}
            </div>
          </div>
        </CardContent>
      </Card>

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
            selectedId={selectedEquipment[slot]}
            onSelect={(id) => setSelectedEquipment(slot, id)}
            onClear={() => clearSelectedEquipment(slot)}
          />
        );
      })}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button variant="outline" onClick={() => setStep("rooms")}>
          Back to Rooms
        </Button>
        <Button
          onClick={handleContinue}
          disabled={generating}
          className="bg-gradient-brand hover-lift"
        >
          {generating ? "Generating…" : "Generate BOM"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
