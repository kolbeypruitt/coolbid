# Send to Homeowner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Send to Homeowner feature — branded PDF generation + public share link + contractor logo upload — so that every estimate can become a real customer-facing artifact.

**Architecture:** Server-rendered PDF via `@react-pdf/renderer` in Node functions. Public share route at `/q/[token]` outside the authenticated app shell. Share tokens are 256-bit base64url, enforced unique-per-estimate by a partial DB index. Contractor logos live in a private Supabase Storage bucket, rasterized server-side if uploaded as SVG. All data access on public routes uses the service-role client — anon access is blocked via RLS.

**Tech Stack:** Next.js 16 App Router, Supabase (auth + Postgres + Storage), `@react-pdf/renderer`, `@resvg/resvg-js`, Vitest + `pdf-parse` for pure-logic tests.

**Spec:** [`docs/superpowers/specs/2026-04-09-share-to-homeowner-design.md`](../specs/2026-04-09-share-to-homeowner-design.md)

---

## Phase layout

| Phase | Tasks | Delivers |
|---|---|---|
| 0 — Foundation | 0, 1, 2 | Test harness, DB migration, typed schema |
| 1 — Pure logic | 3, 4, 5, 6 | Token generator, scope template, admin client, logo loader |
| 2 — PDF generation | 7, 8, 9, 10 | Renderable branded PDF buffer |
| 3 — Logo upload | 11, 12 | `/api/profile/logo` + settings UI |
| 4 — Share APIs | 13, 14, 15 | Create / revoke / PDF download for contractors |
| 5 — Contractor UI | 16, 17, 18, 19 | Customer wizard step, customer card, share dialog |
| 6 — Public surface | 20, 21, 22 | `/q/[token]` page, public PDF, middleware allowlist |
| 7 — Polish | 23, 24, 25 | Settings defaults UI, dashboard badge, smoke test |

---

## Task 0: Install dependencies and configure Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/__tests__/smoke.test.ts`

- [ ] **Step 1: Install runtime dependencies**

Run:
```bash
npm install @react-pdf/renderer @resvg/resvg-js
```

Expected: both packages added to `dependencies` in `package.json`. Current versions (Apr 2026) are `@react-pdf/renderer@^4.x` and `@resvg/resvg-js@^2.x`.

- [ ] **Step 2: Install test dependencies**

Run:
```bash
npm install -D vitest @vitest/ui pdf-parse @types/pdf-parse
```

Expected: all four added to `devDependencies`.

- [ ] **Step 3: Create `vitest.config.ts`**

Create `vitest.config.ts` at the project root:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 4: Add `test` script to `package.json`**

Modify the `"scripts"` block in `package.json`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 5: Write a smoke test**

Create `src/lib/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the smoke test**

Run: `npm test`

Expected output:
```
✓ src/lib/__tests__/smoke.test.ts (1)
  ✓ test harness (1)
    ✓ runs
Test Files  1 passed (1)
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/__tests__/smoke.test.ts
git commit -m "chore: install @react-pdf/renderer, @resvg/resvg-js, and Vitest"
```

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/006_share_to_homeowner.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/006_share_to_homeowner.sql`:

```sql
-- ============================================================================
-- Send to Homeowner: share links, customer contact fields, contractor defaults
-- ============================================================================

-- Add customer contact and quote presentation fields to estimates
alter table estimates
  add column job_address       text,
  add column customer_email    text,
  add column customer_phone    text,
  add column note_to_customer  text,
  add column valid_until       date,
  add column display_mode      text not null default 'total_only'
    check (display_mode in ('total_only', 'itemized')),
  add column scope_of_work     text;

-- Add 'declined' to the status enum now, even though v1 has no UI to set it
alter table estimates
  drop constraint if exists estimates_status_check;
alter table estimates
  add constraint estimates_status_check
  check (status in ('draft', 'sent', 'accepted', 'declined'));

-- Contractor defaults + future logo slot on profiles
alter table profiles
  add column default_display_mode        text not null default 'total_only'
    check (default_display_mode in ('total_only', 'itemized')),
  add column default_quote_validity_days integer not null default 30,
  add column logo_url                    text,
  add column logo_content_type           text;

-- Share links table
create table estimate_shares (
  id                uuid        primary key default gen_random_uuid(),
  estimate_id       uuid        not null references estimates(id) on delete cascade,
  token             text        not null unique,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  first_viewed_at   timestamptz,
  last_viewed_at    timestamptz,
  view_count        integer     not null default 0
);

-- Only one active (non-revoked) share per estimate
create unique index estimate_shares_active_per_estimate
  on estimate_shares (estimate_id)
  where revoked_at is null;

-- Fast token lookup for the public route
create index estimate_shares_token_idx
  on estimate_shares (token)
  where revoked_at is null;

-- RLS: contractor can manage their own estimates' share rows
alter table estimate_shares enable row level security;

create policy "shares_owner_rw" on estimate_shares for all
  using (exists (
    select 1 from estimates
    where estimates.id = estimate_shares.estimate_id
      and estimates.user_id = auth.uid()
  ));

-- Storage: private bucket for contractor logos
insert into storage.buckets (id, name, public)
values ('profile-logos', 'profile-logos', false)
on conflict (id) do nothing;

-- Owner can upload / update / delete objects under their user id prefix
create policy "profile_logos_owner_rw"
  on storage.objects for all
  using (
    bucket_id = 'profile-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Apply the migration locally**

Run:
```bash
npx supabase db push
```

Expected: migration applies cleanly with no errors.

- [ ] **Step 3: Verify schema**

Run:
```bash
npx supabase db dump --schema public --data-only=false | grep -E "estimate_shares|display_mode|logo_url|default_display_mode"
```

Expected: output contains the new columns and the `estimate_shares` table definition.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/006_share_to_homeowner.sql
git commit -m "feat(db): share_to_homeowner migration"
```

---

## Task 2: Update database types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add new fields to `estimates`**

In `src/types/database.ts`, extend the `estimates` table types:

Find the `estimates` table definition and update `Row`, `Insert`, and `Update` to include:

```ts
// Row: add
job_address: string | null;
customer_email: string | null;
customer_phone: string | null;
note_to_customer: string | null;
valid_until: string | null;
display_mode: "total_only" | "itemized";
scope_of_work: string | null;

// Also change status to:
status: "draft" | "sent" | "accepted" | "declined";

// Insert: add (all optional)
job_address?: string | null;
customer_email?: string | null;
customer_phone?: string | null;
note_to_customer?: string | null;
valid_until?: string | null;
display_mode?: "total_only" | "itemized";
scope_of_work?: string | null;
status?: "draft" | "sent" | "accepted" | "declined";
```

- [ ] **Step 2: Add new fields to `profiles`**

Add to `profiles` `Row`:

```ts
default_display_mode: "total_only" | "itemized";
default_quote_validity_days: number;
logo_url: string | null;
logo_content_type: string | null;
```

And to `Insert` / `Update` as optional.

- [ ] **Step 3: Add `estimate_shares` table type**

Inside the `Tables:` object in `src/types/database.ts`, add:

```ts
estimate_shares: {
  Row: {
    id: string;
    estimate_id: string;
    token: string;
    created_at: string;
    expires_at: string;
    revoked_at: string | null;
    first_viewed_at: string | null;
    last_viewed_at: string | null;
    view_count: number;
  };
  Insert: {
    id?: string;
    estimate_id: string;
    token: string;
    expires_at: string;
    revoked_at?: string | null;
    first_viewed_at?: string | null;
    last_viewed_at?: string | null;
    view_count?: number;
  };
  Update: Partial<Database["public"]["Tables"]["estimate_shares"]["Insert"]>;
  Relationships: [];
};
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(types): share_to_homeowner schema"
```

---

## Task 3: Service-role Supabase client

**Files:**
- Create: `src/lib/supabase/admin.ts`

- [ ] **Step 1: Write the admin client**

Create `src/lib/supabase/admin.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Hard guard: this module must never load in the browser bundle.
if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/supabase/admin.ts must not be imported from client components",
  );
}

let cached: SupabaseClient<Database> | null = null;

/**
 * Service-role Supabase client for server-only code paths that need to
 * bypass RLS (public share route, PDF generation, cron jobs, webhooks).
 *
 * Do NOT use this in authenticated routes where RLS should apply —
 * use createClient() from ./server.ts instead.
 */
export function createAdminClient(): SupabaseClient<Database> {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  cached = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/admin.ts
git commit -m "feat(supabase): service-role admin client with browser guard"
```

---

## Task 4: Share token generator

**Files:**
- Create: `src/lib/share/tokens.ts`
- Create: `src/lib/share/tokens.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/share/tokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateShareToken } from "./tokens";

describe("generateShareToken", () => {
  it("returns a 43-character base64url string", () => {
    const token = generateShareToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates unique values across 1000 calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(generateShareToken());
    }
    expect(seen.size).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tokens`

Expected: FAIL with "Cannot find module './tokens'".

- [ ] **Step 3: Implement the generator**

Create `src/lib/share/tokens.ts`:

```ts
import { randomBytes } from "node:crypto";

/**
 * Generate a cryptographically random share token.
 * 32 bytes → 43 base64url characters → 256 bits of entropy.
 */
export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tokens`

Expected: `✓ 2 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/share/tokens.ts src/lib/share/tokens.test.ts
git commit -m "feat(share): cryptographic share token generator"
```

---

## Task 5: Scope-of-work auto-generator

**Files:**
- Create: `src/lib/share/scope-of-work.ts`
- Create: `src/lib/share/scope-of-work.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/share/scope-of-work.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateScopeOfWork } from "./scope-of-work";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

function estimate(overrides: Partial<EstimateRow> = {}): EstimateRow {
  return {
    id: "e1",
    user_id: "u1",
    project_name: "Smith Residence",
    customer_name: "Jane Smith",
    status: "draft",
    total_sqft: 1820,
    num_units: 1,
    hvac_per_unit: false,
    climate_zone: "3A",
    profit_margin: 25,
    labor_rate: 85,
    labor_hours: 16,
    supplier_name: "",
    total_material_cost: null,
    total_price: null,
    system_type: "heat_pump",
    created_at: "2026-04-09T00:00:00Z",
    updated_at: "2026-04-09T00:00:00Z",
    job_address: null,
    customer_email: null,
    customer_phone: null,
    note_to_customer: null,
    valid_until: null,
    display_mode: "total_only",
    scope_of_work: null,
    ...overrides,
  };
}

function bomItem(overrides: Partial<BomRow> = {}): BomRow {
  return {
    id: "b1",
    estimate_id: "e1",
    category: "equipment",
    description: "3.5-ton heat pump",
    quantity: 1,
    unit: "ea",
    unit_cost: 4000,
    total_cost: 4000,
    part_id: null,
    supplier: null,
    sku: null,
    notes: "",
    source: "catalog",
    room_id: null,
    created_at: "2026-04-09T00:00:00Z",
    ...overrides,
  };
}

describe("generateScopeOfWork", () => {
  it("describes a heat pump install with tonnage, sqft, and climate zone", () => {
    const result = generateScopeOfWork(
      estimate(),
      [bomItem({ description: "3.5-ton heat pump, 16 SEER2" })],
    );
    expect(result).toContain("heat pump");
    expect(result).toContain("1,820 sq ft");
    expect(result).toContain("Zone 3A");
    expect(result).toContain("ductwork");
  });

  it("labels gas AC systems correctly", () => {
    const result = generateScopeOfWork(
      estimate({ system_type: "gas_ac", total_sqft: 2400 }),
      [bomItem({ description: "4-ton gas furnace with AC coil" })],
    );
    expect(result).toContain("gas furnace");
    expect(result).toContain("2,400 sq ft");
  });

  it("falls back gracefully when sqft is null", () => {
    const result = generateScopeOfWork(
      estimate({ total_sqft: null }),
      [bomItem()],
    );
    expect(result).toMatch(/HVAC system installation/i);
    expect(result).not.toContain("null");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- scope-of-work`

Expected: FAIL with "Cannot find module './scope-of-work'".

- [ ] **Step 3: Implement the generator**

Create `src/lib/share/scope-of-work.ts`:

```ts
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

const SYSTEM_LABELS: Record<EstimateRow["system_type"], string> = {
  heat_pump: "heat pump",
  gas_ac: "gas furnace and AC",
  electric: "electric furnace and AC",
  dual_fuel: "dual-fuel system",
};

/**
 * Produce a clean one-sentence scope of work from an estimate and its BOM.
 * Deterministic — no AI. Contractor can edit it in the share dialog.
 */
export function generateScopeOfWork(
  estimate: EstimateRow,
  bom: BomRow[],
): string {
  const systemLabel = SYSTEM_LABELS[estimate.system_type] ?? "HVAC system";
  const sqftPart =
    estimate.total_sqft != null
      ? ` sized for ${estimate.total_sqft.toLocaleString()} sq ft`
      : "";
  const zonePart = estimate.climate_zone
    ? `, Zone ${estimate.climate_zone}`
    : "";

  return `HVAC system installation — ${systemLabel}${sqftPart}${zonePart}. Includes ductwork, line set, labor, and disposal.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- scope-of-work`

Expected: `✓ 3 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/share/scope-of-work.ts src/lib/share/scope-of-work.test.ts
git commit -m "feat(share): deterministic scope of work generator"
```

---

## Task 6: Share lifecycle helpers

**Files:**
- Create: `src/lib/share/lifecycle.ts`

- [ ] **Step 1: Write the lifecycle helpers**

Create `src/lib/share/lifecycle.ts`:

```ts
import { generateShareToken } from "./tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type ShareRow = Database["public"]["Tables"]["estimate_shares"]["Row"];

export const MAX_VALIDITY_DAYS = 180;
export const DEFAULT_VALIDITY_DAYS = 30;

/**
 * Compute a valid expiration date for a share link, capped at MAX_VALIDITY_DAYS.
 * Input may be a date string (YYYY-MM-DD) or null.
 */
export function resolveExpiresAt(validUntil: string | null): string {
  const maxExpires = new Date();
  maxExpires.setDate(maxExpires.getDate() + MAX_VALIDITY_DAYS);

  if (!validUntil) {
    const defaultExpires = new Date();
    defaultExpires.setDate(defaultExpires.getDate() + DEFAULT_VALIDITY_DAYS);
    return defaultExpires.toISOString();
  }

  const requested = new Date(`${validUntil}T23:59:59Z`);
  if (Number.isNaN(requested.getTime())) {
    throw new Error(`Invalid valid_until date: ${validUntil}`);
  }

  return (requested > maxExpires ? maxExpires : requested).toISOString();
}

/**
 * Revoke any existing active share for an estimate, then create a fresh one.
 * Returns the new share row.
 */
export async function createOrReplaceShare(
  estimateId: string,
  validUntil: string | null,
): Promise<ShareRow> {
  const supabase = createAdminClient();

  // Revoke any existing active share
  const { error: revokeError } = await supabase
    .from("estimate_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("estimate_id", estimateId)
    .is("revoked_at", null);

  if (revokeError) {
    throw new Error(`Failed to revoke existing share: ${revokeError.message}`);
  }

  // Insert the new active share
  const { data, error } = await supabase
    .from("estimate_shares")
    .insert({
      estimate_id: estimateId,
      token: generateShareToken(),
      expires_at: resolveExpiresAt(validUntil),
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create share: ${error?.message ?? "no data"}`);
  }

  return data as ShareRow;
}

/**
 * Revoke the active share for an estimate, if any.
 */
export async function revokeShare(estimateId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("estimate_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("estimate_id", estimateId)
    .is("revoked_at", null);

  if (error) {
    throw new Error(`Failed to revoke share: ${error.message}`);
  }
}

export type ShareLookupResult =
  | { status: "ok"; share: ShareRow }
  | { status: "not_found" }
  | { status: "revoked" }
  | { status: "expired" };

/**
 * Look up a share by token and determine its current state.
 * Also increments view tracking when the share is valid.
 */
export async function lookupShareByToken(
  token: string,
): Promise<ShareLookupResult> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("estimate_shares")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) {
    return { status: "not_found" };
  }

  const share = data as ShareRow;

  if (share.revoked_at) return { status: "revoked" };
  if (new Date(share.expires_at) < new Date()) return { status: "expired" };

  // Track the view — best effort, never block
  try {
    const now = new Date().toISOString();
    await supabase
      .from("estimate_shares")
      .update({
        view_count: share.view_count + 1,
        last_viewed_at: now,
        first_viewed_at: share.first_viewed_at ?? now,
      })
      .eq("id", share.id);
  } catch (err) {
    console.error("share view tracking failed", { shareId: share.id, err });
  }

  return { status: "ok", share };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/share/lifecycle.ts
git commit -m "feat(share): lifecycle helpers — create, revoke, lookup"
```

---

## Task 7: PDF tokens and fonts module

**Files:**
- Create: `src/lib/pdf/tokens.ts`
- Create: `src/lib/pdf/fonts.ts`

- [ ] **Step 1: Create PDF tokens**

Create `src/lib/pdf/tokens.ts`:

```ts
// Color and spacing tokens for the customer-facing PDF.
// Light theme — the PDF is printed and forwarded, dark burns toner.

export const PDF_COLORS = {
  text: "#0B0F1A",
  textSecondary: "#475569",
  textTertiary: "#94A3B8",
  border: "#E2E8F0",
  accent: "#06B6D4",
  accentDark: "#0891B2",
  coolBlue: "#3B82F6",
  bgSubtle: "#F8FAFC",
  totalBg: "#ECFEFF",
  totalBorder: "#A5F3FC",
} as const;

export const PDF_SPACING = {
  page: 48,
  sectionGap: 24,
  rowGap: 6,
} as const;

export const PDF_FONT_SIZES = {
  companyName: 24,
  title: 14,
  label: 9,
  body: 11,
  bomRow: 10,
  total: 32,
  footer: 8,
} as const;
```

- [ ] **Step 2: Create font registration helper**

Create `src/lib/pdf/fonts.ts`:

```ts
import { Font } from "@react-pdf/renderer";

let registered = false;

/**
 * Register Inter once per process. Called lazily from the PDF renderer.
 * Uses the Google Fonts CDN for the TTF files.
 */
export function registerPdfFonts(): void {
  if (registered) return;

  Font.register({
    family: "Inter",
    fonts: [
      {
        src: "https://fonts.gstatic.com/s/inter/v19/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.ttf",
        fontWeight: 400,
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v19/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.ttf",
        fontWeight: 500,
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v19/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.ttf",
        fontWeight: 600,
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v19/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.ttf",
        fontWeight: 700,
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v19/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.ttf",
        fontWeight: 800,
      },
    ],
  });

  // Disable hyphenation for a cleaner look
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}
```

Note: if the Inter font URLs 404 at runtime, switch to the versioned per-weight URLs from https://fonts.google.com/specimen/Inter — we only need a single weight file if that's all that loads cleanly. `@react-pdf/renderer` supports TTF and OTF.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pdf/tokens.ts src/lib/pdf/fonts.ts
git commit -m "feat(pdf): color and font token modules"
```

---

## Task 8: PDF components

**Files:**
- Create: `src/lib/pdf/components/Header.tsx`
- Create: `src/lib/pdf/components/Proposal.tsx`
- Create: `src/lib/pdf/components/Scope.tsx`
- Create: `src/lib/pdf/components/BomTable.tsx`
- Create: `src/lib/pdf/components/Total.tsx`
- Create: `src/lib/pdf/components/Message.tsx`
- Create: `src/lib/pdf/components/Footer.tsx`
- Create: `src/lib/pdf/components/Document.tsx`

- [ ] **Step 1: Create Header component**

Create `src/lib/pdf/components/Header.tsx`:

```tsx
import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_FONT_SIZES } from "../tokens";
import type { Database } from "@/types/database";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderBottom: `1px solid ${PDF_COLORS.border}`,
    paddingBottom: 16,
    marginBottom: 20,
  },
  logoBlock: {
    marginRight: 16,
  },
  logo: {
    maxHeight: 56,
    maxWidth: 200,
    objectFit: "contain",
  },
  textBlock: {
    flex: 1,
  },
  companyName: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.companyName,
    fontWeight: 800,
    color: PDF_COLORS.text,
    letterSpacing: -0.5,
  },
  contact: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.body,
    color: PDF_COLORS.textSecondary,
    marginTop: 4,
    lineHeight: 1.4,
  },
});

export function Header({
  profile,
  logoBuffer,
}: {
  profile: ProfileRow;
  logoBuffer: Buffer | null;
}) {
  const contactLines = [
    profile.address?.trim(),
    [profile.state?.trim(), profile.zip?.trim()].filter(Boolean).join(" ") ||
      null,
    [profile.company_phone?.trim(), profile.company_email?.trim()]
      .filter(Boolean)
      .join(" · ") || null,
  ].filter(Boolean);

  return (
    <View style={styles.container}>
      {logoBuffer && (
        <View style={styles.logoBlock}>
          <Image src={logoBuffer} style={styles.logo} />
        </View>
      )}
      <View style={styles.textBlock}>
        <Text style={styles.companyName}>
          {profile.company_name?.trim() || "Your HVAC Company"}
        </Text>
        {contactLines.map((line) => (
          <Text key={line} style={styles.contact}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Create Proposal component**

Create `src/lib/pdf/components/Proposal.tsx`:

```tsx
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_FONT_SIZES } from "../tokens";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  title: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.label,
    fontWeight: 700,
    color: PDF_COLORS.textTertiary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  row: { flexDirection: "row", marginBottom: 4 },
  label: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.body,
    color: PDF_COLORS.textSecondary,
    width: 90,
  },
  value: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.body,
    fontWeight: 600,
    color: PDF_COLORS.text,
    flex: 1,
  },
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function Proposal({ estimate }: { estimate: EstimateRow }) {
  const preparedOn = formatDate(estimate.created_at);
  const validUntil = estimate.valid_until ? formatDate(estimate.valid_until) : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Proposal</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Prepared for</Text>
        <Text style={styles.value}>
          {estimate.customer_name?.trim() || "—"}
        </Text>
      </View>
      {estimate.job_address && (
        <View style={styles.row}>
          <Text style={styles.label}>Job address</Text>
          <Text style={styles.value}>{estimate.job_address}</Text>
        </View>
      )}
      <View style={styles.row}>
        <Text style={styles.label}>Prepared on</Text>
        <Text style={styles.value}>{preparedOn}</Text>
      </View>
      {validUntil && (
        <View style={styles.row}>
          <Text style={styles.label}>Valid until</Text>
          <Text style={styles.value}>{validUntil}</Text>
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 3: Create Scope component**

Create `src/lib/pdf/components/Scope.tsx`:

```tsx
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_FONT_SIZES } from "../tokens";

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  title: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.label,
    fontWeight: 700,
    color: PDF_COLORS.textTertiary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  body: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.body,
    color: PDF_COLORS.text,
    lineHeight: 1.5,
  },
});

export function Scope({ text }: { text: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scope of work</Text>
      <Text style={styles.body}>{text}</Text>
    </View>
  );
}
```

- [ ] **Step 4: Create BomTable component**

Create `src/lib/pdf/components/BomTable.tsx`:

```tsx
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_FONT_SIZES } from "../tokens";
import type { Database } from "@/types/database";

type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  category: { marginBottom: 14 },
  categoryTitle: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.label,
    fontWeight: 700,
    color: PDF_COLORS.textTertiary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    borderBottom: `0.5px solid ${PDF_COLORS.border}`,
    paddingVertical: 5,
  },
  description: {
    flex: 1,
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.bomRow,
    color: PDF_COLORS.text,
  },
  qty: {
    width: 50,
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.bomRow,
    color: PDF_COLORS.textSecondary,
    textAlign: "right",
  },
  lineTotal: {
    width: 80,
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.bomRow,
    fontWeight: 600,
    color: PDF_COLORS.text,
    textAlign: "right",
  },
});

const CATEGORY_LABELS: Record<string, string> = {
  equipment: "Equipment",
  ductwork: "Ductwork",
  accessories: "Accessories",
  labor: "Labor",
  other: "Other",
};

function formatCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function BomTable({ items }: { items: BomRow[] }) {
  const grouped = new Map<string, BomRow[]>();
  for (const item of items) {
    const bucket = grouped.get(item.category) ?? [];
    bucket.push(item);
    grouped.set(item.category, bucket);
  }

  return (
    <View style={styles.container}>
      {Array.from(grouped.entries()).map(([category, rows]) => (
        <View key={category} style={styles.category}>
          <Text style={styles.categoryTitle}>
            {CATEGORY_LABELS[category] ?? category}
          </Text>
          {rows.map((row) => (
            <View key={row.id} style={styles.row}>
              <Text style={styles.description}>{row.description}</Text>
              <Text style={styles.qty}>
                {row.quantity} {row.unit}
              </Text>
              <Text style={styles.lineTotal}>
                {formatCurrency(row.total_cost)}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
```

- [ ] **Step 5: Create Total component**

Create `src/lib/pdf/components/Total.tsx`:

```tsx
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_FONT_SIZES } from "../tokens";

const styles = StyleSheet.create({
  container: {
    backgroundColor: PDF_COLORS.totalBg,
    border: `1px solid ${PDF_COLORS.totalBorder}`,
    borderRadius: 8,
    padding: 20,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.label,
    fontWeight: 700,
    color: PDF_COLORS.textTertiary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  value: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.total,
    fontWeight: 800,
    color: PDF_COLORS.accentDark,
    letterSpacing: -1,
  },
});

function formatCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function Total({ amount }: { amount: number }) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Total</Text>
      <Text style={styles.value}>{formatCurrency(amount)}</Text>
    </View>
  );
}
```

- [ ] **Step 6: Create Message component**

Create `src/lib/pdf/components/Message.tsx`:

```tsx
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_FONT_SIZES } from "../tokens";

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
    paddingTop: 16,
    borderTop: `1px solid ${PDF_COLORS.border}`,
  },
  body: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.body,
    color: PDF_COLORS.text,
    lineHeight: 1.5,
    fontStyle: "italic",
  },
});

export function Message({ text }: { text: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.body}>{text}</Text>
    </View>
  );
}
```

- [ ] **Step 7: Create Footer component**

Create `src/lib/pdf/components/Footer.tsx`:

```tsx
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_FONT_SIZES } from "../tokens";

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    borderTop: `0.5px solid ${PDF_COLORS.border}`,
    paddingTop: 10,
    alignItems: "center",
  },
  text: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.footer,
    color: PDF_COLORS.textTertiary,
    letterSpacing: 0.5,
  },
});

export function Footer() {
  return (
    <View fixed style={styles.container}>
      <Text style={styles.text}>Made with coolbid · coolbid.app</Text>
    </View>
  );
}
```

- [ ] **Step 8: Create Document component**

Create `src/lib/pdf/components/Document.tsx`:

```tsx
import { Document, Page, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_SPACING } from "../tokens";
import { Header } from "./Header";
import { Proposal } from "./Proposal";
import { Scope } from "./Scope";
import { BomTable } from "./BomTable";
import { Total } from "./Total";
import { Message } from "./Message";
import { Footer } from "./Footer";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

const styles = StyleSheet.create({
  page: {
    paddingTop: PDF_SPACING.page,
    paddingBottom: PDF_SPACING.page + 32,
    paddingHorizontal: PDF_SPACING.page,
    backgroundColor: "#FFFFFF",
    fontFamily: "Inter",
    color: PDF_COLORS.text,
  },
});

export function EstimateDocument({
  estimate,
  profile,
  bom,
  scopeText,
  logoBuffer,
}: {
  estimate: EstimateRow;
  profile: ProfileRow;
  bom: BomRow[];
  scopeText: string;
  logoBuffer: Buffer | null;
}) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Header profile={profile} logoBuffer={logoBuffer} />
        <Proposal estimate={estimate} />
        <Scope text={scopeText} />
        {estimate.display_mode === "itemized" && bom.length > 0 && (
          <BomTable items={bom} />
        )}
        <Total amount={estimate.total_price ?? 0} />
        {estimate.note_to_customer && (
          <Message text={estimate.note_to_customer} />
        )}
        <Footer />
      </Page>
    </Document>
  );
}
```

- [ ] **Step 9: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/pdf/components/
git commit -m "feat(pdf): branded estimate document components"
```

---

## Task 9: PDF renderer entry point

**Files:**
- Create: `src/lib/pdf/render-estimate-pdf.ts`
- Create: `src/lib/pdf/render-estimate-pdf.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/render-estimate-pdf.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import pdfParse from "pdf-parse";
import { renderEstimatePdf } from "./render-estimate-pdf";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type RoomRow = Database["public"]["Tables"]["estimate_rooms"]["Row"];
type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "u1",
    company_name: "Greenfield Heating & Air",
    company_email: "contact@greenfieldhvac.com",
    company_phone: "(918) 555-0100",
    address: "123 Main St",
    state: "OK",
    zip: "74824",
    stripe_customer_id: null,
    subscription_tier: "pro",
    subscription_status: "active",
    trial_ends_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-04-09T00:00:00Z",
    onboarding_completed: true,
    ai_actions_used: 0,
    stripe_subscription_id: null,
    subscription_period_end: null,
    referral_source: null,
    referral_code: null,
    default_display_mode: "total_only",
    default_quote_validity_days: 30,
    logo_url: null,
    logo_content_type: null,
    ...overrides,
  };
}

function estimate(overrides: Partial<EstimateRow> = {}): EstimateRow {
  return {
    id: "e1",
    user_id: "u1",
    project_name: "Doe Residence",
    customer_name: "Jane Doe",
    status: "draft",
    total_sqft: 1820,
    num_units: 1,
    hvac_per_unit: false,
    climate_zone: "3A",
    profit_margin: 25,
    labor_rate: 85,
    labor_hours: 16,
    supplier_name: "",
    total_material_cost: 6000,
    total_price: 9096,
    system_type: "heat_pump",
    created_at: "2026-04-09T00:00:00Z",
    updated_at: "2026-04-09T00:00:00Z",
    job_address: "456 Elm St, Agra OK 74824",
    customer_email: "jane@example.com",
    customer_phone: null,
    note_to_customer: null,
    valid_until: "2026-05-09",
    display_mode: "total_only",
    scope_of_work: null,
    ...overrides,
  };
}

const rooms: RoomRow[] = [];

const bom: BomRow[] = [
  {
    id: "b1",
    estimate_id: "e1",
    category: "equipment",
    description: "3.5-ton heat pump, 16 SEER2",
    quantity: 1,
    unit: "ea",
    unit_cost: 4280,
    total_cost: 4280,
    part_id: null,
    supplier: null,
    sku: null,
    notes: "",
    source: "catalog",
    room_id: null,
    created_at: "2026-04-09T00:00:00Z",
  },
];

describe("renderEstimatePdf", () => {
  it("produces a non-empty PDF buffer with customer and total text", async () => {
    const buffer = await renderEstimatePdf({
      estimate: estimate(),
      profile: profile(),
      rooms,
      bom,
      logoBuffer: null,
    });

    expect(buffer.length).toBeGreaterThan(1000);

    const parsed = await pdfParse(buffer);
    expect(parsed.text).toContain("Greenfield Heating & Air");
    expect(parsed.text).toContain("Jane Doe");
    expect(parsed.text).toContain("$9,096.00");
    expect(parsed.text).toContain("heat pump");
    // total_only mode — no itemized BOM description
    expect(parsed.text).not.toContain("3.5-ton heat pump, 16 SEER2");
  }, 30_000);

  it("includes BOM lines in itemized mode", async () => {
    const buffer = await renderEstimatePdf({
      estimate: estimate({ display_mode: "itemized" }),
      profile: profile(),
      rooms,
      bom,
      logoBuffer: null,
    });

    const parsed = await pdfParse(buffer);
    expect(parsed.text).toContain("3.5-ton heat pump, 16 SEER2");
    expect(parsed.text).toContain("$4,280.00");
  }, 30_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- render-estimate-pdf`

Expected: FAIL with "Cannot find module './render-estimate-pdf'".

- [ ] **Step 3: Implement the renderer**

Create `src/lib/pdf/render-estimate-pdf.ts`:

```ts
import { renderToBuffer } from "@react-pdf/renderer";
import { EstimateDocument } from "./components/Document";
import { registerPdfFonts } from "./fonts";
import { generateScopeOfWork } from "@/lib/share/scope-of-work";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type RoomRow = Database["public"]["Tables"]["estimate_rooms"]["Row"];
type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

export interface RenderEstimatePdfInput {
  estimate: EstimateRow;
  profile: ProfileRow;
  rooms: RoomRow[];
  bom: BomRow[];
  logoBuffer: Buffer | null;
}

export async function renderEstimatePdf(
  input: RenderEstimatePdfInput,
): Promise<Buffer> {
  registerPdfFonts();

  const scopeText =
    input.estimate.scope_of_work?.trim() ||
    generateScopeOfWork(input.estimate, input.bom);

  return renderToBuffer(
    <EstimateDocument
      estimate={input.estimate}
      profile={input.profile}
      bom={input.bom}
      scopeText={scopeText}
      logoBuffer={input.logoBuffer}
    />,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- render-estimate-pdf`

Expected: `✓ 2 passed`. First run may take ~10 seconds while fonts download.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/render-estimate-pdf.ts src/lib/pdf/render-estimate-pdf.test.ts
git commit -m "feat(pdf): renderEstimatePdf entry point with pdf-parse tests"
```

---

## Task 10: Logo loader with SVG rasterization

**Files:**
- Create: `src/lib/pdf/load-logo.ts`

- [ ] **Step 1: Write the logo loader**

Create `src/lib/pdf/load-logo.ts`:

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

const LOGO_BUCKET = "profile-logos";

/**
 * Download a contractor's logo and return a PNG/JPG buffer suitable for
 * embedding in a @react-pdf/renderer <Image>. SVG sources are rasterized
 * server-side via @resvg/resvg-js.
 *
 * Returns null if no logo is set or if loading fails — callers should
 * fall back to text rendering.
 */
export async function loadContractorLogo(
  profile: ProfileRow,
): Promise<Buffer | null> {
  if (!profile.logo_url) return null;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from(LOGO_BUCKET)
      .download(profile.logo_url);

    if (error || !data) {
      console.error("logo download failed", {
        logoUrl: profile.logo_url,
        error,
      });
      return null;
    }

    const raw = Buffer.from(await data.arrayBuffer());

    if (profile.logo_content_type === "image/svg+xml") {
      const { Resvg } = await import("@resvg/resvg-js");
      return new Resvg(raw, { fitTo: { mode: "width", value: 512 } })
        .render()
        .asPng();
    }

    return raw;
  } catch (err) {
    console.error("logo load threw", { logoUrl: profile.logo_url, err });
    return null;
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pdf/load-logo.ts
git commit -m "feat(pdf): logo loader with SVG rasterization fallback"
```

---

## Task 11: Profile logo upload API

**Files:**
- Create: `src/app/api/profile/logo/route.ts`

- [ ] **Step 1: Write the upload + delete route**

Create `src/app/api/profile/logo/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const LOGO_BUCKET = "profile-logos";
const MAX_BYTES = 1024 * 1024; // 1 MB
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
]);
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file provided" },
      { status: 400 },
    );
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Please upload a PNG, JPG, or SVG file" },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Logo must be 1 MB or smaller" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Minimal magic-byte check to catch renamed files.
  const looksLikePng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const looksLikeJpg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;
  const looksLikeSvg = buffer
    .slice(0, 512)
    .toString("utf8")
    .trim()
    .startsWith("<");

  const validMagic =
    (file.type === "image/png" && looksLikePng) ||
    (file.type === "image/jpeg" && looksLikeJpg) ||
    (file.type === "image/svg+xml" && looksLikeSvg);

  if (!validMagic) {
    return NextResponse.json(
      { error: "We couldn't read that file — please try another" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const ext = EXTENSIONS[file.type];
  const path = `${user.id}/logo.${ext}`;

  // Remove any existing logo at any extension for this user
  await admin.storage
    .from(LOGO_BUCKET)
    .remove([
      `${user.id}/logo.png`,
      `${user.id}/logo.jpg`,
      `${user.id}/logo.svg`,
    ]);

  const { error: uploadError } = await admin.storage
    .from(LOGO_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error("logo upload failed", { userId: user.id, error: uploadError });
    return NextResponse.json(
      { error: "Upload failed — please try again" },
      { status: 500 },
    );
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ logo_url: path, logo_content_type: file.type })
    .eq("id", user.id);

  if (profileError) {
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 },
    );
  }

  return NextResponse.json({ logo_url: path, logo_content_type: file.type });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  await admin.storage
    .from(LOGO_BUCKET)
    .remove([
      `${user.id}/logo.png`,
      `${user.id}/logo.jpg`,
      `${user.id}/logo.svg`,
    ]);

  const { error } = await supabase
    .from("profiles")
    .update({ logo_url: null, logo_content_type: null })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to clear logo" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/profile/logo/route.ts
git commit -m "feat(api): profile logo upload and delete endpoints"
```

---

## Task 12: Settings page — logo uploader component

**Files:**
- Create: `src/components/settings/logo-uploader.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Create the uploader component**

Create `src/components/settings/logo-uploader.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];

export function LogoUploader({
  initialLogoUrl,
  initialContentType,
}: {
  initialLogoUrl: string | null;
  initialContentType: string | null;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [contentType, setContentType] = useState<string | null>(initialContentType);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadPreview(path: string) {
    const supabase = createClient();
    const { data } = await supabase.storage
      .from("profile-logos")
      .createSignedUrl(path, 3600);
    setPreviewUrl(data?.signedUrl ?? null);
  }

  // Hydrate preview on mount if we already have a logo
  if (logoUrl && previewUrl === null) {
    void loadPreview(logoUrl);
  }

  async function handleFile(file: File) {
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Please upload a PNG, JPG, or SVG file");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Logo must be 1 MB or smaller");
      return;
    }

    setLoading(true);
    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/profile/logo", {
      method: "POST",
      body: form,
    });

    const json = (await res.json()) as
      | { logo_url: string; logo_content_type: string }
      | { error: string };

    setLoading(false);

    if (!res.ok || "error" in json) {
      setError("error" in json ? json.error : "Upload failed");
      return;
    }

    setLogoUrl(json.logo_url);
    setContentType(json.logo_content_type);
    await loadPreview(json.logo_url);
  }

  async function handleRemove() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/profile/logo", { method: "DELETE" });
    setLoading(false);

    if (!res.ok) {
      setError("Failed to remove logo");
      return;
    }

    setLogoUrl(null);
    setContentType(null);
    setPreviewUrl(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-32 items-center justify-center rounded-lg border border-border bg-bg-input">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Company logo preview"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-xs text-txt-tertiary">No logo</span>
          )}
        </div>

        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            {logoUrl ? "Replace" : "Upload logo"}
          </Button>
          {logoUrl && (
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={handleRemove}
            >
              <X className="mr-2 h-4 w-4" />
              Remove
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-txt-tertiary">
        PNG, JPG, or SVG. Max 1 MB. Shows on your customer-facing quotes.
      </p>

      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Wire the uploader into the settings page**

Modify `src/app/(app)/settings/page.tsx`. Add this import near the top with the other imports:

```tsx
import { LogoUploader } from "@/components/settings/logo-uploader";
```

Then, inside the `return` block, add a new `<Card>` for the logo section immediately after the existing **Company Profile** card (around line 204, before the `<SubscriptionStatus />`):

```tsx
<Card className="bg-gradient-card border-border">
  <CardHeader>
    <CardTitle className="text-txt-primary">Logo</CardTitle>
    <CardDescription className="text-txt-secondary">
      Appears on the PDF and share page you send to customers.
    </CardDescription>
  </CardHeader>
  <CardContent>
    <LogoUploader
      initialLogoUrl={profile?.logo_url ?? null}
      initialContentType={profile?.logo_content_type ?? null}
    />
  </CardContent>
</Card>
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Manual test**

Run: `npm run dev`

In a browser, go to `/settings`, upload a PNG, confirm the preview renders, remove it, upload an SVG, confirm the preview renders.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/logo-uploader.tsx src/app/\(app\)/settings/page.tsx
git commit -m "feat(settings): contractor logo uploader"
```

---

## Task 13: Share API — create / regenerate

**Files:**
- Create: `src/app/api/estimates/[id]/share/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/estimates/[id]/share/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createOrReplaceShare, revokeShare } from "@/lib/share/lifecycle";
import { generateScopeOfWork } from "@/lib/share/scope-of-work";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    display_mode?: "total_only" | "itemized";
    valid_until?: string | null;
    note_to_customer?: string | null;
    scope_of_work?: string | null;
    customer_email?: string | null;
  };

  // Load the estimate (RLS ensures ownership)
  const { data: estimate } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", id)
    .single();

  if (!estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  // Load BOM for scope-of-work fallback generation
  const { data: bomData } = await supabase
    .from("estimate_bom_items")
    .select("*")
    .eq("estimate_id", id);

  const bom = bomData ?? [];

  // Resolve scope_of_work: contractor-edited > estimate-saved > auto-generated
  const scopeOfWork =
    body.scope_of_work?.trim() ||
    estimate.scope_of_work?.trim() ||
    generateScopeOfWork(estimate, bom);

  // Update the estimate with share-time settings
  const updates: Record<string, unknown> = {
    scope_of_work: scopeOfWork,
    status: "sent",
  };
  if (body.display_mode) updates.display_mode = body.display_mode;
  if (body.valid_until !== undefined) updates.valid_until = body.valid_until;
  if (body.note_to_customer !== undefined)
    updates.note_to_customer = body.note_to_customer?.trim() || null;
  if (body.customer_email !== undefined)
    updates.customer_email = body.customer_email?.trim() || null;

  const { error: updateError } = await supabase
    .from("estimates")
    .update(updates)
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to update estimate: ${updateError.message}` },
      { status: 500 },
    );
  }

  // Create the share row
  const share = await createOrReplaceShare(id, body.valid_until ?? null);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://coolbid.app";

  return NextResponse.json({
    token: share.token,
    url: `${appUrl}/q/${share.token}`,
    expires_at: share.expires_at,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership via RLS-enabled read
  const { data: estimate } = await supabase
    .from("estimates")
    .select("id")
    .eq("id", id)
    .single();

  if (!estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  await revokeShare(id);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/estimates/\[id\]/share/route.ts
git commit -m "feat(api): share create, regenerate, and revoke"
```

---

## Task 14: Contractor PDF download route

**Files:**
- Create: `src/app/api/estimates/[id]/pdf/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/estimates/[id]/pdf/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderEstimatePdf } from "@/lib/pdf/render-estimate-pdf";
import { loadContractorLogo } from "@/lib/pdf/load-logo";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: estimate }, { data: profile }, { data: rooms }, { data: bom }] =
    await Promise.all([
      supabase.from("estimates").select("*").eq("id", id).single(),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("estimate_rooms").select("*").eq("estimate_id", id),
      supabase
        .from("estimate_bom_items")
        .select("*")
        .eq("estimate_id", id)
        .order("category"),
    ]);

  if (!estimate || !profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const logoBuffer = await loadContractorLogo(profile);
    const pdfBuffer = await renderEstimatePdf({
      estimate,
      profile,
      rooms: rooms ?? [],
      bom: bom ?? [],
      logoBuffer,
    });

    const filename = `${(estimate.project_name || "estimate")
      .replace(/[^a-z0-9-_ ]/gi, "")
      .trim()}.pdf`;

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("pdf render failed", { estimateId: id, err });
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/estimates/\[id\]/pdf/route.ts
git commit -m "feat(api): contractor PDF download route"
```

---

## Task 15: Customer details wizard step

**Files:**
- Create: `src/components/estimator/customer-details-step.tsx`
- Modify: `src/hooks/use-estimator.ts`
- Modify: `src/app/(app)/estimates/new/page.tsx`

- [ ] **Step 1: Read the existing estimator state hook**

Run: `cat src/hooks/use-estimator.ts`

Read carefully — the goal in the next step is to extend its state to include customer contact fields without breaking existing usages.

- [ ] **Step 2: Extend `use-estimator.ts` state**

Modify `src/hooks/use-estimator.ts` to add these fields to the state type:

```ts
// Add to the state interface:
customerName: string;
jobAddress: string;
customerEmail: string;
customerPhone: string;
projectName: string;
```

Initialize them to empty strings in the initial state object, and add setter functions:

```ts
setCustomerName: (value: string) => void;
setJobAddress: (value: string) => void;
setCustomerEmail: (value: string) => void;
setCustomerPhone: (value: string) => void;
setProjectName: (value: string) => void;
```

Each setter simply calls the existing state update pattern used in the hook.

Also add a new step value to whatever union type enumerates the wizard steps — add `"customer"` as the first step, before `"upload"`.

- [ ] **Step 3: Create the customer details step component**

Create `src/components/estimator/customer-details-step.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEstimator } from "@/hooks/use-estimator";

export function CustomerDetailsStep() {
  const {
    customerName,
    jobAddress,
    customerEmail,
    customerPhone,
    projectName,
    setCustomerName,
    setJobAddress,
    setCustomerEmail,
    setCustomerPhone,
    setProjectName,
    nextStep,
  } = useEstimator();

  const canProceed = customerName.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canProceed) return;
    nextStep();
  }

  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader>
        <CardTitle className="text-txt-primary">Customer details</CardTitle>
        <CardDescription className="text-txt-secondary">
          Capture this now while you're with the homeowner. You can edit it
          later if anything changes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="customer_name">Customer name *</Label>
            <Input
              id="customer_name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Jane Doe"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="job_address">Job address</Label>
            <Input
              id="job_address"
              value={jobAddress}
              onChange={(e) => setJobAddress(e.target.value)}
              placeholder="456 Elm St, Agra OK 74824"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customer_email">Email</Label>
              <Input
                id="customer_email"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_phone">Phone</Label>
              <Input
                id="customer_phone"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="(555) 000-0000"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project_name">Project name (optional)</Label>
            <Input
              id="project_name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Defaults to the job address"
            />
          </div>

          <Button
            type="submit"
            className="bg-gradient-brand hover-lift w-full"
            disabled={!canProceed}
          >
            Continue to floorplan
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Wire the new step into the estimator page**

Modify `src/app/(app)/estimates/new/page.tsx`. Find the step-routing switch (or conditional) and add a case for `"customer"` as the first step that renders `<CustomerDetailsStep />`. Also import the component at the top:

```tsx
import { CustomerDetailsStep } from "@/components/estimator/customer-details-step";
```

- [ ] **Step 5: Ensure the estimate is created with customer fields**

In the existing estimate-creation logic (wherever `supabase.from("estimates").insert(...)` is called in the estimator hook or submit handler), include the customer fields from state:

```ts
{
  user_id: userId,
  project_name: state.projectName.trim() || state.jobAddress.trim() || "Untitled",
  customer_name: state.customerName.trim(),
  job_address: state.jobAddress.trim() || null,
  customer_email: state.customerEmail.trim() || null,
  customer_phone: state.customerPhone.trim() || null,
  // ...other existing fields
}
```

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 7: Manual test**

Run: `npm run dev`

Go to `/estimates/new`, verify the customer step renders first, fill in required fields, click Continue, confirm the upload step renders next.

- [ ] **Step 8: Commit**

```bash
git add src/components/estimator/customer-details-step.tsx src/hooks/use-estimator.ts src/app/\(app\)/estimates/new/page.tsx
git commit -m "feat(estimator): customer details wizard step"
```

---

## Task 16: Customer card on estimate detail page

**Files:**
- Create: `src/components/estimates/customer-card.tsx`
- Create: `src/components/estimates/customer-dialog.tsx`
- Modify: `src/app/(app)/estimates/[id]/page.tsx`

- [ ] **Step 1: Create the customer dialog**

Create `src/components/estimates/customer-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

export interface CustomerDialogProps {
  estimateId: string;
  initial: {
    customer_name: string;
    job_address: string | null;
    customer_email: string | null;
    customer_phone: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerDialog({
  estimateId,
  initial,
  open,
  onOpenChange,
}: CustomerDialogProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    customer_name: initial.customer_name,
    job_address: initial.job_address ?? "",
    customer_email: initial.customer_email ?? "",
    customer_phone: initial.customer_phone ?? "",
  });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("estimates")
      .update({
        customer_name: form.customer_name.trim(),
        job_address: form.job_address.trim() || null,
        customer_email: form.customer_email.trim() || null,
        customer_phone: form.customer_phone.trim() || null,
      })
      .eq("id", estimateId);

    setSaving(false);

    if (updateError) {
      setError("Couldn't save — please try again");
      return;
    }

    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Customer details</DialogTitle>
          <DialogDescription>
            These fields appear on the PDF and share page.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cd_name">Customer name *</Label>
            <Input
              id="cd_name"
              value={form.customer_name}
              onChange={(e) =>
                setForm({ ...form, customer_name: e.target.value })
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cd_address">Job address</Label>
            <Input
              id="cd_address"
              value={form.job_address}
              onChange={(e) =>
                setForm({ ...form, job_address: e.target.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cd_email">Email</Label>
              <Input
                id="cd_email"
                type="email"
                value={form.customer_email}
                onChange={(e) =>
                  setForm({ ...form, customer_email: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cd_phone">Phone</Label>
              <Input
                id="cd_phone"
                type="tel"
                value={form.customer_phone}
                onChange={(e) =>
                  setForm({ ...form, customer_phone: e.target.value })
                }
              />
            </div>
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-gradient-brand hover-lift"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create the customer card**

Create `src/components/estimates/customer-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { User, MapPin, Mail, Phone, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CustomerDialog } from "./customer-dialog";

export interface CustomerCardProps {
  estimateId: string;
  customer_name: string;
  job_address: string | null;
  customer_email: string | null;
  customer_phone: string | null;
}

export function CustomerCard(props: CustomerCardProps) {
  const [open, setOpen] = useState(false);

  const hasAny =
    props.customer_name || props.job_address || props.customer_email || props.customer_phone;

  return (
    <>
      <Card className="bg-gradient-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-txt-primary">Customer</CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpen(true)}
            className="text-txt-secondary hover:text-txt-primary"
          >
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!hasAny && (
            <p className="text-txt-tertiary">
              No customer details yet. Click Edit to add them.
            </p>
          )}
          {props.customer_name && (
            <Row icon={<User className="h-4 w-4" />}>{props.customer_name}</Row>
          )}
          {props.job_address && (
            <Row icon={<MapPin className="h-4 w-4" />}>{props.job_address}</Row>
          )}
          {props.customer_email && (
            <Row icon={<Mail className="h-4 w-4" />}>{props.customer_email}</Row>
          )}
          {props.customer_phone && (
            <Row icon={<Phone className="h-4 w-4" />}>{props.customer_phone}</Row>
          )}
        </CardContent>
      </Card>

      <CustomerDialog
        estimateId={props.estimateId}
        initial={{
          customer_name: props.customer_name,
          job_address: props.job_address,
          customer_email: props.customer_email,
          customer_phone: props.customer_phone,
        }}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-txt-secondary">
      <span className="text-txt-tertiary">{icon}</span>
      <span className="text-txt-primary">{children}</span>
    </div>
  );
}
```

- [ ] **Step 3: Render the customer card on the estimate detail page**

Modify `src/app/(app)/estimates/[id]/page.tsx`. Add the import:

```tsx
import { CustomerCard } from "@/components/estimates/customer-card";
```

Then, inside the `return` block, add the customer card just after the "Back + Header" section and before the "Summary Cards" grid:

```tsx
<CustomerCard
  estimateId={est.id}
  customer_name={est.customer_name}
  job_address={est.job_address}
  customer_email={est.customer_email}
  customer_phone={est.customer_phone}
/>
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 5: Manual test**

Run `npm run dev`. Open any existing estimate, verify the customer card renders, click Edit, change a field, save, verify it persists.

- [ ] **Step 6: Commit**

```bash
git add src/components/estimates/customer-card.tsx src/components/estimates/customer-dialog.tsx src/app/\(app\)/estimates/\[id\]/page.tsx
git commit -m "feat(estimates): customer card with edit dialog on detail page"
```

---

## Task 17: Share dialog on estimate detail page

**Files:**
- Create: `src/components/estimates/share-dialog.tsx`
- Create: `src/components/estimates/share-block.tsx`
- Modify: `src/app/(app)/estimates/[id]/page.tsx`

- [ ] **Step 1: Create the share dialog**

Create `src/components/estimates/share-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, CircleX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ShareDialogProps {
  estimateId: string;
  initial: {
    display_mode: "total_only" | "itemized";
    valid_until: string | null;
    scope_of_work: string | null;
    note_to_customer: string | null;
    customer_email: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({
  estimateId,
  initial,
  open,
  onOpenChange,
}: ShareDialogProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ url: string; expires_at: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const defaultValidUntil =
    initial.valid_until ??
    (() => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d.toISOString().slice(0, 10);
    })();

  const [form, setForm] = useState({
    display_mode: initial.display_mode,
    valid_until: defaultValidUntil,
    scope_of_work: initial.scope_of_work ?? "",
    note_to_customer: initial.note_to_customer ?? "",
    customer_email: initial.customer_email ?? "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/estimates/${estimateId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_mode: form.display_mode,
        valid_until: form.valid_until || null,
        scope_of_work: form.scope_of_work.trim() || null,
        note_to_customer: form.note_to_customer.trim() || null,
        customer_email: form.customer_email.trim() || null,
      }),
    });

    setSubmitting(false);

    const json = (await res.json()) as
      | { url: string; expires_at: string }
      | { error: string };

    if (!res.ok || "error" in json) {
      setError("error" in json ? json.error : "Failed to generate link");
      return;
    }

    setResult({ url: json.url, expires_at: json.expires_at });
    router.refresh();
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRevoke() {
    setSubmitting(true);
    await fetch(`/api/estimates/${estimateId}/share`, { method: "DELETE" });
    setSubmitting(false);
    setResult(null);
    router.refresh();
    onOpenChange(false);
  }

  function handleClose() {
    setResult(null);
    setError(null);
    onOpenChange(false);
  }

  if (result) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link ready</DialogTitle>
            <DialogDescription>
              Copy this link and send it to {initial.customer_email || "the homeowner"}.
              The link expires {new Date(result.expires_at).toLocaleDateString()}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <Input readOnly value={result.url} className="font-mono text-xs" />
            <Button type="button" size="sm" onClick={handleCopy}>
              <Copy className="mr-2 h-4 w-4" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={handleRevoke}
              disabled={submitting}
            >
              <CircleX className="mr-2 h-4 w-4" />
              Revoke link
            </Button>
            <div className="flex gap-2">
              <a
                href={`/api/estimates/${estimateId}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button type="button" variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
              </a>
              <Button
                type="button"
                onClick={handleClose}
                className="bg-gradient-brand hover-lift"
              >
                Done
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share with the homeowner</DialogTitle>
          <DialogDescription>
            Generates a link you can text or email. You can revoke it anytime.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Display mode</Label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm text-txt-secondary">
                <input
                  type="radio"
                  name="display_mode"
                  value="total_only"
                  checked={form.display_mode === "total_only"}
                  onChange={() => setForm({ ...form, display_mode: "total_only" })}
                />
                Total only
              </label>
              <label className="flex items-center gap-2 text-sm text-txt-secondary">
                <input
                  type="radio"
                  name="display_mode"
                  value="itemized"
                  checked={form.display_mode === "itemized"}
                  onChange={() => setForm({ ...form, display_mode: "itemized" })}
                />
                Itemized
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sd_valid_until">Valid until</Label>
            <Input
              id="sd_valid_until"
              type="date"
              value={form.valid_until}
              onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sd_scope">Scope of work</Label>
            <Textarea
              id="sd_scope"
              rows={3}
              value={form.scope_of_work}
              onChange={(e) =>
                setForm({ ...form, scope_of_work: e.target.value })
              }
              placeholder="Auto-generated if left blank"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sd_note">Message to customer (optional)</Label>
            <Textarea
              id="sd_note"
              rows={2}
              value={form.note_to_customer}
              onChange={(e) =>
                setForm({ ...form, note_to_customer: e.target.value })
              }
              placeholder="Thanks for having me out Tuesday..."
            />
          </div>

          {!initial.customer_email && (
            <div className="space-y-2 rounded-md border border-warning bg-[rgba(251,191,36,0.08)] p-3">
              <p className="text-sm text-warning">
                No customer email on file. Add one so you have it for your records.
              </p>
              <Input
                type="email"
                value={form.customer_email}
                onChange={(e) =>
                  setForm({ ...form, customer_email: e.target.value })
                }
                placeholder="jane@example.com"
              />
            </div>
          )}

          {error && <p className="text-sm text-error">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-gradient-brand hover-lift"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate share link"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create the share block**

Create `src/components/estimates/share-block.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Share2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareDialog } from "./share-dialog";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type ShareRow = Database["public"]["Tables"]["estimate_shares"]["Row"];

export interface ShareBlockProps {
  estimate: EstimateRow;
  activeShare: ShareRow | null;
}

export function ShareBlock({ estimate, activeShare }: ShareBlockProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <a
          href={`/api/estimates/${estimate.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </a>
        <Button
          onClick={() => setOpen(true)}
          className="bg-gradient-brand hover-lift"
        >
          <Share2 className="mr-2 h-4 w-4" />
          {activeShare ? "Manage share link" : "Share with homeowner"}
        </Button>
      </div>

      {activeShare && (
        <p className="mt-2 text-right text-xs text-txt-tertiary">
          Active link · {activeShare.view_count} view
          {activeShare.view_count === 1 ? "" : "s"}
          {activeShare.last_viewed_at
            ? ` · last viewed ${new Date(activeShare.last_viewed_at).toLocaleDateString()}`
            : ""}
        </p>
      )}

      <ShareDialog
        estimateId={estimate.id}
        initial={{
          display_mode: estimate.display_mode,
          valid_until: estimate.valid_until,
          scope_of_work: estimate.scope_of_work,
          note_to_customer: estimate.note_to_customer,
          customer_email: estimate.customer_email,
        }}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
```

- [ ] **Step 3: Wire the share block into the detail page**

Modify `src/app/(app)/estimates/[id]/page.tsx`. Add the import:

```tsx
import { ShareBlock } from "@/components/estimates/share-block";
```

Update the parallel data load to also fetch the active share row:

```tsx
const [
  { data: estimate },
  { data: rooms },
  { data: bomItems },
  { data: shares },
] = await Promise.all([
  supabase.from("estimates").select("*").eq("id", id).single(),
  supabase
    .from("estimate_rooms")
    .select("*")
    .eq("estimate_id", id)
    .order("created_at"),
  supabase
    .from("estimate_bom_items")
    .select("*")
    .eq("estimate_id", id)
    .order("category"),
  supabase
    .from("estimate_shares")
    .select("*")
    .eq("estimate_id", id)
    .is("revoked_at", null)
    .maybeSingle(),
]);

const activeShare = (shares ?? null) as
  | Database["public"]["Tables"]["estimate_shares"]["Row"]
  | null;
```

Place `<ShareBlock estimate={est} activeShare={activeShare} />` inside the header row, to the right of the `<Badge>` status, as part of the same flex row.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 5: Manual test**

Run `npm run dev`. Open an estimate, click **Share with homeowner**, fill the dialog, generate a link, copy it, confirm the active-share badge appears. Click **Download PDF**, confirm the file downloads and opens cleanly.

- [ ] **Step 6: Commit**

```bash
git add src/components/estimates/share-dialog.tsx src/components/estimates/share-block.tsx src/app/\(app\)/estimates/\[id\]/page.tsx
git commit -m "feat(estimates): share dialog and share block"
```

---

## Task 18: Middleware allowlist for public share route

**Files:**
- Modify: `src/lib/supabase/middleware.ts`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Read both middleware files**

Run:
```bash
cat src/lib/supabase/middleware.ts src/middleware.ts
```

Identify where public paths (`/auth`, `/api`, static assets) are already allowlisted.

- [ ] **Step 2: Add `/q/` to the public path list**

In `src/lib/supabase/middleware.ts`, find the check that redirects unauthenticated users. Add `/q/` as a public prefix alongside any existing allowlisted paths.

Example — if the existing code looks like:

```ts
if (
  !user &&
  !request.nextUrl.pathname.startsWith("/auth") &&
  !request.nextUrl.pathname.startsWith("/api")
) {
  return NextResponse.redirect(/* ... */);
}
```

Change it to:

```ts
if (
  !user &&
  !request.nextUrl.pathname.startsWith("/auth") &&
  !request.nextUrl.pathname.startsWith("/api") &&
  !request.nextUrl.pathname.startsWith("/q/")
) {
  return NextResponse.redirect(/* ... */);
}
```

If the repo uses a `PUBLIC_PATHS` array, add `"/q/"` to that array instead.

Repeat the same change in `src/middleware.ts` if it has a duplicate allowlist.

- [ ] **Step 3: Verify**

Run `npm run dev`. Open `http://localhost:3000/q/nonexistent-token` while logged out. It should render a 404-style "not available" page (from Task 20), not redirect to `/auth/login`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/middleware.ts src/middleware.ts
git commit -m "feat(middleware): allow /q/ public share routes"
```

---

## Task 19: Public share page — not-available state

**Files:**
- Create: `src/app/q/[token]/not-available.tsx`

- [ ] **Step 1: Create the not-available component**

Create `src/app/q/[token]/not-available.tsx`:

```tsx
import { Snowflake } from "lucide-react";
import type { Database } from "@/types/database";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export function NotAvailable({ profile }: { profile: ProfileRow | null }) {
  const companyName = profile?.company_name?.trim() || "Your HVAC contractor";
  const phone = profile?.company_phone?.trim();
  const email = profile?.company_email?.trim();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-card">
          <Snowflake className="h-8 w-8 text-accent-light" strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl font-bold text-txt-primary">
          This proposal isn&rsquo;t available anymore.
        </h1>
        <p className="mt-3 text-txt-secondary">
          Contact {companyName} for an updated copy.
        </p>
        {(phone || email) && (
          <div className="mt-6 space-y-1 text-sm text-txt-secondary">
            {phone && <p>{phone}</p>}
            {email && <p>{email}</p>}
          </div>
        )}
        <p className="mt-10 text-xs text-txt-tertiary">
          Made with coolbid · coolbid.app
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/q/\[token\]/not-available.tsx
git commit -m "feat(q): not-available view for revoked/expired/missing tokens"
```

---

## Task 20: Public share page — main route

**Files:**
- Create: `src/app/q/[token]/page.tsx`

- [ ] **Step 1: Write the public share page**

Create `src/app/q/[token]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupShareByToken } from "@/lib/share/lifecycle";
import { generateScopeOfWork } from "@/lib/share/scope-of-work";
import { NotAvailable } from "./not-available";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

export const dynamic = "force-dynamic";

export default async function PublicSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await lookupShareByToken(token);

  if (result.status === "not_found") {
    return <NotAvailable profile={null} />;
  }

  const admin = createAdminClient();

  // Fetch estimate + profile + BOM in parallel
  const [{ data: estimate }, { data: bomData }] = await Promise.all([
    admin
      .from("estimates")
      .select("*")
      .eq("id", result.status === "ok" ? result.share.estimate_id : "")
      .maybeSingle(),
    admin
      .from("estimate_bom_items")
      .select("*")
      .eq("estimate_id", result.status === "ok" ? result.share.estimate_id : "")
      .order("category"),
  ]);

  if (!estimate) {
    return <NotAvailable profile={null} />;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", (estimate as EstimateRow).user_id)
    .maybeSingle();

  if (result.status === "revoked" || result.status === "expired") {
    return <NotAvailable profile={(profile as ProfileRow) ?? null} />;
  }

  const est = estimate as EstimateRow;
  const prof = profile as ProfileRow;
  const bom = (bomData ?? []) as BomRow[];
  const scopeText = est.scope_of_work?.trim() || generateScopeOfWork(est, bom);

  // Signed URL for the logo if one is set
  let logoSignedUrl: string | null = null;
  if (prof.logo_url) {
    const { data: signed } = await admin.storage
      .from("profile-logos")
      .createSignedUrl(prof.logo_url, 3600);
    logoSignedUrl = signed?.signedUrl ?? null;
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="relative mx-auto max-w-3xl px-6 py-16">
        {/* Ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[700px] -translate-x-1/2 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(6,182,212,0.14) 0%, transparent 70%)",
          }}
        />

        <article className="relative rounded-2xl border border-border bg-bg-card/70 p-8 shadow-[0_30px_100px_-20px_rgba(6,182,212,0.25)] backdrop-blur-xl sm:p-10">
          {/* Contractor header */}
          <header className="border-b border-border pb-6">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              {logoSignedUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoSignedUrl}
                  alt={`${prof.company_name} logo`}
                  className="max-h-14 max-w-[200px] object-contain"
                />
              )}
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-txt-primary">
                  {prof.company_name?.trim() || "Your HVAC Company"}
                </h1>
                <p className="mt-1 text-sm text-txt-secondary">
                  {[prof.address, prof.state, prof.zip].filter(Boolean).join(" · ")}
                </p>
                <p className="text-sm text-txt-secondary">
                  {[prof.company_phone, prof.company_email].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
          </header>

          {/* Proposal meta */}
          <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MetaRow label="Proposal for" value={est.customer_name || "—"} />
            {est.job_address && (
              <MetaRow label="Job address" value={est.job_address} />
            )}
            <MetaRow
              label="Prepared on"
              value={new Date(est.created_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            />
            {est.valid_until && (
              <MetaRow
                label="Valid until"
                value={new Date(est.valid_until).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              />
            )}
          </section>

          {/* Scope */}
          <section className="mt-8">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-tertiary">
              Scope of work
            </h2>
            <p className="mt-3 text-base leading-relaxed text-txt-primary">
              {scopeText}
            </p>
          </section>

          {/* Itemized BOM (conditional) */}
          {est.display_mode === "itemized" && bom.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-tertiary">
                Included
              </h2>
              <div className="mt-3 overflow-hidden rounded-lg border border-border">
                <table
                  className="w-full text-sm"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  <tbody>
                    {bom.map((item) => (
                      <tr key={item.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-txt-primary">
                          {item.description}
                        </td>
                        <td className="px-4 py-3 text-right text-txt-secondary">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-txt-primary">
                          ${item.total_cost.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Total */}
          <section className="mt-8 flex items-center justify-between rounded-xl border border-b-accent bg-[rgba(6,182,212,0.06)] px-6 py-5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-tertiary">
              Total
            </span>
            <span
              className="text-4xl font-extrabold text-gradient-brand"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              $
              {(est.total_price ?? 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </section>

          {/* Message */}
          {est.note_to_customer && (
            <section className="mt-8 border-t border-border pt-6">
              <p className="italic text-txt-secondary">{est.note_to_customer}</p>
            </section>
          )}

          {/* Download button */}
          <footer className="mt-10 flex flex-col items-center gap-4 border-t border-border pt-6">
            <a
              href={`/q/${token}/pdf`}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-6 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(6,182,212,0.25)] transition-transform hover:-translate-y-0.5"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </a>
            <p className="text-xs text-txt-tertiary">
              Made with coolbid · coolbid.app
            </p>
          </footer>
        </article>
      </div>
    </main>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-txt-tertiary">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-txt-primary">{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Manual test**

Run `npm run dev`. Create an estimate, generate a share link, open the URL in an incognito window. Confirm the dark share page renders with contractor header, scope, total, and PDF download button.

- [ ] **Step 4: Commit**

```bash
git add src/app/q/\[token\]/page.tsx
git commit -m "feat(q): public share page with dark theme"
```

---

## Task 21: Public PDF download route

**Files:**
- Create: `src/app/q/[token]/pdf/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/q/[token]/pdf/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupShareByToken } from "@/lib/share/lifecycle";
import { renderEstimatePdf } from "@/lib/pdf/render-estimate-pdf";
import { loadContractorLogo } from "@/lib/pdf/load-logo";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type RoomRow = Database["public"]["Tables"]["estimate_rooms"]["Row"];
type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const result = await lookupShareByToken(token);

  if (result.status !== "ok") {
    return NextResponse.json(
      { error: "Not available" },
      { status: 404 },
    );
  }

  const admin = createAdminClient();
  const estimateId = result.share.estimate_id;

  const [
    { data: estimate },
    { data: rooms },
    { data: bom },
  ] = await Promise.all([
    admin.from("estimates").select("*").eq("id", estimateId).maybeSingle(),
    admin.from("estimate_rooms").select("*").eq("estimate_id", estimateId),
    admin
      .from("estimate_bom_items")
      .select("*")
      .eq("estimate_id", estimateId)
      .order("category"),
  ]);

  if (!estimate) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", (estimate as EstimateRow).user_id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  try {
    const logoBuffer = await loadContractorLogo(profile as ProfileRow);
    const pdfBuffer = await renderEstimatePdf({
      estimate: estimate as EstimateRow,
      profile: profile as ProfileRow,
      rooms: (rooms ?? []) as RoomRow[],
      bom: (bom ?? []) as BomRow[],
      logoBuffer,
    });

    const filename = `${((estimate as EstimateRow).project_name || "quote")
      .replace(/[^a-z0-9-_ ]/gi, "")
      .trim()}.pdf`;

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("public pdf render failed", { token, err });
    return new Response("PDF unavailable, please try again shortly.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Manual test**

With a valid share link open, click **Download PDF** on the public share page. Confirm the file downloads and opens.

- [ ] **Step 4: Commit**

```bash
git add src/app/q/\[token\]/pdf/route.ts
git commit -m "feat(q): public PDF download via token"
```

---

## Task 22: Settings page — display mode and validity defaults

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Extend the settings form state**

In `src/app/(app)/settings/page.tsx`, add these fields to the `form` useState initializer alongside the existing company fields:

```ts
default_display_mode: "total_only" as "total_only" | "itemized",
default_quote_validity_days: 30,
```

Populate them from `data` in the existing `load()` effect:

```ts
default_display_mode: data.default_display_mode ?? "total_only",
default_quote_validity_days: data.default_quote_validity_days ?? 30,
```

Include them in the `handleSave` update payload:

```ts
default_display_mode: form.default_display_mode,
default_quote_validity_days: form.default_quote_validity_days,
```

- [ ] **Step 2: Add UI for the defaults**

Inside the existing **Company Profile** card's form (after the ZIP code row), add:

```tsx
<div className="space-y-2">
  <Label>Default quote display mode</Label>
  <div className="flex gap-4">
    <label className="flex items-center gap-2 text-sm text-txt-secondary">
      <input
        type="radio"
        name="default_display_mode"
        checked={form.default_display_mode === "total_only"}
        onChange={() =>
          setForm({ ...form, default_display_mode: "total_only" })
        }
      />
      Total only
    </label>
    <label className="flex items-center gap-2 text-sm text-txt-secondary">
      <input
        type="radio"
        name="default_display_mode"
        checked={form.default_display_mode === "itemized"}
        onChange={() =>
          setForm({ ...form, default_display_mode: "itemized" })
        }
      />
      Itemized
    </label>
  </div>
</div>
<div className="space-y-2">
  <Label htmlFor="validity_days">Default quote validity (days)</Label>
  <Input
    id="validity_days"
    type="number"
    min={1}
    max={180}
    value={form.default_quote_validity_days}
    onChange={(e) =>
      setForm({
        ...form,
        default_quote_validity_days: Number(e.target.value) || 30,
      })
    }
  />
</div>
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Manual test**

Go to `/settings`, change the default display mode and validity days, save, reload, verify the values persist.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/settings/page.tsx
git commit -m "feat(settings): contractor defaults for display mode and quote validity"
```

---

## Task 23: Dashboard view count badge

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Extend the recent estimates query**

In `src/app/(app)/dashboard/page.tsx`, replace the recent-estimates query to join the active share:

```ts
const { data: recentEstimates } = await supabase
  .from("estimates")
  .select(
    `id, project_name, customer_name, total_price, status,
     estimate_shares!left ( view_count, last_viewed_at, revoked_at )`,
  )
  .order("updated_at", { ascending: false })
  .limit(5);
```

- [ ] **Step 2: Render the view count**

Inside the recent-estimates list mapping, derive the active share for each row and render a small view badge when the estimate has been viewed:

```tsx
{estimates.map((estimate) => {
  const activeShare = (estimate.estimate_shares ?? []).find(
    (s: { revoked_at: string | null }) => s.revoked_at === null,
  );
  const viewCount = activeShare?.view_count ?? 0;

  return (
    <li key={estimate.id}>
      <Link
        href={`/estimates/${estimate.id}`}
        className="flex items-center justify-between rounded-md border border-border p-3 transition-colors hover:bg-bg-card-hover"
      >
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-txt-primary font-medium">{estimate.project_name}</p>
            <p className="text-txt-secondary text-sm">{estimate.customer_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-txt-primary font-medium">
            {estimate.total_price != null
              ? `$${estimate.total_price.toLocaleString()}`
              : "—"}
          </span>
          {viewCount > 0 && (
            <span className="rounded-full bg-[rgba(6,182,212,0.1)] px-2 py-0.5 text-xs text-accent-light">
              {viewCount} view{viewCount === 1 ? "" : "s"}
            </span>
          )}
          <span className="text-txt-tertiary text-xs capitalize">{estimate.status}</span>
        </div>
      </Link>
    </li>
  );
})}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/dashboard/page.tsx
git commit -m "feat(dashboard): show view count for shared estimates"
```

---

## Task 24: Full test and lint

**Files:** none

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: no errors. Fix anything trivial inline.

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: build succeeds. `/q/[token]` and `/q/[token]/pdf` appear as dynamic routes in the build output.

- [ ] **Step 5: Commit any trivial fixes**

```bash
git add -A
git commit -m "chore: fix lint/type findings from full build" || echo "nothing to commit"
```

---

## Task 25: Manual smoke test checklist

**Files:** none

Don't skip this. The feature has enough moving parts that end-to-end verification catches things the type checker can't.

- [ ] **Dev server up**

Run: `npm run dev`

- [ ] **Upload a logo**

`/settings` → upload a PNG, confirm preview. Remove. Upload an SVG, confirm preview renders.

- [ ] **Create a new estimate**

`/estimates/new` → the customer-details step renders first. Fill in customer name, job address, email, phone. Continue. Complete the floorplan flow through BOM.

- [ ] **Open the estimate detail page**

Verify the Customer card renders with the values you entered. Click **Edit**, change the phone number, save, confirm it persists.

- [ ] **Download PDF as contractor**

Click **Download PDF**. Open the file. Verify:
- Contractor logo (or company name) at top
- Customer name and job address in the Proposal section
- Scope of work sentence renders
- Total matches the app's displayed total
- `Made with coolbid` footer at bottom

- [ ] **Generate a share link**

Click **Share with homeowner**. Choose **Total only** mode. Confirm the scope-of-work field is prefilled. Click **Generate share link**. Confirm the dialog switches to the "Link ready" state.

- [ ] **Open the share link in an incognito window**

Paste the URL into a private browsing tab. Verify:
- Page renders with contractor header + total
- Dark theme with cyan glow
- Total matches
- **Download PDF** button downloads a PDF

- [ ] **Confirm view count updates**

Return to the contractor dashboard. Confirm the shared estimate shows `1 view`.

- [ ] **Test itemized mode**

Open the same estimate, **Share with homeowner** again, select **Itemized**, generate a new link. Open in incognito. Confirm the "Included" table renders with line items (description, quantity, line total — no unit cost column).

- [ ] **Test revoke**

Back on the estimate detail page, open the share dialog (which should now show the manage state), click **Revoke link**. Open the old incognito tab and refresh — confirm the "not available" view renders.

- [ ] **Test an expired link**

In the DB (Supabase dashboard or `psql`), manually set `expires_at` to a past date for an active share row. Open the URL. Confirm the "not available" view renders.

- [ ] **Ship it**

Once the checklist is clean:

```bash
git checkout main
git merge feature/share-to-homeowner
git push
vercel deploy --prod
```

Then hit the production URL and repeat the smoke test in prod.

---

## Self-review

- **Spec coverage**
  - Customer details wizard step → Task 15 ✓
  - Customer card + edit dialog → Task 16 ✓
  - Share dialog + link lifecycle → Tasks 13, 17 ✓
  - Public share page → Task 20 ✓
  - PDF generation → Tasks 7, 8, 9 ✓
  - SVG rasterization → Task 10 ✓
  - Logo upload → Tasks 11, 12 ✓
  - Service-role client → Task 3 ✓
  - View tracking → Task 6 (lifecycle) + Task 23 (dashboard display) ✓
  - Status transition draft→sent on share → Task 13 ✓
  - `declined` enum added → Task 1 ✓
  - Profile defaults + settings UI → Tasks 1, 22 ✓
  - Middleware allowlist → Task 18 ✓
  - Not-available (revoked/expired/missing) view → Task 19 ✓
  - Error handling (tracking failures, PDF errors, logo magic bytes) → Tasks 6, 11, 14, 21 ✓

- **No placeholders** — all code blocks are complete. No "implement similar to above" or "add error handling" stubs.

- **Type consistency** — `EstimateRow`, `ProfileRow`, `BomRow`, `RoomRow`, `ShareRow` aliases are consistent across tasks. `display_mode` is `"total_only" | "itemized"` everywhere. `estimate_shares` table name is consistent.

- **Execution order** — dependencies resolve: migrations before types, types before code, pure logic before API routes, API routes before UI that calls them, public route after service-role client is in place.
