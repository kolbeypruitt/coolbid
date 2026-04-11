import { describe, it, expect } from "vitest";
import { extractJson } from "./utils";

describe("extractJson", () => {
  it("extracts JSON from clean response", () => {
    const input = '{"rooms": []}';
    expect(JSON.parse(extractJson(input))).toEqual({ rooms: [] });
  });

  it("strips markdown code fences", () => {
    const input = '```json\n{"rooms": []}\n```';
    expect(JSON.parse(extractJson(input))).toEqual({ rooms: [] });
  });

  it("extracts JSON embedded in surrounding text", () => {
    const input = 'Here is the analysis:\n{"rooms": [{"name": "Kitchen"}]}\nDone.';
    const parsed = JSON.parse(extractJson(input));
    expect(parsed.rooms[0].name).toBe("Kitchen");
  });

  it("handles nested braces correctly", () => {
    const input = '{"building": {"total_sqft": 1600}, "rooms": []}';
    const parsed = JSON.parse(extractJson(input));
    expect(parsed.building.total_sqft).toBe(1600);
  });

  it("throws when no JSON object present", () => {
    expect(() => extractJson("No JSON here")).toThrow("Response did not contain a JSON object");
  });

  it("throws on array-only response", () => {
    expect(() => extractJson("[1, 2, 3]")).toThrow("Response did not contain a JSON object");
  });

  it("handles code fence without json label", () => {
    const input = '```\n{"key": "value"}\n```';
    expect(JSON.parse(extractJson(input))).toEqual({ key: "value" });
  });
});
