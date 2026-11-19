/**
 * Distance haze (aerial perspective): ground and water far beyond the point the camera looks at
 * fade towards a pale sky colour, so the far hills and the open water read as distant.
 *
 * It uses three's fog, which every material in the scene already supports (custom shaders splice
 * in before it), with the fog step swapped for an exponential curve that starts a little past the
 * view target and never fully hides the ground (HAZE_MAX). The camera stays CAMERA_DISTANCE from
 * its target, so the start and scale are fixed numbers: nothing to update per frame. Zoomed in,
 * the whole screen sits inside HAZE_START_M and nothing is hazed; zoomed out, the top of the
 * screen (the far side) is.
 *
 * Cost: a few instructions per pixel, no extra pass, texture or draw call.
 */
import * as THREE from "three";
import { CAMERA_DISTANCE } from "./viewRig";

/** The colour far things fade to (sRGB; three mixes fog after tone mapping and sRGB conversion). */
export const HAZE_COLOR = 0xcfdbe2;
/** Distance past the view target, along the view direction, where the haze begins (metres). */
export const HAZE_START_M = 1500;
/** E-folding distance of the haze past its start (metres). */
export const HAZE_SCALE_M = 5000;
/** The most the haze ever covers (0..1): the far ring and sea stay faintly visible. */
export const HAZE_MAX = 0.8;

/** How much haze a point gets, `depthM` metres past the view target along the view direction. */
export function hazeAmount(depthM: number): number {
  const d = Math.max(0, depthM - HAZE_START_M);
  return HAZE_MAX * (1 - Math.exp(-d / HAZE_SCALE_M));
}

/**
 * The replacement fog step. Linear fog's uniforms carry the curve: fogNear is where it starts and
 * fogFar - fogNear its scale (both in view depth, i.e. from the camera). Same formula as hazeAmount.
 */
export const HAZE_FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  float fogFactor = ${HAZE_MAX.toFixed(4)} * ( 1.0 - exp( - max( vFogDepth - fogNear, 0.0 ) / ( fogFar - fogNear ) ) );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;

/**
 * Install the haze curve and return the fog for scene.fog. Call before the first render: three
 * reads ShaderChunk when it compiles a material, so later materials pick it up too.
 */
export function createHaze(): THREE.Fog {
  THREE.ShaderChunk.fog_fragment = HAZE_FOG_FRAGMENT;
  const near = CAMERA_DISTANCE + HAZE_START_M;
  return new THREE.Fog(HAZE_COLOR, near, near + HAZE_SCALE_M);
}
