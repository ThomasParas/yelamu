import { describe, expect, it } from "vitest";
import { CREEK_TARGET_PX, CREEK_WIDTH_M, MAX_WIDTH_M, MODELLED_TARGET_PX, MODELLED_WIDTH_M, WIDTH_STEP } from "./colors";
import { metersPerPixel, ribbonWidth } from "./width";

describe("metersPerPixel", () => {
  it("is the frustum height over the zoom over the viewport height", () => {
    expect(metersPerPixel(5000, -5000, 1, 1000)).toBeCloseTo(10);
    expect(metersPerPixel(5000, -5000, 2, 1000)).toBeCloseTo(5);
    expect(metersPerPixel(5000, -5000, 1, 500)).toBeCloseTo(20);
  });

  it("falls back to 0 (close-up widths) for a zoom or a height that is zero, negative or not finite", () => {
    expect(metersPerPixel(5000, -5000, 0, 1000)).toBe(0);
    expect(metersPerPixel(5000, -5000, -1, 1000)).toBe(0);
    expect(metersPerPixel(5000, -5000, 1, 0)).toBe(0);
    expect(metersPerPixel(5000, -5000, Number.NaN, 1000)).toBe(0);
    expect(metersPerPixel(5000, -5000, 1, Number.POSITIVE_INFINITY)).toBe(0);
    expect(metersPerPixel(Number.NaN, -5000, 1, 1000)).toBe(0);
    expect(metersPerPixel(-5, 5, 1, 1000)).toBe(0); // an inverted frustum
  });
});

describe("constants", () => {
  it("hold the close-up widths and the targets the design asks for", () => {
    expect(CREEK_WIDTH_M).toBe(12);
    expect(MODELLED_WIDTH_M).toEqual({ 3: 6, 4: 9, 5: 12 });
    expect(CREEK_TARGET_PX).toBe(2.5);
    expect(MODELLED_TARGET_PX).toEqual({ 3: 1.5, 4: 2, 5: 2.5 });
    expect(WIDTH_STEP).toBe(1.3);
    expect(MAX_WIDTH_M).toBe(160);
  });
});

describe("ribbonWidth", () => {
  const base = CREEK_WIDTH_M;
  const px = CREEK_TARGET_PX;

  it("returns the base width when the wanted width is below it (close up)", () => {
    expect(ribbonWidth(base, px, 0.5)).toBe(base);
    expect(ribbonWidth(base, px, 1)).toBe(base); // 2.5 m wanted
    expect(ribbonWidth(base, px, base / px)).toBe(base); // exactly the base wanted
  });

  it("returns a level of base * 1.3^n that reaches target * mPerPx, far away", () => {
    const wanted = px * 20; // 50 m
    const w = ribbonWidth(base, px, 20);
    const n = Math.round(Math.log(w / base) / Math.log(WIDTH_STEP));
    expect(w).toBeCloseTo(base * WIDTH_STEP ** n, 9);
    expect(w).toBeGreaterThanOrEqual(wanted);
    // the smallest such level: one step lower would not reach it
    expect(w / WIDTH_STEP).toBeLessThan(wanted);
  });

  it("reaches the wanted width at 26 m per pixel, about the opening view (38 px per km)", () => {
    const w = ribbonWidth(base, px, 26.3); // 65.75 m wanted
    expect(w).toBeGreaterThanOrEqual(65.75);
    expect(w).toBeLessThan(65.75 * WIDTH_STEP);
  });

  it("steps by exactly 1.3 between neighbouring levels", () => {
    const levels = new Set<number>();
    for (let m = 5; m < 40; m += 0.05) levels.add(ribbonWidth(base, px, m));
    const sorted = [...levels].sort((a, b) => a - b);
    expect(sorted.length).toBeGreaterThan(3);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] / sorted[i - 1]).toBeCloseTo(WIDTH_STEP, 9);
  });

  it("is monotone non-decreasing as the metres per pixel grow", () => {
    let prev = 0;
    for (let m = 0; m < 400; m += 0.1) {
      const w = ribbonWidth(base, px, m);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });

  it("does not change level for a tiny change away from a threshold, and changes it across one", () => {
    const m = 20;
    const w = ribbonWidth(base, px, m);
    expect(ribbonWidth(base, px, m * 1.0001)).toBe(w);
    expect(ribbonWidth(base, px, m * 0.9999)).toBe(w);
    // w is a level; the next level above starts where target * m passes w
    const edge = w / px;
    expect(ribbonWidth(base, px, edge * 0.999)).toBe(w);
    expect(ribbonWidth(base, px, edge * 1.001)).toBeCloseTo(w * WIDTH_STEP, 9);
  });

  it("is capped at 160 m, after quantising", () => {
    expect(ribbonWidth(base, px, 1e6)).toBe(MAX_WIDTH_M);
    expect(ribbonWidth(MODELLED_WIDTH_M[3], MODELLED_TARGET_PX[3], 1e5)).toBe(MAX_WIDTH_M);
    for (let m = 0; m < 2000; m += 7) expect(ribbonWidth(base, px, m)).toBeLessThanOrEqual(MAX_WIDTH_M);
    // 12 * 1.3^9 = 128 m and 12 * 1.3^10 = 166 m: a wanted 150 m quantises to 166 and is cut to 160
    expect(ribbonWidth(base, px, 150 / px)).toBe(MAX_WIDTH_M);
    // a wanted 120 m quantises to 128, under the cap, and stays there
    expect(ribbonWidth(base, px, 120 / px)).toBeCloseTo(12 * 1.3 ** 9, 9);
  });

  it("gives the base width for non-finite or non-positive inputs", () => {
    for (const m of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -3, 0]) {
      expect(ribbonWidth(base, px, m)).toBe(base);
    }
    expect(ribbonWidth(base, Number.NaN, 50)).toBe(base);
    expect(ribbonWidth(base, -1, 50)).toBe(base);
  });

  it("gives each modelled band a width in its own proportion", () => {
    const m = 40;
    const w3 = ribbonWidth(MODELLED_WIDTH_M[3], MODELLED_TARGET_PX[3], m);
    const w5 = ribbonWidth(MODELLED_WIDTH_M[5], MODELLED_TARGET_PX[5], m);
    expect(w3).toBeGreaterThanOrEqual(1.5 * m);
    expect(w5).toBeGreaterThanOrEqual(2.5 * m);
    expect(w5).toBeGreaterThan(w3);
  });
});
