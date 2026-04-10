-- ============================================================================
-- Estimate acceptance: homeowner accept/decline timestamps
-- ============================================================================

-- Acceptance/decline timestamps on estimates
alter table estimates
  add column accepted_at  timestamptz,
  add column declined_at  timestamptz;

-- Track which share link was used to respond
alter table estimate_shares
  add column responded_at timestamptz;
