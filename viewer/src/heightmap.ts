import type { HabitatClass } from "./habitat";

export type Confidence = "documented" | "inferred" | "illustrative";

export interface LayerInfo {
  id: string;
  source: string;
  confidence: Confidence;
  attribution: string;
}

export interface HeightmapMeta {
  width: number;
  height: number;
  cell_m: number;
  min_m: number;
  max_m: number;
  heights_file: string;
  heights_format: string;
  water_level_m: number;
  layers: LayerInfo[];
  /** One byte per cell (habitat class id), same row-major layout as the heightmap. */
  habitat_file?: string;
  habitat_classes?: HabitatClass[];
  /** File name of the overlay (streets, landmarks, hotspots) next to the heightmap. */
  overlay_file?: string;
  /** Pipeline parameters, shown on the Sources panel (see provenanceData.ts). */
  processing?: Record<string, unknown>;
}

/**
 * Turn quantized 16-bit values into heights (metres). The pipeline maps [min_m, max_m]
 * onto 0..65535; see pipeline/yelamu/export.py.
 */
export function decodeHeights(
  q: ArrayLike<number>,
  meta: Pick<HeightmapMeta, "width" | "height" | "min_m" | "max_m">,
): Float32Array {
  const count = meta.width * meta.height;
  if (q.length !== count) {
    throw new Error(`expected ${count} values for ${meta.width}x${meta.height}, got ${q.length}`);
  }
  const span = meta.max_m - meta.min_m;
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = meta.min_m + (q[i] / 65535) * span;
  }
  return out;
}

async function fetchChecked(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: HTTP ${res.status}`);
  return res;
}

export async function loadHeightmap(
  baseUrl: string,
): Promise<{ meta: HeightmapMeta; heights: Float32Array }> {
  const meta: HeightmapMeta = await (await fetchChecked(`${baseUrl}/meta.json`)).json();
  if (meta.heights_format !== "uint16-le") {
    throw new Error(`unsupported heights_format ${JSON.stringify(meta.heights_format)}`);
  }
  const url = `${baseUrl}/${meta.heights_file}`;
  const buffer = await (await fetchChecked(url)).arrayBuffer();
  const count = meta.width * meta.height;
  if (buffer.byteLength !== count * 2) {
    throw new Error(
      `${url}: expected ${count * 2} bytes for ${meta.width}x${meta.height}, got ${buffer.byteLength}`,
    );
  }
  // Read little-endian explicitly rather than trusting the platform's byte order.
  const view = new DataView(buffer);
  const q = new Uint16Array(count);
  for (let i = 0; i < count; i++) q[i] = view.getUint16(i * 2, true);
  return { meta, heights: decodeHeights(q, meta) };
}

/** Habitat class id per cell, or null when the dataset has no habitat raster. */
export async function loadHabitat(
  baseUrl: string,
  meta: Pick<HeightmapMeta, "width" | "height" | "habitat_file">,
): Promise<Uint8Array | null> {
  if (!meta.habitat_file) return null;
  const url = `${baseUrl}/${meta.habitat_file}`;
  const buffer = await (await fetchChecked(url)).arrayBuffer();
  const count = meta.width * meta.height;
  if (buffer.byteLength !== count) {
    throw new Error(
      `${url}: expected ${count} bytes for ${meta.width}x${meta.height}, got ${buffer.byteLength}`,
    );
  }
  return new Uint8Array(buffer);
}
