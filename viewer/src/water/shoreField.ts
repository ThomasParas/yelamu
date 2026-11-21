/**
 * Shore field for the water shader: two bytes per heightmap sample, computed once at load
 * from the heights the viewer already has (no extra download). Pure: no three.js, no DOM.
 *
 * - R: water depth below the water level, 0..SHORE_DEPTH_RANGE_M mapped to 0..255 (land = 0).
 *   Drives the paler shallow-water tint.
 * - G: signed distance to the shoreline in cells, 128 + d * SHORE_DIST_SCALE, clamped
 *   (positive in water, negative on land; the line itself sits halfway between a water and
 *   a land sample). Drives the foam band, which keeps an even width where depth alone would
 *   paint whole tidal flats. In sheltered water (lagoons and channels far from water deeper
 *   than OPEN_WATER_DEPTH_M) the distance is pushed outward, so foam fades there gradually;
 *   there are no waves to make it.
 *
 * Tidal marsh and mud flat sit just below the water level in the heightmap (tides covered
 * them twice a day), but they read as ground, not open water: cells flagged in `dry` count as
 * land here, so the water shader leaves them clear and the shoreline runs along their edge.
 */

/** Depths beyond this (metres) all read as "deep" to the shader. */
export const SHORE_DEPTH_RANGE_M = 8;
/** Steps per cell in the distance byte: 1/8 cell resolution, +-16 cells of range. */
export const SHORE_DIST_SCALE = 8;
const MAX_DIST_CELLS = 128 / SHORE_DIST_SCALE;
/** Water deeper than this (metres) counts as open water that waves come in from. */
export const OPEN_WATER_DEPTH_M = 1;
/** Shore within this many cells of open water gets full foam. */
export const EXPOSED_CELLS = 10;
/** Beyond that, each cell further from open water pushes the foam this many cells out. */
export const SHELTER_PUSH = 2;
const DIAG = Math.SQRT2;

/**
 * Chamfer distance (in cells) from every sample to the nearest sample where `target` is
 * true; 0 on target samples, capped at `cap`. Two passes, so linear in the grid size.
 */
export function chamferDistance(target: Uint8Array, width: number, height: number, cap: number): Float32Array {
  const d = new Float32Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = target[i] ? 0 : cap;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let v = d[i];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - width] + 1);
        if (x > 0) v = Math.min(v, d[i - width - 1] + DIAG);
        if (x < width - 1) v = Math.min(v, d[i - width + 1] + DIAG);
      }
      d[i] = v;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      let v = d[i];
      if (v === 0) continue;
      if (x < width - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < height - 1) {
        v = Math.min(v, d[i + width] + 1);
        if (x < width - 1) v = Math.min(v, d[i + width + 1] + DIAG);
        if (x > 0) v = Math.min(v, d[i + width - 1] + DIAG);
      }
      d[i] = v;
    }
  }
  return d;
}

/** RG bytes (row-major, 2 per sample) for the water shader; see the file comment. */
export function computeShoreField(
  heights: Float32Array,
  width: number,
  height: number,
  waterLevelM: number,
  dry?: Uint8Array | null,
): Uint8Array {
  const n = width * height;
  if (heights.length !== n) throw new Error(`heights has ${heights.length} samples, expected ${n}`);
  if (dry && dry.length !== n) throw new Error(`dry mask has ${dry.length} samples, expected ${n}`);
  const water = new Uint8Array(n);
  const land = new Uint8Array(n);
  const open = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const w = heights[i] < waterLevelM && !dry?.[i] ? 1 : 0;
    water[i] = w;
    land[i] = 1 - w;
    open[i] = w && waterLevelM - heights[i] > OPEN_WATER_DEPTH_M ? 1 : 0;
  }
  const toOpen = chamferDistance(open, width, height, EXPOSED_CELLS + MAX_DIST_CELLS);
  const toLand = chamferDistance(land, width, height, MAX_DIST_CELLS + 1);
  const toWater = chamferDistance(water, width, height, MAX_DIST_CELLS + 1);
  const out = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) {
    const depth = water[i] ? waterLevelM - heights[i] : 0;
    out[i * 2] = Math.round(Math.min(Math.max(depth / SHORE_DEPTH_RANGE_M, 0), 1) * 255);
    const shelter = Math.max(0, toOpen[i] - EXPOSED_CELLS) * SHELTER_PUSH;
    const signed = water[i] ? toLand[i] - 0.5 + shelter : -(toWater[i] - 0.5);
    out[i * 2 + 1] = Math.round(Math.min(Math.max(128 + signed * SHORE_DIST_SCALE, 0), 255));
  }
  return out;
}

/**
 * Habitat classes drawn as ground although they lie just under the water level. Tidal
 * sloughs and lagoons are left out: they are channels and open water, and stay blue.
 */
export const DRY_CLASS_NAMES: readonly string[] = ["Tidal marsh", "Tidal flat", "Marsh (hand-drawn)"];

/** 1 for every cell whose habitat class is in DRY_CLASS_NAMES (for computeShoreField). */
export function dryMask(habitat: Uint8Array, classes: readonly { id: number; name: string }[]): Uint8Array {
  const dryIds = new Uint8Array(256);
  for (const c of classes) if (DRY_CLASS_NAMES.includes(c.name)) dryIds[c.id] = 1;
  const out = new Uint8Array(habitat.length);
  for (let i = 0; i < habitat.length; i++) out[i] = dryIds[habitat[i]];
  return out;
}
