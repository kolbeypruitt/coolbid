'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useEstimator } from '@/hooks/use-estimator';
import { TONNAGE_CHIPS, recommendTonnageFromSqft } from '@/lib/hvac/changeout-tonnage';

export function Step3Tonnage() {
  const { tonnage, setTonnage, nextChangeoutStep, prevChangeoutStep } = useEstimator();
  const [sqftOpen, setSqftOpen] = useState(false);
  const [sqft, setSqft] = useState('');
  const [sqftHint, setSqftHint] = useState<string | null>(null);

  function handleEstimate() {
    const n = Number(sqft);
    const rec = recommendTonnageFromSqft(n);
    if (rec == null) { setSqftHint('Enter a positive number.'); return; }
    setTonnage(rec);
    setSqftHint(`Recommended: ${rec} ton`);
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">Tonnage</h2>
        <p className="text-sm text-txt-secondary">Pick the size being installed.</p>
      </header>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {TONNAGE_CHIPS.map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setTonnage(t)}
            className={`min-h-[72px] rounded-xl border text-lg font-semibold transition ${
              tonnage === t ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-bg-card hover:border-accent/50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-bg-card">
        <button
          type="button"
          onClick={() => setSqftOpen((v) => !v)}
          aria-expanded={sqftOpen}
          className="flex w-full min-h-[48px] items-center justify-between px-3 text-sm"
        >
          <span>Not sure? Estimate from square footage</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${sqftOpen ? 'rotate-180' : ''}`} />
        </button>
        {sqftOpen && (
          <div className="flex flex-col gap-2 border-t border-border p-3">
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                placeholder="Square feet"
                value={sqft}
                onChange={(e) => setSqft(e.target.value)}
                className="min-h-[48px] flex-1 rounded-lg border border-border bg-bg-card px-3 text-base focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={handleEstimate}
                className="min-h-[48px] rounded-lg bg-bg-card-hover px-4 text-sm font-medium"
              >
                Estimate
              </button>
            </div>
            {sqftHint && <span className="text-xs text-txt-secondary">{sqftHint}</span>}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 -mx-4 mt-auto flex gap-3 border-t border-border bg-background/95 p-4 backdrop-blur sm:-mx-6 sm:p-6">
        <button
          type="button"
          onClick={prevChangeoutStep}
          className="min-h-[48px] flex-1 rounded-lg border border-border px-4 text-base font-medium"
        >
          Back
        </button>
        <button
          type="button"
          onClick={nextChangeoutStep}
          disabled={tonnage == null}
          className="min-h-[48px] flex-[2] rounded-lg bg-gradient-brand px-6 text-base font-semibold text-white disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
