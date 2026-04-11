import type { RoomLoad, BomSummary, HvacNotes } from "@/types/hvac";
import type { FloorplanLayout, LayoutRoom, DuctSegment } from "@/types/duct-layout";
import { needsReturnRegister } from "./load-calc";

const SVG_WIDTH = 400;
const SVG_HEIGHT = 300;
const PADDING = 30;
const ROOM_GAP = 3;

// ── Squarified Treemap ──────────────────────────────────────────────

type TreemapRect = { x: number; y: number; w: number; h: number };
type WeightedItem = { index: number; weight: number };

function layoutRow(
  items: WeightedItem[],
  rect: TreemapRect,
  totalWeight: number,
): { rects: TreemapRect[]; remaining: TreemapRect } {
  const rowWeight = items.reduce((s, i) => s + i.weight, 0);
  const isWide = rect.w >= rect.h;
  const rowSpan = (rowWeight / totalWeight) * (isWide ? rect.w : rect.h);

  const rects: TreemapRect[] = [];
  let offset = 0;
  const crossLength = isWide ? rect.h : rect.w;

  for (const item of items) {
    const fraction = item.weight / rowWeight;
    const len = fraction * crossLength;

    if (isWide) {
      rects.push({ x: rect.x, y: rect.y + offset, w: rowSpan, h: len });
    } else {
      rects.push({ x: rect.x + offset, y: rect.y, w: len, h: rowSpan });
    }
    offset += len;
  }

  const remaining: TreemapRect = isWide
    ? { x: rect.x + rowSpan, y: rect.y, w: rect.w - rowSpan, h: rect.h }
    : { x: rect.x, y: rect.y + rowSpan, w: rect.w, h: rect.h - rowSpan };

  return { rects, remaining };
}

function worstAspectRatio(items: WeightedItem[], rect: TreemapRect, totalWeight: number): number {
  const rowWeight = items.reduce((s, i) => s + i.weight, 0);
  const isWide = rect.w >= rect.h;
  const rowSpan = (rowWeight / totalWeight) * (isWide ? rect.w : rect.h);
  const crossLength = isWide ? rect.h : rect.w;

  let worst = 0;
  for (const item of items) {
    const fraction = item.weight / rowWeight;
    const len = fraction * crossLength;
    const aspect = rowSpan > 0 && len > 0
      ? Math.max(rowSpan / len, len / rowSpan)
      : Infinity;
    worst = Math.max(worst, aspect);
  }
  return worst;
}

function squarify(items: WeightedItem[], rect: TreemapRect, totalWeight: number): TreemapRect[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ x: rect.x, y: rect.y, w: rect.w, h: rect.h }];

  const results: TreemapRect[] = [];
  let currentRow: WeightedItem[] = [items[0]];
  let remainingRect = rect;
  let remainingWeight = totalWeight;

  for (let i = 1; i < items.length; i++) {
    const candidate = [...currentRow, items[i]];
    const currentAR = worstAspectRatio(currentRow, remainingRect, remainingWeight);
    const candidateAR = worstAspectRatio(candidate, remainingRect, remainingWeight);

    if (candidateAR <= currentAR) {
      currentRow = candidate;
    } else {
      const { rects, remaining } = layoutRow(currentRow, remainingRect, remainingWeight);
      results.push(...rects);
      remainingWeight -= currentRow.reduce((s, it) => s + it.weight, 0);
      remainingRect = remaining;
      currentRow = [items[i]];
    }
  }

  // Lay out the final row
  const { rects } = layoutRow(currentRow, remainingRect, remainingWeight);
  results.push(...rects);

  return results;
}

// ── Register Placement ──────────────────────────────────────────────

function placeRegisters(
  room: TreemapRect,
  count: number,
): { x: number; y: number }[] {
  if (count === 0) return [];
  const inset = Math.min(room.w, room.h) * 0.2;
  const innerW = room.w - inset * 2;
  const innerH = room.h - inset * 2;

  if (count === 1) {
    return [{ x: room.x + room.w / 2, y: room.y + room.h / 2 }];
  }

  // Distribute registers in a grid within the room
  const cols = Math.ceil(Math.sqrt(count * (innerW / innerH)));
  const rows = Math.ceil(count / cols);
  const positions: { x: number; y: number }[] = [];

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = room.x + inset + (cols > 1 ? (col / (cols - 1)) * innerW : innerW / 2);
    const y = room.y + inset + (rows > 1 ? (row / (rows - 1)) * innerH : innerH / 2);
    positions.push({ x, y });
  }

  return positions;
}

// ── Duct Routing ────────────────────────────────────────────────────

function getTrunkSize(tonnage: number): string {
  if (tonnage <= 3) return '8"×12"';
  if (tonnage <= 4) return '10"×14"';
  return '12"×16"';
}

function getFlexSize(sqft: number): string {
  return sqft >= 250 ? '8" flex' : '6" flex';
}

function routeDucts(
  layoutRooms: LayoutRoom[],
  equipment: { x: number; y: number },
  tonnage: number,
): DuctSegment[] {
  const segments: DuctSegment[] = [];
  const trunkSize = getTrunkSize(tonnage);

  // Trunk runs horizontally through the vertical center of the layout
  const innerLeft = PADDING + ROOM_GAP;
  const innerRight = SVG_WIDTH - PADDING - ROOM_GAP;
  const trunkY = SVG_HEIGHT / 2;

  // Vertical drop from equipment to trunk
  segments.push({
    from: equipment,
    to: { x: equipment.x, y: trunkY },
    type: "trunk",
    size: trunkSize,
  });

  // Horizontal trunk line
  segments.push({
    from: { x: innerLeft, y: trunkY },
    to: { x: innerRight, y: trunkY },
    type: "trunk",
    size: trunkSize,
  });

  // L-shaped branches: horizontal along trunk, then vertical to room
  for (const room of layoutRooms) {
    const roomCenterX = room.x + room.width / 2;
    const roomCenterY = room.y + room.height / 2;
    const flexSize = getFlexSize(room.sqft);

    // Takeoff point on the trunk at the room's x-center
    const takeoffX = roomCenterX;

    // Find the nearest room edge to the trunk for the branch endpoint
    const roomTop = room.y;
    const roomBottom = room.y + room.height;
    const branchEndY = Math.abs(roomTop - trunkY) < Math.abs(roomBottom - trunkY)
      ? roomTop + 4    // connect to top edge (inset slightly)
      : roomBottom - 4; // connect to bottom edge

    // Vertical branch from trunk to room edge
    segments.push({
      from: { x: takeoffX, y: trunkY },
      to: { x: takeoffX, y: branchEndY },
      type: "branch",
      size: flexSize,
    });
  }

  return segments;
}

// ── Main Generator ──────────────────────────────────────────────────

export function generateFloorplanLayout(
  roomLoads: RoomLoad[],
  summary: BomSummary,
  hvacNotes?: HvacNotes,
): FloorplanLayout {
  // Filter out non-conditioned spaces
  const conditioned = roomLoads.filter(
    (r) => r.type !== "garage" && r.type !== "closet" && r.cfm > 0,
  );

  // Sort descending by sqft for treemap stability
  const sorted = [...conditioned].sort((a, b) => b.estimated_sqft - a.estimated_sqft);

  const totalSqft = sorted.reduce((s, r) => s + r.estimated_sqft, 0);

  // Build weighted items
  const weighted: WeightedItem[] = sorted.map((r, i) => ({
    index: i,
    weight: r.estimated_sqft,
  }));

  // Inner bounding rect (inside padding)
  const innerRect: TreemapRect = {
    x: PADDING + ROOM_GAP,
    y: PADDING + ROOM_GAP,
    w: SVG_WIDTH - PADDING * 2 - ROOM_GAP * 2,
    h: SVG_HEIGHT - PADDING * 2 - ROOM_GAP * 2,
  };

  const treemapRects = squarify(weighted, innerRect, totalSqft);

  // Build LayoutRoom objects
  const layoutRooms: LayoutRoom[] = sorted.map((room, i) => {
    const rect = treemapRects[i];
    // Apply gap inset for visual separation between rooms
    const gapped = {
      x: rect.x + ROOM_GAP / 2,
      y: rect.y + ROOM_GAP / 2,
      w: Math.max(rect.w - ROOM_GAP, 4),
      h: Math.max(rect.h - ROOM_GAP, 4),
    };

    return {
      id: `room-${i}`,
      name: room.name,
      type: room.type,
      x: gapped.x,
      y: gapped.y,
      width: gapped.w,
      height: gapped.h,
      sqft: room.estimated_sqft,
      cfm: room.cfm,
      regs: room.regs,
      hasReturn: needsReturnRegister(room),
      registerPositions: placeRegisters(
        { x: gapped.x, y: gapped.y, w: gapped.w, h: gapped.h },
        room.regs,
      ),
    };
  });

  // Equipment placement based on suggested location
  const location = hvacNotes?.suggested_equipment_location?.toLowerCase() ?? "";
  const isAttic = location.includes("attic");
  const equipX = SVG_WIDTH / 2;
  const equipY = isAttic ? 15 : SVG_HEIGHT - 15;
  const equipLabel = isAttic ? "Attic Unit" : location.includes("garage") ? "Garage Unit" : "Equipment";

  const equipment = { x: equipX, y: equipY, label: equipLabel };

  // Route ducts
  const ducts = routeDucts(layoutRooms, equipment, summary.tonnage);

  return {
    rooms: layoutRooms,
    ducts,
    equipment,
    viewBox: { width: SVG_WIDTH, height: SVG_HEIGHT },
  };
}
