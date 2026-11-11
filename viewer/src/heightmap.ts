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
  layers: LayerInfo[];
}

/**
 * Decode heights (metres) from RGBA pixel bytes. The pipeline packs a 16-bit height
 * into R (high byte) and G (low byte); see pipeline/yelamu/export.py.
 */
export function decodeHeights(
  rgba: ArrayLike<number>,
  meta: Pick<HeightmapMeta, "width" | "height" | "min_m" | "max_m">,
): Float32Array {
  const count = meta.width * meta.height;
  if (rgba.length !== count * 4) {
    throw new Error(`expected ${count * 4} bytes for ${meta.width}x${meta.height}, got ${rgba.length}`);
  }
  const span = meta.max_m - meta.min_m;
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const q = rgba[i * 4] * 256 + rgba[i * 4 + 1];
    out[i] = meta.min_m + (q / 65535) * span;
  }
  return out;
}

export async function loadHeightmap(
  baseUrl: string,
): Promise<{ meta: HeightmapMeta; heights: Float32Array }> {
  const meta: HeightmapMeta = await (await fetch(`${baseUrl}/meta.json`)).json();
  const blob = await (await fetch(`${baseUrl}/heightmap.png`)).blob();
  // 'none' matters: any colour management or alpha premultiplication would change
  // the bytes, and the bytes ARE the data.
  const bitmap = await createImageBitmap(blob, {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { meta, heights: decodeHeights(data, meta) };
}
