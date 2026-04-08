# CoolBid — HVAC Estimator SaaS Platform

## Overview

A SaaS HVAC estimating tool for residential contractors. Upload a floorplan PDF, AI analyzes rooms and dimensions, generates a bill of materials with pricing, and outputs an RFQ for suppliers. Built as a full multi-tenant SaaS product with subscription billing.

**Target user:** Residential HVAC contractors (initial customer: Greenfield Heating & Air Inc, Agra, OK).

**Prototype:** Single-file HTML app at `../hvac-business-tools/index.html` (~2,256 lines). All core HVAC logic (load calculations, BOM generation, climate zones, parts database) will be extracted and ported.

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 15 (App Router) | SSR for marketing, API routes for secure server logic, middleware for auth |
| UI | React 19 + Tailwind CSS v4 + shadcn/ui | Fast styling, consistent component library |
| State | Zustand | Lightweight client state for estimator wizard |
| Database | Supabase (PostgreSQL + RLS) | Multi-tenant isolation, auth, storage, real-time |
| Auth | Supabase Auth | Native RLS integration, email/password + OAuth |
| AI | Anthropic Claude (Vision + Text) | Floorplan analysis, quote parsing (V2) |
| Billing | Stripe Subscriptions | Monthly/annual tiers |
| Email | Resend | Transactional emails (welcome, receipts) |
| PDF | PDF.js (client-side) | Page rendering and selection |
| Validation | Zod | Input validation at API boundaries |
| Deployment | Vercel + Supabase Cloud | Zero ops, generous free tiers |

## V1 Feature Scope

### Included

- **Landing page** — Hero, feature highlights, pricing table, CTA
- **Auth** — Email/password signup + login, Google OAuth, password reset
- **Stripe subscriptions** — Free trial (14 days) → Pro tier. Checkout, portal, webhook handling
- **Estimator wizard** — Multi-step flow:
  1. Upload floorplan (PDF or image)
  2. Set building info (sqft, units, climate zone, HVAC config)
  3. Select pages (multi-page PDFs)
  4. AI analysis (Claude Vision extracts rooms/dimensions)
  5. Review/edit rooms (rescale to known sqft)
  6. BOM generation with pricing, adjustable margin/labor
  7. RFQ export (text, CSV)
- **Estimate history** — Save, load, duplicate, delete estimates. Status tracking (draft/sent/accepted)
- **Company profile** — Name, email, phone, address
- **Settings** — Profile editing, subscription management (Stripe portal link)
- **Climate zones** — 6 zones with BTU load multipliers (carried from prototype)
- **Multi-unit support** — Duplexes/triplexes with per-unit vs. shared system config

### Excluded from V1 (V2 fast follow)

- Supplier quote upload & AI parsing
- Equipment catalog from parsed quotes
- Price history tracking
- Manual catalog entry/editing
- Quote comparison across suppliers
- PDF estimate export
- Team accounts + roles (schema designed for it, not implemented)
- Mobile responsive polish
- Supplier ordering API integrations

## Architecture

### System Overview

```
Browser (Next.js Frontend)
  → Next.js API Routes (server-side)
    → Anthropic Claude API (your API key)
    → Stripe API (subscriptions, webhooks)
    → Supabase (DB, Auth, Storage)
  → Supabase (client-side: auth state, real-time)
  → PDF.js (client-side: PDF rendering)
```

### Key Architectural Decisions

1. **Anthropic API calls are server-side only.** Your API key lives in environment variables. No more `anthropic-dangerous-direct-browser-access` header. Calls route through `/api/analyze`.

2. **Supabase Auth with RLS.** Every table has `user_id` column with RLS policy `user_id = auth.uid()`. Multi-tenant isolation at the database level.

3. **Single user per account for V1.** The `profiles` table schema supports future team features (org_id, role), but V1 is one user per company.

4. **Estimator state is client-side (Zustand).** The wizard is a multi-step flow that only persists to the database on explicit save. No server round-trips between steps.

5. **HVAC calculation logic lives in `lib/hvac/`.** Extracted from the prototype into typed TypeScript modules. Pure functions, easily testable.

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/analyze` | POST | Send floorplan image(s) to Claude Vision, return room analysis |
| `/api/estimates` | GET/POST | List/create estimates |
| `/api/estimates/[id]` | GET/PUT/DELETE | Read/update/delete a specific estimate |
| `/api/stripe/checkout` | POST | Create Stripe checkout session |
| `/api/stripe/webhook` | POST | Handle Stripe subscription events |
| `/api/stripe/portal` | POST | Create Stripe billing portal session |

### Middleware

Next.js middleware at `src/middleware.ts`:
- Refreshes Supabase auth session on every request
- Redirects unauthenticated users from `/dashboard/*`, `/estimates/*`, `/settings/*` to `/auth/login`
- Redirects authenticated users from `/auth/*` to `/dashboard`
- Checks subscription status for gated features (estimate creation requires active subscription or trial)

## Database Schema

### profiles

Extends `auth.users`. Auto-created via trigger on signup.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK, FK auth.users) | |
| company_name | text | |
| company_email | text | |
| company_phone | text | |
| address | text | |
| state | text | |
| zip | text | |
| stripe_customer_id | text | Nullable until first checkout |
| subscription_tier | text | 'trial', 'pro' |
| subscription_status | text | 'trialing', 'active', 'canceled', 'past_due' |
| trial_ends_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### estimates

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| user_id | uuid (FK profiles) | RLS filter |
| project_name | text | |
| customer_name | text | |
| status | text | 'draft', 'sent', 'accepted' |
| total_sqft | numeric | |
| num_units | int | Default 1 |
| hvac_per_unit | boolean | |
| climate_zone | text | |
| profit_margin | numeric | Default 35 |
| labor_rate | numeric | Default 85 |
| labor_hours | numeric | Default 16 |
| total_price | numeric | Computed on save |
| supplier_name | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### estimate_rooms

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| estimate_id | uuid (FK estimates) | CASCADE delete |
| name | text | |
| type | text | Room type from LOAD_FACTORS |
| sqft | numeric | |
| length | numeric | |
| width | numeric | |
| ceiling_height | numeric | Default 8 |
| windows | int | |
| exterior_walls | int | |
| btu_load | numeric | Calculated |
| tonnage | numeric | Calculated |
| cfm_required | numeric | Calculated |

### estimate_bom_items

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| estimate_id | uuid (FK estimates) | CASCADE delete |
| category | text | 'equipment', 'ductwork', 'registers', 'electrical', 'installation' |
| description | text | |
| quantity | numeric | |
| unit | text | 'each', 'ft', 'roll', 'set' |
| unit_cost | numeric | |
| total_cost | numeric | |
| room_id | uuid (FK estimate_rooms) | Nullable — some items are per-system |

### floorplans

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| estimate_id | uuid (FK estimates) | CASCADE delete |
| storage_path | text | Supabase Storage path |
| file_name | text | Original filename |
| file_type | text | 'pdf', 'image' |
| page_numbers | int[] | Selected pages for analysis |
| analysis_result | jsonb | Raw Claude Vision response |
| created_at | timestamptz | |

### RLS Policies

All tables: `SELECT/INSERT/UPDATE/DELETE WHERE user_id = auth.uid()` (for estimates children, join through estimates table).

## Project Structure

```
coolbid/
├── src/
│   ├── app/
│   │   ├── (marketing)/              # Public pages
│   │   │   ├── page.tsx              # Landing page
│   │   │   ├── pricing/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (app)/                    # Authenticated app
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── estimates/
│   │   │   │   ├── page.tsx          # List estimates
│   │   │   │   ├── new/page.tsx      # Estimator wizard
│   │   │   │   └── [id]/page.tsx     # View/edit estimate
│   │   │   ├── settings/page.tsx
│   │   │   └── layout.tsx            # Sidebar nav, auth guard
│   │   ├── auth/
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── callback/route.ts     # OAuth callback
│   │   ├── api/
│   │   │   ├── analyze/route.ts      # Claude Vision
│   │   │   ├── estimates/
│   │   │   │   ├── route.ts          # List/create
│   │   │   │   └── [id]/route.ts     # CRUD
│   │   │   └── stripe/
│   │   │       ├── checkout/route.ts
│   │   │       ├── webhook/route.ts
│   │   │       └── portal/route.ts
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                       # shadcn/ui
│   │   ├── estimator/
│   │   │   ├── upload-step.tsx
│   │   │   ├── page-select-step.tsx
│   │   │   ├── analyzing-step.tsx
│   │   │   ├── rooms-step.tsx
│   │   │   └── bom-step.tsx
│   │   ├── marketing/
│   │   │   ├── hero.tsx
│   │   │   ├── features.tsx
│   │   │   └── pricing-table.tsx
│   │   └── layout/
│   │       ├── sidebar.tsx
│   │       ├── header.tsx
│   │       └── nav.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # createBrowserClient
│   │   │   ├── server.ts             # createServerClient
│   │   │   └── middleware.ts         # Session refresh
│   │   ├── stripe.ts                 # Stripe instance + helpers
│   │   ├── anthropic.ts              # Server-side Claude client
│   │   ├── hvac/
│   │   │   ├── load-calc.ts          # BTU/tonnage/CFM calculations
│   │   │   ├── bom-generator.ts      # BOM generation from rooms
│   │   │   ├── parts-db.ts           # Hardcoded parts + pricing
│   │   │   └── climate-zones.ts      # Zone definitions + factors
│   │   └── constants.ts
│   ├── hooks/
│   │   ├── use-estimator.ts          # Zustand store for wizard state
│   │   └── use-subscription.ts       # Check subscription status
│   └── types/
│       ├── database.ts               # Supabase generated types
│       ├── estimate.ts
│       └── hvac.ts
├── supabase/
│   └── migrations/
│       └── 001_initial.sql
├── public/
├── .env.local.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## Stripe Integration

### Subscription Tiers

| Tier | Price | Includes |
|------|-------|----------|
| Trial | Free (14 days) | Full access, limited to 5 estimates |
| Pro | $49/month or $490/year | Unlimited estimates, priority support |

Prices are configurable in Stripe dashboard. The app reads tier info from the webhook, not hardcoded pricing.

### Webhook Events Handled

- `checkout.session.completed` — Set `stripe_customer_id`, update subscription fields
- `customer.subscription.updated` — Sync status/tier changes
- `customer.subscription.deleted` — Mark subscription as canceled
- `invoice.payment_failed` — Mark as `past_due`

### Subscription Gating

Middleware checks `profiles.subscription_status` for protected routes. Allowed statuses: `trialing`, `active`. Users with `canceled` or `past_due` are redirected to a billing page with a resubscribe CTA.

## Claude Vision Integration

### Floorplan Analysis Flow

1. Client uploads PDF/image → stored in Supabase Storage
2. Client sends selected page numbers to `/api/analyze`
3. Server retrieves file from Storage, converts PDF pages to images if needed
4. Server calls Claude Vision with the HVAC-specific prompt (carried from prototype)
5. Server returns structured room data (name, type, dimensions, windows, walls)
6. Client populates estimator wizard rooms step

### Prompt Design

The analysis prompt is carried from the prototype. It instructs Claude to:
- Identify each room with name, type, approximate dimensions
- Count windows and exterior walls per room
- Note any HVAC-relevant features (vaulted ceilings, large windows, sunrooms)
- Return structured JSON matching the `estimate_rooms` schema

### Rate Limiting

Server-side rate limiting on `/api/analyze`: max 10 requests per user per hour. Vision calls are expensive — this prevents abuse during trial and protects margins.

## HVAC Calculation Engine

Ported directly from the prototype's `generateBOM()` function into typed TypeScript modules.

### Load Calculation (`lib/hvac/load-calc.ts`)

- Per-room BTU: `LOAD_FACTORS[room_type].btu × sqft × climateFactor`
- Window BTU: `800 × window_count`
- Wall BTU: `400 × exterior_wall_count`
- Ceiling height factor applied
- 10% safety margin
- Tonnage: rounded to nearest 0.5 (min 1.5, max 5)

### Climate Zones (`lib/hvac/climate-zones.ts`)

| Zone | Factor |
|------|--------|
| Hot & Humid | 1.20 |
| Hot & Dry | 1.15 |
| Warm | 1.00 |
| Mixed | 0.95 |
| Cool | 0.85 |
| Cold | 0.80 |

### Parts Database (`lib/hvac/parts-db.ts`)

47 hardcoded parts from the prototype, organized by category (condensers, air handlers, ductwork, registers, electrical, installation materials). In V2, this will be supplemented/replaced by the equipment catalog from supplier quotes.

### BOM Generator (`lib/hvac/bom-generator.ts`)

Takes rooms + config, produces categorized line items with quantities and pricing. Applies profit margin and labor costs. Outputs data matching `estimate_bom_items` schema.

## Error Handling

- **API routes:** Try/catch with Zod validation on inputs. Return structured error responses `{ error: string, code: string }`. Log context without exposing secrets.
- **Client:** Toast notifications for user-facing errors. Console errors for unexpected failures.
- **Claude Vision failures:** Retry once, then surface a user-friendly message asking them to try a clearer image.
- **Stripe webhook failures:** Return 200 to prevent retries for known-bad events. Log and alert on unexpected event types.

## Security

- Anthropic API key server-side only (env var, never exposed to client)
- Stripe webhook signature verification
- Supabase RLS on all tables
- Zod validation at every API boundary
- CSRF protection via Next.js defaults
- Rate limiting on expensive endpoints (Claude Vision)
- `.trim()` on all env vars used in equality checks
