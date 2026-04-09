# Parts Database V2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded parts with a user-owned equipment catalog — seeded from supplier-specific starter kits, progressively enriched by AI-parsed supplier quotes.

**Architecture:** New Supabase tables (suppliers, equipment_catalog, quotes, quote_lines, price_history) with RLS. Onboarding flow seeds starter data per selected supplier. Quote upload sends PDFs to Claude Vision via `/api/parse-quote`. BOM generator refactored to query catalog instead of hardcoded PARTS_DB. System type (heat pump/gas/electric/dual fuel) determines equipment selection.

**Tech Stack:** Supabase (PostgreSQL + RLS + Storage), Anthropic SDK (Claude Vision for quote parsing), Next.js API routes, React components with Zustand state

**Spec:** `docs/superpowers/specs/2026-04-08-parts-database-v2-design.md`

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/002_parts_database.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 002_parts_database.sql
-- Parts Database V2: suppliers, equipment catalog, quotes, quote lines, price history

-- ============================================================
-- ALTER EXISTING TABLES
-- ============================================================
alter table public.profiles add column if not exists onboarding_completed boolean default false;

alter table public.estimates add column if not exists system_type text default 'gas_ac'
  check (system_type in ('heat_pump', 'gas_ac', 'electric', 'dual_fuel'));

-- ============================================================
-- SUPPLIERS
-- ============================================================
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  contact_email text default '',
  contact_phone text default '',
  brands text[] default '{}',
  is_starter boolean default false,
  created_at timestamptz default now()
);

alter table public.suppliers enable row level security;
create policy "Users can CRUD own suppliers" on public.suppliers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_suppliers_user_id on public.suppliers(user_id);

-- ============================================================
-- EQUIPMENT CATALOG
-- ============================================================
create table public.equipment_catalog (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  model_number text not null,
  description text not null,
  equipment_type text not null,
  system_type text default 'universal',
  brand text default '',
  tonnage numeric,
  seer_rating numeric,
  btu_capacity numeric,
  stages int,
  refrigerant_type text,
  unit_price numeric,
  unit_of_measure text default 'ea',
  source text not null default 'starter' check (source in ('starter', 'quote', 'manual')),
  usage_count int default 0,
  last_quoted_date timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.equipment_catalog enable row level security;
create policy "Users can CRUD own catalog" on public.equipment_catalog for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_catalog_user_type_tonnage on public.equipment_catalog(user_id, equipment_type, tonnage);
create index idx_catalog_user_id on public.equipment_catalog(user_id);
create index idx_catalog_supplier_id on public.equipment_catalog(supplier_id);

create trigger set_updated_at before update on public.equipment_catalog
  for each row execute function public.update_updated_at();

-- ============================================================
-- QUOTES
-- ============================================================
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  quote_number text default '',
  quote_date date,
  subtotal numeric,
  tax numeric,
  total numeric,
  file_name text not null,
  storage_path text default '',
  status text not null default 'parsed' check (status in ('parsed', 'reviewing', 'saved')),
  created_at timestamptz default now()
);

alter table public.quotes enable row level security;
create policy "Users can CRUD own quotes" on public.quotes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_quotes_user_id on public.quotes(user_id);
create index idx_quotes_supplier_id on public.quotes(supplier_id);

-- ============================================================
-- QUOTE LINES
-- ============================================================
create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  catalog_item_id uuid references public.equipment_catalog(id) on delete set null,
  model_number text default '',
  description text not null,
  equipment_type text default '',
  brand text default '',
  tonnage numeric,
  seer_rating numeric,
  btu_capacity numeric,
  stages int,
  refrigerant_type text,
  quantity numeric default 1,
  unit_price numeric,
  extended_price numeric,
  selected boolean default true,
  created_at timestamptz default now()
);

alter table public.quote_lines enable row level security;
create policy "Users can CRUD own quote lines" on public.quote_lines for all
  using (exists (select 1 from public.quotes where quotes.id = quote_lines.quote_id and quotes.user_id = auth.uid()));
create index idx_quote_lines_quote_id on public.quote_lines(quote_id);
create index idx_quote_lines_catalog_item_id on public.quote_lines(catalog_item_id);

-- ============================================================
-- PRICE HISTORY
-- ============================================================
create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.equipment_catalog(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  price numeric not null,
  quote_date date,
  quote_id uuid references public.quotes(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.price_history enable row level security;
create policy "Users can CRUD own price history" on public.price_history for all
  using (exists (select 1 from public.equipment_catalog where equipment_catalog.id = price_history.catalog_item_id and equipment_catalog.user_id = auth.uid()));
create index idx_price_history_catalog_item_id on public.price_history(catalog_item_id);

-- Trigger: update catalog unit_price on new price_history entry
create or replace function public.update_catalog_price()
returns trigger as $$
begin
  update public.equipment_catalog
  set unit_price = new.price,
      last_quoted_date = new.quote_date,
      updated_at = now()
  where id = new.catalog_item_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_price_history_insert
  after insert on public.price_history
  for each row execute function public.update_catalog_price();
```

- [ ] **Step 2: Run migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_parts_database.sql
git commit -m "feat: add parts database migration — suppliers, catalog, quotes, price history"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `src/types/catalog.ts`
- Modify: `src/types/hvac.ts`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Create catalog types**

Create `src/types/catalog.ts`:

```typescript
export type SystemType = "heat_pump" | "gas_ac" | "electric" | "dual_fuel";

export type EquipmentType =
  | "ac_condenser"
  | "heat_pump_condenser"
  | "gas_furnace"
  | "air_handler"
  | "heat_strips"
  | "evap_coil"
  | "thermostat"
  | "ductwork"
  | "register"
  | "grille"
  | "refrigerant"
  | "electrical"
  | "installation";

export type CatalogSource = "starter" | "quote" | "manual";

export type Supplier = {
  id: string;
  user_id: string;
  name: string;
  contact_email: string;
  contact_phone: string;
  brands: string[];
  is_starter: boolean;
  created_at: string;
};

export type CatalogItem = {
  id: string;
  user_id: string;
  supplier_id: string | null;
  model_number: string;
  description: string;
  equipment_type: EquipmentType;
  system_type: SystemType | "universal";
  brand: string;
  tonnage: number | null;
  seer_rating: number | null;
  btu_capacity: number | null;
  stages: number | null;
  refrigerant_type: string | null;
  unit_price: number | null;
  unit_of_measure: string;
  source: CatalogSource;
  usage_count: number;
  last_quoted_date: string | null;
  created_at: string;
  updated_at: string;
  supplier?: Supplier;
};

export type Quote = {
  id: string;
  user_id: string;
  supplier_id: string | null;
  quote_number: string;
  quote_date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  file_name: string;
  storage_path: string;
  status: "parsed" | "reviewing" | "saved";
  created_at: string;
  supplier?: Supplier;
};

export type QuoteLine = {
  id: string;
  quote_id: string;
  catalog_item_id: string | null;
  model_number: string;
  description: string;
  equipment_type: string;
  brand: string;
  tonnage: number | null;
  seer_rating: number | null;
  btu_capacity: number | null;
  stages: number | null;
  refrigerant_type: string | null;
  quantity: number;
  unit_price: number | null;
  extended_price: number | null;
  selected: boolean;
};

export type PriceHistoryEntry = {
  id: string;
  catalog_item_id: string;
  supplier_id: string | null;
  price: number;
  quote_date: string | null;
  quote_id: string | null;
  created_at: string;
};

export type ParsedQuoteResult = {
  supplier_name: string;
  quote_number: string;
  quote_date: string;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  line_items: ParsedLineItem[];
};

export type ParsedLineItem = {
  model_number: string;
  description: string;
  equipment_type: EquipmentType;
  brand: string;
  tonnage: number | null;
  seer_rating: number | null;
  btu_capacity: number | null;
  stages: number | null;
  refrigerant_type: string | null;
  quantity: number;
  unit_price: number | null;
  extended_price: number | null;
};

// Equipment needed per system type
export const SYSTEM_TYPE_EQUIPMENT: Record<SystemType, EquipmentType[]> = {
  heat_pump: ["heat_pump_condenser", "air_handler", "heat_strips"],
  gas_ac: ["ac_condenser", "gas_furnace", "evap_coil"],
  electric: ["ac_condenser", "air_handler", "heat_strips"],
  dual_fuel: ["heat_pump_condenser", "gas_furnace"],
};

export const SYSTEM_TYPE_LABELS: Record<SystemType, string> = {
  heat_pump: "Heat Pump",
  gas_ac: "Gas / AC Split",
  electric: "Electric",
  dual_fuel: "Dual Fuel (Heat Pump + Gas)",
};

export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  ac_condenser: "AC Condenser",
  heat_pump_condenser: "Heat Pump Condenser",
  gas_furnace: "Gas Furnace",
  air_handler: "Air Handler",
  heat_strips: "Heat Strips",
  evap_coil: "Evaporator Coil",
  thermostat: "Thermostat",
  ductwork: "Ductwork",
  register: "Register",
  grille: "Grille",
  refrigerant: "Refrigerant",
  electrical: "Electrical",
  installation: "Installation",
};
```

- [ ] **Step 2: Add SystemType to hvac.ts**

Add to `src/types/hvac.ts`:

```typescript
export type { SystemType } from "./catalog";
```

And update `BomItem` to expand the source type:

```typescript
export type BomItem = {
  partId: string;
  name: string;
  category: string;
  qty: number;
  unit: string;
  price: number | null;
  supplier: string;
  sku: string;
  notes: string;
  source: "starter" | "quote" | "manual" | "missing";
  brand: string;
};
```

- [ ] **Step 3: Update database.ts**

Add the new table types to `src/types/database.ts` — suppliers, equipment_catalog, quotes, quote_lines, price_history Row/Insert/Update types. Also add `onboarding_completed` to profiles and `system_type` to estimates.

Read the existing file structure and follow the same pattern (Row, Insert, Update, Relationships) used by the existing table types.

- [ ] **Step 4: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/types/catalog.ts src/types/hvac.ts src/types/database.ts
git commit -m "feat: add catalog, supplier, quote types and system type support"
```

---

## Task 3: Starter Kit Data

**Files:**
- Create: `src/lib/hvac/starter-kits.ts`
- Modify: `src/lib/hvac/parts-db.ts` — keep LOAD_FACTORS and ROOM_TYPES exports, PARTS_DB stays but is only used for seeding non-equipment items

- [ ] **Step 1: Research equipment model numbers**

Use web search to find current residential HVAC model numbers for these brands at sizes 2T, 2.5T, 3T, 3.5T, 4T, 5T:

| Supplier | Brands |
|----------|--------|
| Johnstone Supply | Goodman, Daikin |
| Sanders Supply | Carrier, Bryant, Tempstar |
| Shearer Supply | Lennox |
| Locke Supply | Goodman, Rheem, Ruud |
| Amsco Supply | Rheem, Ruud, York |

For each brand, need: AC condensers, heat pump condensers, air handlers, gas furnaces (60K/80K/100K BTU), evaporator coils, and one thermostat.

- [ ] **Step 2: Create starter-kits.ts**

Create `src/lib/hvac/starter-kits.ts` with this structure:

```typescript
import type { EquipmentType, SystemType } from "@/types/catalog";

export type StarterEquipment = {
  model_number: string;
  description: string;
  equipment_type: EquipmentType;
  system_type: SystemType | "universal";
  brand: string;
  tonnage: number | null;
  seer_rating: number | null;
  btu_capacity: number | null;
  unit_price: number | null;
  unit_of_measure: string;
};

export type StarterSupplier = {
  name: string;
  brands: string[];
  equipment: StarterEquipment[];
};

export const STARTER_SUPPLIERS: StarterSupplier[] = [
  {
    name: "Johnstone Supply",
    brands: ["Goodman", "Daikin"],
    equipment: [
      // Goodman AC condensers
      { model_number: "GSX140241", description: "Goodman 2-Ton 14 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Goodman", tonnage: 2, seer_rating: 14, btu_capacity: 24000, unit_price: 1650, unit_of_measure: "ea" },
      // ... all sizes for all brands for this supplier
    ],
  },
  // ... other suppliers
];

// Brand-agnostic items seeded for all users
export const UNIVERSAL_STARTER_ITEMS: StarterEquipment[] = [
  // Ductwork, registers, grilles, refrigerant, electrical, installation
  // These come from the current PARTS_DB non-equipment items
  { model_number: "SM0812", description: '8"x12" Sheet Metal Trunk', equipment_type: "ductwork", system_type: "universal", brand: "Local Sheet Metal", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 12.50, unit_of_measure: "ft" },
  // ... all non-equipment items from current PARTS_DB
];
```

Populate with researched model numbers. For brands where exact models aren't available, use the brand's known naming convention. Include approximate pricing based on typical contractor/wholesale pricing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hvac/starter-kits.ts
git commit -m "feat: add supplier-specific starter kit data with real model numbers"
```

---

## Task 4: Onboarding Page

**Files:**
- Create: `src/app/(app)/onboarding/page.tsx`
- Create: `src/components/onboarding/supplier-select.tsx`
- Modify: `src/lib/supabase/middleware.ts` — add onboarding redirect

- [ ] **Step 1: Create supplier select component**

Create `src/components/onboarding/supplier-select.tsx`:

A "use client" component showing a multi-select grid of the 5 starter suppliers. Each card shows supplier name and brands carried. Clicking toggles selection (border-primary + bg-primary/5 when selected). An "Other" card with a text input for custom supplier name. Props: `onComplete(selectedSuppliers: string[], customSupplier?: string)`.

- [ ] **Step 2: Create onboarding page**

Create `src/app/(app)/onboarding/page.tsx`:

A "use client" page with:
- Heading: "Welcome to CoolBid" / "Who are your suppliers?"
- `SupplierSelect` component
- "Continue" button: creates supplier records in Supabase, seeds equipment_catalog with selected suppliers' starter kits + universal items, sets `profiles.onboarding_completed = true`, redirects to `/dashboard`
- "Skip for now" link: sets onboarding_completed = true, no data seeded, redirects to /dashboard
- The seeding logic: for each selected supplier, look up `STARTER_SUPPLIERS` by name, insert supplier record, then insert all equipment entries for that supplier into equipment_catalog with source="starter". Always insert UNIVERSAL_STARTER_ITEMS.

- [ ] **Step 3: Update middleware for onboarding redirect**

Modify `src/lib/supabase/middleware.ts`:

After the auth check, for authenticated users on any app route (not `/onboarding` itself), check if `onboarding_completed` is false by querying the profiles table. If false, redirect to `/onboarding`. Cache-friendly: only check on `/dashboard`, `/estimates`, `/settings`, `/parts-database` routes, not on API routes.

Note: This requires a Supabase query in middleware. To avoid a DB call on every request, check for a cookie flag `onboarding_done=true` first. Set this cookie when onboarding completes. Only hit the DB if the cookie is missing.

- [ ] **Step 4: Verify compilation and test flow**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/onboarding/ src/components/onboarding/ src/lib/supabase/middleware.ts
git commit -m "feat: add onboarding flow with supplier selection and catalog seeding"
```

---

## Task 5: System Type in Estimator

**Files:**
- Modify: `src/hooks/use-estimator.ts` — add systemType state
- Modify: `src/components/estimator/upload-step.tsx` — add system type select

- [ ] **Step 1: Add systemType to Zustand store**

In `src/hooks/use-estimator.ts`, add to state:

```typescript
systemType: SystemType;  // import from @/types/catalog
```

Default: `"gas_ac"`. Add to `setBuildingInfo` partial type. Add to `initialState`. Add to `reset`.

- [ ] **Step 2: Add system type select to upload step**

In `src/components/estimator/upload-step.tsx`, add a select field in the Building Info card after Climate Zone:

```tsx
<div className="space-y-1.5">
  <Label htmlFor="system-type">System Type</Label>
  <Select
    value={systemType}
    onValueChange={(val) => setBuildingInfo({ systemType: val as SystemType })}
  >
    <SelectTrigger id="system-type" className="w-full">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {Object.entries(SYSTEM_TYPE_LABELS).map(([key, label]) => (
        <SelectItem key={key} value={key}>{label}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

Import `SYSTEM_TYPE_LABELS` from `@/types/catalog` and `SystemType`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-estimator.ts src/components/estimator/upload-step.tsx
git commit -m "feat: add system type selection to estimator upload step"
```

---

## Task 6: Refactor BOM Generator

**Files:**
- Modify: `src/lib/hvac/bom-generator.ts` — take catalog parameter, select equipment from catalog
- Modify: `src/types/hvac.ts` — update BomItem type

- [ ] **Step 1: Update BomItem type**

In `src/types/hvac.ts`, update `BomItem`:

```typescript
export type BomItem = {
  partId: string;
  name: string;
  category: string;
  qty: number;
  unit: string;
  price: number | null;
  supplier: string;
  sku: string;
  notes: string;
  source: "starter" | "quote" | "manual" | "missing";
  brand: string;
};
```

Note: `price` is now `number | null` (catalog items may not have prices). Added `brand`. Changed `source` union.

- [ ] **Step 2: Refactor generateBOM**

Rewrite `src/lib/hvac/bom-generator.ts`:

New signature:
```typescript
import type { CatalogItem, SystemType, EquipmentType } from "@/types/catalog";
import { SYSTEM_TYPE_EQUIPMENT } from "@/types/catalog";

export function generateBOM(
  rooms: Room[],
  climateZone: ClimateZoneKey,
  systemType: SystemType,
  catalog: CatalogItem[],
  building?: BuildingInfo,
  hvacNotes?: HvacNotes,
): BomResult
```

Equipment selection logic:
1. Determine needed equipment types from `SYSTEM_TYPE_EQUIPMENT[systemType]`
2. For each type, find catalog entries matching: `equipment_type` + `tonnage` ±0.5 ton + compatible `system_type` (matches or "universal")
3. Sort by: source priority ("quote" > "manual" > "starter"), then usage_count DESC
4. Use top match. If no match, create a BomItem with source="missing" and notes="No matching equipment — add to catalog or upload a quote"

For non-equipment items (ductwork, registers, etc.), same logic as before but pulling from catalog entries with those equipment_types. Same sizing formulas (trunk length from condSqft, flex from totalRegs, etc.).

The `add()` helper changes from looking up `PARTS_DB[id]` to looking up `catalog.find(c => c.equipment_type === type && matchesTonnage(c, tonnage))`.

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/hvac/bom-generator.ts src/types/hvac.ts
git commit -m "feat: refactor BOM generator to use equipment catalog instead of hardcoded parts"
```

---

## Task 7: BOM Step + Estimator Store Updates

**Files:**
- Modify: `src/hooks/use-estimator.ts` — fetch catalog before generating BOM
- Modify: `src/components/estimator/bom-step.tsx` — show source badges, handle null prices

- [ ] **Step 1: Update Zustand store**

In `src/hooks/use-estimator.ts`:

The `generateBom` action becomes async. It must fetch the user's catalog from Supabase before calling `generateBOM`. Add a `catalog` state field (or fetch inline).

```typescript
generateBom: async () => {
  const { rooms, climateZone, systemType, analysisResult } = get();
  set({ error: null });
  try {
    const supabase = createClient();
    const { data: catalog } = await supabase
      .from("equipment_catalog")
      .select("*, supplier:suppliers(*)")
      .order("usage_count", { ascending: false });

    const bom = generateBOM(
      rooms,
      climateZone,
      systemType,
      catalog ?? [],
      analysisResult?.building,
      analysisResult?.hvac_notes,
    );
    set({ bom, step: "bom" });
  } catch (err) {
    set({ error: err instanceof Error ? err.message : "Failed to generate BOM" });
  }
},
```

Import `createClient` from `@/lib/supabase/client`.

- [ ] **Step 2: Update BOM step component**

In `src/components/estimator/bom-step.tsx`:

- Handle `item.price === null` — display "RFQ" or "—" instead of $0
- Show source badge per item: "Starter" (gray), "Quoted" (green), "Manual" (blue), "Missing" (red/warning)
- `materialCost` calculation: only sum items where `item.price !== null`
- Show a warning banner if any items have source="missing"
- Save `system_type` field when creating the estimate in Supabase
- Update `brand` field in the estimate_bom_items insert

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-estimator.ts src/components/estimator/bom-step.tsx
git commit -m "feat: update BOM step to use catalog with source badges and null price handling"
```

---

## Task 8: Quote Parsing API Route

**Files:**
- Create: `src/lib/hvac/quote-prompt.ts`
- Create: `src/app/api/parse-quote/route.ts`

- [ ] **Step 1: Create quote parsing prompt**

Create `src/lib/hvac/quote-prompt.ts`:

```typescript
export const QUOTE_SYSTEM_PROMPT = `You are an expert HVAC supply chain analyst. Your job is to extract structured data from supplier quote PDFs for HVAC contractors. You understand HVAC equipment models, sizing conventions, and supplier pricing formats.`;

export const QUOTE_ANALYSIS_PROMPT = `Analyze this supplier quote PDF and extract all line items.

For each line item, extract:
- model_number: The manufacturer model/part number
- description: Full description text
- equipment_type: One of: ac_condenser, heat_pump_condenser, gas_furnace, air_handler, heat_strips, evap_coil, thermostat, ductwork, register, grille, refrigerant, electrical, installation
- brand: Manufacturer name (Goodman, Carrier, Lennox, Rheem, etc.)
- tonnage: System tonnage if applicable (e.g., 2, 2.5, 3, 3.5, 4, 5) — null for non-tonnage items
- seer_rating: SEER/SEER2 rating if shown — null if not
- btu_capacity: BTU rating if shown — null if not
- stages: Number of stages (1, 2) if shown — null if not
- refrigerant_type: R-410A, R-32, etc. if shown — null if not
- quantity: Quantity ordered
- unit_price: Price per unit (net/contractor price, not MSRP)
- extended_price: quantity × unit_price

Also extract quote-level info:
- supplier_name: The supplier company name
- quote_number: Quote/order number
- quote_date: Date on the quote (YYYY-MM-DD format)
- subtotal: Subtotal before tax
- tax: Tax amount
- total: Total amount

Return ONLY valid JSON:
{
  "supplier_name": "Sanders Supply",
  "quote_number": "Q-2024-1234",
  "quote_date": "2024-03-15",
  "subtotal": 12500.00,
  "tax": 1062.50,
  "total": 13562.50,
  "line_items": [
    {
      "model_number": "24ACC636A003",
      "description": "Carrier 3-Ton 14 SEER2 AC Condenser",
      "equipment_type": "ac_condenser",
      "brand": "Carrier",
      "tonnage": 3,
      "seer_rating": 14,
      "btu_capacity": 36000,
      "stages": 1,
      "refrigerant_type": "R-410A",
      "quantity": 1,
      "unit_price": 2450.00,
      "extended_price": 2450.00
    }
  ]
}

RULES:
- Extract ALL line items, even accessories and small parts
- If a field isn't shown in the quote, set it to null
- Use contractor/net pricing, not list/MSRP
- For equipment_type, infer from the model number and description if not explicitly stated
- Your ENTIRE response must be valid JSON. No explanation, no markdown.`;
```

- [ ] **Step 2: Create parse-quote API route**

Create `src/app/api/parse-quote/route.ts`:

Same pattern as `/api/analyze/route.ts`:
- Auth check via Supabase server client
- Zod schema for request: `images` array of `{base64, mediaType, pageNum?}`
- Build Claude content array with page labels between images
- Call `anthropic.messages.create` with `QUOTE_SYSTEM_PROMPT` and `QUOTE_ANALYSIS_PROMPT`
- Strip markdown fences, extract JSON
- Return parsed `ParsedQuoteResult`
- Error handling: 401, 400, 500

- [ ] **Step 3: Commit**

```bash
git add src/lib/hvac/quote-prompt.ts src/app/api/parse-quote/
git commit -m "feat: add Claude Vision API route for supplier quote parsing"
```

---

## Task 9: Parts Database Sidebar Nav + Layout

**Files:**
- Modify: `src/components/layout/sidebar.tsx` — add Parts Database nav item
- Create: `src/app/(app)/parts-database/layout.tsx` — optional, simple pass-through

- [ ] **Step 1: Add nav item**

In `src/components/layout/sidebar.tsx`, add to navItems array after Estimates:

```typescript
{ href: "/parts-database", label: "Parts Database", icon: Package },
```

Import `Package` from `lucide-react`.

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat: add Parts Database to sidebar navigation"
```

---

## Task 10: Quote Upload Page

**Files:**
- Create: `src/app/(app)/parts-database/upload/page.tsx`
- Create: `src/components/parts-database/quote-upload.tsx`
- Create: `src/components/parts-database/quote-review.tsx`

- [ ] **Step 1: Create quote upload component**

Create `src/components/parts-database/quote-upload.tsx`:

"use client" component. Props: `suppliers: Supplier[]`, `onParsed: (result: ParsedQuoteResult, supplierId: string, fileName: string) => void`.

- Supplier select dropdown (from user's suppliers list)
- File upload area (same pattern as estimator upload — PDF only, with processing indicator)
- On file upload: render PDF pages via lazy-loaded pdfjs-dist, send to `/api/parse-quote`, call onParsed with result

- [ ] **Step 2: Create quote review component**

Create `src/components/parts-database/quote-review.tsx`:

"use client" component. Props: `parsedResult: ParsedQuoteResult`, `supplierId: string`, `fileName: string`, `onSave: () => void`, `onCancel: () => void`.

- Table of parsed line items with columns: checkbox (selected), model #, description, type (select dropdown), brand, tonnage, SEER, qty, unit price, extended
- All fields are editable inline
- Equipment type shown as select with all EquipmentType options
- "Save to Catalog" button: for each selected line item, upsert into equipment_catalog (match on model_number + user_id), insert into quote_lines linked to a new quote record, insert price_history entries
- "Cancel" button: discard and go back

- [ ] **Step 3: Create upload page**

Create `src/app/(app)/parts-database/upload/page.tsx`:

"use client" page that orchestrates the upload → review → save flow:
- Fetch user's suppliers on mount
- State machine: "upload" | "review" | "saved"
- In "upload" state: render QuoteUpload
- In "review" state: render QuoteReview
- In "saved" state: success message + links to catalog and upload another

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/parts-database/upload/ src/components/parts-database/
git commit -m "feat: add quote upload and review flow with AI parsing"
```

---

## Task 11: Catalog API Routes

**Files:**
- Create: `src/app/api/catalog/route.ts`
- Create: `src/app/api/catalog/[id]/route.ts`

- [ ] **Step 1: Create catalog list + create route**

Create `src/app/api/catalog/route.ts`:

GET: Auth check, query equipment_catalog with optional query params for search (ilike on model_number, description, brand), filter by equipment_type, filter by supplier_id, sort (usage_count desc default). Implement starter retirement filter: exclude starter entries where a quote-sourced entry exists at same equipment_type and tonnage ±0.5. Support `?show_retired=true` to include them.

POST: Auth check, Zod validation, insert new catalog entry with source="manual".

- [ ] **Step 2: Create catalog item CRUD route**

Create `src/app/api/catalog/[id]/route.ts`:

GET: Fetch single catalog item with supplier join + price_history + related quote_lines.
PUT: Update catalog entry fields.
DELETE: Delete catalog entry.

All auth-gated via Supabase server client.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/catalog/
git commit -m "feat: add catalog API routes with search, filter, and retirement logic"
```

---

## Task 12: Equipment Catalog Page

**Files:**
- Create: `src/app/(app)/parts-database/page.tsx`
- Create: `src/components/parts-database/catalog-table.tsx`

- [ ] **Step 1: Create catalog table component**

Create `src/components/parts-database/catalog-table.tsx`:

"use client" component displaying the equipment catalog.

- Search input (filters model number, description, brand)
- Equipment type filter dropdown
- Supplier filter dropdown
- Sort dropdown (Usage count, Price, Last updated)
- "Show retired" toggle
- Table with columns: Description, Brand, Model #, Tonnage, SEER, Price (or "No price"), Supplier, Source badge, Usage count
- Source badges: "Starter" (gray/outline), "From quote" (green), "Manual" (blue)
- Rows are links to `/parts-database/[id]`
- "Add Equipment" button for manual entry (opens inline form or modal)
- Fetch data from `/api/catalog` with query params

- [ ] **Step 2: Create catalog page**

Create `src/app/(app)/parts-database/page.tsx`:

Server component (or client) with:
- Header: "Parts Database" h1 + "Upload Quote" button (link to /parts-database/upload)
- CatalogTable component
- Stats summary: total items, items from quotes, items from starter

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/parts-database/page.tsx src/components/parts-database/catalog-table.tsx
git commit -m "feat: add equipment catalog page with search, filter, and source badges"
```

---

## Task 13: Catalog Item Detail Page

**Files:**
- Create: `src/app/(app)/parts-database/[id]/page.tsx`
- Create: `src/components/parts-database/catalog-detail.tsx`

- [ ] **Step 1: Create catalog detail component**

Create `src/components/parts-database/catalog-detail.tsx`:

"use client" component showing full catalog item details:
- All attributes (model, brand, type, tonnage, SEER, BTU, stages, refrigerant, price, supplier)
- Editable fields with save button
- Price history section: table of (date, price, supplier, quote link) sorted by date desc
- Related quotes section: list of quotes this item appeared in
- Delete button with confirmation

- [ ] **Step 2: Create detail page**

Create `src/app/(app)/parts-database/[id]/page.tsx`:

Async params page (Next.js 15 style). Fetches catalog item + price history + related quote lines from Supabase server client. Renders CatalogDetail. Back link to /parts-database.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/parts-database/\[id\]/ src/components/parts-database/catalog-detail.tsx
git commit -m "feat: add catalog item detail page with price history and editing"
```

---

## Task 14: Quotes API Route

**Files:**
- Create: `src/app/api/quotes/route.ts`

- [ ] **Step 1: Create quotes route**

GET: List quotes for user, ordered by created_at desc, with supplier name joined.
POST: Create a new quote record (used during the save step of quote review).

- [ ] **Step 2: Commit**

```bash
git add src/app/api/quotes/
git commit -m "feat: add quotes API route"
```

---

## Task 15: Build Verification & Wiring

- [ ] **Step 1: Verify full build**

```bash
npm run build
```

Fix any type errors or build issues.

- [ ] **Step 2: Test the full flow manually**

1. Sign up fresh account → onboarding page shows → select suppliers → catalog seeded
2. Navigate to Parts Database → see starter equipment
3. Navigate to Estimates → New Estimate → select system type → upload floorplan → generate BOM → see catalog-sourced equipment with source badges
4. Navigate to Parts Database → Upload Quote → upload a PDF → review parsed items → save → see items in catalog

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build errors and finalize parts database wiring"
```
