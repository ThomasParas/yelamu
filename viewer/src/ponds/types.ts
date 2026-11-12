import type { Confidence } from "../heightmap";

/**
 * One freshwater pond or lagoon: a flat water surface at its own level, drawn over a bed
 * the pipeline carved below `level_m`.
 *
 * Coordinates are world metres in the viewer frame, like overlay.json and terrainMesh.ts:
 * +x east, +z south, origin at the grid centre. `rings[0]` is the outer boundary, any
 * further rings are holes (islands). Each ring is a flat [x0, z0, x1, z1, ...] list, open
 * or closed (a repeated first point is tolerated), either winding.
 */
export interface Pond {
  id: string;
  /** Visitor-facing name, or null for an unnamed pond. */
  name: string | null;
  /** Water surface height in real metres above the datum (the viewer applies the exaggeration). */
  level_m: number;
  source: string;
  confidence: Confidence;
  rings: number[][];
}

export interface Ponds {
  version: 1;
  ponds: Pond[];
}
