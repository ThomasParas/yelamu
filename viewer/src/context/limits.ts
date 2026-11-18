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

/**
 * True when the ring's hole is exactly the city mesh: the four hole lines sit at -hw, +hw, -hd,
 * +hd, where hw = (width - 1) * cell / 2 and hd = (height - 1) * cell / 2 (the mesh joins cell
 * centres). A ring built for some other city would leave a gap or an overlap, so it is not used.
 */
export function holeMatchesCity(
  doc: Pick<ContextDoc, "x0" | "z0" | "dx" | "dz" | "hole">,
  meta: { width: number; height: number; cell_m: number },
): boolean {
  const hw = ((meta.width - 1) * meta.cell_m) / 2;
  const hd = ((meta.height - 1) * meta.cell_m) / 2;
  const { i0, i1, j0, j1 } = doc.hole;
  return (
    Math.abs(doc.x0 + i0 * doc.dx + hw) < 1 &&
    Math.abs(doc.x0 + i1 * doc.dx - hw) < 1 &&
    Math.abs(doc.z0 + j0 * doc.dz + hd) < 1 &&
    Math.abs(doc.z0 + j1 * doc.dz - hd) < 1
  );
}
