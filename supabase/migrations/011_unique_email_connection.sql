-- Prevent the same email address from being connected to multiple user accounts.
-- Each Gmail account can only be linked to one CoolBid user at a time.
create unique index if not exists idx_email_connections_unique_email
  on public.email_connections (provider, email_address);
