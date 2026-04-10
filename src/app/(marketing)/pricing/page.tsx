import Link from "next/link";
import { PricingCard } from "@/components/billing/pricing-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FAQ = [
  {
    q: "How does the free trial work?",
    a: "You get 30 days and up to 50 AI actions — no credit card required. Explore the full product before committing.",
  },
  {
    q: "What happens when the trial ends?",
    a: "You'll be prompted to subscribe. Your existing floorplans, estimates, and data remain accessible — nothing is deleted.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from Settings at any time. Access continues until the end of your current billing period.",
  },
  {
    q: "What's included in Pro?",
    a: "Unlimited analyses, unlimited quote uploads & AI parsing, the full equipment catalog, estimate history, RFQ export, and priority email support.",
  },
];

export default function PricingPage() {
  return (
    <main className="flex-1">
      {/* Header */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-txt-primary">Simple, transparent pricing</h1>
        <p className="text-lg text-txt-secondary">
          One plan. Everything you need to win more HVAC jobs.
        </p>
      </section>

      {/* Pricing card */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <PricingCard />
      </section>

      {/* FAQ */}
      <section className="border-t bg-muted/40">
        <div className="mx-auto max-w-2xl px-6 py-20 space-y-10">
          <h2 className="text-2xl font-bold text-center text-txt-primary">Frequently asked questions</h2>
          <dl className="space-y-8">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="bg-gradient-card border border-border rounded-lg p-4">
                <dt className="font-medium text-txt-primary">{q}</dt>
                <dd className="mt-1 text-sm text-txt-secondary">{a}</dd>
              </div>
            ))}
          </dl>

          <div className="text-center pt-4">
            <Link
              href="/auth/signup"
              className={cn(buttonVariants({ size: "lg" }), "text-accent-light")}
            >
              Start your free trial
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
