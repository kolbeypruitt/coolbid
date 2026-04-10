"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { calcTotals, recalcAndSave } from "@/lib/estimates/recalc";
import type { Database } from "@/types/database";

type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

export interface FinancialsCardProps {
  estimateId: string;
  initialMargin: number;
  initialLaborRate: number;
  initialLaborHours: number;
  bomItems: BomRow[];
  status: string;
}

export function FinancialsCard({
  estimateId,
  initialMargin,
  initialLaborRate,
  initialLaborHours,
  bomItems,
  status,
}: FinancialsCardProps) {
  const router = useRouter();
  const [margin, setMargin] = useState(initialMargin);
  const [laborRate, setLaborRate] = useState(initialLaborRate);
  const [laborHours, setLaborHours] = useState(initialLaborHours);
  const [saving, setSaving] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;

  const { materialCost, laborCost, markup, totalPrice } = calcTotals(
    bomItems,
    margin,
    laborRate,
    laborHours,
  );

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (m: number, lr: number, lh: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await recalcAndSave(estimateId, bomItems, m, lr, lh, statusRef.current);
          router.refresh();
        } catch {
          // silent — user sees stale total but data is safe
        } finally {
          setSaving(false);
        }
      }, 500);
    },
    [estimateId, bomItems, router],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleMarginChange(value: number) {
    setMargin(value);
    save(value, laborRate, laborHours);
  }

  function handleLaborRateChange(value: number) {
    setLaborRate(value);
    save(margin, value, laborHours);
  }

  function handleLaborHoursChange(value: number) {
    setLaborHours(value);
    save(margin, laborRate, value);
  }

  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-txt-primary">Pricing</CardTitle>
          {saving && (
            <span className="text-xs text-txt-tertiary">Saving...</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Margin slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="margin-slider">Margin</Label>
            <div className="flex items-center gap-2">
              <Input
                id="margin-number"
                type="number"
                min={0}
                max={100}
                value={margin}
                onChange={(e) =>
                  handleMarginChange(parseFloat(e.target.value) || 0)
                }
                className="w-20 text-right border-border/60 bg-bg-card hover:border-b-accent focus-visible:border-b-accent"
              />
              <span className="text-sm text-txt-secondary">%</span>
            </div>
          </div>
          {/* Pass value as [margin] so the wrapper renders exactly one thumb */}
          <Slider
            id="margin-slider"
            min={0}
            max={100}
            step={1}
            value={[margin]}
            onValueChange={(val) => {
              const next = Array.isArray(val) ? val[0] : (val as number);
              handleMarginChange(next ?? 0);
            }}
          />
        </div>

        {/* Labor inputs */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-labor-rate">Labor Rate ($/hr)</Label>
            <Input
              id="edit-labor-rate"
              type="number"
              min={0}
              value={laborRate}
              onChange={(e) =>
                handleLaborRateChange(parseFloat(e.target.value) || 0)
              }
              className="border-border/60 bg-bg-card hover:border-b-accent focus-visible:border-b-accent"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-labor-hours">Labor Hours</Label>
            <Input
              id="edit-labor-hours"
              type="number"
              min={0}
              value={laborHours}
              onChange={(e) =>
                handleLaborHoursChange(parseFloat(e.target.value) || 0)
              }
              className="border-border/60 bg-bg-card hover:border-b-accent focus-visible:border-b-accent"
            />
          </div>
        </div>

        {/* Totals breakdown */}
        <div className="rounded-lg bg-bg-card p-3 text-sm">
          <div className="flex justify-between py-0.5">
            <span className="text-txt-secondary">Materials</span>
            <span className="text-txt-primary tabular-nums">
              $
              {materialCost.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-txt-secondary">
              Labor ({laborHours} hrs @ ${laborRate}/hr)
            </span>
            <span className="text-txt-primary tabular-nums">
              $
              {laborCost.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-txt-secondary">Markup ({margin}%)</span>
            <span className="text-txt-primary tabular-nums">
              $
              {markup.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="mt-1.5 flex justify-between border-t pt-1.5 text-xl font-bold text-txt-primary">
            <span>Total</span>
            <span className="text-gradient-brand">
              $
              {totalPrice.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
