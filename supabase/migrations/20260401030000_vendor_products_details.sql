-- ============================================================
-- 015_vendor_products_details.sql
-- Stage-3 enrichment columns on vendor_products (price, specs,
-- features, docs, images). Populated by the authenticated-detail
-- scraper passes; every column is nullable so catalog-only rows
-- (johnstonesupply today, most of lockesupply) keep working as-is.
-- ============================================================

alter table vendor_products
  add column price              numeric,
  add column price_text         text,
  add column last_priced_at     timestamptz,
  add column specifications     jsonb,
  add column features           jsonb,
  add column documents          jsonb,
  add column additional_images  jsonb;

-- Partial index for "show me priced items" filters. Skips the ~90%
-- of rows with price is null, so it stays tiny.
create index on vendor_products (vendor_id, price)
  where price is not null;
