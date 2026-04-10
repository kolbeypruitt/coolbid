# Stripe Billing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe-powered subscription billing with a 30-day free trial, 50-AI-action usage cap, and hard-lock access gating when trial expires or subscription is canceled.

**Architecture:** Next.js API routes handle Stripe Checkout/Portal/Webhook server-side. Supabase middleware enforces subscription gating. Profile fields track subscription state. Webhook events update state and are logged to a `billing_events` audit table for idempotency.

**Tech Stack:** Stripe Node SDK, Next.js 15 API routes, Supabase (PostgreSQL + RLS), Zod for validation

**Spec:** `docs/superpowers/specs/2026-04-09-stripe-billing-design.md`

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/003_billing.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 003_billing.sql
-- Stripe billing: trial extension, usage counter, subscription tracking, referral attribution, billing events audit

-- ============================================================
-- PROFILES: extend with billing fields
-- ============================================================
alter table public.profiles alter column trial_ends_at set default (now() + interval '30 days');
alter table public.profiles add column if not exists ai_actions_used int not null default 0;
alter table public.profiles add column if not exists stripe_subscription_id text;
alter table public.profiles add column if not exists subscription_period_end timestamptz;
alter table public.profiles add column if not exists referral_source text;
alter table public.profiles add column if not exists referral_code text;

-- ============================================================
-- BILLING EVENTS: audit log with idempotency
-- ============================================================
create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  event_type text not null,
  stripe_event_id text unique,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index idx_billing_events_user_id on public.billing_events(user_id);
create index idx_billing_events_stripe_event_id on public.billing_events(stripe_event_id);

alter table public.billing_events enable row level security;

create policy "Users can read own billing events"
  on public.billing_events for select
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: "Applying migration 003_billing.sql..." and success message.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/003_billing.sql
git commit -m "feat: add billing migration with trial fields, usage counter, and events audit"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `src/types/billing.ts`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Create billing types**

Create `src/types/billing.ts`:

```typescript
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

export type SubscriptionTier = "trial" | "pro";

export type BillingInterval = "month" | "year";

export type BillingEventType =
  | "signup"
  | "trial_started"
  | "subscribed"
  | "canceled"
  | "payment_failed"
  | "trial_expired"
  | "subscription_updated";

export type AccessState = {
  canAccess: boolean;
  reason: "trialing" | "active" | "past_due" | "trial_expired" | "canceled" | "locked_out";
  trialDaysLeft?: number;
  aiActionsRemaining?: number;
  subscriptionPeriodEnd?: string;
};

export const TRIAL_AI_ACTION_LIMIT = 50;
export const TRIAL_DAYS = 30;

export const PRO_MONTHLY_PRICE = 149;
export const PRO_ANNUAL_PRICE = 1490;
```

- [ ] **Step 2: Update database.ts**

In `src/types/database.ts`, add the new profile fields to the profiles Row/Insert/Update:

```typescript
profiles: {
  Row: {
    // ... existing fields ...
    ai_actions_used: number;
    stripe_subscription_id: string | null;
    subscription_period_end: string | null;
    referral_source: string | null;
    referral_code: string | null;
  };
  Insert: {
    // ... existing fields ...
    ai_actions_used?: number;
    stripe_subscription_id?: string | null;
    subscription_period_end?: string | null;
    referral_source?: string | null;
    referral_code?: string | null;
  };
  Update: {
    // ... existing fields (already defined as explicit object — not Partial<Insert>) ...
    ai_actions_used?: number;
    stripe_subscription_id?: string | null;
    subscription_period_end?: string | null;
    referral_source?: string | null;
    referral_code?: string | null;
  };
};
```

Also add the `billing_events` table:

```typescript
billing_events: {
  Row: {
    id: string;
    user_id: string | null;
    event_type: string;
    stripe_event_id: string | null;
    metadata: Json;
    created_at: string;
  };
  Insert: {
    id?: string;
    user_id?: string | null;
    event_type: string;
    stripe_event_id?: string | null;
    metadata?: Json;
  };
  Update: {
    event_type?: string;
    stripe_event_id?: string | null;
    metadata?: Json;
  };
  Relationships: [];
};
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/billing.ts src/types/database.ts
git commit -m "feat: add billing types and database schema types"
```

---

## Task 3: Stripe Client & Helpers

**Files:**
- Create: `src/lib/stripe.ts`

- [ ] **Step 1: Install Stripe SDK**

```bash
npm install stripe
```

- [ ] **Step 2: Create Stripe client**

Create `src/lib/stripe.ts`:

```typescript
import Stripe from "stripe";
import type { BillingInterval } from "@/types/billing";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
  typescript: true,
});

export function getPriceId(interval: BillingInterval): string {
  const priceId =
    interval === "month"
      ? process.env.STRIPE_PRICE_PRO_MONTHLY
      : process.env.STRIPE_PRICE_PRO_ANNUAL;

  if (!priceId) {
    throw new Error(`Missing Stripe price ID for interval: ${interval}`);
  }

  return priceId;
}

type CreateCheckoutParams = {
  customerId: string;
  interval: BillingInterval;
  userId: string;
  successUrl: string;
  cancelUrl: string;
};

export async function createCheckoutSession(params: CreateCheckoutParams) {
  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: params.customerId,
    line_items: [{ price: getPriceId(params.interval), quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    allow_promotion_codes: true,
    metadata: { user_id: params.userId },
    subscription_data: {
      metadata: { user_id: params.userId },
    },
  });
}

type CreatePortalParams = {
  customerId: string;
  returnUrl: string;
};

export async function createPortalSession(params: CreatePortalParams) {
  return stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
}

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  }

  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

type CreateCustomerParams = {
  email: string;
  userId: string;
  companyName?: string;
};

export async function createStripeCustomer(params: CreateCustomerParams) {
  return stripe.customers.create({
    email: params.email,
    name: params.companyName,
    metadata: { user_id: params.userId },
  });
}
```

- [ ] **Step 3: Add env var placeholders to .env.local.example**

Add to `.env.local.example`:

```
# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_ANNUAL=
```

- [ ] **Step 4: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/stripe.ts .env.local.example package.json package-lock.json
git commit -m "feat: add Stripe SDK client and helper functions"
```

---

## Task 4: Access Check Library

**Files:**
- Create: `src/lib/billing/access-check.ts`
- Create: `src/lib/billing/ai-action-counter.ts`

- [ ] **Step 1: Create access-check module**

Create `src/lib/billing/access-check.ts`:

```typescript
import type { AccessState, SubscriptionStatus } from "@/types/billing";
import { TRIAL_AI_ACTION_LIMIT } from "@/types/billing";

type ProfileForAccessCheck = {
  subscription_status: string;
  trial_ends_at: string | null;
  ai_actions_used: number;
  subscription_period_end: string | null;
};

export function getAccessState(profile: ProfileForAccessCheck): AccessState {
  const status = profile.subscription_status as SubscriptionStatus;
  const now = new Date();

  if (status === "trialing") {
    const trialEnds = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
    const trialExpired = trialEnds ? trialEnds < now : false;
    const usageExhausted = profile.ai_actions_used >= TRIAL_AI_ACTION_LIMIT;

    if (trialExpired) {
      return { canAccess: false, reason: "trial_expired" };
    }

    const trialDaysLeft = trialEnds
      ? Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;
    const aiActionsRemaining = Math.max(0, TRIAL_AI_ACTION_LIMIT - profile.ai_actions_used);

    return {
      canAccess: !usageExhausted,
      reason: usageExhausted ? "locked_out" : "trialing",
      trialDaysLeft,
      aiActionsRemaining,
    };
  }

  if (status === "active" || status === "past_due") {
    return {
      canAccess: true,
      reason: status,
      subscriptionPeriodEnd: profile.subscription_period_end ?? undefined,
    };
  }

  if (status === "canceled" || status === "expired") {
    return { canAccess: false, reason: status };
  }

  return { canAccess: false, reason: "locked_out" };
}

export function isLockedStatus(status: string): boolean {
  return status === "canceled" || status === "expired";
}
```

- [ ] **Step 2: Create AI action counter module**

Create `src/lib/billing/ai-action-counter.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { TRIAL_AI_ACTION_LIMIT } from "@/types/billing";

type Client = SupabaseClient<Database>;

export type AiActionCheckResult =
  | { allowed: true; shouldIncrement: boolean }
  | { allowed: false; reason: "trial_limit" | "locked_out" | "unknown" };

export async function checkAiActionLimit(
  supabase: Client,
  userId: string
): Promise<AiActionCheckResult> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("subscription_status, ai_actions_used, trial_ends_at")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    return { allowed: false, reason: "unknown" };
  }

  if (profile.subscription_status === "active" || profile.subscription_status === "past_due") {
    return { allowed: true, shouldIncrement: false };
  }

  if (profile.subscription_status === "trialing") {
    const trialExpired = profile.trial_ends_at
      ? new Date(profile.trial_ends_at) < new Date()
      : false;

    if (trialExpired) {
      return { allowed: false, reason: "trial_limit" };
    }

    if (profile.ai_actions_used >= TRIAL_AI_ACTION_LIMIT) {
      return { allowed: false, reason: "trial_limit" };
    }

    return { allowed: true, shouldIncrement: true };
  }

  return { allowed: false, reason: "locked_out" };
}

export async function incrementAiActionCount(
  supabase: Client,
  userId: string
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("ai_actions_used")
    .eq("id", userId)
    .single();

  if (!profile) return;

  await supabase
    .from("profiles")
    .update({ ai_actions_used: profile.ai_actions_used + 1 })
    .eq("id", userId);
}
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/billing/
git commit -m "feat: add access check and AI action counter modules"
```

---

## Task 5: Middleware Subscription Gating

**Files:**
- Modify: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Read current middleware**

Read the current `src/lib/supabase/middleware.ts` to see the existing onboarding redirect pattern.

- [ ] **Step 2: Add subscription gating**

After the existing onboarding check, add:

```typescript
// Subscription gating (runs after auth + onboarding checks)
const skipGatingPaths = [
  "/pricing",
  "/upgrade",
  "/api",
  "/auth",
  "/onboarding",
  "/_next",
  "/settings",
];
const shouldGate =
  user &&
  !skipGatingPaths.some((p) => path.startsWith(p)) &&
  path !== "/";

if (shouldGate) {
  const cachedStatus = request.cookies.get("sub_status")?.value;
  let status = cachedStatus;
  let trialExpired = false;

  if (!cachedStatus) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_status, trial_ends_at, ai_actions_used")
      .eq("id", user!.id)
      .single();

    if (profile) {
      status = profile.subscription_status;
      if (status === "trialing" && profile.trial_ends_at) {
        trialExpired = new Date(profile.trial_ends_at) < new Date();
      }
      const usageExhausted =
        status === "trialing" && profile.ai_actions_used >= 50;

      supabaseResponse.cookies.set("sub_status", status ?? "unknown", {
        path: "/",
        maxAge: 300,
      });

      if (
        status === "canceled" ||
        status === "expired" ||
        (status === "trialing" && trialExpired) ||
        usageExhausted
      ) {
        const url = request.nextUrl.clone();
        url.pathname = "/upgrade";
        return NextResponse.redirect(url);
      }
    }
  } else if (cachedStatus === "canceled" || cachedStatus === "expired") {
    const url = request.nextUrl.clone();
    url.pathname = "/upgrade";
    return NextResponse.redirect(url);
  }
}
```

Note: `/settings` is in `skipGatingPaths` so users can always manage their subscription even when locked out.

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "feat: add subscription gating to middleware with cookie caching"
```

---

## Task 6: Checkout API Route

**Files:**
- Create: `src/app/api/stripe/checkout/route.ts`

- [ ] **Step 1: Create checkout route**

Create `src/app/api/stripe/checkout/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutSession, createStripeCustomer } from "@/lib/stripe";

const requestSchema = z.object({
  interval: z.enum(["month", "year"]),
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
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("stripe_customer_id, company_email, company_name")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  let customerId = profile.stripe_customer_id;

  if (!customerId) {
    try {
      const customer = await createStripeCustomer({
        email: (profile.company_email || user.email) ?? "",
        userId: user.id,
        companyName: profile.company_name || undefined,
      });
      customerId = customer.id;

      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    } catch (error) {
      console.error("Failed to create Stripe customer:", error);
      return NextResponse.json(
        { error: "Failed to create customer" },
        { status: 500 }
      );
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const session = await createCheckoutSession({
      customerId,
      interval: parsed.data.interval,
      userId: user.id,
      successUrl: `${appUrl}/dashboard?subscribed=true`,
      cancelUrl: `${appUrl}/upgrade`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Failed to create checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/stripe/checkout/
git commit -m "feat: add Stripe checkout API route"
```

---

## Task 7: Portal API Route

**Files:**
- Create: `src/app/api/stripe/portal/route.ts`

- [ ] **Step 1: Create portal route**

Create `src/app/api/stripe/portal/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPortalSession } from "@/lib/stripe";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  if (!profile.stripe_customer_id) {
    return NextResponse.json(
      { error: "No active subscription" },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const session = await createPortalSession({
      customerId: profile.stripe_customer_id,
      returnUrl: `${appUrl}/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Failed to create portal session:", error);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/stripe/portal/
git commit -m "feat: add Stripe customer portal API route"
```

---

## Task 8: Webhook API Route

**Files:**
- Create: `src/app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Create webhook route**

Create `src/app/api/stripe/webhook/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { constructWebhookEvent, stripe } from "@/lib/stripe";
import type { Database } from "@/types/database";

function getServiceClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

type ProfileUpdate = {
  subscription_status?: string;
  subscription_tier?: string;
  stripe_subscription_id?: string | null;
  subscription_period_end?: string | null;
};

async function updateProfileByCustomerId(
  customerId: string,
  updates: ProfileUpdate
) {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error("Failed to update profile:", error);
    throw new Error("Database update failed");
  }
}

async function logBillingEvent(
  stripeEventId: string,
  eventType: string,
  userId: string | null,
  metadata: Record<string, unknown>
) {
  const supabase = getServiceClient();
  await supabase.from("billing_events").insert({
    user_id: userId,
    event_type: eventType,
    stripe_event_id: stripeEventId,
    metadata: metadata as never,
  });
}

async function getUserIdFromCustomer(customerId: string): Promise<string | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();
  return data?.id ?? null;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(body, signature);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency check
  const supabase = getServiceClient();
  const { data: existing } = await supabase
    .from("billing_events")
    .select("id")
    .eq("stripe_event_id", event.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (customerId && subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

          await updateProfileByCustomerId(customerId, {
            subscription_status: "active",
            subscription_tier: "pro",
            stripe_subscription_id: subscriptionId,
            subscription_period_end: periodEnd,
          });

          const userId = await getUserIdFromCustomer(customerId);
          await logBillingEvent(event.id, "subscribed", userId, {
            subscription_id: subscriptionId,
            customer_id: customerId,
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        await updateProfileByCustomerId(customerId, {
          subscription_status: subscription.status,
          subscription_period_end: periodEnd,
        });

        const userId = await getUserIdFromCustomer(customerId);
        await logBillingEvent(event.id, "subscription_updated", userId, {
          status: subscription.status,
          subscription_id: subscription.id,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await updateProfileByCustomerId(customerId, {
          subscription_status: "canceled",
        });

        const userId = await getUserIdFromCustomer(customerId);
        await logBillingEvent(event.id, "canceled", userId, {
          subscription_id: subscription.id,
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await updateProfileByCustomerId(customerId, {
          subscription_status: "past_due",
        });

        const userId = await getUserIdFromCustomer(customerId);
        await logBillingEvent(event.id, "payment_failed", userId, {
          invoice_id: invoice.id,
          amount_due: invoice.amount_due,
        });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await updateProfileByCustomerId(customerId, {
          subscription_status: "active",
        });

        const userId = await getUserIdFromCustomer(customerId);
        await logBillingEvent(event.id, "subscription_updated", userId, {
          invoice_id: invoice.id,
          amount_paid: invoice.amount_paid,
        });
        break;
      }

      default:
        // Unknown event type — log it so we don't retry
        await logBillingEvent(event.id, event.type, null, {});
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/stripe/webhook/
git commit -m "feat: add Stripe webhook handler with idempotency"
```

---

## Task 9: Wire AI Action Counter into Analyze Route

**Files:**
- Modify: `src/app/api/analyze/route.ts`

- [ ] **Step 1: Add counter check and increment**

In `src/app/api/analyze/route.ts`, after the auth check and before the Zod validation, add:

```typescript
import { checkAiActionLimit, incrementAiActionCount } from "@/lib/billing/ai-action-counter";
```

After `const { data: { user } } = await supabase.auth.getUser();` check, add:

```typescript
const limitCheck = await checkAiActionLimit(supabase, user.id);
if (!limitCheck.allowed) {
  return NextResponse.json(
    {
      error:
        limitCheck.reason === "trial_limit"
          ? "Trial limit reached. Subscribe to continue."
          : "Subscription required.",
      code: limitCheck.reason,
    },
    { status: 402 }
  );
}
```

After the successful Claude Vision response, before the return:

```typescript
if (limitCheck.shouldIncrement) {
  await incrementAiActionCount(supabase, user.id);
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/analyze/route.ts
git commit -m "feat: enforce AI action limit on floorplan analysis"
```

---

## Task 10: Wire AI Action Counter into Parse-Quote Route

**Files:**
- Modify: `src/app/api/parse-quote/route.ts`

- [ ] **Step 1: Add counter check and increment**

Apply the same pattern as Task 9. Add the import:

```typescript
import { checkAiActionLimit, incrementAiActionCount } from "@/lib/billing/ai-action-counter";
```

After auth check:

```typescript
const limitCheck = await checkAiActionLimit(supabase, user.id);
if (!limitCheck.allowed) {
  return NextResponse.json(
    {
      error:
        limitCheck.reason === "trial_limit"
          ? "Trial limit reached. Subscribe to continue."
          : "Subscription required.",
      code: limitCheck.reason,
    },
    { status: 402 }
  );
}
```

Before the success return:

```typescript
if (limitCheck.shouldIncrement) {
  await incrementAiActionCount(supabase, user.id);
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/parse-quote/route.ts
git commit -m "feat: enforce AI action limit on quote parsing"
```

---

## Task 11: Pricing Card Component

**Files:**
- Create: `src/components/billing/pricing-card.tsx`

- [ ] **Step 1: Create pricing card**

Create `src/components/billing/pricing-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PRO_MONTHLY_PRICE,
  PRO_ANNUAL_PRICE,
  type BillingInterval,
} from "@/types/billing";

const FEATURES = [
  "Unlimited floorplan analyses",
  "Unlimited quote uploads & AI parsing",
  "Full equipment catalog",
  "Estimate history & RFQ export",
  "Priority email support",
];

type Props = {
  onSubscribe?: (interval: BillingInterval) => void;
  isLoading?: boolean;
};

export function PricingCard({ onSubscribe, isLoading }: Props) {
  const [interval, setInterval] = useState<BillingInterval>("year");

  const price = interval === "month" ? PRO_MONTHLY_PRICE : PRO_ANNUAL_PRICE;
  const intervalLabel = interval === "month" ? "month" : "year";
  const savings = PRO_MONTHLY_PRICE * 12 - PRO_ANNUAL_PRICE;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl">Pro</CardTitle>
          {interval === "year" && (
            <Badge variant="default">Save ${savings}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex rounded-md border p-1">
          <button
            type="button"
            onClick={() => setInterval("month")}
            className={`flex-1 rounded-sm py-2 text-sm font-medium transition ${
              interval === "month"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("year")}
            className={`flex-1 rounded-sm py-2 text-sm font-medium transition ${
              interval === "year"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Annual
          </button>
        </div>

        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold">${price.toLocaleString()}</span>
            <span className="text-muted-foreground">/{intervalLabel}</span>
          </div>
          {interval === "year" && (
            <p className="mt-1 text-sm text-muted-foreground">
              ${Math.round(PRO_ANNUAL_PRICE / 12)}/month billed annually
            </p>
          )}
        </div>

        <ul className="space-y-2">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        {onSubscribe ? (
          <Button
            className="w-full"
            size="lg"
            onClick={() => onSubscribe(interval)}
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : "Subscribe"}
          </Button>
        ) : (
          <Button className="w-full" size="lg" asChild={false}>
            Start Free Trial
          </Button>
        )}

        <p className="text-center text-xs text-muted-foreground">
          30-day free trial · No credit card required
        </p>
      </CardContent>
    </Card>
  );
}
```

Note: This project uses shadcn v4 with @base-ui/react. `asChild` does NOT exist. If "Start Free Trial" needs to be a link, wrap it in a `<Link>` outside the Button, not with `asChild`.

Read `src/components/ui/button.tsx` for the actual API.

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/billing/pricing-card.tsx
git commit -m "feat: add pricing card component with monthly/annual toggle"
```

---

## Task 12: Trial Banner Component

**Files:**
- Create: `src/components/billing/trial-banner.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create trial banner**

Create `src/components/billing/trial-banner.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TRIAL_AI_ACTION_LIMIT } from "@/types/billing";

type TrialInfo = {
  daysLeft: number;
  actionsUsed: number;
  actionsLimit: number;
};

export function TrialBanner() {
  const [trial, setTrial] = useState<TrialInfo | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_status, trial_ends_at, ai_actions_used")
        .eq("id", user.id)
        .single();

      if (!profile || profile.subscription_status !== "trialing") {
        setHidden(true);
        return;
      }

      const trialEnds = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
      const daysLeft = trialEnds
        ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 0;

      setTrial({
        daysLeft,
        actionsUsed: profile.ai_actions_used,
        actionsLimit: TRIAL_AI_ACTION_LIMIT,
      });
      setHidden(false);
    });
  }, []);

  if (hidden || !trial) return null;

  const isUrgent = trial.daysLeft < 5 || trial.actionsUsed >= trial.actionsLimit * 0.8;

  return (
    <div
      className={`flex items-center justify-center gap-3 border-b px-4 py-2 text-sm ${
        isUrgent ? "bg-yellow-500/10 text-yellow-900 dark:text-yellow-100" : "bg-muted"
      }`}
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>
        <strong>Trial:</strong> {trial.daysLeft} days left · {trial.actionsUsed}/
        {trial.actionsLimit} AI actions used
      </span>
      <Link
        href="/upgrade"
        className="font-medium underline underline-offset-2 hover:no-underline"
      >
        Subscribe
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Add to app layout**

Modify `src/app/(app)/layout.tsx` — add the import:

```typescript
import { TrialBanner } from "@/components/billing/trial-banner";
```

And render it at the top of the layout, before the main content area. Read the existing layout first to find the correct placement.

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/billing/trial-banner.tsx src/app/\(app\)/layout.tsx
git commit -m "feat: add ambient trial banner to app layout"
```

---

## Task 13: Subscription Status Component

**Files:**
- Create: `src/components/billing/subscription-status.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Create subscription status component**

Create `src/components/billing/subscription-status.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TRIAL_AI_ACTION_LIMIT } from "@/types/billing";

type ProfileSubscription = {
  subscription_status: string;
  subscription_tier: string;
  trial_ends_at: string | null;
  subscription_period_end: string | null;
  ai_actions_used: number;
};

export function SubscriptionStatus() {
  const [profile, setProfile] = useState<ProfileSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select(
          "subscription_status, subscription_tier, trial_ends_at, subscription_period_end, ai_actions_used"
        )
        .eq("id", user.id)
        .single();
      setProfile(data);
      setLoading(false);
    });
  }, []);

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Failed to open portal:", err);
    } finally {
      setPortalLoading(false);
    }
  }

  if (loading) return <p>Loading subscription info...</p>;
  if (!profile) return null;

  const status = profile.subscription_status;
  const trialEnds = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  const trialDaysLeft = trialEnds
    ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Subscription</CardTitle>
          <StatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "trialing" && (
          <div className="space-y-2 text-sm">
            <p>
              <strong>Free trial active</strong> · {trialDaysLeft} days remaining
            </p>
            <p className="text-muted-foreground">
              {profile.ai_actions_used} of {TRIAL_AI_ACTION_LIMIT} AI actions used
            </p>
            <Button asChild={false}>
              <Link href="/upgrade">Upgrade to Pro</Link>
            </Button>
          </div>
        )}

        {status === "active" && (
          <div className="space-y-2 text-sm">
            <p>
              <strong>Pro subscription active</strong>
            </p>
            {profile.subscription_period_end && (
              <p className="text-muted-foreground">
                Renews {new Date(profile.subscription_period_end).toLocaleDateString()}
              </p>
            )}
            <Button onClick={openPortal} disabled={portalLoading}>
              {portalLoading ? "Loading..." : "Manage Billing"}
            </Button>
          </div>
        )}

        {status === "past_due" && (
          <div className="space-y-2 text-sm">
            <p className="text-destructive">
              <strong>Payment failed — retry in progress</strong>
            </p>
            <p className="text-muted-foreground">
              We&apos;ll automatically retry your payment over the next few days. Your access continues.
            </p>
            <Button onClick={openPortal} disabled={portalLoading}>
              {portalLoading ? "Loading..." : "Update Payment Method"}
            </Button>
          </div>
        )}

        {(status === "canceled" || status === "expired") && (
          <div className="space-y-2 text-sm">
            <p>
              <strong>Subscription {status}</strong>
            </p>
            <p className="text-muted-foreground">
              Resubscribe to regain full access.
            </p>
            <Button asChild={false}>
              <Link href="/upgrade">Resubscribe</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    trialing: "secondary",
    active: "default",
    past_due: "destructive",
    canceled: "outline",
    expired: "outline",
  };
  const labels: Record<string, string> = {
    trialing: "Trial",
    active: "Active",
    past_due: "Past Due",
    canceled: "Canceled",
    expired: "Expired",
  };
  return <Badge variant={variants[status] ?? "outline"}>{labels[status] ?? status}</Badge>;
}
```

Note: `asChild={false}` + `<Link>` child is a workaround — read the actual button.tsx to see if this project has a different pattern for link-styled buttons.

- [ ] **Step 2: Replace placeholder in settings page**

Read `src/app/(app)/settings/page.tsx`. Replace the placeholder Subscription card section with:

```tsx
import { SubscriptionStatus } from "@/components/billing/subscription-status";
```

And in the render, use `<SubscriptionStatus />` in place of the existing subscription placeholder card.

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/billing/subscription-status.tsx src/app/\(app\)/settings/page.tsx
git commit -m "feat: add subscription status component to settings page"
```

---

## Task 14: Pricing Page

**Files:**
- Create: `src/app/(marketing)/pricing/page.tsx`
- Modify: `src/app/(marketing)/layout.tsx`
- Modify: `src/app/(marketing)/page.tsx`

- [ ] **Step 1: Create pricing page**

Create `src/app/(marketing)/pricing/page.tsx`:

```tsx
import Link from "next/link";
import { PricingCard } from "@/components/billing/pricing-card";

const FAQ = [
  {
    q: "How does the free trial work?",
    a: "You get 30 days of full access to CoolBid with up to 50 AI-powered actions (floorplan analyses and quote parses combined). No credit card required to start.",
  },
  {
    q: "What happens when the trial ends?",
    a: "You'll be prompted to subscribe to continue creating estimates and analyzing floorplans. You can still log in and view your existing data.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel anytime from your account settings. You'll keep access until the end of your current billing period.",
  },
  {
    q: "What's included in Pro?",
    a: "Unlimited floorplan analyses, unlimited quote uploads and AI parsing, full equipment catalog, estimate history, and priority email support.",
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Simple, transparent pricing</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          One plan. Everything you need to estimate faster.
        </p>
      </div>

      <div className="mb-16 flex justify-center">
        <PricingCard />
      </div>

      <div className="space-y-6">
        <h2 className="text-center text-2xl font-bold">Frequently asked questions</h2>
        <div className="space-y-4">
          {FAQ.map((item) => (
            <div key={item.q} className="rounded-lg border p-4">
              <h3 className="font-semibold">{item.q}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{item.a}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-16 text-center">
        <Link
          href="/auth/signup"
          className="text-primary underline underline-offset-4 hover:no-underline"
        >
          Start your free trial →
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Pricing link to marketing layout**

Read `src/app/(marketing)/layout.tsx`. Add a "Pricing" link to the header nav.

```tsx
<Link href="/pricing" className="text-sm font-medium hover:underline">
  Pricing
</Link>
```

Place it before the "Sign in" button.

- [ ] **Step 3: Add inline pricing section to landing page**

Read `src/app/(marketing)/page.tsx`. Add a pricing section between the features and bottom CTA:

```tsx
import { PricingCard } from "@/components/billing/pricing-card";

// In the JSX:
<section className="mx-auto max-w-4xl px-4 py-16">
  <div className="mb-12 text-center">
    <h2 className="text-3xl font-bold">Simple pricing</h2>
    <p className="mt-2 text-muted-foreground">Start free. Upgrade when you&apos;re ready.</p>
  </div>
  <div className="flex justify-center">
    <PricingCard />
  </div>
</section>
```

- [ ] **Step 4: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(marketing\)/ src/components/billing/pricing-card.tsx
git commit -m "feat: add pricing page, nav link, and inline landing section"
```

---

## Task 15: Upgrade Page

**Files:**
- Create: `src/app/(app)/upgrade/page.tsx`

- [ ] **Step 1: Create upgrade page**

Create `src/app/(app)/upgrade/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { PricingCard } from "@/components/billing/pricing-card";
import type { BillingInterval } from "@/types/billing";

export default function UpgradePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe(interval: BillingInterval) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error ?? "Failed to start checkout");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Subscribe to continue</h1>
        <p className="mt-2 text-muted-foreground">
          Your trial has ended or you&apos;ve reached your usage limit. Subscribe to keep using
          CoolBid.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-center">
        <PricingCard onSubscribe={handleSubscribe} isLoading={loading} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/upgrade/
git commit -m "feat: add upgrade page with checkout flow"
```

---

## Task 16: Capture Referral Source on Signup

**Files:**
- Modify: `src/app/auth/signup/page.tsx`

- [ ] **Step 1: Read current signup page**

Read `src/app/auth/signup/page.tsx`.

- [ ] **Step 2: Add ref capture**

Add state and effect to capture `?ref=` from URL:

```typescript
import { useSearchParams } from "next/navigation";

// In the component:
const searchParams = useSearchParams();
const refParam = searchParams.get("ref");
```

In the signup handler, after the successful signup and profile update, include `referral_source`:

```typescript
if (data.user) {
  const profileUpdate: Record<string, string> = {};
  if (companyName.trim()) profileUpdate.company_name = companyName.trim();
  if (refParam) profileUpdate.referral_source = refParam;

  if (Object.keys(profileUpdate).length > 0) {
    await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", data.user.id);
  }
}
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/auth/signup/page.tsx
git commit -m "feat: capture referral source on signup"
```

---

## Task 17: Build Verification

- [ ] **Step 1: Run full build**

```bash
npm run build
```

Fix any type errors or build issues that surface.

- [ ] **Step 2: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build errors in billing implementation"
```

- [ ] **Step 3: Push branch**

```bash
git push -u origin feature/stripe-billing
```

---

## Post-Implementation: Stripe Dashboard Setup (Manual)

After code is deployed:

1. **Create Product in Stripe Dashboard:**
   - Name: "CoolBid Pro"
   - Description: "Full access to CoolBid HVAC estimating"

2. **Add Prices:**
   - $149/month recurring → copy price ID → set as `STRIPE_PRICE_PRO_MONTHLY` in Vercel env vars
   - $1,490/year recurring → copy price ID → set as `STRIPE_PRICE_PRO_ANNUAL` in Vercel env vars

3. **Configure Customer Portal:**
   - Settings → Billing → Customer portal
   - Enable: cancel subscription, update payment method, view invoices
   - Disable: switch plans

4. **Enable Smart Retries:**
   - Settings → Billing → Subscriptions → Revenue recovery
   - Enable smart retries (default 4 retries over 3 weeks)

5. **Configure Webhook Endpoint:**
   - Developers → Webhooks → Add endpoint
   - URL: `https://coolbid.app/api/stripe/webhook`
   - Events:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - Copy signing secret → set as `STRIPE_WEBHOOK_SECRET` in Vercel env vars

6. **Set API keys in Vercel:**
   - `STRIPE_SECRET_KEY` = `sk_live_...` (or `sk_test_...` for testing)
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_live_...` (or `pk_test_...`)

7. **Redeploy** to pick up the new env vars.
