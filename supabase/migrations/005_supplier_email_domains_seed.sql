-- 005_supplier_email_domains_seed.sql
-- Seed known email domains for starter suppliers via a helper function.
-- Called from onboarding after each supplier is inserted.

-- Known domains for HVAC starter suppliers (best-guess based on public websites)
-- Johnstone Supply: johnstonesupply.com
-- Sanders Supply: sanders-supply.com
-- Shearer Supply: shearersupply.com
-- Locke Supply: lockesupply.com
-- Amsco Supply: amscosupply.com

create or replace function public.seed_starter_supplier_domains(
  p_user_id uuid,
  p_supplier_id uuid,
  p_supplier_name text
)
returns void as $$
declare
  known_domains text[];
begin
  known_domains := case p_supplier_name
    when 'Johnstone Supply' then array['johnstonesupply.com']
    when 'Sanders Supply'   then array['sanders-supply.com', 'sanderssupply.com']
    when 'Shearer Supply'   then array['shearersupply.com']
    when 'Locke Supply'     then array['lockesupply.com', 'locke.com']
    when 'Amsco Supply'     then array['amscosupply.com']
    else array[]::text[]
  end;

  if array_length(known_domains, 1) > 0 then
    insert into public.supplier_email_domains (user_id, supplier_id, domain, is_starter)
    select p_user_id, p_supplier_id, unnest(known_domains), true;
  end if;
end;
$$ language plpgsql security definer;
