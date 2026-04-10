# Pricing Tiers, Team Seats & Retention Emails — Design Spec

## Overview

Replace the single Pro tier with a three-tier pricing model (Starter / Pro / Enterprise), add team invite functionality for Pro and Enterprise, gate quote mining features behind Pro+, and implement a retention email flow using Resend to reduce churn at trial expiration and payment failure.

**Goals:**
- Lower the barrier to entry ($79 vs $149) so contractors convert instead of churning at trial end
- Create a natural upgrade path: solo contractor → small team → large operation
- Use feature gating (not usage caps) as the primary tier differentiator
- Proactively retain users with well-timed emails at critical moments

## Pricing Structure

| | **Starter** | **Pro** | **Enterprise** |
|---|---|---|---|
| **Monthly** | $79/mo | $149/mo | $250/mo |
| **Annual** | $790/yr (save $158) | $1,490/yr (save $298) | $2,500/yr (save $500) |
| **Users** | 1 | Up to 5 | Unlimited |
| **Estimates** | Unlimited | Unlimited | Unlimited |
| **AI Floorplan Analysis** | Unlimited | Unlimited | Unlimited |
| **Equipment Catalog** | Yes | Yes | Yes |
| **Manual Quote Upload + AI Parse** | Yes | Yes | Yes |
| **Gmail Sync / Auto-Mining** | No | Yes | Yes |
| **Team Invites** | No | Yes (up to 5 seats) | Yes (unlimited) |
| **Priority Support** | No | Yes | Dedicated |

**Free trial:** 30 days, Pro-level access, 50 AI actions, no credit card required. Trial gives full Pro experience so users feel the downgrade if they pick Starter.

**Trial end behavior:** Prompted to pick a plan (Starter, Pro, or Enterprise). If no plan selected, locked out (existing behavior). Data preserved regardless.

## Subscription Tier Changes

### Type Changes

```typescript
export type SubscriptionTier = "trial" | "starter" | "pro" | "enterprise";
```

### New Constants

```typescript
export const STARTER_MONTHLY_PRICE = 79;
export const STARTER_ANNUAL_PRICE = 790;
export const PRO_MONTHLY_PRICE = 149;
export const PRO_ANNUAL_PRICE = 1490;
export const ENTERPRISE_MONTHLY_PRICE = 250;
export const ENTERPRISE_ANNUAL_PRICE = 2500;

export const PRO_TEAM_SEAT_LIMIT = 5;
```

### Stripe Configuration

Create three products in Stripe Dashboard:

1. **CoolBid Starter** — 2 prices: $79/mo, $790/yr
2. **CoolBid Pro** — 2 prices: $149/mo, $1,490/yr (existing, keep as-is)
3. **CoolBid Enterprise** — 2 prices: $250/mo, $2,500/yr

New environment variables:

```
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_...
STRIPE_PRICE_ENTERPRISE_ANNUAL=price_...
```

Existing `STRIPE_PRICE_PRO_MONTHLY` and `STRIPE_PRICE_PRO_ANNUAL` stay as-is.

### Checkout Flow Changes

`POST /api/stripe/checkout` request body changes:

```typescript
{ tier: "starter" | "pro" | "enterprise", interval: "month" | "year" }
```

Webhook handler on `checkout.session.completed` sets `subscription_tier` to the purchased tier (read from Stripe product metadata `tier: "starter" | "pro" | "enterprise"`).

### Upgrade / Downgrade

Use Stripe's subscription update API to switch tiers. Stripe handles proration automatically.

- **Upgrade (Starter → Pro, Pro → Enterprise):** Immediate, prorated charge for remainder of billing period.
- **Downgrade (Enterprise → Pro, Pro → Starter):** Takes effect at end of current billing period. Features remain until then.

On downgrade to Starter:
- Gmail sync stops (disconnect is optional — sync cron skips Starter users)
- Team members lose access (invited members see "your organization downgraded" message)
- Existing parsed quotes and catalog items remain accessible (read-only from Gmail-sourced data)

## Feature Gating

### Gate: Gmail Sync / Quote Mining

**Where enforced:**
- `POST /api/auth/gmail/connect` — return 403 if tier is `starter`
- `POST /api/cron/sync-emails` — skip users with tier `starter`
- Gmail connection UI (`EmailConnectButton`, `EmailConnectionCard`) — hide or show disabled state with "Upgrade to Pro" badge for Starter users

**Manual quote upload is NOT gated** — available on all paid tiers. The AI parse cost per upload is minimal and it's the hook that sells Pro.

### Gate: Team Invites

**Where enforced:**
- `POST /api/team/invite` (new route) — return 403 if tier is `starter`, return 403 if tier is `pro` and team size >= 5
- Team settings UI — hidden for Starter, shows seat count for Pro, no limit display for Enterprise

### Access Check Updates

`getAccessState()` in `src/lib/billing/access-check.ts` gains a `tier` field:

```typescript
export type AccessState = {
  canAccess: boolean;
  reason: "trialing" | "active" | "past_due" | "trial_expired" | "canceled" | "locked_out";
  tier: SubscriptionTier;
  trialDaysLeft?: number;
  aiActionsRemaining?: number;
  subscriptionPeriodEnd?: string;
};
```

New helper:

```typescript
export function canUseFeature(tier: SubscriptionTier, feature: "gmail_sync" | "team_invites"): boolean {
  if (feature === "gmail_sync") return tier === "pro" || tier === "enterprise" || tier === "trial";
  if (feature === "team_invites") return tier === "pro" || tier === "enterprise";
  return false;
}
```

Trial users get Gmail sync access (Pro-level trial experience).

## Team Invites (New Feature)

### Data Model

**New table: `teams`**

```sql
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now()
);

alter table public.teams enable row level security;
create policy "Owner can manage team" on public.teams
  for all using (auth.uid() = owner_id);
```

**New table: `team_members`**

```sql
create table public.team_members (
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
```

**profiles table addition:**

```sql
alter table public.profiles add column if not exists team_id uuid references public.teams(id);
```

### Team Creation

A team is auto-created when a user subscribes to Pro or Enterprise. The subscriber is the owner. `profiles.team_id` is set on the owner's profile.

### Invite Flow

1. Owner goes to Settings → Team → Invite Member
2. Enters email address
3. `POST /api/team/invite` — validates tier + seat count, creates `team_members` row with `status: 'pending'`, sends invite email via Resend
4. Invitee receives email with signup/login link containing invite token
5. On signup/login, `team_members.user_id` is set, `status` → `'active'`, `profiles.team_id` is set
6. Team member inherits the owner's subscription tier for feature access (no separate billing)

### Team Member Access

- Team members share the owner's `team_id`
- All estimates, catalog items, and quotes are scoped to `team_id` (not individual `user_id`) for team accounts
- RLS policies updated: `where team_id = (select team_id from profiles where id = auth.uid())`
- Individual users (Starter, no team) continue using `user_id` scoping

### Seat Enforcement

- Pro: max 5 total (owner + 4 invited). Check `count(*) from team_members where team_id = ? and status in ('pending', 'active')`.
- Enterprise: no limit enforced.
- Removing a member: owner can revoke from settings. Sets `status: 'removed'`, clears `profiles.team_id` on the member. Member loses access to team data.

## Retention Emails (Resend)

### Setup

- Install `resend` npm package
- Create `src/lib/resend.ts` — Resend client initialization
- Create email templates as React components in `src/lib/emails/`
- DNS: Add Resend verification records to `coolbid.app` domain (alongside existing ImprovMX records — no conflict)
- Send from: `notifications@coolbid.app`

### Environment Variables

```
RESEND_API_KEY=re_...
```

### Email Templates

All emails use React components rendered by Resend. Branded with CoolBid logo, clean layout, single CTA button.

#### Trial Emails

| Trigger | When | Subject | Content |
|---|---|---|---|
| Trial reminder | Day 23 (7 days left) | "Your CoolBid trial ends in 7 days" | Recap what they've built (estimate count, catalog size). "Pick a plan to keep going." CTA → pricing page |
| Trial urgent | Day 28 (2 days left) | "2 days left on your CoolBid trial" | "Your estimates and data are safe, but you'll lose access." CTA → pricing page |
| Trial expired | Day 30 | "Your CoolBid trial has ended" | "Pick a plan to pick up where you left off. Your data is waiting." CTA → pricing page |
| Win-back | Day 37 (1 week after) | "Your estimates are still in CoolBid" | "We kept everything — [X] estimates, [Y] catalog items. Come back anytime." CTA → pricing page |

#### AI Action Limit Emails (Trial)

| Trigger | When | Subject | Content |
|---|---|---|---|
| Actions warning | 40/50 actions used | "You've used 40 of 50 trial AI actions" | "You're getting value from CoolBid. Subscribe to keep the momentum." CTA → pricing page |
| Actions exhausted | 50/50 actions used | "You've used all your trial AI actions" | "Subscribe to unlock unlimited analyses." CTA → pricing page |

#### Payment / Subscription Emails

| Trigger | When | Subject | Content |
|---|---|---|---|
| Payment failed | Immediately on failure | "Your CoolBid payment didn't go through" | "Update your card to keep access. We'll retry automatically." CTA → billing portal |
| Payment retry | 3 days after failure | "Action needed: update your payment method" | "We're still trying to process your payment." CTA → billing portal |
| Cancellation confirmed | On cancel | "Your CoolBid subscription is canceled" | "You have access until [date]. Changed your mind? Resubscribe anytime." CTA → pricing page |
| Access ending | 3 days before period end (canceled) | "Your CoolBid access ends in 3 days" | "Last chance to resubscribe and keep your team's access." CTA → pricing page |

#### Team Emails

| Trigger | When | Subject | Content |
|---|---|---|---|
| Team invite | On invite | "You're invited to join [Company] on CoolBid" | "[Owner name] invited you to their team. Sign up to start creating estimates." CTA → signup with invite token |
| Member removed | On removal | "Your access to [Company] on CoolBid has changed" | "You've been removed from the team. Your personal data is not affected." |

### Email Trigger Implementation

**Cron-based triggers (trial reminders, access ending):**

New API route: `POST /api/cron/send-retention-emails`
- Runs daily via Vercel Cron
- Queries profiles for users matching each trigger condition
- Deduplicates using a new `email_events` table (prevents re-sending on cron re-runs)
- Sends via Resend

**Event-based triggers (payment failed, cancellation, team invite, action limits):**

Triggered inline at the point of the event:
- Webhook handler sends payment failure / cancellation emails
- AI action counter sends warning / exhausted emails
- Team invite endpoint sends invite email

### Email Events Table (Deduplication)

```sql
create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  email_type text not null,
  sent_at timestamptz default now(),
  resend_id text,
  unique(user_id, email_type)
);

create index idx_email_events_user on public.email_events(user_id);
alter table public.email_events enable row level security;
```

The `unique(user_id, email_type)` constraint ensures each email type is sent at most once per user. For recurring emails (e.g., payment retry), use a composite key like `payment_retry_<stripe_invoice_id>`.

## Middleware Changes

### Subscription Gating Updates

The existing middleware checks `subscription_status` for access. Add tier-aware logic:

- `starter`, `pro`, `enterprise` with `active` status → allow access
- Existing `trialing`, `past_due` logic unchanged
- Add `subscription_tier` to the cached cookie alongside `sub_status`

### Settings Path

`/settings` remains ungated across all states (existing behavior) so users can always manage billing.

## UI Changes

### Pricing Page (`/pricing`)

Replace single PricingCard with three-column tier comparison:
- Starter / Pro (highlighted as "Most Popular") / Enterprise
- Monthly/annual toggle applies to all three
- Feature comparison grid
- "Start Free Trial" CTA on Pro column (trial is Pro-level)
- "Subscribe" CTA on Starter and Enterprise columns

### Upgrade Page (`/upgrade`)

Show all three tiers when a user is locked out. Highlight Pro as recommended. If the user had a trial, show what they built ("You created X estimates during your trial").

### Trial Banner

Update to show "Pro Trial" to reinforce that they're experiencing the full product. On expiry, messaging should reference tier options: "Your Pro trial ended. Pick a plan to continue."

### Settings Page

Add "Team" section (Pro and Enterprise only):
- List current team members with role and status
- "Invite Member" button (opens email input dialog)
- Seat count indicator for Pro ("3 of 5 seats used")
- Remove member action

### Parts Database

For Starter users:
- Gmail connect section shows locked state: "Connect Gmail to auto-import supplier quotes — available on Pro" with upgrade button
- Manual quote upload remains fully functional
- Email connection card hidden or replaced with upgrade prompt

### Navigation

No changes — all nav items remain visible regardless of tier. Feature gates are enforced at the component/API level, not by hiding navigation.

## Data Migration

For existing users (pre-tier launch):

```sql
-- Existing paid users become Pro (preserves their current access)
update public.profiles
set subscription_tier = 'pro'
where subscription_status = 'active' and subscription_tier = 'pro';

-- Trial users stay as trial (no change needed)
-- Expired/canceled users will pick a tier on resubscribe
```

No breaking changes for existing users. The Stripe subscription they already have maps to Pro pricing ($149/mo or $1,490/yr), which is unchanged.

## Stripe Customer Portal Updates

Update portal configuration to allow plan switching:
- Starter ↔ Pro ↔ Enterprise
- Stripe handles proration automatically
- Webhook `customer.subscription.updated` already syncs tier changes

## File Structure Summary

**New:**
- `src/lib/resend.ts` — Resend client
- `src/lib/emails/trial-reminder.tsx` — Trial reminder email template
- `src/lib/emails/trial-urgent.tsx` — Trial urgent email template
- `src/lib/emails/trial-expired.tsx` — Trial expired email template
- `src/lib/emails/trial-winback.tsx` — Win-back email template
- `src/lib/emails/action-warning.tsx` — AI action limit warning
- `src/lib/emails/action-exhausted.tsx` — AI actions exhausted
- `src/lib/emails/payment-failed.tsx` — Payment failure notification
- `src/lib/emails/payment-retry.tsx` — Payment retry reminder
- `src/lib/emails/cancellation.tsx` — Cancellation confirmation
- `src/lib/emails/access-ending.tsx` — Access ending warning
- `src/lib/emails/team-invite.tsx` — Team invite email
- `src/lib/emails/member-removed.tsx` — Member removal notification
- `src/app/api/cron/send-retention-emails/route.ts` — Daily retention email cron
- `src/app/api/team/invite/route.ts` — Team invite endpoint
- `src/app/api/team/members/route.ts` — Team member management
- `src/app/api/team/accept/route.ts` — Accept invite endpoint
- `src/components/settings/team-section.tsx` — Team management UI
- `src/components/settings/invite-dialog.tsx` — Invite member dialog
- `supabase/migrations/004_pricing_tiers.sql` — Teams, email_events, profile changes

**Modified:**
- `src/types/billing.ts` — New tier type, price constants
- `src/types/database.ts` — New tables, profile fields
- `src/lib/billing/access-check.ts` — Tier-aware access + `canUseFeature()`
- `src/lib/billing/ai-action-counter.ts` — Trigger action limit emails
- `src/app/api/stripe/checkout/route.ts` — Accept tier parameter
- `src/app/api/stripe/webhook/route.ts` — Sync tier from product metadata, send payment emails
- `src/app/api/auth/gmail/connect/route.ts` — Gate behind Pro+
- `src/app/api/cron/sync-emails/route.ts` — Skip Starter users
- `src/app/(marketing)/pricing/page.tsx` — Three-tier comparison layout
- `src/app/(app)/upgrade/page.tsx` — Three-tier selection
- `src/components/billing/pricing-card.tsx` — Refactor for multi-tier
- `src/components/billing/trial-banner.tsx` — "Pro Trial" messaging
- `src/components/billing/subscription-status.tsx` — Tier-aware display
- `src/components/parts-database/email-connect-button.tsx` — Starter gate
- `src/components/parts-database/email-connection-card.tsx` — Starter gate
- `src/lib/supabase/middleware.ts` — Cache tier in cookie
- `src/app/(app)/settings/page.tsx` — Add team section

## Out of Scope

- Role-based permissions within teams (all members are equal for now)
- Per-seat billing (team members don't have individual subscriptions)
- Custom/negotiated enterprise pricing (contact-us flow)
- Email preference management / unsubscribe (Resend handles this via one-click unsubscribe headers)
- SMS notifications
- In-app notification center
- Affiliate/referral program (existing `referral_source` field is sufficient for now)
