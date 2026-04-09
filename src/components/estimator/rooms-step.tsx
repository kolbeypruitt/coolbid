"use client";

import { Trash2, Plus } from "lucide-react";
import { useEstimator } from "@/hooks/use-estimator";
import { ROOM_TYPES } from "@/lib/hvac/parts-db";
import type { RoomType } from "@/types/hvac";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function formatRoomType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <span className="text-sm font-medium">
            {rooms.length} room{rooms.length !== 1 ? "s" : ""}
          </span>
          <span className="ml-2 text-sm text-muted-foreground">
            · {totalSqft.toLocaleString()} sq ft total
          </span>
        </div>
        <Badge variant={CONFIDENCE_VARIANT[confidence] ?? "secondary"}>
          {confidence} confidence
        </Badge>
        <div className="ml-auto">
          <Button size="sm" variant="outline" onClick={addRoom}>
            <Plus />
            Add Room
          </Button>
        </div>
      </div>

      {/* Room Cards */}
      <div className="space-y-3">
        {rooms.map((room, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{room.name || `Room ${i + 1}`}</CardTitle>
                <Button
                  size="icon-sm"
                  variant="destructive"
                  onClick={() => removeRoom(i)}
                >
                  <Trash2 />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="space-y-1.5">
                <Label htmlFor={`room-name-${i}`}>Name</Label>
                <Input
                  id={`room-name-${i}`}
                  value={room.name}
                  onChange={(e) => updateRoom(i, { name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`room-type-${i}`}>Type</Label>
                <Select
                  value={room.type}
                  onValueChange={(val) => updateRoom(i, { type: val as RoomType })}
                >
                  <SelectTrigger id={`room-type-${i}`} className="w-full">
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
              <div className="space-y-1.5">
                <Label htmlFor={`room-sqft-${i}`}>Sq Ft</Label>
                <Input
                  id={`room-sqft-${i}`}
                  type="number"
                  value={room.estimated_sqft}
                  onChange={(e) =>
                    updateRoom(i, { estimated_sqft: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`room-windows-${i}`}>Windows</Label>
                <Input
                  id={`room-windows-${i}`}
                  type="number"
                  min={0}
                  value={room.window_count}
                  onChange={(e) =>
                    updateRoom(i, { window_count: parseInt(e.target.value, 10) || 0 })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`room-ext-walls-${i}`}>Ext Walls</Label>
                <Input
                  id={`room-ext-walls-${i}`}
                  type="number"
                  min={0}
                  max={4}
                  value={room.exterior_walls}
                  onChange={(e) =>
                    updateRoom(i, { exterior_walls: parseInt(e.target.value, 10) || 0 })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`room-ceiling-${i}`}>Ceiling Ht (ft)</Label>
                <Input
                  id={`room-ceiling-${i}`}
                  type="number"
                  min={6}
                  value={room.ceiling_height}
                  onChange={(e) =>
                    updateRoom(i, { ceiling_height: parseFloat(e.target.value) || 8 })
                  }
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep("select_pages")}>
          Back
        </Button>
        <Button onClick={generateBom} disabled={rooms.length === 0}>
          Generate Bill of Materials
        </Button>
      </div>
    </div>
  );
}
