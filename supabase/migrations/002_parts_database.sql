-- ============================================================
-- 002_parts_database.sql  —  CoolBid Parts Database V2 Schema
-- ============================================================

-- ============================================================
-- ALTER existing tables
-- ============================================================
alter table profiles
  add column onboarding_completed boolean default false;

alter table estimates
  add column system_type text default 'gas_ac'
    check (system_type in ('heat_pump', 'gas_ac', 'electric', 'dual_fuel'));

-- ============================================================
-- 1. suppliers
-- ============================================================
create table suppliers (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references profiles(id) on delete cascade,
  name            text        not null,
  contact_email   text        default '',
  contact_phone   text        default '',
  brands          text[]      default '{}',
  is_starter      boolean     default false,
  created_at      timestamptz not null default now()
);

create index on suppliers (user_id);

alter table suppliers enable row level security;

create policy "suppliers: all own"
  on suppliers for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 2. equipment_catalog
-- ============================================================
create table equipment_catalog (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references profiles(id) on delete cascade,
  supplier_id       uuid        references suppliers(id) on delete set null,
  model_number      text        not null,
  description       text        not null,
  equipment_type    text        not null,
  system_type       text        default 'universal',
  brand             text        default '',
  tonnage           numeric,
  seer_rating       numeric,
  btu_capacity      numeric,
  stages            int,
  refrigerant_type  text,
  unit_price        numeric,
  unit_of_measure   text        default 'ea',
  source            text        not null default 'starter'
                                check (source in ('starter', 'quote', 'manual')),
  usage_count       int         default 0,
  last_quoted_date  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on equipment_catalog (user_id, equipment_type, tonnage);
create index on equipment_catalog (supplier_id);

create trigger equipment_catalog_updated_at
  before update on equipment_catalog
  for each row execute function update_updated_at();

alter table equipment_catalog enable row level security;

create policy "equipment_catalog: all own"
  on equipment_catalog for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 3. quotes
-- ============================================================
create table quotes (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references profiles(id) on delete cascade,
  supplier_id   uuid        references suppliers(id) on delete set null,
  quote_number  text        default '',
  quote_date    date,
  subtotal      numeric,
  tax           numeric,
  total         numeric,
  file_name     text        not null,
  storage_path  text        default '',
  status        text        not null default 'parsed'
                            check (status in ('parsed', 'reviewing', 'saved')),
  created_at    timestamptz not null default now()
);

create index on quotes (user_id);
create index on quotes (supplier_id);

alter table quotes enable row level security;

create policy "quotes: all own"
  on quotes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 4. quote_lines
-- ============================================================
create table quote_lines (
  id               uuid        primary key default gen_random_uuid(),
  quote_id         uuid        not null references quotes(id) on delete cascade,
  catalog_item_id  uuid        references equipment_catalog(id) on delete set null,
  model_number     text        default '',
  description      text        not null,
  equipment_type   text        default '',
  brand            text        default '',
  tonnage          numeric,
  seer_rating      numeric,
  btu_capacity     numeric,
  stages           int,
  refrigerant_type text,
  quantity         numeric     default 1,
  unit_price       numeric,
  extended_price   numeric,
  selected         boolean     default true,
  created_at       timestamptz not null default now()
);

create index on quote_lines (quote_id);
create index on quote_lines (catalog_item_id);

alter table quote_lines enable row level security;

create policy "quote_lines: all own"
  on quote_lines for all
  using (
    exists (
      select 1 from quotes
      where quotes.id = quote_lines.quote_id
        and quotes.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from quotes
      where quotes.id = quote_lines.quote_id
        and quotes.user_id = auth.uid()
    )
  );

-- ============================================================
-- 5. price_history
-- ============================================================
create table price_history (
  id               uuid        primary key default gen_random_uuid(),
  catalog_item_id  uuid        not null references equipment_catalog(id) on delete cascade,
  supplier_id      uuid        references suppliers(id) on delete set null,
  price            numeric     not null,
  quote_date       date,
  quote_id         uuid        references quotes(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index on price_history (catalog_item_id);

alter table price_history enable row level security;

create policy "price_history: all own"
  on price_history for all
  using (
    exists (
      select 1 from equipment_catalog
      where equipment_catalog.id = price_history.catalog_item_id
        and equipment_catalog.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from equipment_catalog
      where equipment_catalog.id = price_history.catalog_item_id
        and equipment_catalog.user_id = auth.uid()
    )
  );

-- ============================================================
-- Trigger: sync latest price back to equipment_catalog
-- ============================================================
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

create trigger price_history_sync_catalog
  after insert on price_history
  for each row execute function public.update_catalog_price();
