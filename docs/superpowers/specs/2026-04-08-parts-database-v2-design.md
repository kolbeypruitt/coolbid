# Parts Database V2 — Design Spec

## Overview

Replace the hardcoded parts database with a user-owned equipment catalog populated by supplier quote uploads and AI parsing. Each user gets a starter kit of real SKUs based on their selected suppliers, which gets progressively replaced by actual quote data as they upload supplier quotes.

**Goal:** Every part in a BOM comes from the user's catalog — real models, real SKUs, increasingly real prices. The RFQ output is immediately useful because it references actual equipment their supplier carries.

## Data Model

### New Tables

**suppliers**
- id, user_id, name, contact_email, contact_phone, brands (text[]), is_starter (boolean), created_at
- Starter suppliers are shared but cloned per-user so they can customize
- RLS: user_id = auth.uid()

**equipment_catalog**
- id, user_id, supplier_id (FK suppliers), model_number, description, equipment_type (text — condenser, air_handler, furnace, evap_coil, thermostat, ductwork, register, grille, refrigerant, electrical, installation), brand, tonnage (numeric, nullable), seer_rating (numeric, nullable), btu_capacity (numeric, nullable), stages (int, nullable), refrigerant_type (text, nullable), unit_price (numeric, nullable — may not have price yet), unit_of_measure (text), source ("starter" | "quote" | "manual"), usage_count (int default 0), last_quoted_date (timestamptz, nullable), created_at, updated_at
- Index: (user_id, equipment_type, tonnage)
- RLS: user_id = auth.uid()

**quotes**
- id, user_id, supplier_id (FK suppliers), quote_number (text), quote_date (date), subtotal (numeric), tax (numeric), total (numeric), file_name (text), storage_path (text), status ("parsed" | "reviewing" | "saved"), created_at
- RLS: user_id = auth.uid()

**quote_lines**
- id, quote_id (FK quotes CASCADE), catalog_item_id (FK equipment_catalog, nullable — linked after save), model_number, description, equipment_type, brand, tonnage, seer_rating, btu_capacity, stages, refrigerant_type, quantity (numeric), unit_price (numeric), extended_price (numeric), selected (boolean default true — user can deselect during review), created_at
- RLS: via quotes join

**price_history**
- id, catalog_item_id (FK equipment_catalog CASCADE), supplier_id (FK suppliers), price (numeric), quote_date (date), quote_id (FK quotes), created_at
- RLS: via equipment_catalog join
- Trigger: on insert, update equipment_catalog.unit_price to the latest price (by quote_date)

### Modified Tables

**profiles** — add `onboarding_completed` (boolean default false)

**estimates** — add `system_type` (text default 'gas_ac', check constraint for heat_pump/gas_ac/electric/dual_fuel)

### Starter Part Retirement Logic

A starter catalog entry is hidden (not deleted) when the user has a "quote"-sourced entry with:
- Same equipment_type
- Tonnage within ±0.5 ton

Implemented as a query filter, not a flag — `WHERE source != 'starter' OR NOT EXISTS (quote-sourced entry at same type+tonnage±0.5)`.

## Onboarding Flow

### New Route: `/onboarding`

Shown after first signup. Middleware redirects to `/onboarding` if `profiles.onboarding_completed = false`.

**UI:**
- "Who are your suppliers?" heading
- Multi-select grid of 5 starter suppliers, each showing name + brands carried:
  - Johnstone Supply — Goodman, Daikin
  - Sanders Supply — Carrier, Bryant, Tempstar
  - Shearer Supply — Lennox
  - Locke Supply — Goodman, Rheem, Ruud
  - Amsco Supply — Rheem, Ruud, York
- "Other" option with text field for custom supplier name
- "Continue" button: creates supplier records, seeds equipment catalog with selected suppliers' starter kits, sets onboarding_completed = true, redirects to /dashboard
- "Skip" link: sets onboarding_completed = true, no starter data

### Starter Kit Contents Per Supplier

Each supplier kit includes equipment for their brands at standard residential sizes:
- Condensers: 2T, 2.5T, 3T, 3.5T, 4T, 5T
- Air Handlers: matching sizes
- Thermostat: 1 entry

Brand-agnostic items (ductwork, registers, grilles, refrigerant, electrical, installation materials) are seeded for all users regardless of supplier selection. These come from the current hardcoded PARTS_DB.

Model numbers will be researched for: Goodman, Daikin, Carrier, Bryant, Tempstar, Lennox, Rheem, Ruud, York.

## Quote Upload & AI Parsing

### New Sidebar Nav Item: "Parts Database"

### Upload Flow

1. **Select supplier** from user's supplier list (or add new one inline)
2. **Upload quote PDF** — rendered client-side via PDF.js, same pattern as floorplan upload with processing indicator
3. **API call** to `/api/parse-quote` — sends page images to Claude Vision with a quote-parsing prompt
4. **Review screen** — table of parsed line items with:
   - Checkbox per item (pre-checked, user can deselect junk)
   - Editable fields: model_number, description, equipment_type, brand, tonnage, SEER, unit_price
   - Equipment type shown as a select dropdown
5. **Save** — confirmed items written to quote_lines, matched/created in equipment_catalog, prices recorded in price_history

### Claude Vision Prompt for Quote Parsing

Instructs Claude to extract from a supplier quote PDF:
- Supplier name, quote number, date, subtotal, tax, total
- Per line item: model_number, description, equipment_type, brand, tonnage, SEER, BTU, stages, refrigerant_type, quantity, unit_price, extended_price

Returns structured JSON. Same error handling pattern as floorplan analysis (strip markdown fences, extract JSON object).

### Catalog Matching on Save

For each confirmed line item:
1. Search equipment_catalog for existing entry with same model_number + user_id
2. If found: update unit_price, increment usage_count, add price_history entry, link quote_line.catalog_item_id
3. If not found: create new catalog entry with source="quote", link it

## Equipment Catalog UI

### Main View: `/parts-database` (or section within the app)

**Search + Filter bar:**
- Text search: model number, description, brand
- Filter by: equipment_type, supplier
- Sort by: usage_count (default), unit_price, updated_at

**Table columns:**
- Description, Brand, Model #, Tonnage, SEER, Price (or "No price yet"), Supplier, Source badge ("Starter" gray / "From quote" green), Usage count

**Retired starter entries:** hidden by default, "Show retired" toggle

**Row click → detail view:**
- Full attributes
- Price history (list of prices by date + supplier)
- Which quotes this item appeared in

**Manual add/edit:** users can create or edit catalog entries directly, source="manual"

## System Type Selection

### New Field on Estimates

`system_type` field with values:
- `heat_pump` — Heat pump condenser + air handler + heat strips
- `gas_ac` — AC condenser + gas furnace
- `electric` — AC condenser + air handler + heat strips (no heat pump)
- `dual_fuel` — Heat pump condenser + gas furnace (dual fuel)

**In the upload step:** added as a select field alongside climate zone and building info. Defaults to `gas_ac`.

**In the equipment catalog:** each entry gets a `system_type` field ("heat_pump", "gas_ac", "electric", "dual_fuel", "universal"). "Universal" is for items that apply to any system (thermostats, ductwork, registers, etc.).

**Impact on BOM generation:** the system type determines which equipment categories to pull:
- `heat_pump`: heat_pump_condenser + air_handler + heat_strips
- `gas_ac`: ac_condenser + gas_furnace
- `electric`: ac_condenser + air_handler + heat_strips
- `dual_fuel`: heat_pump_condenser + gas_furnace

### Equipment Type Refinement

The `equipment_type` field needs to distinguish between:
- `ac_condenser` — cooling-only outdoor unit
- `heat_pump_condenser` — heating + cooling outdoor unit
- `gas_furnace` — gas-fired indoor heating
- `air_handler` — indoor blower unit (used with heat pumps and electric systems)
- `heat_strips` — electric resistance heating (supplemental for heat pumps, primary for electric)
- `evap_coil` — evaporator coil (paired with furnace in gas/AC splits)
- `thermostat` — universal
- Plus all the non-equipment types: ductwork, register, grille, refrigerant, electrical, installation

## BOM Integration

### Changes to `generateBOM`

The function takes the user's catalog data as a parameter (fetched before calling):

```
generateBOM(rooms, climateZone, catalog, building?, hvacNotes?)
```

**Equipment selection logic:**
1. For each equipment need (e.g., 3-ton condenser), query catalog for entries matching equipment_type + tonnage ±0.5 ton
2. Sort by: source DESC ("quote" > "manual" > "starter"), then usage_count DESC
3. Use the top match
4. If no match at all: flag in BOM as "No matching equipment — add to catalog or upload a quote"

**BOM item display:**
- Shows brand/model from catalog
- Price marked as "Estimated" (starter), "Quoted" (from quote), or "No price" (needs RFQ)

### Removal of Hardcoded PARTS_DB at Runtime

`src/lib/hvac/parts-db.ts` retains PARTS_DB but only as seed data — read during onboarding to populate the database. The BOM generator no longer imports or references it.

Non-equipment items (ductwork, registers, etc.) are also seeded to the catalog during onboarding, so the BOM generator treats everything uniformly from the catalog.

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/parse-quote` | POST | Send quote PDF images to Claude Vision, return parsed items |
| `/api/quotes` | GET/POST | List/create quotes |
| `/api/catalog` | GET | List catalog entries with search/filter/sort |
| `/api/catalog` | POST | Create manual catalog entry |
| `/api/catalog/[id]` | PUT/DELETE | Update/delete catalog entry |

## New/Modified Files

**New:**
- `supabase/migrations/002_parts_database.sql` — new tables, RLS, triggers, indexes
- `src/app/(app)/onboarding/page.tsx` — supplier selection
- `src/app/(app)/parts-database/page.tsx` — catalog view
- `src/app/(app)/parts-database/upload/page.tsx` — quote upload + review flow
- `src/app/(app)/parts-database/[id]/page.tsx` — catalog item detail
- `src/app/api/parse-quote/route.ts` — Claude Vision quote parsing
- `src/app/api/quotes/route.ts` — quote CRUD
- `src/app/api/catalog/route.ts` — catalog list + create
- `src/app/api/catalog/[id]/route.ts` — catalog update/delete
- `src/components/parts-database/quote-upload.tsx` — upload + PDF processing
- `src/components/parts-database/quote-review.tsx` — parsed items review table
- `src/components/parts-database/catalog-table.tsx` — searchable catalog
- `src/components/parts-database/catalog-detail.tsx` — item detail + price history
- `src/components/onboarding/supplier-select.tsx` — multi-select grid
- `src/lib/hvac/starter-kits.ts` — starter equipment data per supplier
- `src/lib/hvac/quote-prompt.ts` — Claude Vision prompt for quote parsing
- `src/types/catalog.ts` — types for catalog, quotes, suppliers

**Modified:**
- `src/lib/hvac/bom-generator.ts` — take catalog parameter, remove PARTS_DB import
- `src/components/estimator/bom-step.tsx` — fetch catalog before generating, show source badges
- `src/components/layout/sidebar.tsx` — add Parts Database nav item
- `src/lib/supabase/middleware.ts` — add onboarding redirect
- `src/hooks/use-estimator.ts` — update generateBom to pass catalog, add systemType state
- `src/components/estimator/upload-step.tsx` — add system type select field
- `src/types/hvac.ts` — add SystemType type, update related types
- `supabase/migrations/002_parts_database.sql` — includes ALTER TABLE estimates ADD system_type

## Future: Email Integration

The quote parsing pipeline (PDF → Claude Vision → structured data → catalog) is designed so that an email crawler can feed into the same flow. A future email integration would:
1. Connect via OAuth (Gmail, Outlook)
2. Crawl for emails with PDF attachments from known suppliers
3. Auto-detect quote PDFs vs. other attachments
4. Feed them through the same `/api/parse-quote` → review → save pipeline

No code changes needed in the parsing or catalog layers — just a new input source.
