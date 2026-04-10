import type { AccessState, SubscriptionStatus, SubscriptionTier } from "@/types/billing";
import { TRIAL_AI_ACTION_LIMIT } from "@/types/billing";

type ProfileForAccessCheck = {
  subscription_status: string;
  subscription_tier: string;
  trial_ends_at: string | null;
  ai_actions_used: number;
  subscription_period_end: string | null;
};

export function getAccessState(profile: ProfileForAccessCheck): AccessState {
  const status = profile.subscription_status as SubscriptionStatus;
  const tier = (profile.subscription_tier ?? "trial") as SubscriptionTier;
  const now = new Date();

  if (status === "trialing") {
    const trialEnds = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
    const trialExpired = trialEnds ? trialEnds < now : false;
    const usageExhausted = profile.ai_actions_used >= TRIAL_AI_ACTION_LIMIT;

    if (trialExpired) {
      return { canAccess: false, reason: "trial_expired", tier };
    }

    const trialDaysLeft = trialEnds
      ? Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;
    const aiActionsRemaining = Math.max(0, TRIAL_AI_ACTION_LIMIT - profile.ai_actions_used);

    return {
      canAccess: !usageExhausted,
      reason: usageExhausted ? "locked_out" : "trialing",
      tier,
      trialDaysLeft,
      aiActionsRemaining,
    };
  }

  if (status === "active" || status === "past_due") {
    return {
      canAccess: true,
      reason: status,
      tier,
      subscriptionPeriodEnd: profile.subscription_period_end ?? undefined,
    };
  }

  if (status === "canceled") {
    return { canAccess: false, reason: "canceled", tier };
  }

  if (status === "expired") {
    return { canAccess: false, reason: "trial_expired", tier };
  }

  return { canAccess: false, reason: "locked_out", tier };
}

export function isLockedStatus(status: string): boolean {
  return status === "canceled" || status === "expired";
}
