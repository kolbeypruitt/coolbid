"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { TRIAL_AI_ACTION_LIMIT } from "@/types/billing";

interface TrialProfile {
  subscription_status: string | null;
  trial_ends_at: string | null;
  ai_actions_used: number | null;
}

function daysLeft(trialEndsAt: string): number {
  const end = new Date(trialEndsAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
}

export function TrialBanner() {
  const [profile, setProfile] = useState<TrialProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoaded(true);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("subscription_status, trial_ends_at, ai_actions_used")
        .eq("id", user.id)
        .single();
      setProfile(data as TrialProfile | null);
      setLoaded(true);
    }
    load();
  }, []);

  if (!loaded || !profile || profile.subscription_status !== "trialing") {
    return null;
  }

  const days = profile.trial_ends_at ? daysLeft(profile.trial_ends_at) : 0;
  const actionsUsed = profile.ai_actions_used ?? 0;
  const isUrgent = days < 5 || actionsUsed > 40;

  return (
    <div
      className={cn(
        "sticky top-0 z-50 flex items-center justify-between px-6 py-2 text-sm",
        isUrgent
          ? "bg-warning-bg text-warning"
          : "bg-accent-glow text-accent-light"
      )}
    >
      <span>
        Pro trial — <strong>{days} day{days !== 1 ? "s" : ""} left</strong> ·{" "}
        {actionsUsed}/{TRIAL_AI_ACTION_LIMIT} AI actions used
      </span>
      <Link
        href="/upgrade"
        className="font-medium text-accent-light underline underline-offset-2 hover:no-underline"
      >
        Subscribe
      </Link>
    </div>
  );
}
