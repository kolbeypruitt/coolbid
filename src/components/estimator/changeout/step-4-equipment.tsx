'use client';
import { useEffect, useState } from 'react';
import { useEstimator } from '@/hooks/use-estimator';
import { fetchChangeoutCandidates, type CandidatesBySlot } from '@/lib/estimates/changeout-candidates-action';
import { computeTiers, type EquipmentTier } from '@/lib/hvac/changeout-equipment-tiers';
import type { BomSlot } from '@/lib/hvac/bom-slot-taxonomy';

export function Step4Equipment() {
  const {
    systemType, tonnage, selectedEquipment, setSelectedEquipment,
    nextChangeoutStep, prevChangeoutStep,
  } = useEstimator();
  type FetchState =
    | { status: 'loading' }
    | { status: 'ready'; tiers: EquipmentTier[]; slots: string[] }
    | { status: 'error'; message: string };
  const [state, setState] = useState<FetchState>({ status: 'loading' });

  useEffect(() => {
    if (!tonnage) return;
    let cancelled = false;
    fetchChangeoutCandidates(systemType, tonnage).then((res) => {
      if (cancelled) return;
      if ('error' in res) {
        setState({ status: 'error', message: res.error });
        return;
      }
      const slots = res.slots as string[];
      setState({
        status: 'ready',
        slots,
        tiers: computeTiers(slots, res.bySlot as CandidatesBySlot),
      });
    });
    return () => { cancelled = true; };
  }, [systemType, tonnage]);

  const loading = state.status === 'loading';
  const loadError = state.status === 'error' ? state.message : null;
  const tiers = state.status === 'ready' ? state.tiers : [];
  const slots = state.status === 'ready' ? state.slots : [];

  const activeTierId = slots.length > 0 && slots.every((s) => selectedEquipment[s as BomSlot])
    ? tiers.findIndex((t) => t.picks.every((p) => selectedEquipment[p.bom_slot as BomSlot] === p.id))
    : -1;

  function pickTier(tier: EquipmentTier) {
    for (const p of tier.picks) {
      setSelectedEquipment(p.bom_slot as BomSlot, p.id);
    }
  }

  if (loading) return <p className="text-sm text-txt-secondary">Loading equipment…</p>;
  if (loadError) return <p className="text-sm text-danger">Could not load equipment: {loadError}</p>;

  if (tiers.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">No matches in your catalog for this system + tonnage.</p>
        <div className="flex gap-2">
          <button onClick={prevChangeoutStep} className="min-h-[48px] rounded-lg border border-border px-4 text-sm">
            Change tonnage
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">Pick equipment</h2>
        <p className="text-sm text-txt-secondary">Three options sized for {tonnage} ton.</p>
      </header>

      <ul className="flex flex-col gap-3">
        {tiers.map((tier, i) => {
          const active = activeTierId === i;
          return (
            <li key={tier.label}>
              <button
                type="button"
                onClick={() => pickTier(tier)}
                className={`flex w-full flex-col gap-2 rounded-xl border p-4 text-left transition ${
                  active ? 'border-accent bg-accent/10' : 'border-border bg-bg-card hover:border-accent/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold">{tier.label}</span>
                  <span className="text-lg font-semibold text-accent">
                    ${tier.totalPrice.toLocaleString()}
                  </span>
                </div>
                <ul className="flex flex-col gap-1 text-sm leading-snug text-txt-secondary">
                  {tier.picks.map((p) => (
                    <li key={p.id} className="whitespace-normal break-words">
                      {p.brand ? `${p.brand} · ` : ''}{p.name}
                    </li>
                  ))}
                </ul>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 -mx-4 mt-auto flex gap-3 border-t border-border bg-background/95 p-4 backdrop-blur sm:-mx-6 sm:p-6">
        <button type="button" onClick={prevChangeoutStep} className="min-h-[48px] flex-1 rounded-lg border border-border px-4 text-base">Back</button>
        <button
          type="button"
          onClick={nextChangeoutStep}
          disabled={activeTierId === -1}
          className="min-h-[48px] flex-[2] rounded-lg bg-gradient-brand px-6 text-base font-semibold text-white disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
