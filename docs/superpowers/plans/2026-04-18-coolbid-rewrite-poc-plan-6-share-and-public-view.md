# coolbid-rewrite-poc — Plan 6 of 7: Share & Public View

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contractor clicks Share on an estimate → a dialog asks for Detailed / Summary customer view → mints a public token → produces a `/q/<token>` URL that any homeowner (no login) can open to see a branded, print-ready proposal. Contractor can copy the link or (optional) send to the customer's email via Resend. Token can be revoked; revoked links return 410 Gone.

**Architecture:** New `estimate_share_tokens` table with a partial unique index (`UNIQUE (estimate_id) WHERE revoked_at IS NULL`) — at most one active token per estimate. Public route `/q/[token]` is auth-less; it uses the token as the authorization capability, then loads the estimate + bom + labor via the **service-role** client (RLS bypass). Pre-rendered in one round-trip, no hydration needed beyond print button.

**Customer-facing math:** Category rollup applies `margin_pct` uniformly as a multiplier so sum of displayed amounts equals `estimate.total` (within rounding). Unit prices never appear to the homeowner; line totals in Detailed mode are marked-up totals only.

**Tech Stack:** `/q/[token]` uses the existing Supabase admin client (ported in Plan 1). Token generation via `crypto.randomBytes(24).toString("base64url")`. Email via existing `resend` dep (optional path — works without Resend credentials, just disables the email button).

**Spec:** `docs/superpowers/specs/2026-04-18-coolbid-rewrite-poc-design.md` §6 (customer-facing share view) + parts of §3 (share_tokens table).

**Plan 5 handoff state:** POC repo `main` at `83dcd04`. Editor at `/estimates/[id]` is fully working. Share button exists but is disabled. Middleware exempts `/q/*` from auth redirects (set up in Plan 2).

**Commit discipline:** `feature/plan-6-share-and-public-view` in POC repo. Plan doc on `main` in coolbid via `/commit`. One commit per task.

---

## Task 1: Feature branch + plan import

- [ ] Step 1

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
git checkout main
git pull
git checkout -b feature/plan-6-share-and-public-view
cp /Users/kolbeypruitt/Workspace/coolbid/docs/superpowers/plans/2026-04-18-coolbid-rewrite-poc-plan-6-share-and-public-view.md \
   docs/plans/plan-6-share-and-public-view.md
git add docs/plans/plan-6-share-and-public-view.md
git commit -m "docs: import plan-6 (share + public view)"
```

---

## Task 2: Migration — estimate_share_tokens

**Files:**
- Create: `supabase/migrations/20260418140000_share_tokens.sql`

- [ ] **Step 1:** Write the migration

```sql
-- supabase/migrations/20260418140000_share_tokens.sql

create table public.estimate_share_tokens (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  token text not null unique,
  customer_view_at_share text not null check (customer_view_at_share in ('detailed','summary')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- At most one active token per estimate (partial unique index).
create unique index estimate_share_tokens_one_active_per_estimate
  on public.estimate_share_tokens (estimate_id)
  where revoked_at is null;

create index estimate_share_tokens_token_idx on public.estimate_share_tokens (token) where revoked_at is null;

comment on table public.estimate_share_tokens is 'Public share tokens for estimates. Lookups by token when un-revoked.';

alter table public.estimate_share_tokens enable row level security;

-- Contractor can see + insert + update their own tokens (via parent estimate)
create policy share_tokens_select_own on public.estimate_share_tokens
  for select using (
    exists (select 1 from public.estimates e where e.id = estimate_id and e.contractor_id = auth.uid())
  );
create policy share_tokens_insert_own on public.estimate_share_tokens
  for insert with check (
    exists (select 1 from public.estimates e where e.id = estimate_id and e.contractor_id = auth.uid())
  );
create policy share_tokens_update_own on public.estimate_share_tokens
  for update using (
    exists (select 1 from public.estimates e where e.id = estimate_id and e.contractor_id = auth.uid())
  ) with check (
    exists (select 1 from public.estimates e where e.id = estimate_id and e.contractor_id = auth.uid())
  );

-- Public lookup by token: the API route at /q/[token] uses the service-role client
-- to bypass RLS — we don't grant anon SELECT here.
```

- [ ] **Step 2:** Apply + verify

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx supabase db push
npx supabase db query --linked "select column_name from information_schema.columns where table_name='estimate_share_tokens' order by ordinal_position;"
```

Expected: 6 columns.

- [ ] **Step 3:** Commit

```bash
git add supabase/migrations/20260418140000_share_tokens.sql
git commit -m "feat(db): estimate_share_tokens + partial unique index + RLS"
```

---

## Task 3: Regenerate types

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx supabase gen types typescript --linked > src/types/database.ts
npx tsc --noEmit
git add src/types/database.ts
git commit -m "chore: regenerate types (share_tokens table)"
```

---

## Task 4: Rollup helper + tests

**Files:**
- Create: `src/lib/estimates/rollup.ts`
- Create: `src/lib/estimates/__tests__/rollup.test.ts`

- [ ] **Step 1:** Write the helper

```ts
// src/lib/estimates/rollup.ts

// Customer-facing rollup. Applies margin_pct uniformly so the sum of displayed
// category totals equals estimate.total (within per-line rounding).

export type RollupBomLine = {
  id: string;
  customer_category: string;
  name: string;
  unit: string;
  quantity: number;
  line_total: number; // pre-markup
};

export type RollupLaborLine = {
  id: string;
  category: string;
  hours: number;
  line_total: number; // pre-markup
};

export type DetailedLine = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  line_total: number; // customer-facing (markup applied)
};

export type DetailedCategory = {
  customer_category: string;
  items: DetailedLine[];
  subtotal: number;
};

export type DetailedLaborLine = {
  id: string;
  category: string;
  hours: number;
  line_total: number; // customer-facing
};

export type DetailedRollup = {
  categories: DetailedCategory[];
  labor_lines: DetailedLaborLine[];
  labor_subtotal: number;
  grand_total: number;
};

export type SummaryRow = {
  label: string;
  total: number;
};

export type SummaryRollup = {
  rows: SummaryRow[]; // includes an "Installation Labor" entry at the end if labor > 0
  grand_total: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function withMarkup(n: number, marginPct: number): number {
  return round2(n * (1 + marginPct / 100));
}

// Keep the display order of customer_categories stable based on the order
// first encountered in the BOM list. This matches how the contractor sees them
// in the editor (grouped but in order of emission / user addition).
function groupByCategoryStable<T extends { customer_category: string }>(
  items: T[],
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const existing = out.get(item.customer_category) ?? [];
    existing.push(item);
    out.set(item.customer_category, existing);
  }
  return out;
}

export function buildDetailedRollup(
  bomLines: RollupBomLine[],
  laborLines: RollupLaborLine[],
  marginPct: number,
): DetailedRollup {
  const grouped = groupByCategoryStable(bomLines);
  const categories: DetailedCategory[] = [];

  for (const [categoryName, items] of grouped.entries()) {
    const detailedItems: DetailedLine[] = items.map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      quantity: i.quantity,
      line_total: withMarkup(i.line_total, marginPct),
    }));
    const subtotal = round2(detailedItems.reduce((acc, i) => acc + i.line_total, 0));
    categories.push({ customer_category: categoryName, items: detailedItems, subtotal });
  }

  const detailedLabor: DetailedLaborLine[] = laborLines.map((l) => ({
    id: l.id,
    category: l.category,
    hours: l.hours,
    line_total: withMarkup(l.line_total, marginPct),
  }));
  const labor_subtotal = round2(detailedLabor.reduce((acc, l) => acc + l.line_total, 0));

  const categories_sum = round2(categories.reduce((acc, c) => acc + c.subtotal, 0));
  const grand_total = round2(categories_sum + labor_subtotal);

  return { categories, labor_lines: detailedLabor, labor_subtotal, grand_total };
}

export function buildSummaryRollup(
  bomLines: RollupBomLine[],
  laborLines: RollupLaborLine[],
  marginPct: number,
): SummaryRollup {
  const detailed = buildDetailedRollup(bomLines, laborLines, marginPct);
  const rows: SummaryRow[] = detailed.categories.map((c) => ({
    label: c.customer_category,
    total: c.subtotal,
  }));
  if (detailed.labor_subtotal > 0) {
    rows.push({ label: "Installation Labor", total: detailed.labor_subtotal });
  }
  return { rows, grand_total: detailed.grand_total };
}
```

- [ ] **Step 2:** Write tests

```ts
// src/lib/estimates/__tests__/rollup.test.ts
import { describe, it, expect } from "vitest";
import { buildDetailedRollup, buildSummaryRollup } from "../rollup";

const bom = [
  { id: "b1", customer_category: "Major Equipment", name: "3-ton condenser", unit: "each", quantity: 1, line_total: 2000 },
  { id: "b2", customer_category: "Major Equipment", name: "Evap coil", unit: "each", quantity: 1, line_total: 800 },
  { id: "b3", customer_category: "Refrigerant Line Set", name: "Copper line set", unit: "ft", quantity: 25, line_total: 250 },
  { id: "b4", customer_category: "Permits", name: "Permit", unit: "job", quantity: 1, line_total: 150 },
];

const labor = [
  { id: "l1", category: "Equipment Install", hours: 5, line_total: 475 },
  { id: "l2", category: "Refrigerant Work", hours: 2, line_total: 190 },
];

describe("buildDetailedRollup", () => {
  it("groups bom by customer_category preserving emission order", () => {
    const r = buildDetailedRollup(bom, labor, 0);
    expect(r.categories.map((c) => c.customer_category)).toEqual([
      "Major Equipment",
      "Refrigerant Line Set",
      "Permits",
    ]);
    expect(r.categories[0].items).toHaveLength(2);
  });

  it("applies margin uniformly to every line", () => {
    const r = buildDetailedRollup(bom, labor, 50);
    // Major Equipment: (2000 + 800) * 1.5 = 4200
    expect(r.categories[0].subtotal).toBe(4200);
    // Labor line: 475 * 1.5 = 712.50
    expect(r.labor_lines[0].line_total).toBe(712.5);
  });

  it("grand_total equals sum of category subtotals + labor subtotal", () => {
    const r = buildDetailedRollup(bom, labor, 35);
    const sum = r.categories.reduce((acc, c) => acc + c.subtotal, 0) + r.labor_subtotal;
    expect(r.grand_total).toBe(Math.round(sum * 100) / 100);
  });

  it("0% margin returns pre-markup line totals unchanged", () => {
    const r = buildDetailedRollup(bom, labor, 0);
    expect(r.categories[0].items[0].line_total).toBe(2000);
    expect(r.labor_subtotal).toBe(665); // 475 + 190
  });

  it("zero-priced lines contribute nothing", () => {
    const bomWithZero = [...bom, { id: "bz", customer_category: "Misc", name: "Unmapped", unit: "each", quantity: 3, line_total: 0 }];
    const r = buildDetailedRollup(bomWithZero, labor, 35);
    const miscCategory = r.categories.find((c) => c.customer_category === "Misc")!;
    expect(miscCategory.subtotal).toBe(0);
  });
});

describe("buildSummaryRollup", () => {
  it("returns one row per customer_category plus labor", () => {
    const r = buildSummaryRollup(bom, labor, 35);
    expect(r.rows.map((x) => x.label)).toEqual([
      "Major Equipment",
      "Refrigerant Line Set",
      "Permits",
      "Installation Labor",
    ]);
  });

  it("omits labor row when labor is zero", () => {
    const r = buildSummaryRollup(bom, [], 35);
    expect(r.rows.map((x) => x.label)).toEqual([
      "Major Equipment",
      "Refrigerant Line Set",
      "Permits",
    ]);
  });

  it("rows sum to grand_total within rounding", () => {
    const r = buildSummaryRollup(bom, labor, 35);
    const sum = r.rows.reduce((acc, x) => acc + x.total, 0);
    expect(Math.abs(sum - r.grand_total)).toBeLessThanOrEqual(0.05);
  });
});
```

- [ ] **Step 3:** Run tests + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npm test -- src/lib/estimates/__tests__/rollup.test.ts
git add src/lib/estimates/rollup.ts 'src/lib/estimates/__tests__/rollup.test.ts'
git commit -m "feat(estimates): rollup helper (detailed + summary customer views) + 8 tests"
```

Expected: 8 passing tests.

---

## Task 5: Share server actions

**Files:**
- Create: `src/lib/share/actions.ts`

- [ ] **Step 1:** Write the actions

```ts
// src/lib/share/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export type ShareResult =
  | { ok: true; token: string; url: string; customer_view: "detailed" | "summary" }
  | { ok: false; error: string };

export type RevokeResult = { ok: true } | { ok: false; error: string };

function mintTokenString(): string {
  return randomBytes(24).toString("base64url");
}

function shareUrl(token: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  return `${appUrl}/q/${token}`;
}

// Mint or re-mint a share token. If an active token exists, revoke it first.
export async function mintShareToken(
  estimateId: string,
  view: "detailed" | "summary",
): Promise<ShareResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  // Verify the estimate belongs to the user (RLS would catch it; belt-and-suspenders)
  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .select("id")
    .eq("id", estimateId)
    .eq("contractor_id", user.id)
    .maybeSingle();
  if (estErr || !estimate) return { ok: false, error: "estimate not found" };

  // Revoke any active token for this estimate
  const { error: revokeError } = await supabase
    .from("estimate_share_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("estimate_id", estimateId)
    .is("revoked_at", null);
  if (revokeError) return { ok: false, error: `revoke prior failed: ${revokeError.message}` };

  const token = mintTokenString();
  const { error: insertError } = await supabase
    .from("estimate_share_tokens")
    .insert({
      estimate_id: estimateId,
      token,
      customer_view_at_share: view,
    });
  if (insertError) return { ok: false, error: `mint failed: ${insertError.message}` };

  revalidatePath(`/estimates/${estimateId}`);
  return { ok: true, token, url: shareUrl(token), customer_view: view };
}

export async function revokeShareToken(estimateId: string): Promise<RevokeResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  const { error } = await supabase
    .from("estimate_share_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("estimate_id", estimateId)
    .is("revoked_at", null);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/estimates/${estimateId}`);
  return { ok: true };
}

// Best-effort email send via Resend. Silently no-ops if Resend is not configured.
export async function sendShareEmail(
  estimateId: string,
  recipientEmail: string,
  url: string,
): Promise<{ ok: boolean; error?: string; sent?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  // Confirm the estimate belongs to the user + load customer name + company name
  const { data: estimate } = await supabase
    .from("estimates")
    .select("customer_name, contractors(company_name)")
    .eq("id", estimateId)
    .eq("contractor_id", user.id)
    .maybeSingle();
  if (!estimate) return { ok: false, error: "estimate not found" };

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) return { ok: true, sent: false };

  const companyName = (estimate.contractors as { company_name: string | null } | null)?.company_name ?? "Your HVAC contractor";
  const customerName = estimate.customer_name ?? "there";

  const body = `Hi ${customerName},\n\n${companyName} has put together a proposal for you. You can review it here:\n\n${url}\n\nQuestions? Reply to this email or give us a call.\n\n— ${companyName}`;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(resendKey);
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL?.trim() || "estimates@coolbid.app",
      to: recipientEmail,
      subject: `${companyName} — your HVAC proposal`,
      text: body,
    });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, sent: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "email failed" };
  }
}
```

- [ ] **Step 2:** Verify + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
mkdir -p src/lib/share
npx tsc --noEmit && npm run lint
git add src/lib/share/actions.ts
git commit -m "feat(share): mint/revoke token actions + optional Resend email"
```

---

## Task 6: Share dialog component

**Files:**
- Create: `src/components/estimate-editor/share-dialog.tsx`

- [ ] **Step 1:** Write the dialog

```tsx
// src/components/estimate-editor/share-dialog.tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Copy, Mail, RotateCcw, Share2 } from "lucide-react";
import { mintShareToken, revokeShareToken, sendShareEmail } from "@/lib/share/actions";
import { toast } from "sonner";

type Props = {
  estimateId: string;
  defaultView: "detailed" | "summary";
  initialToken?: string | null;
  initialView?: "detailed" | "summary" | null;
  initialUrl?: string | null;
  customerEmail?: string | null;
  trigger?: React.ReactNode;
};

export function ShareDialog({
  estimateId,
  defaultView,
  initialToken,
  initialView,
  initialUrl,
  customerEmail,
  trigger,
}: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"detailed" | "summary">(initialView ?? defaultView);
  const [activeToken, setActiveToken] = useState<string | null>(initialToken ?? null);
  const [activeUrl, setActiveUrl] = useState<string | null>(initialUrl ?? null);
  const [pending, startTransition] = useTransition();
  const [emailTo, setEmailTo] = useState(customerEmail ?? "");

  function handleMint() {
    startTransition(async () => {
      const result = await mintShareToken(estimateId, view);
      if (result.ok) {
        setActiveToken(result.token);
        setActiveUrl(result.url);
        toast.success(`Share link created (${result.customer_view}).`);
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleRevoke() {
    if (!confirm("Revoke the current share link? The homeowner's link will stop working.")) return;
    startTransition(async () => {
      const result = await revokeShareToken(estimateId);
      if (result.ok) {
        setActiveToken(null);
        setActiveUrl(null);
        toast.success("Link revoked.");
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleCopy() {
    if (!activeUrl) return;
    void navigator.clipboard.writeText(activeUrl);
    toast.success("Copied!");
  }

  function handleEmail() {
    if (!activeUrl || !emailTo) return;
    startTransition(async () => {
      const result = await sendShareEmail(estimateId, emailTo, activeUrl);
      if (!result.ok) { toast.error(result.error ?? "email failed"); return; }
      if (result.sent) toast.success(`Email sent to ${emailTo}`);
      else toast.warning("Email skipped (Resend not configured). Copy the link instead.");
    });
  }

  const triggerEl = trigger ?? (
    <Button>
      <Share2 className="size-4 mr-2" />
      Share
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={triggerEl as React.ReactElement} />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share estimate</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Customer view</Label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="share_view" value="detailed"
                  checked={view === "detailed"}
                  onChange={() => setView("detailed")}
                  disabled={pending || !!activeToken}
                />
                Detailed
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="share_view" value="summary"
                  checked={view === "summary"}
                  onChange={() => setView("summary")}
                  disabled={pending || !!activeToken}
                />
                Summary
              </label>
            </div>
            {activeToken && (
              <p className="text-xs text-muted-foreground">
                View is locked at mint time. To change, revoke and re-share.
              </p>
            )}
          </div>

          {activeUrl ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="share-url">Share link</Label>
                <div className="flex gap-2">
                  <Input id="share-url" value={activeUrl} readOnly />
                  <Button variant="outline" size="sm" onClick={handleCopy} disabled={pending}>
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="share-email">Email to customer (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="share-email"
                    type="email"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="customer@example.com"
                    disabled={pending}
                  />
                  <Button variant="outline" size="sm" onClick={handleEmail} disabled={pending || !emailTo}>
                    <Mail className="size-4 mr-2" />
                    Send
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
        <DialogFooter>
          {activeToken ? (
            <Button variant="outline" onClick={handleRevoke} disabled={pending}>
              <RotateCcw className="size-4 mr-2" />
              Revoke
            </Button>
          ) : (
            <Button onClick={handleMint} disabled={pending}>
              {pending ? "Creating…" : "Create share link"}
            </Button>
          )}
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2:** Verify + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint
git add src/components/estimate-editor/share-dialog.tsx
git commit -m "feat(editor): share dialog (mint, copy, email, revoke)"
```

---

## Task 7: Wire Share button into `/estimates/[id]` page

**Files:**
- Modify: `src/app/(app)/estimates/[id]/page.tsx`
- Create: `src/lib/share/load.ts`

- [ ] **Step 1:** Write the loader

```ts
// src/lib/share/load.ts
import { createClient } from "@/lib/supabase/server";

export type ActiveShare = {
  token: string;
  url: string;
  customer_view: "detailed" | "summary";
};

export async function loadActiveShareForEstimate(estimateId: string): Promise<ActiveShare | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("estimate_share_tokens")
    .select("token, customer_view_at_share")
    .eq("estimate_id", estimateId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data) return null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  return {
    token: data.token,
    url: `${appUrl}/q/${data.token}`,
    customer_view: data.customer_view_at_share as "detailed" | "summary",
  };
}
```

- [ ] **Step 2:** Update the page to replace the disabled Share button with a real `<ShareDialog>`

Read the current `src/app/(app)/estimates/[id]/page.tsx`. Find the `<Button disabled ...>` line (the disabled Share button) and replace it with:

```tsx
<ShareDialog
  estimateId={estimate.id}
  defaultView={(estimate.customer_view as "detailed" | "summary") ?? "detailed"}
  initialToken={activeShare?.token}
  initialView={activeShare?.customer_view}
  initialUrl={activeShare?.url}
  customerEmail={estimate.customer_email}
/>
```

Add the imports at the top:
```tsx
import { ShareDialog } from "@/components/estimate-editor/share-dialog";
import { loadActiveShareForEstimate } from "@/lib/share/load";
```

Add the loader call inside the page (after `const { estimate, bomItems, laborLines } = loaded;`):
```tsx
const activeShare = await loadActiveShareForEstimate(estimate.id);
```

Remove any no-longer-used imports (the `Share2` + `Button` usages for the disabled button can stay or be removed depending on what you cleaned up).

- [ ] **Step 3:** Verify build + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint && npm run build
git add src/app/\(app\)/estimates/\[id\]/page.tsx src/lib/share/load.ts
git commit -m "feat(estimates): wire share dialog into editor page"
```

---

## Task 8: Public `/q/[token]` page — shell + share loader

**Files:**
- Create: `src/lib/share/resolve.ts`
- Create: `src/app/q/[token]/page.tsx`

- [ ] **Step 1:** Write a token-to-estimate resolver (uses admin client, bypasses RLS)

```ts
// src/lib/share/resolve.ts
// NOTE: this module relies on SUPABASE_SERVICE_ROLE_KEY at runtime. Next will
// throw if it's imported into a client component because the env var is
// server-only. Never import this from a "use client" file.
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  EstimateRow, BomItemRow, LaborLineRow,
} from "@/types/estimate";

export type ResolvedShare = {
  estimate: EstimateRow;
  bomItems: BomItemRow[];
  laborLines: LaborLineRow[];
  contractor: {
    company_name: string | null;
    phone: string | null;
    address: string | null;
  };
  customer_view: "detailed" | "summary";
};

const TOKEN_RE = /^[A-Za-z0-9_-]{10,64}$/;

export async function resolveShareToken(token: string): Promise<
  | { ok: true; data: ResolvedShare }
  | { ok: false; reason: "invalid" | "not_found" | "revoked" | "error"; message?: string }
> {
  if (!TOKEN_RE.test(token)) return { ok: false, reason: "invalid" };

  const admin = createAdminClient();

  const { data: share, error: shareError } = await admin
    .from("estimate_share_tokens")
    .select("estimate_id, customer_view_at_share, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (shareError) return { ok: false, reason: "error", message: shareError.message };
  if (!share) return { ok: false, reason: "not_found" };
  if (share.revoked_at) return { ok: false, reason: "revoked" };

  const [estResult, bomResult, laborResult] = await Promise.all([
    admin.from("estimates").select("*").eq("id", share.estimate_id).maybeSingle(),
    admin.from("estimate_bom_items").select("*").eq("estimate_id", share.estimate_id).order("position", { ascending: true }),
    admin.from("estimate_labor_lines").select("*").eq("estimate_id", share.estimate_id).order("position", { ascending: true }),
  ]);
  if (estResult.error || !estResult.data) return { ok: false, reason: "error", message: estResult.error?.message };

  const contractorId = estResult.data.contractor_id;
  const { data: contractor } = await admin
    .from("contractors")
    .select("company_name, phone, address")
    .eq("id", contractorId)
    .maybeSingle();

  return {
    ok: true,
    data: {
      estimate: estResult.data,
      bomItems: bomResult.data ?? [],
      laborLines: laborResult.data ?? [],
      contractor: {
        company_name: contractor?.company_name ?? null,
        phone: contractor?.phone ?? null,
        address: contractor?.address ?? null,
      },
      customer_view: share.customer_view_at_share as "detailed" | "summary",
    },
  };
}
```

- [ ] **Step 2:** Check `createAdminClient` is exported. Open `src/lib/supabase/admin.ts` and verify its export name. If it's `createClient` instead of `createAdminClient`, update the import in `resolve.ts` accordingly.

- [ ] **Step 3:** Write the public page shell

```tsx
// src/app/q/[token]/page.tsx
import { notFound } from "next/navigation";
import { resolveShareToken } from "@/lib/share/resolve";
import { calloutsFromRow } from "@/lib/estimates/load";
import { buildDetailedRollup, buildSummaryRollup, type RollupBomLine, type RollupLaborLine } from "@/lib/estimates/rollup";
import { PublicHeader } from "@/components/public/public-header";
import { PublicDetailed } from "@/components/public/public-detailed";
import { PublicSummary } from "@/components/public/public-summary";
import { PublicGoneView } from "@/components/public/public-gone";

export const dynamic = "force-dynamic";

export default async function PublicSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const result = await resolveShareToken(token);
  if (!result.ok) {
    if (result.reason === "revoked") return <PublicGoneView />;
    if (result.reason === "not_found") notFound();
    if (result.reason === "invalid") notFound();
    // error:
    notFound();
  }

  const { estimate, bomItems, laborLines, contractor, customer_view } = result.data;
  const marginPct = Number(estimate.margin_pct);

  const rollupBom: RollupBomLine[] = bomItems.map((b) => ({
    id: b.id,
    customer_category: b.customer_category,
    name: b.name,
    unit: b.unit,
    quantity: Number(b.quantity),
    line_total: Number(b.line_total),
  }));
  const rollupLabor: RollupLaborLine[] = laborLines.map((l) => ({
    id: l.id,
    category: l.category,
    hours: Number(l.hours),
    line_total: Number(l.line_total),
  }));

  const callouts = calloutsFromRow(estimate);

  return (
    <div className="min-h-screen bg-white text-zinc-900 print:bg-white">
      <div className="max-w-3xl mx-auto px-6 py-10 print:py-4 space-y-8">
        <PublicHeader
          companyName={contractor.company_name ?? "Your HVAC contractor"}
          companyPhone={contractor.phone}
          companyAddress={contractor.address}
          customerName={estimate.customer_name}
          customerAddress={estimate.customer_address}
          estimateShortId={estimate.id.slice(-6)}
          createdAt={new Date(estimate.created_at)}
          grandTotal={Number(estimate.total)}
        />

        {customer_view === "detailed" ? (
          <PublicDetailed
            narrative={estimate.narrative ?? ""}
            callouts={callouts}
            rollup={buildDetailedRollup(rollupBom, rollupLabor, marginPct)}
          />
        ) : (
          <PublicSummary
            narrative={estimate.narrative ?? ""}
            callouts={callouts}
            rollup={buildSummaryRollup(rollupBom, rollupLabor, marginPct)}
          />
        )}

        <footer className="pt-6 border-t text-sm text-zinc-500 text-center">
          <p className="font-semibold">Total: ${Number(estimate.total).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="mt-2 text-xs">Estimate #{estimate.id.slice(-6).toUpperCase()} · Prepared by {contractor.company_name ?? "your contractor"}</p>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 4:** Commit (next task writes the view components; build will break until they exist — that's OK within this branch)

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
mkdir -p 'src/app/q/[token]'
git add src/lib/share/resolve.ts 'src/app/q/[token]/page.tsx'
git commit -m "feat(share): /q/[token] page + token→estimate resolver (admin client)"
```

---

## Task 9: Public-view components

**Files:**
- Create: `src/components/public/public-header.tsx`
- Create: `src/components/public/public-gone.tsx`
- Create: `src/components/public/public-detailed.tsx`
- Create: `src/components/public/public-summary.tsx`

- [ ] **Step 1:** Shared header

```tsx
// src/components/public/public-header.tsx
type Props = {
  companyName: string;
  companyPhone: string | null;
  companyAddress: string | null;
  customerName: string | null;
  customerAddress: string | null;
  estimateShortId: string;
  createdAt: Date;
  grandTotal: number;
};

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function PublicHeader({
  companyName,
  companyPhone,
  companyAddress,
  customerName,
  customerAddress,
  estimateShortId,
  createdAt,
  grandTotal,
}: Props) {
  return (
    <header className="space-y-6 print:space-y-3">
      <div className="flex items-start justify-between print:flex-row flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold">{companyName}</h1>
          {companyPhone && <p className="text-sm text-zinc-600">{companyPhone}</p>}
          {companyAddress && <p className="text-sm text-zinc-600 whitespace-pre-line">{companyAddress}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Estimate #{estimateShortId.toUpperCase()}</p>
          <p className="text-xs text-zinc-500">{createdAt.toLocaleDateString()}</p>
        </div>
      </div>

      <div className="rounded-md border border-zinc-200 p-4 flex items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Prepared for</p>
          <p className="font-semibold">{customerName ?? "—"}</p>
          {customerAddress && <p className="text-sm text-zinc-600 whitespace-pre-line">{customerAddress}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Total</p>
          <p className="text-2xl font-bold tabular-nums">{formatUsd(grandTotal)}</p>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2:** Detailed view

```tsx
// src/components/public/public-detailed.tsx
import type { DetailedRollup } from "@/lib/estimates/rollup";

type Props = {
  narrative: string;
  callouts: string[];
  rollup: DetailedRollup;
};

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function PublicDetailed({ narrative, callouts, rollup }: Props) {
  return (
    <div className="space-y-8">
      {narrative && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold uppercase tracking-wide text-zinc-500">Scope of Work</h2>
          <p className="whitespace-pre-line leading-relaxed">{narrative}</p>
        </section>
      )}

      {callouts.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold uppercase tracking-wide text-zinc-500">Code & Compliance Notes</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {callouts.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold uppercase tracking-wide text-zinc-500">Equipment & Materials</h2>
        {rollup.categories.map((cat) => (
          <div key={cat.customer_category} className="space-y-1">
            <h3 className="font-semibold">{cat.customer_category}</h3>
            <table className="w-full text-sm">
              <tbody>
                {cat.items.map((item) => (
                  <tr key={item.id} className="border-b border-zinc-100">
                    <td className="py-1">{item.name}</td>
                    <td className="py-1 text-right tabular-nums text-zinc-600 w-32">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="py-1 text-right tabular-nums w-28">{formatUsd(item.line_total)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} className="py-2 text-right text-sm font-medium">Subtotal</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{formatUsd(cat.subtotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </section>

      {rollup.labor_lines.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold uppercase tracking-wide text-zinc-500">Labor</h2>
          <table className="w-full text-sm">
            <tbody>
              {rollup.labor_lines.map((line) => (
                <tr key={line.id} className="border-b border-zinc-100">
                  <td className="py-1">{line.category}</td>
                  <td className="py-1 text-right tabular-nums text-zinc-600 w-32">{line.hours} hr</td>
                  <td className="py-1 text-right tabular-nums w-28">{formatUsd(line.line_total)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={2} className="py-2 text-right text-sm font-medium">Labor subtotal</td>
                <td className="py-2 text-right font-semibold tabular-nums">{formatUsd(rollup.labor_subtotal)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3:** Summary view

```tsx
// src/components/public/public-summary.tsx
import type { SummaryRollup } from "@/lib/estimates/rollup";

type Props = {
  narrative: string;
  callouts: string[];
  rollup: SummaryRollup;
};

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function PublicSummary({ narrative, callouts, rollup }: Props) {
  return (
    <div className="space-y-8">
      {narrative && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold uppercase tracking-wide text-zinc-500">Scope of Work</h2>
          <p className="whitespace-pre-line leading-relaxed">{narrative}</p>
        </section>
      )}

      {callouts.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold uppercase tracking-wide text-zinc-500">Code & Compliance Notes</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {callouts.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold uppercase tracking-wide text-zinc-500">Your Investment</h2>
        <table className="w-full">
          <tbody>
            {rollup.rows.map((row) => (
              <tr key={row.label} className="border-b border-zinc-100">
                <td className="py-2">{row.label}</td>
                <td className="py-2 text-right tabular-nums font-medium">{formatUsd(row.total)}</td>
              </tr>
            ))}
            <tr>
              <td className="py-3 text-right font-semibold">Total</td>
              <td className="py-3 text-right text-xl font-bold tabular-nums">{formatUsd(rollup.grand_total)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
```

- [ ] **Step 4:** "Gone" state

```tsx
// src/components/public/public-gone.tsx
export function PublicGoneView() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-white text-zinc-900">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-2xl font-bold">Link expired</h1>
        <p className="text-zinc-600">
          This proposal link has been revoked by the contractor. Please contact them for a fresh link.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5:** Build + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
mkdir -p src/components/public
npx tsc --noEmit && npm run lint && npm run build
git add src/components/public/
git commit -m "feat(share): public header + detailed view + summary view + gone state"
```

---

## Task 10: Print stylesheet

**Files:**
- Modify: `src/app/globals.css` (append print rules)

- [ ] **Step 1:** Append print rules at the end of globals.css:

```css
@media print {
  @page {
    size: letter;
    margin: 0.5in;
  }

  body {
    background: white !important;
    color: #18181b !important;
    font-size: 11pt;
  }

  /* Hide anything marked with .print-hidden (no such elements yet but ready for future) */
  .print-hidden {
    display: none !important;
  }

  /* Keep tables from splitting awkwardly */
  table {
    page-break-inside: avoid;
  }

  /* Narrow link colors in print */
  a {
    color: inherit !important;
    text-decoration: none;
  }
}
```

- [ ] **Step 2:** Build + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run build
git add src/app/globals.css
git commit -m "feat(share): print stylesheet for /q/[token]"
```

---

## Task 11: Public route exception in proxy

**Files:**
- Verify: `src/lib/supabase/middleware.ts` already has `/q/` exempted (done in Plan 2)

- [ ] **Step 1:** Read `src/lib/supabase/middleware.ts` and verify that `path.startsWith("/q/")` is in the early-return list. If not, add it and commit. If already there (which it should be per Plan 2 Task 10), this task is a no-op and produces no commit.

- [ ] **Step 2:** If any change: commit.

```bash
# Only if a change was needed:
git add src/lib/supabase/middleware.ts
git commit -m "fix(proxy): ensure /q/ is exempt from auth redirects"
```

---

## Task 12: Smoke + merge

- [ ] **Step 1:** Tests + build pass

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint && npm run build
npm test
```

Expected: 29 total tests (21 prior + 8 rollup). Build clean, `/q/[token]` appears in route list.

- [ ] **Step 2:** REST smoke — mint a token via direct DB and hit the public URL

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
SUPABASE_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2)
SERVICE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2)

# Pick an existing estimate
EID=$(curl -s "$SUPABASE_URL/rest/v1/estimates?select=id&limit=1" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" | grep -oP '"id":"\K[^"]+' | head -1)
if [ -z "$EID" ]; then echo "No estimate exists — create one first"; exit 1; fi

# Mint a token for that estimate via direct insert
TOKEN="smoke$(openssl rand -hex 12)"
curl -sX POST "$SUPABASE_URL/rest/v1/estimate_share_tokens" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"estimate_id\":\"$EID\",\"token\":\"$TOKEN\",\"customer_view_at_share\":\"detailed\"}" \
  -H "Prefer: return=minimal"

# Boot dev, hit public URL
npm run dev &> /tmp/coolbid-poc-dev.log &
DEV_PID=$!
sleep 5
PORT=$(grep -oP 'http://localhost:\K[0-9]+' /tmp/coolbid-poc-dev.log | head -1)
echo "Public URL: http://localhost:$PORT/q/$TOKEN"

# Curl the public page and grep for expected content
curl -si "http://localhost:$PORT/q/$TOKEN" | head -30
curl -s "http://localhost:$PORT/q/$TOKEN" | grep -c "Scope of Work" || true

kill $DEV_PID 2>/dev/null

# Cleanup: revoke the smoke token
curl -sX PATCH "$SUPABASE_URL/rest/v1/estimate_share_tokens?token=eq.$TOKEN" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"revoked_at":"now()"}' > /dev/null
```

Expected: HTTP 200 response on the public URL, `Scope of Work` appears in rendered HTML.

- [ ] **Step 3:** Manual browser smoke (USER ACTION)

Report DONE_WITH_CONCERNS and hand the user:

1. `npm run dev`
2. Sign in, open an existing estimate `/estimates/<id>`
3. Click Share (no longer greyed out) → dialog appears
4. Choose Detailed → click "Create share link" → URL appears
5. Click Copy → open URL in an incognito tab → verify:
   - Company name + phone + address in header
   - Customer name + address
   - Grand total visible top + bottom
   - Scope of Work prose, Code callouts bulleted, Equipment & Materials grouped by category with line totals (no unit prices shown), Labor table with hours + line totals, labor subtotal
   - No "Saving…" flashes, no auth redirect
6. Back in contractor tab → click Share again → dialog shows the active URL
7. Click Revoke → confirm → reload the public URL → "Link expired" page renders
8. Back to the editor → click Share → mint a NEW link as "Summary" → open in incognito → verify the abbreviated rollup table

- [ ] **Step 4:** After smoke passes, merge + push

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
git checkout main
git merge --no-ff feature/plan-6-share-and-public-view -m "feat: complete Plan 6 — share + public view"
git branch -d feature/plan-6-share-and-public-view
git push origin main
```

## Plan 6 Done — what works now

✅ Contractor can share an estimate → Detailed or Summary public link
✅ Homeowner can open the link (no login), see branded proposal with scope + callouts + priced breakdown
✅ Revoke kills the link cleanly (410-ish "Link expired" page)
✅ Re-share mints a fresh link, old one stays revoked
✅ Optional email delivery via Resend (falls back to copy-paste)
✅ Print-ready CSS for homeowner → "Save as PDF"

## Deferred / fast-follow

- Contractor logo upload + display (spec says `brand/` bucket + `logo_storage_path` — Plan 2 has the column but no UI)
- Email delivery status tracking (right now: fire-and-forget with toast on Resend error)
- "Revoke & re-share" as one click
- PDF download button on the public view (browser Save-as-PDF works today)
- Accept / decline link on the public view
- Analytics (how many times was this link viewed)

## Next: Plan 7 — Polish (dashboard, estimates list, smoke tests, PDF)
