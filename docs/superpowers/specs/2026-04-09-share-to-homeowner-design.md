# Send to Homeowner — Design

**Date:** 2026-04-09
**Owner:** Kolbey Pruitt
**Status:** Approved, ready for implementation plan

## Goal

Give contractors a branded, customer-facing PDF and a public share link for every estimate. Close the gap between "coolbid builds a BOM" and "coolbid is the tool I use to actually send quotes." After this ships, a contractor can create an estimate, hit **Share with homeowner**, and hand the customer a link or a file that represents a real quote from their business.

## Why now

- The product promises a customer-facing artifact ("Floorplan in. Bill of materials out. Your equipment catalog, your labor rate, your margin — baked into a clean estimate you can hand to the homeowner") but does not currently produce one. Contractors still have to re-type BOMs into Word or Google Docs.
- Without a shipped artifact, coolbid is an internal calculator. With one, it replaces an existing part of the workflow — the single biggest jump in stickiness.
- Accept / decline tracking, win/loss analytics, follow-up nudges, and a customers table all depend on the share-link surface existing first. Everything that comes next is cheaper once this lands.

## User flows

### Contractor: create and share an estimate

1. Click **New Estimate**.
2. **NEW wizard step 0 — Customer details.** Single form, captured while the contractor is likely still with the homeowner:
   - `customer_name` (required)
   - `job_address`
   - `customer_email`
   - `customer_phone`
   - `project_name` (optional; auto-filled from `job_address` if blank)
3. Existing wizard steps run unchanged: Upload → Page select → Analyzing → Rooms → BOM.
4. Lands on `/estimates/[id]`. The detail page grows two additions:
   - A **Customer** card at the top, showing the fields from step 2, with an **Edit** button that opens a dialog (same form, prefilled) so fields can be corrected or completed later.
   - Two new actions in the header: **Share with homeowner** (primary) and **Download PDF** (secondary).
5. Clicking **Share with homeowner** opens a dialog that captures the remaining share-time decisions:
   - `display_mode` (radio): **Total only** (default, from profile) or **Itemized**
   - `valid_until` (date): default = today + `profiles.default_quote_validity_days`
   - `scope_of_work` (textarea): prefilled with an auto-generated sentence, editable
   - `note_to_customer` (optional textarea)
   - Warning block if `customer_email` is missing — dialog allows filling it inline so the contractor isn't forced to navigate away.
6. Submitting the dialog calls `POST /api/estimates/[id]/share`, which:
   - Saves the share-time fields onto the `estimates` row
   - Revokes any existing active share row for this estimate
   - Inserts a new `estimate_shares` row with a fresh token
   - Flips `estimates.status` from `draft` to `sent`
   - Returns `{ token, url, expires_at }`
7. The dialog switches to a **Link ready** state showing:
   - Full share URL with a **Copy** button
   - Expiration date
   - **Download PDF**, **Revoke link**, **Done** actions

### Contractor: revoke or regenerate

From the **Share** block on the estimate detail page:
- **Revoke** marks the current token as revoked, which causes the public URL to return a "not available" page.
- Clicking **Share with homeowner** again after a revoke generates a brand new token. The old one stays dead forever.

### Homeowner: view the shared quote

1. Open `https://coolbid.app/q/<token>` on any device.
2. Server component resolves the token via a service-role Supabase client, loads the estimate + profile + BOM, and increments view tracking.
3. The **public share page** renders dark, mobile-first, mirroring the PDF content:
   - Contractor header: logo (if uploaded) or large bold company name, plus address / phone / email
   - **Proposal for** line: customer name and job address
   - **Valid until** line
   - Scope of work paragraph
   - Itemized section (only in `itemized` mode): BOM grouped by category, showing description + quantity + line total. No unit cost column, ever.
   - Big **TOTAL** in the brand gradient
   - Contractor's personal note (if present)
   - Contractor signature line (name + email)
   - **Download PDF** button that hits `/q/<token>/pdf`
   - Small `Made with coolbid · coolbid.app` footer

### Homeowner: link is revoked or expired

Dedicated view, not a 404:

> This proposal isn't available anymore.
> Contact Greenfield Heating & Air at (918) 555-0100 or kolbey@greenfieldhvac.com for an updated copy.

Contractor contact comes from the `profiles` row associated with the estimate. No information leaks about whether the token ever existed, whether it was revoked or expired, or what the estimate contained.

## Data model

### `estimates` additions

```sql
alter table estimates
  add column job_address       text,
  add column customer_email    text,
  add column customer_phone    text,
  add column note_to_customer  text,
  add column valid_until       date,
  add column display_mode      text not null default 'total_only'
    check (display_mode in ('total_only', 'itemized')),
  add column scope_of_work     text; -- nullable; null = auto-generate at render

-- Add 'declined' to the status enum now, even though v1 has no UI to set it,
-- so follow-up work doesn't need to touch the constraint.
alter table estimates
  drop constraint if exists estimates_status_check;
alter table estimates
  add constraint estimates_status_check
  check (status in ('draft', 'sent', 'accepted', 'declined'));
```

All new columns are nullable or defaulted so existing rows keep working.

### `profiles` additions

```sql
alter table profiles
  add column default_display_mode          text not null default 'total_only'
    check (default_display_mode in ('total_only', 'itemized')),
  add column default_quote_validity_days   integer not null default 30,
  add column logo_url                      text,
  add column logo_content_type             text;
```

`logo_content_type` lets the PDF renderer decide whether to rasterize the logo (SVG) or embed it directly (PNG / JPG) without re-sniffing the file.

### `estimate_shares` table (new)

```sql
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

-- Only one active (non-revoked) share per estimate, enforced at the DB level.
create unique index estimate_shares_active_per_estimate
  on estimate_shares (estimate_id)
  where revoked_at is null;

-- Fast token lookup for the public route.
create index estimate_shares_token_idx
  on estimate_shares (token)
  where revoked_at is null;

alter table estimate_shares enable row level security;

-- Contractor can read and manage their own estimates' share rows.
create policy "shares_owner_rw" on estimate_shares for all
  using (exists (
    select 1 from estimates
    where estimates.id = estimate_shares.estimate_id
      and estimates.user_id = auth.uid()
  ));
```

**Public lookup** of share rows happens only from the service-role Supabase client inside the public share route. Anon role has no policy and no access.

### Supabase storage: `profile-logos` bucket

```sql
-- Run in a migration or the Supabase dashboard
insert into storage.buckets (id, name, public)
values ('profile-logos', 'profile-logos', false)
on conflict (id) do nothing;

-- Owner can upload / update / delete objects under their user id prefix
create policy "owner_rw" on storage.objects for all
  using (
    bucket_id = 'profile-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

Objects live at `profile-logos/<user_id>/logo.<ext>`. The bucket is private; the PDF renderer and the public share page both read it via the service-role client.

## Architecture

### New files

```
src/
  app/
    q/
      [token]/
        page.tsx                # public share page (server component, dark)
        pdf/
          route.ts              # GET: stream PDF by token
    api/
      estimates/[id]/
        share/
          route.ts              # POST (create/regenerate), DELETE (revoke)
        pdf/
          route.ts              # GET: stream PDF for the owning contractor
      profile/
        logo/
          route.ts              # POST (upload), DELETE (remove)
  lib/
    pdf/
      render-estimate-pdf.ts    # entry point: (data) -> Buffer
      load-logo.ts              # storage fetch + optional SVG rasterization
      tokens.ts                 # color + font size constants mirroring brand
      fonts.ts                  # Inter font registration for @react-pdf
      components/
        Document.tsx
        Header.tsx
        Proposal.tsx
        Scope.tsx
        BomTable.tsx
        Total.tsx
        Message.tsx
        Footer.tsx
    share/
      tokens.ts                 # generateShareToken()
      lifecycle.ts              # create / revoke / load by token
      scope-of-work.ts          # deterministic scope sentence generator
    supabase/
      admin.ts                  # service-role client, server-only guard
  components/
    estimator/
      customer-details-step.tsx # new wizard step 0
    estimates/
      customer-card.tsx         # panel on detail page
      customer-dialog.tsx       # shared edit form (dialog)
      share-dialog.tsx          # share-time form + link-ready state
      share-block.tsx           # "current share link" status block on detail page
    settings/
      logo-uploader.tsx         # upload / preview / remove logo
```

### Modified files

```
supabase/migrations/006_share_to_homeowner.sql   # new migration (all DB changes)
src/types/database.ts                             # add new columns + table type
src/app/(app)/estimates/new/page.tsx              # wire in wizard step 0
src/components/estimator/upload-step.tsx          # no longer first step
src/hooks/use-estimator.ts                        # carry customer fields through state
src/app/(app)/estimates/[id]/page.tsx             # add Customer card + Share/Download actions + Share block
src/app/(app)/settings/page.tsx                   # add Logo section + display-mode + validity defaults
src/lib/supabase/middleware.ts                    # allowlist /q/:path*
src/middleware.ts                                  # allowlist /q/:path*
```

### PDF generation

**Library:** `@react-pdf/renderer`. Runs in a Vercel Node function with no headless Chrome. Supports custom fonts via URL. Generates a buffer that we stream directly as a `Response`.

**Module interface:**

```ts
// src/lib/pdf/render-estimate-pdf.ts
export interface RenderEstimatePdfInput {
  estimate: EstimateRow;
  profile: ProfileRow;
  rooms: RoomRow[];
  bom: BomRow[];
  logoBuffer: Buffer | null; // already rasterized if source was SVG
}

export async function renderEstimatePdf(
  input: RenderEstimatePdfInput
): Promise<Buffer>;
```

Callers (the API routes) handle the logo fetch and SVG rasterization before calling this, so the PDF module is pure: data in, bytes out. Easy to test in isolation.

### Logo handling

```ts
// src/lib/pdf/load-logo.ts
export async function loadContractorLogo(
  profile: ProfileRow
): Promise<Buffer | null> {
  if (!profile.logo_url) return null;

  const raw = await downloadFromStorage(profile.logo_url);

  if (profile.logo_content_type === "image/svg+xml") {
    const { Resvg } = await import("@resvg/resvg-js");
    return new Resvg(raw, { fitTo: { mode: "width", value: 512 } })
      .render()
      .asPng();
  }

  return raw;
}
```

- Dynamic `import` of `@resvg/resvg-js` keeps it out of the client bundle.
- SVG is rasterized to 512 px width — enough for ~64 px PDF render with 8× retina headroom.
- Storage downloads use the service-role client.

**Logo upload flow:**

1. Contractor picks a file in `logo-uploader.tsx` on the settings page.
2. Client-side check rejects files > 1 MB or not in `["image/png","image/jpeg","image/svg+xml"]`.
3. Client `POST`s the file to `/api/profile/logo`.
4. Server validates file size against a hard cap (1.2 MB read limit), verifies the content type against magic bytes (not just the header), uploads to `profile-logos/<user_id>/logo.<ext>`, and sets `profiles.logo_url` + `profiles.logo_content_type`.
5. Client shows the new logo in the preview slot. **Remove** calls `DELETE /api/profile/logo`, which deletes the storage object and clears the profile fields.

**Rendering:**

- PDF: `<Image src={logoBuffer} />` at fixed max height ~64 px, max width ~240 px.
- Share page: signed URL from Supabase Storage (1 hour expiry), rendered in `<img>` at max height 48 px.
- Fallback: if `logo_url` is null, both surfaces render `profile.company_name` in Inter Extrabold instead.

### Share tokens

```ts
// src/lib/share/tokens.ts
import { randomBytes } from "node:crypto";

export function generateShareToken(): string {
  // 32 bytes → 43 chars base64url, 256 bits of entropy.
  return randomBytes(32).toString("base64url");
}
```

Lookup is done by the unique DB index; there's no manual string comparison that could leak timing information.

### Scope of work auto-generation

```ts
// src/lib/share/scope-of-work.ts
export function generateScopeOfWork(estimate: EstimateRow, bom: BomRow[]): string {
  // Deterministic template based on main equipment + sqft + climate zone.
  // Example:
  // "HVAC system installation — 3.5-ton heat pump sized for 1,820 sq ft,
  // Zone 3A. Includes ductwork, line set, labor, and disposal."
}
```

Used to prefill `scope_of_work` in the share dialog if the contractor hasn't edited it. No AI — pure template.

### Public share page

```
src/app/q/[token]/page.tsx
```

- Lives **outside** the `(app)` route group, so no sidebar, no auth middleware, no dashboard chrome.
- Uses the service-role client to load the share row, the estimate, the profile, and the BOM.
- Rejects revoked, expired, or missing tokens with a dedicated view (not a generic 404).
- Increments view tracking inside a try/catch so a tracking failure never blocks the render.
- Generates a short-lived signed URL for the contractor logo so it can render in the dark page.

### Middleware

The existing Supabase middleware redirects unauthenticated users to `/auth/login`. Add `/q/:path*` to the public paths allowlist in both `src/lib/supabase/middleware.ts` and the wrapper at `src/middleware.ts`.

## Error handling

| Scenario | Behavior |
|---|---|
| Token doesn't exist | Generic "not available" page; no information about whether it ever existed. |
| Token revoked | "Not available anymore" view with contractor contact. |
| Token expired | Same as revoked. |
| Estimate deleted after share created | `ON DELETE CASCADE` removes the share; becomes 404. |
| PDF render throws | Contractor-authed route returns 500 + JSON error body. Public route returns a plain HTML page: "PDF unavailable, try again shortly." Error is logged with estimate ID. |
| Logo upload wrong MIME | Server rejects with 400 + "We couldn't read that file — please upload a PNG, JPG, or SVG." |
| Logo upload > 1 MB | Client-side check rejects early. Server truncates at 1.2 MB and rejects with a clear error if the file body exceeds that. |
| SVG rasterization fails | Log error, return 400 on upload route, or fall back to text rendering on PDF render. |
| Contractor regenerates share while an old link is open | Old tab becomes a 404 on the next navigation; no data leak. |
| Service-role client imported into a client component | `src/lib/supabase/admin.ts` has a runtime `if (typeof window !== "undefined") throw` guard at module load. |
| Share view tracking update fails | Catch, log, continue rendering the page. Contractor sees slightly stale view stats; homeowner is unaffected. |

## Testing

- **Unit:** `renderEstimatePdf` produces a non-empty buffer; `pdf-parse` text extraction from the buffer contains the customer name, company name, and formatted total. Test one row for each display mode.
- **Unit:** `generateShareToken` returns a 43-character string; 1,000 calls produce 1,000 unique values.
- **Unit:** `generateScopeOfWork` produces the expected sentence for a representative estimate + BOM fixture.
- **Integration:** `POST /api/estimates/[id]/share` creates a share row and flips the estimate status to `sent`. A second call revokes the first and inserts a new row. The unique index prevents two active rows.
- **Integration:** `GET /q/<valid_token>` returns 200 and increments `view_count`.
- **Integration:** `GET /q/<revoked_token>` and `GET /q/<expired_token>` both return the "not available" view.
- **Integration:** `POST /api/profile/logo` with a valid PNG stores the file and updates the profile. Same with a valid SVG. A 2 MB file is rejected.
- **Manual smoke after deploy:** Create an estimate end to end; share it; open the link in an incognito window on desktop and mobile; download the PDF; verify the contractor logo appears; verify the dashboard shows a view count; revoke the link; verify the revoked page renders.

No E2E tests for this feature. The repository does not currently have Playwright, and adding it is out of scope.

## Scope boundaries

### In scope for this spec

- Customer details wizard step (step 0)
- Customer card + edit dialog on estimate detail page
- Share dialog + link generation + revocation
- Public share page (`/q/[token]`) with dark theme
- PDF generation via `@react-pdf/renderer` for both authenticated contractor downloads and token-based public downloads
- Contractor logo upload on settings page (PNG, JPG, SVG — SVG rasterized server-side)
- View tracking (count + timestamps)
- Status transition: `draft → sent` on first share
- New `declined` status enum value (added now, used later)
- `default_display_mode` and `default_quote_validity_days` on profiles, surfaced in settings

### Out of scope — noted as follow-ups

- Homeowner **Accept** and **Decline** buttons on the share page
- Email delivery of the share link from coolbid's server
- Customers table (CRM-lite) — schema is designed so a future `customer_id` FK can be added without data loss
- Multiple concurrent share links per estimate
- Access analytics beyond view count (country, referrer, device breakdown)
- Contractor notifications on view or accept (email, push)
- Watermarks on expired PDFs
- Custom PDF accent color per contractor
