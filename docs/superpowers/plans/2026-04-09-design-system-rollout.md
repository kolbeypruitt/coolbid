# Design System Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the CoolBid design system across the entire app — dark theme, teal/cyan accents, glassmorphism, Inter typography, ambient glow — via CSS variable remapping and targeted component updates.

**Architecture:** Tailwind v4 `@theme inline` block gets extended with design system tokens. shadcn CSS variables get remapped to the design system palette, so every existing shadcn component inherits dark theme automatically. Custom CSS classes (gradients, glass, glow, animations) go in `globals.css` and get applied to specific components where the design system calls for them.

**Tech Stack:** Tailwind CSS v4, shadcn/ui v4 + @base-ui/react, Next.js 15, Inter font (Google Fonts)

**Spec:** `docs/superpowers/specs/2026-04-09-design-system-rollout-design.md`
**Design doc:** `docs/coolbid-design-system.md`

---

## Task 1: Foundation — globals.css, Inter font, root layout

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Rewrite globals.css**

Replace the entire contents of `src/app/globals.css` with:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

@custom-variant dark (&:is(.dark *));

@theme inline {
  /* Shadcn semantic tokens (mapped from :root vars below) */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-sans);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);

  /* Design system extra tokens (direct Tailwind utilities) */
  --color-bg-primary: #0B0F1A;
  --color-bg-secondary: #111827;
  --color-bg-card: #1A2236;
  --color-bg-card-hover: #1F2A42;
  --color-bg-elevated: #232E48;
  --color-bg-input: #0F1629;

  --color-accent-deep: #0E7490;
  --color-accent-dark: #0891B2;
  --color-accent-light: #22D3EE;
  --color-accent-bright: #67E8F9;
  --color-accent-glow: rgba(6, 182, 212, 0.15);
  --color-accent-glow-strong: rgba(6, 182, 212, 0.25);

  --color-cool-blue: #3B82F6;
  --color-cool-blue-light: #60A5FA;
  --color-cool-blue-glow: rgba(59, 130, 246, 0.15);

  --color-txt-primary: #F1F5F9;
  --color-txt-secondary: #94A3B8;
  --color-txt-tertiary: #64748B;
  --color-txt-accent: #22D3EE;

  --color-success: #34D399;
  --color-success-bg: rgba(52, 211, 153, 0.1);
  --color-warning: #FBBF24;
  --color-warning-bg: rgba(251, 191, 36, 0.1);
  --color-error: #F87171;
  --color-error-bg: rgba(248, 113, 113, 0.1);

  --color-b-hover: rgba(148, 163, 184, 0.15);
  --color-b-accent: rgba(6, 182, 212, 0.3);

  /* Radius */
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
  /* Dark theme applied globally — no light mode */
  --background: #0B0F1A;
  --foreground: #F1F5F9;
  --card: #1A2236;
  --card-foreground: #F1F5F9;
  --popover: #1A2236;
  --popover-foreground: #F1F5F9;
  --primary: #06B6D4;
  --primary-foreground: #0B0F1A;
  --secondary: #232E48;
  --secondary-foreground: #F1F5F9;
  --muted: #1F2A42;
  --muted-foreground: #94A3B8;
  --accent: #232E48;
  --accent-foreground: #F1F5F9;
  --destructive: #F87171;
  --border: rgba(148, 163, 184, 0.08);
  --input: #0F1629;
  --ring: #06B6D4;
  --chart-1: #06B6D4;
  --chart-2: #3B82F6;
  --chart-3: #22D3EE;
  --chart-4: #60A5FA;
  --chart-5: #67E8F9;
  --radius: 0.625rem;
  --sidebar: #111827;
  --sidebar-foreground: #94A3B8;
  --sidebar-primary: #06B6D4;
  --sidebar-primary-foreground: #0B0F1A;
  --sidebar-accent: #232E48;
  --sidebar-accent-foreground: #F1F5F9;
  --sidebar-border: rgba(148, 163, 184, 0.08);
  --sidebar-ring: #06B6D4;

  --font-sans: 'Inter', system-ui, sans-serif;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-sans);
    position: relative;
    min-height: 100vh;
  }
  body::before {
    content: '';
    position: fixed;
    top: -200px;
    left: 50%;
    transform: translateX(-50%);
    width: 800px;
    height: 600px;
    background: radial-gradient(ellipse, rgba(6,182,212,0.06) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }
  html {
    @apply font-sans;
  }
  /* Ensure content sits above ambient glow */
  body > * {
    position: relative;
    z-index: 1;
  }
}

/* ============================================================
   Design system custom effects (not expressible in Tailwind)
   ============================================================ */

/* Brand gradients */
.bg-gradient-brand {
  background: linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%);
  transition: background 0.2s;
}
.bg-gradient-brand:hover,
.bg-gradient-brand-hover {
  background: linear-gradient(135deg, #22D3EE 0%, #60A5FA 100%);
}
.text-gradient-brand {
  background: linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.bg-gradient-card {
  background: linear-gradient(145deg, #1A2236 0%, #151D30 100%);
}

/* Glassmorphism */
.glass-header {
  background: rgba(11, 15, 26, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
.glass-card {
  background: rgba(26, 34, 54, 0.6);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

/* Focus + hover effects */
.focus-accent:focus {
  border-color: #06B6D4;
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.15);
  outline: none;
}
.hover-glow {
  transition: box-shadow 0.25s;
}
.hover-glow:hover {
  box-shadow: 0 0 20px rgba(6, 182, 212, 0.15);
}
.hover-lift {
  transition: transform 0.2s, box-shadow 0.2s;
}
.hover-lift:hover {
  transform: translateY(-2px);
}

/* Progress bar with glow */
.progress-fill {
  background: linear-gradient(90deg, #06B6D4, #3B82F6);
  box-shadow: 0 0 12px rgba(6,182,212,0.4);
}

/* Pulse ring animation */
@keyframes pulse-out {
  0% { transform: scale(0.8); opacity: 1; }
  100% { transform: scale(1.6); opacity: 0; }
}
.pulse-ring {
  position: relative;
}
.pulse-ring::before,
.pulse-ring::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid #06B6D4;
  animation: pulse-out 2s ease-out infinite;
  pointer-events: none;
}
.pulse-ring::after {
  animation-delay: 0.6s;
}

/* Blink */
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.animate-blink {
  animation: blink 1s ease-in-out infinite;
}
```

- [ ] **Step 2: Update root layout**

Replace `src/app/layout.tsx` contents with:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoolBid — HVAC Estimating Made Easy",
  description: "Upload a floorplan, get a complete HVAC bill of materials in minutes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
```

This removes Geist imports and lets Inter (loaded via `@import` in globals.css) take over via the CSS variable `--font-sans`.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build passes. Visit the dev server — everything should be dark themed. Some components may look slightly off but nothing should be broken.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(design-system): foundation with Inter font, dark theme, and custom effects"
```

---

## Task 2: App Shell — Sidebar, Header, Trial Banner

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/header.tsx`
- Modify: `src/components/billing/trial-banner.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Read all four files**

Read the current versions of all four files. The shadcn components will already look dark from Task 1 — our job is to apply the design system effects (glass header, brand gradient, accent colors for active states).

- [ ] **Step 2: Update sidebar**

Replace `src/components/layout/sidebar.tsx` contents. Start with the existing structure and apply these classes:

- Sidebar container: `flex h-screen w-64 flex-col border-r border-border bg-sidebar`
- Brand header area: keep layout, change `<Link>` to:
  ```tsx
  <Link href="/dashboard" className="text-xl font-bold text-gradient-brand tracking-tight">
    CoolBid
  </Link>
  ```
- Nav links (inactive): `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-txt-secondary hover:bg-bg-card-hover hover:text-txt-primary transition-colors`
- Nav links (active): `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium bg-accent-glow text-accent-light`
- Use `cn()` from `@/lib/utils` for conditional classes

Exact file content:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Settings, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/estimates", label: "Estimates", icon: FileText },
  { href: "/parts-database", label: "Parts Database", icon: Package },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 items-center border-b border-border px-5">
        <Link
          href="/dashboard"
          className="text-xl font-bold text-gradient-brand tracking-tight"
        >
          CoolBid
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent-glow text-accent-light"
                  : "text-txt-secondary hover:bg-bg-card-hover hover:text-txt-primary"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3: Update header**

Replace `src/components/layout/header.tsx` contents to apply glass-header class and use design system colors:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User } from "lucide-react";

export function Header({ email }: { email: string }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <header className="glass-header sticky top-0 z-40 flex h-14 items-center justify-end border-b border-border px-6">
      <DropdownMenu>
        <DropdownMenuTrigger>
          <div className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-txt-secondary hover:bg-bg-card-hover hover:text-txt-primary transition-colors cursor-pointer">
            <User className="h-4 w-4" />
            {email}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
```

Note: Read the actual `DropdownMenuTrigger` component first to see if it renders as a button or a div. If it expects children to be rendered inside a button element, adjust accordingly.

- [ ] **Step 4: Update trial banner**

Replace `src/components/billing/trial-banner.tsx` styling. Read the current file first. Change the banner classes to use design system colors:

```tsx
// In the return block, change the wrapper div className to:
<div
  className={`flex items-center justify-center gap-3 border-b border-border px-4 py-2 text-sm ${
    isUrgent
      ? "bg-warning-bg text-warning"
      : "bg-accent-glow text-accent-light"
  }`}
>
```

And the Subscribe link:
```tsx
<Link
  href="/upgrade"
  className="font-medium text-accent-light underline underline-offset-2 hover:no-underline"
>
  Subscribe
</Link>
```

Keep the rest of the component logic (AlertCircle icon, useEffect, etc.) unchanged.

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/sidebar.tsx src/components/layout/header.tsx src/components/billing/trial-banner.tsx
git commit -m "feat(design-system): apply glass header, accent sidebar, themed trial banner"
```

---

## Task 3: Marketing Pages — Landing, Pricing, Marketing Layout

**Files:**
- Modify: `src/app/(marketing)/layout.tsx`
- Modify: `src/app/(marketing)/page.tsx`
- Modify: `src/app/(marketing)/pricing/page.tsx`

- [ ] **Step 1: Update marketing layout**

Read `src/app/(marketing)/layout.tsx`. Apply glass-header to the header element, use text-gradient-brand for the "CoolBid" logo, and use design system colors for the nav links:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="glass-header sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border px-6">
        <Link href="/" className="text-xl font-bold text-gradient-brand tracking-tight">
          CoolBid
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/pricing"
            className="text-sm font-medium text-txt-secondary hover:text-txt-primary transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/auth/login"
            className="text-sm font-medium text-txt-secondary hover:text-txt-primary transition-colors"
          >
            Sign in
          </Link>
          <Link href="/auth/signup">
            <Button className="bg-gradient-brand hover-lift text-white shadow-[0_0_20px_rgba(6,182,212,0.15)]">
              Start free trial
            </Button>
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Update landing page**

Read `src/app/(marketing)/page.tsx`. Apply design system colors and effects to the hero, features grid, and pricing section.

Key changes:
- Hero h1: `text-5xl font-bold tracking-tight text-txt-primary`
- Hero subtitle: `text-lg text-txt-secondary`
- Primary CTA button: add `bg-gradient-brand hover-lift shadow-[0_0_20px_rgba(6,182,212,0.15)]` class
- Feature cards: add `bg-gradient-card hover-glow border-border` classes
- Feature icons: `text-accent-light`
- Feature titles: `text-txt-primary`
- Feature descriptions: `text-txt-secondary`
- Bottom CTA section h2: `text-txt-primary`

Read the existing file, identify each section (hero, features, pricing, bottom CTA), and apply these color/class changes. Keep all existing JSX structure intact — only change className values.

- [ ] **Step 3: Update pricing page**

Read `src/app/(marketing)/pricing/page.tsx`. Apply:
- Heading: `text-4xl font-bold tracking-tight text-txt-primary`
- Subtitle: `text-lg text-txt-secondary`
- FAQ cards: add `bg-gradient-card border border-border rounded-lg` classes
- FAQ question h3: `text-txt-primary`
- FAQ answer: `text-txt-secondary`
- "Start your free trial" link: `text-accent-light`

Keep JSX structure unchanged.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(marketing\)/
git commit -m "feat(design-system): apply gradient hero, glow cards, and themed pricing to marketing pages"
```

---

## Task 4: Auth Pages — Login, Signup, Onboarding

**Files:**
- Modify: `src/app/auth/login/page.tsx`
- Modify: `src/app/auth/signup/page.tsx`
- Modify: `src/app/(app)/onboarding/page.tsx`
- Modify: `src/components/onboarding/supplier-select.tsx`

- [ ] **Step 1: Update login page**

Read `src/app/auth/login/page.tsx`. Apply design system classes:
- Outer wrapper: `flex min-h-screen items-center justify-center bg-background p-4`
- Card: add `bg-gradient-card border border-b-accent shadow-[0_0_28px_rgba(6,182,212,0.1)]` classes
- CardTitle: `text-txt-primary`
- CardDescription: `text-txt-secondary`
- Submit button: add `bg-gradient-brand hover-lift` classes
- Error text: already uses `text-destructive`, change to `text-error`
- "Don't have an account" link: `text-accent-light`

Keep all form logic, state, and structure unchanged.

- [ ] **Step 2: Update signup page**

Read `src/app/auth/signup/page.tsx`. Apply the same pattern as login:
- Outer wrapper: dark background
- Card: `bg-gradient-card border border-b-accent shadow-[0_0_28px_rgba(6,182,212,0.1)]`
- CardTitle, CardDescription: themed colors
- Submit button: `bg-gradient-brand hover-lift`
- Error: `text-error`
- Sign-in link: `text-accent-light`

- [ ] **Step 3: Update supplier select component**

Read `src/components/onboarding/supplier-select.tsx`. Apply:
- Supplier cards (unselected): `bg-gradient-card border border-border hover-glow hover-lift cursor-pointer`
- Supplier cards (selected): `bg-gradient-card border-2 border-b-accent bg-accent-glow hover-lift`
- Supplier name: `text-txt-primary font-semibold`
- Brands: `text-txt-tertiary text-xs`
- "Other" card text input: apply `bg-bg-input border-border focus-accent` classes

Use `cn()` to toggle between selected and unselected classes.

- [ ] **Step 4: Update onboarding page**

Read `src/app/(app)/onboarding/page.tsx`. Apply:
- Outer wrapper: `min-h-screen bg-background flex items-center justify-center p-4`
- Heading: `text-3xl font-bold text-txt-primary`
- Subtitle: `text-txt-secondary`
- Continue button: `bg-gradient-brand hover-lift`
- Skip link: `text-txt-tertiary hover:text-txt-secondary`

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/app/auth/ src/app/\(app\)/onboarding/ src/components/onboarding/
git commit -m "feat(design-system): apply glass cards and gradient buttons to auth + onboarding"
```

---

## Task 5: Estimator Wizard — Upload, Page Select, Analyzing, Rooms, BOM

**Files:**
- Modify: `src/components/estimator/upload-step.tsx`
- Modify: `src/components/estimator/page-select-step.tsx`
- Modify: `src/components/estimator/analyzing-step.tsx`
- Modify: `src/components/estimator/rooms-step.tsx`
- Modify: `src/components/estimator/bom-step.tsx`
- Modify: `src/app/(app)/estimates/new/page.tsx`

- [ ] **Step 1: Update upload step**

Read `src/components/estimator/upload-step.tsx`. Apply:
- Project Info + Building Info cards: add `bg-gradient-card border border-border` classes to the shadcn Card wrappers
- Card titles: `text-txt-primary`
- Labels: `text-txt-secondary`
- Inputs: the underlying shadcn Input already inherits the new `--input` var
- Upload drop zone: `border-2 border-dashed border-b-accent rounded-lg p-10 text-center bg-accent-glow hover:bg-accent-glow-strong hover:shadow-[0_0_40px_rgba(6,182,212,0.08)] transition-all duration-300 cursor-pointer`
- Upload icon: `text-accent-light`
- Upload text: `text-txt-primary` for main, `text-txt-tertiary` for sub
- Processing state: use `bg-accent-glow` for the badge background, `text-accent-light` for the spinner, `text-txt-primary` for status text
- Processing progress bar: replace `bg-primary` with `progress-fill` class

- [ ] **Step 2: Update page select step**

Read `src/components/estimator/page-select-step.tsx`. Apply:
- Page preview cards: add `hover-lift` class
- Selected state: `border-b-accent bg-accent-glow`
- Unselected state: `border-border hover:border-b-hover`
- "Analyze" button: `bg-gradient-brand hover-lift`

- [ ] **Step 3: Update analyzing step**

Read `src/components/estimator/analyzing-step.tsx`. Apply:
- Wrapper: `max-w-[600px] mx-auto py-10 text-center`
- Icon container: add `pulse-ring` class around the central icon
- Progress bar track: `h-2 w-full overflow-hidden rounded-full bg-bg-card`
- Progress bar fill: change to use `progress-fill` class:
  ```tsx
  <div
    className="h-full rounded-full progress-fill transition-all duration-700 ease-out"
    style={{ width: `${progress}%` }}
  />
  ```
- Step text (completed): `text-txt-secondary`
- Step text (current): `text-txt-primary`
- Check icon: `text-success`
- Loader2 icon: `text-accent-light`

- [ ] **Step 4: Update rooms step**

Read `src/components/estimator/rooms-step.tsx`. Apply:
- Header h2: `text-txt-primary`
- Header subtitle: `text-txt-secondary`
- Confidence badge: map variants to design system — `high` = `bg-success-bg text-success`, `medium` = `bg-accent-glow text-accent-light`, `low` = `bg-warning-bg text-warning`. Since the badge is a shadcn Badge, apply these via className props.
- Add Room button: keep as outline variant
- Generate Estimate button: `bg-gradient-brand hover-lift`
- Room cards (the div with className containing `rounded-xl border`): change to `bg-gradient-card border border-border hover:border-b-accent hover-glow hover-lift transition-all duration-[250ms]`
- Room card name input: keep transparent with `text-txt-primary`
- Room card labels: `text-txt-tertiary uppercase tracking-wider`
- Room card BTU footer text: `text-txt-tertiary`
- Delete button hover: `hover:text-error`

- [ ] **Step 5: Update BOM step**

Read `src/components/estimator/bom-step.tsx`. Apply:
- Summary cards (top 4 cards): add `bg-gradient-card border border-b-accent shadow-[0_0_24px_rgba(6,182,212,0.06)]` classes
- Summary card labels: `text-txt-tertiary text-xs font-semibold uppercase tracking-wider`
- Summary card values: `text-2xl font-bold text-txt-primary`
- The "Total Price" card value specifically: `text-3xl font-extrabold text-gradient-brand`
- Pricing card (with profit margin/labor inputs): `bg-gradient-card border border-border`
- BOM item category cards: `bg-gradient-card border border-border`
- BOM table headers: `text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary`
- BOM table rows: `hover:bg-[rgba(6,182,212,0.03)] transition-colors`
- BOM table data cells: `text-txt-secondary`
- BOM numeric cells: `text-txt-primary tabular-nums font-medium`
- Source badges: already themed via shadcn — their variants automatically map
- Missing warning banner: `bg-warning-bg border border-warning text-warning`
- Save button: `bg-gradient-brand hover-lift`
- Copy RFQ / Export CSV buttons: keep outline variant

- [ ] **Step 6: Update wizard page (step indicator)**

Read `src/app/(app)/estimates/new/page.tsx`. Apply:
- Main heading: `text-2xl font-bold text-txt-primary`
- Step badges (Upload / Select Pages / Analyzing / Rooms / BOM): map active state to `bg-gradient-brand text-white` and inactive to `bg-bg-card text-txt-secondary border border-border`
- Error alert: `bg-error-bg border-error text-error`

- [ ] **Step 7: Verify build**

```bash
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/components/estimator/ src/app/\(app\)/estimates/new/
git commit -m "feat(design-system): apply gradient cards, glow rooms, and pulse analyzing to estimator"
```

---

## Task 6: Parts Database — Catalog Table, Detail, Quote Upload, Quote Review

**Files:**
- Modify: `src/app/(app)/parts-database/page.tsx`
- Modify: `src/components/parts-database/catalog-table.tsx`
- Modify: `src/components/parts-database/catalog-detail.tsx`
- Modify: `src/components/parts-database/quote-upload.tsx`
- Modify: `src/components/parts-database/quote-review.tsx`
- Modify: `src/app/(app)/parts-database/upload/page.tsx`

- [ ] **Step 1: Update parts database page**

Read `src/app/(app)/parts-database/page.tsx`. Apply:
- Page heading: `text-2xl font-bold text-txt-primary`
- Upload Quote button: `bg-gradient-brand hover-lift`

- [ ] **Step 2: Update catalog table**

Read `src/components/parts-database/catalog-table.tsx`. Apply:
- Filter bar wrapper: `bg-gradient-card border border-border rounded-md p-4 space-y-3`
- Table wrapper: `overflow-x-auto rounded-md border border-border bg-bg-card`
- Table headers: `text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary bg-bg-card`
- Table rows: `hover:bg-[rgba(6,182,212,0.03)] transition-colors border-b border-border`
- Table cells: `text-sm text-txt-secondary py-3`
- Numeric cells (price, usage count): `tabular-nums text-txt-primary font-medium`
- Source badges:
  - "starter" → `bg-bg-elevated text-txt-tertiary border border-border`
  - "quote" → `bg-success-bg text-success`
  - "manual" → `bg-cool-blue-glow text-cool-blue-light`
- Empty state text: `text-txt-secondary`
- Loading state text: `text-txt-secondary`
- Search input: inherits from shadcn (will use new `--input` var)

- [ ] **Step 3: Update catalog detail**

Read `src/components/parts-database/catalog-detail.tsx`. Apply:
- Main detail card: `bg-gradient-card border border-b-accent`
- Attribute labels: `text-txt-tertiary text-xs uppercase tracking-wider`
- Attribute values: `text-txt-primary font-medium`
- Price history section heading: `text-txt-primary font-semibold`
- Price history table: same styling as catalog table
- Save button: `bg-gradient-brand hover-lift`
- Delete button: keep as destructive variant

- [ ] **Step 4: Update quote upload**

Read `src/components/parts-database/quote-upload.tsx`. Apply:
- Supplier select card: `bg-gradient-card border border-border`
- Upload zone: same styling as estimator upload step — `border-2 border-dashed border-b-accent bg-accent-glow hover:bg-accent-glow-strong`
- Upload icon: `text-accent-light`
- Upload text: `text-txt-primary`
- Processing state: `bg-accent-glow` with `text-accent-light` spinner
- Processing progress bar: `progress-fill`

- [ ] **Step 5: Update quote review**

Read `src/components/parts-database/quote-review.tsx`. Apply:
- Header card (supplier info): `bg-gradient-card border border-border`
- Header text: `text-txt-primary` for main values, `text-txt-secondary` for labels
- Review table: same styling as catalog table
- Save button: `bg-gradient-brand hover-lift`
- Cancel button: keep as outline

- [ ] **Step 6: Update quote upload page wrapper**

Read `src/app/(app)/parts-database/upload/page.tsx`. Apply:
- Heading: `text-2xl font-bold text-txt-primary`
- Success state: `bg-success-bg border-success text-success`
- Links in success state: `text-accent-light`

- [ ] **Step 7: Verify build**

```bash
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/app/\(app\)/parts-database/ src/components/parts-database/
git commit -m "feat(design-system): apply themed tables, glass cards, and accent badges to parts database"
```

---

## Task 7: Settings, Subscription, Upgrade, Pricing Card

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`
- Modify: `src/components/billing/subscription-status.tsx`
- Modify: `src/components/billing/pricing-card.tsx`
- Modify: `src/app/(app)/upgrade/page.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/app/(app)/estimates/page.tsx`
- Modify: `src/app/(app)/estimates/[id]/page.tsx`

- [ ] **Step 1: Update settings page**

Read `src/app/(app)/settings/page.tsx`. Apply:
- Page heading: `text-2xl font-bold text-txt-primary`
- Profile form card: `bg-gradient-card border border-border`
- Card titles: `text-txt-primary`
- Card descriptions: `text-txt-secondary`
- Input labels: `text-txt-secondary`
- Save button: `bg-gradient-brand hover-lift`
- Success message: `text-success`
- Error message: `text-error`

- [ ] **Step 2: Update subscription status**

Read `src/components/billing/subscription-status.tsx`. Apply:
- Card: `bg-gradient-card border border-b-accent`
- Card title: `text-txt-primary`
- Status badges: map variants to design system:
  - `trialing` → `bg-accent-glow text-accent-light`
  - `active` → `bg-success-bg text-success`
  - `past_due` → `bg-error-bg text-error`
  - `canceled`, `expired` → `bg-bg-elevated text-txt-tertiary border border-border`
- Status text: `text-txt-primary` for main, `text-txt-secondary` for details
- "Upgrade to Pro" / "Resubscribe" links: `bg-gradient-brand hover-lift`
- "Manage Billing" button: outline variant with `border-border text-txt-primary`

- [ ] **Step 3: Update pricing card component**

Read `src/components/billing/pricing-card.tsx`. Apply:
- Card wrapper: `bg-gradient-card border border-b-accent shadow-[0_0_28px_rgba(6,182,212,0.1)] w-full max-w-md`
- Tier title "Pro": `text-2xl font-bold text-txt-primary`
- Savings badge: `bg-success-bg text-success`
- Monthly/Annual toggle container: `flex rounded-md bg-bg-input p-1`
- Toggle active state: `bg-gradient-brand text-white shadow-[0_0_12px_rgba(6,182,212,0.3)]`
- Toggle inactive state: `text-txt-secondary hover:text-txt-primary`
- Price number: `text-5xl font-extrabold text-gradient-brand tracking-tighter`
- Price interval: `text-txt-tertiary`
- "$X/month billed annually" subtext: `text-txt-tertiary text-sm`
- Features list: `text-txt-secondary`
- Check icons: `text-accent-light`
- Subscribe/Start Free Trial button: `bg-gradient-brand hover-lift w-full`
- Trial disclaimer text: `text-txt-tertiary text-xs`

- [ ] **Step 4: Update upgrade page**

Read `src/app/(app)/upgrade/page.tsx`. Apply:
- Outer wrapper: `min-h-screen bg-background flex items-center justify-center p-4`
- Heading: `text-3xl font-bold text-txt-primary`
- Subtitle: `text-txt-secondary`
- Error alert: `bg-error-bg border-error text-error`

- [ ] **Step 5: Update dashboard page**

Read `src/app/(app)/dashboard/page.tsx`. Apply:
- Heading: `text-2xl font-bold text-txt-primary`
- New Estimate button: `bg-gradient-brand hover-lift`
- Stat cards: `bg-gradient-card border border-border`
- Stat labels: `text-txt-tertiary text-xs uppercase tracking-wider`
- Stat values: `text-3xl font-bold text-gradient-brand`
- Recent estimates card: `bg-gradient-card border border-border`
- Recent estimate rows: `hover:bg-bg-card-hover transition-colors`
- Estimate names: `text-txt-primary`
- Estimate metadata: `text-txt-secondary`

- [ ] **Step 6: Update estimates list page**

Read `src/app/(app)/estimates/page.tsx`. Apply:
- Heading: `text-2xl font-bold text-txt-primary`
- New Estimate button: `bg-gradient-brand hover-lift`
- Empty state card: `bg-gradient-card border border-border`
- Estimate cards: `bg-gradient-card border border-border hover:border-b-accent hover-lift transition-all`
- Estimate names: `text-txt-primary font-medium`
- Customer names: `text-txt-secondary`
- Status badges: map to design system (draft → outline, sent → accent glow, accepted → success)

- [ ] **Step 7: Update estimate detail page**

Read `src/app/(app)/estimates/[id]/page.tsx`. Apply:
- Back button: outline with `text-txt-secondary hover:text-txt-primary`
- Heading: `text-2xl font-bold text-txt-primary`
- Customer/sqft metadata: `text-txt-secondary`
- Summary cards: `bg-gradient-card border border-b-accent`
- Summary labels: `text-txt-tertiary text-xs uppercase tracking-wider`
- Summary values: `text-2xl font-bold text-txt-primary`
- Total Price specifically: `text-3xl font-extrabold text-gradient-brand`
- Rooms card: `bg-gradient-card border border-border`
- Rooms table: same styling as catalog table (uppercase headers, tabular-nums, hover states)
- BOM category cards: `bg-gradient-card border border-border`
- BOM tables: same table styling

- [ ] **Step 8: Verify build**

```bash
npm run build
```

- [ ] **Step 9: Commit**

```bash
git add src/app/\(app\)/settings/ src/components/billing/ src/app/\(app\)/upgrade/ src/app/\(app\)/dashboard/ src/app/\(app\)/estimates/
git commit -m "feat(design-system): apply gradient cards, themed tables, and accent buttons to all app pages"
```

---

## Task 8: Polish Pass + Final Build

**Files:**
- Review all changed files
- Fix any inconsistencies

- [ ] **Step 1: Visual walkthrough**

Start the dev server:
```bash
npm run dev
```

Walk through every page:
1. `/` — landing page
2. `/pricing` — pricing page
3. `/auth/login` — login
4. `/auth/signup` — signup
5. `/onboarding` — supplier selection (sign in with fresh account or manually set `onboarding_completed=false`)
6. `/dashboard` — dashboard
7. `/estimates` — estimates list
8. `/estimates/new` — wizard (upload, page select, analyzing, rooms, BOM)
9. `/estimates/[id]` — estimate detail
10. `/parts-database` — catalog
11. `/parts-database/upload` — quote upload + review
12. `/parts-database/[id]` — catalog item detail
13. `/settings` — settings + subscription status
14. `/upgrade` — upgrade screen

Note any pages that look inconsistent, too bright, have missing accents, or feel broken.

- [ ] **Step 2: Fix any issues found**

Common likely issues:
- Hardcoded text-muted-foreground in some places should be text-txt-secondary
- Some primary buttons may have been missed and still look solid cyan instead of gradient
- Icons may not have accent color where they should
- Shadcn Badge default variants may need override classes for some use cases

Fix each issue by editing the specific file. No specific code block — the fixes depend on what you find.

- [ ] **Step 3: Run final build**

```bash
npm run build
```

Expected: Clean build with no errors or warnings beyond the existing middleware deprecation notice.

- [ ] **Step 4: Commit polish fixes**

```bash
git add -A
git commit -m "feat(design-system): polish pass — consistency fixes across all pages"
```

- [ ] **Step 5: Push branch**

```bash
git push -u origin feature/design-system
```

- [ ] **Step 6: Create PR**

```bash
gh pr create --title "Apply CoolBid Design System" --body "$(cat <<'EOF'
## Summary

Applies the CoolBid design system across the entire app:

- **Dark theme only** — #0B0F1A background, #F1F5F9 primary text
- **Teal/cyan accents** — #06B6D4 primary with gradient to #3B82F6
- **Glassmorphism** — Sticky header, cards with backdrop blur
- **Inter font** — Replaces Geist
- **Ambient glow** — Radial teal gradient at top of every page
- **Custom effects** — Gradient text, hover lift, hover glow, pulse ring, progress fill

## Approach

CSS variable remapping in `globals.css` — shadcn components inherit the new palette automatically. Design system tokens (`bg-bg-card`, `text-txt-primary`, etc.) added to `@theme inline` block for direct Tailwind utilities. Custom classes for gradients, glass, and animations added to globals.css.

## What changed

- Foundation: globals.css, layout.tsx
- App shell: sidebar, header, trial banner
- Marketing: landing, pricing, layout
- Auth: login, signup, onboarding, supplier select
- Estimator: upload, page select, analyzing, rooms, BOM, wizard page
- Parts database: catalog table, detail, quote upload/review
- Settings + billing: settings, subscription status, pricing card, upgrade
- Dashboard + estimates: dashboard, list, detail

## Test plan

- [ ] Walk through all 14 routes, verify dark theme applied consistently
- [ ] Verify gradient buttons work on hover
- [ ] Verify card hover effects (glow, lift)
- [ ] Verify Inter font is loading
- [ ] Verify ambient glow is visible at top of pages
- [ ] Verify pulse ring animation on analyzing step
- [ ] Verify progress bars use gradient fill
- [ ] Build passes: `npm run build`

## Rollback

Pre-design-system state is tagged as \`v0.3-billing-complete\`.
EOF
)"
```

---
