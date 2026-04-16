-- 019_vendor_products_bom_classification.sql
-- Add LLM-populated classification columns to vendor_products.
--   bom_slot            — canonical slot enum from bom-slot-taxonomy.ts.
--                         NULL = unclassified OR explicitly non-HVAC (hole saw,
--                         boiler, etc.). Only non-NULL rows are candidates for
--                         BOM generation.
--   bom_specs           — canonical spec shape, schema varies per slot (see
--                         bom-slot-taxonomy.ts). NULL iff bom_slot IS NULL.
--   bom_classifier_v    — the classifier version that wrote this row; bump
--                         when taxonomy changes materially so we can null the
--                         affected rows and re-classify.
--   bom_classified_at   — audit trail for when the LLM touched this row.
alter table public.vendor_products
  add column if not exists bom_slot            text,
  add column if not exists bom_specs           jsonb,
  add column if not exists bom_classifier_v    integer,
  add column if not exists bom_classified_at   timestamptz;

create index if not exists vendor_products_bom_slot_idx
  on public.vendor_products (bom_slot)
  where bom_slot is not null;

create index if not exists vendor_products_unclassified_idx
  on public.vendor_products (id)
  where bom_slot is null and bom_classified_at is null;

comment on column public.vendor_products.bom_slot is
  'Canonical BOM slot enum. See src/lib/hvac/bom-slot-taxonomy.ts. NULL = not-yet-classified or explicitly non-HVAC.';
comment on column public.vendor_products.bom_specs is
  'Canonical slot-specific specs (Zod-validated). Shape depends on bom_slot.';
