-- 017_contractor_preferences.sql
-- Add JSONB column to store contractor parts-selection preferences captured in
-- onboarding (equipment brands, register styles, filter preferences, etc.) so
-- they can be rendered as natural-language context for the future AI-powered
-- BOM generator. Follows the same JSONB pattern as feedback_prompts_seen.

alter table public.profiles
  add column if not exists contractor_preferences jsonb not null default '{}';

comment on column public.profiles.contractor_preferences is
  'Structured HVAC contractor preferences captured in onboarding: equipment_brands, supply_register_style, return_grille_sizing, duct_trunk_material, filter_size, filter_merv, thermostat_brand, additional_notes. Rendered into natural-language context for the parts-list AI generator.';
