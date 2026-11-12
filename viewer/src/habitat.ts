export interface HabitatClass {
  id: number;
  name: string;
  /** One of the keys of GROUP_COLORS; unknown groups render as "unmapped". */
  group: string;
}

/** Ground colour per habitat group, as 0xRRGGBB sRGB. */
export const GROUP_COLORS: Record<string, number> = {
  unmapped: 0x9a9484,
  water: 0x3f7fa6,
  marsh: 0x7fa06a,
  dune: 0xd8c58a,
  beach: 0xe6d9a8,
  woodland: 0x4f6b3f,
  grassland: 0xb4b870,
  scrub: 0x8a9a5a,
  wetland: 0x6f9a8a,
  rock: 0x8c8c80,
};

function hexToRgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/**
 * Palette indexed by habitat class id: 3 plain sRGB floats (0..1) per id, so the length
 * is (maxId + 1) * 3. Ids with no class, and classes with an unknown group, get the
 * "unmapped" colour. An empty class list gives an empty palette.
 */
export function buildPalette(classes: HabitatClass[]): Float32Array {
  if (classes.length === 0) return new Float32Array(0);
  const maxId = classes.reduce((m, c) => Math.max(m, c.id), 0);
  const palette = new Float32Array((maxId + 1) * 3);
  const unmapped = hexToRgb(GROUP_COLORS.unmapped);
  for (let id = 0; id <= maxId; id++) palette.set(unmapped, id * 3);
  for (const c of classes) {
    const hex = Object.hasOwn(GROUP_COLORS, c.group) ? GROUP_COLORS[c.group] : GROUP_COLORS.unmapped;
    palette.set(hexToRgb(hex), c.id * 3);
  }
  return palette;
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * three.js treats vertex colours as linear values, so sRGB palette entries must be
 * converted before they go into a geometry's `color` attribute. Returns a new array.
 */
export function paletteToLinear(palette: Float32Array): Float32Array {
  const out = new Float32Array(palette.length);
  for (let i = 0; i < palette.length; i++) out[i] = srgbToLinear(palette[i]);
  return out;
}

/**
 * Darken a colour that lies under the water surface: factor 1.0 at the surface falling
 * linearly to 0.55 at maxDepthM and beyond. At or above the water level it is unchanged.
 */
export function shadeByDepth(
  rgb: [number, number, number],
  heightM: number,
  waterLevelM: number,
  maxDepthM: number,
): [number, number, number] {
  const depth = waterLevelM - heightM;
  if (!(depth > 0)) return [rgb[0], rgb[1], rgb[2]];
  const t = maxDepthM > 0 ? Math.min(depth, maxDepthM) / maxDepthM : 1;
  const f = 1 - 0.45 * t;
  return [rgb[0] * f, rgb[1] * f, rgb[2] * f];
}

/**
 * Per-vertex colour function for buildChunkGeometry: class colour of the cell from
 * `palette` (use the linear one), depth-shaded below the water level. `habitat` may be
 * null (no raster), and ids beyond the palette use `fallback`.
 */
export function makeColorAt(
  palette: Float32Array,
  habitat: Uint8Array | null,
  waterLevelM: number,
  maxDepthM: number,
  fallback: [number, number, number],
): (cellIndex: number, heightM: number) => [number, number, number] {
  return (cellIndex, heightM) => {
    let base = fallback;
    if (habitat) {
      const o = habitat[cellIndex] * 3;
      if (o + 2 < palette.length) base = [palette[o], palette[o + 1], palette[o + 2]];
    }
    return shadeByDepth(base, heightM, waterLevelM, maxDepthM);
  };
}
