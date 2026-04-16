"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import type { Room } from "@/types/hvac";

type Vertex = { x: number; y: number };

type Props = {
  /** Base64 data URL of the floorplan image */
  imageSrc: string;
  /** Rooms with normalized 0-1 geometry */
  rooms: Room[];
  /** Index of the currently selected room, or null */
  selectedIndex: number | null;
  /** Called when a room polygon is clicked */
  onSelectRoom: (index: number | null) => void;
  /** Index of the room currently hovered */
  hoveredIndex?: number | null;
  /** Called when hover state changes */
  onHoverRoom?: (index: number | null) => void;
  /**
   * Called when a room's geometry changes via drag. The partial includes
   * vertices, bbox, centroid, and proportionally-scaled width_ft/length_ft.
   */
  onUpdateRoom?: (index: number, partial: Partial<Room>) => void;
};

const ROOM_COLORS: Record<string, string> = {
  master_bedroom: "59,130,246",
  bedroom: "99,102,241",
  living_room: "34,197,94",
  family_room: "34,197,94",
  kitchen: "249,115,22",
  dining_room: "234,179,8",
  bathroom: "6,182,212",
  half_bath: "6,182,212",
  hallway: "148,163,184",
  laundry: "168,85,247",
  office: "236,72,153",
  foyer: "148,163,184",
  sunroom: "250,204,21",
  bonus_room: "139,92,246",
  basement: "100,116,139",
  closet: "148,163,184",
  garage: "107,114,128",
  default: "148,163,184",
};

/** Distance (in normalized 0-1 coords) the pointer must move to start a drag. */
const CLICK_DRAG_THRESHOLD = 0.008;

function getRoomColor(type: string): string {
  return ROOM_COLORS[type] ?? ROOM_COLORS.default;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function computeCentroid(verts: Vertex[]): Vertex {
  if (verts.length === 0) return { x: 0, y: 0 };
  const sx = verts.reduce((s, v) => s + v.x, 0);
  const sy = verts.reduce((s, v) => s + v.y, 0);
  return { x: sx / verts.length, y: sy / verts.length };
}

function computeBbox(verts: Vertex[]): Room["bbox"] {
  if (verts.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = verts[0].x, minY = verts[0].y, maxX = verts[0].x, maxY = verts[0].y;
  for (const v of verts) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function centroidOfRoom(room: Room): Vertex {
  if (room.centroid) return room.centroid;
  if (room.vertices.length >= 3) return computeCentroid(room.vertices);
  return { x: room.bbox.x + room.bbox.width / 2, y: room.bbox.y + room.bbox.height / 2 };
}

/** Proportional per-room dimension scale based on bbox change. */
function scaledDimensions(room: Room, newBbox: Room["bbox"]): Pick<Room, "width_ft" | "length_ft"> {
  const oldW = room.bbox.width || 1;
  const oldH = room.bbox.height || 1;
  return {
    width_ft: Math.max(0, room.width_ft * (newBbox.width / oldW)),
    length_ft: Math.max(0, room.length_ft * (newBbox.height / oldH)),
  };
}

/** True if the polygon is a 4-vertex rectangle with edges parallel to the axes. */
function isAxisAlignedRectangle(verts: Vertex[], eps = 0.002): boolean {
  if (verts.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % 4];
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    // Each edge must be purely horizontal (dy ~ 0) OR purely vertical (dx ~ 0)
    if (dx > eps && dy > eps) return false;
  }
  return true;
}

/**
 * Move one corner of an axis-aligned rectangle, dragging its two neighbors
 * along their shared axes and leaving the opposite corner fixed.
 */
function resizeRectangleCorner(
  verts: Vertex[],
  draggedIdx: number,
  newPos: Vertex,
): Vertex[] {
  const prev = (draggedIdx + 3) % 4;
  const next = (draggedIdx + 1) % 4;
  const dragged = verts[draggedIdx];
  const prevV = verts[prev];
  const nextV = verts[next];
  const out = [...verts];
  const nx = clamp01(newPos.x);
  const ny = clamp01(newPos.y);
  out[draggedIdx] = { x: nx, y: ny };
  // Prev neighbor shares either x or y with the dragged vertex (axis-aligned edge).
  // Whichever coord is ~equal is the shared axis; move the OTHER coord with the drag.
  const prevSharesX = Math.abs(prevV.x - dragged.x) < 0.002;
  out[prev] = prevSharesX ? { x: nx, y: prevV.y } : { x: prevV.x, y: ny };
  const nextSharesX = Math.abs(nextV.x - dragged.x) < 0.002;
  out[next] = nextSharesX ? { x: nx, y: nextV.y } : { x: nextV.x, y: ny };
  return out;
}

/** Cursor hint for a rectangle corner handle based on which side of centroid it sits on. */
function cornerCursor(corner: Vertex, centroid: Vertex): string {
  const left = corner.x < centroid.x;
  const top = corner.y < centroid.y;
  if (top && left) return "nwse-resize";
  if (top && !left) return "nesw-resize";
  if (!top && !left) return "nwse-resize";
  return "nesw-resize";
}

/** Drag state: `null` = idle. `pending` = pointerdown but not yet moved enough. `active` = currently dragging. */
type DragState =
  | null
  | {
      phase: "pending";
      kind: "body" | "vertex";
      roomIndex: number;
      vertexIndex?: number;
      startX: number;
      startY: number;
      pointerId: number;
    }
  | {
      phase: "active";
      kind: "translating" | "dragging-vertex";
      roomIndex: number;
      vertexIndex?: number;
      /** Pointer position at drag start, in normalized coords (needed for translate deltas). */
      startX: number;
      startY: number;
      /** Per-drag override that replaces room.vertices in the display until commit. */
      overrideVertices: Vertex[];
      pointerId: number;
    };

export function FloorplanCanvas({
  imageSrc,
  rooms,
  selectedIndex,
  onSelectRoom,
  hoveredIndex = null,
  onHoverRoom,
  onUpdateRoom,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [aspectRatio, setAspectRatio] = useState(4 / 3);
  const [drag, setDrag] = useState<DragState>(null);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setAspectRatio(img.naturalWidth / img.naturalHeight);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  /** Rooms with drag override applied (purely for display — state isn't mutated until pointerup). */
  const displayRooms = useMemo(() => {
    if (!drag || drag.phase !== "active") return rooms;
    const activeIdx = drag.roomIndex;
    return rooms.map((room, i) => {
      if (i !== activeIdx) return room;
      const verts = drag.overrideVertices;
      return {
        ...room,
        vertices: verts,
        centroid: computeCentroid(verts),
        bbox: computeBbox(verts),
      };
    });
  }, [rooms, drag]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const img = imageRef.current;
    if (!canvas || !container || !img) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Draw floorplan image
    ctx.drawImage(img, 0, 0, w, h);

    // Draw room overlays
    for (let i = 0; i < displayRooms.length; i++) {
      const room = displayRooms[i];
      const color = getRoomColor(room.type);
      const isSelected = i === selectedIndex;
      const isHovered = i === hoveredIndex;
      const isDragging = drag?.phase === "active" && drag.roomIndex === i;

      const alpha = isDragging ? 0.4 : isSelected ? 0.35 : isHovered ? 0.25 : 0.15;
      const strokeAlpha = isSelected ? 1 : isHovered ? 0.8 : 0.5;
      const lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1.5;

      ctx.fillStyle = `rgba(${color},${alpha})`;
      ctx.strokeStyle = `rgba(${color},${strokeAlpha})`;
      ctx.lineWidth = lineWidth;

      if (room.vertices.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(room.vertices[0].x * w, room.vertices[0].y * h);
        for (let j = 1; j < room.vertices.length; j++) {
          ctx.lineTo(room.vertices[j].x * w, room.vertices[j].y * h);
        }
        ctx.closePath();
      } else {
        const bx = room.bbox.x * w;
        const by = room.bbox.y * h;
        const bw = room.bbox.width * w;
        const bh = room.bbox.height * h;
        ctx.beginPath();
        ctx.rect(bx, by, bw, bh);
      }

      ctx.fill();
      ctx.stroke();

      // Room name label at centroid
      const c = centroidOfRoom(room);
      const fontSize = Math.max(10, Math.min(14, (room.bbox.width * w) / 8));
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillText(room.name, c.x * w + 1, c.y * h + 1);

      ctx.fillStyle = "#fff";
      ctx.fillText(room.name, c.x * w, c.y * h);
    }
  }, [displayRooms, selectedIndex, hoveredIndex, drag]);

  // Redraw on state changes and resize
  useEffect(() => {
    draw();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => {
    draw();
  }, [aspectRatio, draw]);

  /** Convert a DOM pointer event's client coords to normalized 0-1 image coords. */
  const pointerToNorm = useCallback((e: React.PointerEvent): Vertex => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  }, []);

  // ── Pointer handlers ──────────────────────────────────────────────

  function handleBodyPointerDown(e: React.PointerEvent<SVGElement>, roomIndex: number) {
    // Only allow drag on the currently-selected room's body.
    // Unselected rooms: click selects them (handled in pointerup).
    const norm = pointerToNorm(e);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // jsdom / older browsers may not support setPointerCapture; safe to skip.
    }
    setDrag({
      phase: "pending",
      kind: "body",
      roomIndex,
      startX: norm.x,
      startY: norm.y,
      pointerId: e.pointerId,
    });
  }

  function handleVertexPointerDown(
    e: React.PointerEvent<SVGCircleElement>,
    roomIndex: number,
    vertexIndex: number,
  ) {
    e.stopPropagation();
    const norm = pointerToNorm(e);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // jsdom / older browsers may not support setPointerCapture; safe to skip.
    }
    setDrag({
      phase: "pending",
      kind: "vertex",
      roomIndex,
      vertexIndex,
      startX: norm.x,
      startY: norm.y,
      pointerId: e.pointerId,
    });
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const norm = pointerToNorm(e);

    if (drag.phase === "pending") {
      const dx = norm.x - drag.startX;
      const dy = norm.y - drag.startY;
      if (Math.hypot(dx, dy) < CLICK_DRAG_THRESHOLD) return;

      // Transition to active drag.
      const room = rooms[drag.roomIndex];
      if (!room) return;
      if (drag.kind === "vertex" && drag.vertexIndex != null) {
        const newVerts = isAxisAlignedRectangle(room.vertices)
          ? resizeRectangleCorner(room.vertices, drag.vertexIndex, norm)
          : room.vertices.map((v, i) =>
              i === drag.vertexIndex ? { x: clamp01(norm.x), y: clamp01(norm.y) } : v,
            );
        setDrag({
          phase: "active",
          kind: "dragging-vertex",
          roomIndex: drag.roomIndex,
          vertexIndex: drag.vertexIndex,
          startX: drag.startX,
          startY: drag.startY,
          overrideVertices: newVerts,
          pointerId: drag.pointerId,
        });
      } else {
        const newVerts = room.vertices.map((v) => ({
          x: clamp01(v.x + dx),
          y: clamp01(v.y + dy),
        }));
        setDrag({
          phase: "active",
          kind: "translating",
          roomIndex: drag.roomIndex,
          startX: drag.startX,
          startY: drag.startY,
          overrideVertices: newVerts,
          pointerId: drag.pointerId,
        });
      }
      return;
    }

    // phase === "active"
    const room = rooms[drag.roomIndex];
    if (!room) return;

    if (drag.kind === "dragging-vertex" && drag.vertexIndex != null) {
      const vIdx = drag.vertexIndex;
      const newVerts = isAxisAlignedRectangle(room.vertices)
        ? resizeRectangleCorner(room.vertices, vIdx, norm)
        : room.vertices.map((v, i) =>
            i === vIdx ? { x: clamp01(norm.x), y: clamp01(norm.y) } : v,
          );
      setDrag({ ...drag, overrideVertices: newVerts });
    } else if (drag.kind === "translating") {
      const dx = norm.x - drag.startX;
      const dy = norm.y - drag.startY;
      const newVerts = room.vertices.map((v) => ({
        x: clamp01(v.x + dx),
        y: clamp01(v.y + dy),
      }));
      setDrag({ ...drag, overrideVertices: newVerts });
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;

    if (drag.phase === "pending") {
      // No movement past the threshold — treat as a click.
      if (drag.kind === "body") {
        onSelectRoom(selectedIndex === drag.roomIndex ? null : drag.roomIndex);
      }
      // Vertex clicks without drag are no-ops for now (will become "select vertex" in a later commit).
      setDrag(null);
      return;
    }

    // Active drag — commit the override to the parent.
    if (onUpdateRoom) {
      const verts = drag.overrideVertices;
      const bbox = computeBbox(verts);
      onUpdateRoom(drag.roomIndex, {
        vertices: verts,
        bbox,
        centroid: computeCentroid(verts),
        ...scaledDimensions(rooms[drag.roomIndex], bbox),
      });
    }
    setDrag(null);
  }

  function handlePointerCancel(e: React.PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    setDrag(null);
  }

  // ── Render ───────────────────────────────────────────────────────

  const selectedRoom = selectedIndex != null ? displayRooms[selectedIndex] : null;
  const selectedRoomVerts = selectedRoom?.vertices ?? [];

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl border border-border bg-bg-input overflow-hidden select-none"
      style={{ aspectRatio, touchAction: "none" }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-label="Floorplan room overlay"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {displayRooms.map((room, i) => {
          const isSelected = i === selectedIndex;
          const isDragging = drag?.phase === "active" && drag.roomIndex === i;
          const cursor = isSelected ? (isDragging ? "grabbing" : "grab") : "pointer";

          return room.vertices.length >= 3 ? (
            <polygon
              key={room.polygon_id || i}
              points={room.vertices.map((v) => `${v.x * 100},${v.y * 100}`).join(" ")}
              fill="transparent"
              stroke="transparent"
              style={{ cursor }}
              onPointerDown={(e) => handleBodyPointerDown(e, i)}
              onPointerEnter={() => onHoverRoom?.(i)}
              onPointerLeave={() => onHoverRoom?.(null)}
            />
          ) : (
            <rect
              key={room.polygon_id || i}
              x={room.bbox.x * 100}
              y={room.bbox.y * 100}
              width={room.bbox.width * 100}
              height={room.bbox.height * 100}
              fill="transparent"
              stroke="transparent"
              style={{ cursor }}
              onPointerDown={(e) => handleBodyPointerDown(e, i)}
              onPointerEnter={() => onHoverRoom?.(i)}
              onPointerLeave={() => onHoverRoom?.(null)}
            />
          );
        })}

        {/* Vertex handles on selected polygon only */}
        {selectedRoom && (() => {
          const isRect = isAxisAlignedRectangle(selectedRoomVerts);
          const centroid = isRect ? computeCentroid(selectedRoomVerts) : { x: 0, y: 0 };
          return selectedRoomVerts.map((v, vIdx) => {
            const cx = v.x * 100;
            const cy = v.y * 100;
            const cursor = isRect ? cornerCursor(v, centroid) : "grab";
            return (
              <g key={`handle-${vIdx}`}>
                {/* Invisible hit area — bigger on touch devices */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={2.5}
                  className="vertex-handle-hit"
                  fill="transparent"
                  onPointerDown={(e) => handleVertexPointerDown(e, selectedIndex!, vIdx)}
                  style={{ cursor }}
                />
                {/* Visible dot */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={0.9}
                  fill="#fff"
                  stroke="rgba(0,0,0,0.8)"
                  strokeWidth={0.25}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: "none" }}
                />
              </g>
            );
          });
        })()}
      </svg>
      <style>{`
        @media (pointer: coarse) {
          .vertex-handle-hit { r: 4; }
        }
      `}</style>
    </div>
  );
}
