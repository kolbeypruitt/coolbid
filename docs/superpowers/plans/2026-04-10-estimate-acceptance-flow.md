# Estimate Acceptance Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let homeowners accept or decline an estimate from the shared quote page, and show the decision on the contractor's detail page.

**Architecture:** Server Action called from a `"use client"` component on the public `/q/[token]` page. Schema migration adds timestamp columns. No new API routes. No email notifications (deferred).

**Tech Stack:** Next.js App Router, Server Actions, Supabase (admin client), TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-10-estimate-acceptance-flow-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/007_estimate_acceptance.sql` | Add `accepted_at`, `declined_at` to estimates; `responded_at` to estimate_shares |
| Modify | `src/types/database.ts:83-137` | Add new nullable columns to estimates Row/Insert/Update types |
| Modify | `src/types/database.ts:493-517` | Add `responded_at` to estimate_shares Row/Insert/Update types |
| Create | `src/lib/share/respond.ts` | Server Action: validate token, update estimate status + timestamps |
| Create | `src/components/share/accept-decline-buttons.tsx` | Client component: accept/decline buttons + confirmation banner |
| Modify | `src/app/q/[token]/page.tsx:188-224` | Render AcceptDeclineButtons between total and footer |
| Modify | `src/app/(app)/estimates/[id]/page.tsx:130-143` | Show accepted_at/declined_at timestamp next to status badge |

---

### Task 1: Schema Migration

**Files:**
- Create: `supabase/migrations/007_estimate_acceptance.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- Estimate acceptance: homeowner accept/decline timestamps
-- ============================================================================

-- Acceptance/decline timestamps on estimates
alter table estimates
  add column accepted_at  timestamptz,
  add column declined_at  timestamptz;

-- Track which share link was used to respond
alter table estimate_shares
  add column responded_at timestamptz;
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db reset`
Expected: Database resets and all migrations apply cleanly, including 007.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_estimate_acceptance.sql
git commit -m "feat: add accepted_at, declined_at, responded_at columns (007)"
```

---

### Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types/database.ts:83-137` (estimates)
- Modify: `src/types/database.ts:493-517` (estimate_shares)

- [ ] **Step 1: Add columns to estimates Row type**

In `src/types/database.ts`, inside `estimates.Row` (after `scope_of_work: string | null;` on line 109), add:

```typescript
          accepted_at: string | null;
          declined_at: string | null;
```

- [ ] **Step 2: Add columns to estimates Insert type**

Inside `estimates.Insert` (after `scope_of_work?: string | null;` on line 134), add:

```typescript
          accepted_at?: string | null;
          declined_at?: string | null;
```

- [ ] **Step 3: Add column to estimate_shares Row type**

Inside `estimate_shares.Row` (after `view_count: number;` on line 503), add:

```typescript
          responded_at: string | null;
```

- [ ] **Step 4: Add column to estimate_shares Insert type**

Inside `estimate_shares.Insert` (after `view_count?: number;` on line 513), add:

```typescript
          responded_at?: string | null;
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add accepted_at, declined_at, responded_at to database types"
```

---

### Task 3: Server Action — `respondToEstimate`

**Files:**
- Create: `src/lib/share/respond.ts`

- [ ] **Step 1: Create the server action**

Create `src/lib/share/respond.ts`:

```typescript
"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];

export type RespondResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "already_responded" };

export async function respondToEstimate(
  token: string,
  decision: "accepted" | "declined",
): Promise<RespondResult> {
  const supabase = createAdminClient();

  // 1. Look up the share by token
  const { data: share, error: shareError } = await supabase
    .from("estimate_shares")
    .select("id, estimate_id, revoked_at, expires_at, responded_at")
    .eq("token", token)
    .maybeSingle();

  if (shareError || !share) {
    return { ok: false, reason: "not_found" };
  }

  if (share.revoked_at) return { ok: false, reason: "expired" };
  if (new Date(share.expires_at) < new Date()) return { ok: false, reason: "expired" };
  if (share.responded_at) return { ok: false, reason: "already_responded" };

  // 2. Fetch the estimate and verify it's still in "sent" status
  const { data: estimate } = await supabase
    .from("estimates")
    .select("id, status")
    .eq("id", share.estimate_id)
    .single();

  if (!estimate) return { ok: false, reason: "not_found" };

  const est = estimate as Pick<EstimateRow, "id" | "status">;
  if (est.status !== "sent") return { ok: false, reason: "already_responded" };

  // 3. Update estimate status + timestamp
  const now = new Date().toISOString();
  const timestampField = decision === "accepted" ? "accepted_at" : "declined_at";

  const { error: updateError } = await supabase
    .from("estimates")
    .update({ status: decision, [timestampField]: now })
    .eq("id", est.id);

  if (updateError) {
    throw new Error(`Failed to update estimate: ${updateError.message}`);
  }

  // 4. Mark the share as responded
  await supabase
    .from("estimate_shares")
    .update({ responded_at: now })
    .eq("id", share.id);

  return { ok: true };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/share/respond.ts
git commit -m "feat: add respondToEstimate server action"
```

---

### Task 4: Homeowner UI — `AcceptDeclineButtons`

**Files:**
- Create: `src/components/share/accept-decline-buttons.tsx`

- [ ] **Step 1: Create the client component**

Create `src/components/share/accept-decline-buttons.tsx`:

```tsx
"use client";

import { useTransition, useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { respondToEstimate } from "@/lib/share/respond";

export function AcceptDeclineButtons({
  token,
  estimateStatus,
}: {
  token: string;
  estimateStatus: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [localStatus, setLocalStatus] = useState(estimateStatus);

  if (localStatus === "accepted") {
    return (
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-6 py-4">
          <Check className="h-5 w-5 text-green-500" />
          <div>
            <p className="font-semibold text-green-500">Estimate Accepted</p>
            <p className="text-sm text-txt-secondary">
              Your contractor has been notified
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (localStatus === "declined") {
    return (
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-6 py-4">
          <X className="h-5 w-5 text-red-500" />
          <div>
            <p className="font-semibold text-red-500">Estimate Declined</p>
            <p className="text-sm text-txt-secondary">
              Your contractor has been notified
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (localStatus !== "sent") return null;

  function handleRespond(decision: "accepted" | "declined") {
    startTransition(async () => {
      const result = await respondToEstimate(token, decision);
      if (result.ok) {
        setLocalStatus(decision);
      }
    });
  }

  return (
    <div className="flex items-center justify-center gap-3">
      <button
        onClick={() => handleRespond("accepted")}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-8 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(6,182,212,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(6,182,212,0.35)] disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        Accept Estimate
      </button>
      <button
        onClick={() => handleRespond("declined")}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-8 py-3 text-sm font-medium text-txt-secondary transition-colors hover:border-red-500/30 hover:text-red-400 disabled:opacity-50"
      >
        Decline
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/share/accept-decline-buttons.tsx
git commit -m "feat: add AcceptDeclineButtons client component"
```

---

### Task 5: Wire Up Public Page

**Files:**
- Modify: `src/app/q/[token]/page.tsx:1-6` (imports)
- Modify: `src/app/q/[token]/page.tsx:188-224` (between total section and footer)

- [ ] **Step 1: Add import**

In `src/app/q/[token]/page.tsx`, add to the imports (after line 5):

```typescript
import { AcceptDeclineButtons } from "@/components/share/accept-decline-buttons";
```

- [ ] **Step 2: Render the component**

In `src/app/q/[token]/page.tsx`, between the `{/* Message */}` section (line 204-209) and the `{/* Download button */}` footer (line 212), add:

```tsx
          {/* Accept / Decline */}
          <section className="mt-8">
            <AcceptDeclineButtons token={token} estimateStatus={est.status} />
          </section>
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Manual verification**

Start dev server: `npm run dev`

Test scenarios:
1. Visit `/q/[valid-token]` for a `sent` estimate → Accept and Decline buttons visible
2. Click Accept → buttons replaced with green "Estimate Accepted" banner
3. Refresh the page → banner persists (reads from DB)
4. Visit `/q/[valid-token]` for a `draft` estimate → no buttons shown
5. Visit an expired/revoked token → not-available page, no buttons

- [ ] **Step 5: Commit**

```bash
git add src/app/q/[token]/page.tsx
git commit -m "feat: render accept/decline buttons on shared estimate page"
```

---

### Task 6: Contractor Detail Page — Show Response Timestamp

**Files:**
- Modify: `src/app/(app)/estimates/[id]/page.tsx:130-143`

- [ ] **Step 1: Add timestamp display next to status badge**

In `src/app/(app)/estimates/[id]/page.tsx`, find the header section (around line 133):

```tsx
            <Badge variant={statusVariant(est.status)}>{est.status}</Badge>
```

Replace with:

```tsx
            <Badge variant={statusVariant(est.status)}>{est.status}</Badge>
            {est.accepted_at && (
              <span className="text-sm text-txt-secondary">
                Accepted on{" "}
                {new Date(est.accepted_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
            {est.declined_at && (
              <span className="text-sm text-txt-secondary">
                Declined on{" "}
                {new Date(est.declined_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Manual verification**

In dev server, view an estimate that has been accepted or declined. Verify the timestamp displays next to the badge.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/estimates/[id]/page.tsx
git commit -m "feat: show acceptance/decline timestamp on contractor detail page"
```
