"use client";

import { Trash2, Plus } from "lucide-react";
import { useEstimator } from "@/hooks/use-estimator";
import { ROOM_TYPES, LOAD_FACTORS } from "@/lib/hvac/parts-db";
import { formatRoomType } from "@/lib/utils";
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
    updateRoom,
    removeRoom,
    addRoom,
    generateBom,
    setStep,
  } = useEstimator();

  const totalSqft = rooms.reduce((sum, r) => sum + (r.estimated_sqft ?? 0), 0);
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
            AI detected {rooms.length} rooms — {totalSqft.toLocaleString()} sq ft total.
            Edit anything that looks off.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={CONFIDENCE_VARIANT[confidence] ?? "secondary"}>
            {confidence} confidence
          </Badge>
          <Button size="sm" variant="outline" onClick={addRoom}>
            <Plus className="mr-1 h-4 w-4" />
            Add Room
          </Button>
          <Button size="sm" onClick={generateBom} disabled={rooms.length === 0} className="bg-gradient-brand hover-lift">
            Generate Estimate →
          </Button>
        </div>
      </div>

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

              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                {floorRooms.map(({ room, index: i }) => {
                  const factor = LOAD_FACTORS[room.type] ?? LOAD_FACTORS.bedroom;
                  const estBtu = Math.round((room.estimated_sqft ?? 0) * factor.btu);

                  return (
                    <div
                      key={i}
                      className="bg-gradient-card border-border hover:border-b-accent hover-glow hover-lift transition-all duration-[250ms] rounded-xl p-4 shadow-sm"
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <Input
                          value={room.name}
                          onChange={(e) => updateRoom(i, { name: e.target.value })}
                          className="h-8 border-0 bg-transparent px-0 text-sm font-semibold shadow-none focus-visible:border-b focus-visible:border-primary focus-visible:ring-0 text-txt-primary"
                        />
                        <button
                          onClick={() => removeRoom(i)}
                          className="shrink-0 text-txt-tertiary hover:text-error"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
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
                          <div className="space-y-1">
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

                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-txt-tertiary">
                          <span>{room.width_ft || "?"}' × {room.length_ft || "?"}'</span>
                          <span>·</span>
                          <span>{estBtu.toLocaleString()} BTU</span>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer">
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

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep("select_pages")}>
          Back
        </Button>
        <Button onClick={generateBom} disabled={rooms.length === 0} className="bg-gradient-brand hover-lift">
          Generate Bill of Materials
        </Button>
      </div>
    </div>
  );
}
