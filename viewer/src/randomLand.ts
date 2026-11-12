/** Small seeded PRNG (mulberry32): fast, 32-bit state, uniform in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LandGrid {
  width: number;
  height: number;
  cell_m: number;
}

/**
 * A random cell centre that is land: at least `minHeightM` and above the water level.
 * Returns world metres in the frame terrainMesh.ts uses (origin at the grid centre,
 * +x east, +z south). It tries `maxTries` random cells first, then scans the grid from a
 * random start, so null means the grid really has no land (or the size is wrong).
 */
export function pickRandomLandPoint(
  heights: Float32Array,
  size: LandGrid,
  waterLevelM: number,
  rng: () => number,
  minHeightM = 3,
  maxTries = 200,
): { x: number; z: number } | null {
  const { width, height, cell_m } = size;
  const count = width * height;
  if (!(count > 0) || heights.length !== count) return null;

  const isLand = (i: number) => heights[i] >= minHeightM && heights[i] > waterLevelM;
  const toWorld = (i: number) => {
    const col = i % width;
    const row = (i - col) / width;
    return { x: (col - (width - 1) / 2) * cell_m, z: (row - (height - 1) / 2) * cell_m };
  };

  for (let k = 0; k < maxTries; k++) {
    const i = Math.min(count - 1, Math.floor(rng() * count));
    if (isLand(i)) return toWorld(i);
  }
  const start = Math.min(count - 1, Math.floor(rng() * count));
  for (let k = 0; k < count; k++) {
    const i = (start + k) % count;
    if (isLand(i)) return toWorld(i);
  }
  return null;
}
