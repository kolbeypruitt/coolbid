# Quote Miner — Design Spec

## Overview

Add automated email-based quote discovery to CoolBid. Users connect their Gmail account, and a scheduled cron job scans their inbox every 15 minutes for supplier quotes. Parsed quotes land in a review queue where users approve them before they're saved to the equipment catalog.

This feature lives inside CoolBid — no separate service, no separate repo. A cron job (via external cron-job.org) triggers a Next.js API route, which fetches emails via Gmail API, parses them with Claude Vision (the existing parsing logic refactored into a shared helper), and inserts them into the existing `quotes` table with a new "parsed" status.

**Goal:** Dramatically reduce onboarding friction and ongoing manual work. A new user connects Gmail once and their equipment catalog fills itself with real supplier pricing automatically.

## Scope

**V1 in scope:**
- Gmail OAuth (Google API) — ~30% of target market
- Background sync every 15 minutes via external cron
- Historical sync of last 90 days on first connect
- Filter by user's selected suppliers (known domains + custom)
- PDF attachment parsing + email body text parsing
- Review queue — parsed quotes require user approval before joining catalog
- Live sync status UI via Supabase real-time
- Active token revocation on disconnect

**V1 out of scope (deferred):**
- Outlook / Microsoft Graph (V1.1)
- Yahoo / IMAP / app passwords (V1.2)
- Full event-driven flow (auto-moving estimates from "awaiting_quotes" to "ready") — data model lays foundation but flow isn't built yet
- Supabase Vault for token encryption
- Email notifications on sync events

## Architecture

Single service architecture inside CoolBid:

```
cron-job.org (external, free)
  → POST https://coolbid.vercel.app/api/cron/sync-emails
    (Authorization: Bearer CRON_SECRET)
    → Next.js API route processes ONE email_connections row per invocation
      → Google OAuth token refresh if needed
      → Gmail API search (scoped to supplier domains + keywords)
      → For up to 5 new messages per invocation:
        → Fetch message via Gmail API
        → Extract attachments (PDF) or strip HTML body
        → Call shared parseQuoteContent(...) helper
        → Insert quote + quote_lines with status = 'parsed'
      → Update sync_cursor + last_sync_at
      → Real-time event via Supabase broadcasts to the UI

Browser (React)
  → Subscribes to email_connections + quotes via Supabase Realtime
  → Shows live sync status + pending review count
  → User clicks a quote in the review queue
    → Opens existing QuoteReview component
    → Approve → status becomes 'saved', items enter catalog
    → Reject → status becomes 'rejected', quote hidden from queue
```

Two boundaries:
1. **Cron endpoint** is authenticated via a static Bearer token (not Supabase auth) because the cron service doesn't have a user session
2. **User-facing OAuth + UI** are authenticated via the existing Supabase auth middleware

## Data Model

### Migration: `supabase/migrations/004_quote_miner.sql`

**New table: `email_connections`**

```sql
create table public.email_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('gmail')),
  email_address text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_sync_status text not null default 'idle' check (last_sync_status in ('idle', 'syncing', 'error')),
  last_sync_error text,
  sync_cursor text,
  initial_sync_days int not null default 90,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_email_connections_user_id on public.email_connections(user_id);
create index idx_email_connections_last_sync_at on public.email_connections(last_sync_at nulls first);

alter table public.email_connections enable row level security;
create policy "Users can CRUD own email connections" on public.email_connections for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger set_updated_at before update on public.email_connections
  for each row execute function public.update_updated_at();
```

**New table: `supplier_email_domains`**

```sql
create table public.supplier_email_domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete cascade,
  domain text not null,
  is_starter boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_supplier_email_domains_user_id on public.supplier_email_domains(user_id);
create index idx_supplier_email_domains_domain on public.supplier_email_domains(domain);

alter table public.supplier_email_domains enable row level security;
create policy "Users can CRUD own supplier domains" on public.supplier_email_domains for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**Alter `quotes` table:**

```sql
alter table public.quotes add column if not exists source_type text default 'manual_upload'
  check (source_type in ('manual_upload', 'email_attachment', 'email_body'));
alter table public.quotes add column if not exists source_email_id text;
alter table public.quotes add column if not exists source_email_subject text;
alter table public.quotes add column if not exists source_email_from text;
alter table public.quotes add column if not exists source_email_date timestamptz;

create unique index if not exists idx_quotes_source_email_id on public.quotes(user_id, source_email_id)
  where source_email_id is not null;
```

The unique index prevents re-processing the same Gmail message for a given user.

**Update `quotes.status` constraint:**

```sql
alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('parsed', 'reviewing', 'saved', 'rejected'));
```

`parsed` is now the "awaiting review" state. `saved` is approved. `rejected` is the new dismissed state.

## Gmail OAuth Flow

### Google Cloud Setup (manual, pre-deploy)

1. Create project in Google Cloud Console
2. Enable Gmail API
3. Create OAuth 2.0 Client ID (Web Application)
4. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/gmail/callback` (dev)
   - `https://coolbid.vercel.app/api/auth/gmail/callback` (prod)
5. Configure OAuth consent screen:
   - Scopes: `openid`, `email`, `https://www.googleapis.com/auth/gmail.readonly`
   - App name: CoolBid
   - User support email: your email
   - Developer contact: your email
6. During dev: add test users (your partner, yourself) under Test Users
7. Save Client ID + Client Secret as env vars

### OAuth Routes

**`GET /api/auth/gmail/connect`** — Starts OAuth flow
- Verifies user is authenticated
- Generates signed state token containing user_id + timestamp
- Constructs Google OAuth URL with scopes and state
- Redirects to Google

**`GET /api/auth/gmail/callback`** — Receives OAuth code
- Verifies state parameter (prevents CSRF)
- Exchanges code for access_token + refresh_token via Google token endpoint
- Fetches user's Gmail address via Google userinfo endpoint
- Inserts or updates `email_connections` row
- Triggers first sync by setting `last_sync_at = null` (cron will pick it up on next run)
- Redirects to `/parts-database?connected=true`

**`POST /api/auth/gmail/disconnect`** — Removes connection
- Verifies user owns the connection
- Calls Google revoke endpoint: `POST https://oauth2.googleapis.com/revoke?token={refresh_token}`
- Deletes `email_connections` row
- Returns 200

## Sync Worker

### Route: `POST /api/cron/sync-emails`

**Authentication:** Static Bearer token in `Authorization` header matching `CRON_SECRET` env var. Returns 401 if missing/invalid. This is the ONLY protected endpoint in CoolBid that doesn't use Supabase auth — the cron service can't have a user session.

**Sync algorithm:**

1. **Pick one account to sync:**
   ```
   SELECT * FROM email_connections
   WHERE last_sync_at IS NULL OR last_sync_at < now() - interval '15 minutes'
   ORDER BY last_sync_at NULLS FIRST
   LIMIT 1
   ```

2. **Mark as syncing:**
   ```
   UPDATE email_connections SET last_sync_status = 'syncing' WHERE id = ?
   ```

3. **Refresh token if needed** — if `expires_at < now() + 5 min`, call Google's token refresh endpoint and update `access_token` + `expires_at`

4. **Build Gmail search query:**
   - Fetch user's `supplier_email_domains` rows
   - Construct: `from:(domain1.com OR domain2.com OR ...) AND (has:attachment OR subject:(quote OR pricing OR estimate)) AND newer_than:90d`
   - Fallback if no domains: skip sync (nothing to search for)

5. **List messages via Gmail API** (`users.messages.list`)
   - Returns IDs only (cheap call)
   - Exclude IDs already in `quotes.source_email_id` for this user

6. **Process up to 5 new messages per invocation** (keeps total time under Vercel Hobby's 10s timeout):
   - Fetch full message via `users.messages.get?format=full`
   - Parse headers: From, Subject, Date
   - Detect attachments: iterate message parts, find `Content-Type: application/pdf`
   - If PDF found: download attachment via `users.messages.attachments.get`, convert to base64
   - If no PDF: extract HTML body → strip to plain text
   - Call shared `parseQuoteContent({ images: [...] } | { text: "..." })`
   - If parsing succeeds, insert into `quotes` + `quote_lines` with:
     - `source_type = 'email_attachment'` or `'email_body'`
     - `source_email_id = message.id`
     - `source_email_subject = headers.subject`
     - `source_email_from = headers.from`
     - `source_email_date = headers.date`
     - `status = 'parsed'`
   - Each message = 1 AI action, counted against trial limit

7. **Update connection state:**
   ```
   UPDATE email_connections SET
     last_sync_at = now(),
     last_sync_status = 'idle',
     last_sync_error = null,
     sync_cursor = <latest Gmail history ID>
   WHERE id = ?
   ```

8. **On error:** Set `last_sync_status = 'error'`, `last_sync_error = message`, don't update `last_sync_at` so retry happens next invocation

**Trial cap integration:** Each email parse is an AI action. Use existing `checkAiActionLimit` helper. If user is out of actions, skip parsing for that account and log a message in `last_sync_error` (e.g., "Trial limit reached — subscribe to continue syncing").

**Rate limiting:** Gmail API allows 250 quota units/sec per user. Message list ~5 units, message get ~5 units, attachment get ~5 units. 5 messages × 15 units ≈ 75 units, well under limit.

### Shared parseQuoteContent Helper

Extract the Claude Vision logic from `src/app/api/parse-quote/route.ts` into `src/lib/hvac/parse-quote.ts`:

```typescript
type ParseInput =
  | { type: "images"; images: Array<{ base64: string; mediaType: string; pageNum?: number }> }
  | { type: "text"; text: string };

export async function parseQuoteContent(input: ParseInput): Promise<ParsedQuoteResult> {
  // Build Claude content array
  // Call anthropic.messages.create
  // Strip markdown fences, extract JSON
  // Return parsed result
}
```

Both `/api/parse-quote` (manual upload) and `/api/cron/sync-emails` (automated) call this helper.

## UI

### Parts Database Page — Email Connections Section

Add a new section at the top of `/parts-database`:

```
┌─ Email Connections ─────────────────────────────┐
│                                                 │
│  Gmail · partner@example.com           [✓] idle│
│  Last sync: 2 minutes ago · 3 new quotes        │
│                          [Review Queue] [Disconnect] │
│                                                 │
│  [+ Connect Gmail]                              │
└─────────────────────────────────────────────────┘

┌─ Pending Review (3) ────────────────────────────┐
│  You have 3 quotes waiting for review.          │
│                          [Go to Review Queue →] │
└─────────────────────────────────────────────────┘
```

**EmailConnectionCard** component:
- Subscribed to `email_connections` via Supabase Realtime
- Shows provider icon, email, last sync time (relative), current status pill
- Status pills:
  - `idle` → gray pill, "Idle"
  - `syncing` → accent-glow pill with spinner, "Syncing..."
  - `error` → error-bg pill, "Error" + tooltip with message
- Click count shows number of `status = 'parsed'` quotes
- "Review Queue" button → `/parts-database/review`
- "Disconnect" button with confirmation

**EmailConnectButton** component:
- "Connect Gmail" with gradient brand styling + Gmail icon
- Redirects to `/api/auth/gmail/connect`

### Review Queue Page

**`/parts-database/review`** — lists all quotes with `status = 'parsed'`:

- Filter/sort: supplier, date, source (email vs manual)
- Each row:
  - Source badge ("Email" / "Manual")
  - Supplier name (from quote.supplier_id join)
  - Quote date (or source_email_date)
  - From email (if email)
  - Line item count
  - Estimated total
  - "Review" button → opens existing QuoteReview component with this quote's data
- Bulk actions:
  - "Approve all from [Supplier]" — sets status='saved', creates catalog entries, creates price history, for all selected quotes
  - "Reject selected" — sets status='rejected'
- Empty state: "No quotes waiting for review"

**Reuse `QuoteReview` component** — already handles editing parsed line items and saving to catalog. Adapted to load from DB (via quote ID) instead of fresh parse result.

### Sidebar Pending Review Badge

Modify `src/components/layout/sidebar.tsx`:
- Subscribe to `quotes` table count filtered by `user_id = current user AND status = 'parsed'`
- Show count badge next to "Parts Database" nav item: `Parts Database (3)`
- Badge uses `bg-accent-glow text-accent-light` pill styling

## Security

- **Cron endpoint** protected by `CRON_SECRET` Bearer token. Without it, anyone could trigger syncs and potentially cause denial-of-service or extract parsed data.
- **OAuth state parameter** signed with server secret to prevent CSRF. Contains user_id + timestamp. Rejected if older than 10 minutes.
- **OAuth tokens** stored in Supabase with RLS. Users can only read their own tokens. Cron uses service role to read all connections.
- **Token revocation** on disconnect is active (calls Google's revoke endpoint) before deleting the row. Prevents lingering access.
- **Read-only Gmail scope** — we request `gmail.readonly`. No ability to send, modify, or delete emails. Limits blast radius if tokens are compromised.
- **Duplicate message detection** via unique index on `(user_id, source_email_id)`. Prevents re-processing emails even if the cron runs unexpectedly multiple times.
- **Trial limit enforcement** on every sync — prevents trial users from bypassing the 50 AI action cap via email crawling.

## Error Handling

**Gmail API errors:**
- 401 invalid_token → refresh token, retry once. If refresh fails, mark connection as error with "Reauthorize required"
- 429 rate limit → stop current sync, leave `last_sync_at` unchanged so it retries in 15 min
- 500 server error → log and retry next invocation
- User revoked access in Google → detect via refresh failure, mark connection as error with "Reconnect Gmail"

**Claude parsing errors:**
- Invalid JSON response → log, skip this email, mark as error in quote record, continue processing next email
- Claude API error → log, skip, continue

**Cron safety:**
- Never crash the cron endpoint. Individual email failures don't stop the batch.
- Errors logged to `last_sync_error` for user visibility + Vercel logs for debugging
- Failed cron invocation should be retryable — cron-job.org retries automatically on non-2xx

## Environment Variables

Add to Vercel + `.env.local.example`:

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://coolbid.vercel.app/api/auth/gmail/callback
CRON_SECRET=<generate random 32-byte hex>
OAUTH_STATE_SECRET=<generate random 32-byte hex for signing state tokens>
```

## File Structure

**New:**
- `supabase/migrations/004_quote_miner.sql`
- `src/types/email-connection.ts`
- `src/lib/gmail/client.ts` — Gmail API wrapper
- `src/lib/gmail/oauth.ts` — OAuth URL generation, token exchange, refresh
- `src/lib/gmail/search.ts` — build Gmail search queries
- `src/lib/gmail/parse.ts` — extract sender/subject/body/attachments from messages
- `src/lib/gmail/sync.ts` — core sync logic
- `src/lib/hvac/parse-quote.ts` — shared Claude Vision helper
- `src/lib/cron-auth.ts` — verify cron bearer token
- `src/lib/oauth-state.ts` — sign/verify state tokens
- `src/app/api/auth/gmail/connect/route.ts`
- `src/app/api/auth/gmail/callback/route.ts`
- `src/app/api/auth/gmail/disconnect/route.ts`
- `src/app/api/cron/sync-emails/route.ts`
- `src/app/(app)/parts-database/review/page.tsx`
- `src/components/parts-database/email-connection-card.tsx`
- `src/components/parts-database/email-connect-button.tsx`
- `src/components/parts-database/review-queue.tsx`
- `src/components/parts-database/review-queue-row.tsx`

**Modified:**
- `src/app/api/parse-quote/route.ts` — refactor to call shared `parseQuoteContent`
- `src/app/(app)/parts-database/page.tsx` — add email connections section + pending review banner
- `src/components/layout/sidebar.tsx` — add real-time review count badge
- `src/types/database.ts` — add new tables, update quotes columns
- `src/lib/hvac/starter-kits.ts` — add email domains to starter suppliers
- `.env.local.example` — new env vars

## External Setup Post-Deploy

1. **Google Cloud Console:** create OAuth Client ID, configure consent screen, add redirect URIs, save secrets
2. **Vercel env vars:** add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, CRON_SECRET, OAUTH_STATE_SECRET
3. **cron-job.org:** create account, add new cron job:
   - URL: `https://coolbid.vercel.app/api/cron/sync-emails`
   - Method: POST
   - Headers: `Authorization: Bearer <CRON_SECRET>`
   - Schedule: every 15 minutes
4. **Research supplier email domains** for the 5 starter suppliers (Johnstone, Sanders, Shearer, Locke, Amsco) and seed them via migration or manual SQL

## Future Extensions (Not V1)

- **Microsoft OAuth** — Outlook via Graph API (V1.1)
- **IMAP support** — Yahoo, iCloud, custom domains via app password (V1.2)
- **Full event-driven estimate workflow** — estimates transition from `awaiting_quotes` → `ready` automatically when matching quotes arrive
- **Email notifications** — Resend integration to notify users when new quotes land
- **Smart auto-save** — trusted suppliers skip the review queue
- **Gmail push notifications** — real-time sync instead of 15-minute polling
- **Supabase Vault** for token encryption
