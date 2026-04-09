# CoolBid V1 Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CoolBid HVAC estimating SaaS from scratch — Next.js app with Supabase auth/DB, core estimator wizard, estimate CRUD, and settings.

**Architecture:** Next.js 15 App Router with Supabase for auth/DB/storage. HVAC calculation engine extracted from prototype into typed TypeScript modules. Estimator wizard as a multi-step client-side flow (Zustand) that persists to Supabase on save. Server-side API routes for Claude Vision calls.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v4, shadcn/ui, Supabase (Auth + PostgreSQL + Storage), Anthropic SDK, Zustand, Zod, PDF.js

**Spec:** `docs/superpowers/specs/2026-04-08-coolbid-saas-design.md`

**Prototype reference:** `../hvac-business-tools/index.html` (2,256-line single-file app with all HVAC logic)

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `.env.local.example`, `tailwind.config.ts`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --no-git
```

Accept defaults. The `--no-git` flag avoids reinitializing git since the repo already exists.

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr zustand zod @anthropic-ai/sdk pdfjs-dist
npm install -D supabase @types/node
```

- [ ] **Step 3: Install shadcn/ui**

```bash
npx shadcn@latest init -d
```

Then install the components we'll use immediately:

```bash
npx shadcn@latest add button card input label tabs dialog toast dropdown-menu separator badge select textarea table
```

- [ ] **Step 4: Create `.env.local.example`**

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Anthropic
ANTHROPIC_API_KEY=your-anthropic-api-key

# Stripe (Phase 2)
# STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET=
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 5: Add `.env.local` to `.gitignore`**

Append to the existing `.gitignore`:

```
.env.local
.env.*.local
```

- [ ] **Step 6: Verify dev server starts**

```bash
npm run dev
```

Expected: Server starts on `http://localhost:3000`, default Next.js page renders.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 15 project with Tailwind, shadcn/ui, and dependencies"
```

---

## Task 2: Supabase Database Schema

**Files:**
- Create: `supabase/migrations/001_initial.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 001_initial.sql
-- CoolBid V1 schema: profiles, estimates, rooms, BOM items, floorplans

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_name text default '',
  company_email text default '',
  company_phone text default '',
  address text default '',
  state text default '',
  zip text default '',
  stripe_customer_id text,
  subscription_tier text default 'trial',
  subscription_status text default 'trialing',
  trial_ends_at timestamptz default (now() + interval '14 days'),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, company_email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- ESTIMATES
-- ============================================================
create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_name text not null default 'New HVAC Estimate',
  customer_name text default '',
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted')),
  total_sqft numeric,
  num_units int default 1,
  hvac_per_unit boolean default true,
  climate_zone text default 'warm',
  profit_margin numeric default 35,
  labor_rate numeric default 85,
  labor_hours numeric default 16,
  supplier_name text default '',
  total_material_cost numeric,
  total_price numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.estimates enable row level security;

create policy "Users can CRUD own estimates"
  on public.estimates for all
  using (auth.uid() = user_id);

-- ============================================================
-- ESTIMATE ROOMS
-- ============================================================
create table public.estimate_rooms (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  name text not null,
  type text not null,
  floor int default 1,
  sqft numeric,
  length_ft numeric,
  width_ft numeric,
  ceiling_height numeric default 8,
  window_count int default 0,
  exterior_walls int default 0,
  btu_load numeric,
  tonnage numeric,
  cfm_required numeric,
  notes text default '',
  created_at timestamptz default now()
);

alter table public.estimate_rooms enable row level security;

create policy "Users can CRUD own estimate rooms"
  on public.estimate_rooms for all
  using (
    exists (
      select 1 from public.estimates
      where estimates.id = estimate_rooms.estimate_id
      and estimates.user_id = auth.uid()
    )
  );

-- ============================================================
-- ESTIMATE BOM ITEMS
-- ============================================================
create table public.estimate_bom_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  category text not null,
  description text not null,
  quantity numeric not null,
  unit text not null,
  unit_cost numeric not null,
  total_cost numeric not null,
  part_id text,
  supplier text,
  sku text,
  notes text default '',
  source text default 'default',
  room_id uuid references public.estimate_rooms(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.estimate_bom_items enable row level security;

create policy "Users can CRUD own BOM items"
  on public.estimate_bom_items for all
  using (
    exists (
      select 1 from public.estimates
      where estimates.id = estimate_bom_items.estimate_id
      and estimates.user_id = auth.uid()
    )
  );

-- ============================================================
-- FLOORPLANS
-- ============================================================
create table public.floorplans (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_type text not null,
  page_numbers int[] default '{}',
  analysis_result jsonb,
  created_at timestamptz default now()
);

alter table public.floorplans enable row level security;

create policy "Users can CRUD own floorplans"
  on public.floorplans for all
  using (
    exists (
      select 1 from public.estimates
      where estimates.id = floorplans.estimate_id
      and estimates.user_id = auth.uid()
    )
  );

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger set_updated_at
  before update on public.estimates
  for each row execute function public.update_updated_at();

-- ============================================================
-- STORAGE BUCKET
-- ============================================================
insert into storage.buckets (id, name, public)
values ('floorplans', 'floorplans', false);

create policy "Users can upload floorplans"
  on storage.objects for insert
  with check (
    bucket_id = 'floorplans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can read own floorplans"
  on storage.objects for select
  using (
    bucket_id = 'floorplans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own floorplans"
  on storage.objects for delete
  using (
    bucket_id = 'floorplans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
```

- [ ] **Step 2: Commit**

```bash
git add supabase/
git commit -m "feat: add Supabase migration with profiles, estimates, rooms, BOM items, floorplans"
```

**Note for the human:** After this task, you'll need to:
1. Create a Supabase project at https://supabase.com
2. Run this migration via the Supabase SQL editor or CLI (`supabase db push`)
3. Copy the project URL and anon key into `.env.local`
4. In Auth settings, disable "Confirm email" for easier testing

---

## Task 3: Supabase Client Configuration

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`, `src/middleware.ts`, `src/types/database.ts`

- [ ] **Step 1: Create database types**

Create `src/types/database.ts`:

```typescript
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          company_name: string;
          company_email: string;
          company_phone: string;
          address: string;
          state: string;
          zip: string;
          stripe_customer_id: string | null;
          subscription_tier: string;
          subscription_status: string;
          trial_ends_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          company_name?: string;
          company_email?: string;
          company_phone?: string;
          address?: string;
          state?: string;
          zip?: string;
          stripe_customer_id?: string | null;
          subscription_tier?: string;
          subscription_status?: string;
          trial_ends_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      estimates: {
        Row: {
          id: string;
          user_id: string;
          project_name: string;
          customer_name: string;
          status: "draft" | "sent" | "accepted";
          total_sqft: number | null;
          num_units: number;
          hvac_per_unit: boolean;
          climate_zone: string;
          profit_margin: number;
          labor_rate: number;
          labor_hours: number;
          supplier_name: string;
          total_material_cost: number | null;
          total_price: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_name?: string;
          customer_name?: string;
          status?: "draft" | "sent" | "accepted";
          total_sqft?: number | null;
          num_units?: number;
          hvac_per_unit?: boolean;
          climate_zone?: string;
          profit_margin?: number;
          labor_rate?: number;
          labor_hours?: number;
          supplier_name?: string;
          total_material_cost?: number | null;
          total_price?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["estimates"]["Insert"]>;
      };
      estimate_rooms: {
        Row: {
          id: string;
          estimate_id: string;
          name: string;
          type: string;
          floor: number;
          sqft: number | null;
          length_ft: number | null;
          width_ft: number | null;
          ceiling_height: number;
          window_count: number;
          exterior_walls: number;
          btu_load: number | null;
          tonnage: number | null;
          cfm_required: number | null;
          notes: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          estimate_id: string;
          name: string;
          type: string;
          floor?: number;
          sqft?: number | null;
          length_ft?: number | null;
          width_ft?: number | null;
          ceiling_height?: number;
          window_count?: number;
          exterior_walls?: number;
          btu_load?: number | null;
          tonnage?: number | null;
          cfm_required?: number | null;
          notes?: string;
        };
        Update: Partial<Database["public"]["Tables"]["estimate_rooms"]["Insert"]>;
      };
      estimate_bom_items: {
        Row: {
          id: string;
          estimate_id: string;
          category: string;
          description: string;
          quantity: number;
          unit: string;
          unit_cost: number;
          total_cost: number;
          part_id: string | null;
          supplier: string | null;
          sku: string | null;
          notes: string;
          source: string;
          room_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          estimate_id: string;
          category: string;
          description: string;
          quantity: number;
          unit: string;
          unit_cost: number;
          total_cost: number;
          part_id?: string | null;
          supplier?: string | null;
          sku?: string | null;
          notes?: string;
          source?: string;
          room_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["estimate_bom_items"]["Insert"]>;
      };
      floorplans: {
        Row: {
          id: string;
          estimate_id: string;
          storage_path: string;
          file_name: string;
          file_type: string;
          page_numbers: number[];
          analysis_result: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          estimate_id: string;
          storage_path: string;
          file_name: string;
          file_type: string;
          page_numbers?: number[];
          analysis_result?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["floorplans"]["Insert"]>;
      };
    };
  };
};
```

- [ ] **Step 2: Create browser client**

Create `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 3: Create server client**

Create `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from Server Component — ignore
          }
        },
      },
    }
  );
}
```

- [ ] **Step 4: Create middleware helper**

Create `src/lib/supabase/middleware.ts`:

```typescript
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
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Protected routes — redirect to login if not authenticated
  const protectedPaths = ["/dashboard", "/estimates", "/settings"];
  if (!user && protectedPaths.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Auth routes — redirect to dashboard if already logged in
  if (user && path.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

- [ ] **Step 5: Create Next.js middleware**

Create `src/middleware.ts`:

```typescript
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 6: Verify compilation**

```bash
npm run build
```

Expected: Builds without type errors (may warn about unused files, that's fine).

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase/ src/middleware.ts src/types/database.ts
git commit -m "feat: configure Supabase client, server, and auth middleware"
```

---

## Task 4: HVAC Calculation Engine

Port the prototype's HVAC logic into typed TypeScript modules.

**Files:**
- Create: `src/lib/hvac/climate-zones.ts`, `src/lib/hvac/parts-db.ts`, `src/lib/hvac/load-calc.ts`, `src/lib/hvac/bom-generator.ts`, `src/lib/hvac/rfq.ts`, `src/types/hvac.ts`

- [ ] **Step 1: Create HVAC types**

Create `src/types/hvac.ts`:

```typescript
export type ClimateZoneKey =
  | "hot_humid"
  | "hot_dry"
  | "warm"
  | "mixed"
  | "cool"
  | "cold";

export type ClimateZone = {
  label: string;
  factor: number;
  desc: string;
};

export type RoomType =
  | "master_bedroom"
  | "bedroom"
  | "living_room"
  | "family_room"
  | "kitchen"
  | "dining_room"
  | "bathroom"
  | "half_bath"
  | "hallway"
  | "laundry"
  | "office"
  | "foyer"
  | "sunroom"
  | "bonus_room"
  | "basement"
  | "closet"
  | "garage";

export type LoadFactor = {
  btu: number;
  cfm: number;
  reg: number;
};

export type Part = {
  name: string;
  category: string;
  unit: string;
  price: number;
  supplier: string;
  sku: string;
};

export type Room = {
  name: string;
  type: RoomType;
  floor: number;
  estimated_sqft: number;
  width_ft: number;
  length_ft: number;
  window_count: number;
  exterior_walls: number;
  ceiling_height: number;
  notes: string;
};

export type RoomLoad = Room & {
  btu: number;
  cfm: number;
  regs: number;
};

export type BomItem = {
  partId: string;
  name: string;
  category: string;
  qty: number;
  unit: string;
  price: number;
  supplier: string;
  sku: string;
  notes: string;
  source: "default" | "catalog";
};

export type BomSummary = {
  designBTU: number;
  tonnage: number;
  totalCFM: number;
  totalRegs: number;
  retCount: number;
  condSqft: number;
  zones: number;
};

export type BomResult = {
  items: BomItem[];
  summary: BomSummary;
  roomLoads: RoomLoad[];
};

export type BuildingInfo = {
  stories: number;
  total_sqft: number;
  units: number;
  has_garage: boolean;
  building_shape: string;
};

export type HvacNotes = {
  suggested_equipment_location: string;
  suggested_zones: number;
  special_considerations: string[];
};

export type AnalysisResult = {
  floorplan_type: string;
  confidence: "high" | "medium" | "low";
  building: BuildingInfo;
  rooms: Room[];
  hvac_notes: HvacNotes;
  analysis_notes: string;
};
```

- [ ] **Step 2: Create climate zones**

Create `src/lib/hvac/climate-zones.ts`:

```typescript
import type { ClimateZoneKey, ClimateZone } from "@/types/hvac";

export const CLIMATE_ZONES: Record<ClimateZoneKey, ClimateZone> = {
  hot_humid: {
    label: "Hot & Humid (FL, TX Gulf, LA, MS, AL, GA, SC)",
    factor: 1.2,
    desc: "Zone 1-2: High cooling demand",
  },
  hot_dry: {
    label: "Hot & Dry (AZ, NM, NV, West TX)",
    factor: 1.15,
    desc: "Zone 2-3: High cooling, low humidity",
  },
  warm: {
    label: "Warm (NC, TN, AR, OK, N. TX, Central CA)",
    factor: 1.0,
    desc: "Zone 3-4: Moderate climate",
  },
  mixed: {
    label: "Mixed (VA, MD, KY, MO, KS, Southern IN/OH)",
    factor: 0.95,
    desc: "Zone 4: Mixed heating/cooling",
  },
  cool: {
    label: "Cool (PA, NJ, CT, NY, IA, NE, CO)",
    factor: 0.85,
    desc: "Zone 5: Heating-dominant",
  },
  cold: {
    label: "Cold (MN, WI, MI, ME, MT, ND)",
    factor: 0.8,
    desc: "Zone 6-7: Heavy heating, light cooling",
  },
};
```

- [ ] **Step 3: Create load factors and parts DB**

Create `src/lib/hvac/parts-db.ts`:

```typescript
import type { LoadFactor, Part, RoomType } from "@/types/hvac";

export const LOAD_FACTORS: Record<RoomType, LoadFactor> = {
  master_bedroom: { btu: 18, cfm: 1.0, reg: 2 },
  bedroom: { btu: 18, cfm: 1.0, reg: 1 },
  living_room: { btu: 22, cfm: 1.2, reg: 2 },
  family_room: { btu: 22, cfm: 1.2, reg: 2 },
  kitchen: { btu: 26, cfm: 1.3, reg: 1 },
  dining_room: { btu: 20, cfm: 1.0, reg: 1 },
  bathroom: { btu: 20, cfm: 0.8, reg: 1 },
  half_bath: { btu: 20, cfm: 0.8, reg: 0 },
  hallway: { btu: 14, cfm: 0.5, reg: 1 },
  laundry: { btu: 20, cfm: 0.8, reg: 1 },
  office: { btu: 20, cfm: 1.0, reg: 1 },
  foyer: { btu: 18, cfm: 0.6, reg: 1 },
  sunroom: { btu: 35, cfm: 1.5, reg: 2 },
  bonus_room: { btu: 22, cfm: 1.0, reg: 1 },
  basement: { btu: 14, cfm: 0.8, reg: 1 },
  closet: { btu: 0, cfm: 0, reg: 0 },
  garage: { btu: 0, cfm: 0, reg: 0 },
};

export const ROOM_TYPES = Object.keys(LOAD_FACTORS) as RoomType[];

export const PARTS_DB: Record<string, Part> = {
  "COND-2T-14S": { name: "2-Ton Condenser (14 SEER2)", category: "Major Equipment", unit: "ea", price: 1850, supplier: "Carrier", sku: "24ACC636A003" },
  "COND-2.5T-14S": { name: "2.5-Ton Condenser (14 SEER2)", category: "Major Equipment", unit: "ea", price: 2150, supplier: "Carrier", sku: "24ACC660A003" },
  "COND-3T-14S": { name: "3-Ton Condenser (14 SEER2)", category: "Major Equipment", unit: "ea", price: 2450, supplier: "Carrier", sku: "24ACC636A003" },
  "COND-3.5T-16S": { name: "3.5-Ton Condenser (16 SEER2)", category: "Major Equipment", unit: "ea", price: 2950, supplier: "Carrier", sku: "24ACC642A003" },
  "COND-4T-16S": { name: "4-Ton Condenser (16 SEER2)", category: "Major Equipment", unit: "ea", price: 3350, supplier: "Carrier", sku: "24ACC648A003" },
  "COND-5T-16S": { name: "5-Ton Condenser (16 SEER2)", category: "Major Equipment", unit: "ea", price: 3950, supplier: "Carrier", sku: "24ACC660A003" },
  "AH-2T-VS": { name: "2-Ton Air Handler (Var Speed)", category: "Major Equipment", unit: "ea", price: 1250, supplier: "Carrier", sku: "FE4ANB002" },
  "AH-2.5T-VS": { name: "2.5-Ton Air Handler (Var Speed)", category: "Major Equipment", unit: "ea", price: 1400, supplier: "Carrier", sku: "FE4ANB0025" },
  "AH-3T-VS": { name: "3-Ton Air Handler (Var Speed)", category: "Major Equipment", unit: "ea", price: 1550, supplier: "Carrier", sku: "FE4ANB003" },
  "AH-3.5T-VS": { name: "3.5-Ton Air Handler (Var Speed)", category: "Major Equipment", unit: "ea", price: 1700, supplier: "Carrier", sku: "FE4ANB0035" },
  "AH-4T-VS": { name: "4-Ton Air Handler (Var Speed)", category: "Major Equipment", unit: "ea", price: 1850, supplier: "Carrier", sku: "FE4ANB004" },
  "AH-5T-VS": { name: "5-Ton Air Handler (Var Speed)", category: "Major Equipment", unit: "ea", price: 2150, supplier: "Carrier", sku: "FE4ANB005" },
  "TSTAT-WIFI": { name: "Wi-Fi Smart Thermostat", category: "Controls", unit: "ea", price: 165, supplier: "Ecobee", sku: "EB-STATEsi" },
  "TRUNK-8x12": { name: '8"x12" Sheet Metal Trunk', category: "Ductwork", unit: "ft", price: 12.5, supplier: "Local Sheet Metal", sku: "SM0812" },
  "TRUNK-10x14": { name: '10"x14" Sheet Metal Trunk', category: "Ductwork", unit: "ft", price: 15.75, supplier: "Local Sheet Metal", sku: "SM1014" },
  "TRUNK-12x16": { name: '12"x16" Sheet Metal Trunk', category: "Ductwork", unit: "ft", price: 18.5, supplier: "Local Sheet Metal", sku: "SM1216" },
  "FLEX-6": { name: '6" Round Flex Duct', category: "Ductwork", unit: "ft", price: 2.85, supplier: "Hart & Cooley", sku: "FD06" },
  "FLEX-8": { name: '8" Round Flex Duct', category: "Ductwork", unit: "ft", price: 3.45, supplier: "Hart & Cooley", sku: "FD08" },
  "FLEX-10": { name: '10" Round Flex Duct', category: "Ductwork", unit: "ft", price: 4.25, supplier: "Hart & Cooley", sku: "FD10" },
  "PLENUM-SUP": { name: "Supply Plenum", category: "Ductwork", unit: "ea", price: 145, supplier: "Local Sheet Metal", sku: "PL-SUP" },
  "PLENUM-RET": { name: "Return Plenum", category: "Ductwork", unit: "ea", price: 165, supplier: "Local Sheet Metal", sku: "PL-RET" },
  "REG-4x12": { name: '4"x12" Supply Register', category: "Registers & Grilles", unit: "ea", price: 9.75, supplier: "Hart & Cooley", sku: "421-4x12W" },
  "REG-6x12": { name: '6"x12" Supply Register', category: "Registers & Grilles", unit: "ea", price: 12.5, supplier: "Hart & Cooley", sku: "421-6x12W" },
  "RET-20x25": { name: '20"x25" Return Grille', category: "Registers & Grilles", unit: "ea", price: 22.5, supplier: "Hart & Cooley", sku: "RG-2025W" },
  "RET-20x30": { name: '20"x30" Return Grille', category: "Registers & Grilles", unit: "ea", price: 28, supplier: "Hart & Cooley", sku: "RG-2030W" },
  "RET-24x30": { name: '24"x30" Return Grille', category: "Registers & Grilles", unit: "ea", price: 34, supplier: "Hart & Cooley", sku: "RG-2430W" },
  "LS-25": { name: '3/8"x3/4" Line Set (25ft)', category: "Refrigerant & Lines", unit: "ea", price: 85, supplier: "Mueller", sku: "LS-3825" },
  "LS-50": { name: '3/8"x3/4" Line Set (50ft)', category: "Refrigerant & Lines", unit: "ea", price: 145, supplier: "Mueller", sku: "LS-3850" },
  "R410A-25": { name: "R-410A Refrigerant (25lb)", category: "Refrigerant & Lines", unit: "ea", price: 185, supplier: "National", sku: "R410A-25" },
  "DISC-60A": { name: "60A Non-Fused Disconnect", category: "Electrical", unit: "ea", price: 32, supplier: "Eaton", sku: "DPU222R" },
  "WHIP-6FT": { name: '3/4" Conduit Whip (6ft)', category: "Electrical", unit: "ea", price: 18, supplier: "Southwire", sku: "55189407" },
  "BRKR-30A": { name: "30A Dbl-Pole Breaker", category: "Electrical", unit: "ea", price: 12, supplier: "Square D", sku: "HOM230CP" },
  "BRKR-40A": { name: "40A Dbl-Pole Breaker", category: "Electrical", unit: "ea", price: 14, supplier: "Square D", sku: "HOM240CP" },
  "BRKR-50A": { name: "50A Dbl-Pole Breaker", category: "Electrical", unit: "ea", price: 16, supplier: "Square D", sku: "HOM250CP" },
  "CPUMP": { name: "Condensate Pump", category: "Installation", unit: "ea", price: 65, supplier: "Little Giant", sku: "554405" },
  "PTRAP": { name: 'P-Trap (3/4" PVC)', category: "Installation", unit: "ea", price: 4.5, supplier: "Charlotte Pipe", sku: "PVC00700" },
  "DRAIN-PVC": { name: '3/4" PVC Drain Line (10ft)', category: "Installation", unit: "ea", price: 8.5, supplier: "Charlotte Pipe", sku: "PVC07010" },
  "FILT-16x25": { name: "16x25x1 Filter (MERV 8)", category: "Installation", unit: "ea", price: 6.5, supplier: "Filtrete", sku: "F16251" },
  "FILT-20x25": { name: "20x25x1 Filter (MERV 8)", category: "Installation", unit: "ea", price: 7.5, supplier: "Filtrete", sku: "F20251" },
  "MASTIC": { name: "Duct Mastic (1 Gal)", category: "Installation", unit: "ea", price: 14.5, supplier: "Hardcast", sku: "304133" },
  "TAPE-FOIL": { name: 'Foil Tape (2.5"x60yd)', category: "Installation", unit: "ea", price: 12.5, supplier: "Nashua", sku: "322" },
  "PAD-COND": { name: "Condenser Pad (24x24x3)", category: "Installation", unit: "ea", price: 38, supplier: "DiversiTech", sku: "EL2424-3" },
  "HANGER": { name: "Hanger Strap (100ft)", category: "Installation", unit: "ea", price: 22, supplier: "Oatey", sku: "33528" },
};
```

- [ ] **Step 4: Create load calculator**

Create `src/lib/hvac/load-calc.ts`:

```typescript
import type { ClimateZoneKey, Room, RoomLoad, RoomType } from "@/types/hvac";
import { CLIMATE_ZONES } from "./climate-zones";
import { LOAD_FACTORS } from "./parts-db";

const UNCONDITIONED_TYPES: RoomType[] = ["garage", "closet"];
const SMALL_ROOM_TYPES: RoomType[] = ["hallway", "bathroom", "half_bath", "laundry"];

export function calculateRoomLoad(room: Room, climateZone: ClimateZoneKey): RoomLoad {
  if (UNCONDITIONED_TYPES.includes(room.type)) {
    return { ...room, btu: 0, cfm: 0, regs: 0 };
  }

  const factor = LOAD_FACTORS[room.type] ?? LOAD_FACTORS.bedroom;
  const climateFactor = CLIMATE_ZONES[climateZone]?.factor ?? 1.0;

  const sqft = room.estimated_sqft || 0;
  const baseBTU = sqft * factor.btu * climateFactor;
  const winBTU = (room.window_count || 0) * 800;
  const wallBTU = (room.exterior_walls || 0) * 400;
  const ceilFactor = (room.ceiling_height || 8) > 8 ? (room.ceiling_height || 8) / 8 : 1;

  const btu = Math.ceil((baseBTU + winBTU + wallBTU) * ceilFactor);
  const cfm = Math.ceil(sqft * factor.cfm);
  const regs = Math.max(factor.reg, Math.ceil(cfm / 150));

  return { ...room, btu, cfm, regs };
}

export function calculateSystemTonnage(totalBTU: number): number {
  const designBTU = Math.ceil(totalBTU * 1.1); // 10% safety margin
  let tonnage = Math.ceil((designBTU / 12000) * 2) / 2; // nearest 0.5 ton
  return Math.max(1.5, Math.min(5, tonnage));
}

export function calculateZoneCount(stories: number, condSqft: number): number {
  return (stories >= 2 && condSqft > 1800) || condSqft > 3000 ? 2 : 1;
}

export function needsReturnRegister(room: Room): boolean {
  return (
    (room.estimated_sqft || 0) >= 200 &&
    (room.exterior_walls || 0) >= 1 &&
    !SMALL_ROOM_TYPES.includes(room.type)
  );
}
```

- [ ] **Step 5: Create BOM generator**

Create `src/lib/hvac/bom-generator.ts`:

```typescript
import type {
  BomItem,
  BomResult,
  BuildingInfo,
  ClimateZoneKey,
  HvacNotes,
  Room,
  RoomLoad,
} from "@/types/hvac";
import { PARTS_DB } from "./parts-db";
import {
  calculateRoomLoad,
  calculateSystemTonnage,
  calculateZoneCount,
  needsReturnRegister,
} from "./load-calc";

export function generateBOM(
  rooms: Room[],
  climateZone: ClimateZoneKey,
  building?: BuildingInfo,
  hvacNotes?: HvacNotes
): BomResult {
  let totalBTU = 0;
  let totalCFM = 0;
  let totalRegs = 0;
  let condSqft = 0;
  const returnRooms: string[] = [];
  const roomLoads: RoomLoad[] = [];

  for (const room of rooms) {
    const load = calculateRoomLoad(room, climateZone);
    roomLoads.push(load);

    totalBTU += load.btu;
    totalCFM += load.cfm;
    totalRegs += load.regs;
    if (load.btu > 0) condSqft += room.estimated_sqft || 0;

    if (needsReturnRegister(room)) {
      returnRooms.push(room.name);
    }
  }

  const designBTU = Math.ceil(totalBTU * 1.1);
  const tonnage = calculateSystemTonnage(totalBTU);
  const stories = building?.stories || 1;
  const zones = calculateZoneCount(stories, condSqft);
  const retCount = Math.max(returnRooms.length, 2);

  const items: BomItem[] = [];

  function add(id: string, qty: number, notes = "") {
    const p = PARTS_DB[id];
    if (!p) return;
    items.push({
      partId: id,
      name: p.name,
      category: p.category,
      qty,
      unit: p.unit,
      price: p.price,
      supplier: p.supplier,
      sku: p.sku,
      notes,
      source: "default",
    });
  }

  // Equipment
  const ts = String(tonnage).replace(".0", "");
  const seer = tonnage <= 3 ? "14S" : "16S";
  add(`COND-${ts}T-${seer}`, 1, `Sized for ${designBTU.toLocaleString()} BTU`);
  add(`AH-${ts}T-VS`, 1, `${totalCFM} CFM total`);
  add("TSTAT-WIFI", zones, `${zones} zone(s)`);

  // Ductwork
  const trunkLen = Math.ceil(condSqft / 35);
  if (tonnage <= 3) add("TRUNK-8x12", trunkLen, "Main trunk");
  else if (tonnage <= 4) add("TRUNK-10x14", trunkLen, "Main trunk");
  else add("TRUNK-12x16", trunkLen, "Main trunk");

  add("FLEX-8", Math.ceil(totalRegs * 10), `Branch runs to ${totalRegs} registers`);
  add("FLEX-6", Math.ceil(totalRegs * 8), "Reducer branches");
  add("PLENUM-SUP", 1);
  add("PLENUM-RET", 1);

  // Registers
  const largeRegs = roomLoads
    .filter((r) => (r.estimated_sqft || 0) >= 250 && r.type !== "garage")
    .reduce((s, r) => s + (r.regs || 0), 0);
  const smallRegs = totalRegs - largeRegs;
  if (largeRegs > 0) add("REG-6x12", largeRegs, "Large rooms");
  if (smallRegs > 0) add("REG-4x12", smallRegs, "Standard rooms");
  if (tonnage <= 3) add("RET-20x25", retCount, "Return grilles");
  else if (tonnage <= 4) add("RET-20x30", retCount, "Return grilles");
  else add("RET-24x30", retCount, "Return grilles");

  // Refrigerant
  add(condSqft > 1500 || stories > 1 ? "LS-50" : "LS-25", 1, "Condenser to air handler");
  add("R410A-25", 1, "System charge");

  // Electrical
  add("DISC-60A", 1);
  add("WHIP-6FT", 1);
  if (tonnage <= 3) add("BRKR-30A", 1);
  else if (tonnage <= 4) add("BRKR-40A", 1);
  else add("BRKR-50A", 1);

  // Install materials
  const equipLoc = hvacNotes?.suggested_equipment_location || "";
  if (["attic", "closet"].includes(equipLoc)) add("CPUMP", 1, `${equipLoc} install`);
  add("PTRAP", 1);
  add("DRAIN-PVC", 2);
  add(tonnage <= 3 ? "FILT-16x25" : "FILT-20x25", 2, "1 installed + 1 spare");
  add("MASTIC", Math.max(2, Math.ceil(trunkLen / 25)));
  add("TAPE-FOIL", Math.max(2, Math.ceil(totalRegs / 6)));
  add("PAD-COND", 1);
  add("HANGER", Math.max(2, Math.ceil(trunkLen / 40)));

  return {
    items,
    summary: { designBTU, tonnage, totalCFM, totalRegs, retCount, condSqft, zones },
    roomLoads,
  };
}
```

- [ ] **Step 6: Create RFQ generator**

Create `src/lib/hvac/rfq.ts`:

```typescript
import type { BomResult } from "@/types/hvac";

type RfqConfig = {
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  supplierName: string;
  projectName: string;
  customerName: string;
};

export function generateRFQText(bom: BomResult, config: RfqConfig): string {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const due = new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const rfqNum =
    "RFQ-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-001";
  const sum = bom.summary;

  const lines: string[] = [];
  lines.push("=".repeat(66));
  lines.push(`  REQUEST FOR QUOTE — ${rfqNum}`);
  lines.push("=".repeat(66));
  lines.push("");
  if (config.companyName) lines.push(`  From: ${config.companyName}`);
  if (config.companyPhone) lines.push(`        ${config.companyPhone}`);
  if (config.companyEmail) lines.push(`        ${config.companyEmail}`);
  lines.push(`  Date: ${today}`);
  lines.push(`  Quote Needed By: ${due}`);
  lines.push("");
  lines.push(`  To: ${config.supplierName || "Supplier"}`);
  lines.push("");
  if (config.projectName) lines.push(`  Project: ${config.projectName}`);
  if (config.customerName) lines.push(`  Customer: ${config.customerName}`);
  lines.push(
    `  System Size: ${sum.tonnage} Ton  |  ${sum.condSqft.toLocaleString()} sq ft`
  );
  lines.push("");
  lines.push("-".repeat(66));
  lines.push("");
  lines.push("  Please provide your best pricing on the items below.");
  lines.push("  Quantities are estimates and may adjust at time of order.");
  lines.push("");

  const cats: Record<string, (typeof bom.items)[number][]> = {};
  bom.items.forEach((item) => {
    if (!cats[item.category]) cats[item.category] = [];
    cats[item.category].push(item);
  });

  let num = 0;
  for (const [cat, catItems] of Object.entries(cats)) {
    lines.push(`  ${cat.toUpperCase()}`);
    lines.push("  " + "─".repeat(62));
    lines.push(
      `  ${"#".padEnd(4)} ${"Description".padEnd(34)} ${"SKU".padEnd(14)} ${"Qty".padStart(5)} ${"Unit".padEnd(4)}  Your Price`
    );
    lines.push("  " + "─".repeat(62));
    for (const item of catItems) {
      num++;
      lines.push(
        `  ${String(num).padEnd(4)} ${item.name.padEnd(34)} ${item.sku.padEnd(14)} ${String(item.qty).padStart(5)} ${item.unit.padEnd(4)}  $__________`
      );
    }
    lines.push("");
  }

  lines.push("-".repeat(66));
  lines.push("");
  lines.push(`  Total line items: ${bom.items.length}`);
  lines.push("");
  lines.push("  NOTES:");
  lines.push("  • Please include lead times for items not in stock");
  lines.push("  • Pricing valid for 30 days from quote date");
  lines.push("  • Note any substitutions or equivalents");
  lines.push("  • Job site delivery preferred — include freight");
  lines.push("");
  lines.push(
    `  Return quote to: ${config.companyEmail || config.companyName || "us"}`
  );
  lines.push(`  by ${due}`);
  lines.push("");
  lines.push("=".repeat(66));

  return lines.join("\n");
}

export function generateRFQCSV(bom: BomResult): string {
  let csv =
    "Item #,Category,Description,Manufacturer,SKU,Qty,Unit,Your Unit Price,Your Extended Price,Lead Time,Notes\n";
  bom.items.forEach((item, i) => {
    csv += `${i + 1},"${item.category}","${item.name}","${item.supplier}","${item.sku}",${item.qty},${item.unit},,,,\n`;
  });
  return csv;
}
```

- [ ] **Step 7: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/hvac/ src/types/hvac.ts
git commit -m "feat: port HVAC calculation engine from prototype to typed TypeScript modules"
```

---

## Task 5: Claude Vision API Route

**Files:**
- Create: `src/lib/anthropic.ts`, `src/app/api/analyze/route.ts`

- [ ] **Step 1: Create Anthropic client**

Create `src/lib/anthropic.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const SYSTEM_PROMPT = `You are an expert HVAC load calculation engineer and architectural plan reader with 20+ years experience. Your job is to analyze floorplan images and extract structured room data for HVAC system design.

CRITICAL RULES FOR READING PLANS:
1. ALWAYS read dimension annotations on the drawing (e.g., 16'-0", 8'-6") — these are the actual measurements. Never guess dimensions when they are written on the plan.
2. If the drawing states total sqft (e.g., "1,024 SQ.FT. HEATED PER UNIT"), use that as your anchor and make sure individual room areas add up to approximately that total.
3. For MULTI-UNIT buildings (duplexes, triplexes, etc.): analyze ONE unit only, since the units are mirrored/identical. Note the number of units in the building info.
4. If multiple drawings appear in the image (floor plans, elevations, roof plans, foundation plans, detail sections), ONLY extract rooms from the FLOOR PLANS. Ignore elevations, roof plans, foundation plans, and construction details.
5. Look for scale notations (e.g., "SCALE: 1/4" = 1'-0"") to understand relative proportions.
6. Identify which floor each room is on — first floor, second floor, etc.`;

export const ANALYSIS_PROMPT = `Analyze this floorplan image carefully for HVAC system design.

STEP 1 — UNDERSTAND THE DRAWING:
- Identify what type of building this is (single-family, duplex, triplex, apartment, commercial)
- Identify how many separate floor plan drawings are shown (ignore elevations, roof plans, foundation plans, section details)
- Look for text annotations showing total square footage (e.g., "1,024 SQ.FT. HEATED PER UNIT")
- Look for the scale notation (e.g., "SCALE: 1/4" = 1'-0"")

STEP 2 — READ DIMENSIONS CAREFULLY:
- Find and read ALL dimension lines/annotations on the floor plans (e.g., "16'-0"", "8'-6"", "12'")
- Use the OVERALL building dimensions to calculate total sqft, then verify individual rooms add up
- For each room: read the width and length from dimension annotations if available
- If a room has no direct dimensions, calculate it from surrounding dimensions or the overall layout

STEP 3 — FOR MULTI-UNIT BUILDINGS (duplexes, etc.):
- Analyze ONE unit only (the units are typically mirrored/identical)
- Report the number of units in building.units
- total_sqft should be for ONE unit only

STEP 4 — EXTRACT EACH ROOM:
For each room, provide:
- name: Room label from the drawing (e.g., "Living", "Kitchen", "Bedroom #1")
- type: One of: master_bedroom, bedroom, living_room, family_room, kitchen, dining_room, bathroom, half_bath, hallway, laundry, office, garage, basement, closet, foyer, sunroom, bonus_room
- floor: Which floor (1, 2, etc.)
- estimated_sqft: Width × Length (from dimension annotations)
- width_ft: Width in feet (from dimensions on the plan)
- length_ft: Length in feet (from dimensions on the plan)
- window_count: Count windows shown in floor plan
- exterior_walls: Count of walls that face outside (0-4)
- ceiling_height: 8 unless noted otherwise
- notes: Any special characteristics (e.g., "carpet", "vinyl", "vaulted ceiling")

Return ONLY valid JSON (no markdown fences):
{
  "floorplan_type": "architectural_blueprint | real_estate_layout | hand_sketch | construction_drawing",
  "confidence": "high | medium | low",
  "building": {
    "stories": 2,
    "total_sqft": 1024,
    "units": 1,
    "has_garage": true,
    "building_shape": "rectangle"
  },
  "rooms": [
    {
      "name": "Living Room",
      "type": "living_room",
      "floor": 1,
      "estimated_sqft": 256,
      "width_ft": 16.0,
      "length_ft": 16.0,
      "window_count": 3,
      "exterior_walls": 2,
      "ceiling_height": 8,
      "notes": "carpet"
    }
  ],
  "hvac_notes": {
    "suggested_equipment_location": "attic",
    "suggested_zones": 1,
    "special_considerations": []
  },
  "analysis_notes": "Brief notes about dimension reading"
}

RULES:
- READ the dimension annotations on the drawing — do not guess when measurements are shown
- Verify: sum of all room sqft should approximately equal total_sqft
- Do NOT include garages, patios, porches, decks, or any unconditioned/outdoor spaces in your room list or total_sqft
- Do NOT skip small rooms (closets, laundry, half baths, hallways, stairs)
- Include ALL rooms across ALL floors with correct floor number
- For duplexes/multi-unit: only analyze ONE unit
- Set confidence to "low" if image quality is poor or dimensions are unreadable

CRITICAL: Your ENTIRE response must be valid JSON and nothing else.`;
```

- [ ] **Step 2: Create analyze API route**

Create `src/app/api/analyze/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { anthropic, SYSTEM_PROMPT, ANALYSIS_PROMPT } from "@/lib/anthropic";
import type { AnalysisResult } from "@/types/hvac";

const requestSchema = z.object({
  images: z.array(
    z.object({
      base64: z.string(),
      mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
      pageNum: z.number().optional(),
    })
  ),
  buildingInfo: z
    .object({
      totalSqft: z.number().optional(),
      units: z.number().optional(),
      hvacPerUnit: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { images, buildingInfo } = parsed.data;

  // Build content array for Claude
  const content: Anthropic.Messages.ContentBlockParam[] = [];
  for (const img of images) {
    if (images.length > 1) {
      content.push({
        type: "text",
        text: `--- Page ${img.pageNum ?? images.indexOf(img) + 1} of the floorplan ---`,
      });
    }
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mediaType,
        data: img.base64,
      },
    });
  }

  // Add building info constraints to prompt
  let promptExtra = "";
  if (buildingInfo?.totalSqft) {
    promptExtra += `\n\nIMPORTANT: The user has confirmed the TOTAL HEATED SQ FT is ${buildingInfo.totalSqft} sq ft. Your room areas MUST add up to approximately this number.`;
  }
  if (buildingInfo?.units && buildingInfo.units > 1) {
    promptExtra += `\nThis is a ${buildingInfo.units}-unit building. Analyze ONE unit only.`;
    if (buildingInfo.hvacPerUnit) {
      promptExtra += " Each unit will have its own independent HVAC system.";
    } else {
      promptExtra += ` All units share a single HVAC system.`;
    }
  }

  content.push({ type: "text", text: ANALYSIS_PROMPT + promptExtra });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    let text = response.content[0].type === "text" ? response.content[0].text.trim() : "";

    // Strip markdown fences if present
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    // Extract JSON object
    if (!text.startsWith("{")) {
      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        text = text.substring(jsonStart, jsonEnd + 1);
      }
    }

    const result: AnalysisResult = JSON.parse(text);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Claude Vision analysis failed:", error);
    return NextResponse.json(
      { error: "Analysis failed. Please try again with a clearer image." },
      { status: 500 }
    );
  }
}
```

Note: the `Anthropic` type import is needed. Add this at the top of the file:

```typescript
import Anthropic from "@anthropic-ai/sdk";
```

Wait — it's already imported via the `anthropic` instance. The type `Anthropic.Messages.ContentBlockParam` comes from the SDK's namespace. Verify this compiles.

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/anthropic.ts src/app/api/analyze/
git commit -m "feat: add Claude Vision API route for floorplan analysis"
```

---

## Task 6: Authentication Pages

**Files:**
- Create: `src/app/auth/login/page.tsx`, `src/app/auth/signup/page.tsx`, `src/app/auth/callback/route.ts`

- [ ] **Step 1: Create OAuth callback route**

Create `src/app/auth/callback/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
```

- [ ] **Step 2: Create login page**

Create `src/app/auth/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleGoogleLogin() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Sign in to CoolBid</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={handleGoogleLogin}>
            Continue with Google
          </Button>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/auth/signup" className="text-primary underline">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Create signup page**

Create `src/app/auth/signup/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Update profile with company name
    if (data.user && companyName.trim()) {
      await supabase
        .from("profiles")
        .update({ company_name: companyName.trim() })
        .eq("id", data.user.id);
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Start your 14-day free trial of CoolBid</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company">Company name</Label>
              <Input
                id="company"
                type="text"
                placeholder="Greenfield Heating & Air"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Start free trial"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-primary underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/auth/
git commit -m "feat: add login, signup, and OAuth callback pages"
```

---

## Task 7: App Layout Shell

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/components/layout/sidebar.tsx`, `src/components/layout/header.tsx`

- [ ] **Step 1: Create sidebar**

Create `src/components/layout/sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, FileText, Settings } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/estimates", label: "Estimates", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-muted/40">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="text-lg font-semibold">
          CoolBid
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname.startsWith(item.href)
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Create header**

Create `src/components/layout/header.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User } from "lucide-react";

export function Header({ email }: { email: string }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-end border-b px-6">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <User className="h-4 w-4" />
            {email}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
```

- [ ] **Step 3: Create app layout**

Create `src/app/(app)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header email={user.email ?? ""} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Install lucide-react**

```bash
npm install lucide-react
```

- [ ] **Step 5: Create dashboard page**

Create `src/app/(app)/dashboard/page.tsx`:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Plus } from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: estimates } = await supabase
    .from("estimates")
    .select("id, project_name, customer_name, status, total_price, updated_at")
    .order("updated_at", { ascending: false })
    .limit(5);

  const { count } = await supabase
    .from("estimates")
    .select("*", { count: "exact", head: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button asChild>
          <Link href="/estimates/new">
            <Plus className="mr-2 h-4 w-4" />
            New Estimate
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Estimates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{count ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Recent Estimates
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!estimates?.length ? (
            <p className="text-sm text-muted-foreground">
              No estimates yet.{" "}
              <Link href="/estimates/new" className="text-primary underline">
                Create your first one
              </Link>
            </p>
          ) : (
            <div className="space-y-2">
              {estimates.map((est) => (
                <Link
                  key={est.id}
                  href={`/estimates/${est.id}`}
                  className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted"
                >
                  <div>
                    <p className="font-medium">{est.project_name}</p>
                    {est.customer_name && (
                      <p className="text-sm text-muted-foreground">{est.customer_name}</p>
                    )}
                  </div>
                  <div className="text-right">
                    {est.total_price && (
                      <p className="font-medium">
                        ${Number(est.total_price).toLocaleString()}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground capitalize">{est.status}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/ src/components/layout/
git commit -m "feat: add app layout shell with sidebar, header, and dashboard page"
```

---

## Task 8: Estimator Wizard — Zustand Store

**Files:**
- Create: `src/hooks/use-estimator.ts`

- [ ] **Step 1: Create estimator store**

Create `src/hooks/use-estimator.ts`:

```typescript
import { create } from "zustand";
import type { AnalysisResult, BomResult, ClimateZoneKey, Room } from "@/types/hvac";
import { generateBOM } from "@/lib/hvac/bom-generator";

type EstimatorStep = "upload" | "select_pages" | "analyzing" | "rooms" | "bom";

type PagePreview = {
  pageNum: number;
  previewUrl: string;
  base64: string;
  mediaType: string;
};

type EstimatorState = {
  step: EstimatorStep;
  // Upload
  fileName: string;
  floorplanImg: string | null;
  pdfPages: PagePreview[];
  selectedPages: number[];
  // Building info
  knownTotalSqft: string;
  knownUnits: number;
  hvacPerUnit: boolean;
  climateZone: ClimateZoneKey;
  // Analysis
  analysisProgress: number;
  analysisResult: AnalysisResult | null;
  // Rooms
  rooms: Room[];
  // BOM
  bom: BomResult | null;
  profitMargin: number;
  laborRate: number;
  laborHours: number;
  // Project info
  projectName: string;
  customerName: string;
  supplierName: string;
  // UI
  error: string | null;
  showRFQ: boolean;
};

type EstimatorActions = {
  setStep: (step: EstimatorStep) => void;
  setFile: (fileName: string, img: string | null) => void;
  setPdfPages: (pages: PagePreview[]) => void;
  setSelectedPages: (pages: number[]) => void;
  setBuildingInfo: (info: Partial<Pick<EstimatorState, "knownTotalSqft" | "knownUnits" | "hvacPerUnit" | "climateZone">>) => void;
  setAnalysisProgress: (progress: number) => void;
  setAnalysisResult: (result: AnalysisResult) => void;
  setRooms: (rooms: Room[]) => void;
  updateRoom: (index: number, room: Partial<Room>) => void;
  removeRoom: (index: number) => void;
  addRoom: () => void;
  generateBom: () => void;
  setProjectInfo: (info: Partial<Pick<EstimatorState, "projectName" | "customerName" | "supplierName">>) => void;
  setFinancials: (info: Partial<Pick<EstimatorState, "profitMargin" | "laborRate" | "laborHours">>) => void;
  setError: (error: string | null) => void;
  setShowRFQ: (show: boolean) => void;
  reset: () => void;
};

const initialState: EstimatorState = {
  step: "upload",
  fileName: "",
  floorplanImg: null,
  pdfPages: [],
  selectedPages: [],
  knownTotalSqft: "",
  knownUnits: 1,
  hvacPerUnit: true,
  climateZone: "warm",
  analysisProgress: 0,
  analysisResult: null,
  rooms: [],
  bom: null,
  profitMargin: 35,
  laborRate: 85,
  laborHours: 16,
  projectName: "New HVAC Estimate",
  customerName: "",
  supplierName: "Johnstone Supply",
  error: null,
  showRFQ: false,
};

export const useEstimator = create<EstimatorState & EstimatorActions>((set, get) => ({
  ...initialState,

  setStep: (step) => set({ step }),
  setFile: (fileName, floorplanImg) => set({ fileName, floorplanImg }),
  setPdfPages: (pdfPages) => set({ pdfPages }),
  setSelectedPages: (selectedPages) => set({ selectedPages }),
  setBuildingInfo: (info) => set(info),
  setAnalysisProgress: (analysisProgress) => set({ analysisProgress }),
  setAnalysisResult: (result) =>
    set({
      analysisResult: result,
      rooms: result.rooms,
      step: "rooms",
    }),
  setRooms: (rooms) => set({ rooms }),
  updateRoom: (index, updates) =>
    set((state) => ({
      rooms: state.rooms.map((r, i) => (i === index ? { ...r, ...updates } : r)),
    })),
  removeRoom: (index) =>
    set((state) => ({
      rooms: state.rooms.filter((_, i) => i !== index),
    })),
  addRoom: () =>
    set((state) => ({
      rooms: [
        ...state.rooms,
        {
          name: "New Room",
          type: "bedroom" as const,
          floor: 1,
          estimated_sqft: 120,
          width_ft: 10,
          length_ft: 12,
          window_count: 1,
          exterior_walls: 1,
          ceiling_height: 8,
          notes: "",
        },
      ],
    })),
  generateBom: () => {
    const state = get();
    const bom = generateBOM(
      state.rooms,
      state.climateZone,
      state.analysisResult?.building,
      state.analysisResult?.hvac_notes
    );
    set({ bom, step: "bom" });
  },
  setProjectInfo: (info) => set(info),
  setFinancials: (info) => set(info),
  setError: (error) => set({ error }),
  setShowRFQ: (showRFQ) => set({ showRFQ }),
  reset: () => set(initialState),
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-estimator.ts
git commit -m "feat: add Zustand store for estimator wizard state"
```

---

## Task 9: Estimator Wizard — Upload Step

**Files:**
- Create: `src/components/estimator/upload-step.tsx`, `src/app/(app)/estimates/new/page.tsx`

- [ ] **Step 1: Create upload step component**

Create `src/components/estimator/upload-step.tsx`:

```tsx
"use client";

import { useCallback, useRef } from "react";
import { useEstimator } from "@/hooks/use-estimator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CLIMATE_ZONES } from "@/lib/hvac/climate-zones";
import type { ClimateZoneKey } from "@/types/hvac";
import { Upload } from "lucide-react";

export function UploadStep() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    fileName,
    knownTotalSqft,
    knownUnits,
    hvacPerUnit,
    climateZone,
    projectName,
    customerName,
    setFile,
    setPdfPages,
    setBuildingInfo,
    setProjectInfo,
    setStep,
    setError,
  } = useEstimator();

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const isPdf = file.type === "application/pdf";

      if (isPdf) {
        // Convert PDF pages to images using PDF.js (loaded from CDN)
        setFile(file.name, null);
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdfjsLib = await import("pdfjs-dist");
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const pages = [];

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d")!;
            await page.render({ canvasContext: ctx, viewport }).promise;

            const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
            const previewUrl = canvas.toDataURL("image/jpeg", 0.3);

            pages.push({ pageNum: i, previewUrl, base64, mediaType: "image/jpeg" });
          }

          setPdfPages(pages);
          if (pages.length > 1) {
            setStep("select_pages");
          } else {
            // Single page PDF — go straight to analyzing
            const { setSelectedPages } = useEstimator.getState();
            setSelectedPages([1]);
            setStep("select_pages");
          }
        } catch (err) {
          setError("Failed to read PDF. Please try a different file.");
          console.error(err);
        }
      } else {
        // Image file
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1];
          setFile(file.name, base64);
          setPdfPages([
            {
              pageNum: 1,
              previewUrl: result,
              base64,
              mediaType: file.type as "image/jpeg",
            },
          ]);
          const { setSelectedPages } = useEstimator.getState();
          setSelectedPages([1]);
          setStep("select_pages");
        };
        reader.readAsDataURL(file);
      }
    },
    [setFile, setPdfPages, setStep, setError]
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Project Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                value={projectName}
                onChange={(e) => setProjectInfo({ projectName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer Name</Label>
              <Input
                id="customerName"
                value={customerName}
                onChange={(e) => setProjectInfo({ customerName: e.target.value })}
                placeholder="Homeowner name"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Building Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sqft">Total Heated Sq Ft (if known)</Label>
              <Input
                id="sqft"
                type="number"
                value={knownTotalSqft}
                onChange={(e) => setBuildingInfo({ knownTotalSqft: e.target.value })}
                placeholder="e.g. 1800"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="units">Number of Units</Label>
                <Input
                  id="units"
                  type="number"
                  min={1}
                  max={8}
                  value={knownUnits}
                  onChange={(e) => setBuildingInfo({ knownUnits: parseInt(e.target.value) || 1 })}
                />
              </div>
              {knownUnits > 1 && (
                <div className="space-y-2">
                  <Label>HVAC Config</Label>
                  <Select
                    value={hvacPerUnit ? "per_unit" : "shared"}
                    onValueChange={(v) => setBuildingInfo({ hvacPerUnit: v === "per_unit" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_unit">Per Unit</SelectItem>
                      <SelectItem value="shared">Shared System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Climate Zone</Label>
              <Select
                value={climateZone}
                onValueChange={(v) => setBuildingInfo({ climateZone: v as ClimateZoneKey })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CLIMATE_ZONES).map(([key, zone]) => (
                    <SelectItem key={key} value={key}>
                      {zone.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Floorplan</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors hover:border-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-medium">
              {fileName || "Click to upload a floorplan"}
            </p>
            <p className="text-sm text-muted-foreground">PDF or image (PNG, JPG)</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Create estimator wizard page**

Create `src/app/(app)/estimates/new/page.tsx`:

```tsx
"use client";

import { useEstimator } from "@/hooks/use-estimator";
import { UploadStep } from "@/components/estimator/upload-step";
import { Badge } from "@/components/ui/badge";

const STEP_LABELS: Record<string, string> = {
  upload: "Upload",
  select_pages: "Select Pages",
  analyzing: "Analyzing",
  rooms: "Rooms",
  bom: "Bill of Materials",
};

export default function NewEstimatePage() {
  const step = useEstimator((s) => s.step);
  const error = useEstimator((s) => s.error);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New Estimate</h1>
        <div className="flex gap-2">
          {Object.entries(STEP_LABELS).map(([key, label]) => (
            <Badge key={key} variant={step === key ? "default" : "outline"}>
              {label}
            </Badge>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {step === "upload" && <UploadStep />}
      {step === "select_pages" && <div>Page selection (Task 10)</div>}
      {step === "analyzing" && <div>Analyzing (Task 10)</div>}
      {step === "rooms" && <div>Rooms (Task 11)</div>}
      {step === "bom" && <div>BOM (Task 12)</div>}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/estimator/upload-step.tsx src/app/\(app\)/estimates/new/
git commit -m "feat: add estimator wizard upload step with PDF.js integration"
```

---

## Task 10: Estimator Wizard — Page Select & Analysis Steps

**Files:**
- Create: `src/components/estimator/page-select-step.tsx`, `src/components/estimator/analyzing-step.tsx`

- [ ] **Step 1: Create page select step**

Create `src/components/estimator/page-select-step.tsx`:

```tsx
"use client";

import { useEstimator } from "@/hooks/use-estimator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageSelectStep() {
  const { pdfPages, selectedPages, setSelectedPages, setStep } = useEstimator();

  function togglePage(pageNum: number) {
    setSelectedPages(
      selectedPages.includes(pageNum)
        ? selectedPages.filter((p) => p !== pageNum)
        : [...selectedPages, pageNum]
    );
  }

  async function handleAnalyze() {
    if (selectedPages.length === 0) return;
    setStep("analyzing");
  }

  if (pdfPages.length <= 1) {
    // Single page — skip selection, go to analyze
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-8">
          {pdfPages[0] && (
            <img
              src={pdfPages[0].previewUrl}
              alt="Floorplan preview"
              className="max-h-96 rounded border"
            />
          )}
          <Button onClick={handleAnalyze} size="lg">
            Analyze Floorplan
          </Button>
          <Button variant="ghost" onClick={() => setStep("upload")}>
            Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Select Pages with Floor Plans</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Click pages that contain floor plans. Skip elevations, roof plans, and details.
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {pdfPages.map((page) => (
              <div
                key={page.pageNum}
                onClick={() => togglePage(page.pageNum)}
                className={cn(
                  "cursor-pointer rounded-lg border-2 p-2 transition-colors",
                  selectedPages.includes(page.pageNum)
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:border-muted-foreground/30"
                )}
              >
                <img
                  src={page.previewUrl}
                  alt={`Page ${page.pageNum}`}
                  className="w-full rounded"
                />
                <p className="mt-1 text-center text-sm font-medium">
                  Page {page.pageNum}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => setStep("upload")}>
          Back
        </Button>
        <Button onClick={handleAnalyze} disabled={selectedPages.length === 0}>
          Analyze {selectedPages.length} Page{selectedPages.length !== 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create analyzing step**

Create `src/components/estimator/analyzing-step.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useEstimator } from "@/hooks/use-estimator";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export function AnalyzingStep() {
  const {
    pdfPages,
    selectedPages,
    knownTotalSqft,
    knownUnits,
    hvacPerUnit,
    setAnalysisResult,
    setStep,
    setError,
  } = useEstimator();
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    async function analyze() {
      const images = pdfPages
        .filter((p) => selectedPages.includes(p.pageNum))
        .map((p) => ({
          base64: p.base64,
          mediaType: p.mediaType,
          pageNum: p.pageNum,
        }));

      if (images.length === 0) {
        setError("No pages selected for analysis.");
        setStep("select_pages");
        return;
      }

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            images,
            buildingInfo: {
              totalSqft: knownTotalSqft ? Number(knownTotalSqft) : undefined,
              units: knownUnits > 1 ? knownUnits : undefined,
              hvacPerUnit: knownUnits > 1 ? hvacPerUnit : undefined,
            },
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Analysis failed" }));
          throw new Error(err.error || `Analysis failed (${response.status})`);
        }

        const result = await response.json();
        setAnalysisResult(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Analysis failed. Please try again.");
        setStep("select_pages");
      }
    }

    analyze();
  }, []);

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-16">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-lg font-medium">Analyzing floorplan...</p>
        <p className="text-sm text-muted-foreground">
          AI is reading dimensions, identifying rooms, and calculating areas.
          This usually takes 10-30 seconds.
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Wire into wizard page**

Update `src/app/(app)/estimates/new/page.tsx` — replace the placeholder lines:

```tsx
{step === "select_pages" && <div>Page selection (Task 10)</div>}
{step === "analyzing" && <div>Analyzing (Task 10)</div>}
```

with:

```tsx
{step === "select_pages" && <PageSelectStep />}
{step === "analyzing" && <AnalyzingStep />}
```

And add imports at the top:

```tsx
import { PageSelectStep } from "@/components/estimator/page-select-step";
import { AnalyzingStep } from "@/components/estimator/analyzing-step";
```

- [ ] **Step 4: Commit**

```bash
git add src/components/estimator/page-select-step.tsx src/components/estimator/analyzing-step.tsx src/app/\(app\)/estimates/new/page.tsx
git commit -m "feat: add page selection and AI analysis steps to estimator wizard"
```

---

## Task 11: Estimator Wizard — Rooms Step

**Files:**
- Create: `src/components/estimator/rooms-step.tsx`

- [ ] **Step 1: Create rooms step**

Create `src/components/estimator/rooms-step.tsx`:

```tsx
"use client";

import { useEstimator } from "@/hooks/use-estimator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROOM_TYPES } from "@/lib/hvac/parts-db";
import type { RoomType } from "@/types/hvac";
import { Plus, Trash2 } from "lucide-react";

export function RoomsStep() {
  const {
    rooms,
    analysisResult,
    updateRoom,
    removeRoom,
    addRoom,
    generateBom,
    setStep,
  } = useEstimator();

  const totalSqft = rooms.reduce((sum, r) => sum + (r.estimated_sqft || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {rooms.length} Rooms Detected — {totalSqft.toLocaleString()} sq ft
          </h2>
          {analysisResult && (
            <p className="text-sm text-muted-foreground">
              Confidence: {analysisResult.confidence} | {analysisResult.building.stories} story
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={addRoom}>
          <Plus className="mr-2 h-4 w-4" />
          Add Room
        </Button>
      </div>

      {rooms.map((room, i) => (
        <Card key={i}>
          <CardContent className="grid grid-cols-2 gap-4 pt-4 md:grid-cols-4 lg:grid-cols-7">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                value={room.name}
                onChange={(e) => updateRoom(i, { name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select
                value={room.type}
                onValueChange={(v) => updateRoom(i, { type: v as RoomType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sq Ft</Label>
              <Input
                type="number"
                value={room.estimated_sqft || ""}
                onChange={(e) =>
                  updateRoom(i, { estimated_sqft: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Windows</Label>
              <Input
                type="number"
                min={0}
                value={room.window_count}
                onChange={(e) =>
                  updateRoom(i, { window_count: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ext. Walls</Label>
              <Input
                type="number"
                min={0}
                max={4}
                value={room.exterior_walls}
                onChange={(e) =>
                  updateRoom(i, { exterior_walls: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ceiling (ft)</Label>
              <Input
                type="number"
                value={room.ceiling_height}
                onChange={(e) =>
                  updateRoom(i, { ceiling_height: parseFloat(e.target.value) || 8 })
                }
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeRoom(i)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => setStep("select_pages")}>
          Back
        </Button>
        <Button onClick={generateBom} disabled={rooms.length === 0}>
          Generate Bill of Materials
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into wizard page**

Update `src/app/(app)/estimates/new/page.tsx` — replace:

```tsx
{step === "rooms" && <div>Rooms (Task 11)</div>}
```

with:

```tsx
{step === "rooms" && <RoomsStep />}
```

Add import:

```tsx
import { RoomsStep } from "@/components/estimator/rooms-step";
```

- [ ] **Step 3: Commit**

```bash
git add src/components/estimator/rooms-step.tsx src/app/\(app\)/estimates/new/page.tsx
git commit -m "feat: add rooms review and editing step to estimator wizard"
```

---

## Task 12: Estimator Wizard — BOM Step

**Files:**
- Create: `src/components/estimator/bom-step.tsx`

- [ ] **Step 1: Create BOM step**

Create `src/components/estimator/bom-step.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEstimator } from "@/hooks/use-estimator";
import { createClient } from "@/lib/supabase/client";
import { generateRFQText, generateRFQCSV } from "@/lib/hvac/rfq";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Save, FileText, Download } from "lucide-react";

export function BomStep() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [showRFQ, setShowRFQ] = useState(false);

  const {
    bom,
    rooms,
    analysisResult,
    profitMargin,
    laborRate,
    laborHours,
    projectName,
    customerName,
    supplierName,
    climateZone,
    knownTotalSqft,
    knownUnits,
    hvacPerUnit,
    setFinancials,
    setProjectInfo,
    setStep,
  } = useEstimator();

  if (!bom) return null;

  const materialCost = bom.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const laborCost = laborRate * laborHours;
  const subtotal = materialCost + laborCost;
  const markup = subtotal * (profitMargin / 100);
  const totalPrice = subtotal + markup;

  // Group items by category
  const categories: Record<string, typeof bom.items> = {};
  for (const item of bom.items) {
    if (!categories[item.category]) categories[item.category] = [];
    categories[item.category].push(item);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create estimate
      const { data: estimate, error: estError } = await supabase
        .from("estimates")
        .insert({
          user_id: user.id,
          project_name: projectName,
          customer_name: customerName,
          total_sqft: knownTotalSqft ? Number(knownTotalSqft) : bom.summary.condSqft,
          num_units: knownUnits,
          hvac_per_unit: hvacPerUnit,
          climate_zone: climateZone,
          profit_margin: profitMargin,
          labor_rate: laborRate,
          labor_hours: laborHours,
          supplier_name: supplierName,
          total_material_cost: materialCost,
          total_price: totalPrice,
        })
        .select("id")
        .single();

      if (estError) throw estError;

      // Save rooms
      const roomInserts = rooms.map((room) => ({
        estimate_id: estimate.id,
        name: room.name,
        type: room.type,
        floor: room.floor,
        sqft: room.estimated_sqft,
        length_ft: room.length_ft,
        width_ft: room.width_ft,
        ceiling_height: room.ceiling_height,
        window_count: room.window_count,
        exterior_walls: room.exterior_walls,
        notes: room.notes,
      }));

      const { error: roomError } = await supabase
        .from("estimate_rooms")
        .insert(roomInserts);
      if (roomError) throw roomError;

      // Save BOM items
      const bomInserts = bom.items.map((item) => ({
        estimate_id: estimate.id,
        category: item.category,
        description: item.name,
        quantity: item.qty,
        unit: item.unit,
        unit_cost: item.price,
        total_cost: item.price * item.qty,
        part_id: item.partId,
        supplier: item.supplier,
        sku: item.sku,
        notes: item.notes,
        source: item.source,
      }));

      const { error: bomError } = await supabase
        .from("estimate_bom_items")
        .insert(bomInserts);
      if (bomError) throw bomError;

      // Save floorplan analysis result
      if (analysisResult) {
        await supabase.from("floorplans").insert({
          estimate_id: estimate.id,
          storage_path: "",
          file_name: useEstimator.getState().fileName,
          file_type: "analyzed",
          analysis_result: analysisResult as unknown as Record<string, unknown>,
        });
      }

      router.push(`/estimates/${estimate.id}`);
    } catch (err) {
      console.error("Failed to save estimate:", err);
      alert("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleExportRFQ() {
    const profile = {
      companyName: "",
      companyPhone: "",
      companyEmail: "",
      supplierName,
      projectName,
      customerName,
    };
    const text = generateRFQText(bom, profile);
    navigator.clipboard.writeText(text);
    alert("RFQ copied to clipboard!");
  }

  function handleExportCSV() {
    const csv = generateRFQCSV(bom);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, "-")}-rfq.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">System Size</p>
            <p className="text-2xl font-bold">{bom.summary.tonnage} Ton</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Design BTU</p>
            <p className="text-2xl font-bold">{bom.summary.designBTU.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Materials</p>
            <p className="text-2xl font-bold">${materialCost.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Price</p>
            <p className="text-2xl font-bold text-primary">
              ${totalPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Financials */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Profit Margin (%)</Label>
              <Input
                type="number"
                value={profitMargin}
                onChange={(e) =>
                  setFinancials({ profitMargin: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Labor Rate ($/hr)</Label>
              <Input
                type="number"
                value={laborRate}
                onChange={(e) =>
                  setFinancials({ laborRate: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Labor Hours</Label>
              <Input
                type="number"
                value={laborHours}
                onChange={(e) =>
                  setFinancials({ laborHours: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <Separator className="my-4" />
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Materials</span>
              <span>${materialCost.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Labor ({laborHours}h × ${laborRate}/hr)</span>
              <span>${laborCost.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Markup ({profitMargin}%)</span>
              <span>${markup.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span>${totalPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* BOM Table */}
      {Object.entries(categories).map(([cat, items]) => (
        <Card key={cat}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {cat}
              <Badge variant="outline">{items.length} items</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2">Description</th>
                    <th className="pb-2">SKU</th>
                    <th className="pb-2 text-right">Qty</th>
                    <th className="pb-2 text-right">Unit</th>
                    <th className="pb-2 text-right">Price</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2">
                        {item.name}
                        {item.notes && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({item.notes})
                          </span>
                        )}
                      </td>
                      <td className="py-2 font-mono text-xs">{item.sku}</td>
                      <td className="py-2 text-right">{item.qty}</td>
                      <td className="py-2 text-right">{item.unit}</td>
                      <td className="py-2 text-right">${item.price.toLocaleString()}</td>
                      <td className="py-2 text-right font-medium">
                        ${(item.price * item.qty).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Supplier */}
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-2">
            <Label>Supplier Name (for RFQ)</Label>
            <Input
              value={supplierName}
              onChange={(e) => setProjectInfo({ supplierName: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button variant="ghost" onClick={() => setStep("rooms")}>
          Back to Rooms
        </Button>
        <div className="flex-1" />
        <Button variant="outline" onClick={handleExportRFQ}>
          <FileText className="mr-2 h-4 w-4" />
          Copy RFQ
        </Button>
        <Button variant="outline" onClick={handleExportCSV}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving..." : "Save Estimate"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into wizard page**

Update `src/app/(app)/estimates/new/page.tsx` — replace:

```tsx
{step === "bom" && <div>BOM (Task 12)</div>}
```

with:

```tsx
{step === "bom" && <BomStep />}
```

Add import:

```tsx
import { BomStep } from "@/components/estimator/bom-step";
```

- [ ] **Step 3: Commit**

```bash
git add src/components/estimator/bom-step.tsx src/app/\(app\)/estimates/new/page.tsx
git commit -m "feat: add BOM generation step with pricing, RFQ export, and save to DB"
```

---

## Task 13: Estimate List & Detail Pages

**Files:**
- Create: `src/app/(app)/estimates/page.tsx`, `src/app/(app)/estimates/[id]/page.tsx`

- [ ] **Step 1: Create estimates list page**

Create `src/app/(app)/estimates/page.tsx`:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

const STATUS_COLORS: Record<string, "default" | "secondary" | "outline"> = {
  draft: "outline",
  sent: "secondary",
  accepted: "default",
};

export default async function EstimatesPage() {
  const supabase = await createClient();
  const { data: estimates } = await supabase
    .from("estimates")
    .select("*")
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Estimates</h1>
        <Button asChild>
          <Link href="/estimates/new">
            <Plus className="mr-2 h-4 w-4" />
            New Estimate
          </Link>
        </Button>
      </div>

      {!estimates?.length ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No estimates yet.</p>
            <Button asChild className="mt-4">
              <Link href="/estimates/new">Create your first estimate</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {estimates.map((est) => (
            <Link key={est.id} href={`/estimates/${est.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{est.project_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {est.customer_name || "No customer"}
                      {est.total_sqft && ` · ${Number(est.total_sqft).toLocaleString()} sq ft`}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {est.total_price && (
                      <p className="text-lg font-semibold">
                        ${Number(est.total_price).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    )}
                    <Badge variant={STATUS_COLORS[est.status] ?? "outline"}>
                      {est.status}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {new Date(est.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create estimate detail page**

Create `src/app/(app)/estimates/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: estimate } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", id)
    .single();

  if (!estimate) notFound();

  const { data: rooms } = await supabase
    .from("estimate_rooms")
    .select("*")
    .eq("estimate_id", id)
    .order("created_at");

  const { data: bomItems } = await supabase
    .from("estimate_bom_items")
    .select("*")
    .eq("estimate_id", id)
    .order("created_at");

  const materialCost = bomItems?.reduce((sum, item) => sum + Number(item.total_cost), 0) ?? 0;
  const laborCost = Number(estimate.labor_rate) * Number(estimate.labor_hours);

  // Group BOM by category
  const categories: Record<string, typeof bomItems> = {};
  for (const item of bomItems ?? []) {
    if (!categories[item.category]) categories[item.category] = [];
    categories[item.category].push(item);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/estimates">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{estimate.project_name}</h1>
          <p className="text-sm text-muted-foreground">
            {estimate.customer_name || "No customer"}
            {estimate.total_sqft && ` · ${Number(estimate.total_sqft).toLocaleString()} sq ft`}
          </p>
        </div>
        <Badge>{estimate.status}</Badge>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Materials</p>
            <p className="text-2xl font-bold">${materialCost.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Labor</p>
            <p className="text-2xl font-bold">${laborCost.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Margin</p>
            <p className="text-2xl font-bold">{Number(estimate.profit_margin)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Price</p>
            <p className="text-2xl font-bold text-primary">
              ${Number(estimate.total_price ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Rooms */}
      <Card>
        <CardHeader>
          <CardTitle>{rooms?.length ?? 0} Rooms</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2 text-right">Sq Ft</th>
                  <th className="pb-2 text-right">Windows</th>
                  <th className="pb-2 text-right">Ext. Walls</th>
                </tr>
              </thead>
              <tbody>
                {rooms?.map((room) => (
                  <tr key={room.id} className="border-b last:border-0">
                    <td className="py-2">{room.name}</td>
                    <td className="py-2 capitalize">{room.type.replace(/_/g, " ")}</td>
                    <td className="py-2 text-right">{Number(room.sqft ?? 0).toLocaleString()}</td>
                    <td className="py-2 text-right">{room.window_count}</td>
                    <td className="py-2 text-right">{room.exterior_walls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* BOM */}
      {Object.entries(categories).map(([cat, items]) => (
        <Card key={cat}>
          <CardHeader>
            <CardTitle>
              {cat}
              <Badge variant="outline" className="ml-2">
                {items.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2">Description</th>
                    <th className="pb-2">SKU</th>
                    <th className="pb-2 text-right">Qty</th>
                    <th className="pb-2 text-right">Unit Cost</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-2">{item.description}</td>
                      <td className="py-2 font-mono text-xs">{item.sku}</td>
                      <td className="py-2 text-right">{Number(item.quantity)}</td>
                      <td className="py-2 text-right">
                        ${Number(item.unit_cost).toLocaleString()}
                      </td>
                      <td className="py-2 text-right font-medium">
                        ${Number(item.total_cost).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/estimates/
git commit -m "feat: add estimate list and detail pages"
```

---

## Task 14: Settings Page

**Files:**
- Create: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Create settings page**

Create `src/app/(app)/settings/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export default function SettingsPage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) setProfile(data);
      setLoading(false);
    }
    loadProfile();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from("profiles")
      .update({
        company_name: profile.company_name,
        company_email: profile.company_email,
        company_phone: profile.company_phone,
        address: profile.address,
        state: profile.state,
        zip: profile.zip,
      })
      .eq("id", profile.id);

    setSaving(false);
    setMessage(error ? error.message : "Settings saved.");
  }

  if (loading) return <p>Loading...</p>;
  if (!profile) return <p>Profile not found.</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Company Profile</CardTitle>
          <CardDescription>
            This info appears on your estimates and RFQs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={profile.company_name}
                onChange={(e) =>
                  setProfile({ ...profile, company_name: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.company_email}
                  onChange={(e) =>
                    setProfile({ ...profile, company_email: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={profile.company_phone}
                  onChange={(e) =>
                    setProfile({ ...profile, company_phone: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={profile.address}
                onChange={(e) =>
                  setProfile({ ...profile, address: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={profile.state}
                  onChange={(e) =>
                    setProfile({ ...profile, state: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">ZIP</Label>
                <Input
                  id="zip"
                  value={profile.zip}
                  onChange={(e) =>
                    setProfile({ ...profile, zip: e.target.value })
                  }
                />
              </div>
            </div>

            {message && (
              <p className="text-sm text-muted-foreground">{message}</p>
            )}

            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>
            {profile.subscription_status === "trialing"
              ? `Free trial${profile.trial_ends_at ? ` ends ${new Date(profile.trial_ends_at).toLocaleDateString()}` : ""}`
              : `Status: ${profile.subscription_status}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Stripe billing integration coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(app\)/settings/
git commit -m "feat: add settings page with company profile editing"
```

---

## Task 15: Landing Page

**Files:**
- Create: `src/app/(marketing)/layout.tsx`, `src/app/(marketing)/page.tsx`

- [ ] **Step 1: Create marketing layout**

Create `src/app/(marketing)/layout.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <Link href="/" className="text-lg font-bold">
          CoolBid
        </Link>
        <div className="flex gap-2">
          <Button variant="ghost" asChild>
            <Link href="/auth/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/auth/signup">Start free trial</Link>
          </Button>
        </div>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create landing page**

Create `src/app/(marketing)/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Zap, DollarSign, Upload } from "lucide-react";

const features = [
  {
    icon: Upload,
    title: "Upload a Floorplan",
    desc: "PDF or image — our AI reads the dimensions for you.",
  },
  {
    icon: Zap,
    title: "AI Room Analysis",
    desc: "Claude Vision identifies every room, window, and wall in seconds.",
  },
  {
    icon: FileText,
    title: "Instant BOM",
    desc: "Full bill of materials with equipment, ductwork, and installation supplies.",
  },
  {
    icon: DollarSign,
    title: "Professional Quotes",
    desc: "Export RFQs to suppliers. Adjust margins and labor. Save and track estimates.",
  },
];

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 px-4 py-24 text-center">
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight">
          HVAC Estimates in Minutes, Not Hours
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Upload a floorplan, let AI analyze the rooms, and get a complete bill
          of materials with pricing. Built for residential HVAC contractors.
        </p>
        <div className="flex gap-4">
          <Button size="lg" asChild>
            <Link href="/auth/signup">Start Free Trial</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/auth/login">Sign In</Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          14-day free trial. No credit card required.
        </p>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <div className="grid gap-6 md:grid-cols-2">
          {features.map((f) => (
            <Card key={f.title}>
              <CardContent className="flex gap-4 pt-6">
                <f.icon className="h-8 w-8 shrink-0 text-primary" />
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="flex flex-col items-center gap-4 px-4 py-16">
        <h2 className="text-3xl font-bold">Ready to speed up your estimates?</h2>
        <Button size="lg" asChild>
          <Link href="/auth/signup">Get Started Free</Link>
        </Button>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Update root page redirect**

The default `src/app/page.tsx` from create-next-app should be replaced. Since our `(marketing)/page.tsx` matches the root route `/`, delete the original `src/app/page.tsx` if it conflicts, or ensure the marketing route group takes precedence. If both exist, the one at `src/app/page.tsx` wins — so we need to either delete it or make it the marketing page directly.

Delete `src/app/page.tsx` and move the landing page content there, OR keep the route group. The simplest approach: delete the default `src/app/page.tsx` since `(marketing)/page.tsx` will serve `/`.

```bash
rm src/app/page.tsx
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(marketing\)/ && git rm src/app/page.tsx 2>/dev/null; git commit -m "feat: add landing page and marketing layout"
```

---

## Task 16: Estimates API Route

**Files:**
- Create: `src/app/api/estimates/route.ts`, `src/app/api/estimates/[id]/route.ts`

- [ ] **Step 1: Create estimates list/create route**

Create `src/app/api/estimates/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("estimates")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
```

- [ ] **Step 2: Create estimate CRUD route**

Create `src/app/api/estimates/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.from("estimates").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/estimates/
git commit -m "feat: add estimates API routes for list, get, and delete"
```

---

## Task 17: Final Wiring & Build Verification

- [ ] **Step 1: Ensure root layout has proper defaults**

Check `src/app/layout.tsx` has the correct metadata and body setup. Update if needed:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoolBid — HVAC Estimating Made Easy",
  description: "Upload a floorplan, get a complete HVAC bill of materials in minutes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Verify full build compiles**

```bash
npm run build
```

Fix any type errors that surface. Common issues:
- Missing `Dialog` import (check shadcn installed it)
- PDF.js types may need `@types/pdfjs-dist` or type assertions
- Ensure all file paths match exactly

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build errors and finalize wiring"
```

- [ ] **Step 4: Verify dev server runs end-to-end**

```bash
npm run dev
```

Test manually:
1. Visit `http://localhost:3000` — landing page loads
2. Click "Start Free Trial" — signup page loads
3. (After Supabase setup) — sign up, land on dashboard, create estimate

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: CoolBid V1 foundation complete — auth, estimator wizard, estimate CRUD"
```
