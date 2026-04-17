# vendor_products classifier

## Overview

`vendor_products.bom_slot` and `bom_specs` are populated by the LLM classifier at
`POST /api/internal/classify-vendor-products`. The endpoint processes 25 rows
per call; cron-job.org hits it every 15 minutes to catch new scraper deltas.
The one-time initial backfill is driven by `scripts/backfill-vendor-classification.mjs`.

## Environment variables

- `INTERNAL_API_TOKEN` — bearer token required on the endpoint. Set in Vercel
  for all environments; set in `.env.local` for dev. Generate with
  `openssl rand -base64 32`.
- `ANTHROPIC_API_KEY` — already configured; used by `src/lib/anthropic.ts`.

## Initial backfill

Run from a workstation once after the migration lands:

```
BASE_URL=https://coolbid.app \
  INTERNAL_API_TOKEN=<token> \
  node scripts/backfill-vendor-classification.mjs
```

Expected: ~1200 iterations (30k rows at 25/batch), ~1 hour wall clock,
~$5–10 in Anthropic spend (Haiku 4.5).

## Recurring cron

Set up in **cron-job.org** (NOT `vercel.json` — crons are external per the
project's cron policy):

- URL: `https://coolbid.app/api/internal/classify-vendor-products`
- Method: `POST`
- Header: `Authorization: Bearer <token>`
- Schedule: every 15 minutes
- Retry: 2 retries with 60s backoff

Response is a no-op when there are zero unclassified rows (~50ms).

## Re-classifying after taxonomy or prompt changes

Rescans are operator-controlled — bumping `CLASSIFIER_VERSION` alone does
NOT trigger automatic re-classification. That's intentional (cost + timing
should stay under your control).

Workflow:

1. Bump `CLASSIFIER_VERSION` in `src/lib/hvac/bom-slot-taxonomy.ts` (for
   audit / future filtering). Optional but recommended.
2. Reset only the rows you want re-classified. Examples:

   **Full rescan (all classified rows):**
   ```sql
   update vendor_products
     set bom_slot = null, bom_specs = null, bom_classified_at = null
     where bom_classified_at is not null;
   ```

   **Just major equipment (cheap targeted rescan, ~2k rows, <$1):**
   ```sql
   update vendor_products
     set bom_slot = null, bom_specs = null, bom_classified_at = null
     where bom_slot in (
       'ac_condenser', 'heat_pump_condenser',
       'gas_furnace', 'air_handler', 'evap_coil'
     );
   ```

   **By version (rows classified by an older version):**
   ```sql
   update vendor_products
     set bom_slot = null, bom_specs = null, bom_classified_at = null
     where bom_classifier_v < <target version>;
   ```

3. Re-run the backfill script. The endpoint picks up rows with
   `bom_classified_at IS NULL`, so only the rows you reset get processed.

## Monitoring

Total unclassified count:

```sql
select count(*) from vendor_products
  where bom_slot is null and bom_classified_at is null;
```

If this grows between cron runs, the scraper is adding rows faster than we
classify (unlikely at 25/15min = 100/hr).

Slot distribution after backfill:

```sql
select bom_slot, count(*)
  from vendor_products
  where bom_slot is not null
  group by 1
  order by 2 desc;
```
