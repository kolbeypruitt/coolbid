# coolbid-rewrite-poc — Design Spec

**Date:** 2026-04-18
**Repo:** new sibling repo `coolbid-rewrite-poc` at `/Users/kolbeypruitt/Workspace/coolbid-rewrite-poc`
**Strategy:** validate an AI-ballpark estimator as a standalone POC. If the POC proves out, transplant the validated core (intake → AI BOM → priced ballpark → proposal share) into the existing `coolbid` SaaS shell, keeping its Stripe / auth / accept-decline / teams surface area.

## Why a rewrite

The current `coolbid` product is organized around a universal parts/vendor catalog. Real HVAC pricing is relational and per-contractor — list prices are fiction, every serious contractor has negotiated pricing, and building a correct universal DB is not winnable. The current app's floorplan-first flow is also slow and wrong-shaped for the majority of HVAC work (equipment changeouts).

The new direction: speed over itemized accuracy. The contractor describes the job in plain language, Claude generates a structured BOM + labor breakdown + proposal narrative, prices come from a small ballpark catalog the contractor owns and edits. Margin and labor hours absorb per-line pricing imprecision. Homeowners get a polished proposal in ~60 seconds instead of 3 hours.

## Decisions (from brainstorming dialog)

| Decision | Choice |
|---|---|
| Pricing source | Small ballpark catalog (~100–300 generic items, regional multipliers, contractor-editable) |
| Catalog ownership | Per-contractor copy seeded on signup from a house catalog |
| Input mechanism | Single conversational intake with optional attachments (text / photos / PDFs) |
| BOM granularity | Item-level internally always; customer-facing has Detailed / Summary toggle |
| Labor hours | AI generates per task category; default rate lives in contractor settings |
| AI pipeline | One Claude call (BOM + labor + narrative + code callouts) + deterministic catalog mapping |
| POC scope | Auth + estimator + customer read-only share link. No Stripe, no accept/decline, no teams |
| Long-term plan | If POC validates, transplant the new core into the existing coolbid SaaS shell |

---

## 1. Architecture

```
┌─ Browser ─────────────────────────────────────────────────────┐
│  Contractor app          │   Public homeowner share view      │
│  /estimates/new          │   /q/<token>                       │
│  /estimates/[id]         │   (read-only)                      │
└──────────┬───────────────┴───────────────┬────────────────────┘
           ▼                               ▼
┌─ Next.js 16 App Router ───────────────────────────────────────┐
│  Server actions + API routes (auth-guarded)                    │
│                                                                │
│   POST /api/estimates (generate)                               │
│     1. Persist intake (text + attachment refs)                 │
│     2. Single Claude call → { bom_items, labor_lines,          │
│        narrative, code_callouts }                              │
│     3. Deterministic mapping: each bom_item.slot →             │
│        contractor_catalog row → quantity × ballpark price      │
│     4. Persist estimate + items + labor                        │
│     5. Return estimate id                                      │
│                                                                │
│   PATCH /api/estimates/[id]     (field-level edits, server      │
│                                  recomputes totals on response) │
│   POST  /api/estimates/[id]/share    (mint token)              │
└──────────┬───────────────────────────┬─────────────────────────┘
           ▼                           ▼
┌─ Supabase (new project) ──┐   ┌─ Anthropic ──────────────────┐
│ Auth + RLS multi-tenant   │   │ Claude Sonnet 4.6 (default)  │
│ Postgres tables           │   │ Vision + native PDF input    │
│ Storage: attachments,     │   │ System prompt cached         │
│   brand logos             │   │                              │
└────────────────────────────┘   └──────────────────────────────┘
```

**New vs. coolbid:**
- AI generates BOM directly from a free-form description (not extracted floorplan rooms).
- AI estimates labor hours per task category (today contractors guess totals).
- Customer-facing Detailed / Summary toggle (today only one rendering).
- House catalog is generic ballpark items, not vendor SKUs.

**Ported conceptually from coolbid (copied, not imported):**
- Auth + RLS pattern (`src/lib/supabase/{server,client,middleware,admin}.ts`).
- BOM slot taxonomy concept (from `src/lib/hvac/bom-slot-taxonomy.ts`).
- Margin / labor recalc math (`src/lib/estimates/recalc.ts`).
- PDF renderer (`@react-pdf/renderer` + `src/lib/pdf/*`) — tokens and fonts carry over.
- Public share route shape (`/q/[token]`) and token minting pattern.
- Tailwind 4 + shadcn v4 + base-ui + design tokens (`docs/coolbid-design-system.md`).

**Dropped from coolbid entirely:**
- Floorplan pipeline: `src/lib/analyze`, `src/lib/analyzer`, `geometry-service`, room geometry migrations, room components.
- Vendor catalog system: `vendor_products`, quote-miner, `vendor-classifier-llm`, `accessory-picker-llm`, `equipment-candidates`, Gmail email-ingest.
- Equipment picker UI, `parts-database` routes and tab.
- Stripe billing (deferred).
- Accept/decline + feedback prompts (deferred).
- Team / multi-user surface (deferred).
- Changeout 5-step wizard (replaced by single conversational intake).

**Stack: identical to coolbid.** Next.js 16, React 19, Supabase, Anthropic SDK, Tailwind 4, shadcn v4, Zod, Zustand, Resend, `@react-pdf/renderer`. Same versions — makes the eventual transplant trivial.

**Database: new Supabase project.** POC isolation; existing coolbid project keeps serving Greenfield. Contractor migration is a separate concern handled at transplant time.

---

## 2. Repo structure

```
coolbid-rewrite-poc/
├── AGENTS.md / CLAUDE.md
├── package.json
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── postcss.config.mjs
├── components.json
├── vitest.config.ts
│
├── public/                          (logo, favicon — minimal)
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── (marketing)/page.tsx     (single landing page)
│   │   ├── auth/                    (login, signup, callback)
│   │   ├── (app)/
│   │   │   ├── layout.tsx           (sidebar: Estimates · Catalog · Settings)
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── estimates/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx     (conversational intake)
│   │   │   │   └── [id]/page.tsx    (item-level editor)
│   │   │   ├── catalog/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── q/[token]/page.tsx       (public homeowner view)
│   │   └── api/
│   │       ├── estimates/
│   │       │   ├── route.ts                (POST = generate)
│   │       │   ├── [id]/route.ts           (GET, PATCH — PATCH recomputes totals)
│   │       │   └── [id]/share/route.ts
│   │       └── catalog/route.ts            (GET, PATCH)
│   │
│   ├── components/
│   │   ├── ui/                      (shadcn primitives — port)
│   │   ├── layout/                  (sidebar, top nav)
│   │   ├── intake/                  (NEW)
│   │   ├── estimate-editor/         (NEW)
│   │   ├── catalog/                 (NEW)
│   │   ├── share/                   (homeowner view, Detailed + Summary)
│   │   └── settings/
│   │
│   ├── lib/
│   │   ├── supabase/                (port: server, client, middleware, admin)
│   │   ├── ai/                      (NEW)
│   │   │   ├── anthropic.ts
│   │   │   ├── generate-estimate.ts
│   │   │   ├── prompts/
│   │   │   │   ├── system.ts
│   │   │   │   └── examples.ts
│   │   │   └── schema.ts
│   │   ├── catalog/                 (NEW)
│   │   │   ├── slot-taxonomy.ts     (port + adapt)
│   │   │   ├── house-catalog.ts
│   │   │   ├── seed-on-signup.ts
│   │   │   └── map-to-catalog.ts
│   │   ├── estimates/
│   │   │   ├── recalc.ts            (port)
│   │   │   ├── persist.ts
│   │   │   └── load.ts
│   │   ├── share/                   (port)
│   │   │   ├── tokens.ts
│   │   │   └── scope-of-work.ts
│   │   ├── pdf/                     (port wholesale, trim to 2 views later)
│   │   ├── resend.ts                (port)
│   │   └── utils.ts
│   │
│   ├── types/
│   │   ├── database.ts              (regenerate from new Supabase project)
│   │   ├── estimate.ts
│   │   └── catalog.ts
│   ├── hooks/
│   │   └── use-intake.ts
│   └── stores/
│       └── intake-store.ts          (zustand — intake form state only)
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_init.sql
│   │   ├── 002_catalog.sql
│   │   ├── 003_estimates.sql
│   │   ├── 004_share_tokens.sql
│   │   └── 005_settings.sql
│   └── seed_house_catalog.sql       (~200 items)
│
├── docs/
│   └── superpowers/specs/
│       └── 2026-04-18-coolbid-rewrite-poc-design.md
│
└── tools/
    └── smoke/                       (canned intakes + expected outputs)
```

**Carryover discipline:** port working code verbatim (recalc, supabase clients, PDF renderer, share tokens, shadcn primitives, layout shell). Rewrite anything tied to floorplans, vendor SKUs, equipment-picker, or the changeout wizard. No monorepo, no workspaces — one package, copy-paste ports.

---

## 3. Data model

All tables carry `contractor_id` with RLS policy `contractor_id = auth.uid()`. Money columns are `numeric(12,2)` USD.

### `contractors` (extends `auth.users`)

| col | type | notes |
|---|---|---|
| `id` | uuid PK | = `auth.users.id` |
| `company_name` | text | |
| `region_code` | text | e.g. `"OK-AGRA"` — used at seed time only |
| `region_multiplier` | numeric | snapshot from house catalog regional table |
| `default_labor_rate` | numeric | $/hr |
| `default_margin_pct` | numeric | |
| `default_customer_view` | text | `'detailed'` \| `'summary'` |
| `logo_storage_path` | text | Supabase Storage `brand/` bucket |
| `phone`, `address` | text | |
| `created_at`, `updated_at` | timestamptz | |

### `contractor_catalog` (per-contractor copy, seeded on signup)

| col | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `contractor_id` | uuid FK | |
| `slot` | text | enum from `lib/catalog/slot-taxonomy.ts` |
| `customer_category` | text | rollup label for Summary view |
| `tier` | text NULL | `'good'` \| `'better'` \| `'best'` \| NULL |
| `name` | text | e.g. `"3-ton AC condenser, mid-tier"` |
| `unit` | text | `'each'` \| `'ft'` \| `'lb'` \| `'job'` |
| `default_quantity` | numeric NULL | for predictable items |
| `price_low`, `price_mid`, `price_high` | numeric | ballpark range, region-adjusted at seed |
| `notes` | text NULL | contractor annotation |
| `is_active` | bool | soft-delete |
| `source` | text | `'seed'` \| `'custom'` |
| `created_at`, `updated_at` | timestamptz | |

UNIQUE (`contractor_id`, `slot`, `tier`, `name`).

### `estimates`

| col | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `contractor_id` | uuid FK | |
| `status` | text | `'draft'` \| `'sent'` \| `'archived'` |
| `customer_name`, `customer_address` | text | |
| `customer_email`, `customer_phone` | text NULL | |
| `intake_text` | text | original free-form description |
| `intake_attachments` | jsonb | `[{ storage_path, mime, label }]` |
| `parsed_job_spec` | jsonb | AI extraction: `{ system_type, tonnage, sqft, install_context, ductwork_status, ... }` |
| `narrative` | text | scope-of-work prose |
| `code_callouts` | jsonb | `string[]` |
| `margin_pct` | numeric | snapshot of contractor default at gen, editable |
| `labor_rate_per_hour` | numeric | snapshot, editable per-estimate |
| `customer_view` | text | `'detailed'` \| `'summary'` |
| `subtotal_materials`, `subtotal_labor`, `markup_amount`, `total` | numeric | denormalized for list queries |
| `created_at`, `updated_at` | timestamptz | |

### `estimate_bom_items`

| col | type | notes |
|---|---|---|
| `id`, `estimate_id`, `position` | | int sort order |
| `slot` | text | |
| `customer_category` | text | denormalized at gen for stable customer view |
| `catalog_item_id` | uuid FK NULL | NULL for unmapped / contractor-added lines |
| `name`, `unit` | text | editable |
| `quantity`, `unit_price` | numeric | editable |
| `line_total` | numeric GENERATED | `quantity * unit_price` |
| `notes` | text NULL | |
| `source` | text | `'ai_generated'` \| `'ai_generated_unmapped'` \| `'contractor_added'` |

### `estimate_labor_lines`

| col | type | notes |
|---|---|---|
| `id`, `estimate_id`, `position` | | |
| `category` | text | `'Removal'` \| `'Equipment Install'` \| `'Refrigerant Work'` \| `'Electrical'` \| `'Drainage'` \| `'Startup/Commissioning'` \| `'Permits/Inspection'` \| custom |
| `hours` | numeric | editable |
| `rate_per_hour` | numeric | defaults to `estimates.labor_rate_per_hour`, editable per-line |
| `line_total` | numeric GENERATED | |
| `notes` | text NULL | AI rationale, surfaced in editor tooltip |
| `source` | text | `'ai_generated'` \| `'contractor_added'` |

### `estimate_share_tokens`

| col | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `estimate_id` | uuid FK | |
| `token` | text UNIQUE | opaque random ~32 chars |
| `customer_view_at_share` | text | locked snapshot |
| `created_at`, `revoked_at` | timestamptz | |

Partial unique index: `UNIQUE (estimate_id) WHERE revoked_at IS NULL` — at most one active token per estimate.

### Storage buckets
- `attachments/` — intake attachments, path-prefix-scoped RLS `contractor_id = auth.uid()`.
- `brand/` — contractor logos, same RLS pattern.

### Seeding
`seed_contractor_catalog(contractor_id uuid, region_multiplier numeric)` — SQL function reads from a `house_catalog` table and inserts ~200 rows with prices = `house_price * region_multiplier`. Invoked from the `/onboarding` submit server action (which is the contractor's first authenticated action — onboarding gates access to `/estimates/*`). Idempotent — no-op if any rows already exist for that contractor. House catalog lives in its own SQL-seeded table rather than as TypeScript data so it can be edited through Supabase Studio without redeploying.

---

## 4. AI pipeline

```
intake ─┬─ text (required)
        └─ optional attachments (images, PDFs)
              │
              ▼
   ┌──────────────────────────────────────────────────────────┐
   │  Single Claude call (Sonnet 4.6, env-configurable)       │
   │                                                          │
   │  System prompt (cached via prompt caching):              │
   │    - Slot taxonomy enum                                  │
   │    - Customer-category rollup mapping                    │
   │    - Labor task-category enum                            │
   │    - Output JSON schema                                  │
   │    - 3–5 few-shot examples                               │
   │                                                          │
   │  User message (per-request):                             │
   │    - Free-form intake text                               │
   │    - Attachments inline (image + PDF blocks — native)    │
   │                                                          │
   │  Output: validated by Zod (AiEstimateOutput)             │
   └──────────────────────────────────────────────────────────┘
              │
              ▼
   ┌──────────────────────────────────────────────────────────┐
   │  Deterministic catalog mapping (no LLM)                  │
   │                                                          │
   │  For each ai_bom_item:                                   │
   │    rows = contractor_catalog rows for slot, active       │
   │    pick = chooseRow(rows, tier_hint, unit_hint)          │
   │    if pick: attach unit_price = pick.price_mid,          │
   │             catalog_item_id, customer_category           │
   │    else:    price=0, source='ai_generated_unmapped'      │
   └──────────────────────────────────────────────────────────┘
              │
              ▼
   persist estimate + bom_items + labor_lines, return id
```

### Claude output schema (`src/lib/ai/schema.ts`, Zod)

```ts
const AiEstimateOutput = z.object({
  parsed_job_spec: z.object({
    system_type: z.enum([
      "ac_only","heat_pump","gas_furnace_ac",
      "dual_fuel","ah_heat_strips","other"
    ]),
    tonnage: z.number().nullable(),
    sqft: z.number().nullable(),
    install_context: z.string(),
    ductwork_status: z.enum(["existing_reuse","new","modify","unknown"]),
    notes_for_contractor: z.string().optional(),
  }),
  bom_items: z.array(z.object({
    slot: z.enum(SLOT_TAXONOMY),
    name: z.string(),
    unit: z.enum(["each","ft","lb","job"]),
    quantity: z.number(),
    tier_hint: z.enum(["good","better","best"]).optional(),
    notes: z.string().optional(),
  })),
  labor_lines: z.array(z.object({
    category: z.enum(LABOR_CATEGORIES),
    hours: z.number(),
    notes: z.string(),
  })),
  narrative: z.string(),
  code_callouts: z.array(z.string()),
});
```

### Slot taxonomy (`src/lib/catalog/slot-taxonomy.ts`)

Flat enum with dotted namespace for grouping. Each slot has a static `customer_category` mapping used in the Summary rollup.

```
major_equipment.condenser       → "Major Equipment"
major_equipment.air_handler     → "Major Equipment"
major_equipment.furnace         → "Major Equipment"
major_equipment.heat_pump       → "Major Equipment"
major_equipment.coil            → "Major Equipment"
major_equipment.package_unit    → "Major Equipment"
refrigerant.line_set            → "Refrigerant Line Set"
refrigerant.refrigerant_charge  → "Refrigerant Line Set"
refrigerant.fittings            → "Refrigerant Line Set"
electrical.disconnect           → "Electrical"
electrical.whip                 → "Electrical"
electrical.thermostat_wire      → "Electrical"
controls.thermostat             → "Controls"
drainage.drain_pan              → "Drainage"
drainage.float_switch           → "Drainage"
drainage.condensate_pvc         → "Drainage"
mounting.pad                    → "Mounting"
mounting.brackets               → "Mounting"
permits.permit_fee              → "Permits"
misc.fittings                   → "Misc"
misc.startup_kit                → "Misc"
```

Taxonomy expansions are additive — adding a slot doesn't break existing estimates.

### Prompt caching

System prompt uses `cache_control: { type: "ephemeral" }`. First call costs full system tokens; subsequent calls within 5 min are ~90% cheaper. Cache hit rate tracked via response `usage` block and logged.

### Vision + PDF inputs

Anthropic's native image and PDF blocks — nameplate photos and Manual J PDFs go inline alongside the text intake. No client-side PDF parsing; `pdf-parse` and `pdfjs-dist` are dropped from the dependency list.

### Error handling (by likelihood)

1. **Schema validation fails** → retry once with `"Previous output failed schema validation: <error>. Return strictly conformant JSON."` appended. If second attempt fails, return 422 to the UI with the raw output. Log for prompt tuning.
2. **API failure / timeout** → 502 with inline retry button. No partial estimate persisted.
3. **Slot not in taxonomy** → Zod catches it, path #1.
4. **No catalog row for emitted slot** → persist line with `source='ai_generated_unmapped'`, `unit_price=0`. UI surfaces as yellow "Set price" badge. Normal, recoverable.
5. **Multiple tier variants and no `tier_hint`** → pick row with `tier='better'` if present, else lowest `price_mid`.
6. **Quantity wildly off** → no automatic correction; contractor catches in editor.

### Model choice

Sonnet 4.6 default. Env-configurable (`ANTHROPIC_MODEL`) for A/B against Opus 4.7 on hard cases. Haiku is too weak for this structured generation task.

### No streaming in POC

Non-streaming API call returns when done; UI shows a skeleton loading state with rotating copy ("Reading the job… Sizing the BOM… Estimating labor… Drafting the proposal…"). Streaming adds complexity (partial-JSON parsing, progressive UI) for POC-irrelevant perceived-speed gain on a ~10–20s call. Fast-follow.

---

## 5. UI flow

11 screens total.

### Unauthenticated

1. **`/` (landing)** — hero, 30-second demo gif, pricing stub, CTA → `/auth/signup`. Single page.
2. **`/auth/login` + `/auth/signup`** — ported. Supabase email+password. Google OAuth deferred.

### First-time onboarding (blocks `/estimates/*` until complete)

3. **`/onboarding`** — three-step one-pager:
   - Company: name, phone, address, logo upload.
   - Defaults: labor rate ($/hr), target margin (%), customer-view default radio.
   - Region: hardcoded dropdown (~10 region codes). On submit, server action calls `seed_contractor_catalog` and redirects to `/dashboard`.

### Authenticated shell

Sidebar nav: **Estimates** · **Catalog** · **Settings**.

4. **`/dashboard`** — list of recent 10 estimates (customer, date, total, status), primary button "+ New Estimate". No charts, metrics, or activity feed.

5. **`/estimates/new` — intake screen (the heart of the POC).**
   - Customer block (collapsible, optional): name, address, phone, email.
   - Describe the job: large multiline textarea (min 8 rows, autogrows). Placeholder shows a good example.
   - Attachments (optional): drag-drop, accepts images + PDFs. Uploaded to `attachments/` bucket.
   - Sticky **Generate estimate** CTA. Subcopy: "This typically takes 10–20 seconds."
   - On submit: POST `/api/estimates` → persist draft → Claude call → catalog mapping → save items + labor → return id → client navigates to `/estimates/[id]`. On failure: 422 with inline error + Retry.

6. **Loading state** — full-screen skeleton of the editor with rotating copy every 3s. Pure UI theater — the request isn't streamed.

7. **`/estimates/[id]` — editor (contractor-internal, item-level).**
   ```
   ┌──────────────────────────────┬────────────────┐
   │ Customer block (editable)    │ Financials     │
   ├──────────────────────────────┤ card           │
   │ BOM items table (editable)   │ - Margin %     │
   │   slot | name | qty | unit $ │ - Labor rate   │
   │   [+ Add line]               │ - Subtotals    │
   ├──────────────────────────────┤ - Markup $     │
   │ Labor lines table (editable) │ - Total        │
   │   category | hrs | $/hr | $  │                │
   │   [+ Add labor line]         │ [Customer view]│
   ├──────────────────────────────┤ (o) Detailed   │
   │ Narrative (Scope of Work)    │ ( ) Summary    │
   ├──────────────────────────────┤                │
   │ Code callouts (editable list)│ [Share ▸]      │
   └──────────────────────────────┴────────────────┘
   ```
   - Field edits debounced → PATCH `/api/estimates/[id]`.
   - Unmapped BOM lines show yellow "Set price" badge; Share disabled until resolved (or contractor dismisses).
   - Regenerate button (top-right): re-runs AI pipeline against the same intake. Confirmation dialog ("this will replace your current BOM + labor + narrative").
   - No drag-reorder in POC — `position` is fixed from generation order.

8. **Share dialog** — confirms customer-view choice (inherited, editable here), mints token with `customer_view_at_share` locked, shows link + copy button + "Send to customer email" (Resend) if email set.

### Public homeowner view

9. **`/q/[token]` (public, no auth)** — server-renders the estimate in Detailed or Summary mode based on the token snapshot. Contractor branding. No interactivity beyond browser-print.

### Catalog editor

10. **`/catalog`** — filterable table of contractor catalog rows. Columns: slot, customer category, name, tier, unit, price range (inline editable), notes, active toggle. Add row, soft-delete row. Changes save on blur.

### Settings

11. **`/settings`** — same fields as onboarding. Region change shows "apply multiplier to catalog?" confirm dialog (would rewrite seed-sourced prices, leave custom rows alone).

### Out of UI scope (POC)

Duplication, deletion UI, dark mode, team invites, Stripe portal, feedback prompts, floorplan upload, equipment picker, Gmail connection, accept/decline, native PDF download button on customer view (homeowners browser-print).

---

## 6. Customer-facing share view

One route (`/q/[token]`), two render modes based on `customer_view_at_share`. Mobile-first.

### Shared header & footer

- Contractor logo + company name + phone/address.
- Customer name + address.
- Date + short estimate ID (last 6 chars of UUID).
- Grand Total prominently at top and bottom.
- **Never shown:** margin, markup, labor rate. Internal only.

### Detailed mode

- **Scope of Work** — narrative prose.
- **Code & Compliance Notes** — bulleted `code_callouts`, only if non-empty. Prefixed "*Contractor should verify*" for jurisdiction-specific items.
- **Equipment & Materials** — table grouped by `customer_category`. Within each group: item name, quantity, unit, extended line total. No unit prices. Category subtotal at bottom of each group.
- **Labor** — task categories with hours and extended total per category. No hourly rate. Labor subtotal.
- **Grand Total.**

### Summary mode

- **Scope of Work** — narrative.
- **Code & Compliance Notes** — same as Detailed.
- **Your Investment** — 6–8 row table, one row per `customer_category` with a single total. No quantities, no individual items.
- **Grand Total.**

### Rollup rule

Category totals in both modes are pre-markup + markup applied proportionally. Sum of category totals equals grand total exactly (no rounding drift, no separate "markup" line). Computed server-side in `lib/estimates/recalc.ts`.

### Styling

Reuse `lib/pdf/tokens.ts` color/type tokens so print CSS matches the PDF. Print-friendly CSS for A4/Letter. No interactive elements beyond print.

### Token lifecycle

- Mint → inserts row with `customer_view_at_share` locked.
- Revoke from editor → sets `revoked_at`, public view returns 410 Gone.
- Re-share mints a fresh token (old one stays revoked). At most one active token per estimate.
- Toggling customer-view on an already-shared estimate does **not** change what the existing recipient sees — the link is a snapshot. Explicit "Revoke & re-share" is required to change it.

---

## 7. Testing

Minimal, focused on what breaks.

### Unit tests (Vitest, colocated `__tests__/`)

- `lib/estimates/recalc.ts` — totals math. Port current-app tests and adapt for labor-lines-array shape. Must include: multiple labor lines at different rates, zero-price unmapped BOM items, rollup equality (sum of category totals exactly equals grand total).
- `lib/catalog/map-to-catalog.ts` — slot → row selection. Cases: no rows, one row, multiple tier variants with/without `tier_hint`, all-inactive rows.
- `lib/catalog/seed-on-signup.ts` — idempotency, region-multiplier application.
- `lib/ai/schema.ts` — Zod schema accepts valid AI output, rejects known bad shapes.
- `lib/share/tokens.ts` — minting, revocation, partial unique constraint.

### Not tested in POC

- The Claude call itself. Too expensive, too flaky, low signal. Covered by manual smoke tests.
- UI components beyond critical forms.
- Integration tests. No test Supabase infra for POC.
- Cross-browser (Chrome desktop + Safari iOS only).
- Accessibility audit (shadcn baseline, formal audit at transplant).
- Load / performance.

### Manual smoke tests (`tools/smoke/`)

5 canned intakes run through the real pipeline for visual inspection:
- `smoke-intake-changeout.txt`
- `smoke-intake-newbuild.txt`
- `smoke-intake-ac-only.txt`
- One with an attached nameplate photo
- One with an attached Manual J PDF

Expected outputs committed in `tools/smoke/expected/`. Regression ritual after every prompt edit: run all five, eyeball diffs. Not in CI (costs real API dollars).

### CI

`npm run lint && npm run test && npm run build` passes. Smoke tests manual only.

---

## 8. Out of scope / fast-follow

### Deferred to post-POC validation (add back when transplanting)

- Stripe subscriptions, pricing tiers, trial UX.
- Accept/decline flow + feedback prompts.
- Teams: multi-user, roles, per-user estimates.
- Estimate duplication, archive restore, bulk operations.
- Native PDF download on customer share view.
- Resend confirmations back to the contractor.
- Analytics / event tracking.
- Dark mode.
- Mobile-app polish on nav transitions.

### Fast-follow (natural next steps inside POC repo)

- Voice input on intake (Web Speech API → text → same submit path).
- Streaming AI response (BOM table populates progressively).
- Regeneration with "keep my edits" option.
- Catalog "sync from house catalog" button (pull house updates on opt-in).
- One-click "Revoke & re-share as Summary" from editor.
- Per-line drag-reorder in BOM editor.

### Explicitly not on the roadmap (reconsider only with clear customer demand)

- Universal parts / vendor SKU database. The pivot is *away* from this.
- Email-based vendor-quote ingestion (Gmail OAuth + quote-miner + vendor-classifier).
- Floorplan PDF upload + room geometry + load calc pipeline.
- Equipment picker UI.
- Changeout 5-step mobile wizard.
- RFQ + OCR-import loop from vendor returns.

### Risks & open questions parked for the implementation plan

1. **House catalog curation.** ~200 generic items with tier variants and national ballpark ranges is a real content job. Pair session with Kolbey + Claude-assisted draft, sanity-checked against one real contractor quote for magnitude.
2. **Region multipliers.** Hardcoded lookup by region code (~10 regions, single multiplier each). Coarse — the markup buffer absorbs error. Refine if contractor feedback demands it.
3. **Prompt iteration loop.** 5 smoke scenarios are the regression set, but there's no automated comparison. Manual "read the diffs" ritual for the first few iterations.
4. **Code callouts quality.** Claude will confidently cite the wrong code. POC renders callouts prefixed "*Contractor should verify*" with a disclaimer in the narrative. Long-term probably needs a curated rule table.
5. **Unmapped BOM lines.** High frequency of AI emitting slots we don't have = signal to expand taxonomy or house catalog. Track the rate during POC usage.
