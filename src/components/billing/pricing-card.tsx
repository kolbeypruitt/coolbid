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
    <Card className="w-full max-w-sm mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">CoolBid Pro</CardTitle>
          {isAnnual && (
            <Badge variant="secondary">Save ${ANNUAL_SAVINGS}</Badge>
          )}
        </div>
        <CardDescription>Everything you need for faster HVAC estimates.</CardDescription>

        {/* Interval toggle */}
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={() => setInterval("month")}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              interval === "month"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("year")}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              interval === "year"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
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
            <span className="text-4xl font-bold">${displayPrice}</span>
            <span className="text-muted-foreground text-sm">
              {isAnnual ? "/year" : "/month"}
            </span>
          </div>
          {isAnnual && (
            <p className="text-sm text-muted-foreground mt-0.5">
              ${ANNUAL_MONTHLY}/month billed annually
            </p>
          )}
        </div>

        {/* Features */}
        <ul className="space-y-2">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-primary shrink-0" />
              {feature}
            </li>
          ))}
        </ul>

        {/* CTA */}
        {onSubscribe ? (
          <Button
            className="w-full"
            onClick={() => onSubscribe(interval)}
            disabled={isLoading}
          >
            {isLoading ? "Redirecting..." : "Subscribe Now"}
          </Button>
        ) : (
          <Link
            href="/auth/signup"
            className={cn(buttonVariants(), "w-full justify-center")}
          >
            Start Free Trial
          </Link>
        )}

        <p className="text-center text-xs text-muted-foreground">
          30-day free trial. No credit card required.
        </p>
      </CardContent>
    </Card>
  );
}
