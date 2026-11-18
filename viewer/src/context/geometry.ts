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

  // First pass: how many cells are kept, and how many walls do they need? Everything is then
  // allocated exactly once (the full ring is about half a million vertices).
  let kept = 0;
  let walls = 0;
  for (let cj = tile.j0; cj < tile.j1; cj++) {
    for (let ci = tile.i0; ci < tile.i1; ci++) {
      if (!cellKept(doc, ci, cj)) continue;
      kept++;
      if (!cellKept(doc, ci - 1, cj)) walls++;
      if (!cellKept(doc, ci + 1, cj)) walls++;
      if (!cellKept(doc, ci, cj - 1)) walls++;
      if (!cellKept(doc, ci, cj + 1)) walls++;
    }
  }
  if (kept === 0) return null;

  const gridVertices = nx * ny;
  const count = gridVertices + walls * 2; // each wall adds two floor vertices
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const idx = count < 65536 ? new Uint16Array((kept + walls) * 6) : new Uint32Array((kept + walls) * 6);

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const gi = tile.i0 + i;
      const gj = tile.j0 + j;
      const h = heights[gj * cols + gi];
      const v = (j * nx + i) * 3;
      pos[v] = x0 + gi * dx;
      pos[v + 1] = h * opts.exaggeration;
      pos[v + 2] = z0 + gj * dz;
      const c = opts.colorAt(h);
      col[v] = c[0];
      col[v + 1] = c[1];
      col[v + 2] = c[2];
    }
  }
  const vertex = (gi: number, gj: number) => (gj - tile.j0) * nx + (gi - tile.i0);

  let nextVertex = gridVertices;
  const bottomOf = (top: number): number => {
    const b = nextVertex++;
    pos[b * 3] = pos[top * 3];
    pos[b * 3 + 1] = opts.floorY;
    pos[b * 3 + 2] = pos[top * 3 + 2];
    const c = opts.colorAt(heights[(tile.j0 + Math.floor(top / nx)) * cols + tile.i0 + (top % nx)]);
    col[b * 3] = c[0] * wallShade;
    col[b * 3 + 1] = c[1] * wallShade;
    col[b * 3 + 2] = c[2] * wallShade;
    return b;
  };
  let nextIndex = 0;
  const wall = (t0: number, t1: number, ox: number, oz: number) => {
    // Normal of the triangle (t0, b0, t1) with b0 straight below t0: (b0 - t0) x (t1 - t0) is
    // (a * tz, 0, -a * tx) for a = floorY - y(t0) and (tx, _, tz) = t1 - t0, in the double
    // precision the lattice is defined in (not the rounded Float32 copy).
    const g0 = tile.j0 + Math.floor(t0 / nx);
    const gi0 = tile.i0 + (t0 % nx);
    const g1 = tile.j0 + Math.floor(t1 / nx);
    const gi1 = tile.i0 + (t1 % nx);
    const a = opts.floorY - heights[g0 * cols + gi0] * opts.exaggeration;
    const tx = x0 + gi1 * dx - (x0 + gi0 * dx);
    const tz = z0 + g1 * dz - (z0 + g0 * dz);
    const flip = a * tz * ox + -a * tx * oz < 0;
    const b0 = bottomOf(t0);
    const b1 = bottomOf(t1);
    if (flip) {
      idx.set([t0, t1, b0, t1, b1, b0], nextIndex);
    } else {
      idx.set([t0, b0, t1, t1, b0, b1], nextIndex);
    }
    nextIndex += 6;
  };

  // Top triangles first (one contiguous block), then the walls.
  for (let cj = tile.j0; cj < tile.j1; cj++) {
    for (let ci = tile.i0; ci < tile.i1; ci++) {
      if (!cellKept(doc, ci, cj)) continue;
      const a = vertex(ci, cj);
      const b = vertex(ci, cj + 1);
      const c = vertex(ci + 1, cj);
      const d = vertex(ci + 1, cj + 1);
      idx.set([a, b, c, b, d, c], nextIndex);
      nextIndex += 6;
    }
  }
  for (let cj = tile.j0; cj < tile.j1; cj++) {
    for (let ci = tile.i0; ci < tile.i1; ci++) {
      if (!cellKept(doc, ci, cj)) continue;
      const a = vertex(ci, cj);
      const b = vertex(ci, cj + 1);
      const c = vertex(ci + 1, cj);
      const d = vertex(ci + 1, cj + 1);
      if (!cellKept(doc, ci - 1, cj)) wall(a, b, -1, 0); // west
      if (!cellKept(doc, ci + 1, cj)) wall(c, d, 1, 0); // east
      if (!cellKept(doc, ci, cj - 1)) wall(a, c, 0, -1); // north
      if (!cellKept(doc, ci, cj + 1)) wall(b, d, 0, 1); // south
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
