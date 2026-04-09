# Quote Miner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gmail email crawling to CoolBid that automatically discovers supplier quotes, parses them with Claude Vision, and queues them for user review — all running inside CoolBid via an external cron job.

**Architecture:** Next.js API routes handle Gmail OAuth and a cron-triggered sync worker. The sync worker uses Google's Gmail API to fetch emails from the user's configured supplier domains, extracts PDF attachments or body text, and passes them through a shared parse-quote helper (refactored from the existing manual upload route). Parsed quotes land in a review queue with `status = 'parsed'`. UI updates live via Supabase Realtime. OAuth tokens stored in Supabase with RLS; cron uses service role.

**Tech Stack:** Next.js 15 API routes, Google Gmail API v1, Supabase (PostgreSQL + RLS + Realtime), Anthropic Claude Vision, external cron service (cron-job.org)

**Spec:** `docs/superpowers/specs/2026-04-09-quote-miner-design.md`

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/004_quote_miner.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 004_quote_miner.sql
-- Quote Miner: email connections, supplier domains, quote source tracking

-- ============================================================
-- EMAIL CONNECTIONS
-- ============================================================
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

create policy "Users can CRUD own email connections"
  on public.email_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger set_updated_at
  before update on public.email_connections
  for each row execute function public.update_updated_at();

-- ============================================================
-- SUPPLIER EMAIL DOMAINS
-- ============================================================
create table public.supplier_email_domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete cascade,
  domain text not null,
  is_starter boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_supplier_email_domains_user_id on public.supplier_email_domains(user_id);
create index idx_supplier_email_domains_supplier_id on public.supplier_email_domains(supplier_id);
create index idx_supplier_email_domains_domain on public.supplier_email_domains(domain);

alter table public.supplier_email_domains enable row level security;

create policy "Users can CRUD own supplier domains"
  on public.supplier_email_domains for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- QUOTES: source tracking + new status
-- ============================================================
alter table public.quotes add column if not exists source_type text not null default 'manual_upload'
  check (source_type in ('manual_upload', 'email_attachment', 'email_body'));
alter table public.quotes add column if not exists source_email_id text;
alter table public.quotes add column if not exists source_email_subject text;
alter table public.quotes add column if not exists source_email_from text;
alter table public.quotes add column if not exists source_email_date timestamptz;

-- Prevent re-processing the same Gmail message for a user
create unique index if not exists idx_quotes_source_email_id
  on public.quotes(user_id, source_email_id)
  where source_email_id is not null;

-- Update status constraint to include 'rejected'
alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('parsed', 'reviewing', 'saved', 'rejected'));
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: Migration applied successfully.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/004_quote_miner.sql
git commit -m "feat(quote-miner): add migration for email connections and supplier domains"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `src/types/email-connection.ts`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Create email connection types**

Create `src/types/email-connection.ts`:

```typescript
export type EmailProvider = "gmail";

export type EmailSyncStatus = "idle" | "syncing" | "error";

export type EmailConnection = {
  id: string;
  user_id: string;
  provider: EmailProvider;
  email_address: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scopes: string[];
  connected_at: string;
  last_sync_at: string | null;
  last_sync_status: EmailSyncStatus;
  last_sync_error: string | null;
  sync_cursor: string | null;
  initial_sync_days: number;
  created_at: string;
  updated_at: string;
};

export type SupplierEmailDomain = {
  id: string;
  user_id: string | null;
  supplier_id: string | null;
  domain: string;
  is_starter: boolean;
  created_at: string;
};

export type GmailMessageHeader = {
  name: string;
  value: string;
};

export type GmailMessagePart = {
  partId: string;
  mimeType: string;
  filename: string;
  headers: GmailMessageHeader[];
  body: {
    size: number;
    data?: string;
    attachmentId?: string;
  };
  parts?: GmailMessagePart[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: GmailMessagePart;
  internalDate: string;
};

export type ExtractedEmailContent = {
  messageId: string;
  from: string;
  subject: string;
  date: string;
  attachments: Array<{
    filename: string;
    mimeType: string;
    base64: string;
  }>;
  bodyText: string;
};
```

- [ ] **Step 2: Update database.ts**

Read `src/types/database.ts`. Add:

1. To the `profiles.Row` (no changes — existing fields still used)

2. To the `quotes.Row`:
```typescript
source_type: "manual_upload" | "email_attachment" | "email_body";
source_email_id: string | null;
source_email_subject: string | null;
source_email_from: string | null;
source_email_date: string | null;
```
And `status` becomes: `"parsed" | "reviewing" | "saved" | "rejected"`.

Same additions to `Insert` (all optional) and `Update`.

3. Add new `email_connections` table type following the same Row/Insert/Update/Relationships pattern used by other tables.

4. Add new `supplier_email_domains` table type.

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/types/email-connection.ts src/types/database.ts
git commit -m "feat(quote-miner): add email connection and quote source types"
```

---

## Task 3: OAuth State Signing + Cron Auth Helpers

**Files:**
- Create: `src/lib/oauth-state.ts`
- Create: `src/lib/cron-auth.ts`
- Modify: `.env.local.example`

- [ ] **Step 1: Create OAuth state signing helper**

Create `src/lib/oauth-state.ts`:

```typescript
import { createHmac, timingSafeEqual } from "crypto";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET?.trim();
  if (!secret) throw new Error("OAUTH_STATE_SECRET is not set");
  return secret;
}

export function signOAuthState(payload: { userId: string }): string {
  const data = JSON.stringify({ ...payload, ts: Date.now() });
  const encoded = Buffer.from(data).toString("base64url");
  const signature = createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(
  state: string
): { valid: true; userId: string } | { valid: false; error: string } {
  const parts = state.split(".");
  if (parts.length !== 2) return { valid: false, error: "Invalid state format" };

  const [encoded, signature] = parts;
  const expected = createHmac("sha256", getSecret()).update(encoded).digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, error: "Invalid signature" };
  }

  try {
    const data = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!data.userId || !data.ts) {
      return { valid: false, error: "Invalid payload" };
    }
    if (Date.now() - data.ts > STATE_TTL_MS) {
      return { valid: false, error: "State expired" };
    }
    return { valid: true, userId: data.userId };
  } catch {
    return { valid: false, error: "Invalid payload" };
  }
}
```

- [ ] **Step 2: Create cron auth helper**

Create `src/lib/cron-auth.ts`:

```typescript
import { NextRequest } from "next/server";

export function verifyCronAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("CRON_SECRET is not set");
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const expected = `Bearer ${secret}`;
  if (authHeader.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < authHeader.length; i++) {
    diff |= authHeader.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
```

- [ ] **Step 3: Update .env.local.example**

Add to `.env.local.example`:

```
# Google OAuth (Gmail API)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/gmail/callback

# Quote Miner
CRON_SECRET=
OAUTH_STATE_SECRET=
```

- [ ] **Step 4: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/oauth-state.ts src/lib/cron-auth.ts .env.local.example
git commit -m "feat(quote-miner): add OAuth state signing and cron auth helpers"
```

---

## Task 4: Gmail OAuth Routes

**Files:**
- Create: `src/lib/gmail/oauth.ts`
- Create: `src/app/api/auth/gmail/connect/route.ts`
- Create: `src/app/api/auth/gmail/callback/route.ts`
- Create: `src/app/api/auth/gmail/disconnect/route.ts`

- [ ] **Step 1: Create Gmail OAuth library**

Create `src/lib/gmail/oauth.ts`:

```typescript
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
];

function getConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth env vars are not set");
  }

  return { clientId, clientSecret, redirectUri };
}

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = getConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = getConfig();

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = getConfig();

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  return response.json();
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
    method: "POST",
  });
}

export async function fetchUserEmail(accessToken: string): Promise<string> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) throw new Error("Failed to fetch user email");

  const data = (await response.json()) as { email: string };
  return data.email;
}
```

- [ ] **Step 2: Create /api/auth/gmail/connect route**

Create `src/app/api/auth/gmail/connect/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl } from "@/lib/gmail/oauth";
import { signOAuthState } from "@/lib/oauth-state";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const state = signOAuthState({ userId: user.id });
    const authUrl = buildAuthUrl(state);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("Failed to build auth URL:", error);
    return NextResponse.json(
      { error: "OAuth configuration error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Create /api/auth/gmail/callback route**

Create `src/app/api/auth/gmail/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { exchangeCodeForTokens, fetchUserEmail } from "@/lib/gmail/oauth";
import { verifyOAuthState } from "@/lib/oauth-state";
import type { Database } from "@/types/database";

function getServiceClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/parts-database?gmail_error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/parts-database?gmail_error=missing_params`);
  }

  const stateResult = verifyOAuthState(state);
  if (!stateResult.valid) {
    return NextResponse.redirect(
      `${appUrl}/parts-database?gmail_error=${encodeURIComponent(stateResult.error)}`
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        `${appUrl}/parts-database?gmail_error=no_refresh_token`
      );
    }

    const emailAddress = await fetchUserEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const supabase = getServiceClient();
    const { error: upsertError } = await supabase
      .from("email_connections")
      .upsert(
        {
          user_id: stateResult.userId,
          provider: "gmail",
          email_address: emailAddress,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          scopes: tokens.scope.split(" "),
          last_sync_at: null,
          last_sync_status: "idle",
          last_sync_error: null,
        },
        { onConflict: "user_id,email_address" }
      );

    if (upsertError) {
      console.error("Failed to save connection:", upsertError);
      return NextResponse.redirect(`${appUrl}/parts-database?gmail_error=save_failed`);
    }

    return NextResponse.redirect(`${appUrl}/parts-database?gmail_connected=true`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(`${appUrl}/parts-database?gmail_error=callback_failed`);
  }
}
```

Note: The `upsert` with `onConflict: "user_id,email_address"` requires a unique constraint on those columns. Add that constraint by updating the migration OR change to a manual select-then-insert/update pattern. For simplicity, change the approach: select existing row first, update if exists, insert if not. Adjust code accordingly.

Actually, simplest fix: just do a delete-then-insert for reconnects, OR add a unique constraint. Pick one and implement consistently.

**Decision for this plan:** Do a select-then-insert/update pattern (no unique constraint change needed):

```typescript
// Check for existing connection
const { data: existing } = await supabase
  .from("email_connections")
  .select("id")
  .eq("user_id", stateResult.userId)
  .eq("email_address", emailAddress)
  .maybeSingle();

if (existing) {
  await supabase
    .from("email_connections")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      scopes: tokens.scope.split(" "),
      last_sync_at: null,
      last_sync_status: "idle",
      last_sync_error: null,
    })
    .eq("id", existing.id);
} else {
  const { error: insertError } = await supabase
    .from("email_connections")
    .insert({
      user_id: stateResult.userId,
      provider: "gmail",
      email_address: emailAddress,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      scopes: tokens.scope.split(" "),
    });
  if (insertError) {
    console.error("Failed to save connection:", insertError);
    return NextResponse.redirect(`${appUrl}/parts-database?gmail_error=save_failed`);
  }
}
```

Replace the `upsert` block in the code above with this select-then-insert/update pattern.

- [ ] **Step 4: Create /api/auth/gmail/disconnect route**

Create `src/app/api/auth/gmail/disconnect/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/gmail/oauth";

const requestSchema = z.object({
  connection_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }

  const { data: connection, error: fetchError } = await supabase
    .from("email_connections")
    .select("*")
    .eq("id", parsed.data.connection_id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  try {
    await revokeToken(connection.refresh_token);
  } catch (err) {
    console.error("Failed to revoke token:", err);
  }

  const { error: deleteError } = await supabase
    .from("email_connections")
    .delete()
    .eq("id", connection.id);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to delete connection" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 5: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/gmail/oauth.ts src/app/api/auth/gmail/
git commit -m "feat(quote-miner): add Gmail OAuth routes for connect, callback, disconnect"
```

---

## Task 5: Refactor parse-quote into Shared Helper

**Files:**
- Create: `src/lib/hvac/parse-quote.ts`
- Modify: `src/app/api/parse-quote/route.ts`

- [ ] **Step 1: Create shared helper**

Create `src/lib/hvac/parse-quote.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { QUOTE_SYSTEM_PROMPT, QUOTE_ANALYSIS_PROMPT } from "./quote-prompt";
import type { ParsedQuoteResult } from "@/types/catalog";

export type ParseInput =
  | {
      type: "images";
      images: Array<{
        base64: string;
        mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        pageNum?: number;
      }>;
    }
  | {
      type: "text";
      text: string;
    };

export async function parseQuoteContent(input: ParseInput): Promise<ParsedQuoteResult> {
  const content: Anthropic.Messages.ContentBlockParam[] = [];

  if (input.type === "images") {
    for (const img of input.images) {
      if (input.images.length > 1) {
        content.push({
          type: "text",
          text: `--- Page ${img.pageNum ?? input.images.indexOf(img) + 1} of the quote ---`,
        });
      }
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType,
          data: img.base64,
        },
      });
    }
  } else {
    content.push({
      type: "text",
      text: `The following is the body text of a quote email:\n\n${input.text}`,
    });
  }

  content.push({ type: "text", text: QUOTE_ANALYSIS_PROMPT });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: QUOTE_SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  let text = response.content[0].type === "text" ? response.content[0].text.trim() : "";

  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  if (!text.startsWith("{")) {
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1) {
      text = text.substring(jsonStart, jsonEnd + 1);
    }
  }

  return JSON.parse(text) as ParsedQuoteResult;
}
```

- [ ] **Step 2: Refactor existing parse-quote route**

Read `src/app/api/parse-quote/route.ts`. Replace the Claude Vision call section with a call to `parseQuoteContent`:

```typescript
import { parseQuoteContent } from "@/lib/hvac/parse-quote";

// Inside the POST handler, replace the content array construction + anthropic.messages.create block with:
try {
  const result = await parseQuoteContent({
    type: "images",
    images: parsed.data.images,
  });
  return NextResponse.json(result);
} catch (error) {
  console.error("Quote parsing failed:", error);
  return NextResponse.json(
    { error: "Failed to parse quote" },
    { status: 500 }
  );
}
```

Keep the auth check and Zod validation before this block.

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/hvac/parse-quote.ts src/app/api/parse-quote/route.ts
git commit -m "feat(quote-miner): extract quote parsing into shared helper"
```

---

## Task 6: Gmail API Client + Search

**Files:**
- Create: `src/lib/gmail/client.ts`
- Create: `src/lib/gmail/search.ts`
- Create: `src/lib/gmail/parse.ts`

- [ ] **Step 1: Create Gmail API client**

Create `src/lib/gmail/client.ts`:

```typescript
import type { GmailMessage } from "@/types/email-connection";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export async function listMessages(
  accessToken: string,
  query: string,
  maxResults: number = 20
): Promise<Array<{ id: string; threadId: string }>> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const response = await fetch(`${GMAIL_API_BASE}/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Gmail list failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as {
    messages?: Array<{ id: string; threadId: string }>;
  };
  return data.messages ?? [];
}

export async function getMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessage> {
  const response = await fetch(
    `${GMAIL_API_BASE}/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`Gmail get failed: ${response.status}`);
  }

  return response.json();
}

export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<string> {
  const response = await fetch(
    `${GMAIL_API_BASE}/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`Gmail attachment get failed: ${response.status}`);
  }

  const data = (await response.json()) as { data: string; size: number };
  return data.data.replace(/-/g, "+").replace(/_/g, "/");
}
```

- [ ] **Step 2: Create search query builder**

Create `src/lib/gmail/search.ts`:

```typescript
export function buildGmailSearchQuery(options: {
  domains: string[];
  daysBack: number;
}): string {
  const { domains, daysBack } = options;

  if (domains.length === 0) return "";

  const fromClause = domains.map((d) => `from:${d}`).join(" OR ");
  const subjectKeywords = "(subject:quote OR subject:pricing OR subject:estimate OR subject:RFQ)";
  const contentClause = `(has:attachment OR ${subjectKeywords})`;
  const timeClause = `newer_than:${daysBack}d`;

  return `(${fromClause}) AND ${contentClause} AND ${timeClause}`;
}
```

- [ ] **Step 3: Create message parsing helper**

Create `src/lib/gmail/parse.ts`:

```typescript
import type {
  GmailMessage,
  GmailMessagePart,
  ExtractedEmailContent,
} from "@/types/email-connection";
import { getAttachment } from "./client";

function findHeader(part: GmailMessagePart, name: string): string | null {
  const header = part.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value ?? null;
}

function walkParts(
  part: GmailMessagePart,
  callback: (part: GmailMessagePart) => void
): void {
  callback(part);
  if (part.parts) {
    for (const subpart of part.parts) {
      walkParts(subpart, callback);
    }
  }
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function extractEmailContent(
  accessToken: string,
  message: GmailMessage
): Promise<ExtractedEmailContent> {
  const from = findHeader(message.payload, "from") ?? "";
  const subject = findHeader(message.payload, "subject") ?? "";
  const date = findHeader(message.payload, "date") ?? "";

  const attachments: ExtractedEmailContent["attachments"] = [];
  let textBody = "";
  let htmlBody = "";

  const attachmentParts: GmailMessagePart[] = [];
  walkParts(message.payload, (part) => {
    if (part.filename && part.body.attachmentId) {
      if (part.mimeType === "application/pdf") {
        attachmentParts.push(part);
      }
    } else if (part.mimeType === "text/plain" && part.body.data) {
      textBody += decodeBase64Url(part.body.data);
    } else if (part.mimeType === "text/html" && part.body.data) {
      htmlBody += decodeBase64Url(part.body.data);
    }
  });

  for (const part of attachmentParts) {
    if (!part.body.attachmentId) continue;
    try {
      const base64 = await getAttachment(accessToken, message.id, part.body.attachmentId);
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        base64,
      });
    } catch (err) {
      console.error(`Failed to fetch attachment ${part.filename}:`, err);
    }
  }

  const bodyText = textBody || stripHtml(htmlBody);

  return {
    messageId: message.id,
    from,
    subject,
    date,
    attachments,
    bodyText,
  };
}
```

- [ ] **Step 4: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/gmail/client.ts src/lib/gmail/search.ts src/lib/gmail/parse.ts
git commit -m "feat(quote-miner): add Gmail API client, search query builder, and message parser"
```

---

## Task 7: Sync Worker Core Logic

**Files:**
- Create: `src/lib/gmail/sync.ts`

- [ ] **Step 1: Create sync worker**

Create `src/lib/gmail/sync.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { EmailConnection } from "@/types/email-connection";
import { refreshAccessToken } from "./oauth";
import { listMessages, getMessage } from "./client";
import { buildGmailSearchQuery } from "./search";
import { extractEmailContent } from "./parse";
import { parseQuoteContent } from "@/lib/hvac/parse-quote";
import { checkAiActionLimit, incrementAiActionCount } from "@/lib/billing/ai-action-counter";

const MAX_MESSAGES_PER_SYNC = 5;

type Client = SupabaseClient<Database>;

export async function syncEmailConnection(
  supabase: Client,
  connection: EmailConnection
): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  await supabase
    .from("email_connections")
    .update({ last_sync_status: "syncing" })
    .eq("id", connection.id);

  try {
    let accessToken = connection.access_token;
    const expiresAt = new Date(connection.expires_at).getTime();
    if (expiresAt < Date.now() + 5 * 60 * 1000) {
      const refreshed = await refreshAccessToken(connection.refresh_token);
      accessToken = refreshed.access_token;
      await supabase
        .from("email_connections")
        .update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        })
        .eq("id", connection.id);
    }

    const { data: domains } = await supabase
      .from("supplier_email_domains")
      .select("domain")
      .eq("user_id", connection.user_id);

    if (!domains || domains.length === 0) {
      await supabase
        .from("email_connections")
        .update({
          last_sync_status: "idle",
          last_sync_at: new Date().toISOString(),
          last_sync_error: "No supplier domains configured",
        })
        .eq("id", connection.id);
      return { processed: 0, errors: ["No supplier domains configured"] };
    }

    const query = buildGmailSearchQuery({
      domains: domains.map((d) => d.domain),
      daysBack: connection.initial_sync_days,
    });

    const messages = await listMessages(accessToken, query, 20);

    const messageIds = messages.map((m) => m.id);
    const { data: existingQuotes } = await supabase
      .from("quotes")
      .select("source_email_id")
      .eq("user_id", connection.user_id)
      .in("source_email_id", messageIds);

    const seenIds = new Set(
      (existingQuotes ?? []).map((q) => q.source_email_id).filter(Boolean)
    );

    const newMessages = messages.filter((m) => !seenIds.has(m.id)).slice(0, MAX_MESSAGES_PER_SYNC);

    for (const messageRef of newMessages) {
      const limitCheck = await checkAiActionLimit(supabase, connection.user_id);
      if (!limitCheck.allowed) {
        errors.push(`AI action limit reached: ${limitCheck.reason}`);
        break;
      }

      try {
        const fullMessage = await getMessage(accessToken, messageRef.id);
        const extracted = await extractEmailContent(accessToken, fullMessage);

        let parsed;
        let sourceType: "email_attachment" | "email_body";

        if (extracted.attachments.length > 0) {
          parsed = await parseQuoteContent({
            type: "images",
            images: extracted.attachments.map((a) => ({
              base64: a.base64,
              mediaType: "image/jpeg" as const,
            })),
          });
          sourceType = "email_attachment";
        } else if (extracted.bodyText.length > 100) {
          parsed = await parseQuoteContent({
            type: "text",
            text: extracted.bodyText,
          });
          sourceType = "email_body";
        } else {
          continue;
        }

        const { data: quote, error: quoteError } = await supabase
          .from("quotes")
          .insert({
            user_id: connection.user_id,
            quote_number: parsed.quote_number || "",
            quote_date: parsed.quote_date || null,
            subtotal: parsed.subtotal,
            tax: parsed.tax,
            total: parsed.total,
            file_name: extracted.attachments[0]?.filename || "email-body.txt",
            status: "parsed",
            source_type: sourceType,
            source_email_id: extracted.messageId,
            source_email_subject: extracted.subject,
            source_email_from: extracted.from,
            source_email_date: extracted.date ? new Date(extracted.date).toISOString() : null,
          })
          .select("id")
          .single();

        if (quoteError || !quote) {
          errors.push(`Quote insert failed: ${quoteError?.message ?? "unknown"}`);
          continue;
        }

        const lineInserts = parsed.line_items.map((item) => ({
          quote_id: quote.id,
          model_number: item.model_number,
          description: item.description,
          equipment_type: item.equipment_type,
          brand: item.brand,
          tonnage: item.tonnage,
          seer_rating: item.seer_rating,
          btu_capacity: item.btu_capacity,
          stages: item.stages,
          refrigerant_type: item.refrigerant_type,
          quantity: item.quantity,
          unit_price: item.unit_price,
          extended_price: item.extended_price,
          selected: true,
        }));

        if (lineInserts.length > 0) {
          await supabase.from("quote_lines").insert(lineInserts);
        }

        if (limitCheck.shouldIncrement) {
          await incrementAiActionCount(supabase, connection.user_id);
        }

        processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Message ${messageRef.id}: ${msg}`);
        console.error(`Failed to process message ${messageRef.id}:`, err);
      }
    }

    await supabase
      .from("email_connections")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: errors.length > 0 ? "error" : "idle",
        last_sync_error: errors.length > 0 ? errors.join("; ").slice(0, 500) : null,
      })
      .eq("id", connection.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("email_connections")
      .update({
        last_sync_status: "error",
        last_sync_error: msg.slice(0, 500),
      })
      .eq("id", connection.id);
    errors.push(msg);
  }

  return { processed, errors };
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/gmail/sync.ts
git commit -m "feat(quote-miner): add Gmail sync worker core logic"
```

---

## Task 8: Cron API Route

**Files:**
- Create: `src/app/api/cron/sync-emails/route.ts`

- [ ] **Step 1: Create cron route**

Create `src/app/api/cron/sync-emails/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { verifyCronAuth } from "@/lib/cron-auth";
import { syncEmailConnection } from "@/lib/gmail/sync";
import type { Database } from "@/types/database";
import type { EmailConnection } from "@/types/email-connection";

function getServiceClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: connections, error } = await supabase
    .from("email_connections")
    .select("*")
    .or(`last_sync_at.is.null,last_sync_at.lt.${fifteenMinAgo}`)
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(1);

  if (error) {
    console.error("Failed to fetch connections:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  if (!connections || connections.length === 0) {
    return NextResponse.json({ message: "No connections to sync" });
  }

  const connection = connections[0] as EmailConnection;
  const result = await syncEmailConnection(supabase, connection);

  return NextResponse.json({
    connection_id: connection.id,
    processed: result.processed,
    errors: result.errors,
  });
}
```

- [ ] **Step 2: Verify compilation and build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/sync-emails/
git commit -m "feat(quote-miner): add cron API route for email sync"
```

---

## Task 9: Email Connection UI

**Files:**
- Create: `src/components/parts-database/email-connect-button.tsx`
- Create: `src/components/parts-database/email-connection-card.tsx`
- Modify: `src/app/(app)/parts-database/page.tsx`

- [ ] **Step 1: Create connect button**

Create `src/components/parts-database/email-connect-button.tsx`:

```tsx
"use client";

import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmailConnectButton() {
  return (
    <Button
      onClick={() => {
        window.location.href = "/api/auth/gmail/connect";
      }}
      className="bg-gradient-brand hover-lift"
    >
      <Mail className="mr-2 h-4 w-4" />
      Connect Gmail
    </Button>
  );
}
```

- [ ] **Step 2: Create connection card**

Create `src/components/parts-database/email-connection-card.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { EmailConnection } from "@/types/email-connection";

type Props = {
  initialConnection: EmailConnection;
  onDisconnect?: () => void;
};

function formatRelative(date: string | null): string {
  if (!date) return "never";
  const ms = Date.now() - new Date(date).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} days ago`;
}

export function EmailConnectionCard({ initialConnection, onDisconnect }: Props) {
  const [connection, setConnection] = useState(initialConnection);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`email_connections:${initialConnection.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "email_connections",
          filter: `id=eq.${initialConnection.id}`,
        },
        (payload) => {
          setConnection(payload.new as EmailConnection);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialConnection.id]);

  async function handleDisconnect() {
    if (!confirm("Disconnect this Gmail account? Existing quotes will remain.")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/auth/gmail/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: connection.id }),
      });
      onDisconnect?.();
    } finally {
      setDisconnecting(false);
    }
  }

  const statusIcon = {
    idle: <CheckCircle2 className="h-4 w-4 text-success" />,
    syncing: <Loader2 className="h-4 w-4 animate-spin text-accent-light" />,
    error: <AlertCircle className="h-4 w-4 text-error" />,
  }[connection.last_sync_status];

  const statusLabel = {
    idle: "Idle",
    syncing: "Syncing...",
    error: "Error",
  }[connection.last_sync_status];

  const statusClass = {
    idle: "bg-bg-elevated text-txt-secondary",
    syncing: "bg-accent-glow text-accent-light",
    error: "bg-error-bg text-error",
  }[connection.last_sync_status];

  return (
    <Card className="bg-gradient-card border-border">
      <CardContent className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-accent-light" />
          <div>
            <div className="font-medium text-txt-primary">{connection.email_address}</div>
            <div className="text-xs text-txt-tertiary">
              Last sync: {formatRelative(connection.last_sync_at)}
            </div>
            {connection.last_sync_error && (
              <div className="mt-1 text-xs text-error" title={connection.last_sync_error}>
                {connection.last_sync_error.slice(0, 80)}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${statusClass}`}
          >
            {statusIcon}
            {statusLabel}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={disconnecting}
          >
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Update parts-database page**

Read `src/app/(app)/parts-database/page.tsx`. Add a new "Email Connections" section near the top:

```tsx
// Near the top imports:
import { createClient } from "@/lib/supabase/server";
import { EmailConnectButton } from "@/components/parts-database/email-connect-button";
import { EmailConnectionCard } from "@/components/parts-database/email-connection-card";
import type { EmailConnection } from "@/types/email-connection";

// Convert the page to a server component that fetches connections:
// (If it's already a client component, either fetch client-side or change to server)
```

Since the existing page is "use client", add the fetch inside a useEffect. The cleanest approach is to make a new sub-component `<EmailConnectionsSection />` that fetches via Supabase browser client:

Create `src/components/parts-database/email-connections-section.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EmailConnectButton } from "./email-connect-button";
import { EmailConnectionCard } from "./email-connection-card";
import type { EmailConnection } from "@/types/email-connection";

export function EmailConnectionsSection() {
  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("email_connections")
      .select("*")
      .order("connected_at", { ascending: false })
      .then(({ data }) => {
        setConnections((data ?? []) as EmailConnection[]);
        setLoading(false);
      });
  }, []);

  function handleDisconnect(id: string) {
    setConnections((prev) => prev.filter((c) => c.id !== id));
  }

  if (loading) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-txt-primary">Email Connections</h2>
        {connections.length === 0 && <EmailConnectButton />}
      </div>
      {connections.length === 0 ? (
        <div className="rounded-lg border border-border bg-gradient-card p-6 text-center">
          <p className="text-txt-secondary">
            Connect your email to automatically discover supplier quotes.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map((c) => (
            <EmailConnectionCard
              key={c.id}
              initialConnection={c}
              onDisconnect={() => handleDisconnect(c.id)}
            />
          ))}
          {connections.length > 0 && <EmailConnectButton />}
        </div>
      )}
    </section>
  );
}
```

Then in `src/app/(app)/parts-database/page.tsx`, import and render `<EmailConnectionsSection />` at the top of the page content.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/parts-database/email-connect-button.tsx src/components/parts-database/email-connection-card.tsx src/components/parts-database/email-connections-section.tsx src/app/\(app\)/parts-database/page.tsx
git commit -m "feat(quote-miner): add email connection UI to parts database page"
```

---

## Task 10: Review Queue Page + Sidebar Badge

**Files:**
- Create: `src/app/(app)/parts-database/review/page.tsx`
- Create: `src/components/parts-database/review-queue.tsx`
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Create review queue component**

Create `src/components/parts-database/review-queue.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type QueueItem = {
  id: string;
  quote_number: string;
  quote_date: string | null;
  source_type: "manual_upload" | "email_attachment" | "email_body";
  source_email_from: string | null;
  source_email_subject: string | null;
  total: number | null;
  created_at: string;
  supplier: { name: string } | null;
  line_count?: number;
};

export function ReviewQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("quotes")
        .select(
          "id, quote_number, quote_date, source_type, source_email_from, source_email_subject, total, created_at, supplier:suppliers(name)"
        )
        .eq("status", "parsed")
        .order("created_at", { ascending: false });

      const typed = (data ?? []) as unknown as QueueItem[];

      // Fetch line counts
      for (const item of typed) {
        const { count } = await supabase
          .from("quote_lines")
          .select("*", { count: "exact", head: true })
          .eq("quote_id", item.id);
        item.line_count = count ?? 0;
      }

      setItems(typed);
      setLoading(false);
    }

    load();
  }, []);

  if (loading) {
    return <p className="text-txt-secondary">Loading review queue...</p>;
  }

  if (items.length === 0) {
    return (
      <Card className="bg-gradient-card border-border">
        <CardContent className="py-8 text-center">
          <p className="text-txt-secondary">No quotes waiting for review.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Link key={item.id} href={`/parts-database/review/${item.id}`}>
          <Card className="bg-gradient-card border-border hover:border-b-accent hover-lift transition-all">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                {item.source_type === "manual_upload" ? (
                  <Upload className="h-5 w-5 text-txt-tertiary" />
                ) : (
                  <Mail className="h-5 w-5 text-accent-light" />
                )}
                <div>
                  <div className="font-medium text-txt-primary">
                    {item.supplier?.name ?? "Unknown supplier"}
                    {item.quote_number && ` · ${item.quote_number}`}
                  </div>
                  <div className="text-sm text-txt-secondary">
                    {item.source_email_from && (
                      <span className="mr-3">{item.source_email_from}</span>
                    )}
                    {item.line_count !== undefined && (
                      <span>{item.line_count} line items</span>
                    )}
                  </div>
                  {item.source_email_subject && (
                    <div className="text-xs text-txt-tertiary mt-0.5">
                      {item.source_email_subject}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {item.total && (
                  <span className="text-txt-primary font-medium">
                    ${Number(item.total).toLocaleString()}
                  </span>
                )}
                <Badge className="bg-accent-glow text-accent-light border-none">
                  Review
                </Badge>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create review queue page**

Create `src/app/(app)/parts-database/review/page.tsx`:

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReviewQueue } from "@/components/parts-database/review-queue";

export default function ReviewQueuePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/parts-database"
          className="text-txt-secondary hover:text-txt-primary transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-txt-primary">Review Queue</h1>
      </div>
      <ReviewQueue />
    </div>
  );
}
```

- [ ] **Step 3: Update sidebar with review count badge**

Read `src/components/layout/sidebar.tsx`. Add a review count subscription:

```tsx
// Inside the Sidebar component, add state:
const [reviewCount, setReviewCount] = useState(0);

useEffect(() => {
  const supabase = createClient(); // from @/lib/supabase/client
  
  async function loadCount() {
    const { count } = await supabase
      .from("quotes")
      .select("*", { count: "exact", head: true })
      .eq("status", "parsed");
    setReviewCount(count ?? 0);
  }
  
  loadCount();
  
  const channel = supabase
    .channel("review_count")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "quotes" },
      () => loadCount()
    )
    .subscribe();
  
  return () => {
    supabase.removeChannel(channel);
  };
}, []);
```

And in the nav rendering for Parts Database, show a badge if count > 0:

```tsx
{isActive ? (...) : (...)}
<item.icon className="h-4 w-4" />
{item.label}
{item.href === "/parts-database" && reviewCount > 0 && (
  <span className="ml-auto rounded-full bg-accent-glow text-accent-light px-2 py-0.5 text-xs font-semibold">
    {reviewCount}
  </span>
)}
```

Add the `createClient` import from `@/lib/supabase/client` and the `useState`, `useEffect` imports from React.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/parts-database/review/ src/components/parts-database/review-queue.tsx src/components/layout/sidebar.tsx
git commit -m "feat(quote-miner): add review queue page and sidebar badge"
```

---

## Task 11: Starter Supplier Email Domains

**Files:**
- Create: `supabase/migrations/005_supplier_email_domains_seed.sql`

- [ ] **Step 1: Research supplier domains**

Use web search to find the actual email domains that these suppliers send quotes from. Some might be `@supplier.com`, others might be `@quotes.supplier.com`, etc. Document findings in the migration file as comments.

Suppliers to research:
- Johnstone Supply
- Sanders Supply (sanders-supply.com likely)
- Shearer Supply
- Locke Supply (locke.com)
- Amsco Supply (amscosupply.com)

If exact domains can't be confirmed, use best-guess based on their websites.

- [ ] **Step 2: Create seed migration**

Create `supabase/migrations/005_supplier_email_domains_seed.sql`:

```sql
-- 005_supplier_email_domains_seed.sql
-- Seed known email domains for starter suppliers
-- These are inserted automatically when a user's onboarding creates supplier rows.

-- Note: This migration doesn't insert domains directly, because supplier rows
-- are per-user and created on onboarding. Instead, we add a helper function
-- and update the onboarding code to call it.

create or replace function public.seed_starter_supplier_domains(
  p_user_id uuid,
  p_supplier_id uuid,
  p_supplier_name text
)
returns void as $$
declare
  known_domains text[];
begin
  known_domains := case p_supplier_name
    when 'Johnstone Supply' then array['johnstonesupply.com']
    when 'Sanders Supply' then array['sanders-supply.com', 'sanderssupply.com']
    when 'Shearer Supply' then array['shearersupply.com']
    when 'Locke Supply' then array['lockesupply.com', 'locke.com']
    when 'Amsco Supply' then array['amscosupply.com']
    else array[]::text[]
  end;

  insert into public.supplier_email_domains (user_id, supplier_id, domain, is_starter)
  select p_user_id, p_supplier_id, unnest(known_domains), true
  where array_length(known_domains, 1) > 0;
end;
$$ language plpgsql security definer;
```

- [ ] **Step 3: Update onboarding to call the seeding function**

Read `src/app/(app)/onboarding/page.tsx`. Inside the save handler where suppliers are inserted, after each supplier insert, call the RPC:

```typescript
// After inserting the supplier and getting the supplier ID:
await supabase.rpc("seed_starter_supplier_domains", {
  p_user_id: userId,
  p_supplier_id: supplierId,
  p_supplier_name: supplierName,
});
```

- [ ] **Step 4: Apply migration**

```bash
npx supabase db push
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/005_supplier_email_domains_seed.sql src/app/\(app\)/onboarding/page.tsx
git commit -m "feat(quote-miner): seed known email domains for starter suppliers"
```

---

## Task 12: Build Verification & PR

- [ ] **Step 1: Run full build**

```bash
npm run build
```

Expected: Clean build with all new routes (`/api/auth/gmail/connect`, `/api/auth/gmail/callback`, `/api/auth/gmail/disconnect`, `/api/cron/sync-emails`, `/parts-database/review`).

- [ ] **Step 2: Fix any build errors**

If errors appear, fix inline. Common issues:
- Missing imports
- Type errors in new files
- RLS policy conflicts

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(quote-miner): resolve build errors"
```

- [ ] **Step 4: Push branch**

```bash
git push -u origin feature/quote-miner
```

- [ ] **Step 5: Create PR**

```bash
gh pr create --title "Quote Miner — Gmail email crawling" --body "$(cat <<'EOF'
## Summary

Automated supplier quote discovery via Gmail email crawling. Users connect Gmail once, and a cron-triggered worker scans their inbox every 15 minutes for supplier quotes. Parsed quotes land in a review queue where users approve them before they join the catalog.

## What's in V1

- Gmail OAuth connection (read-only scope)
- External cron (cron-job.org) triggers sync every 15 minutes
- Historical sync of last 90 days on first connect
- Filters by user's supplier domains + quote keywords
- Handles PDF attachments and email body text
- Review queue with live updates via Supabase Realtime
- Sidebar badge showing pending review count
- Active token revocation on disconnect
- Trial AI action limit enforced on email-based parsing

## What's out of V1

- Outlook / Microsoft Graph (V1.1)
- Yahoo / IMAP (V1.2)
- Auto-save for trusted suppliers
- Email notifications for new quotes
- Full event-driven estimate workflow

## Post-merge setup required

1. Create Google Cloud OAuth 2.0 Client ID with Gmail readonly scope
2. Set Vercel env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, CRON_SECRET, OAUTH_STATE_SECRET
3. Set up cron-job.org to POST /api/cron/sync-emails every 15 min with Bearer CRON_SECRET
4. Research and populate supplier_email_domains for starter suppliers (V1 has best-guess domains)

## Test plan

- [ ] Connect Gmail → OAuth flow completes → connection appears in UI
- [ ] Manually trigger cron (\`curl -X POST https://coolbid.vercel.app/api/cron/sync-emails -H "Authorization: Bearer <secret>"\`)
- [ ] Verify sync processes up to 5 messages, marks quotes as \`parsed\`
- [ ] Review queue shows parsed quotes with email metadata
- [ ] Sidebar shows review count badge
- [ ] Approve a quote → items enter catalog, quote marked \`saved\`
- [ ] Disconnect Gmail → token revoked, row deleted
EOF
)"
```

---

## Post-Implementation: Manual Setup

After the PR is merged:

1. **Google Cloud Console:**
   - Create new project or use existing
   - Enable Gmail API
   - OAuth 2.0 Client ID (Web Application)
   - Authorized redirect URIs: `https://coolbid.vercel.app/api/auth/gmail/callback`
   - Configure consent screen (add yourself + partner as test users during development)

2. **Vercel env vars:**
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI=https://coolbid.vercel.app/api/auth/gmail/callback`
   - `CRON_SECRET=<generate: openssl rand -hex 32>`
   - `OAUTH_STATE_SECRET=<generate: openssl rand -hex 32>`

3. **cron-job.org setup:**
   - Create free account
   - Add new cronjob
   - URL: `https://coolbid.vercel.app/api/cron/sync-emails`
   - Method: POST
   - Headers: `Authorization: Bearer <CRON_SECRET value>`
   - Schedule: every 15 minutes
   - Enable

4. **Verify supplier email domains** — check the seeded domains against actual supplier communications and add more via the Supabase SQL editor if needed.
