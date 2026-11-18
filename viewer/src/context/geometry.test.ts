import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildTileGeometry, cellKept, planTiles } from "./geometry";
import { makeRingColorAt } from "./colors";
import { ContextLayer } from "./layer";
import { parseContext } from "./parse";
import type { ContextDoc } from "./types";

// 5 x 4 vertices = 4 x 3 cells; the hole is the 2 cells (1,1) and (2,1).
const doc: ContextDoc = {
  version: 1,
  heights_file: "context.u16",
  cols: 5,
  rows: 4,
  x0: -200,
  z0: -150,
  dx: 100,
  dz: 100,
  hole: { i0: 1, i1: 3, j0: 1, j1: 2 },
  min_m: -3,
  max_m: 50,
  water_level_m: 0.6,
  bay_floor_m: -3,
  layers: [],
  places: [],
};
const heights = Float32Array.from({ length: 20 }, (_, i) => (i % 5) + Math.floor(i / 5) * 2); // distinct, small
const whole = { i0: 0, i1: 4, j0: 0, j1: 3 };
const opts = { exaggeration: 3, floorY: -10.5, colorAt: () => [0.5, 0.5, 0.5] as [number, number, number] };

describe("planTiles", () => {
  it("covers every cell exactly once", () => {
    const tiles = planTiles(11, 8, 4); // 10 x 7 cells
    let cells = 0;
    for (const t of tiles) cells += (t.i1 - t.i0) * (t.j1 - t.j0);
    expect(cells).toBe(70);
    expect(tiles[0]).toEqual({ i0: 0, i1: 4, j0: 0, j1: 4 });
    expect(tiles.at(-1)).toEqual({ i0: 8, i1: 10, j0: 4, j1: 7 });
  });
  it("rejects bad input", () => {
    expect(() => planTiles(1, 5, 4)).toThrow();
    expect(() => planTiles(5, 5, 0)).toThrow();
  });
});

describe("cellKept", () => {
  it("drops the hole and anything outside the lattice", () => {
    expect(cellKept(doc, 0, 0)).toBe(true);
    expect(cellKept(doc, 1, 1)).toBe(false);
    expect(cellKept(doc, 2, 1)).toBe(false);
    expect(cellKept(doc, 3, 1)).toBe(true);
    expect(cellKept(doc, -1, 0)).toBe(false);
    expect(cellKept(doc, 4, 0)).toBe(false);
    expect(cellKept(doc, 0, 3)).toBe(false);
  });
});

describe("buildTileGeometry", () => {
  const geo = buildTileGeometry(doc, heights, whole, opts)!;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const index = geo.getIndex()!;
  const topIndexCount = 10 * 6; // 12 cells - 2 in the hole, 2 triangles each

  it("puts vertex heights, exaggerated, at world positions on the lattice", () => {
    expect(pos.getX(0)).toBeCloseTo(-200);
    expect(pos.getZ(0)).toBeCloseTo(-150);
    expect(pos.getY(6)).toBeCloseTo(heights[1 * 5 + 1] * 3); // vertex (1, 1)
    expect(pos.getX(6)).toBeCloseTo(-100);
    expect(pos.getZ(6)).toBeCloseTo(-50);
  });

  it("emits no top triangle inside the hole", () => {
    for (let t = 0; t < topIndexCount; t += 3) {
      const ids = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      const cx = ids.reduce((s, i) => s + pos.getX(i), 0) / 3;
      const cz = ids.reduce((s, i) => s + pos.getZ(i), 0) / 3;
      const inHole = cx > -100 && cx < 100 && cz > -50 && cz < 50;
      expect(inHole).toBe(false);
    }
  });

  it("adds 20 wall quads: 14 on the outer edge and 6 around the hole", () => {
    expect(index.count).toBe(topIndexCount + 20 * 6);
  });

  it("drops wall bottoms to the floor and colours every vertex", () => {
    let atFloor = 0;
    for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - -10.5) < 1e-6) atFloor++;
    expect(atFloor).toBe(40); // two new vertices per wall quad
    expect((geo.getAttribute("color") as THREE.BufferAttribute).count).toBe(pos.count);
  });

  const normalOf = (t: number) => {
    const p = (k: number) => new THREE.Vector3(pos.getX(index.getX(t + k)), pos.getY(index.getX(t + k)), pos.getZ(index.getX(t + k)));
    const [a, b, c] = [p(0), p(1), p(2)];
    return b.sub(a).cross(c.sub(a));
  };
  const wallTriangles = () => {
    const out: number[] = [];
    for (let t = topIndexCount; t < index.count; t += 3) out.push(t);
    return out;
  };

  it("faces the top surface up", () => {
    for (let t = 0; t < topIndexCount; t += 3) expect(normalOf(t).y).toBeGreaterThan(0);
  });

  it("faces the outer west wall west (away from the ring body)", () => {
    const west = wallTriangles().filter((t) => [0, 1, 2].every((k) => Math.abs(pos.getX(index.getX(t + k)) - -200) < 1e-6));
    expect(west.length).toBe(6); // 3 cells x 2 triangles
    for (const t of west) expect(normalOf(t).x).toBeLessThan(0);
  });

  it("faces the wall along the top of the hole south, into the hole", () => {
    // z = -50 is the hole's north edge; kept cells at row 0 stand on the north side of it.
    const walls = wallTriangles().filter(
      (t) =>
        [0, 1, 2].every((k) => Math.abs(pos.getZ(index.getX(t + k)) - -50) < 1e-6) &&
        [0, 1, 2].every((k) => pos.getX(index.getX(t + k)) >= -100 - 1e-6 && pos.getX(index.getX(t + k)) <= 100 + 1e-6),
    );
    expect(walls.length).toBe(4); // 2 cells x 2 triangles
    for (const t of walls) expect(normalOf(t).z).toBeGreaterThan(0);
  });

  it("returns null for a tile that is entirely hole", () => {
    expect(buildTileGeometry(doc, heights, { i0: 1, i1: 3, j0: 1, j1: 2 }, opts)).toBeNull();
  });

  it("refuses heights of the wrong length", () => {
    expect(() => buildTileGeometry(doc, new Float32Array(3), whole, opts)).toThrow(/20/);
  });
});

describe("ContextLayer", () => {
  it("builds one mesh per non-empty tile, frozen in world space", () => {
    const layer = new ContextLayer(doc, heights, { ...opts, tileCells: 2 });
    expect(layer.object.children.length).toBe(4); // 2 x 2 tiles; each keeps at least one cell
    const mesh = layer.object.children[0] as THREE.Mesh;
    expect(mesh.matrixAutoUpdate).toBe(false);
    expect(layer.stats().triangles).toBeGreaterThan(0);
    layer.dispose();
    expect(layer.object.children.length).toBe(0);
  });
});

describe("the real ring (committed context.json, synthetic heights)", () => {
  const real = parseContext(
    JSON.parse(readFileSync(new URL("../../public/assets/real-city/context.json", import.meta.url), "utf8")),
  );
  const heightsReal = new Float32Array(real.cols * real.rows);
  for (let k = 0; k < heightsReal.length; k++) heightsReal[k] = (k % 50) - 3; // finite, varied, includes water depths
  const TILE = 96;
  const tiles = planTiles(real.cols, real.rows, TILE);
  const realOpts = { exaggeration: 3, floorY: -10.5, colorAt: makeRingColorAt(real.water_level_m) };
  const isFloorVertex = (p: THREE.BufferAttribute, v: number) => Math.abs(p.getY(v) - realOpts.floorY) < 1e-6;
  const topTriangles = (geo: THREE.BufferGeometry): number => {
    const p = geo.getAttribute("position") as THREE.BufferAttribute;
    const ix = geo.getIndex()!;
    let n = 0;
    for (let t = 0; t < ix.count; t += 3) {
      if (![0, 1, 2].some((k) => isFloorVertex(p, ix.getX(t + k)))) n++;
    }
    return n;
  };

  it("plans ceil(812 / 96) x ceil(654 / 96) = 9 x 7 = 63 tiles", () => {
    expect(real.cols - 1).toBe(813);
    expect(real.rows - 1).toBe(655);
    expect(tiles.length).toBe(Math.ceil(813 / TILE) * Math.ceil(655 / TILE));
    expect(tiles.length).toBe(63);
  });

  it("cuts the hole out of the tiles that overlap it, and drops tiles wholly inside it", () => {
    const fullTopTriangles = 2 * TILE * TILE;
    const h = real.hole;
    let partial = 0;
    let wholeHole = 0;
    let nanCount = 0;
    for (const tile of tiles) {
      const geo = buildTileGeometry(real, heightsReal, tile, realOpts);
      const inside = tile.i0 >= h.i0 && tile.i1 <= h.i1 && tile.j0 >= h.j0 && tile.j1 <= h.j1;
      const overlaps = tile.i0 < h.i1 && tile.i1 > h.i0 && tile.j0 < h.j1 && tile.j1 > h.j0;
      if (inside) {
        wholeHole++;
        expect(geo).toBeNull();
        continue;
      }
      expect(geo).not.toBeNull();
      for (const name of ["position", "color"]) {
        const a = (geo!.getAttribute(name) as THREE.BufferAttribute).array;
        for (let k = 0; k < a.length; k++) if (Number.isNaN(a[k])) nanCount++;
      }
      const full = tile.i1 - tile.i0 === TILE && tile.j1 - tile.j0 === TILE;
      if (overlaps && full) {
        partial++;
        expect(topTriangles(geo!)).toBeLessThan(fullTopTriangles);
      } else if (!overlaps && full) {
        expect(topTriangles(geo!)).toBe(fullTopTriangles);
      }
    }
    expect(nanCount).toBe(0);
    expect(partial).toBeGreaterThan(0);
    // The hole spans 295 x 261 cells, so with 96-cell tiles at least one tile sits wholly inside it.
    expect(wholeHole).toBeGreaterThan(0);
  });
});

describe("buildTileGeometry normals (smooth shading)", () => {
  // The fixture heights rise 1 m per column (dx 100) and 2 m per row (dz 100): a plane, so every
  // top vertex, edge ones included, has the same normal.
  const geo = buildTileGeometry(doc, heights, whole, opts)!;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const nrm = geo.getAttribute("normal") as THREE.BufferAttribute;
  const gridVertices = 5 * 4;

  it("gives every vertex a normal of unit length", () => {
    expect(nrm.count).toBe(pos.count);
    for (let i = 0; i < nrm.count; i++) {
      expect(Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i))).toBeCloseTo(1, 6);
    }
  });

  it("tilts the top normals against the slope of the lattice, exaggerated", () => {
    const gx = (1 * 3) / 100;
    const gz = (2 * 3) / 100;
    const len = Math.hypot(gx, 1, gz);
    for (let i = 0; i < gridVertices; i++) {
      expect(nrm.getX(i)).toBeCloseTo(-gx / len, 6);
      expect(nrm.getY(i)).toBeCloseTo(1 / len, 6);
      expect(nrm.getZ(i)).toBeCloseTo(-gz / len, 6);
    }
  });

  it("gives wall vertices their own level normals, pointing out of the kept cell", () => {
    expect(pos.count).toBe(gridVertices + 20 * 4); // 20 walls: two top copies + two floor vertices
    const index = geo.getIndex()!;
    for (let t = 10 * 6; t < index.count; t += 3) {
      const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      for (const v of [a, b, c]) {
        expect(v).toBeGreaterThanOrEqual(gridVertices); // walls never reuse the smooth top vertices
        expect(nrm.getY(v)).toBe(0);
      }
      // the stored normal agrees with the triangle's winding
      const p = (v: number) => new THREE.Vector3(pos.getX(v), pos.getY(v), pos.getZ(v));
      const face = p(b).sub(p(a)).cross(p(c).sub(p(a)));
      expect(face.x * nrm.getX(a) + face.z * nrm.getZ(a)).toBeGreaterThan(0);
    }
  });

  it("agrees across a tile border, so tiles show no seam", () => {
    // Bumpy heights this time, so the normal really depends on the neighbours.
    const bumpy = Float32Array.from({ length: 20 }, (_, i) => Math.sin(i * 1.7) * 9);
    const left = buildTileGeometry(doc, bumpy, { i0: 0, i1: 2, j0: 0, j1: 3 }, opts)!;
    const right = buildTileGeometry(doc, bumpy, { i0: 2, i1: 4, j0: 0, j1: 3 }, opts)!;
    const nl = left.getAttribute("normal") as THREE.BufferAttribute;
    const nr = right.getAttribute("normal") as THREE.BufferAttribute;
    for (let j = 0; j < 4; j++) {
      const l = j * 3 + 2; // column 2 is the last column of the left tile (3 wide)...
      const r = j * 3 + 0; // ...and the first of the right one
      expect(nl.getX(l)).toBeCloseTo(nr.getX(r), 9);
      expect(nl.getY(l)).toBeCloseTo(nr.getY(r), 9);
      expect(nl.getZ(l)).toBeCloseTo(nr.getZ(r), 9);
    }
  });
});

describe("ContextLayer material", () => {
  it("is smooth shaded by default", () => {
    const layer = new ContextLayer(doc, heights, opts);
    const mesh = layer.object.children[0] as THREE.Mesh;
    expect((mesh.material as THREE.MeshStandardMaterial).flatShading).toBe(false);
    layer.dispose();
  });
});
