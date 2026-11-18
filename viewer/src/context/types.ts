import type { LayerInfo } from "../heightmap";

/** One modern place label in the ring. x, z are world metres in the viewer frame. */
export interface ContextPlace {
  id: string;
  name: string;
  kind: string;
  lon: number;
  lat: number;
  x: number;
  z: number;
  ground_m: number;
}

/**
 * context.json: a lattice of vertices at world (x0 + i * dx, z0 + j * dz), j = 0 the north row,
 * heights in a raw little-endian uint16 file (row-major). The hole is the city mesh: cells
 * i0..i1-1 by j0..j1-1 are not drawn. Written by pipeline/yelamu/context.py.
 */
export interface ContextDoc {
  version: 1;
  heights_file: string;
  cols: number;
  rows: number;
  x0: number;
  z0: number;
  dx: number;
  dz: number;
  hole: { i0: number; i1: number; j0: number; j1: number };
  min_m: number;
  max_m: number;
  water_level_m: number;
  bay_floor_m: number;
  layers: LayerInfo[];
  places: ContextPlace[];
}
