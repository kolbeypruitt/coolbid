-- ============================================================
-- 001_initial.sql  —  CoolBid V1 Schema
-- ============================================================

-- ============================================================
-- Helper: updated_at trigger function
-- ============================================================
create or replace function update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 1. profiles
-- ============================================================
create table profiles (
  id                  uuid        primary key references auth.users(id) on delete cascade,
  company_name        text        not null default '',
  company_email       text        not null default '',
  company_phone       text        not null default '',
  address             text        not null default '',
  state               text        not null default '',
  zip                 text        not null default '',
  stripe_customer_id  text,
  subscription_tier   text        not null default 'trial',
  subscription_status text        not null default 'trialing',
  trial_ends_at       timestamptz not null default (now() + interval '14 days'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- ============================================================
-- 2. estimates
-- ============================================================
create table estimates (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references profiles(id) on delete cascade,
  project_name       text        not null default 'New HVAC Estimate',
  customer_name      text        not null default '',
  status             text        not null default 'draft'
                                 check (status in ('draft', 'sent', 'accepted')),
  total_sqft         numeric,
  num_units          int         not null default 1,
  hvac_per_unit      boolean     not null default true,
  climate_zone       text        not null default 'warm',
  profit_margin      numeric     not null default 35,
  labor_rate         numeric     not null default 85,
  labor_hours        numeric     not null default 16,
  supplier_name      text        not null default '',
  total_material_cost numeric,
  total_price        numeric,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger estimates_updated_at
  before update on estimates
  for each row execute function update_updated_at();

-- ============================================================
-- 3. estimate_rooms
-- ============================================================
create table estimate_rooms (
  id              uuid        primary key default gen_random_uuid(),
  estimate_id     uuid        not null references estimates(id) on delete cascade,
  name            text,
  type            text,
  floor           int         not null default 1,
  sqft            numeric,
  length_ft       numeric,
  width_ft        numeric,
  ceiling_height  numeric     not null default 8,
  window_count    int         not null default 0,
  exterior_walls  int         not null default 0,
  btu_load        numeric,
  tonnage         numeric,
  cfm_required    numeric,
  notes           text        not null default '',
  created_at      timestamptz not null default now()
);

-- ============================================================
-- 4. estimate_bom_items
-- ============================================================
create table estimate_bom_items (
  id          uuid        primary key default gen_random_uuid(),
  estimate_id uuid        not null references estimates(id) on delete cascade,
  category    text,
  description text,
  quantity    numeric,
  unit        text,
  unit_cost   numeric,
  total_cost  numeric,
  part_id     text,
  supplier    text,
  sku         text,
  notes       text        not null default '',
  source      text        not null default 'default',
  room_id     uuid        references estimate_rooms(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 5. floorplans
-- ============================================================
create table floorplans (
  id               uuid        primary key default gen_random_uuid(),
  estimate_id      uuid        not null references estimates(id) on delete cascade,
  storage_path     text,
  file_name        text,
  file_type        text,
  page_numbers     int[]       not null default '{}',
  analysis_result  jsonb,
  created_at       timestamptz not null default now()
);

-- ============================================================
-- Indexes on FK columns (Postgres does not auto-index FKs)
-- ============================================================
create index on estimates          (user_id);
create index on estimate_rooms     (estimate_id);
create index on estimate_bom_items (estimate_id);
create index on estimate_bom_items (room_id);
create index on floorplans         (estimate_id);

-- ============================================================
-- Row-Level Security
-- ============================================================
alter table profiles          enable row level security;
alter table estimates         enable row level security;
alter table estimate_rooms    enable row level security;
alter table estimate_bom_items enable row level security;
alter table floorplans        enable row level security;

-- profiles
create policy "profiles: select own"
  on profiles for select
  using (auth.uid() = id);

create policy "profiles: update own"
  on profiles for update
  using (auth.uid() = id);

-- estimates
create policy "estimates: all own"
  on estimates for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- estimate_rooms
create policy "estimate_rooms: all own"
  on estimate_rooms for all
  using (
    exists (
      select 1 from estimates
      where estimates.id = estimate_rooms.estimate_id
        and estimates.user_id = auth.uid()
    )
  );

-- estimate_bom_items
create policy "estimate_bom_items: all own"
  on estimate_bom_items for all
  using (
    exists (
      select 1 from estimates
      where estimates.id = estimate_bom_items.estimate_id
        and estimates.user_id = auth.uid()
    )
  );

-- floorplans
create policy "floorplans: all own"
  on floorplans for all
  using (
    exists (
      select 1 from estimates
      where estimates.id = floorplans.estimate_id
        and estimates.user_id = auth.uid()
    )
  );

-- ============================================================
-- Auto-create profile on sign-up
-- ============================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- Storage: floorplans bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('floorplans', 'floorplans', false)
on conflict (id) do nothing;

-- Storage RLS policies
create policy "floorplans storage: insert own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'floorplans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "floorplans storage: select own folder"
  on storage.objects for select
  using (
    bucket_id = 'floorplans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "floorplans storage: delete own folder"
  on storage.objects for delete
  using (
    bucket_id = 'floorplans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
