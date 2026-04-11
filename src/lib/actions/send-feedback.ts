"use server";

import { createClient } from "@/lib/supabase/server";
import { getResend, FROM_EMAIL } from "@/lib/resend";
import { feedbackSchema, CATEGORY_LABELS, SUPPORT_EMAIL } from "@/types/feedback";
import type { FeedbackInput } from "@/types/feedback";
import { FeedbackReceivedEmail } from "@/lib/emails/feedback-received";

export type SendFeedbackResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function sendFeedback(
  input: FeedbackInput,
): Promise<SendFeedbackResult> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, reason: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "company_name, company_email, subscription_tier, subscription_status, trial_ends_at",
    )
    .eq("id", user.id)
    .single();

  if (!profile) {
    return { ok: false, reason: "Profile not found" };
  }

  const trialDay =
    profile.subscription_status === "trialing" && profile.trial_ends_at
      ? Math.max(
          1,
          30 -
            Math.ceil(
              (new Date(profile.trial_ends_at).getTime() - Date.now()) /
                (1000 * 60 * 60 * 24),
            ),
        )
      : null;

  const categoryLabel = CATEGORY_LABELS[parsed.data.category];
  const companyDisplayName = profile.company_name?.trim() || "Unknown";

  let resend: ReturnType<typeof getResend>;
  try {
    resend = getResend();
  } catch (err) {
    console.error("Resend client init failed:", err);
    return { ok: false, reason: "Email service unavailable. Please try again later." };
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: SUPPORT_EMAIL,
      replyTo: profile.company_email?.trim() || user.email || undefined,
      subject: `[CoolBid Feedback] ${categoryLabel} from ${companyDisplayName}`,
      react: FeedbackReceivedEmail({
        category: categoryLabel,
        userName: companyDisplayName,
        userEmail: user.email || "Unknown",
        companyName: profile.company_name?.trim() || "Not set",
        plan: profile.subscription_tier,
        trialDay,
        pageUrl: parsed.data.pageUrl,
        message: parsed.data.message,
      }),
    });

    if (error) {
      console.error("Failed to send feedback email:", error);
      return { ok: false, reason: "Failed to send. Please try again." };
    }
  } catch (err) {
    console.error("Feedback email send threw:", err);
    return { ok: false, reason: "Failed to send. Please try again." };
  }

  return { ok: true };
}
