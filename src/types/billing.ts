export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

export type SubscriptionTier = "trial" | "starter" | "pro" | "enterprise";

export type BillingInterval = "month" | "year";

export type BillingEventType =
  | "signup"
  | "trial_started"
  | "subscribed"
  | "canceled"
  | "payment_failed"
  | "trial_expired"
  | "subscription_updated";

export type AccessState = {
  canAccess: boolean;
  reason: "trialing" | "active" | "past_due" | "trial_expired" | "canceled" | "locked_out";
  tier: SubscriptionTier;
  trialDaysLeft?: number;
  aiActionsRemaining?: number;
  subscriptionPeriodEnd?: string;
};

export type GatedFeature = "gmail_sync" | "team_invites";

export const TRIAL_AI_ACTION_LIMIT = 50;
export const TRIAL_DAYS = 30;

export const STARTER_MONTHLY_PRICE = 79;
export const STARTER_ANNUAL_PRICE = 790;
export const PRO_MONTHLY_PRICE = 149;
export const PRO_ANNUAL_PRICE = 1490;
export const ENTERPRISE_MONTHLY_PRICE = 250;
export const ENTERPRISE_ANNUAL_PRICE = 2500;

export const PRO_TEAM_SEAT_LIMIT = 5;

export function canUseFeature(tier: SubscriptionTier, feature: GatedFeature): boolean {
  if (feature === "gmail_sync") return tier === "pro" || tier === "enterprise" || tier === "trial";
  if (feature === "team_invites") return tier === "pro" || tier === "enterprise";
  return false;
}
