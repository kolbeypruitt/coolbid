'use client';
import { useState, useTransition } from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import { useEstimator } from '@/hooks/use-estimator';
import { reverseGeocode } from '@/lib/estimates/reverse-geocode-action';
import { CHANGEOUT_INSTALL_TYPES } from '@/lib/hvac/changeout-install-types';
import { TONNAGE_CHIPS } from '@/lib/hvac/changeout-tonnage';

export function Step1Customer() {
  const {
    customerName, setCustomerName,
    jobAddress, setJobAddress,
    customerPhone, setCustomerPhone,
    customerEmail, setCustomerEmail,
    existingSystem, setExistingSystem,
    nextChangeoutStep,
  } = useEstimator();

  const [showExisting, setShowExisting] = useState(false);
  const [locating, startLocating] = useTransition();
  const [locError, setLocError] = useState<string | null>(null);

  const canProceed = customerName.trim().length > 0 && jobAddress.trim().length > 0;

  function handleUseLocation() {
    setLocError(null);
    if (!navigator.geolocation) { setLocError('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        startLocating(async () => {
          const result = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          if ('error' in result) setLocError(result.error);
          else setJobAddress(result.address);
        });
      },
      (err) => setLocError(err.message || 'Location unavailable'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => { e.preventDefault(); if (canProceed) nextChangeoutStep(); }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Customer name *</span>
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="min-h-[48px] rounded-lg border border-border bg-bg-card px-3 text-base focus:border-accent focus:outline-none"
          autoComplete="name"
          required
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Job address *</span>
        <div className="flex gap-2">
          <input
            value={jobAddress}
            onChange={(e) => setJobAddress(e.target.value)}
            className="min-h-[48px] flex-1 rounded-lg border border-border bg-bg-card px-3 text-base focus:border-accent focus:outline-none"
            autoComplete="street-address"
            required
          />
          <button
            type="button"
            onClick={handleUseLocation}
            disabled={locating}
            className="flex min-h-[48px] items-center gap-1 rounded-lg border border-border bg-bg-card px-3 text-sm hover:border-accent disabled:opacity-50"
            aria-label="Use my current location"
          >
            <MapPin className="h-4 w-4" />
            {locating ? '...' : 'Here'}
          </button>
        </div>
        {locError && <span className="text-xs text-danger">{locError}</span>}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Phone</span>
        <input
          type="tel"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          className="min-h-[48px] rounded-lg border border-border bg-bg-card px-3 text-base focus:border-accent focus:outline-none"
          autoComplete="tel"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Email (optional)</span>
        <input
          type="email"
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
          className="min-h-[48px] rounded-lg border border-border bg-bg-card px-3 text-base focus:border-accent focus:outline-none"
          autoComplete="email"
        />
      </label>

      <div className="rounded-lg border border-border bg-bg-card">
        <button
          type="button"
          onClick={() => setShowExisting((v) => !v)}
          aria-expanded={showExisting}
          className="flex w-full min-h-[48px] items-center justify-between px-3 text-sm font-medium"
        >
          <span>Existing system (optional)</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${showExisting ? 'rotate-180' : ''}`} />
        </button>
        {showExisting && (
          <div className="flex flex-col gap-3 border-t border-border p-3">
            <div className="flex flex-col gap-2">
              <span className="text-xs text-txt-secondary">System type</span>
              <div className="flex flex-wrap gap-2">
                {CHANGEOUT_INSTALL_TYPES.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setExistingSystem({ ...(existingSystem ?? {}), systemType: t.id })}
                    className={`min-h-[40px] rounded-full border px-3 text-sm transition ${
                      existingSystem?.systemType === t.id
                        ? 'border-accent-light bg-accent-glow-strong text-accent-light'
                        : 'border-border bg-bg-card text-txt-primary hover:border-accent-light/50'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs text-txt-secondary">Tonnage</span>
              <div className="flex flex-wrap gap-2">
                {TONNAGE_CHIPS.map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setExistingSystem({ ...(existingSystem ?? {}), tonnage: t })}
                    className={`min-h-[40px] min-w-[56px] rounded-full border px-3 text-sm transition ${
                      existingSystem?.tonnage === t
                        ? 'border-accent-light bg-accent-glow-strong text-accent-light'
                        : 'border-border bg-bg-card text-txt-primary hover:border-accent-light/50'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 -mx-4 mt-auto border-t border-border bg-background/95 p-4 backdrop-blur sm:-mx-6 sm:p-6">
        <button
          type="submit"
          disabled={!canProceed}
          className="w-full min-h-[48px] rounded-lg bg-gradient-brand px-6 py-3 text-base font-semibold text-white shadow-[0_0_30px_rgba(6,182,212,0.25)] disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </form>
  );
}
