import { GROUP_COLORS, shadeByDepth, srgbToLinear } from "../habitat";

/** Ground below the water surface darkens down to this depth (metres); same as the city (main.ts). */
export const MAX_SHADE_DEPTH_M = 6;
/** Land gets up to LIGHTEN_MAX lighter at this height above the water level (metres, real scale). */
export const LIGHTEN_TOP_M = 400;
export const LIGHTEN_MAX = 0.15;

function linearOf(hex: number): [number, number, number] {
  return [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
}

/**
 * Per-vertex colour for the ring from the vertex height (metres): the city's "unmapped"
 * ground colour on land (a little lighter with height), the city's water colour with its depth
 * shading below the water level. Linear RGB, like the city's vertex colours.
 */
export function makeRingColorAt(
  waterLevelM: number,
  maxDepthM: number = MAX_SHADE_DEPTH_M,
): (heightM: number) => [number, number, number] {
  const land = linearOf(GROUP_COLORS.unmapped);
  const water = linearOf(GROUP_COLORS.water);
  return (heightM) => {
    if (heightM <= waterLevelM) return shadeByDepth(water, heightM, waterLevelM, maxDepthM);
    const t = Math.min(1, Math.max(0, (heightM - waterLevelM) / LIGHTEN_TOP_M));
    const f = 1 + LIGHTEN_MAX * t;
    return [Math.min(1, land[0] * f), Math.min(1, land[1] * f), Math.min(1, land[2] * f)];
  };
}
