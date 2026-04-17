'use client';
import { useEffect, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useEstimator } from '@/hooks/use-estimator';
import {
  fetchChangeoutCandidates,
  type CandidatesBySlot,
  type ChangeoutCandidate,
} from '@/lib/estimates/changeout-candidates-action';
import type { BomSlot } from '@/lib/hvac/bom-slot-taxonomy';

type Diagnostics = {
  userCatalogSize: number;
  vendorRows: number;
  slotMatches: number;
  slotMatchesTonnage: number;
  slotUnsized: number;
  priced: number;
  slotHistogram: Record<string, number>;
};

type FetchState =
  | { status: 'loading' }
  | { status: 'ready'; slots: string[]; bySlot: CandidatesBySlot; diagnostics: Diagnostics }
  | { status: 'error'; message: string };

export function Step4Equipment() {
  const {
    systemType, tonnage, selectedEquipment, setSelectedEquipment,
    nextChangeoutStep, prevChangeoutStep,
  } = useEstimator();
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  // Tracks whether the auto-open effect has run for the current fetch, so we
  // don't re-open the first unpicked slot after the user deliberately closes
  // one by clicking its header.
  const [autoOpened, setAutoOpened] = useState(false);

  useEffect(() => {
    if (!tonnage) return;
    setAutoOpened(false);
    setOpenSlot(null);
    let cancelled = false;
    fetchChangeoutCandidates(systemType, tonnage).then((res) => {
      if (cancelled) return;
      if ('error' in res) {
        setState({ status: 'error', message: res.error });
      } else {
        setState({
          status: 'ready',
          slots: res.slots as string[],
          bySlot: res.bySlot as CandidatesBySlot,
          diagnostics: res.diagnostics,
        });
      }
    });
    return () => { cancelled = true; };
  }, [systemType, tonnage]);

  useEffect(() => {
    if (state.status !== 'ready' || autoOpened) return;
    const firstUnpicked = state.slots.find(
      (s) => (state.bySlot[s] ?? []).length > 0 && !selectedEquipment[s as BomSlot],
    );
    setOpenSlot(firstUnpicked ?? null);
    setAutoOpened(true);
  }, [state, selectedEquipment, autoOpened]);

  if (state.status === 'loading') {
    return <p className="text-sm text-txt-secondary">Loading equipment…</p>;
  }
  if (state.status === 'error') {
    return <p className="text-sm text-danger">Could not load equipment: {state.message}</p>;
  }

  const { slots, bySlot: rawBySlot, diagnostics } = state;
  const bySlot: CandidatesBySlot = Object.fromEntries(
    Object.entries(rawBySlot).map(([s, items]) => [
      s,
      [...items].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)),
    ]),
  );
  const populatedSlots = slots.filter((s) => (bySlot[s] ?? []).length > 0);
  const allPopulatedPicked =
    populatedSlots.length > 0 &&
    populatedSlots.every((s) => Boolean(selectedEquipment[s as BomSlot]));

  if (populatedSlots.length === 0) {
    const hint = diagnosticHint(diagnostics);
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">No matches in your catalog for this system + tonnage.</p>
        {hint && <p className="text-xs text-txt-secondary">{hint}</p>}
        <div className="flex gap-2">
          <button onClick={prevChangeoutStep} className="min-h-[48px] rounded-lg border border-border px-4 text-sm">
            Change tonnage
          </button>
        </div>
      </div>
    );
  }

  function handlePick(slot: string, candidate: ChangeoutCandidate) {
    setSelectedEquipment(slot as BomSlot, candidate.id);
    const nextUnpicked = populatedSlots.find(
      (s) => s !== slot && !selectedEquipment[s as BomSlot],
    );
    setOpenSlot(nextUnpicked ?? null);
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">Pick equipment</h2>
        <p className="text-sm text-txt-secondary">Sized for {tonnage} ton.</p>
      </header>

      <ul className="flex flex-col gap-3">
        {slots.map((slot) => (
          <SlotSection
            key={slot}
            slot={slot}
            candidates={bySlot[slot] ?? []}
            pickedId={selectedEquipment[slot as BomSlot]}
            open={openSlot === slot}
            onToggle={() => setOpenSlot((curr) => (curr === slot ? null : slot))}
            onPick={(c) => handlePick(slot, c)}
          />
        ))}
      </ul>

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
          onClick={nextChangeoutStep}
          disabled={!allPopulatedPicked}
          className="min-h-[48px] flex-[2] rounded-lg bg-gradient-brand px-6 text-base font-semibold text-white disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

type SlotSectionProps = {
  slot: string;
  candidates: ChangeoutCandidate[];
  pickedId: string | undefined;
  open: boolean;
  onToggle: () => void;
  onPick: (c: ChangeoutCandidate) => void;
};

function SlotSection({ slot, candidates, pickedId, open, onToggle, onPick }: SlotSectionProps) {
  const [filter, setFilter] = useState('');
  const label = humanizeSlot(slot);
  const isMissing = candidates.length === 0;
  const picked = candidates.find((c) => c.id === pickedId);

  if (isMissing) {
    return (
      <li>
        <div className="flex items-center justify-between rounded-xl border border-border bg-bg-card/40 p-4 opacity-70">
          <div className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary">{label}</div>
          <span className="text-xs italic text-txt-tertiary">Filled at send</span>
        </div>
      </li>
    );
  }

  if (!open) {
    if (picked) {
      return (
        <li>
          <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-bg-card p-3 text-left hover:border-accent-light/50"
            aria-expanded={false}
          >
            <Check className="h-5 w-5 shrink-0 text-accent-light" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary">{label}</div>
              <div className="truncate text-sm text-txt-primary">
                {picked.brand ? `${picked.brand} · ` : ''}{picked.name}
              </div>
            </div>
            <span className="text-sm text-accent-light">Change</span>
          </button>
        </li>
      );
    }
    return (
      <li>
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between rounded-xl border border-border bg-bg-card p-4 text-left hover:border-accent-light/50"
          aria-expanded={false}
        >
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary">{label}</div>
            <div className="text-sm text-txt-primary">
              {candidates.length} {candidates.length === 1 ? 'option' : 'options'}
            </div>
          </div>
          <ChevronDown className="h-4 w-4 text-txt-tertiary" />
        </button>
      </li>
    );
  }

  const q = filter.trim().toLowerCase();
  const filtered = q
    ? candidates.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.brand ?? '').toLowerCase().includes(q) ||
        (c.mpn ?? '').toLowerCase().includes(q),
      )
    : candidates;

  return (
    <li>
      <div className="rounded-xl border border-accent-light/60 bg-bg-card p-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between py-1"
          aria-expanded={true}
        >
          <span className="text-base font-semibold">{label}</span>
          <ChevronDown className="h-4 w-4 rotate-180 text-txt-secondary" />
        </button>

        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by brand, name, or MPN"
          className="mt-2 min-h-[40px] w-full rounded-lg border border-border bg-bg-input px-3 text-sm focus:border-accent-light focus:outline-none"
        />
        <p className="mt-1 text-xs text-txt-tertiary">
          Showing {filtered.length} of {candidates.length}
        </p>

        <ul className="mt-2 flex max-h-[60dvh] flex-col gap-1 overflow-y-auto sm:max-h-[50dvh]">
          {filtered.map((c) => {
            const active = c.id === pickedId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  className={`flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left transition ${
                    active
                      ? 'border-accent-light bg-accent-glow'
                      : 'border-border bg-bg-card hover:border-accent-light/50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="whitespace-normal break-words text-sm font-medium text-txt-primary">
                      {c.brand ? `${c.brand} · ` : ''}{c.name}
                    </div>
                    {c.mpn && <div className="text-xs text-txt-tertiary">{c.mpn}</div>}
                  </div>
                  <div
                    className={`whitespace-nowrap text-sm font-semibold ${
                      c.price == null ? 'text-txt-tertiary italic' : 'text-accent-light'
                    }`}
                  >
                    {c.price == null ? 'No price' : formatPrice(c.price)}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </li>
  );
}

const SLOT_LABELS: Record<string, string> = {
  ac_condenser: 'AC condenser',
  heat_pump_condenser: 'Heat pump condenser',
  gas_furnace: 'Gas furnace',
  air_handler: 'Air handler',
  evap_coil: 'Evap coil',
  heat_strips: 'Heat strips',
};

function humanizeSlot(slot: string): string {
  return SLOT_LABELS[slot] ?? slot.replace(/_/g, ' ');
}

function formatPrice(price: number | null): string {
  if (price == null) return '—';
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function diagnosticHint(d: Diagnostics | null): string | null {
  if (!d) return null;
  const total = d.userCatalogSize + d.vendorRows;
  if (total === 0) return 'No catalog rows matched the required slots. Check that your suppliers are active and that equipment is classified.';
  if (d.slotMatches === 0) return `Catalog returned ${total} items but none matched the required slots. Slots seen: ${JSON.stringify(d.slotHistogram)}`;
  if (d.slotMatchesTonnage === 0) {
    if (d.slotUnsized > 0 && d.slotUnsized === d.slotMatches) {
      return `${d.slotMatches} item(s) are in the required slots but have no tonnage or BTU recorded. Edit those catalog items and add sizing so they can be matched.`;
    }
    if (d.slotUnsized > 0) {
      return `${d.slotMatches} item(s) match the slots but none at the selected tonnage (${d.slotUnsized} have no sizing recorded). Try a different tonnage, or add sizing to the unsized items.`;
    }
    return `${d.slotMatches} item(s) match the slots but none at the selected tonnage. Try a different tonnage.`;
  }
  return null;
}
