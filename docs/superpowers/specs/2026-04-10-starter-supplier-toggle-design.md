# Starter Supplier Toggle — Design Spec

## Problem

Users who selected starter suppliers during onboarding may want to hide that starter equipment later — either because they picked one by mistake or because they've imported real supplier quotes and no longer need the sample data cluttering their catalog.

## Solution

Add an `is_active` toggle per starter supplier on the settings page. When toggled off, all starter equipment from that supplier is filtered out of the catalog and estimate builder. The supplier itself remains visible in dropdowns (the user may have real quotes from them).

## Database

Add `is_active boolean not null default true` to the `suppliers` table via a new migration.

- Default `true` preserves existing behavior — no data backfill needed.
- Only meaningful for rows where `is_starter = true`, but the column lives on all rows for simplicity.

## Settings UI

New section on `/settings` page titled "Starter Parts Lists", placed below existing company profile fields.

- Renders only if the user has any suppliers where `is_starter = true`.
- Each starter supplier shown as a row: supplier name, brands subtitle, and a toggle switch.
- Toggle writes `is_active` to the DB immediately on change (no save button).
- Optimistic UI update with error rollback.

## Catalog Filtering

Wherever starter equipment is queried for display:

- **Parts database page** (`/parts-database`)
- **Estimate builder** (equipment selection during BOM creation)

The query joins `equipment_catalog` against `suppliers` and excludes rows where:
```
suppliers.is_active = false AND equipment_catalog.source = 'starter'
```

Non-starter equipment (`source = 'quote'` or `source = 'manual'`) from the same supplier is always visible regardless of the toggle.

## Scope Boundaries

- No changes to onboarding flow.
- No deletion of data — toggle only hides/shows.
- No per-equipment granularity — toggle is per-supplier.
- Supplier remains in dropdowns even when toggled off.
