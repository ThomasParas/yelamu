/**
 * The start view: framed on the land the 1769 habitat map covers (San Francisco), not on the
 * whole grid, which also holds Marin, the East Bay and open water. Pure helpers, used by main.ts.
 */
import { fitViewSize } from "./camera";
import type { HabitatClass } from "./habitat";
import type { ViewTarget } from "./viewRig";

/** World-space rectangle (metres; x east, z south, origin at the grid centre). */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * Bounding rectangle of the cells whose class is mapped land (any group but "water" and
 * "unmapped"), in the world frame of terrainMesh.ts. Null when there is none.
 */
export function mappedLandBounds(
  habitat: Uint8Array,
  width: number,
  height: number,
  cellM: number,
  classes: readonly HabitatClass[],
): Rect | null {
  const isLand = new Uint8Array(256);
  for (const c of classes) if (c.group !== "water" && c.group !== "unmapped") isLand[c.id] = 1;
  let c0 = Infinity;
  let c1 = -Infinity;
  let r0 = Infinity;
  let r1 = -Infinity;
  for (let r = 0; r < height; r++) {
    const row = r * width;
    for (let c = 0; c < width; c++) {
      if (!isLand[habitat[row + c]]) continue;
      if (c < c0) c0 = c;
      if (c > c1) c1 = c;
      if (r < r0) r0 = r;
      if (r > r1) r1 = r;
    }
  }
  if (c0 > c1) return null;
  const x = (c: number) => (c - (width - 1) / 2) * cellM;
  const z = (r: number) => (r - (height - 1) / 2) * cellM;
  return { x0: x(c0), x1: x(c1), z0: z(r0), z1: z(r1) };
}

/**
 * Target and zoom that fit `rect` in a window of this aspect, the same way zoom 1 fits the
 * whole `widthM` x `depthM` map (fitViewSize, unrotated view). Never zooms out past 1.
 */
export function homeView(rect: Rect, widthM: number, depthM: number, maxHeightM: number, aspect: number): ViewTarget {
  const whole = fitViewSize(widthM, depthM, maxHeightM, aspect);
  const part = fitViewSize(rect.x1 - rect.x0, rect.z1 - rect.z0, maxHeightM, aspect);
  return { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2, zoom: Math.max(1, whole / part) };
}
