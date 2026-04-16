"use client";

import type { FloorplanLayout } from "@/types/duct-layout";

type Props = {
  layout: FloorplanLayout;
  totalSqft: number;
  roomCount: number;
  climateZone: string;
  totalBTU: number;
};

export function FloorplanSchematic({
  layout,
  totalSqft,
  roomCount,
  climateZone,
  totalBTU,
}: Props) {
  const { rooms, ducts, equipment, viewBox, floorLabels } = layout;
  const btuLabel =
    totalBTU >= 1000 ? `${Math.round(totalBTU / 1000)}k BTU` : `${totalBTU} BTU`;

  return (
    <div className="rounded-xl border border-border bg-bg-card/70 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-txt-tertiary">
          Duct Layout
        </span>
        <span className="text-[11px] text-txt-tertiary">
          {totalSqft.toLocaleString()} sq ft
        </span>
      </div>

      {/* SVG */}
      <div className="relative overflow-hidden bg-bg-input" style={{ aspectRatio: `${viewBox.width} / ${viewBox.height}` }}>
        <svg
          viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
          className="h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Duct layout schematic"
        >
          <defs>
            <pattern
              id="schematic-grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="rgba(148,163,184,0.08)"
                strokeWidth="1"
              />
            </pattern>
            <linearGradient
              id="schematic-roomGlow"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="rgba(6,182,212,0.22)" />
              <stop offset="100%" stopColor="rgba(59,130,246,0.08)" />
            </linearGradient>
            {/* Trunk glow filter */}
            <filter id="trunk-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid background */}
          <rect
            width={viewBox.width}
            height={viewBox.height}
            fill="url(#schematic-grid)"
          />

          {/* Outer walls */}
          {floorLabels.length === 0 ? (
            <rect
              x="30"
              y="30"
              width={viewBox.width - 60}
              height={viewBox.height - 60}
              fill="none"
              stroke="rgba(148,163,184,0.5)"
              strokeWidth="2.5"
              rx="4"
            />
          ) : (
            floorLabels.map((fl, i) => {
              const nextY = i < floorLabels.length - 1
                ? floorLabels[i + 1].y
                : viewBox.height - 30;
              const sectionH = nextY - fl.y - (i < floorLabels.length - 1 ? 10 : 0);
              return (
                <g key={fl.label}>
                  <text
                    x="32"
                    y={fl.y + 11}
                    fill="rgba(148,163,184,0.6)"
                    fontSize="10"
                    fontWeight="600"
                    fontFamily="system-ui, sans-serif"
                  >
                    {fl.label}
                  </text>
                  <rect
                    x="30"
                    y={fl.y + 16}
                    width={viewBox.width - 60}
                    height={sectionH - 16}
                    fill="none"
                    stroke="rgba(148,163,184,0.5)"
                    strokeWidth="2.5"
                    rx="4"
                  />
                </g>
              );
            })
          )}

          {/* Duct trunk segments */}
          {ducts
            .filter((d) => d.type === "trunk")
            .map((d, i) => (
              <line
                key={`trunk-${i}`}
                x1={d.from.x}
                y1={d.from.y}
                x2={d.to.x}
                y2={d.to.y}
                stroke="rgba(34,211,238,0.7)"
                strokeWidth="3"
                filter="url(#trunk-glow)"
              >
                <title>Trunk: {d.size}</title>
              </line>
            ))}

          {/* Duct branch segments */}
          {ducts
            .filter((d) => d.type === "branch")
            .map((d, i) => (
              <line
                key={`branch-${i}`}
                x1={d.from.x}
                y1={d.from.y}
                x2={d.to.x}
                y2={d.to.y}
                stroke="rgba(34,211,238,0.35)"
                strokeWidth="1.2"
                strokeDasharray="4,3"
              >
                <title>Branch: {d.size}</title>
              </line>
            ))}

          {/* Rooms */}
          {rooms.map((room) => {
            const tooltip = (
              <title>
                {room.name} ({room.type}){"\n"}
                {room.sqft} sqft · {room.cfm} CFM{"\n"}
                {room.regs} supply register{room.regs !== 1 ? "s" : ""}
                {room.hasReturn ? " · Return grille" : ""}
              </title>
            );
            const useRect = room.polygon.length < 3;
            return (
            <g key={room.id}>
              {useRect ? (
                <rect
                  x={room.x}
                  y={room.y}
                  width={room.width}
                  height={room.height}
                  fill="url(#schematic-roomGlow)"
                  stroke="rgba(34,211,238,0.55)"
                  strokeWidth="1.5"
                >
                  {tooltip}
                </rect>
              ) : (
                <polygon
                  points={room.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="url(#schematic-roomGlow)"
                  stroke="rgba(34,211,238,0.55)"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                >
                  {tooltip}
                </polygon>
              )}

              {/* Room name label (centered on bbox) */}
              {room.width > 30 && room.height > 20 && (
                <text
                  x={room.x + room.width / 2}
                  y={room.y + room.height / 2 + 3}
                  textAnchor="middle"
                  fill="rgba(148,163,184,0.5)"
                  fontSize={Math.min(9, room.width / 6)}
                  fontFamily="system-ui, sans-serif"
                >
                  {room.name}
                </text>
              )}
            </g>
            );
          })}

          {/* Supply register dots */}
          {rooms.flatMap((room) =>
            room.registerPositions.map((pos, i) => (
              <circle
                key={`${room.id}-reg-${i}`}
                cx={pos.x}
                cy={pos.y}
                r="3"
                fill="#22D3EE"
              >
                <title>Supply register</title>
              </circle>
            )),
          )}

          {/* Return grille markers (small squares) */}
          {rooms
            .filter((r) => r.hasReturn)
            .map((room) => {
              const rx = room.x + room.width - 10;
              const ry = room.y + 6;
              return (
                <rect
                  key={`${room.id}-ret`}
                  x={rx}
                  y={ry}
                  width="5"
                  height="5"
                  fill="rgba(251,191,36,0.8)"
                  rx="1"
                >
                  <title>Return grille</title>
                </rect>
              );
            })}

          {/* Equipment node */}
          <g>
            <rect
              x={equipment.x - 14}
              y={equipment.y - 7}
              width="28"
              height="14"
              rx="3"
              fill="rgba(6,182,212,0.3)"
              stroke="#22D3EE"
              strokeWidth="1.5"
            />
            <text
              x={equipment.x}
              y={equipment.y + 3}
              textAnchor="middle"
              fill="#22D3EE"
              fontSize="6"
              fontWeight="600"
              fontFamily="system-ui, sans-serif"
            >
              AHU
            </text>
            <title>{equipment.label}</title>
          </g>
        </svg>

        {/* Room labels overlay */}
        <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1.5">
          {rooms.slice(0, 8).map((room) => (
            <span
              key={room.id}
              className="rounded-md border border-b-accent bg-bg-card/90 px-2 py-0.5 text-[10px] font-medium text-accent-light backdrop-blur"
            >
              {room.name} {room.sqft}
            </span>
          ))}
          {rooms.length > 8 && (
            <span className="rounded-md bg-bg-card/90 px-2 py-0.5 text-[10px] text-txt-tertiary backdrop-blur">
              +{rooms.length - 8} more
            </span>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2 p-4">
        <MiniStat label="Rooms" value={String(roomCount)} />
        <MiniStat label="Zone" value={climateZone} />
        <MiniStat label="Load" value={btuLabel} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-bg-secondary/50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-txt-tertiary">
        {label}
      </div>
      <div
        className="text-sm font-semibold text-txt-primary"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
    </div>
  );
}
