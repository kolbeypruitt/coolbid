"use client";

import { Trash2, Plus } from "lucide-react";
import { useEstimator } from "@/hooks/use-estimator";
import { ROOM_TYPES, LOAD_FACTORS } from "@/lib/hvac/parts-db";
import { formatRoomType } from "@/lib/utils";
import type { RoomType } from "@/types/hvac";
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

export function RoomsStep() {
  const {
    rooms,
    analysisResult,
    updateRoom,
    removeRoom,
    addRoom,
    generateBom,
    setStep,
  } = useEstimator();

  const totalSqft = rooms.reduce((sum, r) => sum + (r.estimated_sqft ?? 0), 0);
  const confidence = analysisResult?.confidence ?? "medium";

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

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {rooms.map((room, i) => {
          const factor = LOAD_FACTORS[room.type] ?? LOAD_FACTORS.bedroom;
          const estBtu = Math.round((room.estimated_sqft ?? 0) * factor.btu);

          return (
            <div
              key={i}
              className="bg-gradient-card border-border hover:border-b-accent hover-glow hover-lift transition-all duration-[250ms] rounded-xl p-4 shadow-sm"
            >
              {/* Card header: name + delete */}
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

              {/* Fields: 2-column grid */}
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
              </div>

              {/* Footer meta */}
              <div className="mt-3 flex items-center gap-2 text-xs text-txt-tertiary">
                <span>{room.width_ft || "?"}' × {room.length_ft || "?"}'</span>
                <span>·</span>
                <span>{estBtu.toLocaleString()} BTU</span>
              </div>
            </div>
          );
        })}
      </div>

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
