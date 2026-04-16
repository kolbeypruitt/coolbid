"use client";

import { useState } from "react";
import { PricingCard } from "@/components/billing/pricing-card";
import type { BillingInterval } from "@/types/billing";

export default function UpgradePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe(tier: "starter" | "pro" | "enterprise", interval: BillingInterval) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error ?? "Failed to start checkout. Please try again.");
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background max-w-6xl mx-auto py-12 px-6 space-y-6">
      <div className="max-w-lg mx-auto text-center space-y-2">
        <h1 className="text-3xl font-bold text-txt-primary">Subscribe to continue</h1>
        <p className="text-txt-secondary">
          Your trial has ended or you&apos;ve reached the usage limit. Subscribe to keep using
          CoolBid with no restrictions.
        </p>
      </div>

      {error && (
        <div className="max-w-lg mx-auto rounded-lg border border-error bg-error-bg p-4 text-sm text-error">
          {error}
        </div>
      )}

      <PricingCard onSubscribe={handleSubscribe} isLoading={loading} />
    </div>
  );
}
