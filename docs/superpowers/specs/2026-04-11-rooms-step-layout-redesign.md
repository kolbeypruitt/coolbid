# Rooms Step Layout Redesign

## Context

The current rooms step uses a side-by-side two-column layout where room cards get *more* space (1.2fr) than the floorplan canvas (1fr). The canvas overlay was added to help verify room detection accuracy, but the canvas is too small to be effective. Room cards are also unnecessarily tall, making the page feel cramped.

The goal is to make the floorplan canvas the hero of this screen — it's the primary tool for verifying room detection — and make room cards compact enough that they don't dominate.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Layout | Stacked — full-width canvas on top, cards below |
| Card detail level | All fields visible, compact styling (no expand/collapse) |
| Card columns | 3 columns at desktop |
| Canvas-to-card selection | Highlight only, no auto-scroll to card |
| Responsive | Single column on mobile, 2 cols on md, 3 cols on lg+ |

## Changes

### 1. Layout structure (`rooms-step.tsx`)

**Current:** `grid gap-4 lg:grid-cols-[minmax(300px,1fr)_minmax(300px,1.2fr)]` — side-by-side

**New:** Single column stack — canvas section first, cards section below. No grid columns needed.

- Remove the two-column grid wrapper
- Canvas section: full width, remove `lg:sticky lg:top-4 lg:self-start`
- Cards section: full width below canvas

### 2. Card grid (`rooms-step.tsx` line 241)

**Current:** `grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3`

**New:** `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3` — explicit 3-column at desktop

### 3. Card compactness (`rooms-step.tsx` lines 258-375)

Tighten spacing on each card:
- Reduce padding from `p-4` to `p-3`
- Reduce header margin from `mb-3` to `mb-2`
- Reduce footer margin from `mt-3` to `mt-2`
- Reduce gap in the 2-col field grid from `gap-2` to `gap-1.5`
- Reduce label spacing from `space-y-1` to `space-y-0.5`

### 4. Remove auto-scroll behavior (`rooms-step.tsx` lines 117-122)

Remove the `useEffect` that scrolls selected card into view. The canvas stays visible and cards just highlight in place.

### 5. Remove cardRefs

With auto-scroll removed, `cardRefs` is dead code. Remove the ref, the `Map`, and the `ref` callback on each card div.

## Files to modify

- `src/components/estimator/rooms-step.tsx` — all changes are in this single file

## Verification

1. Run `pnpm dev` and navigate to an estimate with rooms
2. Confirm canvas renders full-width on top
3. Confirm room cards appear in 3 columns below on desktop
4. Click a room on the canvas — card highlights but page does not scroll
5. Click a card — canvas highlights the room
6. Resize browser: confirm 1 col on mobile, 2 on md, 3 on lg+
7. Run existing tests: `pnpm test` (FloorplanCanvas tests should still pass)
