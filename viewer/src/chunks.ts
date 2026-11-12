export interface ChunkPlan {
  cx: number;
  cy: number;
  /** Sample columns x0..x0+w and rows y0..y0+h, INCLUSIVE: neighbours share a border. */
  x0: number;
  y0: number;
  w: number;
  h: number;
}

export type Lod = 0 | 1;

/**
 * Split a width x height sample grid into chunks of up to chunkCells x chunkCells cells.
 * Every cell edge belongs to exactly one chunk; adjacent chunks share their border
 * samples. Row-major order (cy outer, cx inner), north row first.
 */
export function planChunks(width: number, height: number, chunkCells: number): ChunkPlan[] {
  if (width < 2 || height < 2) throw new Error(`grid ${width}x${height} is too small to chunk`);
  if (!Number.isInteger(chunkCells) || chunkCells < 1) {
    throw new Error(`chunkCells must be a positive integer, got ${chunkCells}`);
  }
  const plan: ChunkPlan[] = [];
  const nx = Math.ceil((width - 1) / chunkCells);
  const ny = Math.ceil((height - 1) / chunkCells);
  for (let cy = 0; cy < ny; cy++) {
    const y0 = cy * chunkCells;
    const h = Math.min(chunkCells, height - 1 - y0);
    for (let cx = 0; cx < nx; cx++) {
      const x0 = cx * chunkCells;
      const w = Math.min(chunkCells, width - 1 - x0);
      plan.push({ cx, cy, x0, y0, w, h });
    }
  }
  return plan;
}

/** Zoomed in at or past switchZoom -> full resolution (0); otherwise coarse (1). */
export function lodForZoom(zoom: number, switchZoom: number): Lod {
  return zoom >= switchZoom ? 0 : 1;
}

export function strideFor(lod: Lod): number {
  return lod === 0 ? 1 : 4;
}

export function chunkKey(c: ChunkPlan, lod: Lod): string {
  return `${c.cx}:${c.cy}:${lod}`;
}

/**
 * The orthographic zoom at which the coarse LOD's vertices (stride * cell_m apart) appear
 * maxSpacingPx apart on screen. viewSize is the camera's world-unit view height at zoom 1
 * (from fitViewSize) and viewportHeightPx the canvas height in CSS pixels, so one pixel
 * covers viewSize / (viewportHeightPx * zoom) world units.
 */
export function switchZoomFor(
  viewSize: number,
  viewportHeightPx: number,
  cellM: number,
  maxSpacingPx = 6,
  stride = strideFor(1),
): number {
  const metresPerPixelAtZoom1 = viewSize / viewportHeightPx;
  return (maxSpacingPx * metresPerPixelAtZoom1) / (stride * cellM);
}

/** World-space bounds of a chunk, with the same coordinates as buildTerrainGeometry. */
export function chunkWorldBounds(
  c: ChunkPlan,
  size: { width: number; height: number; cell_m: number },
  minY: number,
  maxY: number,
): { min: [number, number, number]; max: [number, number, number] } {
  const { width, height, cell_m } = size;
  const cx = (width - 1) / 2;
  const cz = (height - 1) / 2;
  return {
    min: [(c.x0 - cx) * cell_m, minY, (c.y0 - cz) * cell_m],
    max: [(c.x0 + c.w - cx) * cell_m, maxY, (c.y0 + c.h - cz) * cell_m],
  };
}
