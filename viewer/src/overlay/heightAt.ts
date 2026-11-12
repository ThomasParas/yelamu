export interface HeightGrid {
  width: number;
  height: number;
  cell_m: number;
}

/**
 * Bilinear terrain height (metres, NOT exaggerated) at world coordinates, in the frame
 * terrainMesh.ts uses: sample (col, row) sits at x = (col - (width - 1) / 2) * cell_m and
 * z = (row - (height - 1) / 2) * cell_m, so +x is east, +z is south and row 0 is north.
 * Positions outside the grid clamp to the nearest edge sample; a non-finite coordinate
 * is treated as 0.
 */
export function makeHeightSampler(
  heights: Float32Array,
  size: HeightGrid,
): (x: number, z: number) => number {
  const { width, height, cell_m } = size;
  if (!(width >= 1) || !(height >= 1) || !(cell_m > 0) || heights.length !== width * height) {
    throw new Error(`heights has ${heights.length} samples, expected ${width * height}`);
  }
  const cx = (width - 1) / 2;
  const cz = (height - 1) / 2;
  const maxCol = width - 1;
  const maxRow = height - 1;

  return (x, z) => {
    const fc = Math.min(maxCol, Math.max(0, (Number.isFinite(x) ? x : 0) / cell_m + cx));
    const fr = Math.min(maxRow, Math.max(0, (Number.isFinite(z) ? z : 0) / cell_m + cz));
    const c0 = Math.min(maxCol - 1, Math.floor(fc));
    const r0 = Math.min(maxRow - 1, Math.floor(fr));
    // A one-sample-wide axis has nothing to interpolate towards.
    const c1 = Math.min(maxCol, c0 + 1);
    const r1 = Math.min(maxRow, r0 + 1);
    const tc = c1 === c0 ? 0 : fc - c0;
    const tr = r1 === r0 ? 0 : fr - r0;
    const i00 = Math.max(0, r0) * width + Math.max(0, c0);
    const h00 = heights[i00];
    const h10 = heights[Math.max(0, r0) * width + c1];
    const h01 = heights[r1 * width + Math.max(0, c0)];
    const h11 = heights[r1 * width + c1];
    const top = h00 + (h10 - h00) * tc;
    const bottom = h01 + (h11 - h01) * tc;
    return top + (bottom - top) * tr;
  };
}
