import { describe, expect, it } from "vitest";
import { decodeHeights, type HeightmapMeta } from "./heightmap";

describe("decodeHeights", () => {
  it("maps the range floor and ceiling to min_m and max_m", () => {
    const out = decodeHeights([0, 65535], { width: 2, height: 1, min_m: 0, max_m: 10 });
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(10, 5);
  });

  it("agrees with the Python quantizer (pipeline/yelamu/export.py)", () => {
    // Values produced by Python's quantize_heights([12.345, -3.0, 281.0], -10, 300).
    const q = [4724, 1480, 61518];
    const out = decodeHeights(q, { width: 3, height: 1, min_m: -10, max_m: 300 });
    expect(out[0]).toBeCloseTo(12.3459, 3);
    expect(out[1]).toBeCloseTo(-2.9992, 3);
    expect(out[2]).toBeCloseTo(280.9984, 3);
  });

  it("rejects a value array of the wrong size", () => {
    expect(() => decodeHeights([0], { width: 2, height: 2, min_m: 0, max_m: 1 })).toThrow(
      /expected 4 values/,
    );
  });
});

describe("HeightmapMeta overlay_villages", () => {
  it("is an optional count, and the shipped real-city meta carries it", () => {
    // Compile-time check: the field exists on the type and is optional.
    const without: Pick<HeightmapMeta, "overlay_villages"> = {};
    const withCount: Pick<HeightmapMeta, "overlay_villages"> = { overlay_villages: 5 };
    expect(without.overlay_villages).toBeUndefined();
    expect(withCount.overlay_villages).toBe(5);

    const shipped = Object.values(
      import.meta.glob("../public/assets/real-city/meta.json", { eager: true, import: "default" }),
    ) as HeightmapMeta[];
    expect(shipped).toHaveLength(1);
    expect(shipped[0].overlay_villages).toBe(5);
    expect(shipped[0].hand_sources?.filter((h) => h.layer === "villages")).toHaveLength(1);
  });
});
