import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractGeometry, GeometryServiceError } from "../client";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const MOCK_POLYGONS = [
  {
    id: "room_0",
    vertices: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.1, y: 0.5 }],
    bbox: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
    centroid: { x: 0.3, y: 0.3 },
    area: 0.16,
    adjacent_to: [{ room_id: "room_1", shared_edge: "right" }],
  },
  {
    id: "room_1",
    vertices: [{ x: 0.5, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.5 }, { x: 0.5, y: 0.5 }],
    bbox: { x: 0.5, y: 0.1, width: 0.4, height: 0.4 },
    centroid: { x: 0.7, y: 0.3 },
    area: 0.16,
    adjacent_to: [{ room_id: "room_0", shared_edge: "left" }],
  },
];

describe("extractGeometry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GEOMETRY_SERVICE_URL = "http://localhost:8000";
  });

  it("returns polygons on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ polygons: MOCK_POLYGONS, image_width: 800, image_height: 600 }),
    });
    const result = await extractGeometry(Buffer.from("fake-image"), "image/jpeg");
    expect(result.polygons).toHaveLength(2);
    expect(result.polygons[0].id).toBe("room_0");
    expect(result.polygons[0].bbox.x).toBe(0.1);
  });

  it("throws GeometryServiceError on 422", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ detail: { error: "Could not detect room boundaries" } }),
    });
    await expect(extractGeometry(Buffer.from("blank"), "image/jpeg")).rejects.toThrow(GeometryServiceError);
  });

  it("throws GeometryServiceError when service is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(extractGeometry(Buffer.from("img"), "image/jpeg")).rejects.toThrow(GeometryServiceError);
  });

  it("throws when GEOMETRY_SERVICE_URL is not set", async () => {
    delete process.env.GEOMETRY_SERVICE_URL;
    await expect(extractGeometry(Buffer.from("img"), "image/jpeg")).rejects.toThrow("GEOMETRY_SERVICE_URL");
  });
});
