import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Upload,
  Sparkles,
  FileText,
  Gauge,
  Layers,
  Ruler,
  Snowflake,
  Check,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PricingCard } from "@/components/billing/pricing-card";

export const metadata = {
  // Use root layout's default title — avoids template duplication on the home page.
  title: { absolute: "coolbid — Floorplan in. Bill of materials out." },
  description:
    "Upload a floorplan, get a priced bill of materials in minutes. HVAC estimating for residential contractors.",
};

export default function LandingPage() {
  return (
    <main className="flex-1">
      <Hero />
      <TrustStrip />
      <HowItWorks />
      <Features />
      <Stats />
      <Pricing />
      <FAQ />
      <FinalCTA />
    </main>
  );
}

/* --------------------------------- HERO --------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-120px] h-[560px] w-[960px] -translate-x-1/2 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(6,182,212,0.18) 0%, rgba(59,130,246,0.08) 40%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[260px] h-[420px] w-[720px] -translate-x-1/2 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(6,182,212,0.10) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-12 sm:pt-28">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          {/* Eyebrow */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-b-accent bg-bg-card/60 px-3 py-1.5 backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-light opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-light" />
            </span>
            <span className="text-xs font-medium tracking-wide text-txt-secondary">
              Built for residential HVAC contractors
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight text-txt-primary sm:text-6xl lg:text-7xl">
            Floorplan in.
            <br />
            <span className="text-gradient-brand">Bill of materials</span> out.
          </h1>

          {/* Subhead */}
          <p className="mt-6 max-w-2xl text-lg text-txt-secondary sm:text-xl">
            Drop in a floorplan. coolbid reads the rooms, sizes the system, and
            hands you a priced BOM in about a minute. Your margin, your
            catalog, your quote.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/auth/signup"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-gradient-brand hover-lift h-12 gap-2 px-7 text-base font-semibold shadow-[0_0_30px_rgba(6,182,212,0.25)]",
              )}
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#how-it-works"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 border-border bg-bg-card/40 px-7 text-base backdrop-blur hover:bg-bg-card",
              )}
            >
              See how it works
            </Link>
          </div>
          <p className="mt-4 text-sm text-txt-tertiary">
            30-day free trial · No credit card · Cancel anytime
          </p>
        </div>

        {/* Hero product visual */}
        <div className="relative mx-auto mt-16 max-w-5xl">
          <div
            aria-hidden
            className="absolute inset-x-0 -top-10 mx-auto h-[420px] max-w-4xl rounded-[40px] blur-3xl"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(6,182,212,0.22) 0%, rgba(59,130,246,0.10) 40%, transparent 75%)",
            }}
          />
          <EstimatePreview />
        </div>
      </div>
    </section>
  );
}

/* --------------------------- HERO PRODUCT VISUAL -------------------------- */

function EstimatePreview() {
  const lineItems = [
    { name: "3.5-ton heat pump, 16 SEER2", qty: 1, price: "$4,280" },
    { name: "Air handler, variable speed", qty: 1, price: "$1,640" },
    { name: 'Supply duct, 8" flex', qty: 12, price: "$428" },
    { name: "Return grille, 20×25", qty: 2, price: "$96" },
    { name: "Line set, 3/4×3/8, 25 ft", qty: 1, price: "$312" },
    { name: "Install labor", qty: 18, price: "$2,340" },
  ];

  return (
    <div className="relative rounded-2xl border border-border bg-bg-card/70 p-2 shadow-[0_30px_100px_-20px_rgba(6,182,212,0.25)] backdrop-blur-xl">
      {/* Window chrome */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-bg-elevated" />
          <span className="h-3 w-3 rounded-full bg-bg-elevated" />
          <span className="h-3 w-3 rounded-full bg-bg-elevated" />
        </div>
        <div className="flex items-center gap-2 rounded-md bg-bg-input px-3 py-1 text-xs text-txt-tertiary">
          <Snowflake className="h-3 w-3 text-accent-light" />
          coolbid.app / estimates / 2026-042
        </div>
        <div className="h-3 w-12" />
      </div>

      {/* Inner grid */}
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-5">
        {/* Left: floorplan card */}
        <div className="border-border p-5 lg:col-span-2 lg:border-r">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-txt-tertiary">
              Floorplan
            </span>
            <span className="text-[11px] text-txt-tertiary">1,820 sq ft</span>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-bg-input">
            <FloorplanSVG />
            {/* Detected rooms legend */}
            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1.5">
              {[
                "Living 320",
                "Kitchen 210",
                "Bed 1 180",
                "Bed 2 160",
                "Bath 90",
              ].map((r) => (
                <span
                  key={r}
                  className="rounded-md border border-b-accent bg-bg-card/90 px-2 py-0.5 text-[10px] font-medium text-accent-light backdrop-blur"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniStat label="Rooms" value="9" />
            <MiniStat label="Zone" value="3A" />
            <MiniStat label="Load" value="42k BTU" />
          </div>
        </div>

        {/* Right: BOM card */}
        <div className="p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-txt-tertiary">
              Bill of materials
            </span>
            <span className="flex items-center gap-1 text-[11px] text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Sized for Zone 3A
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <table
              className="w-full text-sm"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              <thead className="bg-bg-elevated/40">
                <tr className="text-left text-[10px] uppercase tracking-wider text-txt-tertiary">
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 text-right font-semibold">Qty</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => (
                  <tr
                    key={item.name}
                    className="border-t border-border text-txt-secondary"
                  >
                    <td className="px-3 py-2 text-txt-primary">{item.name}</td>
                    <td className="px-3 py-2 text-right">{item.qty}</td>
                    <td className="px-3 py-2 text-right font-medium text-txt-primary">
                      {item.price}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-lg border border-b-accent bg-[rgba(6,182,212,0.06)] px-4 py-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-txt-tertiary">
                Estimate total
              </div>
              <div className="text-xs text-txt-secondary">
                Margin 28% · Labor included
              </div>
            </div>
            <div
              className="text-2xl font-extrabold text-gradient-brand"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              $9,096
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-bg-secondary/50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-txt-tertiary">
        {label}
      </div>
      <div
        className="text-sm font-semibold text-txt-primary"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
    </div>
  );
}

function FloorplanSVG() {
  return (
    <svg
      viewBox="0 0 400 300"
      className="h-full w-full"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <pattern
          id="grid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 20 0 L 0 0 0 20"
            fill="none"
            stroke="rgba(148,163,184,0.08)"
            strokeWidth="1"
          />
        </pattern>
        <linearGradient id="roomGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(6,182,212,0.22)" />
          <stop offset="100%" stopColor="rgba(59,130,246,0.08)" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#grid)" />
      {/* Outer walls */}
      <rect
        x="30"
        y="30"
        width="340"
        height="240"
        fill="none"
        stroke="rgba(148,163,184,0.5)"
        strokeWidth="2.5"
        rx="4"
      />
      {/* Rooms */}
      <g
        fill="url(#roomGlow)"
        stroke="rgba(34,211,238,0.55)"
        strokeWidth="1.5"
      >
        <rect x="30" y="30" width="150" height="130" />
        <rect x="180" y="30" width="120" height="90" />
        <rect x="300" y="30" width="70" height="90" />
        <rect x="180" y="120" width="110" height="80" />
        <rect x="290" y="120" width="80" height="80" />
        <rect x="30" y="160" width="90" height="110" />
        <rect x="120" y="160" width="100" height="110" />
        <rect x="220" y="200" width="150" height="70" />
      </g>
      {/* Door swings */}
      <g
        fill="none"
        stroke="rgba(148,163,184,0.6)"
        strokeWidth="1.2"
        strokeDasharray="3,3"
      >
        <path d="M 90 160 A 25 25 0 0 0 115 135" />
        <path d="M 220 160 A 20 20 0 0 1 200 140" />
      </g>
      {/* Supply dots */}
      <g fill="#22D3EE">
        <circle cx="90" cy="90" r="3" />
        <circle cx="235" cy="75" r="3" />
        <circle cx="330" cy="75" r="3" />
        <circle cx="235" cy="155" r="3" />
        <circle cx="330" cy="155" r="3" />
        <circle cx="75" cy="210" r="3" />
        <circle cx="170" cy="210" r="3" />
        <circle cx="290" cy="230" r="3" />
      </g>
    </svg>
  );
}

/* ------------------------------- TRUST STRIP ------------------------------ */

function TrustStrip() {
  return (
    <section className="border-y border-border bg-bg-secondary/40 py-10">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-tertiary">
          Built on real jobsite data from a working HVAC contractor
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-txt-secondary">
          {[
            "Manual J-style load calcs",
            "Zone-aware tonnage",
            "Supplier pricing",
            "RFQ-ready exports",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent-light" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ HOW IT WORKS ------------------------------ */

function HowItWorks() {
  const steps = [
    {
      num: "01",
      icon: Upload,
      title: "Upload a floorplan",
      body: "PDF, image, or marked-up blueprint. Drag it in from your phone between jobs. No templates, no CAD.",
    },
    {
      num: "02",
      icon: Sparkles,
      title: "coolbid reads the rooms",
      body: "Rooms are detected, square footage is measured, and the system is sized for your climate zone in about a minute.",
    },
    {
      num: "03",
      icon: FileText,
      title: "Priced BOM, ready to send",
      body: "Your equipment catalog, your labor rate, your margin — baked into a clean estimate you can hand to the homeowner.",
    },
  ];

  return (
    <section
      id="how-it-works"
      className="relative mx-auto max-w-6xl px-6 py-24"
    >
      <SectionHeader
        eyebrow="How it works"
        title="Three steps from blueprint to bid"
        subtitle="No more typing line items into a spreadsheet after dinner."
      />
      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {steps.map(({ num, icon: Icon, title, body }) => (
          <div
            key={num}
            className="group relative rounded-2xl border border-border bg-gradient-card p-6 transition-all hover:border-b-accent hover:shadow-[0_0_30px_rgba(6,182,212,0.12)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <span
                className="text-sm font-semibold text-txt-tertiary"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {num}
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-b-accent bg-[rgba(6,182,212,0.08)]">
                <Icon className="h-5 w-5 text-accent-light" strokeWidth={1.5} />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-txt-primary">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-txt-secondary">
              {body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------- FEATURES ------------------------------- */

function Features() {
  return (
    <section
      id="features"
      className="relative border-t border-border bg-bg-secondary/30 py-24"
    >
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="What coolbid does"
          title="Every corner of an estimate, handled"
          subtitle="The details HVAC pros actually care about — not a generic CRM bolt-on."
        />

        <div className="mt-14 grid gap-4 md:grid-cols-6">
          <FeatureCard
            className="md:col-span-4"
            icon={Ruler}
            title="Room-aware load sizing"
            body="coolbid measures each room off the plan, applies Zone 3A–aware loads, and picks tonnage that matches the house — not a flat $/sq ft guess."
            accent
          >
            <div className="mt-5 grid grid-cols-3 gap-3 rounded-lg border border-border bg-bg-input p-3 text-xs text-txt-secondary">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-txt-tertiary">
                  Load
                </div>
                <div
                  className="text-base font-semibold text-txt-primary"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  42,000 BTU
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-txt-tertiary">
                  Tonnage
                </div>
                <div
                  className="text-base font-semibold text-accent-light"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  3.5 ton
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-txt-tertiary">
                  SEER2
                </div>
                <div
                  className="text-base font-semibold text-txt-primary"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  16
                </div>
              </div>
            </div>
          </FeatureCard>

          <FeatureCard
            className="md:col-span-2"
            icon={Gauge}
            title="Minutes, not afternoons"
            body="Rooms detected, sized, and priced in ~60 seconds."
          >
            <div className="mt-5 flex items-end gap-1">
              <span
                className="text-5xl font-extrabold text-gradient-brand"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                ~60
              </span>
              <span className="pb-2 text-sm text-txt-tertiary">seconds</span>
            </div>
          </FeatureCard>

          <FeatureCard
            className="md:col-span-2"
            icon={Layers}
            title="Your catalog, your margin"
            body="Upload your supplier pricing once. coolbid remembers part numbers, costs, and the markup you expect to see."
          />

          <FeatureCard
            className="md:col-span-2"
            icon={FileText}
            title="RFQ-ready exports"
            body="Send a clean PDF to the homeowner and a part-numbered RFQ to your supplier. No re-typing."
          />

          <FeatureCard
            className="md:col-span-2"
            icon={Sparkles}
            title="Override and it remembers"
            body="Price looks off? Swap the part. coolbid learns your preference the next time the same line comes up."
          />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
  className,
  children,
  accent = false,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  body: string;
  className?: string;
  children?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-gradient-card p-6 transition-all hover:border-b-accent",
        accent && "hover:shadow-[0_0_40px_rgba(6,182,212,0.15)]",
        className,
      )}
    >
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-b-accent bg-[rgba(6,182,212,0.08)]">
        <Icon className="h-5 w-5 text-accent-light" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-txt-primary">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-txt-secondary">{body}</p>
      {children}
    </div>
  );
}

/* ---------------------------------- STATS --------------------------------- */

function Stats() {
  const stats = [
    { value: "~60s", label: "Floorplan to priced BOM" },
    { value: "4hrs", label: "Saved per estimate" },
    { value: "100%", label: "Your catalog, your margin" },
    { value: "Zone 3A", label: "Climate-aware sizing" },
  ];
  return (
    <section className="relative mx-auto max-w-6xl px-6 py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-48 -translate-y-1/2 blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(6,182,212,0.10) 0%, transparent 70%)",
        }}
      />
      <div className="relative grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center justify-center bg-bg-card px-6 py-10 text-center"
          >
            <div
              className="text-4xl font-extrabold text-gradient-brand sm:text-5xl"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {s.value}
            </div>
            <div className="mt-2 text-sm text-txt-secondary">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------- PRICING -------------------------------- */

function Pricing() {
  return (
    <section className="relative border-t border-border bg-bg-secondary/30 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="Pricing"
          title="One plan. Unlimited estimates."
          subtitle="Start free for 30 days. Cancel any time — your data stays yours."
        />
        <div className="mx-auto mt-14 max-w-6xl">
          <PricingCard />
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------- FAQ ---------------------------------- */

function FAQ() {
  const faqs = [
    {
      q: "What kind of floorplans work?",
      a: "PDFs, scans, phone photos, or marked-up blueprints. coolbid handles rotated and hand-drawn plans — just make sure rooms are labeled or walls are visible.",
    },
    {
      q: "Does it actually do load calcs?",
      a: "coolbid sizes tonnage with a Manual J-style calculation that accounts for square footage, climate zone, and window exposure. It's a starting point you can override, not a black box.",
    },
    {
      q: "Can I use my own supplier pricing?",
      a: "Yes. Upload a supplier catalog once and coolbid matches line items to your parts, your costs, and your markup. Override a price and it remembers.",
    },
    {
      q: "What's included in the free trial?",
      a: "Everything. Unlimited floorplans, unlimited estimates, full catalog, RFQ exports. 30 days, no credit card.",
    },
    {
      q: "Who built this?",
      a: "A contractor and a software engineer who got tired of typing estimates into spreadsheets after dinner. coolbid is built on real jobs from a working HVAC company in Oklahoma.",
    },
  ];
  return (
    <section className="relative mx-auto max-w-4xl px-6 py-24">
      <SectionHeader
        eyebrow="Questions"
        title="The honest answers"
        subtitle="Not on the list? Email kolbey@coolbid.app and we'll get back to you."
      />
      <div className="mt-12 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
        {faqs.map((f) => (
          <details key={f.q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 text-left transition-colors hover:bg-bg-card-hover">
              <span className="pr-6 text-base font-semibold text-txt-primary">
                {f.q}
              </span>
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-border text-txt-secondary transition-transform group-open:rotate-45">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M6 1V11M1 6H11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </summary>
            <div className="px-6 pb-5 text-sm leading-relaxed text-txt-secondary">
              {f.a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------- FINAL CTA ------------------------------- */

function FinalCTA() {
  return (
    <section className="relative overflow-hidden border-t border-border py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(6,182,212,0.18) 0%, rgba(59,130,246,0.08) 45%, transparent 75%)",
        }}
      />
      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <Image
          src="/brand/logos/mark-primary.svg"
          alt="coolbid"
          width={72}
          height={72}
          className="mx-auto h-16 w-16"
        />
        <h2 className="mt-6 text-4xl font-extrabold tracking-tight text-txt-primary sm:text-5xl">
          Stop typing estimates.
          <br />
          <span className="text-gradient-brand">Start shipping bids.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-txt-secondary">
          Free for 30 days. Takes about two minutes to set up. Your first
          estimate is ready before the kettle boils.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/auth/signup"
            className={cn(
              buttonVariants({ size: "lg" }),
              "bg-gradient-brand hover-lift h-12 gap-2 px-8 text-base font-semibold shadow-[0_0_30px_rgba(6,182,212,0.3)]",
            )}
          >
            Start free trial
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/pricing"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-12 border-border px-8 text-base",
            )}
          >
            See pricing
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- SECTION HEADER ----------------------------- */

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-light">
        {eyebrow}
      </div>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-txt-primary sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-base text-txt-secondary sm:text-lg">
          {subtitle}
        </p>
      )}
    </div>
  );
}
