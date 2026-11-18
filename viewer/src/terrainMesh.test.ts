import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { planChunks } from "./chunks";
import { buildChunkGeometry, buildTerrainGeometry } from "./terrainMesh";

const size = { width: 3, height: 3, cell_m: 10 };
// Row 0 is the NORTH edge. Heights 0..8 make every vertex identifiable.
const heights = Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8]);

describe("buildTerrainGeometry", () => {
  const geo = buildTerrainGeometry(heights, size);
  const pos = geo.getAttribute("position");

  it("puts each height on the matching vertex", () => {
    for (let i = 0; i < 9; i++) expect(pos.getY(i)).toBeCloseTo(i);
  });

  it("is centred on the origin and spans (n-1) cells", () => {
    expect(pos.getX(0)).toBeCloseTo(-10); // west edge
    expect(pos.getX(2)).toBeCloseTo(10); // east edge
  });

  it("puts row 0 (north) at negative Z", () => {
    expect(pos.getZ(0)).toBeCloseTo(-10); // north-west corner
    expect(pos.getZ(6)).toBeCloseTo(10); // south-west corner
  });

  it("applies vertical exaggeration", () => {
    const tall = buildTerrainGeometry(heights, size, 3);
    expect(tall.getAttribute("position").getY(8)).toBeCloseTo(24);
  });

  it("rejects mismatched sizes", () => {
    expect(() => buildTerrainGeometry(new Float32Array(4), size)).toThrow();
  });
});

describe("buildChunkGeometry", () => {
  // 17x17 samples, 16x16 cells; height encodes the sample: h = x + 100 * y.
  const big = { width: 17, height: 17, cell_m: 10 };
  const bigHeights = new Float32Array(17 * 17);
  for (let y = 0; y < 17; y++) for (let x = 0; x < 17; x++) bigHeights[y * 17 + x] = x + 100 * y;
  const plan = planChunks(17, 17, 8); // 2 x 2 chunks of 8 cells

  const positions = (g: THREE.BufferGeometry) => {
    const p = g.getAttribute("position");
    return Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)]);
  };

  it("has (w/stride+1) x (h/stride+1) vertices and two triangles per quad", () => {
    const g1 = buildChunkGeometry(bigHeights, big, plan[0], 1, 1);
    expect(g1.getAttribute("position").count).toBe(81);
    expect(g1.getIndex()!.count).toBe(8 * 8 * 6);
    const g4 = buildChunkGeometry(bigHeights, big, plan[0], 4, 1);
    expect(g4.getAttribute("position").count).toBe(9);
    expect(g4.getIndex()!.count).toBe(2 * 2 * 6);
  });

  it("has unit smooth normals that tilt away from the uphill side, and computes bounds", () => {
    const g = buildChunkGeometry(bigHeights, big, plan[0], 1, 1);
    const n = g.getAttribute("normal");
    expect(n.count).toBe(g.getAttribute("position").count);
    // h = x + 100y on a 10 m grid: slope 0.1 east, 10 south, so normals lean west and north.
    const i = 4 * 9 + 4; // an interior vertex
    const [nx, ny, nz] = [n.getX(i), n.getY(i), n.getZ(i)];
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 6);
    expect(nx).toBeCloseTo(-0.1 / Math.hypot(0.1, 1, 10), 6);
    expect(nz).toBeCloseTo(-10 / Math.hypot(0.1, 1, 10), 6);
    expect(ny).toBeGreaterThan(0);
    expect(g.boundingSphere).not.toBeNull();
    expect(g.boundingBox).not.toBeNull();
    expect(g.boundingBox!.max.y).toBeCloseTo(8 + 800);
  });

  it("uses Uint16 indices for small chunks and Uint32 for large ones", () => {
    const g = buildChunkGeometry(bigHeights, big, plan[0], 1, 1);
    expect(g.getIndex()!.array).toBeInstanceOf(Uint16Array);
    const n = 300;
    const hs = new Float32Array(n * n);
    const huge = buildChunkGeometry(hs, { width: n, height: n, cell_m: 1 }, planChunks(n, n, 400)[0], 1, 1);
    expect(huge.getAttribute("position").count).toBe(n * n);
    expect(huge.getIndex()!.array).toBeInstanceOf(Uint32Array);
  });

  it("places positions in the same world coordinates as buildTerrainGeometry", () => {
    const whole = buildTerrainGeometry(bigHeights, big, 3);
    const wp = whole.getAttribute("position");
    const chunk = plan[3]; // x0 = 8, y0 = 8
    const g = buildChunkGeometry(bigHeights, big, chunk, 1, 3);
    const p = g.getAttribute("position");
    for (let j = 0; j <= chunk.h; j++) {
      for (let i = 0; i <= chunk.w; i++) {
        const v = j * (chunk.w + 1) + i;
        const w = (chunk.y0 + j) * 17 + chunk.x0 + i;
        expect(p.getX(v)).toBeCloseTo(wp.getX(w));
        expect(p.getY(v)).toBeCloseTo(wp.getY(w));
        expect(p.getZ(v)).toBeCloseTo(wp.getZ(w));
      }
    }
  });

  it("puts row 0 (north) at negative z and the first row first", () => {
    const g = buildChunkGeometry(bigHeights, big, plan[0], 1, 1);
    const p = g.getAttribute("position");
    expect(p.getX(0)).toBeCloseTo(-80);
    expect(p.getZ(0)).toBeCloseTo(-80);
    expect(p.getZ(80)).toBeCloseTo(0); // last vertex: sample row 8 -> z = (8 - 8) * 10
    expect(p.getZ(9)).toBeGreaterThan(p.getZ(0)); // next row is further south
  });

  it("applies vertical exaggeration", () => {
    const g = buildChunkGeometry(bigHeights, big, plan[0], 1, 2.5);
    expect(g.getAttribute("position").getY(1)).toBeCloseTo(1 * 2.5);
  });

  it.each([1, 2, 4])("shares identical border vertices between neighbours at stride %i", (stride) => {
    const a = positions(buildChunkGeometry(bigHeights, big, plan[0], stride, 1));
    const b = positions(buildChunkGeometry(bigHeights, big, plan[1], stride, 1));
    const c = positions(buildChunkGeometry(bigHeights, big, plan[2], stride, 1));
    const n = Math.ceil(8 / stride) + 1;
    for (let j = 0; j < n; j++) {
      // East border of chunk 0 == west border of chunk 1.
      expect(a[j * n + (n - 1)]).toEqual(b[j * n]);
      // South border of chunk 0 == north border of chunk 2.
      expect(a[(n - 1) * n + j]).toEqual(c[j]);
    }
  });

  it.each([1, 2, 4])("gives neighbouring chunks identical border normals at stride %i (no seam)", (stride) => {
    let seed = 7;
    const bumpy = bigHeights.map(() => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 40);
    const normals = (k: number) => {
      const n = buildChunkGeometry(bumpy, big, plan[k], stride, 3).getAttribute("normal");
      return Array.from({ length: n.count }, (_, i) => [n.getX(i), n.getY(i), n.getZ(i)]);
    };
    const [a, b, c] = [normals(0), normals(1), normals(2)];
    const n = Math.ceil(8 / stride) + 1;
    for (let j = 0; j < n; j++) {
      expect(a[j * n + (n - 1)]).toEqual(b[j * n]);
      expect(a[(n - 1) * n + j]).toEqual(c[j]);
    }
  });

  it("lands the last vertex exactly on the border when w is not a multiple of stride", () => {
    const grid = { width: 8, height: 8, cell_m: 10 }; // 7 cells
    const hs = new Float32Array(64).map((_, i) => i);
    const chunk = planChunks(8, 8, 7)[0]; // w = h = 7
    const g = buildChunkGeometry(hs, grid, chunk, 4, 1);
    const p = g.getAttribute("position");
    expect(p.count).toBe(3 * 3); // columns 0, 4, 7
    const xs = [0, 1, 2].map((i) => p.getX(i));
    expect(xs[0]).toBeCloseTo((0 - 3.5) * 10);
    expect(xs[1]).toBeCloseTo((4 - 3.5) * 10);
    expect(xs[2]).toBeCloseTo((7 - 3.5) * 10);
    // Last vertex is sample (7, 7).
    expect(p.getX(8)).toBeCloseTo(35);
    expect(p.getZ(8)).toBeCloseTo(35);
    expect(p.getY(8)).toBeCloseTo(63);
    // Triangle indices stay in range.
    const idx = g.getIndex()!.array;
    expect(Math.max(...idx)).toBe(8);
  });

  it("puts heights on the right vertices at stride 4", () => {
    const g = buildChunkGeometry(bigHeights, big, plan[3], 4, 1); // x0 = y0 = 8
    const p = g.getAttribute("position");
    // vertex (i=1, j=2): sample (12, 16)
    expect(p.getY(2 * 3 + 1)).toBeCloseTo(12 + 1600);
  });

  it("faces the triangles up (+y)", () => {
    const g = buildChunkGeometry(new Float32Array(9), { width: 3, height: 3, cell_m: 10 }, planChunks(3, 3, 2)[0], 1, 1);
    const p = g.getAttribute("position");
    const idx = g.getIndex()!;
    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => {
        const i = idx.getX(t + k);
        return new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
      });
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      expect(n.y).toBeGreaterThan(0);
    }
  });

  it("adds a colour attribute from colorAt with the cell index and unexaggerated height", () => {
    const calls: Array<[number, number]> = [];
    const g = buildChunkGeometry(bigHeights, big, plan[3], 4, 3, (cell, h) => {
      calls.push([cell, h]);
      return [h / 2000, cell / 1000, 0.5];
    });
    const col = g.getAttribute("color");
    expect(col.itemSize).toBe(3);
    expect(col.count).toBe(9);
    // vertex (i=1, j=2): sample (12, 16) -> cell 16*17+12
    const cell = 16 * 17 + 12;
    expect(col.getX(7)).toBeCloseTo((12 + 1600) / 2000);
    expect(col.getY(7)).toBeCloseTo(cell / 1000);
    expect(col.getZ(7)).toBeCloseTo(0.5);
    expect(calls).toHaveLength(9);
  });

  it("omits the colour attribute when colorAt is not given", () => {
    expect(buildChunkGeometry(bigHeights, big, plan[0], 4, 1).getAttribute("color")).toBeUndefined();
  });

  it("rejects mismatched sizes and bad strides", () => {
    expect(() => buildChunkGeometry(new Float32Array(4), big, plan[0], 1, 1)).toThrow();
    expect(() => buildChunkGeometry(bigHeights, big, plan[0], 0, 1)).toThrow();
  });
});
