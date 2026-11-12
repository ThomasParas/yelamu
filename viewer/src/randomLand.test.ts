import { describe, expect, it } from "vitest";
import { mulberry32, pickRandomLandPoint } from "./randomLand";

const size = { width: 20, height: 10, cell_m: 10 };

/** Cell (col,row) -> the world x/z terrainMesh.ts gives that sample. */
const cellOf = (p: { x: number; z: number }) => ({
  col: p.x / size.cell_m + (size.width - 1) / 2,
  row: p.z / size.cell_m + (size.height - 1) / 2,
});

function grid(fill: (col: number, row: number) => number): Float32Array {
  const h = new Float32Array(size.width * size.height);
  for (let r = 0; r < size.height; r++) for (let c = 0; c < size.width; c++) h[r * size.width + c] = fill(c, r);
  return h;
}

describe("mulberry32", () => {
  it("is deterministic for a seed and stays in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 50 }, () => a());
    const seqB = Array.from({ length: 50 }, () => b());
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(Array.from({ length: 5 }, mulberry32(43))).not.toEqual(seqA.slice(0, 5));
  });
});

describe("pickRandomLandPoint", () => {
  it("is deterministic with a seeded rng", () => {
    const h = grid(() => 20);
    const a = pickRandomLandPoint(h, size, 0.6, mulberry32(7));
    const b = pickRandomLandPoint(h, size, 0.6, mulberry32(7));
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
  });

  it("uses terrainMesh world coordinates (cell centres, origin at the middle)", () => {
    const h = grid((c, r) => (c === 0 && r === 0 ? 50 : -5)); // single land cell: NW corner
    const p = pickRandomLandPoint(h, size, 0.6, mulberry32(1))!;
    expect(p.x).toBeCloseTo(-9.5 * 10);
    expect(p.z).toBeCloseTo(-4.5 * 10);
  });

  it("only returns land above both minHeight and the water level", () => {
    // Left half is land at 10 m, right half is below the 3 m minimum, a strip is 2 m.
    const h = grid((c) => (c < 10 ? 10 : 2));
    const rng = mulberry32(99);
    for (let i = 0; i < 300; i++) {
      const p = pickRandomLandPoint(h, size, 0.6, rng)!;
      const { col } = cellOf(p);
      expect(col).toBeLessThan(10);
    }
  });

  it("respects a water level higher than minHeight", () => {
    const h = grid((c) => (c < 5 ? 40 : 8));
    const rng = mulberry32(5);
    for (let i = 0; i < 100; i++) {
      const p = pickRandomLandPoint(h, size, 10, rng)!;
      expect(cellOf(p).col).toBeLessThan(5);
    }
  });

  it("finds a lone land cell even when random tries would miss it", () => {
    const h = grid((c, r) => (c === 13 && r === 6 ? 30 : 0));
    const p = pickRandomLandPoint(h, size, 0.6, mulberry32(3), 3, 5)!;
    expect(p).not.toBeNull();
    const { col, row } = cellOf(p);
    expect(Math.round(col)).toBe(13);
    expect(Math.round(row)).toBe(6);
  });

  it("returns null when there is no land", () => {
    expect(pickRandomLandPoint(grid(() => 0), size, 0.6, mulberry32(1))).toBeNull();
    expect(pickRandomLandPoint(grid(() => 2.9), size, 0.6, mulberry32(1))).toBeNull();
    expect(pickRandomLandPoint(grid(() => NaN), size, 0.6, mulberry32(1))).toBeNull();
  });

  it("returns null for a size that does not match the data", () => {
    expect(pickRandomLandPoint(new Float32Array(5), size, 0.6, mulberry32(1))).toBeNull();
  });

  it("copes with maxTries = 0", () => {
    const h = grid(() => 20);
    expect(pickRandomLandPoint(h, size, 0.6, mulberry32(1), 3, 0)).not.toBeNull();
  });
});
