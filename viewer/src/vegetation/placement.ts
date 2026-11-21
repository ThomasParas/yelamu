/**
 * Where vegetation goes, as pure maths: no three.js, no DOM. One call per terrain chunk
 * returns world-space instances for trees, shrubs and reeds, deterministic for a given
 * (seed, chunk), so a chunk that is evicted and rebuilt looks exactly the same.
 *
 * Coordinates match terrainMesh.ts: x = (sx - (width-1)/2) * cell_m, z likewise, +z south.
 * y is the UN-exaggerated height in metres; the renderer multiplies it by the terrain's
 * vertical exaggeration. Scale is the plant's size in metres (see geometry.ts).
 */
import type { ChunkPlan } from "../chunks";
import { GROUP_COLORS, type HabitatClass } from "../habitat";
import { mulberry32 } from "../randomLand";
import type { GridSize } from "../terrainMesh";

export type VegKind = "tree" | "shrub" | "reed";

export interface VegSpec {
  kind: VegKind;
  /** Mean number of plants per hectare (10,000 m2). */
  perHectare: number;
  /** Size range in metres (tree: height, shrub: radius, reed: clump height). */
  minScale: number;
  maxScale: number;
}

/**
 * Vegetation per habitat group; `null` = nothing grows there (open water, beach, bare
 * rock, and ground we have not reconstructed). Densities are deliberately modest: the
 * shapes only suggest the kind of plants, they are not a census.
 */
export const VEGETATION_BY_GROUP: Readonly<Record<string, VegSpec | null>> = {
  woodland: { kind: "tree", perHectare: 45, minScale: 9, maxScale: 15 },
  scrub: { kind: "shrub", perHectare: 70, minScale: 1.6, maxScale: 2.6 },
  grassland: { kind: "shrub", perHectare: 6, minScale: 1.4, maxScale: 2.2 },
  dune: { kind: "shrub", perHectare: 8, minScale: 1.2, maxScale: 2.0 },
  wetland: { kind: "reed", perHectare: 60, minScale: 3, maxScale: 5 },
  marsh: { kind: "reed", perHectare: 90, minScale: 2.5, maxScale: 4 },
  mudflat: null,
  beach: null,
  water: null,
  rock: null,
  unmapped: null,
};

export function vegetationForGroup(group: string): VegSpec | null {
  return Object.hasOwn(VEGETATION_BY_GROUP, group) ? VEGETATION_BY_GROUP[group] : null;
}

export interface VegInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  /** Rotation about +y, radians, 0..2pi. */
  rotation: number;
  kind: VegKind;
  group: string;
  /** Habitat class id of the sample the plant belongs to (species.ts picks its shape). */
  classId: number;
}

/** Ground steeper than this (degrees, from neighbouring heights) gets no plants. */
export const MAX_SLOPE_DEG = 35;
/** Trees and shrubs need ground at least this far above the water level (metres). */
export const MIN_ABOVE_WATER_M = 0.3;
/** Reeds may stand right at the water line. */
export const REED_MIN_ABOVE_WATER_M = 0.05;

const TAN_MAX_SLOPE = Math.tan((MAX_SLOPE_DEG * Math.PI) / 180);

/** Visitor-independent group name for a habitat class id ("unmapped" when unknown). */
export function groupNameForClass(classes: readonly HabitatClass[]): (id: number) => string {
  const byId = new Map<number, string>();
  for (const c of classes) {
    byId.set(c.id, Object.hasOwn(GROUP_COLORS, c.group) ? c.group : "unmapped");
  }
  return (id) => byId.get(id) ?? "unmapped";
}

/** Mix (seed, chunk column, chunk row) into one 32-bit PRNG seed. */
export function chunkSeed(seed: number, cx: number, cy: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (cx + 0x7f4a7c15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (cy + 0x165667b1), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Height of the rendered terrain surface at a fractional sample position (px, py), using
 * the same triangles as buildChunkGeometry (diagonal from the south-west to the
 * north-east sample), so plants sit on the mesh and do not float or sink.
 */
export function heightOnMesh(heights: Float32Array, size: GridSize, px: number, py: number): number {
  const { width, height } = size;
  const bx = Math.max(0, Math.min(Math.floor(px), width - 2));
  const by = Math.max(0, Math.min(Math.floor(py), height - 2));
  const u = px - bx;
  const v = py - by;
  const i = by * width + bx;
  const a = heights[i]; // north-west
  const c = heights[i + 1]; // north-east
  const b = heights[i + width]; // south-west
  const d = heights[i + width + 1]; // south-east
  return u + v <= 1 ? a + u * (c - a) + v * (b - a) : d + (1 - u) * (b - d) + (1 - v) * (c - d);
}

export interface PlaceArgs {
  chunk: ChunkPlan;
  size: GridSize;
  /** Whole-grid heights (metres), row-major. */
  heights: Float32Array;
  /** Whole-grid habitat class ids. */
  habitat: Uint8Array;
  groupOfClass: (classId: number) => string;
  waterLevelM: number;
  seed: number;
  /** Hard cap for this chunk; more candidates are thinned uniformly. */
  maxInstances: number;
  /** Per-class placement override; undefined (or no function) = the group's spec. */
  specForClass?: (classId: number) => VegSpec | undefined;
}

/**
 * Plants for one chunk. Every habitat sample owns the patch of ground nearest to it (its
 * Voronoi cell, cut off at the chunk edge, so a shared border sample is split between the
 * two chunks and nothing is counted twice). The patch gets floor(n) plants plus one more
 * with probability frac(n), n = perHectare x patch area in hectares, each at a jittered
 * position. Plants are dropped where the ground is within the shore band, steeper than
 * 35 degrees, or where the group grows nothing.
 */
export function placeChunkVegetation(args: PlaceArgs): VegInstance[] {
  const { chunk, size, heights, habitat, groupOfClass, waterLevelM, seed, maxInstances, specForClass } = args;
  const { width, height, cell_m } = size;
  if (heights.length !== width * height) {
    throw new Error(`heights has ${heights.length} samples, expected ${width * height}`);
  }
  if (habitat.length !== width * height) {
    throw new Error(`habitat has ${habitat.length} samples, expected ${width * height}`);
  }
  if (!(maxInstances > 0)) return [];

  const rng = mulberry32(chunkSeed(seed, chunk.cx, chunk.cy));
  const cellHa = (cell_m * cell_m) / 10_000;
  const cx = (width - 1) / 2;
  const cz = (height - 1) / 2;
  const { x0, y0, w, h } = chunk;

  // Per class id: group name and spec, resolved once.
  const groupCache = new Array<string | undefined>(256);
  const specCache = new Array<VegSpec | null | undefined>(256);
  const specFor = (id: number): VegSpec | null => {
    let spec = specCache[id];
    if (spec === undefined) {
      const group = groupOfClass(id);
      groupCache[id] = group;
      spec = specForClass?.(id) ?? vegetationForGroup(group);
      specCache[id] = spec;
    }
    return spec;
  };

  const out: VegInstance[] = [];
  for (let sy = y0; sy <= y0 + h; sy++) {
    const ylo = Math.max(sy - 0.5, y0);
    const yhi = Math.min(sy + 0.5, y0 + h);
    const leny = yhi - ylo;
    if (!(leny > 0)) continue;
    for (let sx = x0; sx <= x0 + w; sx++) {
      const id = habitat[sy * width + sx];
      const spec = specFor(id);
      if (!spec) continue;
      const xlo = Math.max(sx - 0.5, x0);
      const xhi = Math.min(sx + 0.5, x0 + w);
      const lenx = xhi - xlo;
      if (!(lenx > 0)) continue;

      const expected = spec.perHectare * cellHa * lenx * leny;
      const whole = Math.floor(expected);
      const count = whole + (rng() < expected - whole ? 1 : 0);
      for (let k = 0; k < count; k++) {
        // Four draws per plant whether or not it survives, so a change in one rule does
        // not reshuffle the rest of the chunk.
        const px = xlo + rng() * lenx;
        const py = ylo + rng() * leny;
        const scale = spec.minScale + rng() * (spec.maxScale - spec.minScale);
        const rotation = rng() * Math.PI * 2;

        const y = heightOnMesh(heights, size, px, py);
        const minAbove = spec.kind === "reed" ? REED_MIN_ABOVE_WATER_M : MIN_ABOVE_WATER_M;
        if (!(y > waterLevelM + minAbove)) continue;
        if (slopeTan(heights, width, height, px, py, cell_m) > TAN_MAX_SLOPE) continue;

        out.push({
          x: (px - cx) * cell_m,
          y,
          z: (py - cz) * cell_m,
          scale,
          rotation,
          kind: spec.kind,
          group: groupCache[id]!,
          classId: id,
        });
      }
    }
  }

  if (out.length <= maxInstances) return out;
  // Uniform, deterministic thinning: keep evenly spaced entries of the (row-major) list.
  const thinned = new Array<VegInstance>(maxInstances);
  const n = out.length;
  for (let i = 0; i < maxInstances; i++) thinned[i] = out[Math.floor((i * n) / maxInstances)];
  return thinned;
}

/** tan(slope) of the terrain quad containing (px, py), from its four corner heights. */
function slopeTan(
  heights: Float32Array,
  width: number,
  height: number,
  px: number,
  py: number,
  cellM: number,
): number {
  const bx = Math.max(0, Math.min(Math.floor(px), width - 2));
  const by = Math.max(0, Math.min(Math.floor(py), height - 2));
  const i = by * width + bx;
  const a = heights[i];
  const c = heights[i + 1];
  const b = heights[i + width];
  const d = heights[i + width + 1];
  const gx = (c + d - a - b) / (2 * cellM);
  const gz = (b + d - a - c) / (2 * cellM);
  return Math.hypot(gx, gz);
}
