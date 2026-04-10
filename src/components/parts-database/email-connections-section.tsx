"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { canUseFeature } from "@/types/billing";
import type { SubscriptionTier } from "@/types/billing";
import { EmailConnectButton } from "./email-connect-button";
import { EmailConnectionCard } from "./email-connection-card";
import type { EmailConnection } from "@/types/email-connection";

export function EmailConnectionsSection() {
  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [tier, setTier] = useState<SubscriptionTier>("trial");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    async function load() {
      const [connectionsResult, userResult] = await Promise.all([
        supabase
          .from("email_connections")
          .select("*")
          .order("connected_at", { ascending: false }),
        supabase.auth.getUser(),
      ]);

      const user = userResult.data?.user ?? null;

      let resolvedTier: SubscriptionTier = "trial";
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("subscription_tier")
          .eq("id", user.id)
          .single();
        resolvedTier = (profile?.subscription_tier ?? "trial") as SubscriptionTier;
      }

      if (!mounted) return;
      setConnections((connectionsResult.data ?? []) as EmailConnection[]);
      setTier(resolvedTier);
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, []);

  function handleDisconnect(id: string) {
    setConnections((prev) => prev.filter((c) => c.id !== id));
  }

  if (loading) return null;

  const canSync = canUseFeature(tier, "gmail_sync");

  // Starter users see upgrade prompt instead of connect button
  if (!canSync) {
    return (
      <section aria-labelledby="email-connections-heading" className="space-y-3">
        <h2 id="email-connections-heading" className="text-lg font-semibold text-txt-primary">Email Connections</h2>
        <div className="rounded-lg border border-border bg-gradient-card p-6 text-center space-y-3">
          <Lock aria-hidden="true" className="mx-auto h-8 w-8 text-txt-tertiary" />
          <p className="text-txt-secondary">
            Connect Gmail to automatically discover supplier quotes — available on Pro and Enterprise.
          </p>
          <Link
            href="/upgrade"
            className={cn(buttonVariants({ size: "sm" }), "bg-gradient-brand hover-lift")}
          >
            Upgrade to Pro
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="email-connections-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="email-connections-heading" className="text-lg font-semibold text-txt-primary">Email Connections</h2>
        {connections.length === 0 && <EmailConnectButton />}
      </div>
      {connections.length === 0 ? (
        <div className="rounded-lg border border-border bg-gradient-card p-6 text-center">
          <p className="text-txt-secondary">
            Connect your email to automatically discover supplier quotes.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map((c) => (
            <EmailConnectionCard
              key={c.id}
              initialConnection={c}
              onDisconnect={() => handleDisconnect(c.id)}
            />
          ))}
          <div className="pt-1">
            <EmailConnectButton />
          </div>
        </div>
      )}
    </section>
  );
}
