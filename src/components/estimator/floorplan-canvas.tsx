"use client";

import { useRef, useEffect, useCallback, useState } from "react";
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
  /** Index of the room currently hovered */
  hoveredIndex?: number | null;
  /** Called when hover state changes */
  onHoverRoom?: (index: number | null) => void;
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
  garage: "107,114,128",
  default: "148,163,184",
};

function getRoomColor(type: string): string {
  return ROOM_COLORS[type] ?? ROOM_COLORS.default;
}

function centroidOf(room: Room): { x: number; y: number } {
  if (room.centroid) return room.centroid;
  if (room.vertices.length >= 3) {
    const sx = room.vertices.reduce((s, v) => s + v.x, 0);
    const sy = room.vertices.reduce((s, v) => s + v.y, 0);
    return { x: sx / room.vertices.length, y: sy / room.vertices.length };
  }
  return {
    x: room.bbox.x + room.bbox.width / 2,
    y: room.bbox.y + room.bbox.height / 2,
  };
}

export function FloorplanCanvas({
  imageSrc,
  rooms,
  selectedIndex,
  onSelectRoom,
  hoveredIndex = null,
  onHoverRoom,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [aspectRatio, setAspectRatio] = useState(4 / 3);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setAspectRatio(img.naturalWidth / img.naturalHeight);
    };
    img.src = imageSrc;
  }, [imageSrc]);

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
    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      const color = getRoomColor(room.type);
      const isSelected = i === selectedIndex;
      const isHovered = i === hoveredIndex;

      const alpha = isSelected ? 0.35 : isHovered ? 0.25 : 0.15;
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
      const c = centroidOf(room);
      const fontSize = Math.max(10, Math.min(14, (room.bbox.width * w) / 8));
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Text shadow for readability
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillText(room.name, c.x * w + 1, c.y * h + 1);

      ctx.fillStyle = "#fff";
      ctx.fillText(room.name, c.x * w, c.y * h);
    }
  }, [rooms, selectedIndex, hoveredIndex]);

  // Redraw on state changes and resize
  useEffect(() => {
    draw();

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => draw());
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  // Also redraw when aspect ratio changes (image loaded)
  useEffect(() => {
    draw();
  }, [aspectRatio, draw]);

  function svgPoints(room: Room): string {
    return room.vertices.map((v) => `${v.x * 100},${v.y * 100}`).join(" ");
  }

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl border border-border bg-bg-input overflow-hidden"
      style={{ aspectRatio }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-label="Floorplan room overlay"
      >
        {rooms.map((room, i) =>
          room.vertices.length >= 3 ? (
            <polygon
              key={room.polygon_id || i}
              points={svgPoints(room)}
              fill="transparent"
              stroke="transparent"
              className="cursor-pointer"
              onClick={() => onSelectRoom(selectedIndex === i ? null : i)}
              onMouseEnter={() => onHoverRoom?.(i)}
              onMouseLeave={() => onHoverRoom?.(null)}
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
              className="cursor-pointer"
              onClick={() => onSelectRoom(selectedIndex === i ? null : i)}
              onMouseEnter={() => onHoverRoom?.(i)}
              onMouseLeave={() => onHoverRoom?.(null)}
            />
          ),
        )}
      </svg>
    </div>
  );
}
