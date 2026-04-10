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
