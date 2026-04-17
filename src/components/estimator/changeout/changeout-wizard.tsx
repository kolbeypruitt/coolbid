'use client';
import { useEffect } from 'react';
import { useEstimator } from '@/hooks/use-estimator';
import { Step1Customer } from './step-1-customer';
import { Step2InstallType } from './step-2-install-type';
import { Step3Tonnage } from './step-3-tonnage';
import { Step4Equipment } from './step-4-equipment';
import { Step5Review } from './step-5-review';

const STEPS = [
  { id: 'customer', label: 'Customer' },
  { id: 'install_type', label: 'System' },
  { id: 'tonnage', label: 'Tonnage' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'review', label: 'Review' },
] as const;

export function ChangeoutWizard() {
  const { mode, setMode, changeoutStep, error } = useEstimator();

  useEffect(() => {
    if (mode !== 'changeout') setMode('changeout');
  }, [mode, setMode]);

  const currentIndex = STEPS.findIndex((s) => s.id === changeoutStep);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-xl flex-col p-4 sm:p-6">
      <nav aria-label="Progress" className="mb-6">
        <ol className="flex items-center justify-between gap-1">
          {STEPS.map((step, i) => (
            <li key={step.id} className="flex flex-1 items-center gap-1">
              <span
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= currentIndex ? 'bg-accent' : 'bg-border'
                }`}
              />
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-txt-secondary">
          Step {currentIndex + 1} of {STEPS.length} · {STEPS[currentIndex]?.label}
        </p>
      </nav>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-danger bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex-1">
        {changeoutStep === 'customer' && <Step1Customer />}
        {changeoutStep === 'install_type' && <Step2InstallType />}
        {changeoutStep === 'tonnage' && <Step3Tonnage />}
        {changeoutStep === 'equipment' && <Step4Equipment />}
        {changeoutStep === 'review' && <Step5Review />}
      </div>
    </div>
  );
}
