-- 008_pricing_tiers.sql
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
