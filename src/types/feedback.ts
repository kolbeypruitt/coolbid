import { z } from "zod";

export const FEEDBACK_CATEGORIES = [
  "general",
  "feature_request",
  "bug_report",
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  general: "General Feedback",
  feature_request: "Feature Request",
  bug_report: "Bug Report",
};

export const CATEGORY_PLACEHOLDERS: Record<FeedbackCategory, string> = {
  general: "What's on your mind?",
  feature_request: "What would you like to see?",
  bug_report: "What went wrong?",
};

export const feedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  message: z.string().trim().min(1, "Please enter a message").max(5000),
  pageUrl: z.string(),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;

export const SUPPORT_EMAIL = "kolbey@coolbid.app";
export const SUPPORT_PHONE = "(918) 290-1127";
export const SUPPORT_PHONE_TEL = "+19182901127";
