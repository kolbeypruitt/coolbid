-- 20260416120000_estimates_selected_equipment.sql
-- Phase 2: store the contractor's major-equipment selections so BOM
-- regeneration respects them. Shape: { [bom_slot]: catalog_item_id }.
-- Slots that aren't present fall back to generateBOM's auto-matcher.
alter table public.estimates
  add column if not exists selected_equipment jsonb not null default '{}'::jsonb;

comment on column public.estimates.selected_equipment is
  'Map of BomSlot → CatalogItem.id for contractor-selected major equipment. See src/lib/hvac/bom-slot-taxonomy.ts for slot values.';
