"use client";

import { MessageSquare } from "lucide-react";
import { useFeedbackStore } from "@/stores/feedback-store";

export function FeedbackWidget() {
  const open = useFeedbackStore((s) => s.open);

  return (
    <button
      onClick={() => open()}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-gradient-brand px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      aria-label="Send feedback"
    >
      <MessageSquare className="h-4 w-4" />
      <span className="hidden md:inline">Feedback</span>
    </button>
  );
}
