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
 * The same step also fades the edge of the surrounding terrain (setHazeEdge): over the last
 * HAZE_EDGE_IN_M inside the ring's rectangle everything (land, cliff walls, sea) turns to the
 * haze colour, so the region ends in mist instead of a cut. The rectangle is written into the
 * shader as numbers, so it must be set before the first frame: three reuses built-in materials'
 * compiled programs by type and would not see a later change.
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

/** How far inside the ring's edge the edge mist starts (metres). */
export const HAZE_EDGE_IN_M = 3500;
/** Edge mist at the ring's edge and beyond (1 = only the haze colour). */
export const HAZE_EDGE_MAX = 1;

/** World rectangle (metres) of the surrounding terrain. */
export interface HazeRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Signed distance to the rectangle's edge (negative inside), metres; the shader's measure. */
export function rectEdgeDistance(r: HazeRect, x: number, z: number): number {
  return Math.max(r.minX - x, x - r.maxX, r.minZ - z, z - r.maxZ);
}

/** Edge mist at signed distance `d` from the ring's edge (see rectEdgeDistance). */
export function hazeEdgeAmount(d: number): number {
  const t = Math.min(1, Math.max(0, (d + HAZE_EDGE_IN_M) / HAZE_EDGE_IN_M));
  return HAZE_EDGE_MAX * t * t * (3 - 2 * t);
}

/** Fog declarations and vertex step: also pass the world x, z on (for the edge mist). */
export const HAZE_PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec2 vHazeXZ;
#endif
`;
export const HAZE_VERTEX = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vec4 hazeWorld = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    hazeWorld = instanceMatrix * hazeWorld;
  #endif
  vHazeXZ = ( modelMatrix * hazeWorld ).xz;
#endif
`;
export const HAZE_PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec2 vHazeXZ;
  uniform float fogNear;
  uniform float fogFar;
#endif
`;

/**
 * The replacement fog step. Linear fog's uniforms carry the curve: fogNear is where it starts and
 * fogFar - fogNear its scale (both in view depth, i.e. from the camera). Same formula as hazeAmount.
 */
export const HAZE_FOG_FRAGMENT = hazeFogFragment(null);

const g = (n: number) => n.toFixed(1);

/** The fog step, with the edge mist for `rect` (none when null). */
export function hazeFogFragment(rect: HazeRect | null): string {
  const edge = rect
    ? `
  float hazeEdgeD = max( max( ${g(rect.minX)} - vHazeXZ.x, vHazeXZ.x - ${g(rect.maxX)} ),
    max( ${g(rect.minZ)} - vHazeXZ.y, vHazeXZ.y - ${g(rect.maxZ)} ) );
  float hazeEdge = ${HAZE_EDGE_MAX.toFixed(4)} * smoothstep( ${g(-HAZE_EDGE_IN_M)}, 0.0, hazeEdgeD );
  fogFactor = 1.0 - ( 1.0 - fogFactor ) * ( 1.0 - hazeEdge );`
    : "";
  return /* glsl */ `
#ifdef USE_FOG
  float fogFactor = ${HAZE_MAX.toFixed(4)} * ( 1.0 - exp( - max( vFogDepth - fogNear, 0.0 ) / ( fogFar - fogNear ) ) );${edge}
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;
}

/**
 * Mist the edge of the surrounding terrain (`rect`), or none. Call before the first frame.
 */
export function setHazeEdge(rect: HazeRect | null): void {
  THREE.ShaderChunk.fog_fragment = hazeFogFragment(rect);
}

/**
 * Install the haze curve and return the fog for scene.fog. Call before the first render: three
 * reads ShaderChunk when it compiles a material, so later materials pick it up too.
 */
export function createHaze(): THREE.Fog {
  THREE.ShaderChunk.fog_pars_vertex = HAZE_PARS_VERTEX;
  THREE.ShaderChunk.fog_vertex = HAZE_VERTEX;
  THREE.ShaderChunk.fog_pars_fragment = HAZE_PARS_FRAGMENT;
  THREE.ShaderChunk.fog_fragment = HAZE_FOG_FRAGMENT;
  const near = CAMERA_DISTANCE + HAZE_START_M;
  return new THREE.Fog(HAZE_COLOR, near, near + HAZE_SCALE_M);
}
