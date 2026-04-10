import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getResend, FROM_EMAIL } from "@/lib/resend";
import { TrialReminderEmail } from "@/lib/emails/trial-reminder";
import { TrialExpiredEmail } from "@/lib/emails/trial-expired";
import type { Database } from "@/types/database";

function getServiceClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "https://coolbid.app";

type EmailJob = {
  userId: string;
  email: string;
  emailType: string;
  render: () => React.ReactElement;
  subject: string;
};

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const resend = getResend();
  const now = new Date();
  const jobs: EmailJob[] = [];

  // 1. Trial reminder — 7 days left
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sixDaysFromNow = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);

  const { data: reminder7 } = await supabase
    .from("profiles")
    .select("id, company_email, trial_ends_at")
    .eq("subscription_status", "trialing")
    .gte("trial_ends_at", sixDaysFromNow.toISOString())
    .lte("trial_ends_at", sevenDaysFromNow.toISOString());

  for (const p of reminder7 ?? []) {
    if (!p.company_email) continue;
    const estimateCount = await getCount(supabase, "estimates", p.id);
    const catalogCount = await getCount(supabase, "equipment_catalog", p.id);
    jobs.push({
      userId: p.id,
      email: p.company_email,
      emailType: "trial_reminder_7d",
      subject: "Your CoolBid trial ends in 7 days",
      render: () =>
        TrialReminderEmail({
          daysLeft: 7,
          estimateCount,
          catalogCount,
          pricingUrl: `${APP_URL}/pricing`,
        }),
    });
  }

  // 2. Trial urgent — 2 days left
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

  const { data: reminder2 } = await supabase
    .from("profiles")
    .select("id, company_email, trial_ends_at")
    .eq("subscription_status", "trialing")
    .gte("trial_ends_at", oneDayFromNow.toISOString())
    .lte("trial_ends_at", twoDaysFromNow.toISOString());

  for (const p of reminder2 ?? []) {
    if (!p.company_email) continue;
    const estimateCount = await getCount(supabase, "estimates", p.id);
    const catalogCount = await getCount(supabase, "equipment_catalog", p.id);
    jobs.push({
      userId: p.id,
      email: p.company_email,
      emailType: "trial_reminder_2d",
      subject: "2 days left on your CoolBid trial",
      render: () =>
        TrialReminderEmail({
          daysLeft: 2,
          estimateCount,
          catalogCount,
          pricingUrl: `${APP_URL}/pricing`,
        }),
    });
  }

  // 3. Trial expired — within last 24h
  const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

  const { data: expired } = await supabase
    .from("profiles")
    .select("id, company_email, trial_ends_at")
    .in("subscription_status", ["trialing", "expired"])
    .gte("trial_ends_at", oneDayAgo.toISOString())
    .lte("trial_ends_at", now.toISOString());

  for (const p of expired ?? []) {
    if (!p.company_email) continue;
    const estimateCount = await getCount(supabase, "estimates", p.id);
    const catalogCount = await getCount(supabase, "equipment_catalog", p.id);
    jobs.push({
      userId: p.id,
      email: p.company_email,
      emailType: "trial_expired",
      subject: "Your CoolBid trial has ended",
      render: () =>
        TrialExpiredEmail({
          estimateCount,
          catalogCount,
          pricingUrl: `${APP_URL}/pricing`,
        }),
    });
  }

  // 4. Win-back — 7 days after expiry
  const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const { data: winback } = await supabase
    .from("profiles")
    .select("id, company_email, trial_ends_at")
    .in("subscription_status", ["expired", "trialing"])
    .gte("trial_ends_at", eightDaysAgo.toISOString())
    .lte("trial_ends_at", sevenDaysAgo.toISOString());

  for (const p of winback ?? []) {
    if (!p.company_email) continue;
    const estimateCount = await getCount(supabase, "estimates", p.id);
    const catalogCount = await getCount(supabase, "equipment_catalog", p.id);
    jobs.push({
      userId: p.id,
      email: p.company_email,
      emailType: "trial_winback",
      subject: "Your estimates are still in CoolBid",
      render: () =>
        TrialExpiredEmail({
          estimateCount,
          catalogCount,
          pricingUrl: `${APP_URL}/pricing`,
          isWinback: true,
        }),
    });
  }

  // 5. Access ending — canceled, 3 days before period end
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const { data: accessEnding } = await supabase
    .from("profiles")
    .select("id, company_email, subscription_period_end")
    .eq("subscription_status", "canceled")
    .gte("subscription_period_end", twoDaysFromNow.toISOString())
    .lte("subscription_period_end", threeDaysFromNow.toISOString());

  for (const p of accessEnding ?? []) {
    if (!p.company_email) continue;
    jobs.push({
      userId: p.id,
      email: p.company_email,
      emailType: "access_ending",
      subject: "Your CoolBid access ends in 3 days",
      render: () =>
        TrialReminderEmail({
          daysLeft: 3,
          estimateCount: 0,
          catalogCount: 0,
          pricingUrl: `${APP_URL}/pricing`,
        }),
    });
  }

  // Send all jobs, deduplicated via email_events
  let sent = 0;
  let skipped = 0;

  for (const job of jobs) {
    const { data: existing } = await supabase
      .from("email_events")
      .select("id")
      .eq("user_id", job.userId)
      .eq("email_type", job.emailType)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    try {
      const { data } = await resend.emails.send({
        from: FROM_EMAIL,
        to: job.email,
        subject: job.subject,
        react: job.render(),
      });

      const { error: insertError } = await supabase.from("email_events").insert({
        user_id: job.userId,
        email_type: job.emailType,
        resend_id: data?.id ?? null,
      });

      if (insertError) {
        console.error(`Failed to record email_event for ${job.emailType} / ${job.userId}:`, insertError);
      }

      sent++;
    } catch (err) {
      console.error(`Failed to send ${job.emailType} to ${job.email}:`, err);
    }
  }

  return NextResponse.json({ sent, skipped, total: jobs.length });
}

async function getCount(
  supabase: ReturnType<typeof getServiceClient>,
  table: "estimates" | "equipment_catalog",
  userId: string
): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}
