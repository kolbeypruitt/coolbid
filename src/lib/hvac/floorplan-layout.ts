import type { RoomLoad, BomSummary, HvacNotes } from "@/types/hvac";
import type { FloorplanLayout, LayoutRoom, DuctSegment, FloorLabel } from "@/types/duct-layout";
import { needsReturnRegister } from "./load-calc";

const SVG_WIDTH = 400;
const FLOOR_HEIGHT = 260;
const FLOOR_GAP = 40;
const PADDING = 30;
const LABEL_HEIGHT = 16;

/**
 * Normalize room bboxes AND vertices within a floor so they fill the available
 * space. The raw coords from the vision LLM are relative to the full image;
 * when floors share a page, rooms on floor 2 might occupy only the top-right
 * quadrant, so we re-normalize each floor's rooms to 0–1 within that floor's
 * bounding box.
 */
function normalizeRoomsForFloor(
  rooms: RoomLoad[],
): Array<{
  bbox: { x: number; y: number; width: number; height: number };
  vertices: { x: number; y: number }[];
}> {
  if (rooms.length === 0) return [];
  if (rooms.length === 1) {
    // Single room — center it; remap its vertices into that centered box.
    const r = rooms[0];
    const bbox = { x: 0.15, y: 0.15, width: 0.7, height: 0.7 };
    const verts =
      r.vertices.length >= 3 && r.bbox.width > 0 && r.bbox.height > 0
        ? r.vertices.map((v) => ({
            x: bbox.x + ((v.x - r.bbox.x) / r.bbox.width) * bbox.width,
            y: bbox.y + ((v.y - r.bbox.y) / r.bbox.height) * bbox.height,
          }))
        : [];
    return [{ bbox, vertices: verts }];
  }

  // Compute bounding box of all rooms on this floor
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rooms) {
    minX = Math.min(minX, r.bbox.x);
    minY = Math.min(minY, r.bbox.y);
    maxX = Math.max(maxX, r.bbox.x + r.bbox.width);
    maxY = Math.max(maxY, r.bbox.y + r.bbox.height);
  }

  const rangeX = maxX - minX;
  const rangeY = maxY - minY;

  // If all rooms are at the same point, space them out in a grid
  if (rangeX < 0.01 && rangeY < 0.01) {
    const cols = Math.ceil(Math.sqrt(rooms.length));
    return rooms.map((_, i) => ({
      bbox: {
        x: (i % cols) / cols,
        y: Math.floor(i / cols) / Math.ceil(rooms.length / cols),
        width: (1 / cols) * 0.85,
        height: (1 / Math.ceil(rooms.length / cols)) * 0.85,
      },
      vertices: [],
    }));
  }

  // Affine remap for any point (vx, vy) in full-image coords → floor coords.
  const margin = 0.05;
  const remap = (vx: number, vy: number) => ({
    x: margin + (rangeX > 0.01 ? ((vx - minX) / rangeX) * (1 - margin * 2) : 0.15),
    y: margin + (rangeY > 0.01 ? ((vy - minY) / rangeY) * (1 - margin * 2) : 0.15),
  });

  return rooms.map((r) => {
    const tl = remap(r.bbox.x, r.bbox.y);
    const br = remap(r.bbox.x + r.bbox.width, r.bbox.y + r.bbox.height);
    return {
      bbox: { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y },
      vertices: r.vertices.length >= 3 ? r.vertices.map((v) => remap(v.x, v.y)) : [],
    };
  });
}

function placeRegisters(
  room: { x: number; y: number; width: number; height: number },
  count: number,
): { x: number; y: number }[] {
  if (count === 0) return [];
  const inset = Math.min(room.width, room.height) * 0.2;
  const innerW = room.width - inset * 2;
  const innerH = room.height - inset * 2;

  if (count === 1) {
    return [{ x: room.x + room.width / 2, y: room.y + room.height / 2 }];
  }

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

  // Group rooms by floor for per-floor trunk lines
  const floorMap = new Map<number, LayoutRoom[]>();
  for (const r of layoutRooms) {
    if (!floorMap.has(r.floor)) floorMap.set(r.floor, []);
    floorMap.get(r.floor)!.push(r);
  }

  // Equipment-to-first-trunk vertical segment
  const allRooms = layoutRooms;
  if (allRooms.length === 0) return segments;

  for (const [, floorRooms] of floorMap) {
    const totalArea = floorRooms.reduce((s, r) => s + r.width * r.height, 0);
    const trunkY = totalArea > 0
      ? floorRooms.reduce((s, r) => s + (r.y + r.height / 2) * (r.width * r.height), 0) / totalArea
      : floorRooms[0].y + floorRooms[0].height / 2;

    const leftEdge = Math.min(...floorRooms.map((r) => r.x));
    const rightEdge = Math.max(...floorRooms.map((r) => r.x + r.width));

    // Trunk line for this floor
    segments.push({
      from: { x: leftEdge, y: trunkY },
      to: { x: rightEdge, y: trunkY },
      type: "trunk",
      size: trunkSize,
    });

    // Branch lines from trunk to each room
    for (const room of floorRooms) {
      const roomCenterX = room.x + room.width / 2;
      const flexSize = getFlexSize(room.sqft);
      const roomTop = room.y;
      const roomBottom = room.y + room.height;
      const branchEndY = Math.abs(roomTop - trunkY) < Math.abs(roomBottom - trunkY)
        ? roomTop + 4
        : roomBottom - 4;

      segments.push({
        from: { x: roomCenterX, y: trunkY },
        to: { x: roomCenterX, y: branchEndY },
        type: "branch",
        size: flexSize,
      });
    }
  }

  // Connect equipment to nearest trunk
  const trunkSegments = segments.filter((s) => s.type === "trunk");
  if (trunkSegments.length > 0) {
    const nearestTrunk = trunkSegments.reduce((best, t) => {
      const midY = (t.from.y + t.to.y) / 2;
      return Math.abs(midY - equipment.y) < Math.abs((best.from.y + best.to.y) / 2 - equipment.y) ? t : best;
    });
    const trunkMidX = (nearestTrunk.from.x + nearestTrunk.to.x) / 2;
    segments.push({
      from: equipment,
      to: { x: trunkMidX, y: (nearestTrunk.from.y + nearestTrunk.to.y) / 2 },
      type: "trunk",
      size: trunkSize,
    });
  }

  return segments;
}

export function generateFloorplanLayout(
  roomLoads: RoomLoad[],
  summary: BomSummary,
  hvacNotes?: HvacNotes,
): FloorplanLayout {
  const conditioned = roomLoads.filter(
    (r) => r.conditioned && r.cfm > 0,
  );

  // Group rooms by floor
  const floorMap = new Map<number, RoomLoad[]>();
  for (const r of conditioned) {
    const floor = r.floor ?? 1;
    if (!floorMap.has(floor)) floorMap.set(floor, []);
    floorMap.get(floor)!.push(r);
  }

  const floors = [...floorMap.keys()].sort((a, b) => a - b);
  const floorCount = floors.length;
  const totalHeight = floorCount === 1
    ? FLOOR_HEIGHT + PADDING * 2
    : floorCount * FLOOR_HEIGHT + (floorCount - 1) * FLOOR_GAP + PADDING * 2;

  const innerW = SVG_WIDTH - PADDING * 2;
  const layoutRooms: LayoutRoom[] = [];
  const floorLabels: FloorLabel[] = [];

  for (let fi = 0; fi < floors.length; fi++) {
    const floorNum = floors[fi];
    const floorRooms = floorMap.get(floorNum)!;
    const floorTopY = PADDING + fi * (FLOOR_HEIGHT + FLOOR_GAP);

    // Add floor label for multi-floor plans
    if (floorCount > 1) {
      floorLabels.push({
        label: `Floor ${floorNum}`,
        y: floorTopY,
      });
    }

    // Content area starts below the label
    const contentTopY = floorCount > 1 ? floorTopY + LABEL_HEIGHT : floorTopY;
    const contentH = floorCount > 1 ? FLOOR_HEIGHT - LABEL_HEIGHT : FLOOR_HEIGHT;

    // Normalize bboxes + vertices so this floor's rooms fill the available space
    const normalized = normalizeRoomsForFloor(floorRooms);

    for (let ri = 0; ri < floorRooms.length; ri++) {
      const room = floorRooms[ri];
      const nb = normalized[ri].bbox;

      const x = PADDING + nb.x * innerW;
      const y = contentTopY + nb.y * contentH;
      const width = Math.max(nb.width * innerW, 4);
      const height = Math.max(nb.height * contentH, 4);

      const svgRect = { x, y, width, height };
      const polygon = normalized[ri].vertices.map((v) => ({
        x: PADDING + v.x * innerW,
        y: contentTopY + v.y * contentH,
      }));

      layoutRooms.push({
        id: room.polygon_id || `room-${layoutRooms.length}`,
        name: room.name,
        type: room.type,
        floor: floorNum,
        x: svgRect.x,
        y: svgRect.y,
        width: svgRect.width,
        height: svgRect.height,
        polygon,
        sqft: room.estimated_sqft,
        cfm: room.cfm,
        regs: room.regs,
        hasReturn: needsReturnRegister(room),
        registerPositions: placeRegisters(svgRect, room.regs),
      });
    }
  }

  const location = hvacNotes?.suggested_equipment_location?.toLowerCase() ?? "";
  const isAttic = location.includes("attic");
  const equipX = SVG_WIDTH / 2;
  const equipY = isAttic ? 15 : totalHeight - 15;
  const equipLabel = isAttic ? "Attic Unit" : location.includes("garage") ? "Garage Unit" : "Equipment";
  const equipment = { x: equipX, y: equipY, label: equipLabel };

  const ducts = routeDucts(layoutRooms, equipment, summary.tonnage);

  return {
    rooms: layoutRooms,
    ducts,
    equipment,
    viewBox: { width: SVG_WIDTH, height: totalHeight },
    floorLabels,
  };
}
