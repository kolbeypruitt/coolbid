-- ============================================================
-- 016_retire_starter_wire_vendors.sql
-- ============================================================
-- Retires the hardcoded starter catalog and makes the per-user
-- `suppliers` table a thin preferences layer on top of the global
-- `vendors` / `vendor_products` tables from migration 014.
--
-- Semantics after this migration:
--   - `vendors`          = app-wide fact (Johnstone, Locke, …)
--   - `vendor_products`  = app-wide scraped SKU catalog
--   - `suppliers`        = per-user opt-in: "I use this vendor"
--                          + optional contact/notes + is_active flag
--   - `equipment_catalog`= per-user personal library, populated by
--                          quote ingestion, manual add, or
--                          "import from supplier catalog" action
--
-- The starter-kit seed path is removed from onboarding; this
-- migration cleans up the historical rows it wrote.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Link suppliers → vendors (nullable; user-custom suppliers
--    have no matching vendor).
-- ------------------------------------------------------------
alter table suppliers
  add column vendor_id uuid references vendors(id) on delete set null;

create index on suppliers (vendor_id);

-- Backfill: case-insensitive name match against the two seeded
-- vendors. Works for any historical supplier row a user created
-- during onboarding that happens to carry a matching name.
update suppliers
   set vendor_id = (select id from vendors where slug = 'johnstonesupply')
 where name ilike 'johnstone%' and vendor_id is null;

update suppliers
   set vendor_id = (select id from vendors where slug = 'lockesupply')
 where name ilike 'locke%' and vendor_id is null;

-- One supplier row per (user, vendor) — prevents dupes when the
-- onboarding wizard is re-run.
create unique index suppliers_user_vendor_idx
  on suppliers (user_id, vendor_id)
  where vendor_id is not null;

-- ------------------------------------------------------------
-- 2. Allow `source = 'imported'` on equipment_catalog for rows
--    auto-created when a user picks a vendor_product in search.
-- ------------------------------------------------------------
alter table equipment_catalog
  drop constraint equipment_catalog_source_check;

alter table equipment_catalog
  add constraint equipment_catalog_source_check
    check (source in ('starter', 'quote', 'manual', 'imported'));

-- One equipment_catalog row per (user, vendor_product) — keeps
-- repeated picks from search idempotent.
create unique index equipment_catalog_user_vendor_product_idx
  on equipment_catalog (user_id, vendor_product_id)
  where vendor_product_id is not null;

-- ------------------------------------------------------------
-- 3. Delete historical starter rows.
--
--    quote_lines.catalog_item_id has ON DELETE SET NULL
--    (migration 002 line 114), so any historic quote line that
--    referenced a starter row keeps its snapshot data and just
--    loses the pointer. Nothing else FKs into equipment_catalog.
-- ------------------------------------------------------------
delete from equipment_catalog where source = 'starter';

-- Drop starter-flagged supplier rows for houses we don't have a
-- scraped catalog for (Sanders, Shearer, Amsco, ...), but ONLY if
-- no historical quote still references them. Johnstone/Locke rows
-- got their vendor_id backfilled above and are skipped by the
-- `vendor_id is null` filter.
delete from suppliers
 where is_starter = true
   and vendor_id is null
   and not exists (
     select 1 from quotes where quotes.supplier_id = suppliers.id
   )
   and not exists (
     select 1 from equipment_catalog ec where ec.supplier_id = suppliers.id
   );
