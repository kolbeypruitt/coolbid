# Pricing Tiers, Team Seats & Retention Emails — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single Pro tier with Starter/Pro/Enterprise, add team invites for Pro+, gate Gmail sync behind Pro+, and send retention emails via Resend at critical lifecycle moments.

**Architecture:** Extend the existing Stripe billing integration with three products (one per tier). Feature gating is enforced at the API layer and surfaced in the UI via a `canUseFeature()` helper. Teams are modeled as a separate table with RLS. Retention emails are React components sent via Resend, triggered by cron (time-based) and inline (event-based).

**Tech Stack:** Next.js 16, Supabase (PostgreSQL + RLS), Stripe, Resend, React Email

**Spec:** `docs/superpowers/specs/2026-04-10-pricing-tiers-design.md`

---

## Phase 1: Types, Constants & Stripe Config

### Task 1: Update billing types and constants

**Files:**
- Modify: `src/types/billing.ts`

- [ ] **Step 1: Update SubscriptionTier type and add new constants**

```typescript
// src/types/billing.ts — full replacement
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

export type SubscriptionTier = "trial" | "starter" | "pro" | "enterprise";

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
  tier: SubscriptionTier;
  trialDaysLeft?: number;
  aiActionsRemaining?: number;
  subscriptionPeriodEnd?: string;
};

export type GatedFeature = "gmail_sync" | "team_invites";

export const TRIAL_AI_ACTION_LIMIT = 50;
export const TRIAL_DAYS = 30;

export const STARTER_MONTHLY_PRICE = 79;
export const STARTER_ANNUAL_PRICE = 790;
export const PRO_MONTHLY_PRICE = 149;
export const PRO_ANNUAL_PRICE = 1490;
export const ENTERPRISE_MONTHLY_PRICE = 250;
export const ENTERPRISE_ANNUAL_PRICE = 2500;

export const PRO_TEAM_SEAT_LIMIT = 5;

export function canUseFeature(tier: SubscriptionTier, feature: GatedFeature): boolean {
  if (feature === "gmail_sync") return tier === "pro" || tier === "enterprise" || tier === "trial";
  if (feature === "team_invites") return tier === "pro" || tier === "enterprise";
  return false;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: Type errors in files that use the old `AccessState` (missing `tier` field). That's expected — we'll fix those next.

- [ ] **Step 3: Commit**

```bash
git add src/types/billing.ts
git commit -m "feat(billing): add multi-tier types and canUseFeature helper"
```

---

### Task 2: Update access check with tier awareness

**Files:**
- Modify: `src/lib/billing/access-check.ts`

- [ ] **Step 1: Update ProfileForAccessCheck and getAccessState**

```typescript
// src/lib/billing/access-check.ts — full replacement
import type { AccessState, SubscriptionStatus, SubscriptionTier } from "@/types/billing";
import { TRIAL_AI_ACTION_LIMIT } from "@/types/billing";

type ProfileForAccessCheck = {
  subscription_status: string;
  subscription_tier: string;
  trial_ends_at: string | null;
  ai_actions_used: number;
  subscription_period_end: string | null;
};

export function getAccessState(profile: ProfileForAccessCheck): AccessState {
  const status = profile.subscription_status as SubscriptionStatus;
  const tier = (profile.subscription_tier ?? "trial") as SubscriptionTier;
  const now = new Date();

  if (status === "trialing") {
    const trialEnds = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
    const trialExpired = trialEnds ? trialEnds < now : false;
    const usageExhausted = profile.ai_actions_used >= TRIAL_AI_ACTION_LIMIT;

    if (trialExpired) {
      return { canAccess: false, reason: "trial_expired", tier };
    }

    const trialDaysLeft = trialEnds
      ? Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;
    const aiActionsRemaining = Math.max(0, TRIAL_AI_ACTION_LIMIT - profile.ai_actions_used);

    return {
      canAccess: !usageExhausted,
      reason: usageExhausted ? "locked_out" : "trialing",
      tier,
      trialDaysLeft,
      aiActionsRemaining,
    };
  }

  if (status === "active" || status === "past_due") {
    return {
      canAccess: true,
      reason: status,
      tier,
      subscriptionPeriodEnd: profile.subscription_period_end ?? undefined,
    };
  }

  if (status === "canceled") {
    return { canAccess: false, reason: "canceled", tier };
  }

  if (status === "expired") {
    return { canAccess: false, reason: "trial_expired", tier };
  }

  return { canAccess: false, reason: "locked_out", tier };
}

export function isLockedStatus(status: string): boolean {
  return status === "canceled" || status === "expired";
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: Should pass (or only errors in downstream consumers not yet updated).

- [ ] **Step 3: Commit**

```bash
git add src/lib/billing/access-check.ts
git commit -m "feat(billing): make access check tier-aware"
```

---

### Task 3: Update Stripe helper to support multiple tiers

**Files:**
- Modify: `src/lib/stripe.ts`

- [ ] **Step 1: Replace getPriceId with tier+interval resolution**

Replace the `getPriceId` function and `CreateCheckoutParams` type:

```typescript
// Replace getPriceId (lines 21-28) with:
export function getPriceId(tier: "starter" | "pro" | "enterprise", interval: BillingInterval): string {
  const envMap: Record<string, string | undefined> = {
    "starter-month": process.env.STRIPE_PRICE_STARTER_MONTHLY?.trim(),
    "starter-year": process.env.STRIPE_PRICE_STARTER_ANNUAL?.trim(),
    "pro-month": process.env.STRIPE_PRICE_PRO_MONTHLY?.trim(),
    "pro-year": process.env.STRIPE_PRICE_PRO_ANNUAL?.trim(),
    "enterprise-month": process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY?.trim(),
    "enterprise-year": process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL?.trim(),
  };
  const key = `${tier}-${interval}`;
  const priceId = envMap[key];
  if (!priceId) throw new Error(`Missing Stripe price ID for ${key}`);
  return priceId;
}
```

- [ ] **Step 2: Update CreateCheckoutParams and createCheckoutSession**

Replace the `CreateCheckoutParams` type and `createCheckoutSession` function (lines 30-49):

```typescript
type CreateCheckoutParams = {
  customerId: string;
  tier: "starter" | "pro" | "enterprise";
  interval: BillingInterval;
  userId: string;
  successUrl: string;
  cancelUrl: string;
};

export async function createCheckoutSession(params: CreateCheckoutParams) {
  return getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: params.customerId,
    line_items: [{ price: getPriceId(params.tier, params.interval), quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    allow_promotion_codes: true,
    metadata: { user_id: params.userId, tier: params.tier },
    subscription_data: { metadata: { user_id: params.userId, tier: params.tier } },
  });
}
```

- [ ] **Step 3: Add import for SubscriptionTier if needed**

The import at line 2 already imports `BillingInterval`. No change needed — the `tier` parameter uses a string literal union inline.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stripe.ts
git commit -m "feat(stripe): support multi-tier price ID resolution"
```

---

### Task 4: Update checkout API route for tier parameter

**Files:**
- Modify: `src/app/api/stripe/checkout/route.ts`

- [ ] **Step 1: Update request schema to accept tier**

Replace the `requestSchema` (line 6-8):

```typescript
const requestSchema = z.object({
  tier: z.enum(["starter", "pro", "enterprise"]),
  interval: z.enum(["month", "year"]),
});
```

- [ ] **Step 2: Pass tier to createCheckoutSession**

Replace the `createCheckoutSession` call (lines 72-78):

```typescript
    const session = await createCheckoutSession({
      customerId,
      tier: parsed.data.tier,
      interval: parsed.data.interval,
      userId: user.id,
      successUrl: `${appUrl}/dashboard?subscribed=true`,
      cancelUrl: `${appUrl}/upgrade`,
    });
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "checkout"`
Expected: No errors in this file.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/stripe/checkout/route.ts
git commit -m "feat(checkout): accept tier parameter in checkout flow"
```

---

### Task 5: Update webhook to sync tier from Stripe metadata

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Extract tier from checkout session metadata**

Replace the `checkout.session.completed` case (lines 92-118):

```typescript
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (customerId && subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const periodEndTs = subscription.items.data[0]?.current_period_end;
          const periodEnd = periodEndTs
            ? new Date(periodEndTs * 1000).toISOString()
            : null;

          // Read tier from session metadata (set during checkout creation)
          const tier = (session.metadata?.tier as string) ?? "pro";

          await updateProfileByCustomerId(customerId, {
            subscription_status: "active",
            subscription_tier: tier,
            stripe_subscription_id: subscriptionId,
            subscription_period_end: periodEnd,
          });

          const userId = await getUserIdFromCustomer(customerId);
          await logBillingEvent(event.id, "subscribed", userId, {
            subscription_id: subscriptionId,
            customer_id: customerId,
            tier,
          });
        }
        break;
      }
```

- [ ] **Step 2: Sync tier on subscription updates (plan changes)**

In the `customer.subscription.updated` case (lines 121-139), add tier sync from subscription metadata:

```typescript
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const periodEndTs = subscription.items.data[0]?.current_period_end;
        const periodEnd = periodEndTs
          ? new Date(periodEndTs * 1000).toISOString()
          : null;

        // Tier may change on plan switch
        const tier = (subscription.metadata?.tier as string) ?? undefined;

        await updateProfileByCustomerId(customerId, {
          subscription_status: subscription.status,
          subscription_period_end: periodEnd,
          ...(tier ? { subscription_tier: tier } : {}),
        });

        const userId = await getUserIdFromCustomer(customerId);
        await logBillingEvent(event.id, "subscription_updated", userId, {
          status: subscription.status,
          subscription_id: subscription.id,
          tier,
        });
        break;
      }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/stripe/webhook/route.ts
git commit -m "feat(webhook): sync subscription tier from Stripe metadata"
```

---

## Phase 2: Feature Gating

### Task 6: Gate Gmail connect behind Pro+

**Files:**
- Modify: `src/app/api/auth/gmail/connect/route.ts`

- [ ] **Step 1: Add tier check before OAuth redirect**

Replace the full file:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl } from "@/lib/gmail/oauth";
import { signOAuthState } from "@/lib/oauth-state";
import { canUseFeature } from "@/types/billing";
import type { SubscriptionTier } from "@/types/billing";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check tier — only Pro, Enterprise, and Trial can connect Gmail
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();

  const tier = (profile?.subscription_tier ?? "trial") as SubscriptionTier;
  if (!canUseFeature(tier, "gmail_sync")) {
    return NextResponse.json(
      { error: "Gmail sync requires a Pro or Enterprise plan." },
      { status: 403 }
    );
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

- [ ] **Step 2: Commit**

```bash
git add src/app/api/auth/gmail/connect/route.ts
git commit -m "feat(gmail): gate connect endpoint behind Pro+ tier"
```

---

### Task 7: Skip Starter users in email sync cron

**Files:**
- Modify: `src/app/api/cron/sync-emails/route.ts`

- [ ] **Step 1: Add tier filter to the connections query**

The cron queries `email_connections` for connections due for sync. We need to join through to `profiles` to check tier. Add an inner join filter after the existing `.or(...)` clause (around line 28):

After the `.limit(1)` line, the query result `connections` will contain rows. Before calling `syncEmailConnection`, add a tier check. The simplest approach: modify the query to join profiles.

Replace lines 23-30 (the query) with:

```typescript
  // Only sync connections for Pro/Enterprise users (not Starter)
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: connections, error } = await supabase
    .from("email_connections")
    .select("*, profiles!inner(subscription_tier)")
    .or(`last_sync_at.is.null,last_sync_at.lt.${fifteenMinAgo}`)
    .in("profiles.subscription_tier", ["pro", "enterprise", "trial"])
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(1);
```

Note: If the Supabase query syntax for inner join filtering doesn't support `.in()` on a joined table this way, an alternative is to filter after fetch:

```typescript
  // Fallback approach — filter after fetch
  const filtered = (connections ?? []).filter((c: any) => {
    const tier = c.profiles?.subscription_tier;
    return tier === "pro" || tier === "enterprise" || tier === "trial";
  });
```

Use whichever approach works with the current Supabase client version. Test locally.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/sync-emails/route.ts
git commit -m "feat(cron): skip Starter users in email sync"
```

---

### Task 8: Show Gmail gate in UI for Starter users

**Files:**
- Modify: `src/components/parts-database/email-connections-section.tsx`

- [ ] **Step 1: Add tier awareness to EmailConnectionsSection**

Replace the full file:

```typescript
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { canUseFeature } from "@/types/billing";
import type { SubscriptionTier } from "@/types/billing";
import { EmailConnectButton } from "./email-connect-button";
import { EmailConnectionCard } from "./email-connection-card";
import type { EmailConnection } from "@/types/email-connection";

export function EmailConnectionsSection() {
  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [tier, setTier] = useState<SubscriptionTier>("trial");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase
        .from("email_connections")
        .select("*")
        .order("connected_at", { ascending: false }),
      supabase.auth.getUser().then(({ data: { user } }) =>
        user
          ? supabase
              .from("profiles")
              .select("subscription_tier")
              .eq("id", user.id)
              .single()
          : { data: null }
      ),
    ]).then(([connectionsResult, profileResult]) => {
      setConnections((connectionsResult.data ?? []) as EmailConnection[]);
      setTier((profileResult.data?.subscription_tier ?? "trial") as SubscriptionTier);
      setLoading(false);
    });
  }, []);

  function handleDisconnect(id: string) {
    setConnections((prev) => prev.filter((c) => c.id !== id));
  }

  if (loading) return null;

  const canSync = canUseFeature(tier, "gmail_sync");

  // Starter users see upgrade prompt instead of connect button
  if (!canSync) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-txt-primary">Email Connections</h2>
        <div className="rounded-lg border border-border bg-gradient-card p-6 text-center space-y-3">
          <Lock className="mx-auto h-8 w-8 text-txt-tertiary" />
          <p className="text-txt-secondary">
            Connect Gmail to automatically discover supplier quotes — available on Pro and Enterprise.
          </p>
          <Link
            href="/upgrade"
            className={cn(buttonVariants({ size: "sm" }), "bg-gradient-brand hover-lift")}
          >
            Upgrade to Pro
          </Link>
        </div>
      </section>
    );
  }

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
          <div className="pt-1">
            <EmailConnectButton />
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep "email-connections"`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/parts-database/email-connections-section.tsx
git commit -m "feat(parts-db): show upgrade prompt for Starter users on Gmail section"
```

---

## Phase 3: Pricing UI

### Task 9: Rebuild pricing card for three tiers

**Files:**
- Modify: `src/components/billing/pricing-card.tsx`

- [ ] **Step 1: Replace with multi-tier pricing component**

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  type BillingInterval,
  type SubscriptionTier,
  STARTER_MONTHLY_PRICE,
  STARTER_ANNUAL_PRICE,
  PRO_MONTHLY_PRICE,
  PRO_ANNUAL_PRICE,
  ENTERPRISE_MONTHLY_PRICE,
  ENTERPRISE_ANNUAL_PRICE,
} from "@/types/billing";

type TierDef = {
  tier: "starter" | "pro" | "enterprise";
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  features: { label: string; included: boolean }[];
  highlight?: boolean;
  badge?: string;
};

const TIERS: TierDef[] = [
  {
    tier: "starter",
    name: "Starter",
    description: "For solo contractors getting started.",
    monthlyPrice: STARTER_MONTHLY_PRICE,
    annualPrice: STARTER_ANNUAL_PRICE,
    features: [
      { label: "1 user", included: true },
      { label: "Unlimited estimates & AI analysis", included: true },
      { label: "Equipment catalog", included: true },
      { label: "Manual quote upload + AI parsing", included: true },
      { label: "Gmail sync & auto-mining", included: false },
      { label: "Team invites", included: false },
      { label: "Priority support", included: false },
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    description: "For growing teams that need automation.",
    monthlyPrice: PRO_MONTHLY_PRICE,
    annualPrice: PRO_ANNUAL_PRICE,
    highlight: true,
    badge: "Most Popular",
    features: [
      { label: "Up to 5 team members", included: true },
      { label: "Unlimited estimates & AI analysis", included: true },
      { label: "Equipment catalog", included: true },
      { label: "Manual quote upload + AI parsing", included: true },
      { label: "Gmail sync & auto-mining", included: true },
      { label: "Team invites (up to 5)", included: true },
      { label: "Priority support", included: true },
    ],
  },
  {
    tier: "enterprise",
    name: "Enterprise",
    description: "For large operations with unlimited seats.",
    monthlyPrice: ENTERPRISE_MONTHLY_PRICE,
    annualPrice: ENTERPRISE_ANNUAL_PRICE,
    features: [
      { label: "Unlimited team members", included: true },
      { label: "Unlimited estimates & AI analysis", included: true },
      { label: "Equipment catalog", included: true },
      { label: "Manual quote upload + AI parsing", included: true },
      { label: "Gmail sync & auto-mining", included: true },
      { label: "Team invites (unlimited)", included: true },
      { label: "Dedicated support", included: true },
    ],
  },
];

interface PricingCardsProps {
  onSubscribe?: (tier: "starter" | "pro" | "enterprise", interval: BillingInterval) => void;
  isLoading?: boolean;
  loadingTier?: string;
}

export function PricingCards({ onSubscribe, isLoading, loadingTier }: PricingCardsProps) {
  const [interval, setInterval] = useState<BillingInterval>("month");

  const isAnnual = interval === "year";

  return (
    <div className="space-y-6">
      {/* Interval toggle */}
      <div className="flex justify-center">
        <div className="flex rounded-md bg-bg-input p-1">
          <button
            type="button"
            onClick={() => setInterval("month")}
            className={cn(
              "rounded-sm px-4 py-2 text-sm font-medium",
              interval === "month"
                ? "bg-gradient-brand text-white shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                : "text-txt-secondary hover:text-txt-primary"
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("year")}
            className={cn(
              "rounded-sm px-4 py-2 text-sm font-medium",
              interval === "year"
                ? "bg-gradient-brand text-white shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                : "text-txt-secondary hover:text-txt-primary"
            )}
          >
            Annual
          </button>
        </div>
      </div>

      {/* Tier cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {TIERS.map((t) => {
          const price = isAnnual ? t.annualPrice : t.monthlyPrice;
          const monthlyEquiv = isAnnual ? Math.round(t.annualPrice / 12) : null;
          const savings = isAnnual ? t.monthlyPrice * 12 - t.annualPrice : 0;

          return (
            <Card
              key={t.tier}
              className={cn(
                "bg-gradient-card flex flex-col",
                t.highlight
                  ? "border-b-accent shadow-[0_0_28px_rgba(6,182,212,0.1)] ring-1 ring-accent-light/20"
                  : "border-border"
              )}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl text-txt-primary">{t.name}</CardTitle>
                  {t.badge && (
                    <Badge variant="secondary" className="bg-accent-glow text-accent-light border-none">
                      {t.badge}
                    </Badge>
                  )}
                  {isAnnual && savings > 0 && (
                    <Badge variant="secondary" className="bg-success-bg text-success border-none">
                      Save ${savings}
                    </Badge>
                  )}
                </div>
                <CardDescription>{t.description}</CardDescription>

                {/* Price */}
                <div className="pt-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-gradient-brand tracking-tighter">
                      ${price}
                    </span>
                    <span className="text-txt-tertiary text-sm">
                      {isAnnual ? "/year" : "/month"}
                    </span>
                  </div>
                  {monthlyEquiv && (
                    <p className="text-txt-tertiary text-sm mt-0.5">
                      ${monthlyEquiv}/month billed annually
                    </p>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex flex-col flex-1 space-y-4">
                {/* Features */}
                <ul className="space-y-2 flex-1">
                  {t.features.map((f) => (
                    <li key={f.label} className="flex items-center gap-2 text-sm">
                      {f.included ? (
                        <Check className="h-4 w-4 text-accent-light shrink-0" />
                      ) : (
                        <X className="h-4 w-4 text-txt-tertiary shrink-0" />
                      )}
                      <span className={f.included ? "text-txt-secondary" : "text-txt-tertiary"}>
                        {f.label}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {onSubscribe ? (
                  <Button
                    className={cn(
                      "w-full",
                      t.highlight
                        ? "bg-gradient-brand hover-lift"
                        : "bg-bg-elevated text-txt-primary hover:bg-bg-input"
                    )}
                    onClick={() => onSubscribe(t.tier, interval)}
                    disabled={isLoading}
                  >
                    {isLoading && loadingTier === t.tier ? "Redirecting..." : "Subscribe"}
                  </Button>
                ) : (
                  <Link
                    href="/auth/signup"
                    className={cn(
                      buttonVariants(),
                      "w-full justify-center",
                      t.highlight
                        ? "bg-gradient-brand hover-lift"
                        : "bg-bg-elevated text-txt-primary hover:bg-bg-input"
                    )}
                  >
                    {t.tier === "pro" ? "Start Free Trial" : "Get Started"}
                  </Link>
                )}

                {t.tier === "pro" && !onSubscribe && (
                  <p className="text-center text-txt-tertiary text-xs">
                    30-day free trial · Pro-level access · No credit card
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// Keep backward-compatible single-card export for any existing usage
export { PricingCards as PricingCard };
```

- [ ] **Step 2: Commit**

```bash
git add src/components/billing/pricing-card.tsx
git commit -m "feat(pricing): rebuild pricing cards for three-tier layout"
```

---

### Task 10: Update pricing page

**Files:**
- Modify: `src/app/(marketing)/pricing/page.tsx`

- [ ] **Step 1: Replace with three-tier layout**

```typescript
import Link from "next/link";
import { PricingCards } from "@/components/billing/pricing-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FAQ = [
  {
    q: "How does the free trial work?",
    a: "You get 30 days of Pro-level access with up to 50 AI actions — no credit card required. Experience the full product before choosing a plan.",
  },
  {
    q: "What's the difference between Starter and Pro?",
    a: "Starter is for solo contractors — you get unlimited estimates and manual quote uploads. Pro adds Gmail auto-sync for supplier quotes, team invites (up to 5 members), and priority support.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes. Upgrade or downgrade anytime from Settings. When upgrading, you're charged a prorated amount. When downgrading, the change takes effect at the end of your billing period.",
  },
  {
    q: "What happens when the trial ends?",
    a: "You'll be prompted to pick a plan. Your estimates, catalog, and all data remain — nothing is deleted. Choose Starter to keep going solo, or Pro to keep team and automation features.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from Settings at any time. Access continues until the end of your current billing period.",
  },
];

export default function PricingPage() {
  return (
    <main className="flex-1">
      {/* Header */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-txt-primary">
          Plans for every HVAC business
        </h1>
        <p className="text-lg text-txt-secondary">
          Start free. Upgrade when you&apos;re ready for automation and team features.
        </p>
      </section>

      {/* Pricing cards */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <PricingCards />
      </section>

      {/* FAQ */}
      <section className="border-t bg-muted/40">
        <div className="mx-auto max-w-2xl px-6 py-20 space-y-10">
          <h2 className="text-2xl font-bold text-center text-txt-primary">
            Frequently asked questions
          </h2>
          <dl className="space-y-8">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="bg-gradient-card border border-border rounded-lg p-4">
                <dt className="font-medium text-txt-primary">{q}</dt>
                <dd className="mt-1 text-sm text-txt-secondary">{a}</dd>
              </div>
            ))}
          </dl>

          <div className="text-center pt-4">
            <Link
              href="/auth/signup"
              className={cn(buttonVariants({ size: "lg" }), "text-accent-light")}
            >
              Start your free trial
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(marketing)/pricing/page.tsx
git commit -m "feat(pricing): three-tier pricing page with updated FAQ"
```

---

### Task 11: Update upgrade page for three tiers

**Files:**
- Modify: `src/app/(app)/upgrade/page.tsx`

- [ ] **Step 1: Replace with multi-tier upgrade page**

```typescript
"use client";

import { useState } from "react";
import { PricingCards } from "@/components/billing/pricing-card";
import type { BillingInterval } from "@/types/billing";

export default function UpgradePage() {
  const [loading, setLoading] = useState(false);
  const [loadingTier, setLoadingTier] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe(
    tier: "starter" | "pro" | "enterprise",
    interval: BillingInterval
  ) {
    setLoading(true);
    setLoadingTier(tier);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error ?? "Failed to start checkout. Please try again.");
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
      setLoadingTier(undefined);
    }
  }

  return (
    <div className="min-h-screen bg-background max-w-5xl mx-auto py-12 px-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-txt-primary">Choose your plan</h1>
        <p className="text-txt-secondary">
          Your trial has ended or you&apos;ve reached the usage limit. Pick a plan to keep using CoolBid.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-error bg-error-bg p-4 text-sm text-error max-w-md mx-auto">
          {error}
        </div>
      )}

      <PricingCards onSubscribe={handleSubscribe} isLoading={loading} loadingTier={loadingTier} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(app)/upgrade/page.tsx
git commit -m "feat(upgrade): three-tier plan selection on upgrade page"
```

---

### Task 12: Update trial banner and subscription status

**Files:**
- Modify: `src/components/billing/trial-banner.tsx`
- Modify: `src/components/billing/subscription-status.tsx`

- [ ] **Step 1: Update trial banner to say "Pro Trial"**

In `src/components/billing/trial-banner.tsx`, replace line 64:

```typescript
// Old:
        Free trial — <strong>{days} day{days !== 1 ? "s" : ""} left</strong> ·{" "}
// New:
        Pro trial — <strong>{days} day{days !== 1 ? "s" : ""} left</strong> ·{" "}
```

- [ ] **Step 2: Update subscription status to show tier name**

In `src/components/billing/subscription-status.tsx`, update the profile query (line 65) to also fetch `subscription_tier`:

```typescript
        .select("subscription_status, subscription_tier, trial_ends_at, subscription_period_end, ai_actions_used")
```

Add `subscription_tier` to the `StatusProfile` interface (after line 20):

```typescript
interface StatusProfile {
  subscription_status: SubscriptionStatus | null;
  subscription_tier: string | null;
  trial_ends_at: string | null;
  subscription_period_end: string | null;
  ai_actions_used: number | null;
}
```

Update the active state display (replace lines 131-143):

```typescript
        {status === "active" && (
          <>
            <p className="text-sm text-txt-primary">
              {(profile?.subscription_tier ?? "pro").charAt(0).toUpperCase() +
                (profile?.subscription_tier ?? "pro").slice(1)}{" "}
              subscription active
              {profile?.subscription_period_end
                ? <span className="text-txt-secondary">{` · Renews ${new Date(profile.subscription_period_end).toLocaleDateString()}`}</span>
                : ""}
            </p>
            <Button size="sm" className="bg-gradient-brand hover-lift" onClick={openPortal} disabled={portalLoading}>
              {portalLoading ? "Loading..." : "Manage Billing"}
            </Button>
          </>
        )}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/billing/trial-banner.tsx src/components/billing/subscription-status.tsx
git commit -m "feat(billing): show tier names in trial banner and subscription status"
```

---

## Phase 4: Database Migration & Team Seats

### Task 13: Create database migration for teams and email events

**Files:**
- Create: `supabase/migrations/004_pricing_tiers.sql`

- [ ] **Step 1: Check existing migrations directory**

Run: `ls supabase/migrations/`
Expected: See existing migration files to determine naming convention.

- [ ] **Step 2: Write the migration**

```sql
-- 004_pricing_tiers.sql
-- Multi-tier pricing, team tables, and email events

-- Teams
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now()
);

alter table public.teams enable row level security;
create policy "Owner can manage team" on public.teams
  for all using (auth.uid() = owner_id);

-- Team members
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'member',
  status text not null default 'pending',
  invited_at timestamptz default now(),
  accepted_at timestamptz,
  unique(team_id, email)
);

alter table public.team_members enable row level security;
create policy "Team owner can manage members" on public.team_members
  for all using (
    team_id in (select id from public.teams where owner_id = auth.uid())
  );
create policy "Members can read own membership" on public.team_members
  for select using (user_id = auth.uid());

-- Add team_id to profiles
alter table public.profiles add column if not exists team_id uuid references public.teams(id);

-- Email events (for deduplicating retention emails)
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  email_type text not null,
  sent_at timestamptz default now(),
  resend_id text,
  unique(user_id, email_type)
);

create index if not exists idx_email_events_user on public.email_events(user_id);
alter table public.email_events enable row level security;
-- No RLS policy needed — email_events are only accessed via service role in cron/webhook
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/004_pricing_tiers.sql
git commit -m "feat(db): add teams, team_members, and email_events tables"
```

---

### Task 14: Team invite API routes

**Files:**
- Create: `src/app/api/team/invite/route.ts`
- Create: `src/app/api/team/members/route.ts`

- [ ] **Step 1: Create team invite endpoint**

```typescript
// src/app/api/team/invite/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canUseFeature, PRO_TEAM_SEAT_LIMIT } from "@/types/billing";
import type { SubscriptionTier } from "@/types/billing";

const requestSchema = z.object({
  email: z.string().email(),
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
      { error: "Invalid email address", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier, team_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const tier = (profile.subscription_tier ?? "trial") as SubscriptionTier;
  if (!canUseFeature(tier, "team_invites")) {
    return NextResponse.json(
      { error: "Team invites require a Pro or Enterprise plan." },
      { status: 403 }
    );
  }

  // Get or create team
  let teamId = profile.team_id;
  if (!teamId) {
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({ owner_id: user.id, name: "My Team" })
      .select("id")
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
    }
    teamId = team.id;

    await supabase
      .from("profiles")
      .update({ team_id: teamId })
      .eq("id", user.id);
  }

  // Check seat limit for Pro
  if (tier === "pro") {
    const { count } = await supabase
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .in("status", ["pending", "active"]);

    // +1 for the owner
    if ((count ?? 0) + 1 >= PRO_TEAM_SEAT_LIMIT) {
      return NextResponse.json(
        { error: `Pro plan supports up to ${PRO_TEAM_SEAT_LIMIT} team members. Upgrade to Enterprise for unlimited seats.` },
        { status: 403 }
      );
    }
  }

  // Create invite
  const { data: invite, error: inviteError } = await supabase
    .from("team_members")
    .insert({
      team_id: teamId,
      email: parsed.data.email.trim().toLowerCase(),
      role: "member",
      status: "pending",
    })
    .select("id, email")
    .single();

  if (inviteError) {
    if (inviteError.code === "23505") {
      return NextResponse.json(
        { error: "This email has already been invited." },
        { status: 409 }
      );
    }
    console.error("Failed to create invite:", inviteError);
    return NextResponse.json({ error: "Failed to send invite" }, { status: 500 });
  }

  // TODO: Send invite email via Resend (Task 16)

  return NextResponse.json({ invite });
}
```

- [ ] **Step 2: Create team members list/remove endpoint**

```typescript
// src/app/api/team/members/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .single();

  if (!profile?.team_id) {
    return NextResponse.json({ members: [] });
  }

  // Verify user is team owner
  const { data: team } = await supabase
    .from("teams")
    .select("id")
    .eq("id", profile.team_id)
    .eq("owner_id", user.id)
    .single();

  if (!team) {
    return NextResponse.json({ error: "Not a team owner" }, { status: 403 });
  }

  const { data: members } = await supabase
    .from("team_members")
    .select("id, email, role, status, invited_at, accepted_at")
    .eq("team_id", profile.team_id)
    .in("status", ["pending", "active"])
    .order("invited_at", { ascending: false });

  return NextResponse.json({ members: members ?? [] });
}

const deleteSchema = z.object({
  memberId: z.string().uuid(),
});

export async function DELETE(request: NextRequest) {
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

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Verify the member belongs to a team the user owns
  const { data: member } = await supabase
    .from("team_members")
    .select("id, team_id, user_id")
    .eq("id", parsed.data.memberId)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const { data: team } = await supabase
    .from("teams")
    .select("id")
    .eq("id", member.team_id)
    .eq("owner_id", user.id)
    .single();

  if (!team) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Remove member
  await supabase
    .from("team_members")
    .update({ status: "removed" })
    .eq("id", parsed.data.memberId);

  // Clear team_id from member's profile if they had accepted
  if (member.user_id) {
    await supabase
      .from("profiles")
      .update({ team_id: null })
      .eq("id", member.user_id);
  }

  return NextResponse.json({ removed: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/team/invite/route.ts src/app/api/team/members/route.ts
git commit -m "feat(team): add invite and member management API routes"
```

---

### Task 15: Team management UI in settings

**Files:**
- Create: `src/components/settings/team-section.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Create team section component**

```typescript
// src/components/settings/team-section.tsx
"use client";

import { useEffect, useState } from "react";
import { Users, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRO_TEAM_SEAT_LIMIT } from "@/types/billing";
import type { SubscriptionTier } from "@/types/billing";

type TeamMember = {
  id: string;
  email: string;
  role: string;
  status: string;
  invited_at: string;
  accepted_at: string | null;
};

interface TeamSectionProps {
  tier: SubscriptionTier;
}

export function TeamSection({ tier }: TeamSectionProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/team/members")
      .then((r) => r.json())
      .then((data) => {
        setMembers(data.members ?? []);
        setLoading(false);
      });
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase() }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Failed to send invite.");
        return;
      }

      setMembers((prev) => [
        { id: json.invite.id, email: json.invite.email, role: "member", status: "pending", invited_at: new Date().toISOString(), accepted_at: null },
        ...prev,
      ]);
      setInviteEmail("");
      setSuccess(`Invite sent to ${json.invite.email}`);
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(memberId: string) {
    if (!confirm("Remove this team member?")) return;

    try {
      const res = await fetch("/api/team/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });

      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
      }
    } catch {
      // Silently fail — member list will refresh on next load
    }
  }

  const seatCount = members.length + 1; // +1 for owner
  const seatLimit = tier === "pro" ? PRO_TEAM_SEAT_LIMIT : null;
  const atLimit = seatLimit !== null && seatCount >= seatLimit;

  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-accent-light" />
          <CardTitle className="text-txt-primary">Team</CardTitle>
        </div>
        <CardDescription className="text-txt-secondary">
          Invite team members to create estimates under your account.
          {seatLimit && (
            <span className="ml-1 text-txt-tertiary">
              ({seatCount}/{seatLimit} seats used)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Invite form */}
        {!atLimit && (
          <form onSubmit={handleInvite} className="flex gap-2">
            <Input
              type="email"
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              disabled={inviting}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="bg-gradient-brand hover-lift"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              {inviting ? "Sending..." : "Invite"}
            </Button>
          </form>
        )}

        {atLimit && (
          <p className="text-sm text-warning">
            You&apos;ve reached the {seatLimit}-seat limit on Pro. Upgrade to Enterprise for unlimited seats.
          </p>
        )}

        {error && (
          <p className="text-sm text-error">{error}</p>
        )}
        {success && (
          <p className="text-sm text-success">{success}</p>
        )}

        {/* Member list */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-txt-tertiary">No team members yet. Invite someone to get started.</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-md border border-border bg-bg-elevated px-3 py-2"
              >
                <div>
                  <span className="text-sm text-txt-primary">{m.email}</span>
                  <Badge
                    variant="outline"
                    className="ml-2 text-xs"
                  >
                    {m.status === "pending" ? "Pending" : "Active"}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(m.id)}
                  className="text-txt-tertiary hover:text-error"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add team section to settings page**

In `src/app/(app)/settings/page.tsx`, add the import at the top (after the LogoUploader import):

```typescript
import { TeamSection } from "@/components/settings/team-section";
import { canUseFeature } from "@/types/billing";
import type { SubscriptionTier } from "@/types/billing";
```

Then add the TeamSection below the SubscriptionStatus component (after line 273 `<SubscriptionStatus />`):

```typescript
      {/* Team — Pro and Enterprise only */}
      {profile?.subscription_tier &&
        canUseFeature(profile.subscription_tier as SubscriptionTier, "team_invites") && (
          <TeamSection tier={profile.subscription_tier as SubscriptionTier} />
        )}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/team-section.tsx src/app/(app)/settings/page.tsx
git commit -m "feat(settings): add team management section for Pro/Enterprise"
```

---

## Phase 5: Retention Emails via Resend

### Task 16: Set up Resend client and email templates

**Files:**
- Create: `src/lib/resend.ts`
- Create: `src/lib/emails/trial-reminder.tsx`
- Create: `src/lib/emails/trial-expired.tsx`
- Create: `src/lib/emails/payment-failed.tsx`
- Create: `src/lib/emails/team-invite.tsx`

- [ ] **Step 1: Install Resend and React Email**

Run: `npm install resend @react-email/components`

- [ ] **Step 2: Create Resend client**

```typescript
// src/lib/resend.ts
import { Resend } from "resend";

let resendClient: Resend | null = null;

export function getResend(): Resend {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) throw new Error("RESEND_API_KEY is not set");
    resendClient = new Resend(key);
  }
  return resendClient;
}

export const FROM_EMAIL = "CoolBid <notifications@coolbid.app>";
```

- [ ] **Step 3: Create trial reminder email template**

```tsx
// src/lib/emails/trial-reminder.tsx
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
} from "@react-email/components";

interface TrialReminderProps {
  daysLeft: number;
  estimateCount: number;
  catalogCount: number;
  pricingUrl: string;
}

export function TrialReminderEmail({
  daysLeft,
  estimateCount,
  catalogCount,
  pricingUrl,
}: TrialReminderProps) {
  const isUrgent = daysLeft <= 2;

  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f4f4f5", padding: "20px" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: "8px", padding: "32px", maxWidth: "480px" }}>
          <Text style={{ fontSize: "20px", fontWeight: "bold", color: "#18181b" }}>
            {isUrgent
              ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left on your CoolBid trial`
              : `Your CoolBid trial ends in ${daysLeft} days`}
          </Text>

          {estimateCount > 0 || catalogCount > 0 ? (
            <Text style={{ color: "#52525b", lineHeight: "1.6" }}>
              You&apos;ve built {estimateCount} estimate{estimateCount !== 1 ? "s" : ""} and
              added {catalogCount} items to your catalog.
              {isUrgent
                ? " Don't lose access — pick a plan to keep going."
                : " Pick a plan to keep the momentum going."}
            </Text>
          ) : (
            <Text style={{ color: "#52525b", lineHeight: "1.6" }}>
              {isUrgent
                ? "Your data is safe, but you'll lose access when the trial ends. Pick a plan to continue."
                : "Your free trial is ending soon. Choose a plan to keep using CoolBid."}
            </Text>
          )}

          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Button
              href={pricingUrl}
              style={{
                backgroundColor: "#06b6d4",
                color: "#ffffff",
                padding: "12px 24px",
                borderRadius: "6px",
                fontWeight: "bold",
                textDecoration: "none",
              }}
            >
              View Plans
            </Button>
          </Section>

          <Hr style={{ borderColor: "#e4e4e7" }} />
          <Text style={{ fontSize: "12px", color: "#a1a1aa" }}>
            CoolBid — Professional HVAC estimating
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 4: Create trial expired email template**

```tsx
// src/lib/emails/trial-expired.tsx
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
} from "@react-email/components";

interface TrialExpiredProps {
  estimateCount: number;
  catalogCount: number;
  pricingUrl: string;
  isWinback?: boolean;
}

export function TrialExpiredEmail({
  estimateCount,
  catalogCount,
  pricingUrl,
  isWinback,
}: TrialExpiredProps) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f4f4f5", padding: "20px" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: "8px", padding: "32px", maxWidth: "480px" }}>
          <Text style={{ fontSize: "20px", fontWeight: "bold", color: "#18181b" }}>
            {isWinback ? "Your estimates are still in CoolBid" : "Your CoolBid trial has ended"}
          </Text>

          <Text style={{ color: "#52525b", lineHeight: "1.6" }}>
            {isWinback
              ? `We kept everything — ${estimateCount} estimate${estimateCount !== 1 ? "s" : ""} and ${catalogCount} catalog items. Come back anytime.`
              : "Pick a plan to pick up where you left off. Your data is waiting."}
          </Text>

          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Button
              href={pricingUrl}
              style={{
                backgroundColor: "#06b6d4",
                color: "#ffffff",
                padding: "12px 24px",
                borderRadius: "6px",
                fontWeight: "bold",
                textDecoration: "none",
              }}
            >
              Choose a Plan
            </Button>
          </Section>

          <Hr style={{ borderColor: "#e4e4e7" }} />
          <Text style={{ fontSize: "12px", color: "#a1a1aa" }}>
            CoolBid — Professional HVAC estimating
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 5: Create payment failed email template**

```tsx
// src/lib/emails/payment-failed.tsx
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
} from "@react-email/components";

interface PaymentFailedProps {
  portalUrl: string;
  isRetry?: boolean;
}

export function PaymentFailedEmail({ portalUrl, isRetry }: PaymentFailedProps) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f4f4f5", padding: "20px" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: "8px", padding: "32px", maxWidth: "480px" }}>
          <Text style={{ fontSize: "20px", fontWeight: "bold", color: "#18181b" }}>
            {isRetry
              ? "Action needed: update your payment method"
              : "Your CoolBid payment didn't go through"}
          </Text>

          <Text style={{ color: "#52525b", lineHeight: "1.6" }}>
            {isRetry
              ? "We're still trying to process your payment. Update your card to keep uninterrupted access."
              : "Update your card to keep access. We'll retry automatically, but updating now ensures no disruption."}
          </Text>

          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Button
              href={portalUrl}
              style={{
                backgroundColor: "#06b6d4",
                color: "#ffffff",
                padding: "12px 24px",
                borderRadius: "6px",
                fontWeight: "bold",
                textDecoration: "none",
              }}
            >
              Update Payment Method
            </Button>
          </Section>

          <Hr style={{ borderColor: "#e4e4e7" }} />
          <Text style={{ fontSize: "12px", color: "#a1a1aa" }}>
            CoolBid — Professional HVAC estimating
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 6: Create team invite email template**

```tsx
// src/lib/emails/team-invite.tsx
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
} from "@react-email/components";

interface TeamInviteProps {
  companyName: string;
  signupUrl: string;
}

export function TeamInviteEmail({ companyName, signupUrl }: TeamInviteProps) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f4f4f5", padding: "20px" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: "8px", padding: "32px", maxWidth: "480px" }}>
          <Text style={{ fontSize: "20px", fontWeight: "bold", color: "#18181b" }}>
            You&apos;re invited to join {companyName} on CoolBid
          </Text>

          <Text style={{ color: "#52525b", lineHeight: "1.6" }}>
            {companyName} invited you to their team. Sign up to start creating professional HVAC estimates.
          </Text>

          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Button
              href={signupUrl}
              style={{
                backgroundColor: "#06b6d4",
                color: "#ffffff",
                padding: "12px 24px",
                borderRadius: "6px",
                fontWeight: "bold",
                textDecoration: "none",
              }}
            >
              Join Team
            </Button>
          </Section>

          <Hr style={{ borderColor: "#e4e4e7" }} />
          <Text style={{ fontSize: "12px", color: "#a1a1aa" }}>
            CoolBid — Professional HVAC estimating
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/resend.ts src/lib/emails/
git commit -m "feat(email): add Resend client and email templates"
```

---

### Task 17: Retention email cron job

**Files:**
- Create: `src/app/api/cron/send-retention-emails/route.ts`

- [ ] **Step 1: Create the cron route**

```typescript
// src/app/api/cron/send-retention-emails/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getResend, FROM_EMAIL } from "@/lib/resend";
import { TrialReminderEmail } from "@/lib/emails/trial-reminder";
import { TrialExpiredEmail } from "@/lib/emails/trial-expired";
import type { Database } from "@/types/database";

function getServiceClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "https://coolbid.app";

type EmailJob = {
  userId: string;
  email: string;
  emailType: string;
  render: () => React.ReactElement;
  subject: string;
};

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const resend = getResend();
  const now = new Date();
  const jobs: EmailJob[] = [];

  // 1. Trial reminder — 7 days left (day 23)
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sixDaysFromNow = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);

  const { data: reminder7 } = await supabase
    .from("profiles")
    .select("id, company_email, trial_ends_at")
    .eq("subscription_status", "trialing")
    .gte("trial_ends_at", sixDaysFromNow.toISOString())
    .lte("trial_ends_at", sevenDaysFromNow.toISOString());

  for (const p of reminder7 ?? []) {
    if (!p.company_email) continue;
    const estimateCount = await getCount(supabase, "estimates", p.id);
    const catalogCount = await getCount(supabase, "equipment_catalog", p.id);
    jobs.push({
      userId: p.id,
      email: p.company_email,
      emailType: "trial_reminder_7d",
      subject: "Your CoolBid trial ends in 7 days",
      render: () =>
        TrialReminderEmail({
          daysLeft: 7,
          estimateCount,
          catalogCount,
          pricingUrl: `${APP_URL}/pricing`,
        }),
    });
  }

  // 2. Trial urgent — 2 days left (day 28)
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

  const { data: reminder2 } = await supabase
    .from("profiles")
    .select("id, company_email, trial_ends_at")
    .eq("subscription_status", "trialing")
    .gte("trial_ends_at", oneDayFromNow.toISOString())
    .lte("trial_ends_at", twoDaysFromNow.toISOString());

  for (const p of reminder2 ?? []) {
    if (!p.company_email) continue;
    const estimateCount = await getCount(supabase, "estimates", p.id);
    const catalogCount = await getCount(supabase, "equipment_catalog", p.id);
    jobs.push({
      userId: p.id,
      email: p.company_email,
      emailType: "trial_reminder_2d",
      subject: "2 days left on your CoolBid trial",
      render: () =>
        TrialReminderEmail({
          daysLeft: 2,
          estimateCount,
          catalogCount,
          pricingUrl: `${APP_URL}/pricing`,
        }),
    });
  }

  // 3. Trial expired — just expired (within last 24h)
  const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

  const { data: expired } = await supabase
    .from("profiles")
    .select("id, company_email, trial_ends_at")
    .in("subscription_status", ["trialing", "expired"])
    .gte("trial_ends_at", oneDayAgo.toISOString())
    .lte("trial_ends_at", now.toISOString());

  for (const p of expired ?? []) {
    if (!p.company_email) continue;
    const estimateCount = await getCount(supabase, "estimates", p.id);
    const catalogCount = await getCount(supabase, "equipment_catalog", p.id);
    jobs.push({
      userId: p.id,
      email: p.company_email,
      emailType: "trial_expired",
      subject: "Your CoolBid trial has ended",
      render: () =>
        TrialExpiredEmail({
          estimateCount,
          catalogCount,
          pricingUrl: `${APP_URL}/pricing`,
        }),
    });
  }

  // 4. Win-back — 7 days after expiry
  const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const { data: winback } = await supabase
    .from("profiles")
    .select("id, company_email, trial_ends_at")
    .in("subscription_status", ["expired", "trialing"])
    .gte("trial_ends_at", eightDaysAgo.toISOString())
    .lte("trial_ends_at", sevenDaysAgo.toISOString());

  for (const p of winback ?? []) {
    if (!p.company_email) continue;
    const estimateCount = await getCount(supabase, "estimates", p.id);
    const catalogCount = await getCount(supabase, "equipment_catalog", p.id);
    jobs.push({
      userId: p.id,
      email: p.company_email,
      emailType: "trial_winback",
      subject: "Your estimates are still in CoolBid",
      render: () =>
        TrialExpiredEmail({
          estimateCount,
          catalogCount,
          pricingUrl: `${APP_URL}/pricing`,
          isWinback: true,
        }),
    });
  }

  // 5. Access ending — canceled subscription, 3 days before period end
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const { data: accessEnding } = await supabase
    .from("profiles")
    .select("id, company_email, subscription_period_end")
    .eq("subscription_status", "canceled")
    .gte("subscription_period_end", twoDaysFromNow.toISOString())
    .lte("subscription_period_end", threeDaysFromNow.toISOString());

  for (const p of accessEnding ?? []) {
    if (!p.company_email) continue;
    jobs.push({
      userId: p.id,
      email: p.company_email,
      emailType: "access_ending",
      subject: "Your CoolBid access ends in 3 days",
      render: () =>
        TrialReminderEmail({
          daysLeft: 3,
          estimateCount: 0,
          catalogCount: 0,
          pricingUrl: `${APP_URL}/pricing`,
        }),
    });
  }

  // Send all jobs, deduplicated via email_events
  let sent = 0;
  let skipped = 0;

  for (const job of jobs) {
    // Check if already sent
    const { data: existing } = await supabase
      .from("email_events")
      .select("id")
      .eq("user_id", job.userId)
      .eq("email_type", job.emailType)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    try {
      const { data } = await resend.emails.send({
        from: FROM_EMAIL,
        to: job.email,
        subject: job.subject,
        react: job.render(),
      });

      await supabase.from("email_events").insert({
        user_id: job.userId,
        email_type: job.emailType,
        resend_id: data?.id ?? null,
      });

      sent++;
    } catch (err) {
      console.error(`Failed to send ${job.emailType} to ${job.email}:`, err);
    }
  }

  return NextResponse.json({ sent, skipped, total: jobs.length });
}

async function getCount(
  supabase: ReturnType<typeof getServiceClient>,
  table: "estimates" | "equipment_catalog",
  userId: string
): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}
```

- [ ] **Step 2: Add cron schedule to vercel.json (or vercel.ts)**

Check which config format the project uses and add:

```json
{
  "crons": [
    { "path": "/api/cron/send-retention-emails", "schedule": "0 14 * * *" }
  ]
}
```

(Runs daily at 2pm UTC / ~9am Central — a reasonable time for HVAC contractors to receive emails.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/send-retention-emails/route.ts
git commit -m "feat(email): add daily retention email cron job"
```

---

### Task 18: Send payment/cancellation emails from webhook

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Add Resend imports and email sends to webhook cases**

Add imports at the top of the webhook file:

```typescript
import { getResend, FROM_EMAIL } from "@/lib/resend";
import { PaymentFailedEmail } from "@/lib/emails/payment-failed";
```

In the `invoice.payment_failed` case (after `logBillingEvent`), add:

```typescript
        // Send payment failed email
        if (userId) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("company_email, stripe_customer_id")
            .eq("id", userId)
            .single();

          if (profile?.company_email) {
            try {
              const resend = getResend();
              await resend.emails.send({
                from: FROM_EMAIL,
                to: profile.company_email,
                subject: "Your CoolBid payment didn't go through",
                react: PaymentFailedEmail({
                  portalUrl: `${process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "https://coolbid.app"}/api/stripe/portal`,
                }),
              });
            } catch (err) {
              console.error("Failed to send payment failed email:", err);
            }
          }
        }
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/stripe/webhook/route.ts
git commit -m "feat(webhook): send payment failure emails via Resend"
```

---

### Task 19: Wire up team invite email sending

**Files:**
- Modify: `src/app/api/team/invite/route.ts`

- [ ] **Step 1: Replace the TODO comment with actual email send**

Add imports at the top:

```typescript
import { getResend, FROM_EMAIL } from "@/lib/resend";
import { TeamInviteEmail } from "@/lib/emails/team-invite";
```

Replace the `// TODO: Send invite email via Resend (Task 16)` comment with:

```typescript
  // Send invite email
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "https://coolbid.app";
  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("company_name")
    .eq("id", user.id)
    .single();

  try {
    const resend = getResend();
    await resend.emails.send({
      from: FROM_EMAIL,
      to: parsed.data.email.trim().toLowerCase(),
      subject: `You're invited to join ${ownerProfile?.company_name ?? "a team"} on CoolBid`,
      react: TeamInviteEmail({
        companyName: ownerProfile?.company_name ?? "a team",
        signupUrl: `${appUrl}/auth/signup?invite=${invite.id}`,
      }),
    });
  } catch (err) {
    console.error("Failed to send invite email:", err);
    // Don't fail the request — invite is created, email is best-effort
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/team/invite/route.ts
git commit -m "feat(team): send invite emails via Resend"
```

---

## Phase 6: Middleware & Final Integration

### Task 20: Update middleware to cache tier

**Files:**
- Modify: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Add subscription_tier to the profile query and cookie cache**

In the subscription gating section (line 93-97), update the profile query to include `subscription_tier`:

```typescript
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_status, subscription_tier, trial_ends_at, ai_actions_used")
        .eq("id", user!.id)
        .single();
```

Update the cookie set (line 108) to also cache the tier:

```typescript
        supabaseResponse.cookies.set("sub_status", status ?? "unknown", {
          path: "/",
          maxAge: 300,
        });
        supabaseResponse.cookies.set("sub_tier", profile.subscription_tier ?? "trial", {
          path: "/",
          maxAge: 300,
        });
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "feat(middleware): cache subscription tier in cookie"
```

---

### Task 21: Add Stripe env vars and cron config

**Files:**
- Modify: `.env.local.example` (or `.env.example`)

- [ ] **Step 1: Add new environment variables to example file**

Append to the env example file:

```
# Pricing tiers (Stripe)
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_...
STRIPE_PRICE_ENTERPRISE_ANNUAL=price_...

# Resend
RESEND_API_KEY=re_...
```

- [ ] **Step 2: Verify cron config exists for retention emails**

Check `vercel.json` or `vercel.ts` for the cron schedule added in Task 17 step 2. Ensure both crons are present:

```json
{
  "crons": [
    { "path": "/api/cron/sync-emails", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/send-retention-emails", "schedule": "0 14 * * *" }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add .env.local.example vercel.json
git commit -m "chore: add new env vars and retention email cron config"
```

---

### Task 22: Verify TypeScript compilation

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: No errors. Fix any remaining type issues.

- [ ] **Step 2: Run dev server smoke test**

Run: `npm run dev`
Expected: Server starts without errors. Visit `/pricing` to see three tiers.

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve type errors from pricing tier migration"
```

---

## Stripe Dashboard Setup (Manual — Not Code)

After deploying, these steps must be done in the Stripe Dashboard:

1. **Create Product: "CoolBid Starter"** — add $79/mo and $790/yr prices
2. **Create Product: "CoolBid Enterprise"** — add $250/mo and $2,500/yr prices
3. **Add `tier` metadata** to each product: `starter`, `pro`, `enterprise`
4. **Update Customer Portal** to allow plan switching between all three tiers
5. **Copy price IDs** into Vercel env vars: `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_ANNUAL`, `STRIPE_PRICE_ENTERPRISE_MONTHLY`, `STRIPE_PRICE_ENTERPRISE_ANNUAL`
6. **Add Resend DNS records** to `coolbid.app` domain for sending verification

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1. Types & Stripe | 1-5 | Multi-tier types, Stripe checkout + webhook support |
| 2. Feature Gating | 6-8 | Gmail sync gated to Pro+, UI upgrade prompts |
| 3. Pricing UI | 9-12 | Three-tier pricing page, upgrade page, tier-aware status |
| 4. Teams | 13-15 | Database tables, invite/manage API, settings UI |
| 5. Retention Emails | 16-19 | Resend setup, templates, cron job, webhook emails |
| 6. Integration | 20-22 | Middleware updates, env config, type verification |
