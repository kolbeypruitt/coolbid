# Canvas Floorplan Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render detected room polygons on top of the original floorplan image using Canvas, with an invisible SVG overlay for click/hover interactions, integrated into the rooms-step of the estimator.

**Architecture:** Canvas draws the floorplan image with semi-transparent polygon fills and stroke outlines. An absolutely-positioned SVG layer on top provides DOM-based hit targets for each room (click to select, hover to highlight). Selected room syncs with the existing room card editor. Polygon vertex data must be threaded from the geometry service through the analyze API to the frontend — currently only bbox/centroid survive.

**Tech Stack:** HTML Canvas API, SVG for interaction layer, React refs, existing Zustand store (`useEstimator`)

---

## File Structure

| File | Responsibility |
|------|----------------|
| **Create:** `src/components/estimator/floorplan-canvas.tsx` | Canvas rendering + SVG interaction overlay component |
| **Modify:** `src/types/hvac.ts` | Add `vertices` field to `Room` type |
| **Modify:** `src/lib/analyze/schema.ts` | Add `vertices` to Zod `RoomSchema` |
| **Modify:** `src/app/api/analyze/route.ts` | Thread polygon vertices into the analysis response |
| **Modify:** `src/hooks/use-estimator.ts` | Add `selectedRoomIndex` state + action |
| **Modify:** `src/components/estimator/rooms-step.tsx` | Integrate `FloorplanCanvas`, wire up room selection |
| **Modify:** `src/lib/estimates/db-row-to-room.ts` | Handle `vertices` field when loading saved estimates |
| **Test:** `src/components/estimator/__tests__/floorplan-canvas.test.tsx` | Canvas + SVG overlay unit tests |

---

### Task 1: Thread polygon vertices through the API response

The geometry service already returns `vertices` per polygon, but `formatPolygonsForPrompt` only sends bbox/centroid to Claude, and Claude's JSON response only includes bbox/centroid. The vertices need to be carried alongside the analysis result back to the frontend.

**Files:**
- Modify: `src/types/hvac.ts:13-23`
- Modify: `src/lib/analyze/schema.ts:62-90`
- Modify: `src/app/api/analyze/route.ts:220-310`

- [ ] **Step 1: Add `vertices` to the Room type**

In `src/types/hvac.ts`, add the `vertices` field to the `Room` type:

```ts
export type Room = {
  name: string; type: RoomType; floor: number; estimated_sqft: number;
  width_ft: number; length_ft: number; window_count: number;
  exterior_walls: number; ceiling_height: number; notes: string;
  conditioned: boolean;
  unit?: number;
  polygon_id: string;
  vertices: { x: number; y: number }[];
  bbox: { x: number; y: number; width: number; height: number };
  centroid: { x: number; y: number };
  adjacent_rooms: string[];
};
```

- [ ] **Step 2: Add `vertices` to the Zod schema**

In `src/lib/analyze/schema.ts`, add a `vertices` field to `RoomSchema`. Claude won't return vertices (it doesn't know them), so this must default to an empty array:

```ts
vertices: z.array(z.object({
  x: z.coerce.number().min(0).max(1),
  y: z.coerce.number().min(0).max(1),
})).default([]),
```

Add this right after the `polygon_id` field (line ~75).

- [ ] **Step 3: Merge geometry vertices into the validated result**

In `src/app/api/analyze/route.ts`, after `validateAnalysis` produces the final `result` (~line 303), merge the original polygon vertices back in by matching `polygon_id`:

```ts
// Build a lookup: polygon_id → vertices from the geometry service
const vertexLookup = new Map<string, { x: number; y: number }[]>();
for (const { polygons } of polygonsByFloor) {
  for (const p of polygons) {
    vertexLookup.set(p.id, p.vertices);
  }
}

// Attach vertices to each room by polygon_id
result.rooms = result.rooms.map((room) => ({
  ...room,
  vertices: vertexLookup.get(room.polygon_id) ?? [],
}));
```

Insert this block between `const result = validateAnalysis(...)` and the `incrementAiActionCount` call.

- [ ] **Step 4: Update DEFAULT_ROOM in the Zustand store**

In `src/hooks/use-estimator.ts`, add `vertices: []` to the `DEFAULT_ROOM` constant (~line 73):

```ts
const DEFAULT_ROOM: Room = {
  name: "New Room",
  type: "bedroom",
  floor: 1,
  estimated_sqft: 120,
  width_ft: 10,
  length_ft: 12,
  window_count: 1,
  exterior_walls: 1,
  ceiling_height: 8,
  notes: "",
  conditioned: true,
  polygon_id: "room_0",
  vertices: [],
  bbox: { x: 0, y: 0, width: 1, height: 1 },
  centroid: { x: 0.5, y: 0.5 },
  adjacent_rooms: [],
};
```

- [ ] **Step 5: Update db-row-to-room to handle vertices**

In `src/lib/estimates/db-row-to-room.ts`, add a default `vertices: []` when mapping database rows to Room objects. The database doesn't store vertices yet (they're ephemeral during analysis), so this is just a safe default:

Find where the Room object is constructed and add `vertices: []` to it.

- [ ] **Step 6: Run type check to verify no breakage**

Run: `npx tsc --noEmit`
Expected: No errors (all Room references now include `vertices`)

- [ ] **Step 7: Run existing tests**

Run: `npx vitest run src/lib/analyze/ src/lib/geometry/`
Expected: All pass (Zod schema defaults handle the new field)

- [ ] **Step 8: Commit**

```bash
git add src/types/hvac.ts src/lib/analyze/schema.ts src/app/api/analyze/route.ts src/hooks/use-estimator.ts src/lib/estimates/db-row-to-room.ts
git commit -m "feat: thread polygon vertices from geometry service through to frontend Room type"
```

---

### Task 2: Add `selectedRoomIndex` to the Zustand store

The canvas overlay needs to know which room is selected (for highlight) and allow clicking a room to select it.

**Files:**
- Modify: `src/hooks/use-estimator.ts`

- [ ] **Step 1: Add state and action**

Add to `EstimatorState` type (~line 17):

```ts
selectedRoomIndex: number | null;
```

Add to `EstimatorActions` type (~line 46):

```ts
setSelectedRoomIndex: (index: number | null) => void;
```

Add to `initialState()`:

```ts
selectedRoomIndex: null,
```

Add to the store implementation:

```ts
setSelectedRoomIndex: (index) => set({ selectedRoomIndex: index }),
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-estimator.ts
git commit -m "feat: add selectedRoomIndex state to estimator store"
```

---

### Task 3: Build the `FloorplanCanvas` component

This is the core component — a Canvas that draws the floorplan image with polygon overlays, plus an invisible SVG layer for DOM interactions.

**Files:**
- Create: `src/components/estimator/floorplan-canvas.tsx`

- [ ] **Step 1: Create the component file**

Create `src/components/estimator/floorplan-canvas.tsx`:

```tsx
"use client";

import { useRef, useEffect, useCallback } from "react";
import type { Room } from "@/types/hvac";

type Props = {
  /** Base64 data URL of the floorplan image */
  imageSrc: string;
  /** Rooms with normalized 0-1 geometry */
  rooms: Room[];
  /** Index of the currently selected room, or null */
  selectedIndex: number | null;
  /** Called when a room polygon is clicked */
  onSelectRoom: (index: number | null) => void;
  /** Index of the room currently hovered (managed internally or externally) */
  hoveredIndex?: number | null;
  /** Called when hover state changes */
  onHoverRoom?: (index: number | null) => void;
};

/** Color palette for room type categories */
const ROOM_COLORS: Record<string, string> = {
  master_bedroom: "59,130,246",  // blue
  bedroom: "99,102,241",         // indigo
  living_room: "34,197,94",      // green
  family_room: "34,197,94",
  kitchen: "249,115,22",         // orange
  dining_room: "234,179,8",      // yellow
  bathroom: "6,182,212",         // cyan
  half_bath: "6,182,212",
  hallway: "148,163,184",        // slate
  laundry: "168,85,247",         // purple
  office: "236,72,153",          // pink
  foyer: "148,163,184",
  garage: "107,114,128",         // gray
  default: "148,163,184",
};

function getRoomColor(type: string): string {
  return ROOM_COLORS[type] ?? ROOM_COLORS.default;
}

export function FloorplanCanvas({
  imageSrc,
  rooms,
  selectedIndex,
  onSelectRoom,
  hoveredIndex: externalHovered,
  onHoverRoom,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const hoveredIndex = externalHovered ?? null;

  // Load the floorplan image once
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      draw();
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Redraw when selection/hover/rooms change
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas size to container, respecting device pixel ratio
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Draw floorplan image scaled to fit
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // Draw room polygons
    rooms.forEach((room, i) => {
      const color = getRoomColor(room.type);
      const isSelected = i === selectedIndex;
      const isHovered = i === hoveredIndex;

      const hasVertices = room.vertices.length >= 3;

      ctx.beginPath();
      if (hasVertices) {
        // Draw actual polygon from vertices
        room.vertices.forEach((v, vi) => {
          const px = v.x * w;
          const py = v.y * h;
          vi === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.closePath();
      } else {
        // Fallback: draw bbox rectangle
        ctx.rect(
          room.bbox.x * w,
          room.bbox.y * h,
          room.bbox.width * w,
          room.bbox.height * h,
        );
      }

      // Fill
      const alpha = isSelected ? 0.35 : isHovered ? 0.25 : 0.15;
      ctx.fillStyle = `rgba(${color},${alpha})`;
      ctx.fill();

      // Stroke
      ctx.strokeStyle = `rgba(${color},${isSelected ? 1 : isHovered ? 0.8 : 0.5})`;
      ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1.5;
      ctx.stroke();

      // Label at centroid
      const cx = room.centroid.x * w;
      const cy = room.centroid.y * h;
      const fontSize = Math.max(10, Math.min(14, (room.bbox.width * w) / 8));
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Text shadow for readability
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillText(room.name, cx + 1, cy + 1);
      ctx.fillStyle = "#fff";
      ctx.fillText(room.name, cx, cy);
    });
  }, [rooms, selectedIndex, hoveredIndex]);

  // Redraw on state changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Redraw on resize
  useEffect(() => {
    const observer = new ResizeObserver(() => draw());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [draw]);

  // Build SVG viewBox to match container aspect ratio from the image
  const svgRooms = rooms.map((room, i) => {
    const hasVertices = room.vertices.length >= 3;
    if (hasVertices) {
      const points = room.vertices
        .map((v) => `${(v.x * 100).toFixed(2)},${(v.y * 100).toFixed(2)}`)
        .join(" ");
      return (
        <polygon
          key={i}
          points={points}
          fill="transparent"
          stroke="transparent"
          className="cursor-pointer"
          onClick={() => onSelectRoom(selectedIndex === i ? null : i)}
          onMouseEnter={() => onHoverRoom?.(i)}
          onMouseLeave={() => onHoverRoom?.(null)}
        />
      );
    }
    // Fallback: bbox rectangle
    return (
      <rect
        key={i}
        x={room.bbox.x * 100}
        y={room.bbox.y * 100}
        width={room.bbox.width * 100}
        height={room.bbox.height * 100}
        fill="transparent"
        stroke="transparent"
        className="cursor-pointer"
        onClick={() => onSelectRoom(selectedIndex === i ? null : i)}
        onMouseEnter={() => onHoverRoom?.(i)}
        onMouseLeave={() => onHoverRoom?.(null)}
      />
    );
  });

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border border-border bg-bg-input"
      style={{ aspectRatio: "4 / 3" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
      />
      {/* Invisible SVG overlay for DOM interactions */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-label="Room overlay — click a room to select it"
      >
        {svgRooms}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/estimator/floorplan-canvas.tsx
git commit -m "feat: add FloorplanCanvas component with canvas rendering and SVG interaction overlay"
```

---

### Task 4: Integrate `FloorplanCanvas` into rooms-step

Wire the canvas overlay into the existing rooms-step layout. The floorplan image sits on the left, room cards on the right. Clicking a room on the canvas highlights the corresponding card and vice versa.

**Files:**
- Modify: `src/components/estimator/rooms-step.tsx`

- [ ] **Step 1: Add imports and state**

At the top of `rooms-step.tsx`, add the import:

```ts
import { FloorplanCanvas } from "@/components/estimator/floorplan-canvas";
```

Update the destructured store values to include the new fields:

```ts
const {
  rooms,
  knownUnits,
  analysisResult,
  floorplanImg,
  pdfPages,
  selectedPages,
  selectedRoomIndex,
  updateRoom,
  removeRoom,
  addRoom,
  generateBom,
  setStep,
  setSelectedRoomIndex,
} = useEstimator();
```

Add local hover state:

```ts
const [hoveredRoomIndex, setHoveredRoomIndex] = useState<number | null>(null);
```

And the `useState` import at the top:

```ts
import { useState, useRef, useEffect } from "react";
```

- [ ] **Step 2: Resolve the display image**

After the store destructuring, compute which image to show. Use the first selected page's preview URL:

```ts
const displayImage = (() => {
  if (pdfPages.length > 0 && selectedPages.length > 0) {
    const page = pdfPages.find((p) => p.pageNum === selectedPages[0]);
    return page?.previewUrl ?? floorplanImg;
  }
  return floorplanImg;
})();
```

- [ ] **Step 3: Add scroll-to-card behavior**

Add a ref map and scroll effect so clicking a room on the canvas scrolls its card into view:

```ts
const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());

useEffect(() => {
  if (selectedRoomIndex != null) {
    const el = cardRefs.current.get(selectedRoomIndex);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}, [selectedRoomIndex]);
```

- [ ] **Step 4: Wrap the layout in a two-column grid**

Replace the outermost `<div className="space-y-4">` with a responsive two-column layout. The floorplan canvas goes on the left (sticky), room cards on the right:

```tsx
<div className="space-y-4">
  {/* Header row — unchanged */}
  <div className="flex flex-wrap items-center justify-between gap-3">
    {/* ... existing header content ... */}
  </div>

  {/* Two-column layout: canvas + room cards */}
  <div className="grid gap-4 lg:grid-cols-[minmax(300px,1fr)_minmax(300px,1.2fr)]">
    {/* Left: Floorplan canvas */}
    {displayImage && (
      <div className="lg:sticky lg:top-4 lg:self-start">
        <FloorplanCanvas
          imageSrc={displayImage}
          rooms={rooms}
          selectedIndex={selectedRoomIndex}
          onSelectRoom={setSelectedRoomIndex}
          hoveredIndex={hoveredRoomIndex}
          onHoverRoom={setHoveredRoomIndex}
        />
      </div>
    )}

    {/* Right: Room cards (existing groups rendering) */}
    <div className="space-y-3">
      {groups.map((group) => (
        {/* ... existing group/floor/card rendering ... */}
      ))}
    </div>
  </div>

  {/* Footer buttons — unchanged */}
  <div className="flex gap-2">
    {/* ... existing buttons ... */}
  </div>
</div>
```

- [ ] **Step 5: Add selection highlight to room cards**

On each room card `<div>`, add a visual ring when the card's index matches `selectedRoomIndex` or `hoveredRoomIndex`. Update the card wrapper:

```tsx
<div
  key={i}
  ref={(el) => { if (el) cardRefs.current.set(i, el); }}
  onClick={() => setSelectedRoomIndex(selectedRoomIndex === i ? null : i)}
  className={`bg-gradient-card border-border hover:border-b-accent hover-glow hover-lift transition-all duration-[250ms] rounded-xl p-4 shadow-sm cursor-pointer ${
    selectedRoomIndex === i
      ? "ring-2 ring-primary border-primary"
      : hoveredRoomIndex === i
        ? "ring-1 ring-primary/50"
        : ""
  }`}
>
```

- [ ] **Step 6: Handle no-image fallback gracefully**

When `displayImage` is null (e.g., loading a saved estimate that has no cached image), the canvas simply doesn't render and the layout falls back to single-column. The existing `lg:grid-cols-[...]` handles this because the canvas `div` is conditionally rendered.

No code needed — just verify the grid collapses properly when the canvas div is absent.

- [ ] **Step 7: Run type check and dev server**

Run: `npx tsc --noEmit`
Expected: No errors

Start the dev server and test:
1. Upload a floorplan PDF
2. Complete analysis
3. Verify canvas shows floorplan image with polygon overlays on the rooms step
4. Click a room on the canvas → card highlights and scrolls into view
5. Click a room card → canvas polygon highlights
6. Hover rooms on canvas → lighter highlight
7. Resize the browser → canvas redraws correctly

- [ ] **Step 8: Commit**

```bash
git add src/components/estimator/rooms-step.tsx
git commit -m "feat: integrate FloorplanCanvas into rooms-step with bidirectional room selection"
```

---

### Task 5: Multi-page floor support

When a floorplan has multiple pages (one per floor), the canvas should show a floor selector to switch between pages, filtering rooms to the active floor.

**Files:**
- Modify: `src/components/estimator/floorplan-canvas.tsx`
- Modify: `src/components/estimator/rooms-step.tsx`

- [ ] **Step 1: Add `activeFloor` + floor switcher to rooms-step**

Add state:

```ts
const [activeFloor, setActiveFloor] = useState(1);
const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);
```

Compute the image for the active floor:

```ts
const displayImage = (() => {
  if (pdfPages.length > 0 && selectedPages.length > 0) {
    // For multi-page: match floor to page number
    const targetPage = selectedPages.length > 1
      ? selectedPages[activeFloor - 1] ?? selectedPages[0]
      : selectedPages[0];
    const page = pdfPages.find((p) => p.pageNum === targetPage);
    return page?.previewUrl ?? floorplanImg;
  }
  return floorplanImg;
})();

const floorRooms = rooms
  .map((room, index) => ({ room, index }))
  .filter(({ room }) => room.floor === activeFloor);
```

- [ ] **Step 2: Add floor tabs above the canvas**

When `floors.length > 1`, render floor tabs:

```tsx
{floors.length > 1 && (
  <div className="mb-2 flex gap-1">
    {floors.map((f) => (
      <button
        key={f}
        onClick={() => setActiveFloor(f)}
        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
          activeFloor === f
            ? "bg-primary text-white"
            : "bg-bg-secondary text-txt-secondary hover:bg-bg-tertiary"
        }`}
      >
        Floor {f}
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 3: Pass filtered rooms to canvas**

Update the `FloorplanCanvas` props to only pass rooms for the active floor. The `onSelectRoom` and `selectedIndex` need to map between floor-filtered indices and global indices:

```tsx
<FloorplanCanvas
  imageSrc={displayImage}
  rooms={floorRooms.map(({ room }) => room)}
  selectedIndex={
    selectedRoomIndex != null
      ? floorRooms.findIndex(({ index }) => index === selectedRoomIndex)
      : null
  }
  onSelectRoom={(localIdx) => {
    if (localIdx == null) {
      setSelectedRoomIndex(null);
    } else {
      setSelectedRoomIndex(floorRooms[localIdx]?.index ?? null);
    }
  }}
  hoveredIndex={
    hoveredRoomIndex != null
      ? floorRooms.findIndex(({ index }) => index === hoveredRoomIndex)
      : null
  }
  onHoverRoom={(localIdx) => {
    if (localIdx == null) {
      setHoveredRoomIndex(null);
    } else {
      setHoveredRoomIndex(floorRooms[localIdx]?.index ?? null);
    }
  }}
/>
```

- [ ] **Step 4: Auto-switch floor when selecting a room card on a different floor**

In the card `onClick`:

```ts
onClick={() => {
  const newIdx = selectedRoomIndex === i ? null : i;
  setSelectedRoomIndex(newIdx);
  if (newIdx != null) {
    const room = rooms[newIdx];
    if (room.floor !== activeFloor) setActiveFloor(room.floor);
  }
}}
```

- [ ] **Step 5: Test multi-page flow**

1. Upload a multi-page PDF floorplan
2. Select multiple pages for analysis
3. After analysis, verify floor tabs appear
4. Click floor tabs → canvas switches images, rooms filter
5. Click a room card on floor 2 while viewing floor 1 → auto-switches

- [ ] **Step 6: Commit**

```bash
git add src/components/estimator/floorplan-canvas.tsx src/components/estimator/rooms-step.tsx
git commit -m "feat: add multi-floor support with floor tabs and auto-switching"
```

---

### Task 6: Write tests for FloorplanCanvas

**Files:**
- Create: `src/components/estimator/__tests__/floorplan-canvas.test.tsx`

- [ ] **Step 1: Write tests**

Create `src/components/estimator/__tests__/floorplan-canvas.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FloorplanCanvas } from "../floorplan-canvas";
import type { Room } from "@/types/hvac";

// Mock canvas context — jsdom doesn't support Canvas
const mockContext = {
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  rect: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  fillText: vi.fn(),
  scale: vi.fn(),
  set fillStyle(_: string) {},
  set strokeStyle(_: string) {},
  set lineWidth(_: number) {},
  set font(_: string) {},
  set textAlign(_: string) {},
  set textBaseline(_: string) {},
};

HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext) as any;

const ROOM_WITH_VERTICES: Room = {
  name: "Living Room",
  type: "living_room",
  floor: 1,
  estimated_sqft: 300,
  width_ft: 15,
  length_ft: 20,
  window_count: 2,
  exterior_walls: 2,
  ceiling_height: 9,
  notes: "",
  conditioned: true,
  polygon_id: "room_0",
  vertices: [
    { x: 0.1, y: 0.1 },
    { x: 0.5, y: 0.1 },
    { x: 0.5, y: 0.5 },
    { x: 0.1, y: 0.5 },
  ],
  bbox: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
  centroid: { x: 0.3, y: 0.3 },
  adjacent_rooms: [],
};

const ROOM_WITHOUT_VERTICES: Room = {
  ...ROOM_WITH_VERTICES,
  name: "Kitchen",
  type: "kitchen",
  polygon_id: "room_1",
  vertices: [],
  bbox: { x: 0.5, y: 0.1, width: 0.3, height: 0.3 },
  centroid: { x: 0.65, y: 0.25 },
};

// Tiny transparent 1x1 PNG as data URL
const FAKE_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("FloorplanCanvas", () => {
  it("renders the SVG overlay with one element per room", () => {
    render(
      <FloorplanCanvas
        imageSrc={FAKE_IMAGE}
        rooms={[ROOM_WITH_VERTICES, ROOM_WITHOUT_VERTICES]}
        selectedIndex={null}
        onSelectRoom={vi.fn()}
      />,
    );

    const svg = screen.getByLabelText(/room overlay/i);
    expect(svg).toBeDefined();
    // polygon for room with vertices, rect for room without
    expect(svg.querySelectorAll("polygon")).toHaveLength(1);
    expect(svg.querySelectorAll("rect")).toHaveLength(1);
  });

  it("calls onSelectRoom when an SVG polygon is clicked", () => {
    const onSelect = vi.fn();
    render(
      <FloorplanCanvas
        imageSrc={FAKE_IMAGE}
        rooms={[ROOM_WITH_VERTICES]}
        selectedIndex={null}
        onSelectRoom={onSelect}
      />,
    );

    const polygon = screen.getByLabelText(/room overlay/i).querySelector("polygon")!;
    fireEvent.click(polygon);
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("deselects when clicking the already-selected room", () => {
    const onSelect = vi.fn();
    render(
      <FloorplanCanvas
        imageSrc={FAKE_IMAGE}
        rooms={[ROOM_WITH_VERTICES]}
        selectedIndex={0}
        onSelectRoom={onSelect}
      />,
    );

    const polygon = screen.getByLabelText(/room overlay/i).querySelector("polygon")!;
    fireEvent.click(polygon);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("calls onHoverRoom on mouseEnter/mouseLeave", () => {
    const onHover = vi.fn();
    render(
      <FloorplanCanvas
        imageSrc={FAKE_IMAGE}
        rooms={[ROOM_WITH_VERTICES]}
        selectedIndex={null}
        onSelectRoom={vi.fn()}
        onHoverRoom={onHover}
      />,
    );

    const polygon = screen.getByLabelText(/room overlay/i).querySelector("polygon")!;
    fireEvent.mouseEnter(polygon);
    expect(onHover).toHaveBeenCalledWith(0);
    fireEvent.mouseLeave(polygon);
    expect(onHover).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/components/estimator/__tests__/floorplan-canvas.test.tsx`
Expected: All 4 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/components/estimator/__tests__/floorplan-canvas.test.tsx
git commit -m "test: add FloorplanCanvas component tests for SVG overlay interactions"
```

---

### Task 7: Preserve aspect ratio from actual image dimensions

The canvas currently uses a fixed `4/3` aspect ratio. It should match the actual floorplan image's aspect ratio so polygons align correctly.

**Files:**
- Modify: `src/components/estimator/floorplan-canvas.tsx`

- [ ] **Step 1: Track image dimensions in state**

Add a state variable for the loaded image's natural dimensions:

```ts
const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
```

Update the image `onload` handler:

```ts
useEffect(() => {
  const img = new Image();
  img.onload = () => {
    imageRef.current = img;
    setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
    draw();
  };
  img.src = imageSrc;
}, [imageSrc]);
```

- [ ] **Step 2: Use dynamic aspect ratio**

Replace the hardcoded `style={{ aspectRatio: "4 / 3" }}` on the container div:

```tsx
<div
  ref={containerRef}
  className="relative w-full overflow-hidden rounded-xl border border-border bg-bg-input"
  style={{
    aspectRatio: imageDims ? `${imageDims.w} / ${imageDims.h}` : "4 / 3",
  }}
>
```

- [ ] **Step 3: Test with different aspect ratios**

Upload a landscape floorplan and a portrait floorplan. Verify:
- Canvas matches the image's natural aspect ratio
- Polygon overlays align with room boundaries on the image
- No stretching or misalignment

- [ ] **Step 4: Commit**

```bash
git add src/components/estimator/floorplan-canvas.tsx
git commit -m "fix: use actual image aspect ratio for floorplan canvas to ensure polygon alignment"
```
