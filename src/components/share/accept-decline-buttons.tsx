"use client";

import { useTransition, useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { respondToEstimate } from "@/lib/share/respond";

export function AcceptDeclineButtons({
  token,
  estimateStatus,
}: {
  token: string;
  estimateStatus: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [localStatus, setLocalStatus] = useState(estimateStatus);

  if (localStatus === "accepted") {
    return (
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-6 py-4">
          <Check className="h-5 w-5 text-green-500" />
          <div>
            <p className="font-semibold text-green-500">Estimate Accepted</p>
            <p className="text-sm text-txt-secondary">
              Your contractor has been notified
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (localStatus === "declined") {
    return (
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-6 py-4">
          <X className="h-5 w-5 text-red-500" />
          <div>
            <p className="font-semibold text-red-500">Estimate Declined</p>
            <p className="text-sm text-txt-secondary">
              Your contractor has been notified
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (localStatus !== "sent") return null;

  function handleRespond(decision: "accepted" | "declined") {
    startTransition(async () => {
      const result = await respondToEstimate(token, decision);
      if (result.ok) {
        setLocalStatus(decision);
      }
    });
  }

  return (
    <div className="flex items-center justify-center gap-3">
      <button
        onClick={() => handleRespond("accepted")}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-8 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(6,182,212,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(6,182,212,0.35)] disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        Accept Estimate
      </button>
      <button
        onClick={() => handleRespond("declined")}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-8 py-3 text-sm font-medium text-txt-secondary transition-colors hover:border-red-500/30 hover:text-red-400 disabled:opacity-50"
      >
        Decline
      </button>
    </div>
  );
}
