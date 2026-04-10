-- Add is_active toggle for starter supplier visibility
alter table suppliers
  add column is_active boolean not null default true;
