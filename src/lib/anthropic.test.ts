import { describe, it, expect } from "vitest";
import { formatPolygonsForPrompt } from "./anthropic";
import type { RoomPolygon } from "./geometry/client";

function makePolygon(id: string, overrides: Partial<RoomPolygon> = {}): RoomPolygon {
  return {
    id,
    vertices: [
      { x: 0.1, y: 0.1 },
      { x: 0.4, y: 0.1 },
      { x: 0.4, y: 0.35 },
      { x: 0.1, y: 0.35 },
    ],
    bbox: { x: 0.1, y: 0.1, width: 0.3, height: 0.25 },
    centroid: { x: 0.25, y: 0.225 },
    area: 0.075,
    adjacent_to: [],
    ...overrides,
  };
}

describe("formatPolygonsForPrompt", () => {
  it("formats single floor with one polygon", () => {
    const result = formatPolygonsForPrompt([
      { floor: 1, polygons: [makePolygon("room_0")] },
    ]);
    expect(result).toContain("[Floor 1]");
    expect(result).toContain("room_0");
    expect(result).toContain("bbox(x=0.100");
    expect(result).toContain("centroid(0.250, 0.225)");
    expect(result).toContain("area=0.0750");
  });

  it("formats multiple polygons with adjacency", () => {
    const p0 = makePolygon("room_0", {
      adjacent_to: [{ room_id: "room_1", shared_edge: "right" }],
    });
    const p1 = makePolygon("room_1", {
      bbox: { x: 0.4, y: 0.1, width: 0.2, height: 0.25 },
      centroid: { x: 0.5, y: 0.225 },
      adjacent_to: [{ room_id: "room_0", shared_edge: "left" }],
    });
    const result = formatPolygonsForPrompt([{ floor: 1, polygons: [p0, p1] }]);
    expect(result).toContain("adjacent=[room_1 (right)]");
    expect(result).toContain("adjacent=[room_0 (left)]");
  });

  it("formats multi-floor plans", () => {
    const result = formatPolygonsForPrompt([
      { floor: 1, polygons: [makePolygon("room_0")] },
      { floor: 2, polygons: [makePolygon("room_1")] },
    ]);
    expect(result).toContain("[Floor 1]");
    expect(result).toContain("[Floor 2]");
    expect(result).toContain("room_0");
    expect(result).toContain("room_1");
  });

  it("handles empty polygon list", () => {
    const result = formatPolygonsForPrompt([{ floor: 1, polygons: [] }]);
    expect(result).toContain("[Floor 1]");
    expect(result).not.toContain("room_");
  });

  it("omits adjacency section when no adjacencies", () => {
    const result = formatPolygonsForPrompt([
      { floor: 1, polygons: [makePolygon("room_0")] },
    ]);
    expect(result).not.toContain("adjacent=");
  });
});
