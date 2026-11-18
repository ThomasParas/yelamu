import { fitViewSize } from "../camera";
import type { MapBounds } from "../viewRig";
import type { ContextDoc } from "./types";

export interface RingRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

type RingGrid = Pick<ContextDoc, "cols" | "rows" | "x0" | "z0" | "dx" | "dz">;

/** World rectangle spanned by the ring's vertices. */
export function ringRect(doc: RingGrid): RingRect {
  return {
    minX: doc.x0,
    maxX: doc.x0 + (doc.cols - 1) * doc.dx,
    minZ: doc.z0,
    maxZ: doc.z0 + (doc.rows - 1) * doc.dz,
  };
}

/** The ring as camera pan bounds (centred on the ring, not the origin). */
export function ringBounds(doc: RingGrid): MapBounds {
  const r = ringRect(doc);
  return {
    halfWidth: (r.maxX - r.minX) / 2,
    halfDepth: (r.maxZ - r.minZ) / 2,
    centerX: (r.minX + r.maxX) / 2,
    centerZ: (r.minZ + r.maxZ) / 2,
  };
}

/** The camera view height (world units at zoom 1) that fits the whole ring, like fitViewSize does for the city. */
export function ringFitViewSize(doc: RingGrid, maxHeightM: number, aspect: number): number {
  const r = ringRect(doc);
  return fitViewSize(r.maxX - r.minX, r.maxZ - r.minZ, maxHeightM, aspect);
}

/**
 * Smallest zoom at which the whole ring still fits: the city's fit (zoom 1) over the ring's fit,
 * times a safety factor so the ring's edge is not flush with the window.
 */
export function ringMinZoom(cityViewSize: number, ringViewSize: number, safety = 0.92): number {
  if (!(cityViewSize > 0) || !(ringViewSize > 0)) {
    throw new Error(`view sizes must be positive, got ${cityViewSize} and ${ringViewSize}`);
  }
  return (cityViewSize / ringViewSize) * safety;
}
