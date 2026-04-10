# Estimate Acceptance Flow

**Issue:** #13 — Homeowner accept/decline from share link
**Date:** 2026-04-10
**Status:** Design approved

## Summary

Let homeowners accept or decline an estimate directly from the shared quote page (`/q/[token]`). Display the decision on the contractor's estimate detail page. Email notifications deferred to a separate ticket.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Decline reason | Skip | Keep decline flow simple; add later if needed |
| Contact info on accept | Skip | Single-click accept, no friction |
| Response finality | First response is final | No take-backs; simplifies state management |
| Mutation approach | Server Action | No new API routes; page is already server-rendered |
| UI pattern | Inline buttons, no confirm dialog | Low-risk action, homeowner is already reviewing intentionally |
| Email notifications | Deferred | Separate ticket; no outbound email infra exists yet |

## Schema Migration — `007_estimate_acceptance.sql`

Add columns to `estimates`:
- `accepted_at` timestamptz, nullable, default null
- `declined_at` timestamptz, nullable, default null

Add column to `estimate_shares`:
- `responded_at` timestamptz, nullable, default null

No new tables. No changes to the existing `status` check constraint — it already allows `accepted` and `declined`.

## Server Action — `respondToEstimate`

**File:** `src/lib/share/respond.ts`

**Signature:**
```ts
export async function respondToEstimate(
  token: string,
  decision: "accepted" | "declined"
): Promise<{ ok: true } | { ok: false; reason: string }>
```

**Logic:**
1. Look up share by token (admin client, no auth required)
2. Validate: share exists, not revoked, not expired
3. Fetch linked estimate; validate status is `sent` (reject if already accepted/declined/draft)
4. Update `estimates`: set `status` to decision, set `accepted_at` or `declined_at` to `now()`
5. Update `estimate_shares`: set `responded_at` to `now()`
6. Return `{ ok: true }`

**Error cases:**
- Token not found → `{ ok: false, reason: "not_found" }`
- Share revoked/expired → `{ ok: false, reason: "expired" }`
- Estimate not in `sent` status → `{ ok: false, reason: "already_responded" }`

Uses `createAdminClient()` since this is a public page with no authenticated user. Token possession is the authorization.

## Homeowner UI — `AcceptDeclineButtons`

**File:** `src/components/share/accept-decline-buttons.tsx`

**Props:**
```ts
{ token: string; estimateStatus: string }
```

**Behavior:**
- `"use client"` component
- If `estimateStatus === "sent"`: render Accept (brand gradient primary button) and Decline (ghost button)
- If `estimateStatus === "accepted"`: render green confirmation banner — "Estimate Accepted — Your contractor has been notified"
- If `estimateStatus === "declined"`: render red confirmation banner — "Estimate Declined — Your contractor has been notified"
- On button click: call server action via `useTransition`, show loading/disabled state, then update local state to show confirmation banner
- No page reload needed — local state swap is sufficient

**Placement:** Between the total price section and the download PDF button on `/q/[token]/page.tsx`.

## Public Page Changes — `/q/[token]/page.tsx`

- Import `AcceptDeclineButtons`
- Render it between the total section and the footer, passing `token` and `est.status`
- No other changes to the page

## Contractor Detail Page — `/estimates/[id]/page.tsx`

- When `est.accepted_at` is set: show timestamp next to the status badge (e.g., "Accepted on Apr 10, 2026")
- When `est.declined_at` is set: show timestamp next to the status badge (e.g., "Declined on Apr 10, 2026")
- Uses the existing `Badge` component — no new components needed

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Estimate edited after sent → reverts to draft | Share link revoked (existing behavior). Homeowner sees "quote has expired" page. No accept/decline buttons. |
| Multiple share links (only one active) | Active link shows buttons. Revoked links show not-available page. |
| Expired share link | Not-available page shown. No buttons. |
| Race condition: two tabs click simultaneously | Server action checks status is `sent` before updating. Second request sees `accepted`/`declined` and returns `already_responded`. |
| Homeowner returns after responding | Page reads `est.status` from DB — shows confirmation banner, not buttons. |

## Out of Scope

- Email notifications to contractor (separate ticket)
- Decline reason collection
- Homeowner contact info collection on accept
- Changing decision after responding
- Dashboard activity feed / badge for status changes
- E-signature, payments, scheduling
