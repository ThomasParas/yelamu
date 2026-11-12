import { describe, expect, it } from "vitest";
import {
  chunkKey,
  chunkWorldBounds,
  lodForZoom,
  planChunks,
  strideFor,
  switchZoomFor,
} from "./chunks";

describe("planChunks", () => {
  it("covers every cell edge exactly once, with inclusive shared borders", () => {
    const width = 11;
    const height = 8;
    const plan = planChunks(width, height, 4);
    const colHits = new Array(width - 1).fill(0);
    const rowHits = new Array(height - 1).fill(0);
    for (const c of plan) {
      if (c.cy === 0) for (let x = c.x0; x < c.x0 + c.w; x++) colHits[x]++;
      if (c.cx === 0) for (let y = c.y0; y < c.y0 + c.h; y++) rowHits[y]++;
    }
    expect(colHits.every((n) => n === 1)).toBe(true);
    expect(rowHits.every((n) => n === 1)).toBe(true);
    // Total cell area = (width-1)*(height-1).
    expect(plan.reduce((s, c) => s + c.w * c.h, 0)).toBe((width - 1) * (height - 1));
  });

  it("shortens the last chunk and never exceeds the grid", () => {
    const plan = planChunks(11, 8, 4); // 10 x 7 cells -> 3 x 2 chunks
    expect(plan).toHaveLength(6);
    const last = plan[plan.length - 1];
    expect(last).toEqual({ cx: 2, cy: 1, x0: 8, y0: 4, w: 2, h: 3 });
    for (const c of plan) {
      expect(c.x0 + c.w).toBeLessThanOrEqual(10);
      expect(c.y0 + c.h).toBeLessThanOrEqual(7);
    }
  });

  it("orders chunks row-major (north row first)", () => {
    const plan = planChunks(11, 8, 4);
    expect(plan.map((c) => [c.cx, c.cy])).toEqual([
      [0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1],
    ]);
  });

  it("handles the real city size", () => {
    const plan = planChunks(1760, 1560, 128);
    expect(plan).toHaveLength(14 * 13);
    expect(plan[13].w).toBe(1759 - 13 * 128);
  });

  it("makes a single chunk for a tiny grid", () => {
    expect(planChunks(2, 2, 128)).toEqual([{ cx: 0, cy: 0, x0: 0, y0: 0, w: 1, h: 1 }]);
  });

  it("rejects degenerate input", () => {
    expect(() => planChunks(1, 5, 4)).toThrow();
    expect(() => planChunks(5, 1, 4)).toThrow();
    expect(() => planChunks(5, 5, 0)).toThrow();
  });
});

describe("lod helpers", () => {
  it("lodForZoom switches at the threshold (inclusive)", () => {
    expect(lodForZoom(1, 2)).toBe(1);
    expect(lodForZoom(2, 2)).toBe(0);
    expect(lodForZoom(10, 2)).toBe(0);
  });

  it("strideFor maps lods to strides", () => {
    expect(strideFor(0)).toBe(1);
    expect(strideFor(1)).toBe(4);
  });

  it("chunkKey is unique per chunk and lod", () => {
    const [a, b] = planChunks(11, 8, 4);
    expect(chunkKey(a, 0)).not.toBe(chunkKey(a, 1));
    expect(chunkKey(a, 0)).not.toBe(chunkKey(b, 0));
    expect(chunkKey(a, 0)).toBe(chunkKey({ ...a }, 0));
  });
});

describe("switchZoomFor", () => {
  it("is the zoom at which stride-4 vertices are maxSpacingPx apart", () => {
    // 15000 world units across 1000 px = 15 m/px; 40 m spacing is 2.667 px at zoom 1.
    expect(switchZoomFor(15000, 1000, 10, 6, 4)).toBeCloseTo(6 / (40 / 15), 6);
  });

  it("is below the minimum zoom for a small map, so it is always full resolution", () => {
    expect(switchZoomFor(4000, 900, 10, 6, 4)).toBeLessThan(1);
  });
});

describe("chunkWorldBounds", () => {
  const size = { width: 3, height: 3, cell_m: 10 };

  it("matches the terrainMesh world coordinates (north is -z)", () => {
    const b = chunkWorldBounds({ cx: 0, cy: 0, x0: 0, y0: 0, w: 2, h: 2 }, size, -1, 5);
    expect(b.min).toEqual([-10, -1, -10]);
    expect(b.max).toEqual([10, 5, 10]);
  });

  it("places an inner chunk correctly", () => {
    const b = chunkWorldBounds({ cx: 1, cy: 1, x0: 1, y0: 1, w: 1, h: 1 }, size, 0, 1);
    expect(b.min).toEqual([0, 0, 0]);
    expect(b.max).toEqual([10, 1, 10]);
  });
});
