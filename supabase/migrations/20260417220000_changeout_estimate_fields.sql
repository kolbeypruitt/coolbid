-- supabase/migrations/20260417220000_changeout_estimate_fields.sql

ALTER TABLE estimates
  ADD COLUMN estimate_type text NOT NULL DEFAULT 'new_build',
  ADD COLUMN existing_system jsonb,
  ADD COLUMN tonnage numeric(3,1);

ALTER TABLE estimates
  ADD CONSTRAINT estimates_estimate_type_chk
    CHECK (estimate_type IN ('new_build', 'changeout'));

-- Extend system_type to support AC-only changeouts.
-- Drop any existing CHECK constraint on system_type regardless of its auto-generated name.
DO $$
DECLARE c_name text;
BEGIN
  FOR c_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'estimates'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%system_type%'
  LOOP
    EXECUTE format('ALTER TABLE estimates DROP CONSTRAINT %I', c_name);
  END LOOP;
END $$;

ALTER TABLE estimates
  ADD CONSTRAINT estimates_system_type_check
    CHECK (system_type IN ('heat_pump', 'gas_ac', 'electric', 'dual_fuel', 'ac_only'));

CREATE INDEX estimates_type_idx ON estimates (estimate_type);

COMMENT ON COLUMN estimates.estimate_type IS 'new_build uses floor-plan wizard; changeout uses the mobile equipment-replacement wizard';
COMMENT ON COLUMN estimates.existing_system IS 'Optional metadata about the system being replaced: { system_type?, tonnage?, age_years?, notes? }';
COMMENT ON COLUMN estimates.tonnage IS 'Changeout-only. New-build computes tonnage from load calc instead.';
