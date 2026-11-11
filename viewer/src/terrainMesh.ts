import * as THREE from "three";

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
