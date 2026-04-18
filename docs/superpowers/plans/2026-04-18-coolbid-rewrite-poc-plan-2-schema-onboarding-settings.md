# coolbid-rewrite-poc — Plan 2 of 7: Schema, Onboarding & Settings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the `contractors` profile table, the house + per-contractor catalog tables (with ~35 seed items), the onboarding form that captures defaults + seeds the contractor's catalog, and the settings page that edits the same fields. End state: a new signup lands in `/onboarding`, fills the form, catalog gets seeded, and they arrive at an empty dashboard with their settings accessible.

**Architecture:** Postgres migrations via the Supabase CLI. Two catalog tables: `house_catalog` (global, one per tier+slot) and `contractor_catalog` (per-contractor copy, seeded on first onboarding submit). A SQL function handles the seed so onboarding stays fast and idempotent. Middleware gets an `onboarding_done` redirect. Forms use server actions (not client fetch).

**Tech Stack:** Supabase CLI for migrations, Postgres SQL functions, Next.js 16 server actions, Zod for form validation, RLS on every table.

**Spec:** `docs/superpowers/specs/2026-04-18-coolbid-rewrite-poc-design.md` §3 (data model — contractors + catalog portions only; estimates/bom/labor/share_tokens deferred to Plan 4) and §5 (onboarding + settings screens).

**Plan 1 handoff state:** new repo at `/Users/kolbeypruitt/Workspace/coolbid-rewrite-poc` with 16 commits on `main`, auth + shell working end-to-end, `.env.local` populated. Database is empty (just Supabase Auth).

**Commit discipline:** all commits via `/commit` per protected-workflow rule. Feature branch in the POC repo (created in Task 1). Each plan task ends with one commit.

---

## Pre-flight (USER ACTION REQUIRED before Task 1)

1. **Supabase CLI linked.** From the POC repo: `cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc && npx supabase link --project-ref <project-ref>`. The project-ref is the ID portion of your Supabase URL (`https://<project-ref>.supabase.co`). Prompts for a DB password — use the one you set when creating the project. If you don't remember it, reset it in Supabase Dashboard → Project Settings → Database. This only needs to happen once per machine.

2. **Confirm ok with the house-catalog stub** (~35 items). Expansion to ~200 is a separate content-curation effort, not part of Plan 2.

---

## Task 1: Feature branch + plan import

**Files:**
- Create: `docs/plans/plan-2-schema-onboarding-settings.md` in the POC repo (copy from coolbid)

- [ ] **Step 1: Create the feature branch in the POC repo**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
git checkout -b feature/plan-2-schema-onboarding-settings
```

- [ ] **Step 2: Copy Plan 2 doc into the POC repo**

```bash
cp /Users/kolbeypruitt/Workspace/coolbid/docs/superpowers/plans/2026-04-18-coolbid-rewrite-poc-plan-2-schema-onboarding-settings.md \
   /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/docs/plans/plan-2-schema-onboarding-settings.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/plans/plan-2-schema-onboarding-settings.md
git commit -m "docs: import plan-2 (schema + onboarding + settings)"
```

---

## Task 2: Migration 001 — `contractors` table

**Files:**
- Create: `supabase/migrations/20260418100000_contractors.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260418100000_contractors.sql

-- The contractors table extends auth.users with profile + default settings.
-- One row per signed-up user. Completeness of a row is gated by `onboarded_at`.

create table public.contractors (
  id uuid primary key references auth.users(id) on delete cascade,
  company_name text,
  phone text,
  address text,
  region_code text,
  region_multiplier numeric(6,3),
  default_labor_rate numeric(8,2),
  default_margin_pct numeric(5,2),
  default_customer_view text check (default_customer_view in ('detailed','summary')),
  logo_storage_path text,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.contractors is 'Per-user profile + default settings. Row created lazily on first onboarding submit.';
comment on column public.contractors.onboarded_at is 'NULL until onboarding form is submitted. Middleware redirects to /onboarding while NULL.';

-- RLS: each contractor sees and edits only their own row
alter table public.contractors enable row level security;

create policy contractors_select_own on public.contractors
  for select using (auth.uid() = id);

create policy contractors_insert_own on public.contractors
  for insert with check (auth.uid() = id);

create policy contractors_update_own on public.contractors
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger contractors_touch_updated_at
  before update on public.contractors
  for each row execute function public.touch_updated_at();
```

- [ ] **Step 2: Apply the migration to the linked Supabase project**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx supabase db push
```

Expected: prints the migration name and `Finished supabase db push.` If it asks about seed data or diffs, confirm just the migration. If it errors with "migration X not found", double-check the filename format and that `supabase link` succeeded in pre-flight.

- [ ] **Step 3: Verify via SQL**

```bash
npx supabase db remote query "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='contractors' order by ordinal_position;"
```

Expected: 14 columns listed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260418100000_contractors.sql
git commit -m "feat(db): contractors profile table + RLS + updated_at trigger"
```

---

## Task 3: Migration 002 — `house_catalog` + `contractor_catalog` tables

**Files:**
- Create: `supabase/migrations/20260418110000_catalogs.sql`

- [ ] **Step 1: Create the migration**

```sql
-- supabase/migrations/20260418110000_catalogs.sql

-- Slot taxonomy lives in the app code (lib/catalog/slot-taxonomy.ts).
-- DB stores the slot as free text to keep migrations flexible when the
-- taxonomy grows. Application validates on read.

-- house_catalog is our global set of ~35 ballpark items (per plan).
-- Read by everyone (RLS permits select to authenticated), written only by us.
create table public.house_catalog (
  id uuid primary key default gen_random_uuid(),
  slot text not null,
  customer_category text not null,
  tier text check (tier in ('good','better','best')),
  name text not null,
  unit text not null check (unit in ('each','ft','lb','job')),
  default_quantity numeric(10,2),
  national_price_low numeric(10,2) not null,
  national_price_mid numeric(10,2) not null,
  national_price_high numeric(10,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slot, tier, name)
);

comment on table public.house_catalog is 'Global ballpark catalog. Seeded by seed SQL. Contractors get a region-adjusted copy in contractor_catalog.';

alter table public.house_catalog enable row level security;

create policy house_catalog_select_all on public.house_catalog
  for select using (auth.role() = 'authenticated');

create trigger house_catalog_touch_updated_at
  before update on public.house_catalog
  for each row execute function public.touch_updated_at();

-- contractor_catalog is the per-tenant copy, seeded on onboarding.
create table public.contractor_catalog (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  slot text not null,
  customer_category text not null,
  tier text check (tier in ('good','better','best')),
  name text not null,
  unit text not null check (unit in ('each','ft','lb','job')),
  default_quantity numeric(10,2),
  price_low numeric(10,2) not null,
  price_mid numeric(10,2) not null,
  price_high numeric(10,2) not null,
  notes text,
  is_active boolean not null default true,
  source text not null check (source in ('seed','custom')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contractor_id, slot, tier, name)
);

comment on table public.contractor_catalog is 'Per-contractor copy of the catalog. Seeded from house_catalog on onboarding; contractor edits freely.';

alter table public.contractor_catalog enable row level security;

create policy contractor_catalog_select_own on public.contractor_catalog
  for select using (auth.uid() = contractor_id);

create policy contractor_catalog_insert_own on public.contractor_catalog
  for insert with check (auth.uid() = contractor_id);

create policy contractor_catalog_update_own on public.contractor_catalog
  for update using (auth.uid() = contractor_id) with check (auth.uid() = contractor_id);

create policy contractor_catalog_delete_own on public.contractor_catalog
  for delete using (auth.uid() = contractor_id);

create trigger contractor_catalog_touch_updated_at
  before update on public.contractor_catalog
  for each row execute function public.touch_updated_at();

create index contractor_catalog_slot_idx on public.contractor_catalog (contractor_id, slot, is_active);
```

- [ ] **Step 2: Apply + verify**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx supabase db push
npx supabase db remote query "select table_name from information_schema.tables where table_schema='public' and table_name in ('house_catalog','contractor_catalog');"
```

Expected: both tables listed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260418110000_catalogs.sql
git commit -m "feat(db): house_catalog + contractor_catalog tables + RLS + indexes"
```

---

## Task 4: Migration 003 — `seed_contractor_catalog` function

**Files:**
- Create: `supabase/migrations/20260418120000_seed_fn.sql`

- [ ] **Step 1: Create the function**

```sql
-- supabase/migrations/20260418120000_seed_fn.sql

-- Copies house_catalog rows into contractor_catalog, applying the contractor's
-- region_multiplier to the national prices. Idempotent: no-op if the contractor
-- already has seed rows.
--
-- Called from the /onboarding server action after the contractors row is upserted.

create or replace function public.seed_contractor_catalog(
  p_contractor_id uuid,
  p_region_multiplier numeric
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  -- Idempotency: skip if any seed rows exist for this contractor.
  if exists (
    select 1 from public.contractor_catalog
    where contractor_id = p_contractor_id and source = 'seed'
  ) then
    return 0;
  end if;

  insert into public.contractor_catalog (
    contractor_id, slot, customer_category, tier, name, unit,
    default_quantity, price_low, price_mid, price_high, source
  )
  select
    p_contractor_id,
    h.slot,
    h.customer_category,
    h.tier,
    h.name,
    h.unit,
    h.default_quantity,
    round(h.national_price_low  * p_region_multiplier, 2),
    round(h.national_price_mid  * p_region_multiplier, 2),
    round(h.national_price_high * p_region_multiplier, 2),
    'seed'
  from public.house_catalog h;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.seed_contractor_catalog is 'Idempotent seed of contractor_catalog from house_catalog with region-adjusted prices.';

-- Allow authenticated users to call it for their own id (RLS on the inserts
-- is bypassed by security definer; we still guard inside the function).
revoke all on function public.seed_contractor_catalog(uuid, numeric) from public;
grant execute on function public.seed_contractor_catalog(uuid, numeric) to authenticated;
```

- [ ] **Step 2: Apply + verify**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx supabase db push
npx supabase db remote query "select proname, pronargs from pg_proc where proname='seed_contractor_catalog';"
```

Expected: one row back.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260418120000_seed_fn.sql
git commit -m "feat(db): seed_contractor_catalog function (idempotent + region-adjusted)"
```

---

## Task 5: House catalog seed data

**Files:**
- Create: `supabase/seed_house_catalog.sql` (35 rows)

The seed lives as a regular SQL file in the repo (not a migration, since it's reference data we'll want to edit often). We manually apply it after migrations.

- [ ] **Step 1: Write the seed SQL**

```sql
-- supabase/seed_house_catalog.sql
-- ~35 generic ballpark items covering the main BOM slots. National midpoint
-- prices reflect rough US averages for residential HVAC in early 2026.
-- Contractors can edit these freely in /catalog after seeding.

insert into public.house_catalog (slot, customer_category, tier, name, unit, default_quantity, national_price_low, national_price_mid, national_price_high) values
-- Major Equipment - AC Condenser
('major_equipment.condenser', 'Major Equipment', 'good', 'AC Condenser, builder-grade', 'each', 1, 1800, 2200, 2600),
('major_equipment.condenser', 'Major Equipment', 'better', 'AC Condenser, two-stage', 'each', 1, 2600, 3200, 3800),
('major_equipment.condenser', 'Major Equipment', 'best', 'AC Condenser, variable-speed inverter', 'each', 1, 3800, 4800, 5800),
-- Major Equipment - Heat Pump Condenser
('major_equipment.heat_pump', 'Major Equipment', 'good', 'Heat Pump Condenser, single-stage', 'each', 1, 2400, 2900, 3400),
('major_equipment.heat_pump', 'Major Equipment', 'better', 'Heat Pump Condenser, two-stage', 'each', 1, 3200, 3900, 4600),
('major_equipment.heat_pump', 'Major Equipment', 'best', 'Heat Pump Condenser, variable-speed inverter', 'each', 1, 4500, 5500, 6500),
-- Major Equipment - Air Handler
('major_equipment.air_handler', 'Major Equipment', 'good', 'Air Handler, PSC blower', 'each', 1, 1100, 1400, 1700),
('major_equipment.air_handler', 'Major Equipment', 'better', 'Air Handler, ECM blower', 'each', 1, 1600, 2000, 2400),
('major_equipment.air_handler', 'Major Equipment', 'best', 'Air Handler, variable-speed ECM', 'each', 1, 2200, 2700, 3200),
-- Major Equipment - Gas Furnace
('major_equipment.furnace', 'Major Equipment', 'good', 'Gas Furnace, 80% AFUE single-stage', 'each', 1, 1200, 1500, 1800),
('major_equipment.furnace', 'Major Equipment', 'better', 'Gas Furnace, 90%+ AFUE two-stage', 'each', 1, 1900, 2400, 2900),
('major_equipment.furnace', 'Major Equipment', 'best', 'Gas Furnace, 95%+ AFUE modulating', 'each', 1, 2800, 3400, 4000),
-- Major Equipment - Coil
('major_equipment.coil', 'Major Equipment', 'good', 'Evaporator Coil, uncased', 'each', 1, 500, 700, 900),
('major_equipment.coil', 'Major Equipment', 'better', 'Evaporator Coil, cased aluminum', 'each', 1, 750, 950, 1150),
('major_equipment.coil', 'Major Equipment', 'best', 'Evaporator Coil, cased premium', 'each', 1, 1000, 1250, 1500),
-- Major Equipment - Package Unit
('major_equipment.package_unit', 'Major Equipment', 'good', 'Package Unit, single-stage', 'each', 1, 3000, 3800, 4600),
('major_equipment.package_unit', 'Major Equipment', 'better', 'Package Unit, two-stage', 'each', 1, 4200, 5200, 6200),
('major_equipment.package_unit', 'Major Equipment', 'best', 'Package Unit, variable-speed', 'each', 1, 5800, 7000, 8200),
-- Refrigerant Line Set
('refrigerant.line_set', 'Refrigerant Line Set', null, 'Copper line set, insulated', 'ft', 25, 7, 10, 13),
('refrigerant.refrigerant_charge', 'Refrigerant Line Set', null, 'Refrigerant charge (R-410A or R-454B)', 'lb', 4, 55, 75, 95),
('refrigerant.fittings', 'Refrigerant Line Set', null, 'Flare / braze fittings kit', 'job', 1, 35, 60, 85),
-- Electrical
('electrical.disconnect', 'Electrical', null, 'AC Disconnect, 60A fused', 'each', 1, 35, 55, 75),
('electrical.whip', 'Electrical', null, 'Whip, weatherproof 6ft', 'each', 1, 25, 40, 55),
('electrical.thermostat_wire', 'Electrical', null, 'Thermostat wire, 18/5', 'ft', 40, 0.60, 0.85, 1.10),
-- Controls
('controls.thermostat', 'Controls', 'good', 'Thermostat, programmable', 'each', 1, 55, 85, 115),
('controls.thermostat', 'Controls', 'better', 'Thermostat, Wi-Fi', 'each', 1, 140, 190, 240),
('controls.thermostat', 'Controls', 'best', 'Thermostat, smart learning', 'each', 1, 240, 310, 380),
-- Drainage
('drainage.drain_pan', 'Drainage', null, 'Secondary drain pan, metal', 'each', 1, 55, 75, 95),
('drainage.float_switch', 'Drainage', null, 'Float switch, in-pan', 'each', 1, 18, 28, 38),
('drainage.condensate_pvc', 'Drainage', null, 'Condensate PVC + glue, 3/4 in', 'ft', 15, 1.20, 1.75, 2.30),
-- Mounting
('mounting.pad', 'Mounting', null, 'Equipment pad, polymer 36x36', 'each', 1, 45, 65, 85),
('mounting.brackets', 'Mounting', null, 'Mounting brackets kit (roof/wall)', 'each', 1, 75, 110, 145),
-- Permits + Misc
('permits.permit_fee', 'Permits', null, 'Local HVAC permit', 'job', 1, 100, 175, 275),
('misc.fittings', 'Misc', null, 'Misc fittings + fasteners', 'job', 1, 40, 70, 100),
('misc.startup_kit', 'Misc', null, 'Startup kit (surge, filter drier, UV tab)', 'each', 1, 60, 95, 130);
```

- [ ] **Step 2: Apply the seed**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
SUPABASE_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2)
SERVICE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2)
DB_URL=$(npx supabase status -o json 2>/dev/null | sed -n 's/.*"DB URL": "\(.*\)".*/\1/p')

# Simpler: use supabase db remote query piping the file (if supported), else run psql
# Primary path: the supabase CLI db remote command accepts SQL from stdin when using --file
npx supabase db remote query "$(cat supabase/seed_house_catalog.sql)"
```

If `db remote query` rejects a large multi-statement payload, fall back to running the SQL via the Supabase dashboard SQL editor (user paste) or via `psql` using the `SUPABASE_DB_URL` from the dashboard. Note the chosen method in the report.

- [ ] **Step 3: Verify**

```bash
npx supabase db remote query "select count(*) as total from public.house_catalog;"
```

Expected: `total = 35`.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed_house_catalog.sql
git commit -m "feat(db): seed house_catalog with 35 ballpark items covering 8 customer categories"
```

---

## Task 6: Regenerate Supabase types

**Files:**
- Modify: `src/types/database.ts` (replace stub)

- [ ] **Step 1: Pull types from the linked project**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc

# Read project id from .env.local
PROJECT_ID=$(grep '^SUPABASE_PROJECT_ID=' .env.local | cut -d= -f2)
npx supabase gen types typescript --project-id "$PROJECT_ID" > src/types/database.ts
```

If the CLI complains about a missing access token, run `npx supabase login` first. The access token is stored globally; only needed once per machine.

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean. If there are type errors anywhere else in the repo that reference `Database['public']['Tables']`, they surface here — investigate and fix before committing.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "chore: regenerate Database types from real Supabase project"
```

---

## Task 7: Application-level types

**Files:**
- Create: `src/types/contractor.ts`
- Create: `src/types/catalog.ts`

- [ ] **Step 1: `src/types/contractor.ts`**

```ts
import type { Database } from "@/types/database";

export type ContractorRow = Database["public"]["Tables"]["contractors"]["Row"];
export type ContractorInsert = Database["public"]["Tables"]["contractors"]["Insert"];
export type ContractorUpdate = Database["public"]["Tables"]["contractors"]["Update"];

export type CustomerView = "detailed" | "summary";

export type ContractorProfile = {
  id: string;
  companyName: string;
  phone: string | null;
  address: string | null;
  regionCode: string;
  regionMultiplier: number;
  defaultLaborRate: number;
  defaultMarginPct: number;
  defaultCustomerView: CustomerView;
  logoStoragePath: string | null;
  onboardedAt: Date | null;
};

export function contractorRowToProfile(row: ContractorRow): ContractorProfile {
  return {
    id: row.id,
    companyName: row.company_name ?? "",
    phone: row.phone,
    address: row.address,
    regionCode: row.region_code ?? "",
    regionMultiplier: row.region_multiplier == null ? 1 : Number(row.region_multiplier),
    defaultLaborRate: row.default_labor_rate == null ? 0 : Number(row.default_labor_rate),
    defaultMarginPct: row.default_margin_pct == null ? 0 : Number(row.default_margin_pct),
    defaultCustomerView: (row.default_customer_view as CustomerView | null) ?? "detailed",
    logoStoragePath: row.logo_storage_path,
    onboardedAt: row.onboarded_at ? new Date(row.onboarded_at) : null,
  };
}
```

- [ ] **Step 2: `src/types/catalog.ts`**

```ts
import type { Database } from "@/types/database";

export type HouseCatalogRow = Database["public"]["Tables"]["house_catalog"]["Row"];
export type ContractorCatalogRow = Database["public"]["Tables"]["contractor_catalog"]["Row"];

export type Tier = "good" | "better" | "best";
export type CatalogUnit = "each" | "ft" | "lb" | "job";
export type CatalogSource = "seed" | "custom";

export type CatalogItem = {
  id: string;
  slot: string;
  customerCategory: string;
  tier: Tier | null;
  name: string;
  unit: CatalogUnit;
  defaultQuantity: number | null;
  priceLow: number;
  priceMid: number;
  priceHigh: number;
  notes: string | null;
  isActive: boolean;
  source: CatalogSource;
};

export function catalogRowToItem(row: ContractorCatalogRow): CatalogItem {
  return {
    id: row.id,
    slot: row.slot,
    customerCategory: row.customer_category,
    tier: row.tier as Tier | null,
    name: row.name,
    unit: row.unit as CatalogUnit,
    defaultQuantity: row.default_quantity == null ? null : Number(row.default_quantity),
    priceLow: Number(row.price_low),
    priceMid: Number(row.price_mid),
    priceHigh: Number(row.price_high),
    notes: row.notes,
    isActive: row.is_active,
    source: row.source as CatalogSource,
  };
}
```

- [ ] **Step 3: Verify compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/types/contractor.ts src/types/catalog.ts
git commit -m "feat(types): contractor + catalog domain types + row mappers"
```

---

## Task 8: Region multipliers constant

**Files:**
- Create: `src/lib/catalog/region-multipliers.ts`

- [ ] **Step 1: Write the file**

```ts
// src/lib/catalog/region-multipliers.ts

// POC: hardcoded region codes + multipliers. Refine from customer feedback.
// Multipliers are applied once at seed time against the national prices in
// house_catalog. Contractors can always edit individual rows after seed.

export type RegionOption = {
  code: string;
  label: string;
  multiplier: number;
};

export const REGIONS: readonly RegionOption[] = [
  { code: "US-SOUTH-CENTRAL", label: "South Central (OK, TX, AR, LA)", multiplier: 0.92 },
  { code: "US-SOUTHEAST",    label: "Southeast (FL, GA, AL, SC, NC, TN)", multiplier: 0.96 },
  { code: "US-MIDWEST",      label: "Midwest (MO, IL, IN, OH, KS, NE, IA)", multiplier: 0.98 },
  { code: "US-MOUNTAIN",     label: "Mountain (CO, UT, AZ, NM)",          multiplier: 1.02 },
  { code: "US-WEST",         label: "West (CA, OR, WA, NV)",              multiplier: 1.18 },
  { code: "US-NORTHEAST",    label: "Northeast (NY, NJ, PA, MA, CT)",     multiplier: 1.22 },
  { code: "US-NEW-ENGLAND",  label: "New England (ME, NH, VT, RI)",       multiplier: 1.14 },
  { code: "US-MID-ATLANTIC", label: "Mid-Atlantic (VA, MD, DE, WV, DC)",  multiplier: 1.06 },
  { code: "US-UPPER-MIDWEST",label: "Upper Midwest (MN, WI, MI, ND, SD)", multiplier: 1.04 },
  { code: "US-OTHER",        label: "Other / Default",                    multiplier: 1.00 },
] as const;

export function multiplierForCode(code: string): number {
  return REGIONS.find((r) => r.code === code)?.multiplier ?? 1.0;
}
```

- [ ] **Step 2: Verify compile + commit**

```bash
npx tsc --noEmit
git add src/lib/catalog/region-multipliers.ts
git commit -m "feat(catalog): region multipliers lookup (POC: 10 US regions)"
```

---

## Task 9: Onboarding server action

**Files:**
- Create: `src/lib/contractors/actions.ts`

- [ ] **Step 1: Write the server action**

```ts
// src/lib/contractors/actions.ts
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { multiplierForCode, REGIONS } from "@/lib/catalog/region-multipliers";

const OnboardingSchema = z.object({
  company_name: z.string().trim().min(1, "Company name required").max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  region_code: z.enum(REGIONS.map((r) => r.code) as [string, ...string[]]),
  default_labor_rate: z.coerce.number().positive().max(500),
  default_margin_pct: z.coerce.number().min(0).max(100),
  default_customer_view: z.enum(["detailed", "summary"]),
});

export type OnboardingFormState = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
};

export async function completeOnboarding(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const parsed = OnboardingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString() ?? "_";
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, message: "Please fix the highlighted fields." };
  }

  const data = parsed.data;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const regionMultiplier = multiplierForCode(data.region_code);

  // Upsert the contractors row (may be first time)
  const { error: upsertError } = await supabase.from("contractors").upsert(
    {
      id: user.id,
      company_name: data.company_name,
      phone: data.phone || null,
      address: data.address || null,
      region_code: data.region_code,
      region_multiplier: regionMultiplier,
      default_labor_rate: data.default_labor_rate,
      default_margin_pct: data.default_margin_pct,
      default_customer_view: data.default_customer_view,
      onboarded_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (upsertError) {
    return { ok: false, message: `Save failed: ${upsertError.message}` };
  }

  // Seed the contractor's catalog (idempotent)
  const { error: rpcError } = await supabase.rpc("seed_contractor_catalog", {
    p_contractor_id: user.id,
    p_region_multiplier: regionMultiplier,
  });
  if (rpcError) {
    return { ok: false, message: `Catalog seed failed: ${rpcError.message}` };
  }

  redirect("/dashboard");
}

export async function updateContractor(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const parsed = OnboardingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString() ?? "_";
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, message: "Please fix the highlighted fields." };
  }

  const data = parsed.data;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  // Update but do NOT overwrite onboarded_at. Do NOT re-seed catalog
  // (contractor may have edited it; region changes are handled explicitly
  // in a future task — for POC we leave their catalog alone).
  const { error } = await supabase.from("contractors").update({
    company_name: data.company_name,
    phone: data.phone || null,
    address: data.address || null,
    region_code: data.region_code,
    region_multiplier: multiplierForCode(data.region_code),
    default_labor_rate: data.default_labor_rate,
    default_margin_pct: data.default_margin_pct,
    default_customer_view: data.default_customer_view,
  }).eq("id", user.id);

  if (error) return { ok: false, message: `Save failed: ${error.message}` };

  return { ok: true, message: "Saved." };
}
```

- [ ] **Step 2: Compile check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/contractors/actions.ts
git commit -m "feat(contractors): completeOnboarding + updateContractor server actions"
```

---

## Task 10: Middleware — redirect to /onboarding when `onboarded_at` is NULL

**Files:**
- Modify: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Replace the middleware with this version**

```ts
// src/lib/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  const protectedPaths = ["/dashboard", "/estimates", "/settings", "/catalog", "/onboarding"];
  if (!user && protectedPaths.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Onboarding redirect: if user is authed but hasn't completed onboarding,
  // force them to /onboarding for anything except /onboarding itself,
  // /auth/*, /api/*, or /q/* (public share routes).
  if (
    user &&
    !path.startsWith("/onboarding") &&
    !path.startsWith("/auth") &&
    !path.startsWith("/api") &&
    !path.startsWith("/q/")
  ) {
    const { data: profile } = await supabase
      .from("contractors")
      .select("onboarded_at")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.onboarded_at === null) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
```

- [ ] **Step 2: Verify compile + lint**

```bash
npx tsc --noEmit && npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "feat(middleware): redirect unboarded users to /onboarding"
```

---

## Task 11: Onboarding form UI

**Files:**
- Create: `src/components/onboarding/onboarding-form.tsx` (client component — useActionState + form)
- Create: `src/app/onboarding/page.tsx` (server component — renders the form, prefills from existing contractors row if any)

- [ ] **Step 1: Install additional shadcn primitives**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx shadcn@latest add select textarea
```

Answer "no" if it prompts to overwrite `utils.ts` or `globals.css`.

- [ ] **Step 2: Write the form client component**

```tsx
// src/components/onboarding/onboarding-form.tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REGIONS } from "@/lib/catalog/region-multipliers";
import type { OnboardingFormState } from "@/lib/contractors/actions";
import type { ContractorProfile } from "@/types/contractor";

type Action = (
  state: OnboardingFormState,
  formData: FormData,
) => Promise<OnboardingFormState>;

type Props = {
  action: Action;
  initial?: Partial<ContractorProfile>;
  submitLabel: string;
};

export function OnboardingForm({ action, initial, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState<OnboardingFormState, FormData>(
    action,
    { ok: true },
  );

  const err = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-6 max-w-2xl">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Company</h2>
        <div className="space-y-2">
          <Label htmlFor="company_name">Company name</Label>
          <Input
            id="company_name"
            name="company_name"
            defaultValue={initial?.companyName ?? ""}
            required
            autoComplete="organization"
          />
          {err.company_name && <p className="text-sm text-destructive">{err.company_name}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" defaultValue={initial?.phone ?? ""} autoComplete="tel" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              name="address"
              rows={2}
              defaultValue={initial?.address ?? ""}
              autoComplete="street-address"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Defaults</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="default_labor_rate">Labor rate ($/hr)</Label>
            <Input
              id="default_labor_rate"
              name="default_labor_rate"
              type="number"
              step="0.5"
              min="0"
              max="500"
              defaultValue={initial?.defaultLaborRate ?? 95}
              required
            />
            {err.default_labor_rate && <p className="text-sm text-destructive">{err.default_labor_rate}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="default_margin_pct">Target margin (%)</Label>
            <Input
              id="default_margin_pct"
              name="default_margin_pct"
              type="number"
              step="1"
              min="0"
              max="100"
              defaultValue={initial?.defaultMarginPct ?? 35}
              required
            />
            {err.default_margin_pct && <p className="text-sm text-destructive">{err.default_margin_pct}</p>}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Customer proposal view (default)</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="default_customer_view"
                value="detailed"
                defaultChecked={(initial?.defaultCustomerView ?? "detailed") === "detailed"}
              />
              Detailed
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="default_customer_view"
                value="summary"
                defaultChecked={initial?.defaultCustomerView === "summary"}
              />
              Summary
            </label>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Region</h2>
        <div className="space-y-2">
          <Label htmlFor="region_code">Service region</Label>
          <Select name="region_code" defaultValue={initial?.regionCode ?? "US-SOUTH-CENTRAL"}>
            <SelectTrigger id="region_code">
              <SelectValue placeholder="Choose region" />
            </SelectTrigger>
            <SelectContent>
              {REGIONS.map((r) => (
                <SelectItem key={r.code} value={r.code}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {err.region_code && <p className="text-sm text-destructive">{err.region_code}</p>}
          <p className="text-xs text-muted-foreground">
            Region sets a one-time multiplier on the starter catalog. You can edit individual prices after.
          </p>
        </div>
      </section>

      {state.message && !state.ok && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
      {state.message && state.ok && state.errors === undefined && (
        <p className="text-sm text-green-600">{state.message}</p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Write `/onboarding/page.tsx`**

```tsx
// src/app/onboarding/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contractorRowToProfile } from "@/types/contractor";
import { completeOnboarding } from "@/lib/contractors/actions";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: row } = await supabase
    .from("contractors")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // If already onboarded, bounce to dashboard
  if (row?.onboarded_at) redirect("/dashboard");

  const initial = row ? contractorRowToProfile(row) : undefined;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Welcome to coolbid</h1>
          <p className="text-muted-foreground">
            Three quick fields and you&apos;re ready to send your first proposal.
          </p>
        </div>
        <OnboardingForm action={completeOnboarding} initial={initial} submitLabel="Finish setup" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Compile + lint**

```bash
npx tsc --noEmit && npm run lint
```

- [ ] **Step 5: Verify the page renders (logged-out redirects to login; logged-in unboarded renders form)**

The browser smoke happens in Task 13. For now just build:

```bash
npm run build
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/onboarding/ src/app/onboarding/ package.json package-lock.json src/components/ui/select.tsx src/components/ui/textarea.tsx
git commit -m "feat(onboarding): 3-section form + page (company, defaults, region)"
```

---

## Task 12: Settings page (same form, update action)

**Files:**
- Modify: `src/app/(app)/settings/page.tsx` (replace placeholder)

- [ ] **Step 1: Replace the placeholder**

```tsx
// src/app/(app)/settings/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contractorRowToProfile } from "@/types/contractor";
import { updateContractor } from "@/lib/contractors/actions";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: row } = await supabase
    .from("contractors")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!row) redirect("/onboarding");
  const initial = contractorRowToProfile(row);

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>
      <OnboardingForm action={updateContractor} initial={initial} submitLabel="Save changes" />
    </div>
  );
}
```

- [ ] **Step 2: Compile + build**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/settings/page.tsx
git commit -m "feat(settings): replace placeholder with onboarding form + update action"
```

---

## Task 13: End-to-end smoke verification

This is the manual/semi-manual verification pass. We prove:
- Signup → /onboarding redirect works
- Onboarding submit writes the profile + seeds the catalog
- Dashboard is reachable after onboarding
- Settings page updates the profile without clobbering the catalog
- `contractor_catalog` has 35 rows per contractor, region-adjusted

- [ ] **Step 1: Boot dev server**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npm run dev &> /tmp/coolbid-poc-dev.log &
DEV_PID=$!
sleep 5
PORT=$(grep -oP 'http://localhost:\K[0-9]+' /tmp/coolbid-poc-dev.log | head -1)
echo "Dev server on port $PORT"
```

- [ ] **Step 2: Create a smoke user via Admin API**

```bash
SUPABASE_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2)
SERVICE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2)

TEST_EMAIL="smoketest-$(date +%s)@coolbid-poc.invalid"
TEST_PASSWORD="SmokeTest-$(openssl rand -hex 4)"

SIGNUP=$(curl -sX POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"email_confirm\":true}")
USER_ID=$(echo "$SIGNUP" | grep -oP '"id":"\K[^"]+' | head -1)
echo "Created user $USER_ID"
```

- [ ] **Step 3: Sign in via password + capture session cookie**

This is where we need a real browser-ish flow. Simplest path: use the public auth endpoint to get an access token, then use it to call our `/api/...` endpoints. But we have none yet. Alternative: call the RPC directly as that user to simulate onboarding submit.

```bash
ANON_KEY=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2)
TOKEN_JSON=$(curl -sX POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")
ACCESS_TOKEN=$(echo "$TOKEN_JSON" | grep -oP '"access_token":"\K[^"]+')
echo "Token acquired"
```

- [ ] **Step 4: Simulate onboarding submit via REST** — upsert contractors row + call RPC

```bash
# Upsert contractor profile
curl -sX POST "$SUPABASE_URL/rest/v1/contractors" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  -d "{
    \"id\":\"$USER_ID\",
    \"company_name\":\"Smoke HVAC\",
    \"region_code\":\"US-SOUTH-CENTRAL\",
    \"region_multiplier\":0.92,
    \"default_labor_rate\":95,
    \"default_margin_pct\":35,
    \"default_customer_view\":\"detailed\",
    \"onboarded_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
  }"

# Seed their catalog
curl -sX POST "$SUPABASE_URL/rest/v1/rpc/seed_contractor_catalog" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"p_contractor_id\":\"$USER_ID\",\"p_region_multiplier\":0.92}"
```

Expected: first call returns the inserted row (or empty with 201); second call returns `35` (rows inserted).

- [ ] **Step 5: Verify catalog populated**

```bash
curl -s "$SUPABASE_URL/rest/v1/contractor_catalog?contractor_id=eq.$USER_ID&select=count" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Prefer: count=exact"
```

Expected: response header or body indicates 35 rows.

- [ ] **Step 6: Verify region-multiplier applied**

```bash
curl -s "$SUPABASE_URL/rest/v1/contractor_catalog?contractor_id=eq.$USER_ID&slot=eq.permits.permit_fee&select=price_mid" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Expected: `price_mid ≈ 175 * 0.92 = 161.00`.

- [ ] **Step 7: Call seed again — verify idempotent**

```bash
curl -sX POST "$SUPABASE_URL/rest/v1/rpc/seed_contractor_catalog" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"p_contractor_id\":\"$USER_ID\",\"p_region_multiplier\":0.92}"
```

Expected: returns `0` (no rows inserted, already seeded).

- [ ] **Step 8: Cleanup**

```bash
kill $DEV_PID 2>/dev/null
curl -sX DELETE "$SUPABASE_URL/auth/v1/admin/users/$USER_ID" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY"
```

The delete cascades to contractors and contractor_catalog via FK `on delete cascade`.

- [ ] **Step 9: Production build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 10: Update signup redirect**

Check `src/app/auth/signup/page.tsx` — after successful signup, the middleware's onboarding redirect should send new users to `/onboarding` automatically. Verify by reading the file. If the current `router.push("/dashboard")` happens BEFORE the middleware gets a chance to intercept (race condition), change it to `router.push("/onboarding")` directly.

If changed, commit:

```bash
git add src/app/auth/signup/page.tsx
git commit -m "fix(signup): redirect new users to /onboarding directly"
```

- [ ] **Step 11: Merge to main**

```bash
git checkout main
git merge --no-ff feature/plan-2-schema-onboarding-settings -m "feat: complete Plan 2 — schema, onboarding, settings"
git branch -d feature/plan-2-schema-onboarding-settings
```

- [ ] **Step 12: Report**

Include: smoke step results, build summary, final git log, any concerns.

---

## Plan 2 Done — what works now

✅ New contractor can sign up, gets bounced to `/onboarding` by the middleware
✅ Onboarding form captures company/defaults/region, writes to `contractors`, seeds 35 catalog rows with region multiplier
✅ Settings page renders the same form, updates the profile without re-seeding
✅ `contractor_catalog` table exists with RLS isolation per contractor
✅ All migrations applied against the hosted Supabase project
✅ Types regenerated

## What's intentionally missing (added in later plans)

- ❌ `/catalog` page (Plan 3 — editable catalog table)
- ❌ Estimates/BOM/labor/share_tokens tables (Plan 4)
- ❌ Region-change "re-seed?" confirm dialog (fast-follow)
- ❌ Logo upload (fast-follow — field exists, UI not wired)

## Next: Plan 3 — Catalog Editor
