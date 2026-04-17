-- Supabase defaults the authenticated role's statement_timeout to 8s, which
-- is too tight for the existing loadBomCatalog query path (10k-row fetch with
-- a 26-condition OR on unindexed category_path/category_leaf). Until that
-- helper is rewritten to filter by the bom_slot partial index, raise the
-- ceiling so queries complete instead of cancelling.
--
-- Scope: authenticated role only — anon and service_role keep Supabase
-- defaults. Reversible with `ALTER ROLE authenticated RESET statement_timeout;`.
ALTER ROLE authenticated SET statement_timeout = '30s';
