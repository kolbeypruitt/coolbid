"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, X } from "lucide-react";
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
import {
  type BillingInterval,
  type SubscriptionTier,
  STARTER_MONTHLY_PRICE,
  STARTER_ANNUAL_PRICE,
  PRO_MONTHLY_PRICE,
  PRO_ANNUAL_PRICE,
  ENTERPRISE_MONTHLY_PRICE,
  ENTERPRISE_ANNUAL_PRICE,
} from "@/types/billing";

type PaidTier = Exclude<SubscriptionTier, "trial">;

type TierDef = {
  tier: PaidTier;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  features: { label: string; included: boolean }[];
  highlight?: boolean;
  badge?: string;
  icon: string;
};

const TIERS: TierDef[] = [
  {
    tier: "starter",
    name: "Starter",
    description: "For solo contractors getting started.",
    monthlyPrice: STARTER_MONTHLY_PRICE,
    annualPrice: STARTER_ANNUAL_PRICE,
    icon: "/brand/tiers/starter.svg",
    features: [
      { label: "1 user", included: true },
      { label: "Unlimited estimates & AI analysis", included: true },
      { label: "Equipment catalog", included: true },
      { label: "Manual quote upload + AI parsing", included: true },
      { label: "Gmail sync & auto-mining", included: false },
      { label: "Team invites", included: false },
      { label: "Priority support", included: false },
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    description: "For growing teams that need automation.",
    monthlyPrice: PRO_MONTHLY_PRICE,
    annualPrice: PRO_ANNUAL_PRICE,
    highlight: true,
    badge: "Most Popular",
    icon: "/brand/tiers/pro.svg",
    features: [
      { label: "Up to 5 team members", included: true },
      { label: "Unlimited estimates & AI analysis", included: true },
      { label: "Equipment catalog", included: true },
      { label: "Manual quote upload + AI parsing", included: true },
      { label: "Gmail sync & auto-mining", included: true },
      { label: "Team invites (up to 5)", included: true },
      { label: "Priority support", included: true },
    ],
  },
  {
    tier: "enterprise",
    name: "Enterprise",
    description: "For large operations with unlimited seats.",
    monthlyPrice: ENTERPRISE_MONTHLY_PRICE,
    annualPrice: ENTERPRISE_ANNUAL_PRICE,
    icon: "/brand/tiers/enterprise.svg",
    features: [
      { label: "Unlimited team members", included: true },
      { label: "Unlimited estimates & AI analysis", included: true },
      { label: "Equipment catalog", included: true },
      { label: "Manual quote upload + AI parsing", included: true },
      { label: "Gmail sync & auto-mining", included: true },
      { label: "Team invites (unlimited)", included: true },
      { label: "Dedicated support", included: true },
    ],
  },
];

interface PricingCardsProps {
  onSubscribe?: (tier: PaidTier, interval: BillingInterval) => void;
  isLoading?: boolean;
  loadingTier?: string;
}

export function PricingCards({ onSubscribe, isLoading, loadingTier }: PricingCardsProps) {
  const [interval, setInterval] = useState<BillingInterval>("month");

  const isAnnual = interval === "year";

  return (
    <div className="space-y-6">
      {/* Interval toggle */}
      <div className="flex justify-center">
        <div className="flex rounded-md bg-bg-input p-1">
          <button
            type="button"
            onClick={() => setInterval("month")}
            className={cn(
              "rounded-sm px-4 py-2 text-sm font-medium",
              interval === "month"
                ? "bg-gradient-brand text-white shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                : "text-txt-secondary hover:text-txt-primary"
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("year")}
            className={cn(
              "rounded-sm px-4 py-2 text-sm font-medium",
              interval === "year"
                ? "bg-gradient-brand text-white shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                : "text-txt-secondary hover:text-txt-primary"
            )}
          >
            Annual
          </button>
        </div>
      </div>

      {/* Tier cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {TIERS.map((t) => {
          const price = isAnnual ? t.annualPrice : t.monthlyPrice;
          const monthlyEquiv = isAnnual ? Math.round(t.annualPrice / 12) : null;
          const savings = isAnnual ? t.monthlyPrice * 12 - t.annualPrice : 0;

          return (
            <Card
              key={t.tier}
              className={cn(
                "bg-gradient-card flex flex-col",
                t.highlight
                  ? "border-b-accent shadow-[0_0_28px_rgba(6,182,212,0.1)] ring-1 ring-accent-light/20"
                  : "border-border"
              )}
            >
              <CardHeader>
                <Image
                  src={t.icon}
                  alt={`${t.name} tier`}
                  width={64}
                  height={64}
                  className="mb-2 rounded-xl"
                />
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl text-txt-primary">{t.name}</CardTitle>
                  {t.badge && (
                    <Badge variant="secondary" className="bg-accent-glow text-accent-light border-none">
                      {t.badge}
                    </Badge>
                  )}
                  {isAnnual && savings > 0 && (
                    <Badge variant="secondary" className="bg-success-bg text-success border-none">
                      Save ${savings}
                    </Badge>
                  )}
                </div>
                <CardDescription>{t.description}</CardDescription>

                {/* Price */}
                <div className="pt-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-gradient-brand tracking-tighter">
                      ${price}
                    </span>
                    <span className="text-txt-tertiary text-sm">
                      {isAnnual ? "/year" : "/month"}
                    </span>
                  </div>
                  {monthlyEquiv && (
                    <p className="text-txt-tertiary text-sm mt-0.5">
                      ${monthlyEquiv}/month billed annually
                    </p>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex flex-col flex-1 space-y-4">
                {/* Features */}
                <ul className="space-y-2 flex-1">
                  {t.features.map((f) => (
                    <li key={f.label} className="flex items-center gap-2 text-sm">
                      {f.included ? (
                        <Check className="h-4 w-4 text-accent-light shrink-0" />
                      ) : (
                        <X className="h-4 w-4 text-txt-tertiary shrink-0" />
                      )}
                      <span className={f.included ? "text-txt-secondary" : "text-txt-tertiary"}>
                        {f.label}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {onSubscribe ? (
                  <Button
                    className={cn(
                      "w-full",
                      t.highlight
                        ? "bg-gradient-brand hover-lift"
                        : "bg-bg-elevated text-txt-primary hover:bg-bg-input"
                    )}
                    onClick={() => onSubscribe(t.tier, interval)}
                    disabled={isLoading}
                  >
                    {isLoading && loadingTier === t.tier ? "Redirecting..." : "Subscribe"}
                  </Button>
                ) : (
                  <Link
                    href="/auth/signup"
                    className={cn(
                      buttonVariants(),
                      "w-full justify-center",
                      t.highlight
                        ? "bg-gradient-brand hover-lift"
                        : "bg-bg-elevated text-txt-primary hover:bg-bg-input"
                    )}
                  >
                    {t.tier === "pro" ? "Start Free Trial" : "Get Started"}
                  </Link>
                )}

                {t.tier === "pro" && !onSubscribe && (
                  <p className="text-center text-txt-tertiary text-xs">
                    30-day free trial · Pro-level access · No credit card
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export { PricingCards as PricingCard };
