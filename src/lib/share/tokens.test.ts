import { describe, it, expect } from "vitest";
import { generateShareToken } from "./tokens";

describe("generateShareToken", () => {
  it("returns a 43-character base64url string", () => {
    const token = generateShareToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates unique values across 1000 calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(generateShareToken());
    }
    expect(seen.size).toBe(1000);
  });
});
