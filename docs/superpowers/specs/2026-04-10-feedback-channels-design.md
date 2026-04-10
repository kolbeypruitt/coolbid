# Customer Feedback Channels — Design Spec

## Context

CoolBid is entering early marketing and trial onboarding. For the next 1-2 months, the highest priority is collecting qualitative feedback from trial users to understand what's working and what's not. This spec defines multiple low-friction feedback touchpoints within the app, all routing to the founder's inbox via Resend.

All feedback surfaces live behind authentication — no contact info is exposed to unauthenticated users or scrapers.

## Goals

- Maximize opportunities for trial users to share feedback with minimal friction
- Support open-ended qualitative feedback, feature requests, and bug reports
- Provide direct contact access (email + phone) for conversational feedback
- Automatically include user context with every submission to reduce back-and-forth
- Keep implementation simple — no new external dependencies beyond Resend (already integrated)

## Non-Goals

- Feedback database or admin dashboard (add later if volume warrants it)
- Automated GitHub Issues creation (founder triages manually for now)
- Quantitative scoring (NPS, satisfaction ratings)
- Public-facing feedback portal or roadmap

## Architecture

Four touchpoints feed into one shared feedback modal. The modal submits via a server action that sends a Resend email with embedded user context.

```
Floating Widget ─┐
Sidebar Link ────┤
Settings Card ───┼──▶ Feedback Modal ──▶ Server Action ──▶ Resend Email
Contextual Prompt┘
```

### Feedback Modal

- **Category selector**: "General Feedback" (default), "Feature Request", "Bug Report"
  - Pre-selected based on trigger context (e.g., contextual prompts default to "General Feedback")
- **Textarea**: Placeholder varies by category
  - General: "What's on your mind?"
  - Feature Request: "What would you like to see?"
  - Bug Report: "What went wrong?"
- **Submit button**: Sends email, shows success toast via Sonner
- **Hidden context** (included in email, not shown to user):
  - User email and company name
  - Current plan/tier and trial day number
  - Current page URL
  - Timestamp

Built as a client component using shadcn Dialog, rendered once in the app layout and controlled via a shared state (Zustand store or React context) so any touchpoint can open it.

### Floating Feedback Widget

- Fixed-position button in the bottom-right corner of all `(app)` routes
- Small pill or icon button with Lucide `MessageSquare` icon
- Label: "Feedback" (text visible on desktop, icon-only on mobile)
- Opens the feedback modal on click
- Z-index below modals/dialogs but above page content
- Placed in the authenticated app layout so it appears on every page

### Sidebar Navigation Link

- New "Feedback" item added to the sidebar, below "Settings"
- Icon: Lucide `MessageSquarePlus` or `MessageSquare`
- Opens the feedback modal (same as widget) rather than navigating to a new page

### Settings "Help & Feedback" Card

- New card section on `/settings`, placed below the existing Subscription Status card
- Contents:
  - Heading: "Help & Feedback"
  - Short copy: "We're building this for you — reach out anytime."
  - Founder's email address (displayed, clickable mailto link)
  - Founder's phone number (displayed, clickable tel link)
  - "Send Feedback" button → opens the feedback modal
- All contact info is server-rendered within the authenticated layout — not exposed to unauthenticated requests

### Contextual Feedback Prompts

Three one-time inline banners that appear at key moments in the trial journey. Each shows once per user.

| Prompt | Trigger | Location | Message |
|--------|---------|----------|---------|
| First Estimate | User's first estimate is created | Dashboard or estimate detail page | "How was your first estimate? We'd love to hear your thoughts." |
| Mid-Trial | User is ~7 days into trial | Dashboard | "You're a week in — anything we can improve?" |
| Trial Expiring | ≤3 days remaining in trial | Dashboard | "Your trial ends soon. What would make CoolBid worth subscribing to?" |

**Dismissal tracking**: Store prompt completion/dismissal state in a `feedback_prompts_seen` JSONB column on the user's profile row (or the existing user metadata). Shape: `{ "first_estimate": true, "mid_trial": true, "trial_expiring": true }`. No separate table needed at this scale.

**Banner design**: Inline card/banner (not a modal or toast) with the message, a "Share Feedback" link that opens the feedback modal, and a dismiss button. Styled consistently with the existing TrialBanner component.

## Email Format

Each feedback submission sends a Resend email to the founder with:

**Subject**: `[CoolBid Feedback] {Category} from {Company Name}`

**Body**:
```
Category: Feature Request
From: Jane Smith (jane@greenfieldhvac.com)
Company: Greenfield Heating & Air
Plan: Starter (Trial — Day 5)
Page: /estimates/new

---

Message:
It would be great if I could duplicate an existing estimate and just change
the address. I do a lot of similar houses in the same subdivision.
```

## Files to Create/Modify

- `src/components/feedback/feedback-modal.tsx` — shared modal component
- `src/components/feedback/feedback-widget.tsx` — floating button
- `src/components/feedback/feedback-prompt.tsx` — contextual banner component
- `src/components/settings/help-feedback-card.tsx` — settings page card
- `src/app/(app)/layout.tsx` — add widget and modal provider
- `src/components/layout/sidebar.tsx` — add Feedback nav item
- `src/app/(app)/settings/page.tsx` — add Help & Feedback card
- `src/app/(app)/dashboard/page.tsx` — add contextual prompt logic
- `src/lib/actions/send-feedback.ts` — server action for Resend email
- DB migration or profile update for `feedback_prompts_seen` column

## Verification

1. **Floating widget**: Log in, verify button visible on all app pages, click opens modal, submit sends email
2. **Sidebar link**: Verify "Feedback" appears in nav, opens modal
3. **Settings card**: Navigate to /settings, verify contact info displayed and "Send Feedback" opens modal
4. **Contextual prompts**:
   - Create first estimate → verify banner appears → dismiss → verify it doesn't reappear
   - Simulate day-7 trial user → verify mid-trial banner
   - Simulate ≤3 days remaining → verify expiring banner
5. **Email content**: Submit feedback from each touchpoint, verify emails arrive with correct context and formatting
6. **Auth gate**: Verify no feedback UI or contact info is visible on unauthenticated routes
