import * as THREE from "three";
import type { ContextDoc } from "./types";

/** Vertex index ranges, inclusive: the tile holds cells i0..i1-1 by j0..j1-1. */
export interface RingTile {
  i0: number;
  i1: number;
  j0: number;
  j1: number;
}

export interface TileOptions {
  /** Vertical exaggeration (same as the city's). */
  exaggeration: number;
  /** World y the skirts reach down to (the sea floor plane). */
  floorY: number;
  /** Vertex colour (linear RGB) from the height in metres. */
  colorAt: (heightM: number) => [number, number, number];
  /** Skirt colour is the top colour times this. Default 0.8. */
  wallShade?: number;
}

/** Split the lattice into tiles of up to tileCells x tileCells cells (so the frustum can cull them). */
export function planTiles(cols: number, rows: number, tileCells: number): RingTile[] {
  const cellsX = cols - 1;
  const cellsY = rows - 1;
  if (cellsX < 1 || cellsY < 1) throw new Error(`lattice ${cols}x${rows} is too small to tile`);
  if (!Number.isInteger(tileCells) || tileCells < 1) {
    throw new Error(`tileCells must be a positive integer, got ${tileCells}`);
  }
  const tiles: RingTile[] = [];
  for (let j0 = 0; j0 < cellsY; j0 += tileCells) {
    for (let i0 = 0; i0 < cellsX; i0 += tileCells) {
      tiles.push({ i0, i1: Math.min(i0 + tileCells, cellsX), j0, j1: Math.min(j0 + tileCells, cellsY) });
    }
  }
  return tiles;
}

/** Is cell (ci, cj) drawn? Cells outside the lattice and cells under the city mesh are not. */
export function cellKept(doc: Pick<ContextDoc, "cols" | "rows" | "hole">, ci: number, cj: number): boolean {
  if (ci < 0 || cj < 0 || ci > doc.cols - 2 || cj > doc.rows - 2) return false;
  const h = doc.hole;
  return !(ci >= h.i0 && ci < h.i1 && cj >= h.j0 && cj < h.j1);
}

/**
 * Geometry for one tile. Top surface: same triangle layout and winding as the city terrain
 * (a north-west, b south-west, c north-east, d south-east). Skirts: wherever a kept cell's
 * neighbour is not kept (the lattice's outer edge, or the hole boundary), a vertical wall
 * goes down from the cell's edge to `floorY`, wound to face away from the kept cell. Returns
 * null when the tile has no kept cell. No normals: pair it with a flat-shaded material.
 */
export function buildTileGeometry(
  doc: ContextDoc,
  heights: Float32Array,
  tile: RingTile,
  opts: TileOptions,
): THREE.BufferGeometry | null {
  const { cols, rows, x0, z0, dx, dz } = doc;
  if (heights.length !== cols * rows) {
    throw new Error(`heights has ${heights.length} samples, expected ${cols * rows}`);
  }
  const wallShade = opts.wallShade ?? 0.8;
  const nx = tile.i1 - tile.i0 + 1;
  const ny = tile.j1 - tile.j0 + 1;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const gi = tile.i0 + i;
      const gj = tile.j0 + j;
      const h = heights[gj * cols + gi];
      pos.push(x0 + gi * dx, h * opts.exaggeration, z0 + gj * dz);
      col.push(...opts.colorAt(h));
    }
  }
  const vertex = (gi: number, gj: number) => (gj - tile.j0) * nx + (gi - tile.i0);

  const bottomOf = (top: number): number => {
    const b = pos.length / 3;
    pos.push(pos[top * 3], opts.floorY, pos[top * 3 + 2]);
    col.push(col[top * 3] * wallShade, col[top * 3 + 1] * wallShade, col[top * 3 + 2] * wallShade);
    return b;
  };
  const wall = (t0: number, t1: number, ox: number, oz: number) => {
    const b0 = bottomOf(t0);
    const b1 = bottomOf(t1);
    let tri1 = [t0, b0, t1];
    let tri2 = [t1, b0, b1];
    const p = (k: number) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
    const n = p(tri1[1]).sub(p(tri1[0])).cross(p(tri1[2]).sub(p(tri1[0])));
    if (n.x * ox + n.z * oz < 0) {
      tri1 = [t0, t1, b0];
      tri2 = [t1, b1, b0];
    }
    idx.push(...tri1, ...tri2);
  };

  let kept = 0;
  const walls: Array<() => void> = []; // appended after all top triangles, so the top block is contiguous
  for (let cj = tile.j0; cj < tile.j1; cj++) {
    for (let ci = tile.i0; ci < tile.i1; ci++) {
      if (!cellKept(doc, ci, cj)) continue;
      kept++;
      const a = vertex(ci, cj);
      const b = vertex(ci, cj + 1);
      const c = vertex(ci + 1, cj);
      const d = vertex(ci + 1, cj + 1);
      idx.push(a, b, c, b, d, c);
      if (!cellKept(doc, ci - 1, cj)) walls.push(() => wall(a, b, -1, 0)); // west
      if (!cellKept(doc, ci + 1, cj)) walls.push(() => wall(c, d, 1, 0)); // east
      if (!cellKept(doc, ci, cj - 1)) walls.push(() => wall(a, c, 0, -1)); // north
      if (!cellKept(doc, ci, cj + 1)) walls.push(() => wall(b, d, 0, 1)); // south
    }
  }
  if (kept === 0) return null;
  for (const w of walls) w();

  const count = pos.length / 3;
  const indices = count < 65536 ? new Uint16Array(idx) : new Uint32Array(idx);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(pos), 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(Float32Array.from(col), 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
