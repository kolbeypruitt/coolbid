import Stripe from "stripe";
import type { BillingInterval, SubscriptionTier } from "@/types/billing";

type PaidTier = Exclude<SubscriptionTier, "trial">;

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    stripeClient = new Stripe(key, { apiVersion: "2026-03-25.dahlia", typescript: true });
  }
  return stripeClient;
}

export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return Reflect.get(getStripe(), prop as string);
  },
});

export function getPriceId(tier: PaidTier, interval: BillingInterval): string {
  const envMap: Record<string, string | undefined> = {
    "starter-month": process.env.STRIPE_PRICE_STARTER_MONTHLY?.trim(),
    "starter-year": process.env.STRIPE_PRICE_STARTER_ANNUAL?.trim(),
    "pro-month": process.env.STRIPE_PRICE_PRO_MONTHLY?.trim(),
    "pro-year": process.env.STRIPE_PRICE_PRO_ANNUAL?.trim(),
    "enterprise-month": process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY?.trim(),
    "enterprise-year": process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL?.trim(),
  };
  const key = `${tier}-${interval}`;
  const priceId = envMap[key];
  if (!priceId) throw new Error(`Missing Stripe price ID for ${key}`);
  return priceId;
}

type CreateCheckoutParams = {
  customerId: string;
  tier: PaidTier;
  interval: BillingInterval;
  userId: string;
  successUrl: string;
  cancelUrl: string;
};

export async function createCheckoutSession(params: CreateCheckoutParams) {
  return getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: params.customerId,
    line_items: [{ price: getPriceId(params.tier, params.interval), quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    allow_promotion_codes: true,
    metadata: { user_id: params.userId, tier: params.tier },
    subscription_data: { metadata: { user_id: params.userId, tier: params.tier } },
  });
}

type CreatePortalParams = { customerId: string; returnUrl: string };

export async function createPortalSession(params: CreatePortalParams) {
  return getStripe().billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
}

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return getStripe().webhooks.constructEvent(payload, signature, secret);
}

type CreateCustomerParams = { email: string; userId: string; companyName?: string };

export async function createStripeCustomer(params: CreateCustomerParams) {
  return getStripe().customers.create({
    email: params.email,
    name: params.companyName,
    metadata: { user_id: params.userId },
  });
}
