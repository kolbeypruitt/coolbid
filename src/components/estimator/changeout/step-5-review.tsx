'use client';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { Check, Loader2, Share2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useEstimator } from '@/hooks/use-estimator';
import { finalizeChangeout } from '@/lib/estimates/finalize-changeout-action';
import { createClient } from '@/lib/supabase/client';
import { compareBomCategories } from '@/lib/hvac/bom-generator';
import { ShareDialog } from '@/components/estimates/share-dialog';
import type { Database } from '@/types/database';

type EstimateRow = Database['public']['Tables']['estimates']['Row'];
type BomRow = Database['public']['Tables']['estimate_bom_items']['Row'];

const UPSELLS = [
  { key: 'thermostat', label: 'Smart thermostat' },
  { key: 'surgeProtector', label: 'Surge protector' },
  { key: 'condensatePump', label: 'Condensate pump' },
  { key: 'floatSwitch', label: 'Float switch' },
] as const;

export function Step5Review() {
  const {
    estimateId,
    systemType,
    tonnage,
    selectedEquipment,
    upsells,
    toggleUpsell,
    prevChangeoutStep,
    createChangeoutDraft,
  } = useEstimator();

  const [finalizing, startFinalizing] = useTransition();
  const [estimate, setEstimate] = useState<EstimateRow | null>(null);
  const [bom, setBom] = useState<BomRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [stale, setStale] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!estimateId) createChangeoutDraft();
  }, [estimateId, createChangeoutDraft]);

  const loadEstimateAndBom = useCallback(async (id: string) => {
    const supabase = createClient();
    const [{ data: est, error: estErr }, { data: bomItems, error: bomErr }] = await Promise.all([
      supabase.from('estimates').select('*').eq('id', id).single(),
      supabase
        .from('estimate_bom_items')
        .select('*')
        .eq('estimate_id', id)
        .order('category'),
    ]);
    if (estErr || !est) {
      setLoadError(estErr?.message ?? 'Could not load estimate');
      return;
    }
    if (bomErr) {
      setLoadError(bomErr.message);
      return;
    }
    setEstimate(est as EstimateRow);
    setBom((bomItems ?? []) as BomRow[]);
  }, []);

  const runFinalize = useCallback(() => {
    if (!estimateId || !tonnage) return;
    setLoadError(null);
    startFinalizing(async () => {
      const res = await finalizeChangeout({
        estimateId,
        systemType,
        tonnage,
        selectedEquipment: selectedEquipment as Record<string, string>,
        upsells,
      });
      if ('error' in res) {
        setLoadError(res.error);
        return;
      }
      await loadEstimateAndBom(estimateId);
      setHasGenerated(true);
      setStale(false);
    });
  }, [estimateId, tonnage, systemType, selectedEquipment, upsells, loadEstimateAndBom]);

  // Auto-generate the BOM the first time we land on this step. If a prior
  // session already finalized, reuse the saved BOM instead of re-running
  // the AI enrichment — matches the new-build flow where the BOM is
  // computed once and shown immediately.
  useEffect(() => {
    if (hasGenerated || !estimateId || !tonnage || finalizing) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: existing } = await supabase
        .from('estimate_bom_items')
        .select('id')
        .eq('estimate_id', estimateId)
        .limit(1);
      if (cancelled) return;
      if (existing && existing.length > 0) {
        await loadEstimateAndBom(estimateId);
        if (!cancelled) setHasGenerated(true);
      } else {
        runFinalize();
      }
    })();
    return () => { cancelled = true; };
  }, [hasGenerated, estimateId, tonnage, finalizing, runFinalize, loadEstimateAndBom]);

  function handleToggleUpsell(key: (typeof UPSELLS)[number]['key']) {
    toggleUpsell(key);
    if (hasGenerated) setStale(true);
  }

  const laborCost =
    estimate ? estimate.labor_rate * estimate.labor_hours : 0;
  const materialCost = estimate?.total_material_cost ?? 0;
  const totalPrice = estimate?.total_price ?? 0;
  const markup = totalPrice - materialCost - laborCost;

  const categories = (() => {
    const byCat = new Map<string, BomRow[]>();
    for (const item of bom) {
      if (!byCat.has(item.category)) byCat.set(item.category, []);
      byCat.get(item.category)!.push(item);
    }
    return Array.from(byCat.entries()).sort(([a], [b]) => compareBomCategories(a, b));
  })();

  const hasUnpricedItems = bom.some(
    (item) => item.source === 'missing' || (item.unit_cost === 0 && item.source !== 'labor'),
  );

  return (
    <div className="flex flex-1 flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">Review & send</h2>
        <p className="text-sm text-txt-secondary">
          Confirm upsells, review the BOM, then share with the homeowner.
        </p>
      </header>

      <section className="rounded-xl border border-border bg-bg-card p-4">
        <h3 className="text-sm font-semibold">Upsells</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {UPSELLS.map((u) => (
            <button
              key={u.key}
              type="button"
              onClick={() => handleToggleUpsell(u.key)}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${
                upsells[u.key]
                  ? 'border-accent-light bg-accent-glow text-accent-light'
                  : 'border-border bg-bg-card text-txt-secondary hover:bg-bg-card-hover hover:text-txt-primary'
              }`}
              aria-pressed={upsells[u.key]}
            >
              {upsells[u.key] && <Check className="h-4 w-4" />}
              {u.label}
            </button>
          ))}
        </div>
        {stale && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-warning bg-warning-bg px-3 py-2 text-sm text-warning">
            <span>Upsells changed — refresh the BOM to reflect them.</span>
            <button
              type="button"
              onClick={runFinalize}
              disabled={finalizing}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-md border border-warning px-3 text-xs font-medium disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${finalizing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        )}
      </section>

      {loadError && (
        <div role="alert" className="rounded-lg border border-danger bg-danger/10 p-3 text-sm text-danger">
          {loadError}
        </div>
      )}

      {finalizing && bom.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-bg-card p-8 text-sm text-txt-secondary">
          <Loader2 className="h-5 w-5 animate-spin" />
          Generating BOM…
        </div>
      ) : bom.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-card p-4 text-sm text-txt-secondary">
          No BOM yet. Try regenerating.
          <button
            type="button"
            onClick={runFinalize}
            disabled={finalizing}
            className="ml-2 underline disabled:opacity-50"
          >
            Generate
          </button>
        </div>
      ) : (
        <>
          {hasUnpricedItems && (
            <div className="flex items-start gap-3 rounded-lg border border-warning bg-warning-bg p-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Some items don&apos;t have pricing yet. Send an RFQ to your supplier so the quote reflects real costs.
              </span>
            </div>
          )}

          <section className="rounded-xl border border-border bg-bg-card p-4">
            <h3 className="text-sm font-semibold">Bill of materials</h3>
            <div className="mt-3 flex flex-col gap-4">
              {categories.map(([category, items]) => (
                <div key={category}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-txt-tertiary">
                    {category}
                  </p>
                  <ul className="mt-1 divide-y divide-border">
                    {items.map((item) => (
                      <li key={item.id} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-txt-primary">{item.description}</p>
                          <p className="text-xs text-txt-tertiary">
                            {item.quantity} {item.unit}
                            {item.sku ? ` · ${item.sku}` : ''}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-medium tabular-nums text-txt-primary">
                          ${item.total_cost.toFixed(2)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-bg-card p-4 text-sm">
            <div className="flex justify-between py-0.5">
              <span className="text-txt-secondary">Materials</span>
              <span className="tabular-nums text-txt-primary">
                ${materialCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {estimate && (
              <div className="flex justify-between py-0.5">
                <span className="text-txt-secondary">
                  Labor ({estimate.labor_hours} hrs @ ${estimate.labor_rate}/hr)
                </span>
                <span className="tabular-nums text-txt-primary">
                  ${laborCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {estimate && (
              <div className="flex justify-between py-0.5">
                <span className="text-txt-secondary">Markup ({estimate.profit_margin}%)</span>
                <span className="tabular-nums text-txt-primary">
                  ${markup.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-lg font-bold text-txt-primary">
              <span>Total</span>
              <span>
                ${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </section>
        </>
      )}

      <div className="sticky bottom-0 -mx-4 mt-auto flex gap-3 border-t border-border bg-background/95 p-4 backdrop-blur sm:-mx-6 sm:p-6">
        <button
          type="button"
          onClick={prevChangeoutStep}
          className="min-h-[48px] flex-1 rounded-lg border border-border px-4 text-base"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          disabled={!estimate || bom.length === 0 || finalizing || stale}
          className="inline-flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-lg bg-gradient-brand px-6 text-base font-semibold text-white disabled:opacity-50"
        >
          <Share2 className="h-4 w-4" />
          Share with homeowner
        </button>
      </div>

      {estimate && (
        <ShareDialog
          estimateId={estimate.id}
          initial={{
            display_mode: estimate.display_mode,
            valid_until: estimate.valid_until,
            scope_of_work: estimate.scope_of_work,
            note_to_customer: estimate.note_to_customer,
            customer_email: estimate.customer_email,
          }}
          hasUnpricedItems={hasUnpricedItems}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      )}

      {estimateId && (
        <a href={`/estimates/${estimateId}`} className="text-center text-sm text-txt-secondary underline">
          Edit details first
        </a>
      )}
    </div>
  );
}
