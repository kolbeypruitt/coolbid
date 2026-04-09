export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

export type SubscriptionTier = "trial" | "pro";

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
  trialDaysLeft?: number;
  aiActionsRemaining?: number;
  subscriptionPeriodEnd?: string;
};

export const TRIAL_AI_ACTION_LIMIT = 50;
export const TRIAL_DAYS = 30;

export const PRO_MONTHLY_PRICE = 149;
export const PRO_ANNUAL_PRICE = 1490;
