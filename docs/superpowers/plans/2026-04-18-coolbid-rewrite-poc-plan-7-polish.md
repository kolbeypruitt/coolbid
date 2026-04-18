# coolbid-rewrite-poc — Plan 7 of 7: Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app feel like a real SaaS instead of a showcase. Replace the two remaining placeholder pages (`/dashboard` and `/estimates`) with real content. Add contractor-logo upload and render the logo on the public share view. Add minimal smoke-test infrastructure so prompt-iteration is cheap. Auto-transition estimates from `draft` to `sent` when a share link is minted so the list view shows meaningful status.

**Architecture:** Thin polish plan. No new migrations beyond a storage bucket for brand assets. Most of the work is small server components + tiny server actions + one storage-upload flow.

**Explicit non-goals (stay deferred):**
- PDF download on the public view (homeowner can still browser-print). Port from coolbid in a separate effort.
- Accept/decline flow.
- Analytics / view tracking.
- Estimate duplication / delete UI (use Supabase Studio for now).
- Nameplate-photo + Manual J smoke scenarios (add once we have real samples).

**Tech Stack:** Next 16 server components, shadcn primitives already installed, Supabase Storage for the `brand/` bucket, a tiny Node script for the smoke runner.

**Spec:** `docs/superpowers/specs/2026-04-18-coolbid-rewrite-poc-design.md` §5.4 (dashboard list), §5.10 (catalog — already done in Plan 3), §7 (smoke tests), §5.11 (logo field exists in settings schema).

**Plan 6 handoff state:** POC repo `main` at `36540ae`. Editor, share, public view all working. Two placeholder pages left: `/dashboard` ("List of estimates, recent activity, …Plan 7 wires this up.") and `/estimates` ("List of estimates — wired in Plan 5." — mis-labeled in Plan 1; was actually Plan 7 all along).

**Commit discipline:** `feature/plan-7-polish` in POC repo. Plan doc on `main` in coolbid via `/commit`. One commit per task.

---

## Task 1: Feature branch + plan import

- [ ] Step 1

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
git checkout main
git pull
git checkout -b feature/plan-7-polish
cp /Users/kolbeypruitt/Workspace/coolbid/docs/superpowers/plans/2026-04-18-coolbid-rewrite-poc-plan-7-polish.md \
   docs/plans/plan-7-polish.md
git add docs/plans/plan-7-polish.md
git commit -m "docs: import plan-7 (polish)"
```

---

## Task 2: Auto-transition status on first share-mint

**Files:**
- Modify: `src/lib/share/actions.ts` (the `mintShareToken` function)

When a contractor mints a share link for the first time, the estimate's status should flip from `draft` to `sent` so the list view reflects reality.

- [ ] **Step 1:** Read the current `mintShareToken` function. After the successful `insert` into `estimate_share_tokens`, add:

```ts
// After the insert into estimate_share_tokens succeeds, promote the estimate
// to 'sent' if it's still 'draft'. Don't demote anything that's been archived.
await supabase
  .from("estimates")
  .update({ status: "sent" })
  .eq("id", estimateId)
  .eq("contractor_id", user.id)
  .eq("status", "draft");
```

Don't fail the whole action if this UPDATE errors — the share link is the primary success path. Log silently (or swallow) the error.

- [ ] **Step 2:** Verify + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint
git add src/lib/share/actions.ts
git commit -m "feat(share): auto-transition estimate to 'sent' on first share-mint"
```

---

## Task 3: Estimates list loader

**Files:**
- Modify: `src/lib/estimates/load.ts` (append a new exported function)

- [ ] **Step 1:** Append this to `src/lib/estimates/load.ts`:

```ts
export type EstimateListItem = {
  id: string;
  customer_name: string | null;
  status: "draft" | "sent" | "archived";
  total: number;
  created_at: string;
  updated_at: string;
};

export async function loadContractorEstimates(limit?: number): Promise<EstimateListItem[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from("estimates")
    .select("id, customer_name, status, total, created_at, updated_at")
    .eq("contractor_id", user.id)
    .order("updated_at", { ascending: false });
  if (typeof limit === "number") query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    console.error("loadContractorEstimates:", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    customer_name: r.customer_name,
    status: r.status as "draft" | "sent" | "archived",
    total: Number(r.total),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}
```

- [ ] **Step 2:** Verify + commit

```bash
npx tsc --noEmit
git add src/lib/estimates/load.ts
git commit -m "feat(estimates): loadContractorEstimates list loader"
```

---

## Task 4: /estimates list page

**Files:**
- Modify: `src/app/(app)/estimates/page.tsx`

- [ ] **Step 1:** Replace the placeholder with the real list:

```tsx
// src/app/(app)/estimates/page.tsx
import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { loadContractorEstimates, type EstimateListItem } from "@/lib/estimates/load";

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function StatusBadge({ status }: { status: EstimateListItem["status"] }) {
  const style =
    status === "draft" ? "bg-zinc-100 text-zinc-800" :
    status === "sent" ? "bg-green-100 text-green-800" :
    "bg-zinc-200 text-zinc-600";
  return (
    <Badge variant="outline" className={`text-xs font-normal ${style}`}>
      {status}
    </Badge>
  );
}

export default async function EstimatesListPage() {
  const items = await loadContractorEstimates();

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Estimates</h1>
          <p className="text-muted-foreground">{items.length} total</p>
        </div>
        <Button asChild>
          <Link href="/estimates/new">
            <Plus className="size-4 mr-2" />
            New estimate
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed rounded-md p-12 text-center space-y-3">
          <FileText className="size-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">No estimates yet.</p>
          <Button asChild>
            <Link href="/estimates/new">Create your first estimate</Link>
          </Button>
        </div>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link href={`/estimates/${item.id}`} className="hover:underline">
                      {item.customer_name || "Untitled"}
                    </Link>
                    <div className="text-xs text-muted-foreground font-mono">
                      {item.id.slice(-6).toUpperCase()}
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={item.status} /></TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatUsd(item.total)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(item.updated_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
```

**Note on `<Button asChild>`:** per the memory-flagged base-ui quirk, `asChild` may not exist. If tsc complains, swap to `<Link href="..." className={buttonVariants()}>` with `buttonVariants` imported from `@/components/ui/button` and `cn` from `@/lib/utils`. The same pattern was used on the landing page.

- [ ] **Step 2:** Build + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint && npm run build
git add 'src/app/(app)/estimates/page.tsx'
git commit -m "feat(estimates): real list page with status badges + empty state"
```

---

## Task 5: Dashboard page

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1:** Replace the placeholder:

```tsx
// src/app/(app)/dashboard/page.tsx
import Link from "next/link";
import { Plus, FileText, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { loadContractorEstimates, type EstimateListItem } from "@/lib/estimates/load";

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function StatusBadge({ status }: { status: EstimateListItem["status"] }) {
  const style =
    status === "draft" ? "bg-zinc-100 text-zinc-800" :
    status === "sent" ? "bg-green-100 text-green-800" :
    "bg-zinc-200 text-zinc-600";
  return (
    <Badge variant="outline" className={`text-xs font-normal ${style}`}>
      {status}
    </Badge>
  );
}

export default async function DashboardPage() {
  const recent = await loadContractorEstimates(10);

  const sentTotal = recent
    .filter((e) => e.status === "sent")
    .reduce((acc, e) => acc + e.total, 0);
  const sentCount = recent.filter((e) => e.status === "sent").length;

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Button asChild>
          <Link href="/estimates/new">
            <Plus className="size-4 mr-2" />
            New estimate
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent estimates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recent.length}</div>
            <p className="text-xs text-muted-foreground">of last 10 shown</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sent (last 10)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sentCount}</div>
            <p className="text-xs text-muted-foreground">shared with a customer</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="size-4" />
              Sent total (last 10)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatUsd(sentTotal)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent</h2>
          <Link href="/estimates" className="text-sm text-muted-foreground hover:text-foreground">
            View all →
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="border border-dashed rounded-md p-12 text-center space-y-3">
            <FileText className="size-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No estimates yet.</p>
            <Button asChild>
              <Link href="/estimates/new">Create your first estimate</Link>
            </Button>
          </div>
        ) : (
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {recent.map((item) => (
                  <tr key={item.id} className="border-b border-zinc-100 last:border-b-0">
                    <td className="p-3">
                      <Link href={`/estimates/${item.id}`} className="hover:underline font-medium">
                        {item.customer_name || "Untitled"}
                      </Link>
                    </td>
                    <td className="p-3"><StatusBadge status={item.status} /></td>
                    <td className="p-3 text-right tabular-nums">{formatUsd(item.total)}</td>
                    <td className="p-3 text-right text-muted-foreground text-xs whitespace-nowrap">
                      {new Date(item.updated_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

Same `asChild` caveat applies — swap to `buttonVariants` pattern if needed.

- [ ] **Step 2:** Build + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint && npm run build
git add 'src/app/(app)/dashboard/page.tsx'
git commit -m "feat(dashboard): real dashboard with recent estimates + totals"
```

---

## Task 6: Brand storage bucket

**Files:**
- Create: `supabase/migrations/20260418150000_brand_bucket.sql`

- [ ] **Step 1:** Migration

```sql
-- supabase/migrations/20260418150000_brand_bucket.sql

-- Storage bucket for contractor brand assets (logos).
-- Public=true so we can use the standard public URL in the share view
-- without signed URLs. Only the contractor can write/delete; anyone can read.

insert into storage.buckets (id, name, public)
values ('brand', 'brand', true)
on conflict (id) do update set public = excluded.public;

-- RLS: path must start with the contractor's user id.
-- Pattern: brand/<contractor_id>/logo.<ext>
create policy "contractor can upload own brand assets" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'brand'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "contractor can update own brand assets" on storage.objects
  for update to authenticated using (
    bucket_id = 'brand'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "contractor can delete own brand assets" on storage.objects
  for delete to authenticated using (
    bucket_id = 'brand'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public SELECT is implicit via public=true; no policy needed.
```

- [ ] **Step 2:** Apply + verify

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx supabase db push
npx supabase db query --linked "select id, name, public from storage.buckets where id='brand';"
```

Expected: one row with `public = t`.

- [ ] **Step 3:** Commit

```bash
git add supabase/migrations/20260418150000_brand_bucket.sql
git commit -m "feat(db): brand storage bucket (public-read, contractor-scoped writes)"
```

---

## Task 7: Logo upload server action

**Files:**
- Create: `src/lib/contractors/logo-actions.ts`

- [ ] **Step 1:** Write it

```ts
// src/lib/contractors/logo-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type LogoActionResult = { ok: true; path: string } | { ok: false; error: string };

// Client uploads directly via the supabase-js client; this action writes the
// path to contractors.logo_storage_path and revalidates the settings page.
export async function setContractorLogoPath(storagePath: string | null): Promise<LogoActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  // If we're clearing the logo, ALSO try to delete the previous file from Storage.
  // If we're setting a new path, we leave old files behind (cheap; housekeeping later).
  if (storagePath === null) {
    const { data: existing } = await supabase
      .from("contractors")
      .select("logo_storage_path")
      .eq("id", user.id)
      .maybeSingle();
    if (existing?.logo_storage_path) {
      // Best-effort delete
      await supabase.storage.from("brand").remove([existing.logo_storage_path]);
    }
  }

  const { error } = await supabase
    .from("contractors")
    .update({ logo_storage_path: storagePath })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  revalidatePath("/onboarding");
  return { ok: true, path: storagePath ?? "" };
}
```

- [ ] **Step 2:** Verify + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint
git add src/lib/contractors/logo-actions.ts
git commit -m "feat(contractors): setContractorLogoPath server action"
```

---

## Task 8: Logo upload UI in settings

**Files:**
- Create: `src/components/settings/logo-upload.tsx`
- Modify: `src/app/(app)/settings/page.tsx` (add the logo upload component above the form)

- [ ] **Step 1:** Write the client component

```tsx
// src/components/settings/logo-upload.tsx
"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { setContractorLogoPath } from "@/lib/contractors/logo-actions";
import { toast } from "sonner";

type Props = {
  contractorId: string;
  initialPath: string | null;
  supabaseUrl: string;
};

function publicUrl(supabaseUrl: string, path: string | null): string | null {
  if (!path) return null;
  return `${supabaseUrl}/storage/v1/object/public/brand/${path}`;
}

export function LogoUpload({ contractorId, initialPath, supabaseUrl }: Props) {
  const [path, setPath] = useState<string | null>(initialPath);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const url = publicUrl(supabaseUrl, path);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB");
      return;
    }

    const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
    const supabase = createClient();
    const storagePath = `${contractorId}/logo.${ext}`;

    startTransition(async () => {
      const { error: uploadError } = await supabase.storage.from("brand").upload(storagePath, file, {
        cacheControl: "60",
        upsert: true,
        contentType: file.type,
      });
      if (uploadError) {
        toast.error(`Upload failed: ${uploadError.message}`);
        return;
      }
      const result = await setContractorLogoPath(storagePath);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPath(storagePath);
      toast.success("Logo saved");
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  function handleClear() {
    if (!confirm("Remove your logo?")) return;
    startTransition(async () => {
      const result = await setContractorLogoPath(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPath(null);
      toast.success("Logo removed");
    });
  }

  return (
    <div className="space-y-3">
      <Label>Company logo</Label>
      <div className="flex items-center gap-4">
        {url ? (
          <div className="h-16 w-16 rounded border flex items-center justify-center bg-white overflow-hidden">
            <Image
              src={url}
              alt="Company logo"
              width={64}
              height={64}
              unoptimized
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : (
          <div className="h-16 w-16 rounded border border-dashed flex items-center justify-center text-xs text-muted-foreground">
            no logo
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={handleFile}
            className="hidden"
            id="logo-file"
          />
          <Button variant="outline" size="sm" asChild disabled={pending}>
            <label htmlFor="logo-file" className="cursor-pointer">
              <Upload className="size-4 mr-2" />
              {path ? "Replace" : "Upload"}
            </label>
          </Button>
          {path && (
            <Button variant="ghost" size="sm" onClick={handleClear} disabled={pending}>
              <Trash2 className="size-4 mr-2" />
              Remove
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Shown on homeowner proposal pages. Max 2MB. PNG / JPG / WebP / SVG.</p>
    </div>
  );
}
```

**Note on `<Button asChild>`:** if it doesn't work, replace the asChild pattern with a direct `<label htmlFor>` styled via `buttonVariants`. The `asChild` inside a button wrapping a `<label>` is the trickiest form-element + shadcn interaction — expect to iterate on this one.

Additionally: `next/image` needs the Supabase hostname whitelisted for non-`unoptimized` usage. We pass `unoptimized` here so we don't have to touch `next.config.ts`. Fast-follow: add `remotePatterns` in next.config.

- [ ] **Step 2:** Update `src/app/(app)/settings/page.tsx` to render the logo upload above the form

Read the current file and insert a LogoUpload component right after the `<h1>Settings</h1>` and before the form. You'll need to pass `contractorId={user.id}`, `initialPath={row.logo_storage_path}`, and `supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}` (this is a public env var, safe in server components).

```tsx
import { LogoUpload } from "@/components/settings/logo-upload";
// ...
<h1 className="text-3xl font-bold mb-6">Settings</h1>
<div className="mb-8">
  <LogoUpload
    contractorId={user.id}
    initialPath={row.logo_storage_path}
    supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
  />
</div>
<OnboardingForm ... />
```

- [ ] **Step 3:** Verify build + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
mkdir -p src/components/settings
npx tsc --noEmit && npm run lint && npm run build
git add src/components/settings/logo-upload.tsx 'src/app/(app)/settings/page.tsx'
git commit -m "feat(settings): logo upload with preview + remove"
```

---

## Task 9: Logo display in public share view

**Files:**
- Modify: `src/lib/share/resolve.ts` (add logo path to the contractor data)
- Modify: `src/components/public/public-header.tsx` (render the logo when present)
- Modify: `src/app/q/[token]/page.tsx` (pass logo url down)

- [ ] **Step 1:** Update `resolve.ts` to also select `logo_storage_path`

Read the resolve.ts file. Find the `.select("company_name, phone, address")` and change to `.select("company_name, phone, address, logo_storage_path")`. Also extend the `ResolvedShare` type with `logo_url: string | null` and compute the public URL from the path (using `NEXT_PUBLIC_SUPABASE_URL`).

```ts
// in the contractor select
const { data: contractor } = await admin
  .from("contractors")
  .select("company_name, phone, address, logo_storage_path")
  .eq("id", contractorId)
  .maybeSingle();

// compute logo_url
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const logoUrl = contractor?.logo_storage_path && supabaseUrl
  ? `${supabaseUrl}/storage/v1/object/public/brand/${contractor.logo_storage_path}`
  : null;

// update the returned object
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
      logo_url: logoUrl,
    },
    customer_view: share.customer_view_at_share as "detailed" | "summary",
  },
};
```

Add `logo_url: string | null` to the `contractor` field of the `ResolvedShare` type.

- [ ] **Step 2:** Update `public-header.tsx` to accept + render a `logoUrl` prop

Read the component. Add `logoUrl?: string | null` to Props. In the `<div>` that contains the company name, replace the plain `<h1>{companyName}</h1>` with:

```tsx
<div className="flex items-center gap-3">
  {logoUrl && (
    <img
      src={logoUrl}
      alt={`${companyName} logo`}
      className="h-12 max-w-[160px] object-contain"
    />
  )}
  <div>
    <h1 className="text-2xl font-bold">{companyName}</h1>
    {companyPhone && <p className="text-sm text-zinc-600">{companyPhone}</p>}
    {companyAddress && <p className="text-sm text-zinc-600 whitespace-pre-line">{companyAddress}</p>}
  </div>
</div>
```

(Using `<img>` not `next/image` — this is a public share view, we don't need optimization and want to avoid next.config hostname config friction.)

- [ ] **Step 3:** Update `/q/[token]/page.tsx` to pass the `logoUrl` to `<PublicHeader>`

```tsx
<PublicHeader
  companyName={contractor.company_name ?? "Your HVAC contractor"}
  companyPhone={contractor.phone}
  companyAddress={contractor.address}
  logoUrl={contractor.logo_url}
  customerName={estimate.customer_name}
  // ...rest unchanged
/>
```

- [ ] **Step 4:** Build + commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint && npm run build
git add src/lib/share/resolve.ts src/components/public/public-header.tsx 'src/app/q/[token]/page.tsx'
git commit -m "feat(share): render contractor logo on public proposal header"
```

---

## Task 10: Smoke test scaffolding (3 scenarios)

**Files:**
- Create: `tools/smoke/README.md`
- Create: `tools/smoke/scenarios/changeout.txt`
- Create: `tools/smoke/scenarios/newbuild.txt`
- Create: `tools/smoke/scenarios/mini-split.txt`
- Create: `tools/smoke/run.mjs`
- Modify: `package.json` (add `smoke:estimate` script)

This is a developer-only tool for iterating on the AI prompt. It calls `generateEstimate` directly (no DB, no user session) and prints the parsed output. Run against a scenario file when you change prompts to eyeball regressions.

- [ ] **Step 1:** Write the three scenario files

`tools/smoke/scenarios/changeout.txt`:
```
Replace existing 3-ton split AC system. 1,800 sqft ranch-style home in central Oklahoma. Existing ductwork is in decent shape and will be reused. Air handler is in the attic, tight access. Homeowner prefers a two-stage variable-speed system for quieter operation. Existing refrigerant is R-410A.
```

`tools/smoke/scenarios/newbuild.txt`:
```
New construction, 2,400 sqft two-story home in south Oklahoma City. 4-ton system, heat pump with electric resistance backup. Mechanical closet on the second floor. New ductwork will be run through the ceiling cavities, flex in the runs and metal at the plenum. Local code requires a permit and inspection. Builder wants a better-tier Wi-Fi thermostat.
```

`tools/smoke/scenarios/mini-split.txt`:
```
Replace 3.5 ton AC with heat strips with a 4-zone ductless mini-split. Two heads in the open living area, one in each of the two bedrooms, all 12,000 BTU. Homeowner prefers a Gree system. Central Oklahoma.
```

- [ ] **Step 2:** Write the runner

`tools/smoke/run.mjs`:
```js
#!/usr/bin/env node
// tools/smoke/run.mjs
//
// Usage: node --env-file=.env.local tools/smoke/run.mjs tools/smoke/scenarios/changeout.txt
//
// Loads the scenario text, calls generateEstimate directly (no DB, no auth),
// and prints the parsed output + usage. Expensive — hits the real Anthropic API.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve as pathResolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = pathResolve(__dirname, "..", "..");

const scenarioPath = process.argv[2];
if (!scenarioPath) {
  console.error("Usage: node --env-file=.env.local tools/smoke/run.mjs <scenario.txt>");
  process.exit(2);
}

const text = await readFile(scenarioPath, "utf8");
console.log("Scenario:", scenarioPath);
console.log("Intake text (first 200 chars):", text.slice(0, 200).trim());
console.log();

// Dynamic import so tsx isn't required — we use the SDK directly here to avoid
// Next's module-alias resolution in a plain Node script. Instead, replicate the
// minimal pipeline by invoking generate-estimate via tsx would be complex; the
// simpler smoke path is to use the Anthropic SDK directly with the same prompts.

const { SYSTEM_PROMPT } = await import(pathResolve(repoRoot, "src/lib/ai/prompts/system.ts"));
const Anthropic = (await import("@anthropic-ai/sdk")).default;
const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY not set");
  process.exit(1);
}
const client = new Anthropic({ apiKey });
const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";

console.log("Calling Claude (model:", model + ")...");
const t0 = Date.now();
const response = await client.messages.create({
  model,
  max_tokens: 8192,
  system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: [{ type: "text", text: text.trim() }] }],
});
const ms = Date.now() - t0;

const responseText = response.content
  .filter((b) => b.type === "text")
  .map((b) => b.text)
  .join("");

console.log(`\nResponse (${ms}ms, ${response.usage.input_tokens} in / ${response.usage.output_tokens} out, cache-read ${response.usage.cache_read_input_tokens ?? 0}):\n`);

const stripped = responseText.replace(/^```json\n?/, "").replace(/\n?```\s*$/, "").trim();

try {
  const parsed = JSON.parse(stripped);
  console.log(JSON.stringify(parsed, null, 2));

  console.log("\n--- Summary ---");
  console.log("system_type:", parsed.parsed_job_spec?.system_type);
  console.log("tonnage:", parsed.parsed_job_spec?.tonnage);
  console.log("bom_items:", parsed.bom_items?.length);
  const slots = new Set((parsed.bom_items ?? []).map((i) => i.slot));
  console.log("unique slots:", Array.from(slots).join(", "));
  console.log("labor_lines:", parsed.labor_lines?.length);
  const totalHours = (parsed.labor_lines ?? []).reduce((acc, l) => acc + Number(l.hours), 0);
  console.log("total labor hours:", totalHours);
  console.log("narrative length:", (parsed.narrative || "").length);
  console.log("code_callouts:", (parsed.code_callouts ?? []).length);
} catch (e) {
  console.error("PARSE ERROR:", e.message);
  console.log("Raw response:", stripped);
  process.exit(1);
}
```

**Important caveat:** importing a `.ts` file from a `.mjs` script via Node doesn't work directly. Node can't parse TypeScript. Options:
- Use `tsx` from the project: `npx tsx tools/smoke/run.mjs <file>` — but tsx isn't in deps
- Use `node --experimental-strip-types tools/smoke/run.mjs <file>` (Node 24+) — works for simple TS but the `system.ts` file imports `@/lib/catalog/slot-taxonomy` using the `@/` alias which Node can't resolve
- Simplest: in run.mjs, import the SYSTEM_PROMPT as a string constant. Either: inline a copy of it OR export the concatenated string from a dedicated `.mjs` file (annoying to keep in sync)
- **Best: use `tsx` as a one-off install** — add to devDependencies and invoke via `npx tsx`

Let me switch this to `tsx` path:
- Add `"tsx": "^4.19.0"` to `devDependencies` in package.json
- Run the scenario via `npm run smoke:estimate -- tools/smoke/scenarios/changeout.txt`
- The script becomes a `.ts` file that can use the actual imports

Update Step 2 accordingly — rewrite `run.mjs` as `run.ts`:

`tools/smoke/run.ts`:
```ts
// tools/smoke/run.ts
// Usage: npm run smoke:estimate -- tools/smoke/scenarios/changeout.txt

import { readFile } from "node:fs/promises";
import { generateEstimate } from "../../src/lib/ai/generate-estimate";

const scenarioPath = process.argv[2];
if (!scenarioPath) {
  console.error("Usage: npm run smoke:estimate -- <scenario.txt>");
  process.exit(2);
}

const text = await readFile(scenarioPath, "utf8");
console.log("Scenario:", scenarioPath);
console.log("Intake text (first 200 chars):", text.slice(0, 200).trim());
console.log();

const t0 = Date.now();
const result = await generateEstimate({ intakeText: text.trim(), attachments: [] });
const ms = Date.now() - t0;

if (!result.ok) {
  console.error(`FAILED (${ms}ms):`, result.error);
  if (result.rawText) console.log("Raw:", result.rawText.slice(0, 1000));
  process.exit(1);
}

console.log(`OK (${ms}ms, in/${result.usage.inputTokens} out/${result.usage.outputTokens} cache-read/${result.usage.cacheReadTokens})\n`);
console.log(JSON.stringify(result.output, null, 2));

console.log("\n--- Summary ---");
console.log("system_type:", result.output.parsed_job_spec.system_type);
console.log("tonnage:", result.output.parsed_job_spec.tonnage);
console.log("bom_items:", result.output.bom_items.length);
const slots = new Set(result.output.bom_items.map((i) => i.slot));
console.log("unique slots:", Array.from(slots).join(", "));
console.log("labor_lines:", result.output.labor_lines.length);
const totalHours = result.output.labor_lines.reduce((acc, l) => acc + l.hours, 0);
console.log("total labor hours:", totalHours);
console.log("narrative length:", result.output.narrative.length);
console.log("code_callouts:", result.output.code_callouts.length);
```

- [ ] **Step 3:** `tools/smoke/README.md`

```markdown
# Smoke tests

Hand-curated HVAC intake scenarios for iterating on the AI prompt.

## Run

```
npm run smoke:estimate -- tools/smoke/scenarios/changeout.txt
```

Requires `ANTHROPIC_API_KEY` in `.env.local`. Hits the real API — costs a few cents per run.

## What to look for

- `system_type` should match the scenario intent
- `bom_items` count should be sensible (10–20 for a typical changeout; 15+ for multi-zone)
- `unique slots` list should NOT contain invalid slots (Zod catches these)
- `labor_lines` count should be 5–7
- `total labor hours` should be reasonable (6–10 for a simple changeout, 20+ for multi-zone)
- `narrative length` > 200 chars
- `code_callouts` should be 0–3; don't look like cut-and-paste generic disclaimers

If you change `src/lib/ai/prompts/*`, run all three scenarios and eyeball the diffs.
```

- [ ] **Step 4:** Update `package.json`

Add to `devDependencies`: `"tsx": "^4.19.0"` (let npm resolve to latest compatible)

Add to `scripts`:
```json
"smoke:estimate": "tsx tools/smoke/run.ts"
```

Run `npm install` to install tsx. Then test the setup:
```bash
npm install
npm run smoke:estimate -- tools/smoke/scenarios/changeout.txt
```

Expected: outputs JSON + summary, exits 0. This DOES hit the real API — one run is fine for validation.

- [ ] **Step 5:** Commit

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
git add tools/smoke/ package.json package-lock.json
git commit -m "feat(tools): smoke test scaffolding (3 scenarios + runner) + tsx devdep"
```

---

## Task 11: Final validation + merge

- [ ] **Step 1:** Full validation

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint && npm run build
npm test
```

Expected: 29/29 tests pass. Clean build.

- [ ] **Step 2:** Quick REST smoke — dashboard + estimates list both render for an onboarded user

```bash
# Just verify the endpoints 200 (auth redirect is expected if not signed in)
npm run dev &> /tmp/coolbid-poc-dev.log &
DEV_PID=$!
sleep 5
PORT=$(grep -oP 'http://localhost:\K[0-9]+' /tmp/coolbid-poc-dev.log | head -1)
curl -si http://localhost:$PORT/dashboard | head -5
curl -si http://localhost:$PORT/estimates | head -5
kill $DEV_PID 2>/dev/null
```

Both should 307 to `/auth/login` (logged out) — that's fine; means the route exists.

- [ ] **Step 3:** Report DONE_WITH_CONCERNS with browser-smoke checklist

Give the user:

1. `npm run dev`
2. Sign in (onboarded user)
3. Visit `/dashboard` → 3 stat cards, recent list, "+ New Estimate" CTA
4. Visit `/estimates` → list of all estimates with status badges (mint-a-share on one → badge flips to `sent`)
5. Visit `/settings` → logo uploader at top. Upload a PNG → preview appears. Hit "Remove" → previews clears.
6. Open a shared proposal you've already minted → confirm logo appears in header (if you uploaded one)
7. Optional: `npm run smoke:estimate -- tools/smoke/scenarios/mini-split.txt` → JSON output, no errors.

DO NOT MERGE until user confirms.

- [ ] **Step 4:** After user confirms, merge

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
git checkout main
git merge --no-ff feature/plan-7-polish -m "feat: complete Plan 7 — polish (dashboard, list, logo, smoke tests)"
git branch -d feature/plan-7-polish
git push origin main
```

## Plan 7 Done — what works now

✅ Dashboard at `/dashboard` with 3 stat cards + recent-10 list + new-estimate CTA
✅ Estimates list at `/estimates` with status badges, total, updated date
✅ `estimate.status` auto-flips `draft → sent` on first share-mint
✅ Logo upload in settings → public proposal header shows the logo
✅ Brand storage bucket (public-read, contractor-scoped writes)
✅ Smoke test harness (3 scenarios + tsx runner) for prompt iteration

## The whole POC (Plans 1–7)

- 7 plans, ~60 commits on `origin/main`
- 7 schema migrations (contractors, catalogs + seed fn, house-catalog seed, estimates+bom+labor, share tokens, brand bucket)
- 29 unit tests
- ~17 routes (4 public, 5 auth, 5 app, 3 API)
- End-to-end: signup → onboard → intake → AI → price → edit → share → homeowner sees branded proposal

## Fast-follow list (post-POC)

1. PDF download button on `/q/[token]` (port coolbid's `@react-pdf/renderer` setup)
2. Logo upload: add Supabase hostname to `next.config.ts` `remotePatterns` so `next/image` can optimize
3. Accept / decline flow on the public view
4. Analytics — log each time a public token is viewed
5. Estimate duplication + delete
6. Archive filter / workflow
7. Nameplate + Manual J smoke scenarios (real sample files)
8. Catalog "sync from house catalog" button (Plan 2's fast-follow)
9. Mini-split smoke now that the slot taxonomy has them — confirm pricing lands in the right ballpark
10. Re-enable email confirmation in Supabase Auth for production

## POC validation checkpoint

Use the app for 2–3 real customer bids. If it saves meaningful time AND produces proposals a homeowner would accept, start the transplant into coolbid's production SaaS shell (auth already exists there, Stripe is wired, accept/decline is built, team accounts exist). Transplant = migrate the AI pipeline + catalog + share view into the existing coolbid repo, replace coolbid's floorplan-first flow with this intake flow, and invite Greenfield to start bidding.
