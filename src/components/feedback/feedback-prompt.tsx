"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useFeedbackStore } from "@/stores/feedback-store";

interface FeedbackPromptProps {
  promptKey: "first_estimate" | "mid_trial" | "trial_expiring";
  message: string;
  show: boolean;
  feedbackPromptsSeen: Record<string, boolean>;
}

export function FeedbackPrompt({
  promptKey,
  message,
  show,
  feedbackPromptsSeen,
}: FeedbackPromptProps) {
  const alreadySeen = feedbackPromptsSeen[promptKey] ?? false;
  const [dismissed, setDismissed] = useState(alreadySeen);
  const open = useFeedbackStore((s) => s.open);

  async function dismiss() {
    setDismissed(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Re-read current state to avoid overwriting concurrent dismissals
    const { data } = await supabase
      .from("profiles")
      .select("feedback_prompts_seen")
      .eq("id", user.id)
      .single();

    const current = (data?.feedback_prompts_seen as Record<string, boolean>) ?? {};
    await supabase
      .from("profiles")
      .update({
        feedback_prompts_seen: { ...current, [promptKey]: true },
      })
      .eq("id", user.id);
  }

  if (!show || dismissed) return null;

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-accent-glow px-4 py-3 text-sm text-accent-light">
      <span>{message}</span>
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            open();
            dismiss();
          }}
          className="font-medium underline underline-offset-2 hover:no-underline"
        >
          Share Feedback
        </button>
        <button
          onClick={dismiss}
          className="text-accent-light/60 transition-colors hover:text-accent-light"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
