# Changeout Estimate Flow — Design Spec

## Problem

Today every estimate starts from a floor plan PDF: upload → page select → LLM room extraction → rooms review → equipment → BOM. That flow is optimized for new construction with full architectural plans.

A large share of real HVAC work is **equipment changeouts**: the ductwork stays, the major equipment (condenser, furnace or air handler, coil) gets replaced. Contractors do this work on-site, on a phone, and the homeowner expects a price before they leave. The floor-plan wizard is wrong for that job — it asks for data the contractor doesn't have and doesn't need, and it takes too long.

## Solution

Add a first-screen fork at `/estimates/new`:

- **New Build** → existing floor-plan wizard, unchanged.
- **Changeout** → a new mobile-first wizard with five short tap-heavy screens that produce the same BOM + priced + shareable estimate.

Both paths write to the same `estimates` and `estimate_bom_items` tables, differentiated by an `estimate_type` discriminator. The share link, PDF, accept/decline, and pricing engine all remain type-agnostic.

---

## 1. Fork Screen

Route: `/estimates/new`

Replaces the current customer-first entry. Shows two large cards, full-width on mobile:

- **New Build** — subtitle "Estimate from a floor plan PDF". Tap → `/estimates/new/build`.
- **Changeout** — subtitle "Replace equipment on an existing system". Tap → `/estimates/new/changeout`.

No data is persisted before a card is tapped. Tapping a card creates a draft `estimates` row with the selected `estimate_type` and routes to that flow's first step.

Design rationale: contractor knows on-site which flow they're in. Forking first avoids them typing customer info, realizing they're in the wrong funnel, and restarting.

---

## 2. Changeout Wizard

Route: `/estimates/new/changeout` (wizard steps managed by Zustand state, not separate routes, consistent with existing pattern).

Five steps, each designed for one-handed phone use:

### Step 1 — Customer & address
- Inputs: customer name, job address, phone. Email optional.
- Address field offers "Use my current location" button (device geolocation → reverse geocode → prefill).
- **Existing system** section (collapsible, optional): system type and tonnage chips. Purely informational — stored as `existing_system` jsonb metadata; used for share-page context and future analytics. Does **not** constrain the installation pickers.
- Sticky bottom action: **Continue**.

Customer autocomplete from prior estimates is **out of scope for v1** (tracked as a separate GitHub issue — see repo issues). Contractors type fresh each time in v1.

### Step 2 — What are we installing?
- Framed as the installation choice, not the existing-system interrogation. Supports fuel switches (gas furnace → heat pump, AC-only → dual fuel) without constraint.
- Tap grid, one-per-row on mobile:
  - AC Only
  - Heat Pump
  - Gas Furnace + AC
  - Dual Fuel (Heat Pump + Gas Furnace)
  - Air Handler + Heat Strips
- Selection maps to a `system_type` string stored on `estimates`.

### Step 3 — Tonnage
- Large chips, one tap to select: **1.5 / 2 / 2.5 / 3 / 3.5 / 4 / 5**.
- Prefills from `existing_system.tonnage` if captured in step 1; freely changeable.
- Writes to `estimates.tonnage` (new column — see Data Model).
- Below the chips, a collapsed link: **"Not sure? Estimate from square footage"**. Tapping expands a single numeric input for house sqft. On submit, applies a fixed rule-of-thumb (**1 ton per 550 sqft**, rounded to the nearest available chip) and pre-selects the recommended chip. Contractor can override by tapping a different chip.
- The rule-of-thumb multiplier is a constant in code (`CHANGEOUT_TONNAGE_SQFT_PER_TON = 550`) — no climate-zone lookup, no load calc, no separate table. This is a sanity-check input, not a sizing tool. The sqft value itself is not persisted.

### Step 4 — Equipment picker
- Pre-filtered by `system_type` × `tonnage` against `vendor_products` via the existing classifier.
- Shows up to three cards labeled **Good / Better / Best**, sorted by price tier (bottom, mid, top of priced matches for the selected `bom_slot`s).
- Each card shows: tier label, total equipment price for the card, one spec line per major-equipment item (e.g. "3 ton 15 SEER2 AC" + "80k BTU 95% gas furnace"). No full spec sheets.
- Tapping a card selects all of that card's major-equipment items at once and writes them to `estimates.selected_equipment`.
- Fallback if the catalog has fewer than 3 matching sets: show whatever is available, labeled accordingly.
- Edge case: zero matches → show an inline message "No matches in your catalog for 3 ton AC Only — [adjust tonnage] [adjust system type]" with links back to steps 2 and 3. Do not let the user past this screen with no equipment selected.

### Step 5 — Review & price
- Auto-generated scope-of-work text (reusing existing generator).
- **Total price** shown prominently. Tap "Show itemized" to expand BOM.
- Upsells section: toggle chips for thermostat upgrade, surge protector, float switch, condensate pump. Each toggle adds or removes its accessory line in the BOM.
- Sticky bottom actions: **Send to Homeowner** (generates share link, copies to clipboard, shows success) and **Edit Details** (routes to the existing `/estimates/[id]` editor for deeper edits).

---

## 3. Data Model

### `estimates` table changes

| Column | Type | Notes |
|---|---|---|
| `estimate_type` | `text` (enum: `'new_build' \| 'changeout'`) | `NOT NULL DEFAULT 'new_build'` — backfills existing rows as new_build. |
| `existing_system` | `jsonb NULL` | `{ system_type?, tonnage?, age_years?, notes? }`. Changeout only. |
| `tonnage` | `numeric(2,1) NULL` | Changeout only. New-build computes tonnage from load calc; not stored here for those. |

Postgres, so `jsonb` (not MySQL `JSON`).

No new tables. No changes to `estimate_bom_items` or `estimate_shares`.

### Fields that do **not** apply to changeout
- `estimate_rooms` — zero rows for changeout estimates.
- `total_sqft`, `climate_zone`, `num_units`, `hvac_per_unit` — remain `NULL` for changeout.
- Floor plan PDF storage — not touched.

Queries that select all estimates should not assume these fields are populated. The existing schema already allows `NULL`, so this is a convention, not a migration concern.

### Migration
Single migration file: `20260417xxxxxx_estimate_type_and_changeout_fields.sql`.
- `ALTER TABLE estimates ADD COLUMN estimate_type text NOT NULL DEFAULT 'new_build' CHECK (estimate_type IN ('new_build','changeout'));`
- `ALTER TABLE estimates ADD COLUMN existing_system jsonb;`
- `ALTER TABLE estimates ADD COLUMN tonnage numeric(2,1);`
- Index: `CREATE INDEX estimates_type_idx ON estimates (estimate_type);` (list pages will filter by it).

---

## 4. BOM Generation for Changeout

New module: `src/lib/hvac/changeout-bom.ts`.

Export: `generateChangeoutBom(estimate): BomResult`.

### Inputs
- `estimate.system_type` (what's being installed)
- `estimate.tonnage`
- `estimate.selected_equipment` (chosen by the Good/Better/Best card in step 4)
- Upsell toggles from step 5

### Output
Same `BomResult` shape the existing generator produces — `{ items, summary }` — so downstream (`enrichBomViaAI`, persistence, pricing, share page, PDF) is unchanged.

### Logic
1. **Major equipment** — pulled directly from `selected_equipment`; each maps to a vendor product row with its `unit_cost` and `bom_slot`.
2. **Fixed changeout accessory set** (each tagged with an existing `bom_slot`):
   - Pad (for outdoor condenser, when applicable)
   - Lineset kit (when AC or heat pump)
   - Whip + disconnect (outdoor unit)
   - Drain kit
   - Float switch
3. **Upsells** (from step 5) — thermostat, surge protector, condensate pump, etc.
4. **AI enrichment** — existing `enrichBomViaAI` fills any `bom_slot` still marked `missing` using the contractor's `vendor_products` catalog. No changes to that function.
5. **Labor line** — uses `labor_rate × labor_hours` like new-build. Default labor hours for changeout pre-populated to a sensible value (proposed: 6 hours, tunable in contractor preferences — see Open Questions).

### Explicitly skipped
- Load calculation (`src/lib/hvac/load-calc.ts`) — not invoked for changeout.
- Room-based BOM generator (`generateBOM` in `src/lib/hvac/bom-generator.ts`) — not invoked for changeout.

Both remain untouched for new-build.

---

## 5. Routing & Shared Infrastructure

### Routes
- `/estimates/new` — fork screen (new).
- `/estimates/new/build` — floor-plan wizard (new home for the existing wizard; redirect old deep links for one release cycle if any exist).
- `/estimates/new/changeout` — changeout wizard (new).
- `/estimates/[id]` — editor. Renders BOM + pricing regardless of `estimate_type`.
- `/q/[token]` — homeowner share page. Type-agnostic; reads the BOM.

### State
`useEstimator` Zustand store gains a `mode: 'new_build' | 'changeout'` discriminator. Step enums diverge per mode. The existing auto-save + draft pattern is reused unchanged — each step transition writes to the draft `estimates` row.

### Share / PDF / accept-decline
Unchanged. The share page reads `estimate_bom_items` and the `estimates` row. It should render `existing_system` context on the homeowner's view ("Replacing your existing 3-ton gas furnace system with …") when `estimate_type = 'changeout'` and `existing_system` is populated. Minor view change only.

---

## 6. Mobile UX Specifics

- All tap targets ≥ 48 × 48 px. No dropdowns where a chip grid fits.
- Full-width buttons. Sticky bottom primary action bar on every wizard step.
- Typography: body text ≥ 16 px so iOS doesn't zoom on focus.
- No PDF upload, no SVG canvas, no floor-plan rendering anywhere in this flow.
- Auto-save on every step change (existing pattern).
- Keyboard-avoiding layout on step 1 so the sticky CTA doesn't hide behind the iOS keyboard.
- Tailwind + shadcn v4 components only. Avoid any reliance on hover-only affordances.

---

## 7. Out of Scope (Explicit YAGNI)

- **Customer autocomplete / `customers` table** — tracked as a separate GitHub issue. v1 types fresh each time.
- **Nameplate photo capture + OCR** — adds complexity, saves a few seconds. Not worth it until we have real usage data saying otherwise.
- **Multi-system changeouts** (upstairs + downstairs in one estimate). v1 = one system per estimate. Multi-unit is a future fork.
- **Load-calc verification** against the existing tonnage. Trust the contractor's read.
- **Financing / payment buttons** on the share page.
- **"Convert new-build draft to changeout"** mode-switch mid-wizard. Pick one at the fork; to switch, start over.

---

## 8. Testing

- Unit: `generateChangeoutBom` — covers each `system_type`, each tonnage, each upsell combination, and zero-match fallback.
- Unit: sqft → tonnage helper — covers rounding at boundaries (e.g. 825 sqft → 1.5 ton, 1650 sqft → 3 ton, ≥ 2750 sqft → 5 ton cap).
- Unit: enrichment integration — changeout BOM with missing slots round-trips through `enrichBomViaAI` and produces priced lines.
- Integration: wizard step-through on a mobile viewport (375 × 812). Golden path: fork → changeout → finish → share link. Fuel-switch path: existing AC-only → install dual fuel.
- Integration: share page renders a changeout estimate (with `existing_system` context block) and PDF export works.
- Regression: `/estimates/new/build` still runs the floor-plan wizard end-to-end.

---

## 9. Open Questions

1. **Default labor hours for changeout.** Proposed 6 hours; should this be a contractor preference? Proposed yes — add `default_changeout_labor_hours` to `contractor_preferences`. Defer decision until v1.1 if contractor preferences need a bigger rework.
2. **Good/Better/Best tiering rule.** Proposed: sort priced matches for each `bom_slot` by `unit_cost`, pick bottom / median / top of the distribution. Alternative: contractor-tagged tiers. v1 ships with price-based tiering; tagging is a follow-up.
3. **Backfill of `estimate_type` on existing rows** — default to `'new_build'` is straightforward. No data-shape question.

---

## 10. Rollout

- Single release. No feature flag. New fork screen + both paths ship together.
- Existing in-flight drafts are all `estimate_type = 'new_build'` after backfill and continue to work in `/estimates/new/build`.
- Homeowner-facing share pages are forward-compatible since the BOM schema is unchanged.
