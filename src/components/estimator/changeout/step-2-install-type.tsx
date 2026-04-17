'use client';
import { useEstimator } from '@/hooks/use-estimator';
import { CHANGEOUT_INSTALL_TYPES } from '@/lib/hvac/changeout-install-types';
import type { SystemType } from '@/types/catalog';

export function Step2InstallType() {
  const { systemType, setBuildingInfo, existingSystem, setTonnage, nextChangeoutStep, prevChangeoutStep } = useEstimator();

  function handleSelect(id: SystemType) {
    setBuildingInfo({ systemType: id });
    if (existingSystem?.tonnage) setTonnage(existingSystem.tonnage);
    nextChangeoutStep();
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">What are we installing?</h2>
        <p className="text-sm text-txt-secondary">Pick the system going in.</p>
      </header>

      <ul className="grid grid-cols-1 gap-3">
        {CHANGEOUT_INSTALL_TYPES.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => handleSelect(t.id)}
              className={`flex w-full min-h-[72px] items-center justify-between rounded-xl border p-4 text-left transition ${
                systemType === t.id ? 'border-accent bg-accent/10' : 'border-border bg-bg-card hover:border-accent/50'
              }`}
            >
              <div>
                <div className="text-base font-semibold">{t.label}</div>
                <div className="text-sm text-txt-secondary">{t.subtitle}</div>
              </div>
              <span className="text-txt-tertiary" aria-hidden>→</span>
            </button>
          </li>
        ))}
      </ul>

      <button type="button" onClick={prevChangeoutStep} className="text-sm text-txt-secondary underline">
        Back
      </button>
    </div>
  );
}
