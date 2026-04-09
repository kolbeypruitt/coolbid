# Design System Rollout — Design Spec

## Overview

Apply the CoolBid design system (`docs/coolbid-design-system.md`) across the entire app in a single PR, staged as logical commits. Convert the app to a dark theme with teal/cyan accents, glassmorphism surfaces, Inter typography, and an ambient background glow.

**Goal:** Transform CoolBid from a generic light-theme shadcn app into a visually distinctive, premium-feeling product.

## Scope

**In scope:**
- Dark theme only (no light mode)
- Font change from Geist to Inter
- Ambient background glow
- All shadcn components inherit new palette via CSS variable remapping
- Design system custom effects (gradients, glass, glow, hover-lift, animations)
- Every page and component styled per the design system

**Out of scope:**
- Light mode toggle
- Layout structural changes (sidebar stays as sidebar)
- Component API changes
- New features

## Approach

### CSS Variable Remapping (Core Strategy)

Tailwind v4 is configured with `@theme inline` in `src/app/globals.css`. shadcn components reference CSS custom properties like `--background`, `--foreground`, `--card`, `--primary`, `--accent`, `--border`. By redefining these in `:root`, every existing shadcn component automatically picks up the new palette with zero code changes.

On top of the shadcn vars, we add the design system's extra tokens (`--color-bg-primary`, `--color-bg-card`, `--color-accent-deep`, `--color-txt-primary`, `--color-accent-glow`, etc.) in the `@theme inline` block, making them available as Tailwind utilities like `bg-bg-card` or `text-txt-primary`.

### Mapping Table: shadcn var → design system value

| shadcn var | Design system color | Hex |
|------------|---------------------|-----|
| `--background` | bg-primary | #0B0F1A |
| `--foreground` | txt-primary | #F1F5F9 |
| `--card` | bg-card | #1A2236 |
| `--card-foreground` | txt-primary | #F1F5F9 |
| `--popover` | bg-card | #1A2236 |
| `--popover-foreground` | txt-primary | #F1F5F9 |
| `--primary` | accent (teal) | #06B6D4 |
| `--primary-foreground` | #0B0F1A | dark text on teal |
| `--secondary` | bg-elevated | #232E48 |
| `--secondary-foreground` | txt-primary | #F1F5F9 |
| `--muted` | bg-card-hover | #1F2A42 |
| `--muted-foreground` | txt-secondary | #94A3B8 |
| `--accent` | bg-elevated | #232E48 |
| `--accent-foreground` | txt-primary | #F1F5F9 |
| `--destructive` | error | #F87171 |
| `--border` | rgba(148, 163, 184, 0.08) | b (subtle border) |
| `--input` | bg-input | #0F1629 |
| `--ring` | accent | #06B6D4 |
| `--sidebar` | bg-secondary | #111827 |
| `--sidebar-foreground` | txt-secondary | #94A3B8 |
| `--sidebar-primary` | accent | #06B6D4 |
| `--sidebar-primary-foreground` | bg-primary | #0B0F1A |
| `--sidebar-accent` | bg-elevated | #232E48 |
| `--sidebar-accent-foreground` | txt-primary | #F1F5F9 |
| `--sidebar-border` | rgba(148, 163, 184, 0.08) | |
| `--sidebar-ring` | accent | #06B6D4 |

### Extra Design System Tokens (Tailwind utilities)

Added to `@theme inline` block:

```css
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

--color-b: rgba(148, 163, 184, 0.08);
--color-b-hover: rgba(148, 163, 184, 0.15);
--color-b-accent: rgba(6, 182, 212, 0.3);
```

These become Tailwind utilities: `bg-bg-card`, `text-txt-primary`, `border-b-accent`, etc.

### Custom CSS Classes (Not Tailwind)

Added to `globals.css` for effects Tailwind can't express:

- `.bg-gradient-brand` — linear gradient teal → blue for buttons/progress
- `.bg-gradient-brand-hover` — brighter variant for hover
- `.text-gradient-brand` — gradient clipped to text (background-clip: text)
- `.bg-gradient-card` — subtle gradient for card backgrounds
- `.glass-header` — rgba + backdrop-filter blur for sticky headers
- `.glass-card` — rgba + backdrop-filter blur for cards
- `.focus-accent` — input focus with teal ring
- `.hover-glow` — teal glow shadow on hover
- `.hover-lift` — translateY(-2px) on hover with transition
- `.progress-fill` — linear gradient + glow shadow for progress bars
- `.animate-blink` — 1s blink animation
- `.pulse-ring::before/::after` — animated pulse rings for analyzing screen
- `body::before` — ambient radial glow pseudo-element

### Typography

- Import Inter from Google Fonts in `globals.css`
- Remove Geist imports from `layout.tsx`
- Set `font-sans` in Tailwind theme to Inter, system-ui, sans-serif
- Body inherits font-sans

## Page-by-Page Changes

### Global Shell (app layout)

- **Sidebar** (`src/components/layout/sidebar.tsx`): 
  - Apply `bg-bg-secondary` to background (or leave to the existing `--sidebar` var)
  - Brand logo at top uses `.text-gradient-brand`
  - Active nav items get `.text-accent-light` + `bg-accent-glow` background
  - Icons use accent color when active
  - Hover states use `bg-bg-card-hover`
- **Header** (`src/components/layout/header.tsx`):
  - Apply `.glass-header` class (backdrop blur + transparent bg)
  - Sticky positioning
- **TrialBanner** (`src/components/billing/trial-banner.tsx`):
  - Use `bg-accent-glow` for default state
  - Use `bg-warning-bg text-warning` for urgent state
  - Subscribe link uses `text-accent-light`
- **App layout** (`src/app/(app)/layout.tsx`):
  - `body::before` ambient glow applies automatically via globals.css

### Marketing Pages

- **Landing page** (`src/app/(marketing)/page.tsx`):
  - Hero h1 uses `text-txt-primary`, h2 subtitles use `text-txt-secondary`
  - Hero CTA button uses `.bg-gradient-brand` + `.hover-lift`
  - Feature cards use `.bg-gradient-card` + `.hover-glow`
  - Pricing section already renders PricingCard — just needs PricingCard update
- **Pricing page** (`src/app/(marketing)/pricing/page.tsx`):
  - FAQ cards use `.bg-gradient-card` + `border-b`
  - Heading uses `text-txt-primary`
- **Marketing layout** (`src/app/(marketing)/layout.tsx`):
  - Header uses `.glass-header`
  - Nav links use `text-txt-secondary hover:text-txt-primary`

### Auth Pages

- **Login** (`src/app/auth/login/page.tsx`):
  - Card uses `.glass-card` + `border-b-accent`
  - Submit button uses `.bg-gradient-brand`
  - Error text uses `text-error`
- **Signup** (`src/app/auth/signup/page.tsx`): Same treatment
- **Onboarding** (`src/app/(app)/onboarding/page.tsx`):
  - Supplier cards use `.bg-gradient-card`
  - Selected state uses `border-b-accent` + `bg-accent-glow`
  - Hover adds `.hover-glow`
  - Continue button uses `.bg-gradient-brand`

### Estimator Wizard

- **Upload step** (`src/components/estimator/upload-step.tsx`):
  - Upload zone uses `border-b-accent border-dashed` + `bg-accent-glow`
  - Hover increases glow with `shadow-[0_0_40px_rgba(6,182,212,0.08)]`
  - Building info card uses `.bg-gradient-card`
  - System type select + climate zone select inherit new shadcn styling automatically
- **Page select step** (`src/components/estimator/page-select-step.tsx`):
  - Page cards use `.hover-lift`
  - Selected state uses `border-b-accent`
- **Analyzing step** (`src/components/estimator/analyzing-step.tsx`):
  - Wrap the central icon with `.pulse-ring` for the ripple animation
  - Progress bar uses `.progress-fill` class
  - Step list uses `text-accent-light` for current step, `text-success` for completed
- **Rooms step** (`src/components/estimator/rooms-step.tsx`):
  - Room cards use `.bg-gradient-card` + `.hover-lift` + `.hover-glow`
  - Borders use `border-b` default, `border-b-accent` on hover
  - Room count + sqft title uses `text-txt-primary`
  - Generate Estimate button uses `.bg-gradient-brand`
- **BOM step** (`src/components/estimator/bom-step.tsx`):
  - Summary cards use `.bg-gradient-card` + `border-b-accent`
  - Total price uses `.text-gradient-brand` at `text-4xl font-extrabold`
  - BOM tables use new table spec: `text-[11px] font-semibold uppercase` headers, `text-txt-tertiary` header color, `hover:bg-[rgba(6,182,212,0.03)]` row hover
  - Source badges already implemented — keep their variants but map to design system colors
  - Save button uses `.bg-gradient-brand`

### Parts Database

- **Catalog page** (`src/app/(app)/parts-database/page.tsx`): Header styling
- **Catalog table** (`src/components/parts-database/catalog-table.tsx`):
  - Filter bar uses `.bg-gradient-card`
  - Table uses new table spec (same as BOM)
  - Source badges use design system status colors
- **Catalog detail** (`src/components/parts-database/catalog-detail.tsx`):
  - Main card uses `.bg-gradient-card` + `border-b-accent`
  - Price history table uses new table spec
- **Quote upload** (`src/components/parts-database/quote-upload.tsx`):
  - Upload zone styling matches estimator upload zone
  - Processing indicator uses `bg-accent-glow` + `text-accent-light`
- **Quote review** (`src/components/parts-database/quote-review.tsx`):
  - Header uses `.bg-gradient-card`
  - Table uses new table spec
  - Save button uses `.bg-gradient-brand`

### Settings + Billing

- **Settings page** (`src/app/(app)/settings/page.tsx`):
  - Profile form card uses `.bg-gradient-card`
  - Input focus uses `.focus-accent`
  - Save button uses `.bg-gradient-brand`
- **Subscription status** (`src/components/billing/subscription-status.tsx`):
  - Card uses `.bg-gradient-card` + `border-b-accent`
  - Status badges use appropriate design system colors (success for active, warning for trialing, destructive for past_due/canceled)
- **Pricing card** (`src/components/billing/pricing-card.tsx`):
  - Card uses `.bg-gradient-card` + `border-b-accent`
  - Price number uses `.text-gradient-brand` at `text-5xl font-extrabold`
  - Subscribe button uses `.bg-gradient-brand`
  - Monthly/annual toggle uses `bg-bg-input` + accent for selected state
  - Savings badge uses `bg-success-bg text-success`
- **Upgrade page** (`src/app/(app)/upgrade/page.tsx`):
  - Inherits from PricingCard update

## Commit Structure

All in one PR on `feature/design-system` branch:

1. **Foundation** — Inter font + globals.css variable remap + custom classes + Tailwind tokens
2. **App shell** — Sidebar + header + trial banner + marketing layout
3. **Marketing pages** — Landing + pricing + FAQ
4. **Auth pages** — Login + signup + onboarding
5. **Estimator wizard** — Upload + page select + analyzing + rooms + BOM
6. **Parts database** — Catalog table + detail + quote upload + quote review
7. **Settings + billing** — Profile + subscription status + pricing card + upgrade
8. **Polish pass** — Fix any rough edges, verify build passes, final consistency check

## Testing Approach

Manual visual testing:
- Walk through every page in the app while logged in
- Check each state: trialing banner, active subscription, past_due, canceled
- Verify estimator wizard end-to-end
- Verify parts database end-to-end
- Verify auth flow (login, signup, onboarding)
- Verify marketing pages unauthenticated

Build verification: `npm run build` must pass cleanly after each commit.

No automated visual regression tests — this is a small-team product and the test ROI is low for visual changes at this stage.

## Rollback Strategy

The `v0.3-billing-complete` tag marks the pre-design-system state. If the rollout causes issues that can't be easily fixed, revert the PR or hard-reset main:

```bash
git reset --hard v0.3-billing-complete
git push --force-with-lease origin main
```

## Constraints

- No component API changes — function signatures and props stay identical
- No new dependencies (Inter loads from Google Fonts, no font package)
- No inline styles — all styling goes through Tailwind classes or the custom CSS classes defined in globals.css
- No hardcoded hex values in JSX — always reference tokens via Tailwind utilities or custom classes
- Transitions stay 200-300ms (design system rule)
