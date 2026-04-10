# Customer Feedback Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multiple in-app feedback touchpoints (floating widget, sidebar link, settings card, contextual prompts) that funnel into a shared feedback modal, sending structured emails via Resend.

**Architecture:** A Zustand store controls a single feedback modal rendered in the app layout. Four entry points (floating widget, sidebar nav, settings card, contextual banners) open the modal with optional pre-selected category. A server action validates input with Zod, enriches with user context, and sends via Resend. Contextual prompts track dismissal state via a JSONB column on profiles.

**Tech Stack:** Next.js 16 App Router, React 19, shadcn/ui Dialog, Zustand, Zod, Resend, Supabase (profiles table), Lucide icons, Sonner toasts.

**Spec:** `docs/superpowers/specs/2026-04-10-feedback-channels-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/009_feedback_prompts.sql` | Add `feedback_prompts_seen` JSONB column to profiles |
| Create | `src/types/feedback.ts` | Feedback category type, form state type, Zod schema |
| Create | `src/stores/feedback-store.ts` | Zustand store: open/close modal, pre-select category |
| Create | `src/lib/actions/send-feedback.ts` | Server action: validate, enrich with user context, send Resend email |
| Create | `src/lib/emails/feedback-received.tsx` | React Email template for feedback submissions |
| Create | `src/components/feedback/feedback-modal.tsx` | Shared modal with category selector + textarea |
| Create | `src/components/feedback/feedback-widget.tsx` | Floating bottom-right button |
| Create | `src/components/feedback/feedback-prompt.tsx` | Contextual inline banner (reusable for all 3 prompts) |
| Create | `src/components/settings/help-feedback-card.tsx` | Settings page card with contact info + feedback button |
| Modify | `src/app/(app)/layout.tsx` | Add FeedbackModal + FeedbackWidget to layout |
| Modify | `src/components/layout/sidebar.tsx` | Add Feedback nav item |
| Modify | `src/app/(app)/settings/page.tsx` | Add HelpFeedbackCard |
| Modify | `src/app/(app)/dashboard/page.tsx` | Add contextual prompt logic |
| Modify | `src/types/database.ts` | Add `feedback_prompts_seen` to profiles Row/Insert/Update types |

---

## Task 1: Database Migration — `feedback_prompts_seen` Column

**Files:**
- Create: `supabase/migrations/009_feedback_prompts.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Create migration file**

```sql
-- 009_feedback_prompts.sql
-- Add JSONB column to track which feedback prompts a user has seen/dismissed

alter table public.profiles
  add column if not exists feedback_prompts_seen jsonb not null default '{}';

comment on column public.profiles.feedback_prompts_seen is
  'Tracks dismissed contextual feedback prompts: { "first_estimate": true, "mid_trial": true, "trial_expiring": true }';
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db push` (or `npx supabase migration up` depending on local setup)
Expected: Migration applies without error.

- [ ] **Step 3: Update Database types**

In `src/types/database.ts`, add `feedback_prompts_seen` to the profiles `Row`, `Insert`, and `Update` types:

```typescript
// In Row (after team_id):
feedback_prompts_seen: Record<string, boolean>;

// In Insert (after team_id):
feedback_prompts_seen?: Record<string, boolean>;

// In Update (after team_id):
feedback_prompts_seen?: Record<string, boolean>;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/009_feedback_prompts.sql src/types/database.ts
git commit -m "feat(db): add feedback_prompts_seen column to profiles"
```

---

## Task 2: Feedback Types and Zustand Store

**Files:**
- Create: `src/types/feedback.ts`
- Create: `src/stores/feedback-store.ts`

- [ ] **Step 1: Create feedback types and Zod schema**

Create `src/types/feedback.ts`:

```typescript
import { z } from "zod";

export const FEEDBACK_CATEGORIES = [
  "general",
  "feature_request",
  "bug_report",
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  general: "General Feedback",
  feature_request: "Feature Request",
  bug_report: "Bug Report",
};

export const CATEGORY_PLACEHOLDERS: Record<FeedbackCategory, string> = {
  general: "What's on your mind?",
  feature_request: "What would you like to see?",
  bug_report: "What went wrong?",
};

export const feedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  message: z.string().trim().min(1, "Please enter a message").max(5000),
  pageUrl: z.string(),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;
```

- [ ] **Step 2: Create Zustand store**

Create `src/stores/feedback-store.ts`:

```typescript
import { create } from "zustand";
import type { FeedbackCategory } from "@/types/feedback";

type FeedbackState = {
  isOpen: boolean;
  defaultCategory: FeedbackCategory;
};

type FeedbackActions = {
  open: (category?: FeedbackCategory) => void;
  close: () => void;
};

export const useFeedbackStore = create<FeedbackState & FeedbackActions>(
  (set) => ({
    isOpen: false,
    defaultCategory: "general",

    open: (category = "general") =>
      set({ isOpen: true, defaultCategory: category }),

    close: () => set({ isOpen: false, defaultCategory: "general" }),
  }),
);
```

- [ ] **Step 3: Commit**

```bash
git add src/types/feedback.ts src/stores/feedback-store.ts
git commit -m "feat(feedback): add feedback types, Zod schema, and Zustand store"
```

---

## Task 3: Email Template and Server Action

**Files:**
- Create: `src/lib/emails/feedback-received.tsx`
- Create: `src/lib/actions/send-feedback.ts`

- [ ] **Step 1: Create email template**

Create `src/lib/emails/feedback-received.tsx`. Follow the existing pattern in `src/lib/emails/layout.tsx` using `@react-email/components`:

```tsx
import { Section, Text, Hr } from "@react-email/components";
import {
  EmailLayout,
  headingStyle,
  bodyTextStyle,
} from "./layout";

interface FeedbackReceivedProps {
  category: string;
  userName: string;
  userEmail: string;
  companyName: string;
  plan: string;
  trialDay: number | null;
  pageUrl: string;
  message: string;
}

export function FeedbackReceivedEmail({
  category,
  userName,
  userEmail,
  companyName,
  plan,
  trialDay,
  pageUrl,
  message,
}: FeedbackReceivedProps) {
  const planLabel =
    trialDay !== null ? `${plan} (Trial — Day ${trialDay})` : plan;

  return (
    <EmailLayout>
      <Text style={headingStyle}>New Feedback: {category}</Text>
      <Text style={bodyTextStyle}>
        <strong>From:</strong> {userName} ({userEmail})
        <br />
        <strong>Company:</strong> {companyName}
        <br />
        <strong>Plan:</strong> {planLabel}
        <br />
        <strong>Page:</strong> {pageUrl}
      </Text>
      <Hr style={{ borderColor: "#e4e4e7" }} />
      <Section>
        <Text style={bodyTextStyle}>{message}</Text>
      </Section>
    </EmailLayout>
  );
}
```

- [ ] **Step 2: Create server action**

Create `src/lib/actions/send-feedback.ts`. Follow the server action pattern from `src/lib/share/respond.ts`:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { getResend, FROM_EMAIL } from "@/lib/resend";
import { feedbackSchema, CATEGORY_LABELS } from "@/types/feedback";
import type { FeedbackInput } from "@/types/feedback";
import { FeedbackReceivedEmail } from "@/lib/emails/feedback-received";

const FEEDBACK_TO_EMAIL = "kolbey@coolbid.app";

export type SendFeedbackResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function sendFeedback(
  input: FeedbackInput,
): Promise<SendFeedbackResult> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, reason: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "company_name, company_email, subscription_tier, subscription_status, trial_ends_at",
    )
    .eq("id", user.id)
    .single();

  if (!profile) {
    return { ok: false, reason: "Profile not found" };
  }

  const trialDay =
    profile.subscription_status === "trialing" && profile.trial_ends_at
      ? Math.max(
          1,
          30 -
            Math.ceil(
              (new Date(profile.trial_ends_at).getTime() - Date.now()) /
                (1000 * 60 * 60 * 24),
            ),
        )
      : null;

  const categoryLabel = CATEGORY_LABELS[parsed.data.category];

  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: FEEDBACK_TO_EMAIL,
    replyTo: profile.company_email?.trim() || user.email || undefined,
    subject: `[CoolBid Feedback] ${categoryLabel} from ${profile.company_name?.trim() || "Unknown"}`,
    react: FeedbackReceivedEmail({
      category: categoryLabel,
      userName: profile.company_name?.trim() || "Unknown",
      userEmail: user.email || "Unknown",
      companyName: profile.company_name?.trim() || "Not set",
      plan: profile.subscription_tier,
      trialDay,
      pageUrl: parsed.data.pageUrl,
      message: parsed.data.message,
    }),
  });

  if (error) {
    console.error("Failed to send feedback email:", error);
    return { ok: false, reason: "Failed to send. Please try again." };
  }

  return { ok: true };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/emails/feedback-received.tsx src/lib/actions/send-feedback.ts
git commit -m "feat(feedback): add email template and server action"
```

---

## Task 4: Feedback Modal Component

**Files:**
- Create: `src/components/feedback/feedback-modal.tsx`

- [ ] **Step 1: Create the feedback modal**

Create `src/components/feedback/feedback-modal.tsx`. Uses shadcn Dialog, the Zustand store, and the server action:

```tsx
"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFeedbackStore } from "@/stores/feedback-store";
import {
  FEEDBACK_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_PLACEHOLDERS,
} from "@/types/feedback";
import type { FeedbackCategory } from "@/types/feedback";
import { sendFeedback } from "@/lib/actions/send-feedback";

export function FeedbackModal() {
  const { isOpen, defaultCategory, close } = useFeedbackStore();
  const pathname = usePathname();

  const [category, setCategory] = useState<FeedbackCategory>(defaultCategory);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCategory(defaultCategory);
      setMessage("");
    }
  }, [isOpen, defaultCategory]);

  async function handleSubmit() {
    if (!message.trim()) return;

    setSending(true);
    const result = await sendFeedback({
      category,
      message,
      pageUrl: pathname,
    });
    setSending(false);

    if (result.ok) {
      toast.success("Thanks for your feedback!");
      close();
    } else {
      toast.error(result.reason);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="bg-gradient-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-txt-primary">
            <MessageSquare className="h-5 w-5 text-accent-light" />
            Send Feedback
          </DialogTitle>
          <DialogDescription className="text-txt-secondary">
            We&apos;re building this for you — tell us what you think.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label className="text-txt-primary">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as FeedbackCategory)}
            >
              <SelectTrigger className="border-border bg-bg-input text-txt-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEEDBACK_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-txt-primary">Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={CATEGORY_PLACEHOLDERS[category]}
              className="min-h-[120px] border-border bg-bg-input text-txt-primary placeholder:text-txt-tertiary"
              maxLength={5000}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={sending || !message.trim()}
            className="w-full bg-gradient-brand hover-lift"
          >
            {sending ? "Sending…" : "Send Feedback"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/feedback/feedback-modal.tsx
git commit -m "feat(feedback): add shared feedback modal component"
```

---

## Task 5: Floating Widget and Layout Integration

**Files:**
- Create: `src/components/feedback/feedback-widget.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create the floating widget**

Create `src/components/feedback/feedback-widget.tsx`:

```tsx
"use client";

import { MessageSquare } from "lucide-react";
import { useFeedbackStore } from "@/stores/feedback-store";

export function FeedbackWidget() {
  const open = useFeedbackStore((s) => s.open);

  return (
    <button
      onClick={() => open()}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-gradient-brand px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-transform hover:scale-105 active:scale-95 md:px-4 md:py-2.5"
      aria-label="Send feedback"
    >
      <MessageSquare className="h-4 w-4" />
      <span className="hidden md:inline">Feedback</span>
    </button>
  );
}
```

- [ ] **Step 2: Add FeedbackModal and FeedbackWidget to the app layout**

In `src/app/(app)/layout.tsx`, add the imports and components. The layout is a server component, so add the client components as JSX siblings:

Add imports:
```typescript
import { FeedbackModal } from "@/components/feedback/feedback-modal";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";
```

Add `<FeedbackModal />` and `<FeedbackWidget />` inside the returned JSX, as siblings to the existing content (after the closing `</main>` or at the end of the flex container):

```tsx
<FeedbackModal />
<FeedbackWidget />
```

- [ ] **Step 3: Verify locally**

Run: `npm run dev`
Expected: Floating "Feedback" button visible in bottom-right on all app pages. Clicking it opens the feedback modal. Submitting sends an email (check Resend dashboard or inbox).

- [ ] **Step 4: Commit**

```bash
git add src/components/feedback/feedback-widget.tsx src/app/(app)/layout.tsx
git commit -m "feat(feedback): add floating widget and integrate modal into app layout"
```

---

## Task 6: Sidebar Feedback Link

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add feedback button to sidebar**

In `src/components/layout/sidebar.tsx`:

1. Add imports:
```typescript
import { MessageSquarePlus } from "lucide-react";
import { useFeedbackStore } from "@/stores/feedback-store";
```

2. Inside the component, get the store action:
```typescript
const openFeedback = useFeedbackStore((s) => s.open);
```

3. After the `navItems.map(...)` block (below the Settings link), add a feedback button styled like a nav item:

```tsx
<button
  onClick={() => openFeedback()}
  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-txt-secondary transition-colors hover:bg-bg-card-hover hover:text-txt-primary"
>
  <MessageSquarePlus className="h-5 w-5" />
  Feedback
</button>
```

- [ ] **Step 2: Verify locally**

Run: `npm run dev`
Expected: "Feedback" appears in the sidebar below Settings. Clicking opens the modal.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat(feedback): add Feedback link to sidebar navigation"
```

---

## Task 7: Settings Help & Feedback Card

**Files:**
- Create: `src/components/settings/help-feedback-card.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Create the help & feedback card**

Create `src/components/settings/help-feedback-card.tsx`:

```tsx
"use client";

import { Mail, Phone, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useFeedbackStore } from "@/stores/feedback-store";

export function HelpFeedbackCard() {
  const open = useFeedbackStore((s) => s.open);

  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader>
        <CardTitle className="text-txt-primary">Help & Feedback</CardTitle>
        <CardDescription className="text-txt-secondary">
          We&apos;re building this for you — reach out anytime.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <a
            href="mailto:kolbey@coolbid.app"
            className="flex items-center gap-3 text-sm text-txt-secondary transition-colors hover:text-txt-primary"
          >
            <Mail className="h-4 w-4 text-accent-light" />
            kolbey@coolbid.app
          </a>
          <a
            href="tel:+14055551234"
            className="flex items-center gap-3 text-sm text-txt-secondary transition-colors hover:text-txt-primary"
          >
            <Phone className="h-4 w-4 text-accent-light" />
            (405) 555-1234
          </a>
        </div>
        <Button
          onClick={() => open()}
          className="w-full bg-gradient-brand hover-lift"
        >
          <MessageSquare className="mr-2 h-4 w-4" />
          Send Feedback
        </Button>
      </CardContent>
    </Card>
  );
}
```

> **Note:** Replace the phone number `(405) 555-1234` and `tel:` href with your real number before deploying.

- [ ] **Step 2: Add card to settings page**

In `src/app/(app)/settings/page.tsx`, add import and render the card after the existing Subscription Status card (or Team Section if present):

```typescript
import { HelpFeedbackCard } from "@/components/settings/help-feedback-card";
```

Add in the JSX after the last existing card:
```tsx
<HelpFeedbackCard />
```

- [ ] **Step 3: Verify locally**

Run: `npm run dev`, navigate to `/settings`.
Expected: "Help & Feedback" card visible with email, phone, and "Send Feedback" button. Email and phone are clickable. Button opens the feedback modal.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/help-feedback-card.tsx src/app/(app)/settings/page.tsx
git commit -m "feat(feedback): add Help & Feedback card to settings page"
```

---

## Task 8: Contextual Feedback Prompts

**Files:**
- Create: `src/components/feedback/feedback-prompt.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Create the reusable prompt banner component**

Create `src/components/feedback/feedback-prompt.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useFeedbackStore } from "@/stores/feedback-store";

interface FeedbackPromptProps {
  promptKey: "first_estimate" | "mid_trial" | "trial_expiring";
  message: string;
  show: boolean;
}

export function FeedbackPrompt({
  promptKey,
  message,
  show,
}: FeedbackPromptProps) {
  const [dismissed, setDismissed] = useState(true);
  const open = useFeedbackStore((s) => s.open);

  useEffect(() => {
    if (!show) return;

    async function checkSeen() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("feedback_prompts_seen")
        .eq("id", user.id)
        .single();

      const seen = (data?.feedback_prompts_seen as Record<string, boolean>) ?? {};
      if (!seen[promptKey]) {
        setDismissed(false);
      }
    }

    checkSeen();
  }, [show, promptKey]);

  async function dismiss() {
    setDismissed(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("feedback_prompts_seen")
      .eq("id", user.id)
      .single();

    const seen = (data?.feedback_prompts_seen as Record<string, boolean>) ?? {};
    await supabase
      .from("profiles")
      .update({
        feedback_prompts_seen: { ...seen, [promptKey]: true },
      })
      .eq("id", user.id);
  }

  if (dismissed || !show) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border border-border bg-accent-glow px-4 py-3 text-sm text-accent-light",
      )}
    >
      <span>{message}</span>
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            open();
            dismiss();
          }}
          className="font-medium underline underline-offset-2 hover:no-underline"
        >
          Share Feedback
        </button>
        <button
          onClick={dismiss}
          className="text-accent-light/60 transition-colors hover:text-accent-light"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add contextual prompts to the dashboard**

In `src/app/(app)/dashboard/page.tsx`, the dashboard is a server component. It already fetches profile and estimate data. Add the prompt logic:

1. Add import:
```typescript
import { FeedbackPrompt } from "@/components/feedback/feedback-prompt";
```

2. In the server component, compute prompt conditions from the data already fetched (profile and estimates):

```typescript
const estimateCount = estimates?.length ?? 0;
const isTrialing = profile?.subscription_status === "trialing";
const trialEndsAt = profile?.trial_ends_at
  ? new Date(profile.trial_ends_at)
  : null;
const daysLeft = trialEndsAt
  ? Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  : null;
const trialDayNumber = daysLeft !== null ? 30 - daysLeft : null;
```

3. Add the three prompts at the top of the page content (before the existing cards):

```tsx
<div className="space-y-3">
  <FeedbackPrompt
    promptKey="first_estimate"
    message="How was your first estimate? We'd love to hear your thoughts."
    show={estimateCount >= 1}
  />
  <FeedbackPrompt
    promptKey="mid_trial"
    message="You're a week in — anything we can improve?"
    show={isTrialing && trialDayNumber !== null && trialDayNumber >= 7}
  />
  <FeedbackPrompt
    promptKey="trial_expiring"
    message="Your trial ends soon. What would make CoolBid worth subscribing to?"
    show={isTrialing && daysLeft !== null && daysLeft <= 3}
  />
</div>
```

- [ ] **Step 3: Verify locally**

Run: `npm run dev`
Expected: 
- If the user has ≥1 estimate, the "first estimate" banner appears on the dashboard
- Clicking "Share Feedback" opens the modal and dismisses the banner
- Clicking X dismisses without opening modal
- Refreshing the page — dismissed banners stay dismissed (persisted in Supabase)

- [ ] **Step 4: Commit**

```bash
git add src/components/feedback/feedback-prompt.tsx src/app/(app)/dashboard/page.tsx
git commit -m "feat(feedback): add contextual feedback prompts to dashboard"
```

---

## Verification Checklist

After all tasks are complete, verify end-to-end:

- [ ] **Floating widget**: Visible on all `/dashboard`, `/estimates`, `/parts-database`, `/settings` pages. Click opens modal. Submit sends email to `kolbey@coolbid.app`.
- [ ] **Sidebar link**: "Feedback" appears below Settings. Opens modal.
- [ ] **Settings card**: "Help & Feedback" card on `/settings` shows email + phone. "Send Feedback" opens modal.
- [ ] **Contextual prompts**: Test each by manipulating profile data:
  - Set estimate count ≥ 1 → first_estimate banner appears
  - Set trial day ≥ 7 → mid_trial banner appears
  - Set trial days left ≤ 3 → trial_expiring banner appears
  - Dismiss each → refresh → stays dismissed
- [ ] **Email content**: Verify received emails include category, user info, plan, trial day, page URL, and message body.
- [ ] **Auth gate**: Log out → no floating widget, no feedback UI, no contact info visible.
- [ ] **Mobile**: Floating widget shows icon only (no text). Modal is usable on mobile widths.
