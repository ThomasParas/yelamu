import { describe, expect, it } from "vitest";
import { decodeHeights } from "./heightmap";

describe("decodeHeights", () => {
  it("maps the range floor and ceiling to min_m and max_m", () => {
    const rgba = [0, 0, 0, 255, 255, 255, 0, 255];
    const out = decodeHeights(rgba, { width: 2, height: 1, min_m: 0, max_m: 10 });
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(10, 5);
  });

  it("agrees with the Python encoder (pipeline/yelamu/export.py)", () => {
    // Bytes produced by encode_heights([12.345, -3.0, 281.0], -10, 300).
    const rgba = [18, 116, 0, 255, 5, 200, 0, 255, 240, 78, 0, 255];
    const out = decodeHeights(rgba, { width: 3, height: 1, min_m: -10, max_m: 300 });
    expect(out[0]).toBeCloseTo(12.3459, 3);
    expect(out[1]).toBeCloseTo(-2.9992, 3);
    expect(out[2]).toBeCloseTo(280.9984, 3);
  });

  it("rejects a pixel buffer of the wrong size", () => {
    expect(() =>
      decodeHeights([0, 0, 0, 255], { width: 2, height: 2, min_m: 0, max_m: 1 }),
    ).toThrow(/expected 16 bytes/);
  });
});
