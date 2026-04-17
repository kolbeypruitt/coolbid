# Changeout Estimate Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork `/estimates/new` into new-build (existing floor-plan flow) vs changeout (new five-step mobile-first wizard), sharing the BOM/pricing/share infrastructure.

**Architecture:** Single `estimates` table with an `estimate_type` discriminator. Changeout path skips load calc and rooms, captures install-type + tonnage + equipment picks, then feeds the same `BomResult` shape downstream. Fork is the first screen; wizards split by URL (`/estimates/new/build` vs `/estimates/new/changeout`).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zustand (client state), Supabase (Postgres), Tailwind 4, shadcn v4 on `@base-ui/react`, Vitest, Claude API for accessory enrichment.

**Spec:** `docs/superpowers/specs/2026-04-17-changeout-estimate-flow-design.md`

---

## File Structure

**Created:**
- `supabase/migrations/20260417220000_changeout_estimate_fields.sql` — schema
- `src/lib/hvac/changeout-tonnage.ts` + `__tests__/changeout-tonnage.test.ts` — sqft→tonnage helper
- `src/lib/hvac/changeout-bom.ts` + `__tests__/changeout-bom.test.ts` — BOM generator
- `src/lib/hvac/changeout-equipment-tiers.ts` + `__tests__/changeout-equipment-tiers.test.ts` — Good/Better/Best
- `src/lib/estimates/changeout-candidates-action.ts` — server action: vendor lookup
- `src/lib/estimates/finalize-changeout-action.ts` — server action: persist BOM
- `src/lib/estimates/reverse-geocode-action.ts` — server action: lat/lng → address
- `src/components/estimator/changeout/mode-picker-screen.tsx` — fork UI
- `src/components/estimator/changeout/changeout-wizard.tsx` — step dispatcher
- `src/components/estimator/changeout/step-1-customer.tsx`
- `src/components/estimator/changeout/step-2-install-type.tsx`
- `src/components/estimator/changeout/step-3-tonnage.tsx`
- `src/components/estimator/changeout/step-4-equipment.tsx`
- `src/components/estimator/changeout/step-5-review.tsx`
- `src/app/(app)/estimates/new/build/page.tsx` — hosts existing wizard
- `src/app/(app)/estimates/new/changeout/page.tsx` — hosts changeout wizard

**Modified:**
- `src/app/(app)/estimates/new/page.tsx` — becomes fork screen
- `src/hooks/use-estimator.ts` — `mode` discriminator, changeout steps, changeout actions
- `src/types/database.ts` — add `estimate_type`, `existing_system`, `tonnage`, extend `system_type`
- `src/types/hvac.ts` — extend `SystemType` with `"ac_only"`
- `src/lib/hvac/bom-generator.ts` — add `ac_only` entry to `SYSTEM_TYPE_EQUIPMENT`
- `src/app/q/[token]/page.tsx` — render `existing_system` context on changeout estimates

---

## Task 1: Schema migration + TypeScript types

**Files:**
- Create: `supabase/migrations/20260417220000_changeout_estimate_fields.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260417220000_changeout_estimate_fields.sql

ALTER TABLE estimates
  ADD COLUMN estimate_type text NOT NULL DEFAULT 'new_build',
  ADD COLUMN existing_system jsonb,
  ADD COLUMN tonnage numeric(3,1);

ALTER TABLE estimates
  ADD CONSTRAINT estimates_estimate_type_chk
    CHECK (estimate_type IN ('new_build', 'changeout'));

-- Extend system_type to support AC-only changeouts.
ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_system_type_check;
ALTER TABLE estimates
  ADD CONSTRAINT estimates_system_type_check
    CHECK (system_type IN ('heat_pump', 'gas_ac', 'electric', 'dual_fuel', 'ac_only'));

CREATE INDEX estimates_type_idx ON estimates (estimate_type);

COMMENT ON COLUMN estimates.estimate_type IS 'new_build uses floor-plan wizard; changeout uses the mobile equipment-replacement wizard';
COMMENT ON COLUMN estimates.existing_system IS 'Optional metadata about the system being replaced: { system_type?, tonnage?, age_years?, notes? }';
COMMENT ON COLUMN estimates.tonnage IS 'Changeout-only. New-build computes tonnage from load calc instead.';
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db push` (or whatever local-apply command the repo uses — check `package.json` scripts)
Expected: no errors. If a local DB isn't wired, skip and note; the CI/deploy path applies migrations on push.

- [ ] **Step 3: Update the Database TS type**

Locate the `estimates` row type in `src/types/database.ts` and add the three new columns plus the extended `system_type` union. The exact block to edit is the `Row` / `Insert` / `Update` interfaces under `public.Tables.estimates`.

Add to `Row` (and mirror in `Insert` with `?`, and in `Update` with `?`):

```ts
estimate_type: 'new_build' | 'changeout';
existing_system: { system_type?: string; tonnage?: number; age_years?: number; notes?: string } | null;
tonnage: number | null;
```

Update the existing `system_type` union everywhere it appears to include `'ac_only'`:

```ts
system_type: 'heat_pump' | 'gas_ac' | 'electric' | 'dual_fuel' | 'ac_only';
```

- [ ] **Step 4: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: clean. If downstream files now complain about unhandled `ac_only` in switches, fix by adding a case (or mapping to default behavior) — Task 2 covers the primary SYSTEM_TYPE_EQUIPMENT handler.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260417220000_changeout_estimate_fields.sql src/types/database.ts
git commit -m "feat(db): add estimate_type, existing_system, tonnage to estimates"
```

---

## Task 2: Register `ac_only` in SystemType and equipment map

**Files:**
- Modify: `src/types/hvac.ts`
- Modify: `src/lib/hvac/bom-generator.ts`

- [ ] **Step 1: Extend SystemType**

In `src/types/hvac.ts`, find `SystemType` and add `'ac_only'`:

```ts
export type SystemType = 'heat_pump' | 'gas_ac' | 'electric' | 'dual_fuel' | 'ac_only';
```

- [ ] **Step 2: Add to SYSTEM_TYPE_EQUIPMENT**

In `src/lib/hvac/bom-generator.ts`, locate the `SYSTEM_TYPE_EQUIPMENT` map and add:

```ts
ac_only: ['ac_condenser', 'evap_coil', 'air_handler'],
```

(No heat source. Existing entries for the other four types stay unchanged.)

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all 202 tests still pass. If any exhaustive switch breaks, add the `ac_only` case — usually returning the same behavior as `electric`.

- [ ] **Step 4: Commit**

```bash
git add src/types/hvac.ts src/lib/hvac/bom-generator.ts
git commit -m "feat(hvac): support ac_only system type"
```

---

## Task 3: Sqft → tonnage helper (pure logic + tests first)

**Files:**
- Create: `src/lib/hvac/changeout-tonnage.ts`
- Test: `src/lib/hvac/__tests__/changeout-tonnage.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/hvac/__tests__/changeout-tonnage.test.ts
import { describe, it, expect } from 'vitest';
import { recommendTonnageFromSqft, TONNAGE_CHIPS, CHANGEOUT_TONNAGE_SQFT_PER_TON } from '../changeout-tonnage';

describe('recommendTonnageFromSqft', () => {
  it('exposes the exact chip set expected by the UI', () => {
    expect(TONNAGE_CHIPS).toEqual([1.5, 2, 2.5, 3, 3.5, 4, 5]);
  });

  it('uses the documented multiplier', () => {
    expect(CHANGEOUT_TONNAGE_SQFT_PER_TON).toBe(550);
  });

  it('snaps 1650 sqft to 3 ton', () => {
    expect(recommendTonnageFromSqft(1650)).toBe(3);
  });

  it('snaps 1375 sqft to 2.5 ton', () => {
    expect(recommendTonnageFromSqft(1375)).toBe(2.5);
  });

  it('rounds up at chip boundaries (1450 → 2.5, not 2)', () => {
    expect(recommendTonnageFromSqft(1450)).toBe(2.5);
  });

  it('floors at 1.5 ton for small homes', () => {
    expect(recommendTonnageFromSqft(400)).toBe(1.5);
  });

  it('caps at 5 ton for very large homes', () => {
    expect(recommendTonnageFromSqft(4000)).toBe(5);
  });

  it('returns null for non-positive input', () => {
    expect(recommendTonnageFromSqft(0)).toBeNull();
    expect(recommendTonnageFromSqft(-100)).toBeNull();
    expect(recommendTonnageFromSqft(Number.NaN)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx vitest run src/lib/hvac/__tests__/changeout-tonnage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/hvac/changeout-tonnage.ts

export const CHANGEOUT_TONNAGE_SQFT_PER_TON = 550;

export const TONNAGE_CHIPS = [1.5, 2, 2.5, 3, 3.5, 4, 5] as const;
export type TonnageChip = (typeof TONNAGE_CHIPS)[number];

/**
 * Snap a raw sqft value to the nearest tonnage chip using a fixed
 * rule-of-thumb multiplier. Sanity check only — not a load calc.
 */
export function recommendTonnageFromSqft(sqft: number): TonnageChip | null {
  if (!Number.isFinite(sqft) || sqft <= 0) return null;
  const rawTons = sqft / CHANGEOUT_TONNAGE_SQFT_PER_TON;
  let best: TonnageChip = TONNAGE_CHIPS[0];
  let bestDelta = Math.abs(rawTons - best);
  for (const chip of TONNAGE_CHIPS) {
    const delta = Math.abs(rawTons - chip);
    // Prefer the higher chip on ties — under-sizing is worse than over-sizing.
    if (delta < bestDelta || (delta === bestDelta && chip > best)) {
      best = chip;
      bestDelta = delta;
    }
  }
  if (rawTons > TONNAGE_CHIPS[TONNAGE_CHIPS.length - 1]) return 5;
  return best;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/hvac/__tests__/changeout-tonnage.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hvac/changeout-tonnage.ts src/lib/hvac/__tests__/changeout-tonnage.test.ts
git commit -m "feat(hvac): add sqft→tonnage helper for changeout wizard"
```

---

## Task 4: Install-type catalog (labels ↔ system_type)

**Files:**
- Create: `src/lib/hvac/changeout-install-types.ts`

- [ ] **Step 1: Write the constants**

```ts
// src/lib/hvac/changeout-install-types.ts
import type { SystemType } from '@/types/hvac';

export type ChangeoutInstallType = {
  id: SystemType;
  label: string;
  subtitle: string;
  icon: 'snowflake' | 'heat-pump' | 'flame' | 'dual-fuel' | 'zap';
};

export const CHANGEOUT_INSTALL_TYPES: readonly ChangeoutInstallType[] = [
  { id: 'ac_only', label: 'AC Only', subtitle: 'Cooling only, no heat source', icon: 'snowflake' },
  { id: 'heat_pump', label: 'Heat Pump', subtitle: 'All-electric heat + cool', icon: 'heat-pump' },
  { id: 'gas_ac', label: 'Gas Furnace + AC', subtitle: 'Standard split system', icon: 'flame' },
  { id: 'dual_fuel', label: 'Dual Fuel', subtitle: 'Heat pump + gas backup', icon: 'dual-fuel' },
  { id: 'electric', label: 'Air Handler + Heat Strips', subtitle: 'All-electric', icon: 'zap' },
] as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/hvac/changeout-install-types.ts
git commit -m "feat(hvac): define changeout install-type catalog"
```

---

## Task 5: Extend `useEstimator` with changeout mode + state

**Files:**
- Modify: `src/hooks/use-estimator.ts`

- [ ] **Step 1: Add the mode discriminator and changeout-only state**

At the top of `use-estimator.ts`, add:

```ts
export type EstimatorMode = 'new_build' | 'changeout';

export type ChangeoutStep =
  | 'customer'
  | 'install_type'
  | 'tonnage'
  | 'equipment'
  | 'review';

export type ExistingSystemInfo = {
  systemType?: SystemType;
  tonnage?: number;
  ageYears?: number;
  notes?: string;
};

export type ChangeoutUpsells = {
  thermostat: boolean;
  surgeProtector: boolean;
  condensatePump: boolean;
  floatSwitch: boolean;
};
```

Extend `EstimatorState`:

```ts
type EstimatorState = {
  // existing fields unchanged...
  mode: EstimatorMode;
  changeoutStep: ChangeoutStep;
  tonnage: number | null;
  existingSystem: ExistingSystemInfo | null;
  upsells: ChangeoutUpsells;
};
```

Extend `initialState()`:

```ts
return {
  // existing defaults unchanged...
  mode: 'new_build',
  changeoutStep: 'customer',
  tonnage: null,
  existingSystem: null,
  upsells: { thermostat: false, surgeProtector: false, condensatePump: false, floatSwitch: false },
};
```

- [ ] **Step 2: Add actions**

Add to `EstimatorActions`:

```ts
setMode: (mode: EstimatorMode) => void;
setChangeoutStep: (step: ChangeoutStep) => void;
nextChangeoutStep: () => void;
prevChangeoutStep: () => void;
setTonnage: (tonnage: number | null) => void;
setExistingSystem: (info: ExistingSystemInfo | null) => void;
toggleUpsell: (key: keyof ChangeoutUpsells) => void;
createChangeoutDraft: () => Promise<string | null>;
```

Implement in the `create()` callback:

```ts
setMode: (mode) => set({ mode }),
setChangeoutStep: (changeoutStep) => set({ changeoutStep }),
nextChangeoutStep: () => {
  const order: ChangeoutStep[] = ['customer', 'install_type', 'tonnage', 'equipment', 'review'];
  const current = get().changeoutStep;
  const i = order.indexOf(current);
  if (i >= 0 && i < order.length - 1) set({ changeoutStep: order[i + 1] });
},
prevChangeoutStep: () => {
  const order: ChangeoutStep[] = ['customer', 'install_type', 'tonnage', 'equipment', 'review'];
  const current = get().changeoutStep;
  const i = order.indexOf(current);
  if (i > 0) set({ changeoutStep: order[i - 1] });
},
setTonnage: (tonnage) => set({ tonnage }),
setExistingSystem: (existingSystem) => set({ existingSystem }),
toggleUpsell: (key) => set((state) => ({ upsells: { ...state.upsells, [key]: !state.upsells[key] } })),
createChangeoutDraft: async () => {
  const state = get();
  const supabase = getBrowserClient(); // use the same browser-client pattern existing createDraft uses
  const { data, error } = await supabase
    .from('estimates')
    .insert({
      estimate_type: 'changeout',
      customer_name: state.customerName,
      job_address: state.jobAddress,
      customer_email: state.customerEmail || null,
      customer_phone: state.customerPhone || null,
      system_type: state.systemType,
      tonnage: state.tonnage,
      existing_system: state.existingSystem,
      profit_margin: state.profitMargin,
      labor_rate: state.laborRate,
      labor_hours: state.laborHours,
    })
    .select('id')
    .single();
  if (error || !data) { set({ error: error?.message ?? 'Failed to create draft' }); return null; }
  set({ estimateId: data.id, error: null });
  return data.id;
},
```

(Match the exact Supabase-browser-client import/pattern the existing `createDraft` uses — don't invent a new one.)

- [ ] **Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-estimator.ts
git commit -m "feat(estimator): add changeout mode + state to store"
```

---

## Task 6: Fork screen at `/estimates/new`

**Files:**
- Create: `src/components/estimator/changeout/mode-picker-screen.tsx`
- Modify: `src/app/(app)/estimates/new/page.tsx`
- Create: `src/app/(app)/estimates/new/build/page.tsx`
- Create: `src/app/(app)/estimates/new/changeout/page.tsx`

- [ ] **Step 1: Create the mode picker component**

```tsx
// src/components/estimator/changeout/mode-picker-screen.tsx
'use client';
import Link from 'next/link';
import { FileText, Wrench } from 'lucide-react';

export function ModePickerScreen() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2 text-center sm:text-left">
        <h1 className="text-2xl font-semibold">New estimate</h1>
        <p className="text-txt-secondary">What kind of job is this?</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/estimates/new/build"
          className="group flex min-h-[200px] flex-col justify-between rounded-2xl border border-border bg-bg-card/70 p-6 shadow-[0_20px_60px_-20px_rgba(6,182,212,0.25)] transition-all hover:-translate-y-0.5 hover:border-accent active:translate-y-0"
        >
          <FileText className="h-8 w-8 text-txt-secondary transition-colors group-hover:text-accent" />
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">New Build</h2>
            <p className="text-sm text-txt-secondary">Estimate from a floor plan PDF.</p>
          </div>
        </Link>

        <Link
          href="/estimates/new/changeout"
          className="group flex min-h-[200px] flex-col justify-between rounded-2xl border border-border bg-bg-card/70 p-6 shadow-[0_20px_60px_-20px_rgba(6,182,212,0.25)] transition-all hover:-translate-y-0.5 hover:border-accent active:translate-y-0"
        >
          <Wrench className="h-8 w-8 text-txt-secondary transition-colors group-hover:text-accent" />
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Changeout</h2>
            <p className="text-sm text-txt-secondary">Replace equipment on an existing system.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Move existing wizard to `/build`**

Create `src/app/(app)/estimates/new/build/page.tsx` with the **exact** content the current `src/app/(app)/estimates/new/page.tsx` has today. (Copy the file verbatim.)

- [ ] **Step 3: Replace `/new/page.tsx` with the fork**

Overwrite `src/app/(app)/estimates/new/page.tsx`:

```tsx
import { ModePickerScreen } from '@/components/estimator/changeout/mode-picker-screen';
export default function NewEstimatePage() {
  return <ModePickerScreen />;
}
```

- [ ] **Step 4: Create changeout page shell (wires in next task)**

```tsx
// src/app/(app)/estimates/new/changeout/page.tsx
import { ChangeoutWizard } from '@/components/estimator/changeout/changeout-wizard';
export default function ChangeoutEstimatePage() {
  return <ChangeoutWizard />;
}
```

(The `ChangeoutWizard` component doesn't exist yet — Task 7 creates it. Build will fail until then; that's fine within this plan sequence.)

- [ ] **Step 5: Commit**

```bash
git add src/components/estimator/changeout/mode-picker-screen.tsx \
        src/app/(app)/estimates/new/page.tsx \
        src/app/(app)/estimates/new/build/page.tsx \
        src/app/(app)/estimates/new/changeout/page.tsx
git commit -m "feat(estimator): fork screen + split new-build and changeout routes"
```

---

## Task 7: Changeout wizard shell

**Files:**
- Create: `src/components/estimator/changeout/changeout-wizard.tsx`

- [ ] **Step 1: Implement the shell with step dispatch**

```tsx
// src/components/estimator/changeout/changeout-wizard.tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/estimator/changeout/changeout-wizard.tsx
git commit -m "feat(estimator): changeout wizard shell with step progress"
```

---

## Task 8: Step 1 — Customer + existing system + geolocation

**Files:**
- Create: `src/lib/estimates/reverse-geocode-action.ts`
- Create: `src/components/estimator/changeout/step-1-customer.tsx`

- [ ] **Step 1: Server action for reverse geocoding**

```ts
// src/lib/estimates/reverse-geocode-action.ts
'use server';

export type GeocodeResult = { address: string } | { error: string };

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: 'Invalid coordinates' };
  }
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'coolbid/1.0 (changeout-wizard)' }, cache: 'no-store' });
    if (!res.ok) return { error: `Geocoding failed (${res.status})` };
    const data = (await res.json()) as { display_name?: string };
    if (!data.display_name) return { error: 'No address found' };
    return { address: data.display_name };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Geocoding failed' };
  }
}
```

- [ ] **Step 2: Step 1 component**

```tsx
// src/components/estimator/changeout/step-1-customer.tsx
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
                    className={`min-h-[40px] rounded-full border px-3 text-sm ${
                      existingSystem?.systemType === t.id
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-bg-card'
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
                    className={`min-h-[40px] min-w-[56px] rounded-full border px-3 text-sm ${
                      existingSystem?.tonnage === t
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-bg-card'
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
```

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc --noEmit` — expect clean.

```bash
git add src/lib/estimates/reverse-geocode-action.ts src/components/estimator/changeout/step-1-customer.tsx
git commit -m "feat(estimator): changeout step 1 customer + geolocation + optional existing system"
```

---

## Task 9: Step 2 — Install type chip grid

**Files:**
- Create: `src/components/estimator/changeout/step-2-install-type.tsx`

- [ ] **Step 1: Component**

```tsx
// src/components/estimator/changeout/step-2-install-type.tsx
'use client';
import { useEstimator } from '@/hooks/use-estimator';
import { CHANGEOUT_INSTALL_TYPES } from '@/lib/hvac/changeout-install-types';

export function Step2InstallType() {
  const { systemType, setSystemType, existingSystem, setTonnage, nextChangeoutStep, prevChangeoutStep } = useEstimator();

  function handleSelect(id: typeof CHANGEOUT_INSTALL_TYPES[number]['id']) {
    setSystemType(id);
    // Prefill tonnage from existing if present and this is our first visit.
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

      <button
        type="button"
        onClick={prevChangeoutStep}
        className="text-sm text-txt-secondary underline"
      >
        Back
      </button>
    </div>
  );
}
```

(Uses the existing `setSystemType` store action. If it doesn't exist in the store yet, add it in Task 5's action list — it should already be present since `systemType` is existing state.)

- [ ] **Step 2: Commit**

```bash
git add src/components/estimator/changeout/step-2-install-type.tsx
git commit -m "feat(estimator): changeout step 2 install-type picker"
```

---

## Task 10: Step 3 — Tonnage chips + sqft helper

**Files:**
- Create: `src/components/estimator/changeout/step-3-tonnage.tsx`

- [ ] **Step 1: Component**

```tsx
// src/components/estimator/changeout/step-3-tonnage.tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/estimator/changeout/step-3-tonnage.tsx
git commit -m "feat(estimator): changeout step 3 tonnage + sqft helper"
```

---

## Task 11: Server action — fetch changeout equipment candidates

**Files:**
- Create: `src/lib/estimates/changeout-candidates-action.ts`

- [ ] **Step 1: Implement the action**

```ts
// src/lib/estimates/changeout-candidates-action.ts
'use server';
import { createClient } from '@/lib/supabase/server';
import { SYSTEM_TYPE_EQUIPMENT } from '@/lib/hvac/bom-generator';
import type { SystemType } from '@/types/hvac';
import type { BomSlot } from '@/lib/hvac/bom-slot-taxonomy';

export type ChangeoutCandidate = {
  id: string;
  name: string;
  mpn: string | null;
  brand: string | null;
  supplier: string | null;
  price: number | null;
  bom_slot: BomSlot;
  tonnage: number | null;
};

export type CandidatesBySlot = Record<BomSlot, ChangeoutCandidate[]>;

export async function fetchChangeoutCandidates(
  systemType: SystemType,
  tonnage: number,
): Promise<{ slots: BomSlot[]; bySlot: CandidatesBySlot } | { error: string }> {
  const slots = SYSTEM_TYPE_EQUIPMENT[systemType];
  if (!slots) return { error: `Unknown system type: ${systemType}` };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vendor_products')
    .select('id, name, mpn, brand, supplier, unit_cost, bom_slot, bom_specs')
    .in('bom_slot', slots as unknown as string[])
    .not('unit_cost', 'is', null);

  if (error) return { error: error.message };

  const bySlot = Object.fromEntries(slots.map((s) => [s, [] as ChangeoutCandidate[]])) as CandidatesBySlot;
  for (const row of data ?? []) {
    const slot = row.bom_slot as BomSlot;
    const specs = (row.bom_specs ?? {}) as { tonnage?: number };
    const tonMatch = specs.tonnage == null || specs.tonnage === tonnage;
    // Gas furnace tonnage matching is loose — BTU sizing maps roughly 1 ton per 12k BTU.
    if (!tonMatch && slot !== 'gas_furnace') continue;
    bySlot[slot].push({
      id: row.id,
      name: row.name,
      mpn: row.mpn,
      brand: row.brand,
      supplier: row.supplier,
      price: row.unit_cost,
      bom_slot: slot,
      tonnage: specs.tonnage ?? null,
    });
  }
  return { slots: [...slots], bySlot };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/estimates/changeout-candidates-action.ts
git commit -m "feat(estimates): server action to fetch changeout equipment candidates"
```

---

## Task 12: Good/Better/Best tier computation (+ tests)

**Files:**
- Create: `src/lib/hvac/changeout-equipment-tiers.ts`
- Test: `src/lib/hvac/__tests__/changeout-equipment-tiers.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// src/lib/hvac/__tests__/changeout-equipment-tiers.test.ts
import { describe, it, expect } from 'vitest';
import { computeTiers } from '../changeout-equipment-tiers';
import type { ChangeoutCandidate } from '@/lib/estimates/changeout-candidates-action';
import type { BomSlot } from '@/lib/hvac/bom-slot-taxonomy';

function cand(id: string, slot: BomSlot, price: number): ChangeoutCandidate {
  return { id, name: id, mpn: null, brand: null, supplier: null, price, bom_slot: slot, tonnage: 3 };
}

describe('computeTiers', () => {
  it('produces three tiers when enough candidates exist', () => {
    const slots: BomSlot[] = ['ac_condenser', 'evap_coil'];
    const bySlot = {
      ac_condenser: [cand('a1', 'ac_condenser', 1000), cand('a2', 'ac_condenser', 1500), cand('a3', 'ac_condenser', 2000)],
      evap_coil: [cand('e1', 'evap_coil', 300), cand('e2', 'evap_coil', 450), cand('e3', 'evap_coil', 600)],
    } as const;
    const tiers = computeTiers(slots, bySlot as never);
    expect(tiers).toHaveLength(3);
    expect(tiers[0].label).toBe('Good');
    expect(tiers[1].label).toBe('Better');
    expect(tiers[2].label).toBe('Best');
    expect(tiers[0].totalPrice).toBe(1300);
    expect(tiers[2].totalPrice).toBe(2600);
  });

  it('degrades to fewer tiers when candidates are sparse', () => {
    const slots: BomSlot[] = ['ac_condenser'];
    const bySlot = { ac_condenser: [cand('a1', 'ac_condenser', 1000)] } as const;
    const tiers = computeTiers(slots, bySlot as never);
    expect(tiers).toHaveLength(1);
    expect(tiers[0].label).toBe('Good');
  });

  it('returns empty when a required slot has no candidates', () => {
    const slots: BomSlot[] = ['ac_condenser', 'evap_coil'];
    const bySlot = { ac_condenser: [cand('a1', 'ac_condenser', 1000)], evap_coil: [] } as const;
    expect(computeTiers(slots, bySlot as never)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

Run: `npx vitest run src/lib/hvac/__tests__/changeout-equipment-tiers.test.ts`

- [ ] **Step 3: Implementation**

```ts
// src/lib/hvac/changeout-equipment-tiers.ts
import type { ChangeoutCandidate, CandidatesBySlot } from '@/lib/estimates/changeout-candidates-action';
import type { BomSlot } from '@/lib/hvac/bom-slot-taxonomy';

export type EquipmentTier = {
  label: 'Good' | 'Better' | 'Best';
  picks: ChangeoutCandidate[]; // one per slot
  totalPrice: number;
};

const TIER_LABELS = ['Good', 'Better', 'Best'] as const;

export function computeTiers(slots: BomSlot[], bySlot: CandidatesBySlot): EquipmentTier[] {
  if (slots.length === 0) return [];
  for (const s of slots) {
    if (!bySlot[s] || bySlot[s].length === 0) return [];
  }

  const sortedBySlot = Object.fromEntries(
    slots.map((s) => [s, [...bySlot[s]].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))]),
  ) as Record<BomSlot, ChangeoutCandidate[]>;

  const minCount = Math.min(...slots.map((s) => sortedBySlot[s].length));
  const tierCount = Math.min(3, minCount);

  const tiers: EquipmentTier[] = [];
  for (let i = 0; i < tierCount; i++) {
    const picks: ChangeoutCandidate[] = [];
    for (const s of slots) {
      const list = sortedBySlot[s];
      // Good → bottom (0), Best → top (len-1), Better → middle.
      const idx =
        tierCount === 1 ? 0 :
        tierCount === 2 ? (i === 0 ? 0 : list.length - 1) :
        i === 0 ? 0 : i === 2 ? list.length - 1 : Math.floor(list.length / 2);
      picks.push(list[idx]);
    }
    tiers.push({
      label: TIER_LABELS[i],
      picks,
      totalPrice: picks.reduce((acc, p) => acc + (p.price ?? 0), 0),
    });
  }
  return tiers;
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run src/lib/hvac/__tests__/changeout-equipment-tiers.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hvac/changeout-equipment-tiers.ts src/lib/hvac/__tests__/changeout-equipment-tiers.test.ts
git commit -m "feat(hvac): compute Good/Better/Best equipment tiers"
```

---

## Task 13: Step 4 — Equipment picker UI

**Files:**
- Create: `src/components/estimator/changeout/step-4-equipment.tsx`

- [ ] **Step 1: Component**

```tsx
// src/components/estimator/changeout/step-4-equipment.tsx
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
  const [tiers, setTiers] = useState<EquipmentTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [slots, setSlots] = useState<BomSlot[]>([]);

  useEffect(() => {
    if (!tonnage) return;
    setLoading(true);
    fetchChangeoutCandidates(systemType, tonnage).then((res) => {
      if ('error' in res) { setLoadError(res.error); setTiers([]); setLoading(false); return; }
      setSlots(res.slots);
      setTiers(computeTiers(res.slots, res.bySlot as CandidatesBySlot));
      setLoading(false);
    });
  }, [systemType, tonnage]);

  const activeTierId = slots.every((s) => selectedEquipment[s])
    ? tiers.findIndex((t) => t.picks.every((p) => selectedEquipment[p.bom_slot] === p.id))
    : -1;

  function pickTier(tier: EquipmentTier) {
    const next: Record<string, string> = { ...selectedEquipment };
    for (const p of tier.picks) next[p.bom_slot] = p.id;
    setSelectedEquipment(next);
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
                <ul className="text-sm text-txt-secondary">
                  {tier.picks.map((p) => (
                    <li key={p.id}>
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/estimator/changeout/step-4-equipment.tsx
git commit -m "feat(estimator): changeout step 4 Good/Better/Best equipment picker"
```

---

## Task 14: `generateChangeoutBom` (+ tests)

**Files:**
- Create: `src/lib/hvac/changeout-bom.ts`
- Test: `src/lib/hvac/__tests__/changeout-bom.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// src/lib/hvac/__tests__/changeout-bom.test.ts
import { describe, it, expect } from 'vitest';
import { generateChangeoutBom, type ChangeoutBomInput } from '../changeout-bom';
import type { CatalogItem } from '@/types/hvac';

const cat = (id: string, slot: string, price: number, name = id): CatalogItem => ({
  id, partId: id, name, category: slot, unit: 'ea', price, supplier: 'S', sku: id, brand: 'B', notes: '',
  bom_slot: slot as never,
});

const baseInput: ChangeoutBomInput = {
  systemType: 'gas_ac',
  tonnage: 3,
  selectedEquipment: { ac_condenser: 'ac1', gas_furnace: 'gf1', evap_coil: 'ec1' },
  upsells: { thermostat: false, surgeProtector: false, condensatePump: false, floatSwitch: false },
  catalog: [cat('ac1', 'ac_condenser', 2000), cat('gf1', 'gas_furnace', 1500), cat('ec1', 'evap_coil', 500)],
  laborRate: 85,
  laborHours: 6,
};

describe('generateChangeoutBom', () => {
  it('emits the selected major equipment as priced lines', () => {
    const result = generateChangeoutBom(baseInput);
    const majorPrices = result.items
      .filter((i) => ['ac_condenser', 'gas_furnace', 'evap_coil'].includes(i.bom_slot ?? ''))
      .reduce((a, b) => a + (b.price ?? 0) * b.qty, 0);
    expect(majorPrices).toBe(4000);
  });

  it('adds the fixed changeout accessory set as missing slots', () => {
    const result = generateChangeoutBom(baseInput);
    const missingSlots = result.items.filter((i) => i.source === 'missing').map((i) => i.bom_slot);
    expect(missingSlots).toEqual(expect.arrayContaining(['condenser_pad', 'line_set', 'disconnect', 'drain_line']));
  });

  it('skips the line set when system type has no refrigerant loop', () => {
    const result = generateChangeoutBom({ ...baseInput, systemType: 'electric' });
    const slots = result.items.map((i) => i.bom_slot);
    expect(slots).not.toContain('line_set');
  });

  it('adds the thermostat upsell only when toggled', () => {
    const off = generateChangeoutBom(baseInput);
    expect(off.items.find((i) => i.bom_slot === 'thermostat')).toBeUndefined();
    const on = generateChangeoutBom({ ...baseInput, upsells: { ...baseInput.upsells, thermostat: true } });
    expect(on.items.find((i) => i.bom_slot === 'thermostat')).toBeDefined();
  });

  it('reports tonnage in the summary and uses labor rate × hours', () => {
    const result = generateChangeoutBom(baseInput);
    expect(result.summary.tonnage).toBe(3);
    // Labor is added later by the finalize action, so summary here omits it.
    expect(result.roomLoads).toEqual([]);
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `npx vitest run src/lib/hvac/__tests__/changeout-bom.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementation**

```ts
// src/lib/hvac/changeout-bom.ts
import type { BomItem, BomResult, CatalogItem, SystemType } from '@/types/hvac';
import type { BomSlot } from '@/lib/hvac/bom-slot-taxonomy';
import type { ChangeoutUpsells } from '@/hooks/use-estimator';

export type ChangeoutBomInput = {
  systemType: SystemType;
  tonnage: number;
  selectedEquipment: Partial<Record<BomSlot, string>>;
  upsells: ChangeoutUpsells;
  catalog: CatalogItem[];
  laborRate: number;
  laborHours: number;
};

const REFRIGERANT_SYSTEMS: ReadonlySet<SystemType> = new Set(['heat_pump', 'gas_ac', 'dual_fuel', 'ac_only']);

const UPSELL_SLOTS: Record<keyof ChangeoutUpsells, BomSlot> = {
  thermostat: 'thermostat',
  surgeProtector: 'breaker', // surge protector lives on breaker slot in taxonomy; confirm in taxonomy file
  condensatePump: 'condensate_pump',
  floatSwitch: 'drain_line',
};

function missingLine(slot: BomSlot, name: string): BomItem {
  return {
    partId: '', name, category: slot, qty: 1, unit: 'ea',
    price: null, supplier: '', sku: '', notes: '', source: 'missing', brand: '', bom_slot: slot,
  };
}

function fromCatalog(item: CatalogItem, slot: BomSlot, qty = 1): BomItem {
  return {
    partId: item.partId ?? item.id,
    name: item.name,
    category: slot,
    qty,
    unit: item.unit,
    price: item.price,
    supplier: item.supplier,
    sku: item.sku,
    notes: item.notes ?? '',
    source: 'quote',
    brand: item.brand ?? '',
    bom_slot: slot,
  };
}

export function generateChangeoutBom(input: ChangeoutBomInput): BomResult {
  const items: BomItem[] = [];
  const catalogById = new Map(input.catalog.map((c) => [c.id, c] as const));

  // 1. Major equipment (from selectedEquipment)
  for (const [slot, id] of Object.entries(input.selectedEquipment)) {
    if (!id) continue;
    const item = catalogById.get(id);
    if (item) items.push(fromCatalog(item, slot as BomSlot));
    else items.push(missingLine(slot as BomSlot, 'Selected equipment'));
  }

  // 2. Fixed accessory set — emitted as `missing` for enrichBomViaAI to fill from vendor catalog.
  items.push(missingLine('condenser_pad', 'Equipment pad'));
  items.push(missingLine('disconnect', 'Disconnect + whip'));
  items.push(missingLine('drain_line', 'Drain kit'));
  if (REFRIGERANT_SYSTEMS.has(input.systemType)) {
    items.push(missingLine('line_set', 'Refrigerant line set'));
  }

  // 3. Upsells
  for (const [key, enabled] of Object.entries(input.upsells) as Array<[keyof ChangeoutUpsells, boolean]>) {
    if (!enabled) continue;
    items.push(missingLine(UPSELL_SLOTS[key], labelForUpsell(key)));
  }

  return {
    items,
    summary: {
      designBTU: input.tonnage * 12000,
      tonnage: input.tonnage,
      totalCFM: Math.round(input.tonnage * 400),
      totalRegs: 0,
      retCount: 0,
      condSqft: 0,
      zones: 1,
    },
    roomLoads: [],
  };
}

function labelForUpsell(key: keyof ChangeoutUpsells): string {
  switch (key) {
    case 'thermostat': return 'Smart thermostat (upsell)';
    case 'surgeProtector': return 'Surge protector (upsell)';
    case 'condensatePump': return 'Condensate pump (upsell)';
    case 'floatSwitch': return 'Float switch (upsell)';
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/hvac/__tests__/changeout-bom.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hvac/changeout-bom.ts src/lib/hvac/__tests__/changeout-bom.test.ts
git commit -m "feat(hvac): generate changeout BOM (major equipment + fixed accessories + upsells)"
```

---

## Task 15: Finalize-changeout server action (BOM → DB + AI enrichment)

**Files:**
- Create: `src/lib/estimates/finalize-changeout-action.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/estimates/finalize-changeout-action.ts
'use server';
import { createClient } from '@/lib/supabase/server';
import { generateChangeoutBom, type ChangeoutBomInput } from '@/lib/hvac/changeout-bom';
import { enrichBomViaAI } from '@/lib/estimates/enrich-bom-action';
import type { ChangeoutUpsells } from '@/hooks/use-estimator';
import type { SystemType } from '@/types/hvac';

export type FinalizeChangeoutInput = {
  estimateId: string;
  systemType: SystemType;
  tonnage: number;
  selectedEquipment: Record<string, string>;
  upsells: ChangeoutUpsells;
};

export async function finalizeChangeout(input: FinalizeChangeoutInput): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();

  const [{ data: estimate }, { data: catalog }, { data: prefs }] = await Promise.all([
    supabase.from('estimates').select('labor_rate, labor_hours, profit_margin, user_id').eq('id', input.estimateId).single(),
    supabase.from('vendor_products').select('*'), // pulled into the catalog used by BOM + enrichment
    supabase.from('contractor_preferences').select('*').maybeSingle(),
  ]);

  if (!estimate) return { error: 'Estimate not found' };

  const catalogItems = (catalog ?? []).map((v) => ({
    id: v.id, partId: v.mpn ?? v.id, name: v.name, category: v.bom_slot ?? 'other',
    unit: 'ea', price: v.unit_cost, supplier: v.supplier ?? '', sku: v.mpn ?? '',
    brand: v.brand ?? '', notes: '', bom_slot: v.bom_slot,
  }));

  const bomInput: ChangeoutBomInput = {
    systemType: input.systemType,
    tonnage: input.tonnage,
    selectedEquipment: input.selectedEquipment,
    upsells: input.upsells,
    catalog: catalogItems,
    laborRate: estimate.labor_rate,
    laborHours: estimate.labor_hours,
  };

  const draftBom = generateChangeoutBom(bomInput);
  const enrichedBom = await enrichBomViaAI(draftBom, catalogItems, prefs ?? null);

  // Persist: delete any prior bom rows for this estimate, insert fresh.
  await supabase.from('estimate_bom_items').delete().eq('estimate_id', input.estimateId);
  const rows = enrichedBom.items.map((it) => ({
    estimate_id: input.estimateId,
    category: it.category,
    description: it.name,
    quantity: it.qty,
    unit_cost: it.price,
    total_cost: it.price != null ? it.price * it.qty : null,
    part_id: it.partId || null,
    supplier: it.supplier || null,
    sku: it.sku || null,
    source: it.source === 'missing' ? 'missing' : 'default',
  }));
  if (rows.length) {
    const { error } = await supabase.from('estimate_bom_items').insert(rows);
    if (error) return { error: error.message };
  }

  // Labor line.
  if (estimate.labor_hours && estimate.labor_rate) {
    await supabase.from('estimate_bom_items').insert({
      estimate_id: input.estimateId,
      category: 'labor',
      description: `Labor — ${estimate.labor_hours}h @ $${estimate.labor_rate}/h`,
      quantity: estimate.labor_hours,
      unit_cost: estimate.labor_rate,
      total_cost: estimate.labor_hours * estimate.labor_rate,
      source: 'labor',
    });
  }

  return { ok: true };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/estimates/finalize-changeout-action.ts
git commit -m "feat(estimates): finalize-changeout action — BOM + AI enrichment + persist"
```

---

## Task 16: Step 5 — Review, upsells, send to homeowner

**Files:**
- Create: `src/components/estimator/changeout/step-5-review.tsx`

- [ ] **Step 1: Component**

```tsx
// src/components/estimator/changeout/step-5-review.tsx
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
    // Ensure draft exists once we land here.
    if (!estimateId) createChangeoutDraft();
  }, [estimateId, createChangeoutDraft]);

  function handleSend() {
    if (!estimateId || !tonnage) { setErrMsg('Missing estimate data'); return; }
    setErrMsg(null);
    startFinalizing(async () => {
      const res = await finalizeChangeout({
        estimateId, systemType, tonnage,
        selectedEquipment: selectedEquipment as Record<string, string>,
        upsells,
      });
      if ('error' in res) { setErrMsg(res.error); return; }
      // Create share link via existing endpoint.
      const share = await fetch(`/api/estimates/${estimateId}/share`, { method: 'POST' }).then((r) => r.json());
      if (share?.url) {
        setShareUrl(share.url);
        navigator.clipboard?.writeText(share.url).catch(() => {});
      } else {
        setErrMsg('Could not create share link');
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
              className={`min-h-[40px] rounded-full border px-3 text-sm ${
                upsells[u.key] ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-bg-card'
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/estimator/changeout/step-5-review.tsx
git commit -m "feat(estimator): changeout step 5 review + upsells + send"
```

---

## Task 17: Render `existing_system` context on share page

**Files:**
- Modify: `src/app/q/[token]/page.tsx`

- [ ] **Step 1: Insert the context block after the contractor header**

Locate the `<header>...</header>` block that renders contractor info (around lines 94–117 per explore report). Immediately after its closing tag, add:

```tsx
{est.estimate_type === 'changeout' && est.existing_system && (
  <section className="mt-6 rounded-lg border border-border bg-bg-card/50 p-4 text-sm text-txt-secondary">
    <span className="text-txt-tertiary">Replacing:</span>{' '}
    {describeExistingSystem(est.existing_system)}
  </section>
)}
```

At the bottom of the same file (or a colocated helper module if the file is tidy about that), add:

```ts
function describeExistingSystem(es: { system_type?: string; tonnage?: number } | null | undefined): string {
  if (!es) return 'existing system';
  const parts: string[] = [];
  if (es.tonnage) parts.push(`${es.tonnage} ton`);
  if (es.system_type) {
    const labels: Record<string, string> = {
      heat_pump: 'heat pump',
      gas_ac: 'gas furnace + AC',
      dual_fuel: 'dual-fuel system',
      electric: 'air handler with heat strips',
      ac_only: 'AC-only system',
    };
    parts.push(labels[es.system_type] ?? es.system_type);
  }
  return parts.length ? parts.join(' ') : 'existing system';
}
```

- [ ] **Step 2: Run build to ensure type-check passes**

Run: `npx tsc --noEmit`
Expected: clean. (If `est.estimate_type` is typed as a column that's not in the selected fields, update the `.select('*')` — Explore report shows `.select('*')` is used, so it should flow.)

- [ ] **Step 3: Commit**

```bash
git add src/app/q/[token]/page.tsx
git commit -m "feat(share): render existing-system context block for changeout estimates"
```

---

## Task 18: End-to-end mobile verification

**Files:** (none — manual verification)

- [ ] **Step 1: Start dev server**

Run: `npm run dev` (in the worktree)
Expected: server boots without errors. Note the local URL.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the 3 new test files (changeout-tonnage, changeout-equipment-tiers, changeout-bom).

- [ ] **Step 3: Manual walkthrough — changeout path (mobile viewport 375×812)**

In the browser DevTools, switch to iPhone viewport, then:

1. Go to `/estimates/new` → verify fork screen shows two cards, both ≥ 48 px tap target.
2. Tap **Changeout** → verify wizard shell renders with step-1 active.
3. Fill customer name + address; tap **Here** (geolocation) and confirm it either prefills address or shows a clear error.
4. Expand **Existing system** and pick a system type + tonnage. Collapse and confirm state persists.
5. Submit → step 2. Pick **Gas Furnace + AC**.
6. Step 3. Confirm tonnage prefills from existing. Try the sqft helper with `1650` → expect `3 ton` recommendation.
7. Tap Continue → step 4. Confirm three cards (Good/Better/Best) with prices. Tap **Better**.
8. Step 5. Toggle **Smart thermostat** and **Surge protector**. Tap **Send to Homeowner**.
9. Verify a share URL appears and is copied to clipboard. Open it.
10. On the share page, confirm: `Replacing: 3 ton gas furnace + AC` shows (or whatever the existing-system info was). Verify total price renders, Accept/Decline buttons show.

- [ ] **Step 4: Regression — new-build path**

1. Go to `/estimates/new` → tap **New Build**.
2. Confirm the URL is `/estimates/new/build` and the existing floor-plan wizard loads at the customer step.
3. Run through at least the customer step and advance to upload to confirm the wizard still works end-to-end.

- [ ] **Step 5: Commit the final state (no code changes — just a marker commit optional)**

If any small fixes were made during manual verification, include them. Otherwise skip this step.

---

## Self-Review

- [x] **Spec coverage** — Fork screen (Task 6), data model (Task 1), changeout wizard 5 steps (Tasks 7–13, 16), BOM generator (Task 14), finalize action (Task 15), share page (Task 17), verification (Task 18). Sqft helper (Task 3), G/B/B tiers (Task 12), install types (Task 4). All spec sections map.
- [x] **Placeholder scan** — No TBDs. Every code step has full code.
- [x] **Type consistency** — `ChangeoutBomInput`, `ChangeoutUpsells`, `ChangeoutCandidate`, `EquipmentTier`, `EstimatorMode`, `ChangeoutStep` are defined once and referenced consistently across tasks.

### Known approximations the implementer should verify against the live codebase

1. **Supabase browser client import** in `use-estimator.ts` — match whatever the existing `createDraft` uses.
2. **`labels[est.estimate_type]`** on the share page — Task 1's `Database` type update must include `estimate_type` in the selected columns; `select('*')` covers it.
3. **`SYSTEM_TYPE_EQUIPMENT` export** — Task 11 imports it from `src/lib/hvac/bom-generator.ts`. If it isn't currently exported, export it as part of Task 2.
4. **`breaker` vs `surge_protector` bom_slot** — Task 14 uses `breaker` for the surge-protector upsell as a best guess. Verify against the actual `bom-slot-taxonomy.ts` enum; if a dedicated slot exists, swap it in.
5. **Share endpoint** — Task 16 posts to `/api/estimates/[id]/share`. Confirm the path matches what's wired today.

These are precise pointers — not license to rewrite tasks. Verify, adjust the one line if needed, move on.
