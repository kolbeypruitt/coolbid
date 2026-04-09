import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { TRIAL_AI_ACTION_LIMIT } from "@/types/billing";

type Client = SupabaseClient<Database>;

export type AiActionCheckResult =
  | { allowed: true; shouldIncrement: boolean }
  | { allowed: false; reason: "trial_limit" | "locked_out" | "unknown" };

export async function checkAiActionLimit(
  supabase: Client,
  userId: string
): Promise<AiActionCheckResult> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("subscription_status, ai_actions_used, trial_ends_at")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    return { allowed: false, reason: "unknown" };
  }

  if (profile.subscription_status === "active" || profile.subscription_status === "past_due") {
    return { allowed: true, shouldIncrement: false };
  }

  if (profile.subscription_status === "trialing") {
    const trialExpired = profile.trial_ends_at
      ? new Date(profile.trial_ends_at) < new Date()
      : false;

    if (trialExpired) {
      return { allowed: false, reason: "trial_limit" };
    }

    if (profile.ai_actions_used >= TRIAL_AI_ACTION_LIMIT) {
      return { allowed: false, reason: "trial_limit" };
    }

    return { allowed: true, shouldIncrement: true };
  }

  return { allowed: false, reason: "locked_out" };
}

export async function incrementAiActionCount(
  supabase: Client,
  userId: string
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("ai_actions_used")
    .eq("id", userId)
    .single();

  if (!profile) return;

  await supabase
    .from("profiles")
    .update({ ai_actions_used: profile.ai_actions_used + 1 })
    .eq("id", userId);
}
