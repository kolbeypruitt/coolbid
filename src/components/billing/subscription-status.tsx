"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { TRIAL_AI_ACTION_LIMIT } from "@/types/billing";
import type { SubscriptionStatus } from "@/types/billing";

interface StatusProfile {
  subscription_status: SubscriptionStatus | null;
  trial_ends_at: string | null;
  subscription_period_end: string | null;
  ai_actions_used: number | null;
}

function daysLeft(trialEndsAt: string): number {
  const end = new Date(trialEndsAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
}

const badgeVariantMap: Record<SubscriptionStatus, "secondary" | "default" | "destructive" | "outline"> = {
  trialing: "secondary",
  active: "default",
  past_due: "destructive",
  canceled: "outline",
  expired: "outline",
};

const badgeClassMap: Record<SubscriptionStatus, string> = {
  trialing: "bg-accent-glow text-accent-light border-none",
  active: "bg-success-bg text-success border-none",
  past_due: "bg-error-bg text-error border-none",
  canceled: "bg-bg-elevated text-txt-tertiary border border-border",
  expired: "bg-bg-elevated text-txt-tertiary border border-border",
};

export function SubscriptionStatus() {
  const [profile, setProfile] = useState<StatusProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("subscription_status, trial_ends_at, subscription_period_end, ai_actions_used")
        .eq("id", user.id)
        .single();
      setProfile(data as StatusProfile | null);
      setLoading(false);
    }
    load();
  }, []);

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      }
    } finally {
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <Card className="bg-gradient-card border-b-accent">
        <CardHeader>
          <CardTitle className="text-txt-primary">Subscription</CardTitle>
          <CardDescription>Your current plan and billing details.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  const status = profile?.subscription_status ?? null;

  return (
    <Card className="bg-gradient-card border-b-accent">
      <CardHeader>
        <CardTitle className="text-txt-primary">Subscription</CardTitle>
        <CardDescription>Your current plan and billing details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && (
          <Badge variant={badgeVariantMap[status]} className={badgeClassMap[status]}>
            {status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ")}
          </Badge>
        )}

        {status === "trialing" && (
          <>
            <p className="text-sm text-txt-primary">
              Free trial active &middot;{" "}
              <strong className="text-txt-secondary">
                {profile?.trial_ends_at ? daysLeft(profile.trial_ends_at) : 0} days remaining
              </strong>{" "}
              &middot; <span className="text-txt-secondary">{profile?.ai_actions_used ?? 0}/{TRIAL_AI_ACTION_LIMIT} AI actions used</span>
            </p>
            <Link href="/upgrade" className={cn(buttonVariants({ size: "sm" }), "bg-gradient-brand hover-lift")}>
              Upgrade to Pro
            </Link>
          </>
        )}

        {status === "active" && (
          <>
            <p className="text-sm text-txt-primary">
              Pro subscription active
              {profile?.subscription_period_end
                ? <span className="text-txt-secondary">{` · Renews ${new Date(profile.subscription_period_end).toLocaleDateString()}`}</span>
                : ""}
            </p>
            <Button size="sm" className="bg-gradient-brand hover-lift" onClick={openPortal} disabled={portalLoading}>
              {portalLoading ? "Loading..." : "Manage Billing"}
            </Button>
          </>
        )}

        {status === "past_due" && (
          <>
            <p className="text-sm text-error">
              Payment failed — retry in progress
            </p>
            <Button size="sm" className="bg-gradient-brand hover-lift" onClick={openPortal} disabled={portalLoading}>
              {portalLoading ? "Loading..." : "Update Payment Method"}
            </Button>
          </>
        )}

        {(status === "canceled" || status === "expired") && (
          <>
            <p className="text-sm text-txt-primary">
              Subscription {status}
            </p>
            <Link href="/upgrade" className={cn(buttonVariants({ size: "sm" }), "bg-gradient-brand hover-lift")}>
              Resubscribe
            </Link>
          </>
        )}

        {!status && (
          <p className="text-sm text-muted-foreground">No active subscription.</p>
        )}
      </CardContent>
    </Card>
  );
}
