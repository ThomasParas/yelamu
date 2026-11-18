/**
 * Tone mapping for the 3D view: Khronos PBR Neutral (three's NeutralToneMapping). It keeps hues
 * and leaves mid-tones nearly linear, so ground colours still match the Legend, and rolls off
 * highlights softly. Against no tone mapping, at exposure TONE_EXPOSURE colours come out about
 * a third richer, the relief a little deeper and the scene 5-10% brighter, with no more
 * clipping (measured on the opening, mid-zoom and dune views, 2026-11-18). 1.25 kept the
 * brightness unchanged but its fixed dark offset left modelled streams over the darkest
 * woodland at 1.46:1; 1.4 brings them back over 1.5:1. AgX washed the greens to beige and ACES
 * shifts hues, so neither was used.
 *
 * Every lit and unlit scene material is tone mapped (three's default toneMapped: true), so
 * lines and ground go through the same curve; uiColors.test.ts checks contrast through it.
 */
import * as THREE from "three";

export const TONE_MAPPING = THREE.NeutralToneMapping;
export const TONE_EXPOSURE = 1.4;

export function applyToneMapping(renderer: Pick<THREE.WebGLRenderer, "toneMapping" | "toneMappingExposure">): void {
  renderer.toneMapping = TONE_MAPPING;
  renderer.toneMappingExposure = TONE_EXPOSURE;
}

/**
 * The same curve in TypeScript, on one LINEAR rgb colour (three's NeutralToneMapping GLSL,
 * exposure applied first). For tests that reason about what reaches the screen.
 */
export function neutralToneMap(rgb: readonly [number, number, number], exposure = TONE_EXPOSURE): [number, number, number] {
  const startCompression = 0.8 - 0.04;
  const desaturation = 0.15;
  let c = rgb.map((v) => v * exposure);
  const x = Math.min(c[0], c[1], c[2]);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c = c.map((v) => v - offset);
  const peak = Math.max(c[0], c[1], c[2]);
  if (peak < startCompression) return [c[0], c[1], c[2]];
  const d = 1 - startCompression;
  const newPeak = 1 - (d * d) / (peak + d - startCompression);
  c = c.map((v) => v * (newPeak / peak));
  const g = 1 - 1 / (desaturation * (peak - newPeak) + 1);
  c = c.map((v) => v * (1 - g) + newPeak * g);
  return [c[0], c[1], c[2]];
}
