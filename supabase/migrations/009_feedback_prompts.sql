-- 009_feedback_prompts.sql
-- Add JSONB column to track which feedback prompts a user has seen/dismissed

alter table public.profiles
  add column if not exists feedback_prompts_seen jsonb not null default '{}';

comment on column public.profiles.feedback_prompts_seen is
  'Tracks dismissed contextual feedback prompts: { "first_estimate": true, "mid_trial": true, "trial_expiring": true }';
