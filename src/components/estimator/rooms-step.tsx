"use client";

import { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { useEstimator } from "@/hooks/use-estimator";
import { ROOM_TYPES, LOAD_FACTORS } from "@/lib/hvac/parts-db";
import { formatRoomType } from "@/lib/utils";
import { formatRoomDimensions } from "@/lib/format-feet-inches";
import type { RoomType, Room } from "@/types/hvac";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FloorplanCanvas } from "@/components/estimator/floorplan-canvas";

const CONFIDENCE_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  high: "default",
  medium: "secondary",
  low: "destructive",
};

type GroupedRooms = {
  unit: number | null;
  unitSqft: number | null;
  floors: { floor: number; rooms: { room: Room; index: number }[] }[];
};

function groupRooms(rooms: Room[], unitCount: number, unitSqft?: number[]): GroupedRooms[] {
  if (unitCount <= 1) {
    // Single-unit: group by floor only
    const floorMap = new Map<number, { room: Room; index: number }[]>();
    rooms.forEach((room, index) => {
      const floor = room.floor ?? 1;
      if (!floorMap.has(floor)) floorMap.set(floor, []);
      floorMap.get(floor)!.push({ room, index });
    });

    const floors = [...floorMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([floor, rooms]) => ({ floor, rooms }));

    return [{ unit: null, unitSqft: null, floors }];
  }

  // Multi-unit: group by unit, then by floor
  const unitMap = new Map<number, Map<number, { room: Room; index: number }[]>>();
  rooms.forEach((room, index) => {
    const unit = room.unit ?? 1;
    const floor = room.floor ?? 1;
    if (!unitMap.has(unit)) unitMap.set(unit, new Map());
    const floorMap = unitMap.get(unit)!;
    if (!floorMap.has(floor)) floorMap.set(floor, []);
    floorMap.get(floor)!.push({ room, index });
  });

  return [...unitMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([unit, floorMap]) => ({
      unit,
      unitSqft: unitSqft?.[unit - 1] ?? null,
      floors: [...floorMap.entries()]
        .sort(([a], [b]) => a - b)
        .map(([floor, rooms]) => ({ floor, rooms })),
    }));
}

export function RoomsStep() {
  const {
    rooms,
    knownUnits,
    analysisResult,
    floorplanImg,
    pdfPages,
    selectedPages,
    selectedRoomIndex,
    setSelectedRoomIndex,
    updateRoom,
    removeRoom,
    addRoom,
    setStep,
    saveStatus,
    saveError,
  } = useEstimator();

  const [hoveredRoomIndex, setHoveredRoomIndex] = useState<number | null>(null);
  const [activeFloor, setActiveFloor] = useState(1);

  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);

  // Resolve which image to display (page matching active floor)
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

  const floorRoomsWithIndex = rooms
    .map((room, index) => ({ room, index }))
    .filter(({ room }) => room.floor === activeFloor);

  const totalSqft = rooms.reduce((sum, r) => sum + (r.estimated_sqft ?? 0), 0);
  const conditionedSqft = rooms
    .filter((r) => r.conditioned)
    .reduce((sum, r) => sum + (r.estimated_sqft ?? 0), 0);
  const confidence = analysisResult?.confidence ?? "medium";
  const unitCount = analysisResult?.building.units ?? knownUnits ?? 1;
  const groups = groupRooms(rooms, unitCount, analysisResult?.building.unit_sqft);
  const hasMultipleFloors = rooms.some((r) => r.floor > 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-txt-primary">Room Analysis</h2>
          <p className="text-sm text-txt-secondary">
            AI detected {rooms.length} rooms — {conditionedSqft.toLocaleString()} sq ft heated &amp; cooled
            {conditionedSqft < totalSqft && <> of {totalSqft.toLocaleString()} total</>}.
            Edit anything that looks off.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={CONFIDENCE_VARIANT[confidence] ?? "secondary"}>
            {confidence} confidence
          </Badge>
          <span
            className={`text-xs ${
              saveStatus === "error"
                ? "text-red-400"
                : saveStatus === "saving"
                ? "text-txt-secondary"
                : saveStatus === "saved"
                ? "text-green-400"
                : "text-txt-secondary/60"
            }`}
            title={saveError ?? undefined}
          >
            {saveStatus === "saving" && "Saving…"}
            {saveStatus === "saved" && "✓ Saved"}
            {saveStatus === "error" && "⚠ Save failed"}
          </span>
          <Button size="sm" variant="outline" onClick={addRoom}>
            <Plus className="mr-1 h-4 w-4" />
            Add Room
          </Button>
          <Button
            size="sm"
            onClick={() => setStep("equipment")}
            disabled={rooms.length === 0 || saveStatus === "saving"}
            className="bg-gradient-brand hover-lift"
            title={saveStatus === "saving" ? "Saving edits…" : undefined}
          >
            Pick Equipment →
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Floorplan canvas (only when image available) */}
        {displayImage && (
          <div className="space-y-2">
            {floors.length > 1 && (
              <div className="flex gap-1">
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
            <FloorplanCanvas
              imageSrc={displayImage}
              rooms={floorRoomsWithIndex.map(({ room }) => room)}
              selectedIndex={
                selectedRoomIndex != null
                  ? floorRoomsWithIndex.findIndex(({ index }) => index === selectedRoomIndex)
                  : null
              }
              onSelectRoom={(localIdx) => {
                if (localIdx == null) {
                  setSelectedRoomIndex(null);
                } else {
                  setSelectedRoomIndex(floorRoomsWithIndex[localIdx]?.index ?? null);
                }
              }}
              hoveredIndex={
                hoveredRoomIndex != null
                  ? floorRoomsWithIndex.findIndex(({ index }) => index === hoveredRoomIndex)
                  : null
              }
              onHoverRoom={(localIdx) => {
                if (localIdx == null) {
                  setHoveredRoomIndex(null);
                } else {
                  setHoveredRoomIndex(floorRoomsWithIndex[localIdx]?.index ?? null);
                }
              }}
              onUpdateRoom={(localIdx, partial) => {
                const globalIdx = floorRoomsWithIndex[localIdx]?.index;
                if (globalIdx != null) {
                  updateRoom(globalIdx, partial);
                }
              }}
            />
          </div>
        )}

        {/* Right: Room cards */}
        <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.unit ?? "single"} className="space-y-3">
          {group.unit != null && (
            <div className="flex items-center gap-2 pt-2">
              <h3 className="text-lg font-semibold text-txt-primary">
                Unit {group.unit}
              </h3>
              {group.unitSqft != null && (
                <span className="text-sm text-txt-secondary">
                  — {group.unitSqft.toLocaleString()} sq ft
                </span>
              )}
            </div>
          )}

          {group.floors.map(({ floor, rooms: floorRooms }) => (
            <div key={`${group.unit}-${floor}`} className="space-y-2">
              {(hasMultipleFloors || unitCount > 1) && (
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-txt-secondary">
                    Floor {floor}
                  </h4>
                  <span className="text-xs text-txt-tertiary">
                    {floorRooms.reduce((sum, { room }) => sum + (room.estimated_sqft ?? 0), 0).toLocaleString()} sq ft
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {floorRooms.map(({ room, index: i }) => {
                  const factor = LOAD_FACTORS[room.type] ?? LOAD_FACTORS.bedroom;
                  const estBtu = Math.round((room.estimated_sqft ?? 0) * factor.btu);

                  return (
                    <div
                      key={i}
                      onClick={() => {
                        const newIdx = selectedRoomIndex === i ? null : i;
                        setSelectedRoomIndex(newIdx);
                        if (newIdx != null) {
                          const room = rooms[newIdx];
                          if (room.floor !== activeFloor) setActiveFloor(room.floor);
                        }
                      }}
                      className={`bg-gradient-card border-border hover:border-b-accent hover-glow hover-lift transition-all duration-[250ms] rounded-xl p-3 shadow-sm cursor-pointer ${
                        selectedRoomIndex === i
                          ? "ring-2 ring-primary border-primary"
                          : hoveredRoomIndex === i
                            ? "ring-1 ring-primary/50"
                            : ""
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <Input
                          value={room.name}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => updateRoom(i, { name: e.target.value })}
                          className="h-8 border-0 bg-transparent px-0 text-sm font-semibold shadow-none focus-visible:border-b focus-visible:border-primary focus-visible:ring-0 text-txt-primary"
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); removeRoom(i); }}
                          className="shrink-0 text-txt-tertiary hover:text-error"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                      <div className="grid grid-cols-2 gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-1">
                          <Label className="text-xs text-txt-tertiary uppercase tracking-wider">Type</Label>
                          <Select
                            value={room.type}
                            onValueChange={(val) => updateRoom(i, { type: val as RoomType })}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROOM_TYPES.map((rt) => (
                                <SelectItem key={rt} value={rt}>
                                  {formatRoomType(rt)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-txt-tertiary uppercase tracking-wider">Sq Ft</Label>
                          <Input
                            type="number"
                            className="h-8 text-xs"
                            value={room.estimated_sqft}
                            onChange={(e) =>
                              updateRoom(i, { estimated_sqft: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-txt-tertiary uppercase tracking-wider">Windows</Label>
                          <Input
                            type="number"
                            className="h-8 text-xs"
                            min={0}
                            value={room.window_count}
                            onChange={(e) =>
                              updateRoom(i, { window_count: parseInt(e.target.value, 10) || 0 })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-txt-tertiary uppercase tracking-wider">Ext. Walls</Label>
                          <Input
                            type="number"
                            className="h-8 text-xs"
                            min={0}
                            max={4}
                            value={room.exterior_walls}
                            onChange={(e) =>
                              updateRoom(i, { exterior_walls: parseInt(e.target.value, 10) || 0 })
                            }
                          />
                        </div>
                        {unitCount > 1 && (
                          <div className="space-y-0.5">
                            <Label className="text-xs text-txt-tertiary uppercase tracking-wider">Unit</Label>
                            <Select
                              value={String(room.unit ?? 1)}
                              onValueChange={(val) => updateRoom(i, { unit: parseInt(val ?? "1", 10) })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: unitCount }, (_, u) => (
                                  <SelectItem key={u + 1} value={String(u + 1)}>
                                    Unit {u + 1}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-txt-tertiary">
                          <span>{formatRoomDimensions(room.width_ft, room.length_ft)}</span>
                          <span>·</span>
                          <span>{estBtu.toLocaleString()} BTU</span>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={room.conditioned}
                            onChange={(e) => updateRoom(i, { conditioned: e.target.checked })}
                            className="h-3.5 w-3.5 rounded accent-primary"
                          />
                          <span className="text-xs text-txt-tertiary">Heated &amp; Cooled</span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep("select_pages")}>
          Back
        </Button>
        <Button onClick={() => setStep("equipment")} disabled={rooms.length === 0} className="bg-gradient-brand hover-lift">
          Pick Equipment
        </Button>
      </div>
    </div>
  );
}
