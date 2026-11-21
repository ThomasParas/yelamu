/**
 * Tap to identify: which habitat is at a point on the map. Pure helpers (no DOM, no three),
 * used by identifyModule.ts.
 *
 * A tap is turned into a ray by the camera; groundHit walks that ray over the height grid
 * (half-cell steps, then bisection) to the first point at or below the surface. The surface
 * is the terrain, or the water level where the terrain is below it, so a tap on the bay lands
 * on the water, not the sea floor. Cost: a few hundred grid reads per tap, nothing otherwise.
 */
import type { HabitatClass } from "./habitat";
import { GROUP_LABELS } from "./legendEntries";

export interface IdentifyGrid {
  /** Heights in metres, row-major, row 0 = north (see terrainMesh.ts). */
  heights: Float32Array;
  width: number;
  height: number;
  cellM: number;
  exaggeration: number;
  waterLevelM: number;
  /** Lowest and highest height in the grid, metres. */
  minM: number;
  maxM: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Fractional grid column and row of world (x, z); the frame of terrainMesh.ts (origin at the centre). */
function gridPos(g: IdentifyGrid, x: number, z: number): [number, number] {
  return [x / g.cellM + (g.width - 1) / 2, z / g.cellM + (g.height - 1) / 2];
}

/** World y of the surface (terrain or water, whichever is higher) at (x, z); null off the grid. */
export function surfaceY(g: IdentifyGrid, x: number, z: number): number | null {
  const [c, r] = gridPos(g, x, z);
  if (!(c >= 0 && r >= 0 && c <= g.width - 1 && r <= g.height - 1)) return null;
  const c0 = Math.min(Math.floor(c), g.width - 2);
  const r0 = Math.min(Math.floor(r), g.height - 2);
  const fc = c - c0;
  const fr = r - r0;
  const i = r0 * g.width + c0;
  const h = g.heights;
  const top = h[i] + (h[i + 1] - h[i]) * fc;
  const bottom = h[i + g.width] + (h[i + g.width + 1] - h[i + g.width]) * fc;
  const m = top + (bottom - top) * fr;
  return Math.max(m, g.waterLevelM) * g.exaggeration;
}

/**
 * First point where the ray `origin + t * dir` (t >= 0) meets the surface, or null when it
 * misses the grid. `dir` must point downwards.
 */
export function groundHit(g: IdentifyGrid, origin: Vec3Like, dir: Vec3Like): Vec3Like | null {
  if (!(dir.y < 0)) return null;
  const yTop = Math.max(g.maxM, g.waterLevelM) * g.exaggeration;
  const yBottom = Math.max(g.minM, g.waterLevelM) * g.exaggeration;
  const tStart = Math.max(0, (yTop - origin.y) / dir.y);
  const tEnd = (yBottom - origin.y) / dir.y;
  if (!(tEnd >= tStart)) return null;
  const horiz = Math.hypot(dir.x, dir.z);
  // Half a cell sideways per step; a straight-down ray needs only the one step.
  const step = horiz > 1e-9 ? (0.5 * g.cellM) / horiz : tEnd - tStart || 1;
  const at = (t: number) => ({ x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t });
  // Height of the ray above the surface at t (null off the grid).
  const above = (t: number) => {
    const p = at(t);
    const s = surfaceY(g, p.x, p.z);
    return s === null ? null : p.y - s;
  };

  let prevT = tStart;
  let prevAbove = above(tStart);
  if (prevAbove !== null && prevAbove <= 0) return at(tStart);
  for (let t = tStart + step; ; t += step) {
    const tt = Math.min(t, tEnd);
    const a = above(tt);
    if (a !== null && a <= 0) {
      // Crossed between prevT and tt; narrow it down (prevT may be off the grid: fine, it is above).
      let lo = prevAbove === null ? tt : prevT;
      let hi = tt;
      if (prevAbove !== null) {
        for (let k = 0; k < 16; k++) {
          const mid = (lo + hi) / 2;
          const m = above(mid);
          if (m !== null && m <= 0) hi = mid;
          else lo = mid;
        }
      }
      return at(hi);
    }
    prevT = tt;
    prevAbove = a;
    if (tt >= tEnd) return null;
  }
}

/** Class id of the nearest habitat cell to world (x, z); null off the grid. */
export function habitatIdAt(g: IdentifyGrid, habitat: Uint8Array, x: number, z: number): number | null {
  const [c, r] = gridPos(g, x, z);
  const col = Math.round(c);
  const row = Math.round(r);
  if (col < 0 || row < 0 || col >= g.width || row >= g.height) return null;
  return habitat[row * g.width + col];
}

/** What the identify label says about a class. */
export interface Identified {
  /** The habitat group (a key of GROUP_COLORS), for the swatch. */
  group: string;
  /** Main line: the mapped habitat type. */
  title: string;
  /** Second line: the legend group it belongs to, or "" when it would repeat the title. */
  detail: string;
  /** Optional third line: a plain-language note on what the habitat name means. */
  note?: string;
}

const groupLabel = new Map(GROUP_LABELS);

/**
 * Visitor-facing names for the classes this project made itself (the rest are SFEI's habitat
 * types, shown as named). Their dataset names carry processing notes, which the Sources panel
 * explains instead.
 */
export const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  "Bay (hand-drawn)": "Bay",
  "Open bay (inferred from modern elevation)": "Open bay",
  "Marsh (hand-drawn)": "Tidal marsh",
  "Pond (hand-drawn)": "Pond",
};

/**
 * Short plain-language notes for SFEI habitat names that read as jargon (by class name;
 * owner-approved wording, after SFEI's Hidden Nature SF story map).
 */
export const CLASS_NOTES: Readonly<Record<string, string>> = {
  "Mobile dunes": "Sand the wind kept moving, with few plants",
  "Stabilized dune/dune scrub/grassland": "Older dunes held in place by plants",
};

/** Label text for class `id` (an id missing from `classes` counts as unmapped, like the colouring). */
export function describeHabitat(classes: readonly HabitatClass[], id: number): Identified {
  const cls = classes.find((c) => c.id === id);
  const group = cls && groupLabel.has(cls.group) ? cls.group : "unmapped";
  if (!cls || group === "unmapped") {
    return { group: "unmapped", title: "Not covered by the historical habitat map", detail: "Modern terrain, shown for context" };
  }
  const label = groupLabel.get(group)!;
  const title = DISPLAY_NAMES[cls.name] ?? cls.name;
  const detail = title.toLowerCase() === label.toLowerCase() ? "" : label;
  const note = CLASS_NOTES[cls.name];
  return note ? { group, title, detail, note } : { group, title, detail };
}

/** A pointer press and release that count as a tap: short, still and one finger. */
export const TAP_MAX_MOVE_PX = 8;
export const TAP_MAX_MS = 500;
export function isTap(moveSq: number, ms: number, maxPointers: number): boolean {
  return maxPointers === 1 && moveSq <= TAP_MAX_MOVE_PX * TAP_MAX_MOVE_PX && ms <= TAP_MAX_MS;
}
