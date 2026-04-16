import { describe, it, expect } from "vitest";
import { formatFeetInches, formatRoomDimensions } from "./format-feet-inches";

describe("formatFeetInches", () => {
  it("formats whole feet", () => {
    expect(formatFeetInches(10)).toBe("10'-0\"");
  });

  it("rounds fractional feet to the nearest inch", () => {
    // 10.141509 ft = 121.698 in → rounds to 122 in → 10'-2"
    expect(formatFeetInches(10.141509)).toBe("10'-2\"");
    // 19.436768 ft = 233.241 in → rounds to 233 in → 19'-5"
    expect(formatFeetInches(19.436768)).toBe("19'-5\"");
  });

  it("carries when rounding pushes inches to 12", () => {
    // 11.99 ft = 143.88 in → rounds to 144 in → 12'-0"
    expect(formatFeetInches(11.99)).toBe("12'-0\"");
  });

  it("handles zero", () => {
    expect(formatFeetInches(0)).toBe("0'-0\"");
  });

  it("returns ? for invalid inputs", () => {
    expect(formatFeetInches(null)).toBe("?");
    expect(formatFeetInches(undefined)).toBe("?");
    expect(formatFeetInches(NaN)).toBe("?");
    expect(formatFeetInches(-1)).toBe("?");
  });
});

describe("formatRoomDimensions", () => {
  it("formats width × length", () => {
    expect(formatRoomDimensions(10.14, 19.44)).toBe("10'-2\" × 19'-5\"");
  });

  it("handles missing values independently", () => {
    expect(formatRoomDimensions(10, null)).toBe("10'-0\" × ?");
  });
});
