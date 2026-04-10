# Stripe Billing — Design Spec

## Overview

Add subscription billing to CoolBid with a single Pro tier, 30-day free trial, and usage caps during the trial. Hard-lock access on trial expiry or non-payment. Capture referral source data for a future affiliate program.

**Goal:** Enable monetization with minimal friction — let users try the full product without a card, convert them when they see value, and handle the operational ugliness (failed payments, billing management) via Stripe's hosted components.

## Pricing

| Plan | Price | Billing |
|------|-------|---------|
| Pro (Monthly) | $149/month | Recurring monthly |
| Pro (Annual) | $1,490/year | Recurring yearly (save $298 — ~2 months free) |

**Free trial:** 30 days from signup, no credit card required.

**Trial limits:**
- 50 AI actions total (floorplan analyses + quote parses combined)
- Unlimited estimate creation, editing, catalog browsing
- All other features fully available

**Trial end behavior:** Hard lock — app becomes read-only. User can log in and view existing data but cannot create estimates, upload quotes, or trigger AI actions until they subscribe.

**Failed payment handling:** Use Stripe's smart retries (4 retries over 3 weeks). App remains functional during the retry window (`past_due` status allowed through). If all retries fail, subscription is canceled and user is locked out.

## Data Model

### Migration: `supabase/migrations/003_billing.sql`

**profiles table additions:**

```sql
alter table public.profiles alter column trial_ends_at set default (now() + interval '30 days');
alter table public.profiles add column if not exists ai_actions_used int not null default 0;
alter table public.profiles add column if not exists stripe_subscription_id text;
alter table public.profiles add column if not exists subscription_period_end timestamptz;
alter table public.profiles add column if not exists referral_source text;
alter table public.profiles add column if not exists referral_code text;
```

**Existing profile fields used:**
- `stripe_customer_id` (already exists from V1)
- `subscription_tier` (already exists, default 'trial', values: 'trial' | 'pro')
- `subscription_status` (already exists, values: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired')
- `trial_ends_at` (already exists, default changed to 30 days)

**New table: billing_events**

```sql
create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  event_type text not null,
  stripe_event_id text unique,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index idx_billing_events_user_id on public.billing_events(user_id);
create index idx_billing_events_stripe_event_id on public.billing_events(stripe_event_id);

alter table public.billing_events enable row level security;
create policy "Users can read own billing events" on public.billing_events for select using (auth.uid() = user_id);
```

The `stripe_event_id` unique constraint provides idempotency — duplicate webhook deliveries will violate the unique and can be safely ignored.

Event types: `signup`, `trial_started`, `subscribed`, `canceled`, `payment_failed`, `trial_expired`, `subscription_updated`.

## Subscription States

```
signup → trialing (30 days, 50 AI actions)
  ├─ subscribes → active
  ├─ trial_expired (time) → expired (hard lock)
  └─ trial_expired (usage) → expired (hard lock)

active
  ├─ payment_failed → past_due (app functional, Stripe retries)
  │   ├─ retry succeeds → active
  │   └─ all retries fail → canceled (hard lock)
  └─ user cancels → canceled (hard lock at period end)
```

**Allowed states (app functional):** `trialing` (if not expired), `active`, `past_due`
**Locked states (read-only + upgrade CTA):** `expired`, `canceled`

## API Routes

### `POST /api/stripe/checkout`

Creates a Stripe Checkout session for Pro subscription.

**Request body:** `{ interval: "month" | "year" }` (Zod validated)

**Logic:**
1. Auth check via Supabase server client
2. Read profile for existing `stripe_customer_id`
3. If no customer, create one with email + metadata `{ user_id }`
4. Store `stripe_customer_id` on profile if newly created
5. Create Checkout session:
   - Mode: `subscription`
   - Price: `STRIPE_PRICE_PRO_MONTHLY` or `STRIPE_PRICE_PRO_ANNUAL` based on interval
   - Customer: the `stripe_customer_id`
   - Success URL: `${NEXT_PUBLIC_APP_URL}/dashboard?subscribed=true`
   - Cancel URL: `${NEXT_PUBLIC_APP_URL}/upgrade`
   - Allow promotion codes: true
6. Return `{ url: session.url }`

### `POST /api/stripe/portal`

Creates a Stripe Customer Portal session.

**Logic:**
1. Auth check
2. Read profile for `stripe_customer_id`
3. If missing, return 400 with "No active subscription"
4. Create portal session with `return_url: ${NEXT_PUBLIC_APP_URL}/settings`
5. Return `{ url: session.url }`

### `POST /api/stripe/webhook`

Handles Stripe webhook events. No auth check — verified via Stripe signature.

**Logic:**
1. Read raw body + `stripe-signature` header
2. Verify signature using `STRIPE_WEBHOOK_SECRET`
3. Check `billing_events` table for existing `stripe_event_id` — if exists, return 200 (idempotency)
4. Handle event by type:
   - `checkout.session.completed`: Fetch subscription, update profile with `stripe_subscription_id`, `subscription_status='active'`, `subscription_tier='pro'`, `subscription_period_end`
   - `customer.subscription.updated`: Sync `subscription_status` and `subscription_period_end` from event data
   - `customer.subscription.deleted`: Set `subscription_status='canceled'`
   - `invoice.payment_failed`: Set `subscription_status='past_due'`
   - `invoice.payment_succeeded`: Set `subscription_status='active'` (recovers from past_due)
5. Insert row into `billing_events` with event type + stripe_event_id + metadata
6. Return 200

**Error handling:** If signature verification fails, return 400. If unknown event type, log and return 200 (Stripe will stop retrying). If DB update fails, return 500 (Stripe will retry).

## Middleware: Access Gating

### Current middleware flow (V2)
1. Refresh Supabase session
2. Redirect unauthenticated users from protected paths
3. Redirect authenticated users from `/auth/*` to `/dashboard`
4. Redirect to `/onboarding` if not completed

### New flow additions

After the onboarding check, add subscription gating:

```typescript
// Only gate the app routes, not marketing/pricing/upgrade/API
const skipGatingPaths = ["/pricing", "/upgrade", "/api", "/auth", "/onboarding", "/_next"];
const shouldGate = !skipGatingPaths.some((p) => path.startsWith(p));

if (user && shouldGate) {
  // Check cached status cookie first
  const cachedStatus = request.cookies.get("sub_status")?.value;
  let status = cachedStatus;
  let trialExpired = false;

  if (!cachedStatus) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_status, trial_ends_at, ai_actions_used")
      .eq("id", user.id)
      .single();

    if (profile) {
      status = profile.subscription_status;
      if (status === "trialing" && profile.trial_ends_at) {
        trialExpired = new Date(profile.trial_ends_at) < new Date();
      }
    }

    // Cache for 5 minutes
    supabaseResponse.cookies.set("sub_status", status ?? "unknown", {
      path: "/",
      maxAge: 300,
    });
  }

  const lockedStates = ["canceled", "expired"];
  if (status && (lockedStates.includes(status) || (status === "trialing" && trialExpired))) {
    const url = request.nextUrl.clone();
    url.pathname = "/upgrade";
    return NextResponse.redirect(url);
  }
}
```

**Cookie invalidation:** Webhook handler doesn't directly invalidate the cookie (can't — the cookie is per-request). Instead, after any subscription state change that affects access, the next middleware pass will re-read the cookie within 5 minutes. For faster updates, the checkout success page (`?subscribed=true`) can clear the cookie via a client-side `document.cookie = "sub_status=; max-age=0"` on mount.

## AI Action Counter

### Modified routes

**`/api/analyze` and `/api/parse-quote`:**

Before the existing logic, add:

```typescript
// Check trial limit
const { data: profile } = await supabase
  .from("profiles")
  .select("subscription_status, ai_actions_used")
  .eq("id", user.id)
  .single();

if (profile?.subscription_status === "trialing" && profile.ai_actions_used >= 50) {
  return NextResponse.json(
    { error: "Trial limit reached. Subscribe to continue.", code: "trial_limit" },
    { status: 402 }
  );
}

// ... existing logic ...

// On success, increment counter (trialing users only)
if (profile?.subscription_status === "trialing") {
  await supabase
    .from("profiles")
    .update({ ai_actions_used: profile.ai_actions_used + 1 })
    .eq("id", user.id);
}
```

**Active subscribers skip the counter entirely** — no limit enforcement.

## UI Components

### New: `src/components/billing/pricing-card.tsx`

Props: `{ onSubscribe?: (interval: "month" | "year") => void }`

- Monthly/annual toggle (controlled internally)
- Monthly: $149/month, Annual: $1,490/year with "Save $298" badge
- Feature list:
  - Unlimited floorplan analyses
  - Unlimited quote uploads
  - Full equipment catalog
  - Estimate history
  - Priority support
- Primary "Start Free Trial" button if no `onSubscribe` prop (links to signup)
- "Subscribe" button if `onSubscribe` prop provided (calls handler with selected interval)

### New: `src/components/billing/trial-banner.tsx`

- Reads user profile via Supabase browser client
- Only renders if `subscription_status === "trialing"`
- Shows: "Trial: X days left · Y/50 AI actions used"
- Color shifts to warning yellow when < 5 days or > 40 actions used
- "Subscribe" link to `/upgrade`
- Sticky below header, hides on scroll (optional)
- Returns `null` for non-trialing users

### New: `src/components/billing/subscription-status.tsx`

For the settings page.

**States rendered:**
- `trialing` + not expired: "Free trial active · X days remaining · Y/50 AI actions used" + "Upgrade to Pro" button
- `active`: "Pro subscription active · renews [date]" + "Manage Billing" button (calls `/api/stripe/portal`)
- `past_due`: "Payment failed — retry in progress" + "Update Payment Method" button
- `canceled`: "Subscription canceled · Access ends [date]" + "Resubscribe" button
- `expired`: "Trial expired" + "Subscribe" button

### New page: `src/app/(marketing)/pricing/page.tsx`

- Hero: "Simple, transparent pricing"
- PricingCard component
- FAQ section (4-6 common questions)
- Footer CTA

### New page: `src/app/(app)/upgrade/page.tsx`

Shown when middleware redirects due to expired trial or canceled subscription.

- Full-page layout with explanation of current state
- Embedded PricingCard with `onSubscribe` prop that calls `/api/stripe/checkout` and redirects to the returned URL
- Small "Sign out" link at bottom
- "Back to settings" link (only gated routes are redirected here; settings stays accessible so they can still see invoices)

### Modified pages

**`src/app/(marketing)/page.tsx`** — Add a pricing section using PricingCard component between features and bottom CTA.

**`src/app/(marketing)/layout.tsx`** — Add "Pricing" link to the header nav.

**`src/app/(app)/layout.tsx`** — Render TrialBanner component above the main content area.

**`src/app/(app)/settings/page.tsx`** — Replace the placeholder subscription card with `<SubscriptionStatus />` component.

**`src/app/auth/signup/page.tsx`** — On mount, read `ref` query param from URL and store in state. On successful signup, include `referral_source` in the profile update. Also store a cookie to persist across OAuth flows.

## Stripe Configuration (Manual Dashboard Setup)

After deploying:

1. **Create Product:** Name: "CoolBid Pro"
2. **Add Prices:**
   - $149/month recurring — save the price ID as `STRIPE_PRICE_PRO_MONTHLY`
   - $1,490/year recurring — save as `STRIPE_PRICE_PRO_ANNUAL`
3. **Configure Customer Portal:**
   - Allow subscription cancellation
   - Allow payment method updates
   - Allow invoice history viewing
   - Do NOT allow switching plans (single tier for now)
4. **Enable Smart Retries:** Billing → Subscriptions → Recovery — enable smart retries, 4 attempts over 3 weeks
5. **Configure Webhook Endpoint:** Developers → Webhooks → Add endpoint:
   - URL: `https://coolbid.app/api/stripe/webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - Save the signing secret as `STRIPE_WEBHOOK_SECRET`

## Environment Variables

Add to `.env.local.example` and Vercel:

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
```

## File Structure Summary

**New:**
- `supabase/migrations/003_billing.sql`
- `src/lib/stripe.ts` — Stripe client + helpers (createCheckoutSession, createPortalSession, constructWebhookEvent)
- `src/lib/billing/access-check.ts` — isTrialExpired, canAccessApp, shouldShowTrialBanner
- `src/lib/billing/ai-action-counter.ts` — checkAndIncrementAiAction (shared between analyze + parse-quote routes)
- `src/app/api/stripe/checkout/route.ts`
- `src/app/api/stripe/portal/route.ts`
- `src/app/api/stripe/webhook/route.ts`
- `src/app/(marketing)/pricing/page.tsx`
- `src/app/(app)/upgrade/page.tsx`
- `src/components/billing/pricing-card.tsx`
- `src/components/billing/trial-banner.tsx`
- `src/components/billing/subscription-status.tsx`
- `src/types/billing.ts`

**Modified:**
- `src/lib/supabase/middleware.ts` — subscription gating + cookie caching
- `src/app/api/analyze/route.ts` — AI action counter check + increment
- `src/app/api/parse-quote/route.ts` — same
- `src/app/(marketing)/page.tsx` — inline pricing section
- `src/app/(marketing)/layout.tsx` — Pricing nav link
- `src/app/(app)/layout.tsx` — TrialBanner
- `src/app/(app)/settings/page.tsx` — SubscriptionStatus component
- `src/app/auth/signup/page.tsx` — capture ref param
- `src/types/database.ts` — new profile fields + billing_events table

## Error Handling

**Stripe API failures:** Catch in checkout/portal routes, return 500 with user-friendly message. Log the underlying error for debugging.

**Webhook signature verification failure:** Return 400. Log the event for investigation. Never process unverified webhook events.

**Webhook handler errors:** Return 500. Stripe will retry. The `billing_events` idempotency check prevents double-processing on retries.

**Concurrent AI action counter races:** Use Supabase's atomic increment: `UPDATE profiles SET ai_actions_used = ai_actions_used + 1` — Postgres handles concurrency correctly.

**Missing env vars at build time:** The Stripe client module should fail loudly (throw at import time) if `STRIPE_SECRET_KEY` is missing. Better to crash the build than silently misconfigure.

## Security

- Stripe webhook signature verification mandatory
- Stripe secret key server-side only (never exposed to client)
- Customer portal and checkout sessions created server-side
- No customer ID/subscription ID exposed to the client — frontend only knows `subscription_status`
- AI action counter enforced server-side, not client-side
- Middleware cookie (`sub_status`) is not signed — it's a cache hint, not an auth token. Real enforcement happens via DB lookups on cache miss or expiry.

## Future: Affiliate Program

This spec captures referral attribution only (`referral_source` field). A full affiliate program (commission tracking, dashboards, payouts) is out of scope. When ready:

1. Integrate Rewardful or Tolt (both support Stripe out of the box)
2. Backfill existing `referral_source` data to their dashboard
3. Add commission tracking on webhook events
4. Build or use their hosted affiliate dashboard

The data model doesn't need changes — `referral_source` and `referral_code` are already captured.
