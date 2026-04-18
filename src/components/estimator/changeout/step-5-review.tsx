'use client';
import { useEffect, useState, useTransition } from 'react';
import { useEstimator } from '@/hooks/use-estimator';
import { finalizeChangeout } from '@/lib/estimates/finalize-changeout-action';

const UPSELLS = [
  { key: 'thermostat', label: 'Smart thermostat' },
  { key: 'surgeProtector', label: 'Surge protector' },
  { key: 'condensatePump', label: 'Condensate pump' },
  { key: 'floatSwitch', label: 'Float switch' },
] as const;

export function Step5Review() {
  const {
    estimateId, systemType, tonnage, selectedEquipment, upsells, toggleUpsell, prevChangeoutStep, createChangeoutDraft,
  } = useEstimator();
  const [finalizing, startFinalizing] = useTransition();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!estimateId) createChangeoutDraft();
  }, [estimateId, createChangeoutDraft]);

  function handleSend() {
    if (!estimateId || !tonnage) { setErrMsg('Missing estimate data'); return; }
    setErrMsg(null);
    startFinalizing(async () => {
      const res = await finalizeChangeout({
        estimateId,
        systemType,
        tonnage,
        selectedEquipment: selectedEquipment as Record<string, string>,
        upsells,
      });
      if ('error' in res) { setErrMsg(res.error); return; }
      try {
        const r = await fetch(`/api/estimates/${estimateId}/share`, { method: 'POST' });
        const share = await r.json();
        if (!r.ok) { setErrMsg(share?.error ?? 'Could not create share link'); return; }
        const url = share?.url;
        if (url) {
          setShareUrl(url);
          navigator.clipboard?.writeText(url).catch(() => {});
        } else {
          setErrMsg('Could not create share link');
        }
      } catch (err) {
        setErrMsg(err instanceof Error ? err.message : 'Could not create share link');
      }
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">Review & send</h2>
        <p className="text-sm text-txt-secondary">Add upsells, then send the price.</p>
      </header>

      <section className="rounded-xl border border-border bg-bg-card p-4">
        <h3 className="text-sm font-semibold">Upsells</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {UPSELLS.map((u) => (
            <button
              key={u.key}
              type="button"
              onClick={() => toggleUpsell(u.key)}
              className={`min-h-[40px] rounded-full border px-3 text-sm transition ${
                upsells[u.key]
                  ? 'border-accent-light bg-accent-glow-strong text-accent-light'
                  : 'border-border bg-bg-card text-txt-primary hover:border-accent-light/50'
              }`}
              aria-pressed={upsells[u.key]}
            >
              {u.label}
            </button>
          ))}
        </div>
      </section>

      {shareUrl && (
        <div role="status" className="rounded-lg border border-accent bg-accent/10 p-3 text-sm">
          Share link copied to clipboard.
          <a className="ml-2 underline" href={shareUrl} target="_blank" rel="noreferrer">Open</a>
        </div>
      )}

      {errMsg && <div role="alert" className="text-sm text-danger">{errMsg}</div>}

      <div className="sticky bottom-0 -mx-4 mt-auto flex gap-3 border-t border-border bg-background/95 p-4 backdrop-blur sm:-mx-6 sm:p-6">
        <button type="button" onClick={prevChangeoutStep} className="min-h-[48px] flex-1 rounded-lg border border-border px-4 text-base">Back</button>
        <button
          type="button"
          onClick={handleSend}
          disabled={finalizing || !estimateId}
          className="min-h-[48px] flex-[2] rounded-lg bg-gradient-brand px-6 text-base font-semibold text-white disabled:opacity-50"
        >
          {finalizing ? 'Preparing…' : 'Send to Homeowner'}
        </button>
      </div>

      {estimateId && (
        <a href={`/estimates/${estimateId}`} className="text-center text-sm text-txt-secondary underline">
          Edit details first
        </a>
      )}
    </div>
  );
}
