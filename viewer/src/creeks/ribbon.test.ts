import { describe, expect, it } from "vitest";
import { buildRibbons } from "./ribbon";

const flat = (h: number) => () => h;
const opts = (over: Record<string, unknown> = {}) => ({
  heightAt: flat(10),
  waterLevelM: 0.6,
  widthM: 10,
  stepM: 20,
  liftM: 3,
  exaggeration: 3,
  ...over,
});

describe("buildRibbons", () => {
  it("makes two vertices per point and two triangles per segment", () => {
    const m = buildRibbons([[0, 0, 100, 0]], opts());
    // 100 m at a 20 m step: 6 points -> 12 vertices, 5 segments -> 10 triangles
    expect(m.positions.length / 3).toBe(12);
    expect(m.indices.length / 3).toBe(10);
  });

  it("is as wide as asked, perpendicular to the line, and sits at (ground + lift) * exaggeration", () => {
    const m = buildRibbons([[0, 0, 100, 0]], opts());
    const p = m.positions;
    // first point at x = 0: one vertex at z = +5, one at z = -5, both at y = (10 + 3) * 3 = 39
    const a = [p[0], p[1], p[2]];
    const b = [p[3], p[4], p[5]];
    expect(a[0]).toBeCloseTo(0);
    expect(b[0]).toBeCloseTo(0);
    expect(Math.abs(a[2] - b[2])).toBeCloseTo(10);
    expect(a[1]).toBeCloseTo(39);
    expect(b[1]).toBeCloseTo(39);
  });

  it("keeps the ribbon above the sea where the ground is below the water level", () => {
    const m = buildRibbons([[0, 0, 40, 0]], opts({ heightAt: flat(-2) }));
    expect(m.positions[1]).toBeCloseTo((0.6 + 3) * 3);
  });

  it("follows the terrain height at each vertex", () => {
    const m = buildRibbons([[0, 0, 100, 0]], opts({ heightAt: (x: number) => x / 10, waterLevelM: 0 }));
    const p = m.positions;
    const last = p.length - 6; // the last pair
    expect(p[last + 1]).toBeCloseTo((10 + 3) * 3);
    expect(p[1]).toBeCloseTo((0 + 3) * 3);
  });

  it("joins several lines into one mesh and offsets the indices", () => {
    const m = buildRibbons([[0, 0, 40, 0], [0, 100, 40, 100]], opts());
    expect(m.positions.length / 3).toBe(2 * 3 * 2); // 3 points each, 2 vertices per point
    expect(Math.max(...m.indices)).toBe(m.positions.length / 3 - 1);
  });

  /** The horizontal distance between the left and right vertex of every point pair. */
  const pairWidths = (positions: Float32Array): number[] => {
    const out: number[] = [];
    for (let i = 0; i + 5 < positions.length; i += 6) {
      out.push(Math.hypot(positions[i] - positions[i + 3], positions[i + 2] - positions[i + 5]));
    }
    return out;
  };

  it("offsets a bend vertex along the AVERAGED direction of its two segments", () => {
    // (0,0) -> (50,0) -> (50,50), one draped point per vertex: the corner at (50,0) sees the
    // two segments' mean direction (1,1)/sqrt(2), so its pair sits half a width either side of
    // the corner along the perpendicular (-1,1)/sqrt(2), not straight across the first segment.
    const m = buildRibbons([[0, 0, 50, 0, 50, 50]], opts({ stepM: 1000 }));
    const p = m.positions;
    expect(p.length / 3).toBe(6);
    const off = 5 / Math.SQRT2;
    expect([p[6], p[8]]).toEqual([expect.closeTo(50 - off, 4), expect.closeTo(off, 4)]);
    expect([p[9], p[11]]).toEqual([expect.closeTo(50 + off, 4), expect.closeTo(-off, 4)]);
    for (const w of pairWidths(p)) expect(w).toBeCloseTo(10, 4);
  });

  it("copes with a repeated point: no zero-width pair, every pair is a full width", () => {
    const repeat = buildRibbons([[0, 0, 0, 0, 50, 0]], opts());
    expect(repeat.positions.every(Number.isFinite)).toBe(true);
    const widths = pairWidths(repeat.positions);
    expect(widths.length).toBeGreaterThan(2);
    for (const w of widths) expect(w).toBeCloseTo(10, 4);
    // the repeat makes no extra pair: same vertex count as the line without it
    expect(repeat.positions.length).toBe(buildRibbons([[0, 0, 50, 0]], opts()).positions.length);
  });

  it("copes with a line of two identical points", () => {
    expect(buildRibbons([[5, 5, 5, 5]], opts()).positions.length).toBe(0);
  });

  it("returns an empty mesh for no lines", () => {
    const m = buildRibbons([], opts());
    expect(m.positions.length).toBe(0);
    expect(m.indices.length).toBe(0);
  });

  it("is deterministic and does not change its input", () => {
    const input = [[0, 0, 100, 30, 200, 0]];
    const copy = JSON.stringify(input);
    const a = buildRibbons(input, opts());
    const b = buildRibbons(input, opts());
    expect(JSON.stringify(input)).toBe(copy);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  });

  it("rejects a non-positive width", () => {
    expect(() => buildRibbons([[0, 0, 10, 0]], opts({ widthM: 0 }))).toThrow(RangeError);
  });
});
