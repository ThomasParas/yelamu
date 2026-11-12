import * as THREE from "three";

/** The old static look: translucent blue plane. */
export const WATER_COLOR = 0x3f7fa6;
export const WATER_OPACITY = 0.8;
/** Tilt (dimensionless slope) of the animated normal; 0.18 is about 10 degrees at most. */
export const WAVE_SLOPE = 0.18;
/** Sharpness and strength of the sun glint (only while animated). */
export const GLINT_POWER = 18;
export const GLINT_STRENGTH = 0.55;

export interface WaterMaterial {
  material: THREE.MeshStandardMaterial;
  /** Seconds, any origin; call before each render while animated. */
  setTime(t: number): void;
  /** Off: amplitude 0, identical to the old static plane. */
  setAnimated(on: boolean): void;
}

const f = (n: number) => n.toFixed(4);

/** Declarations added to the vertex shader (after #include <common>). */
export const VERTEX_PARS = /* glsl */ `
varying vec2 vWaterXZ;
`;
/** Added to the vertex shader after #include <project_vertex>. */
export const VERTEX_BODY = /* glsl */ `
vWaterXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz; // world position on the water plane
`;
/** Declarations added to the fragment shader (after #include <common>). */
export const FRAGMENT_PARS = /* glsl */ `
uniform float uTime; // seconds
uniform float uAmp;  // wave slope; 0 = static plane
varying vec2 vWaterXZ;
`;
/**
 * Added after #include <normal_fragment_maps>. Two crossed travelling sine waves in
 * world XZ (wavelengths ~100 m and ~90 m, at roughly right angles); the slope of their
 * sum tilts the world-space up vector, which is then rotated into view space. With
 * uAmp = 0 the branch is skipped and the normal is the plane's own.
 */
export const FRAGMENT_NORMAL = /* glsl */ `
if ( uAmp > 0.0 ) {
	float w1 = dot( vWaterXZ, vec2( 0.055, 0.030 ) ) + uTime * 0.9;
	float w2 = dot( vWaterXZ, vec2( -0.034, 0.061 ) ) + uTime * 1.3;
	// cos() is the derivative of sin(); the vec2s are the unit directions of the two waves
	vec2 slope = uAmp * 0.5 * ( cos( w1 ) * vec2( 0.878, 0.479 ) + cos( w2 ) * vec2( -0.487, 0.874 ) );
	vec3 nWorld = normalize( vec3( -slope.x, 1.0, -slope.y ) );
	normal = normalize( ( viewMatrix * vec4( nWorld, 0.0 ) ).xyz );
}
`;
/**
 * Added before #include <opaque_fragment>: a soft glint where the perturbed normal faces
 * the half vector between the sun (same direction as the scene's DirectionalLight) and
 * the viewer. Only while animated, so the static plane is unchanged.
 */
export const FRAGMENT_GLINT = /* glsl */ `
if ( uAmp > 0.0 ) {
	const vec3 SUN_WORLD = vec3( -0.5976, 0.7171, 0.3586 ); // normalize( -1, 1.2, 0.6 )
	vec3 sunView = normalize( ( viewMatrix * vec4( SUN_WORLD, 0.0 ) ).xyz );
	vec3 halfV = normalize( sunView + geometryViewDir );
	float glint = pow( max( dot( normal, halfV ), 0.0 ), ${f(GLINT_POWER)} );
	outgoingLight += vec3( 1.0, 0.96, 0.85 ) * glint * ${f(GLINT_STRENGTH)};
}
`;

function replaceOnce(source: string, anchor: string, withText: string): string {
  if (!source.includes(anchor)) throw new Error(`water shader patch: anchor ${anchor} not found`);
  return source.replace(anchor, withText);
}

/** Patch three's standard-material shader source (exported so tests can check the anchors). */
export function patchWaterShaders(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = replaceOnce(shader.vertexShader, "#include <common>", `#include <common>${VERTEX_PARS}`);
  shader.vertexShader = replaceOnce(
    shader.vertexShader,
    "#include <project_vertex>",
    `#include <project_vertex>${VERTEX_BODY}`,
  );
  shader.fragmentShader = replaceOnce(shader.fragmentShader, "#include <common>", `#include <common>${FRAGMENT_PARS}`);
  shader.fragmentShader = replaceOnce(
    shader.fragmentShader,
    "#include <normal_fragment_maps>",
    `#include <normal_fragment_maps>${FRAGMENT_NORMAL}`,
  );
  shader.fragmentShader = replaceOnce(
    shader.fragmentShader,
    "#include <opaque_fragment>",
    `${FRAGMENT_GLINT}#include <opaque_fragment>`,
  );
}

export function createWaterMaterial(): WaterMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: WATER_COLOR,
    transparent: true,
    opacity: WATER_OPACITY,
  });
  // Shared uniform objects: updating .value reaches every compiled program.
  const uTime = { value: 0 };
  const uAmp = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uAmp = uAmp;
    patchWaterShaders(shader);
  };
  // All water materials share one patch, so they can share one program.
  material.customProgramCacheKey = () => "yelamu-water-v1";
  return {
    material,
    setTime(t) {
      if (Number.isFinite(t)) uTime.value = t;
    },
    setAnimated(on) {
      uAmp.value = on ? WAVE_SLOPE : 0;
    },
  };
}
