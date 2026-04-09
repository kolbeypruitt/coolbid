import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { constructWebhookEvent, stripe } from "@/lib/stripe";
import type { Database } from "@/types/database";

function getServiceClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

type ProfileUpdate = {
  subscription_status?: string;
  subscription_tier?: string;
  stripe_subscription_id?: string | null;
  subscription_period_end?: string | null;
};

async function updateProfileByCustomerId(
  customerId: string,
  updates: ProfileUpdate
) {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error("Failed to update profile:", error);
    throw new Error("Database update failed");
  }
}

async function logBillingEvent(
  stripeEventId: string,
  eventType: string,
  userId: string | null,
  metadata: Record<string, unknown>
) {
  const supabase = getServiceClient();
  await supabase.from("billing_events").insert({
    user_id: userId,
    event_type: eventType,
    stripe_event_id: stripeEventId,
    metadata: metadata as never,
  });
}

async function getUserIdFromCustomer(customerId: string): Promise<string | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();
  return data?.id ?? null;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(body, signature);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: existing } = await supabase
    .from("billing_events")
    .select("id")
    .eq("stripe_event_id", event.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (customerId && subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          // In Stripe v22, current_period_end lives on SubscriptionItem
          const periodEndTs = subscription.items.data[0]?.current_period_end;
          const periodEnd = periodEndTs
            ? new Date(periodEndTs * 1000).toISOString()
            : null;

          await updateProfileByCustomerId(customerId, {
            subscription_status: "active",
            subscription_tier: "pro",
            stripe_subscription_id: subscriptionId,
            subscription_period_end: periodEnd,
          });

          const userId = await getUserIdFromCustomer(customerId);
          await logBillingEvent(event.id, "subscribed", userId, {
            subscription_id: subscriptionId,
            customer_id: customerId,
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const periodEndTs = subscription.items.data[0]?.current_period_end;
        const periodEnd = periodEndTs
          ? new Date(periodEndTs * 1000).toISOString()
          : null;

        await updateProfileByCustomerId(customerId, {
          subscription_status: subscription.status,
          subscription_period_end: periodEnd,
        });

        const userId = await getUserIdFromCustomer(customerId);
        await logBillingEvent(event.id, "subscription_updated", userId, {
          status: subscription.status,
          subscription_id: subscription.id,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await updateProfileByCustomerId(customerId, {
          subscription_status: "canceled",
        });

        const userId = await getUserIdFromCustomer(customerId);
        await logBillingEvent(event.id, "canceled", userId, {
          subscription_id: subscription.id,
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await updateProfileByCustomerId(customerId, {
          subscription_status: "past_due",
        });

        const userId = await getUserIdFromCustomer(customerId);
        await logBillingEvent(event.id, "payment_failed", userId, {
          invoice_id: invoice.id,
          amount_due: invoice.amount_due,
        });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await updateProfileByCustomerId(customerId, {
          subscription_status: "active",
        });

        const userId = await getUserIdFromCustomer(customerId);
        await logBillingEvent(event.id, "subscription_updated", userId, {
          invoice_id: invoice.id,
          amount_paid: invoice.amount_paid,
        });
        break;
      }

      default:
        await logBillingEvent(event.id, event.type, null, {});
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
