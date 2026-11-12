import * as THREE from "three";
import type { ChunkPlan } from "./chunks";

export interface GridSize {
  width: number;
  height: number;
  cell_m: number;
}

/**
 * Build a terrain mesh centred on the origin. +X is east, +Y is up, and north is -Z
 * (so a camera placed to the south looks "up" the map). Vertex i matches pixel i of
 * the heightmap: row-major, row 0 = northern edge.
 */
export function buildTerrainGeometry(
  heights: Float32Array,
  size: GridSize,
  exaggeration = 1,
): THREE.BufferGeometry {
  const { width, height, cell_m } = size;
  if (heights.length !== width * height) {
    throw new Error(`heights has ${heights.length} samples, expected ${width * height}`);
  }
  // Vertices sit at cell centres, so the mesh spans (n - 1) cells per axis.
  const geometry = new THREE.PlaneGeometry(
    (width - 1) * cell_m,
    (height - 1) * cell_m,
    width - 1,
    height - 1,
  );
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    position.setY(i, heights[i] * exaggeration);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Geometry for one chunk of the grid at a given stride (1 = every sample, 4 = every 4th).
 * Vertices sit on sample columns x0 + min(i * stride, w) and rows y0 + min(j * stride, h),
 * so the last vertex always lands exactly on the chunk border (even when w is not a
 * multiple of stride) and neighbouring chunks share identical border vertices.
 * Positions use the same world coordinates as buildTerrainGeometry. No normals are
 * produced: pair it with a flat-shaded material. `colorAt` receives the sample's cell
 * index (row * width + col) and its height in metres (before exaggeration).
 */
export function buildChunkGeometry(
  heights: Float32Array,
  size: GridSize,
  chunk: ChunkPlan,
  stride: number,
  exaggeration: number,
  colorAt?: (cellIndex: number, heightM: number) => [number, number, number],
): THREE.BufferGeometry {
  const { width, height, cell_m } = size;
  if (heights.length !== width * height) {
    throw new Error(`heights has ${heights.length} samples, expected ${width * height}`);
  }
  if (!Number.isInteger(stride) || stride < 1) {
    throw new Error(`stride must be a positive integer, got ${stride}`);
  }
  const { x0, y0, w, h } = chunk;
  const nx = Math.ceil(w / stride) + 1;
  const ny = Math.ceil(h / stride) + 1;
  const count = nx * ny;
  const cx = (width - 1) / 2;
  const cz = (height - 1) / 2;

  const positions = new Float32Array(count * 3);
  const colors = colorAt ? new Float32Array(count * 3) : null;
  let v = 0;
  for (let j = 0; j < ny; j++) {
    const sy = y0 + Math.min(j * stride, h);
    for (let i = 0; i < nx; i++) {
      const sx = x0 + Math.min(i * stride, w);
      const cell = sy * width + sx;
      const heightM = heights[cell];
      positions[v * 3] = (sx - cx) * cell_m;
      positions[v * 3 + 1] = heightM * exaggeration;
      positions[v * 3 + 2] = (sy - cz) * cell_m;
      if (colors) {
        const c = colorAt!(cell, heightM);
        colors[v * 3] = c[0];
        colors[v * 3 + 1] = c[1];
        colors[v * 3 + 2] = c[2];
      }
      v++;
    }
  }

  const quads = (nx - 1) * (ny - 1);
  const indices = count < 65536 ? new Uint16Array(quads * 6) : new Uint32Array(quads * 6);
  let k = 0;
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i; // north-west
      const b = a + nx; // south-west
      const c = a + 1; // north-east
      const d = b + 1; // south-east
      // Counter-clockwise seen from above (+y), so faces point up.
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = c;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (colors) geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
