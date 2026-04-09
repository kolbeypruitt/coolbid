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
