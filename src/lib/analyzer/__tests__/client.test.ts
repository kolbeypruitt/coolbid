import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { analyzeFloorPlan, AnalyzerServiceError } from "../client";

describe("analyzeFloorPlan", () => {
  const originalEnv = process.env.ANALYZER_SERVICE_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.ANALYZER_SERVICE_URL = "http://localhost:8000";
  });

  afterEach(() => {
    process.env.ANALYZER_SERVICE_URL = originalEnv;
    global.fetch = originalFetch;
  });

  it("posts image as multipart and returns parsed JSON", async () => {
    const mockResponse = {
      floorplan_type: "residential",
      confidence: "high",
      building: { stories: 1, total_sqft: 1000, units: 1, has_garage: false, building_shape: "rect" },
      rooms: [],
      hvac_notes: { suggested_equipment_location: "", suggested_zones: 1, special_considerations: [] },
      analysis_notes: "",
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    }) as unknown as typeof fetch;

    const result = await analyzeFloorPlan(Buffer.from("fake"), "image/jpeg");
    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/analyze",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws when ANALYZER_SERVICE_URL is not set", async () => {
    delete process.env.ANALYZER_SERVICE_URL;
    await expect(analyzeFloorPlan(Buffer.from("img"), "image/jpeg")).rejects.toThrow(
      "ANALYZER_SERVICE_URL"
    );
  });

  it("raises AnalyzerServiceError on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ detail: { error: "Vision call failed" } }),
    }) as unknown as typeof fetch;

    await expect(analyzeFloorPlan(Buffer.from("img"), "image/jpeg")).rejects.toMatchObject({
      name: "AnalyzerServiceError",
      statusCode: 502,
    });
  });

  it("raises AnalyzerServiceError on network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("econnrefused"));
    await expect(analyzeFloorPlan(Buffer.from("img"), "image/jpeg")).rejects.toThrow(
      "Analyzer service unavailable"
    );
  });
});
