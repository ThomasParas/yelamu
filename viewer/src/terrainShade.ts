/**
 * Baked ground shading (soft sun shadows + ambient occlusion), made by the pipeline
 * (pipeline/yelamu/shade.py, scripts/build_shade.py) and multiplied into the terrain's vertex
 * colours. The scene's lights shade each triangle by its own slope; the bake adds what depends
 * on the land around a point. Pure: no three.js, no DOM.
 *
 * The bake is only right for the exaggeration and sun it was made with, so a file baked for
 * other values is ignored (the map still works, just without it).
 */
import type { GridSize } from "./terrainMesh";

/** Real hills are gentle at this scale; a diorama needs them exaggerated to read. */
export const VERTICAL_EXAGGERATION = 3;
/** Direction TOWARD the sun (world: x east, y up, z south): the DirectionalLight position. */
export const SUN_DIRECTION: readonly [number, number, number] = [-1, 1.2, 0.6];

/** meta.json `shade` entry written by the pipeline. */
export interface ShadeMeta {
  file: string;
  cols: number;
  rows: number;
  /** Coarse grid spacing in city samples. */
  stride: number;
  exaggeration: number;
  sun: number[];
}

export interface TerrainShade {
  /** Multiplier (0..1] for city sample `cellIndex` (row * width + col), bilinear between coarse samples. */
  at(cellIndex: number): number;
}

/**
 * Why a bake cannot be used with this viewer, or null when it can. Checks that the coarse grid
 * covers the city exactly (every `stride`-th sample plus the last row and column) and that the
 * exaggeration and sun direction match the ones the scene is drawn with.
 */
export function shadeProblem(
  shade: ShadeMeta,
  size: Pick<GridSize, "width" | "height">,
  exaggeration = VERTICAL_EXAGGERATION,
  sun: readonly number[] = SUN_DIRECTION,
): string | null {
  const { stride, cols, rows } = shade;
  if (!Number.isInteger(stride) || stride < 1) return `bad stride ${stride}`;
  const wantCols = Math.ceil((size.width - 1) / stride) + 1;
  const wantRows = Math.ceil((size.height - 1) / stride) + 1;
  if (cols !== wantCols || rows !== wantRows || cols < 2 || rows < 2) {
    return `grid ${cols}x${rows} does not fit a ${size.width}x${size.height} map at stride ${stride}`;
  }
  if (shade.exaggeration !== exaggeration) {
    return `baked for exaggeration ${shade.exaggeration}, the map uses ${exaggeration}`;
  }
  if (!Array.isArray(shade.sun) || shade.sun.length !== 3 || shade.sun.some((v, i) => v !== sun[i])) {
    return `baked for sun ${JSON.stringify(shade.sun)}, the map uses ${JSON.stringify(sun)}`;
  }
  return null;
}

/** Sampler over the coarse grid (bytes 0..255 = multiplier 0..1, row-major cols x rows). */
export function makeTerrainShade(
  shade: Pick<ShadeMeta, "cols" | "rows" | "stride">,
  size: Pick<GridSize, "width" | "height">,
  bytes: Uint8Array,
): TerrainShade {
  const { cols, rows, stride } = shade;
  const { width, height } = size;
  if (bytes.length !== cols * rows) {
    throw new Error(`shade has ${bytes.length} values, expected ${cols * rows}`);
  }
  const values = Float32Array.from(bytes, (b) => b / 255);
  // Coarse column i sits on sample min(i * stride, width - 1) (rows likewise), so the last
  // coarse step can be shorter than `stride`.
  const span = (n: number, last: number, edge: number) => {
    const a = Math.min(Math.floor(n / stride), last - 1);
    const xa = a * stride;
    const xb = Math.min(xa + stride, edge);
    return [a, xb > xa ? (n - xa) / (xb - xa) : 0] as const;
  };
  return {
    at(cellIndex) {
      const row = Math.floor(cellIndex / width);
      const [i0, u] = span(cellIndex - row * width, cols - 1, width - 1);
      const [j0, v] = span(row, rows - 1, height - 1);
      const k = j0 * cols + i0;
      const a = values[k] + (values[k + 1] - values[k]) * u;
      const b = values[k + cols] + (values[k + cols + 1] - values[k + cols]) * u;
      return a + (b - a) * v;
    },
  };
}

/**
 * Wrap a vertex-colour function so ground above the water level is darkened by the bake.
 * Ground under water keeps its depth shading only (the water surface covers it anyway).
 */
export function withShade(
  colorAt: (cellIndex: number, heightM: number) => [number, number, number],
  shade: TerrainShade,
  waterLevelM: number,
): (cellIndex: number, heightM: number) => [number, number, number] {
  return (cellIndex, heightM) => {
    const c = colorAt(cellIndex, heightM);
    if (!(heightM > waterLevelM)) return c;
    const f = shade.at(cellIndex);
    return [c[0] * f, c[1] * f, c[2] * f];
  };
}
