-- ============================================================
-- 014_vendor_catalog.sql  —  Scraped vendor product catalogs
-- ============================================================
-- Adds a global, app-wide product catalog populated by external
-- scrapers (johnstonesupply, lockesupply, ...). These rows are NOT
-- per-user — they're a shared reference dataset that any signed-in
-- user can browse. A user can later "import" a vendor product into
-- their own equipment_catalog via the new vendor_product_id FK.

-- ============================================================
-- 1. vendors
-- ============================================================
create table vendors (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        not null unique,
  name        text        not null,
  base_url    text        not null,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

alter table vendors enable row level security;

create policy "vendors: read all"
  on vendors for select
  using (true);

-- ============================================================
-- 2. vendor_products
-- ============================================================
create table vendor_products (
  id                 uuid        primary key default gen_random_uuid(),
  vendor_id          uuid        not null references vendors(id) on delete cascade,
  sku                text        not null,
  mpn                text,
  name               text        not null,
  brand              text,
  image_url          text,
  short_description  text,
  catalog_page       text,
  category_root      text,
  category_path      text,
  category_leaf      text,
  cat1               text,
  detail_url         text,
  raw                jsonb,
  scraped_at         timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (vendor_id, sku)
);

create index on vendor_products (vendor_id, category_root);
create index on vendor_products (vendor_id, brand);
create index on vendor_products
  using gin (
    to_tsvector(
      'english',
      name || ' ' || coalesce(brand, '') || ' ' || coalesce(mpn, '')
    )
  );

create trigger vendor_products_updated_at
  before update on vendor_products
  for each row execute function update_updated_at();

alter table vendor_products enable row level security;

create policy "vendor_products: read all"
  on vendor_products for select
  using (true);

-- Writes are intentionally service-role only; no insert/update/delete
-- policy is created. The scraper ingest job uses the service role key.

-- ============================================================
-- 3. equipment_catalog → vendor_products link
-- ============================================================
alter table equipment_catalog
  add column vendor_product_id uuid references vendor_products(id) on delete set null;

create index on equipment_catalog (vendor_product_id);

-- ============================================================
-- 4. Seed known vendors
-- ============================================================
insert into vendors (slug, name, base_url) values
  ('johnstonesupply', 'Johnstone Supply', 'https://www.johnstonesupply.com'),
  ('lockesupply',     'Locke Supply',     'https://www.lockesupply.com');
