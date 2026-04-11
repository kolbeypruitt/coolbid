import type { RoomLoad, BomSummary, HvacNotes } from "@/types/hvac";
import type { FloorplanLayout, LayoutRoom, DuctSegment } from "@/types/duct-layout";
import { needsReturnRegister } from "./load-calc";

const SVG_WIDTH = 400;
const SVG_HEIGHT = 300;
const PADDING = 30;

function mapBboxToSvg(bbox: { x: number; y: number; width: number; height: number }): {
  x: number; y: number; width: number; height: number;
} {
  const innerW = SVG_WIDTH - PADDING * 2;
  const innerH = SVG_HEIGHT - PADDING * 2;
  return {
    x: PADDING + bbox.x * innerW,
    y: PADDING + bbox.y * innerH,
    width: Math.max(bbox.width * innerW, 4),
    height: Math.max(bbox.height * innerH, 4),
  };
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

  const totalArea = layoutRooms.reduce((s, r) => s + r.width * r.height, 0);
  const trunkY = totalArea > 0
    ? layoutRooms.reduce((s, r) => s + (r.y + r.height / 2) * (r.width * r.height), 0) / totalArea
    : SVG_HEIGHT / 2;

  const leftEdge = Math.min(...layoutRooms.map((r) => r.x));
  const rightEdge = Math.max(...layoutRooms.map((r) => r.x + r.width));

  segments.push({
    from: equipment,
    to: { x: equipment.x, y: trunkY },
    type: "trunk",
    size: trunkSize,
  });

  segments.push({
    from: { x: leftEdge, y: trunkY },
    to: { x: rightEdge, y: trunkY },
    type: "trunk",
    size: trunkSize,
  });

  for (const room of layoutRooms) {
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

  return segments;
}

export function generateFloorplanLayout(
  roomLoads: RoomLoad[],
  summary: BomSummary,
  hvacNotes?: HvacNotes,
): FloorplanLayout {
  const conditioned = roomLoads.filter(
    (r) => r.type !== "garage" && r.type !== "closet" && r.cfm > 0,
  );

  const layoutRooms: LayoutRoom[] = conditioned.map((room, i) => {
    const svgRect = mapBboxToSvg(room.bbox);
    return {
      id: room.polygon_id || `room-${i}`,
      name: room.name,
      type: room.type,
      x: svgRect.x,
      y: svgRect.y,
      width: svgRect.width,
      height: svgRect.height,
      sqft: room.estimated_sqft,
      cfm: room.cfm,
      regs: room.regs,
      hasReturn: needsReturnRegister(room),
      registerPositions: placeRegisters(svgRect, room.regs),
    };
  });

  const location = hvacNotes?.suggested_equipment_location?.toLowerCase() ?? "";
  const isAttic = location.includes("attic");
  const equipX = SVG_WIDTH / 2;
  const equipY = isAttic ? 15 : SVG_HEIGHT - 15;
  const equipLabel = isAttic ? "Attic Unit" : location.includes("garage") ? "Garage Unit" : "Equipment";
  const equipment = { x: equipX, y: equipY, label: equipLabel };

  const ducts = routeDucts(layoutRooms, equipment, summary.tonnage);

  return {
    rooms: layoutRooms,
    ducts,
    equipment,
    viewBox: { width: SVG_WIDTH, height: SVG_HEIGHT },
  };
}
