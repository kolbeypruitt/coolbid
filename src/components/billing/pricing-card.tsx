"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
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
  PRO_MONTHLY_PRICE,
  PRO_ANNUAL_PRICE,
} from "@/types/billing";

const FEATURES = [
  "Unlimited floorplan analyses",
  "Unlimited quote uploads & AI parsing",
  "Full equipment catalog",
  "Estimate history & RFQ export",
  "Priority email support",
];

const ANNUAL_MONTHLY = Math.round(PRO_ANNUAL_PRICE / 12);
const ANNUAL_SAVINGS = PRO_MONTHLY_PRICE * 12 - PRO_ANNUAL_PRICE;

interface PricingCardProps {
  onSubscribe?: (interval: BillingInterval) => void;
  isLoading?: boolean;
}

export function PricingCard({ onSubscribe, isLoading }: PricingCardProps) {
  const [interval, setInterval] = useState<BillingInterval>("month");

  const isAnnual = interval === "year";
  const displayPrice = isAnnual ? PRO_ANNUAL_PRICE : PRO_MONTHLY_PRICE;

  return (
    <Card className="w-full max-w-sm mx-auto bg-gradient-card border-b-accent shadow-[0_0_28px_rgba(6,182,212,0.1)]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl text-txt-primary">CoolBid Pro</CardTitle>
          {isAnnual && (
            <Badge variant="secondary" className="bg-success-bg text-success border-none">Save ${ANNUAL_SAVINGS}</Badge>
          )}
        </div>
        <CardDescription>Everything you need for faster HVAC estimates.</CardDescription>

        {/* Interval toggle */}
        <div className="flex rounded-md bg-bg-input p-1 mt-2">
          <button
            type="button"
            onClick={() => setInterval("month")}
            className={cn(
              interval === "month"
                ? "flex-1 rounded-sm py-2 text-sm font-medium bg-gradient-brand text-white shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                : "flex-1 rounded-sm py-2 text-sm font-medium text-txt-secondary hover:text-txt-primary"
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("year")}
            className={cn(
              interval === "year"
                ? "flex-1 rounded-sm py-2 text-sm font-medium bg-gradient-brand text-white shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                : "flex-1 rounded-sm py-2 text-sm font-medium text-txt-secondary hover:text-txt-primary"
            )}
          >
            Annual
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Price */}
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-5xl font-extrabold text-gradient-brand tracking-tighter">${displayPrice}</span>
            <span className="text-txt-tertiary text-sm">
              {isAnnual ? "/year" : "/month"}
            </span>
          </div>
          {isAnnual && (
            <p className="text-txt-tertiary text-sm mt-0.5">
              ${ANNUAL_MONTHLY}/month billed annually
            </p>
          )}
        </div>

        {/* Features */}
        <ul className="space-y-2">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm text-txt-secondary">
              <Check className="h-4 w-4 text-accent-light shrink-0" />
              {feature}
            </li>
          ))}
        </ul>

        {/* CTA */}
        {onSubscribe ? (
          <Button
            className="bg-gradient-brand hover-lift w-full"
            onClick={() => onSubscribe(interval)}
            disabled={isLoading}
          >
            {isLoading ? "Redirecting..." : "Subscribe Now"}
          </Button>
        ) : (
          <Link
            href="/auth/signup"
            className={cn(buttonVariants(), "bg-gradient-brand hover-lift w-full justify-center")}
          >
            Start Free Trial
          </Link>
        )}

        <p className="text-center text-txt-tertiary text-xs">
          30-day free trial · No credit card required
        </p>
      </CardContent>
    </Card>
  );
}
