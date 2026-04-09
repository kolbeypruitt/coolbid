-- ============================================================
-- 003_billing.sql  —  CoolBid Billing V3 Schema
-- ============================================================

-- ============================================================
-- ALTER profiles: extend trial, add billing & referral fields
-- ============================================================
alter table profiles
  alter column trial_ends_at set default (now() + interval '30 days');

alter table profiles
  add column ai_actions_used         int         not null default 0,
  add column stripe_subscription_id  text,
  add column subscription_period_end timestamptz,
  add column referral_source         text,
  add column referral_code           text;

-- ============================================================
-- billing_events
-- ============================================================
create table billing_events (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        references profiles(id) on delete cascade,
  event_type      text        not null,
  stripe_event_id text        unique,
  metadata        jsonb       not null default '{}',
  created_at      timestamptz not null default now()
);

create index on billing_events (user_id);
create index on billing_events (stripe_event_id);

alter table billing_events enable row level security;

create policy "Users can read own billing events"
  on billing_events for select
  using (auth.uid() = user_id);
