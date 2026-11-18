import * as THREE from "three";
import { SHORE_DEPTH_RANGE_M, SHORE_DIST_SCALE } from "./shoreField";

/** The old static look: translucent blue plane. */
export const WATER_COLOR = 0x3f7fa6;
export const WATER_OPACITY = 0.8;
/** Tilt (dimensionless slope) of the animated normal; 0.18 is about 10 degrees at most. */
export const WAVE_SLOPE = 0.18;
/** Sharpness and strength of the sun glint (only while animated). */
export const GLINT_POWER = 18;
export const GLINT_STRENGTH = 0.55;

/** Water shallower than this (metres) blends toward the shallow colour. */
export const SHALLOW_DEPTH_M = 2;
/** The shallow tint fades out this far (metres) from the shoreline, so broad flats keep the water colour. */
export const SHALLOW_REACH_M = 70;
/** Paler, greener water over the shallows (sRGB). */
export const SHALLOW_COLOR = 0x6fa9a8;
/** Foam band width from the shoreline out to sea, metres. */
export const FOAM_WIDTH_M = 18;
export const FOAM_COLOR = 0xf1eee4;
/** Foam cover at the shoreline itself (0..1). */
export const FOAM_STRENGTH = 0.85;

/** The shore field (see shoreField.ts) and the grid it was made on. */
export interface WaterShore {
  field: Uint8Array;
  width: number;
  height: number;
  cellM: number;
}

export interface WaterMaterial {
  /** The sea: shallows and foam once setShore is called. */
  material: THREE.MeshStandardMaterial;
  /** Same look and motion as the sea, without the shore effects (ponds and lagoons). */
  pondMaterial: THREE.MeshStandardMaterial;
  /** Seconds, any origin; call before each render while animated. */
  setTime(t: number): void;
  /** Off: amplitude 0, identical to the old static plane. */
  setAnimated(on: boolean): void;
  /** Turn on shallows and foam from a shore field (until then the water looks as before). */
  setShore(shore: WaterShore): void;
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

/** Declarations added to the fragment shader when a shore field is given. */
export const FRAGMENT_SHORE_PARS = /* glsl */ `
uniform float uShoreOn;     // 0 until a shore field is set
uniform sampler2D uShore;   // RG8, LINEAR: R depth, G signed distance (shoreField.ts)
uniform vec2 uShoreGrid;    // samples
uniform float uShoreCellM;
uniform vec3 uShallowColor; // linear
uniform vec3 uFoamColor;    // linear
float shoreHash( vec2 p ) {
	return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
float shoreNoise( vec2 p ) {
	vec2 i = floor( p );
	vec2 u = fract( p );
	u = u * u * ( 3.0 - 2.0 * u );
	return mix( mix( shoreHash( i ), shoreHash( i + vec2( 1.0, 0.0 ) ), u.x ),
		mix( shoreHash( i + vec2( 0.0, 1.0 ) ), shoreHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
`;
/**
 * Added after #include <color_fragment>: shallow tint and opacity, then the foam band.
 * Outside the map the water reads as deep with no shore. While animated, bands of foam
 * move toward the shore.
 */
export const FRAGMENT_SHORE = /* glsl */ `
if ( uShoreOn > 0.5 ) {
	vec2 p = vWaterXZ / uShoreCellM + ( uShoreGrid - 1.0 ) * 0.5;
	vec2 uv = ( p + 0.5 ) / uShoreGrid;
	float depthM = ${f(SHORE_DEPTH_RANGE_M)};
	float distM = 1e4;
	if ( uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0 ) {
		vec2 s = texture2D( uShore, uv ).rg;
		depthM = s.r * ${f(SHORE_DEPTH_RANGE_M)};
		distM = ( s.g * 255.0 - 128.0 ) / ${f(SHORE_DIST_SCALE)} * uShoreCellM;
	}
	// The drawn waterline can sit up to a cell landward of the sampled one (the mesh is linear
	// between samples), so the effects carry on a cell into the land side, then fade: water
	// drawn well inside land (coarse far-away terrain over thin strips) stays plain.
	float onWater = smoothstep( -2.5 * uShoreCellM, -uShoreCellM, distM );
	float shallow = ( 1.0 - smoothstep( 0.0, ${f(SHALLOW_DEPTH_M)}, depthM ) )
		* ( 1.0 - smoothstep( 0.0, ${f(SHALLOW_REACH_M)}, distM ) ) * onWater;
	diffuseColor.rgb = mix( diffuseColor.rgb, uShallowColor, shallow * 0.5 );
	// No extra transparency: the ground under the water is painted in the habitat water colour,
	// so seeing more of it would show dark patches, not sand.
	// Ragged inner edge: noise along the coast moves the band's outer limit.
	float n = shoreNoise( vWaterXZ / 35.0 ) * 0.6 + shoreNoise( vWaterXZ / 11.0 ) * 0.4;
	float width = ${f(FOAM_WIDTH_M)} * ( 0.55 + 0.9 * n );
	float band = 1.0 - smoothstep( 0.3 * width, width, distM );
	float foam = band * band * onWater;
	if ( uAmp > 0.0 ) {
		// Crests travel shoreward: phase grows with distance plus time.
		float crest = 0.5 + 0.5 * sin( distM * 0.45 + uTime * 1.6 + n * 4.0 );
		foam *= mix( 0.45, 1.0, crest );
	}
	// Zoomed far out the band is thinner than a pixel and would shimmer: fade it by the
	// ground size of a pixel (metres).
	float metresPerPixel = length( fwidth( vWaterXZ ) );
	foam *= ${f(FOAM_STRENGTH)} * ( 1.0 - smoothstep( 3.0, 8.0, metresPerPixel ) );
	diffuseColor.rgb = mix( diffuseColor.rgb, uFoamColor, foam );
	diffuseColor.a = mix( diffuseColor.a, 1.0, foam );
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
  shader.fragmentShader = replaceOnce(shader.fragmentShader, "#include <common>", `#include <common>${FRAGMENT_SHORE_PARS}`);
  shader.fragmentShader = replaceOnce(
    shader.fragmentShader,
    "#include <color_fragment>",
    `#include <color_fragment>${FRAGMENT_SHORE}`,
  );
}

/** RG8 texture over the shore field: linear filtering gives a smooth line between samples. */
export function createShoreTexture(shore: WaterShore): THREE.DataTexture {
  if (shore.field.length !== shore.width * shore.height * 2) {
    throw new Error(`shore field has ${shore.field.length} bytes, expected ${shore.width * shore.height * 2}`);
  }
  const t = new THREE.DataTexture(shore.field, shore.width, shore.height, THREE.RGFormat, THREE.UnsignedByteType);
  t.unpackAlignment = 2; // rows are width * 2 bytes
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.flipY = false; // row 0 = north, as the shader indexes it
  t.colorSpace = THREE.NoColorSpace; // data, not colour
  t.needsUpdate = true;
  return t;
}

export function createWaterMaterial(): WaterMaterial {
  // Shared uniform objects: updating .value reaches every compiled program.
  const uTime = { value: 0 };
  const uAmp = { value: 0 };
  // Placeholder 1x1 texture until setShore; uShoreOn = 0 skips the shore code anyway.
  const shoreUniforms = {
    uShore: { value: createShoreTexture({ field: new Uint8Array([255, 255]), width: 1, height: 1, cellM: 1 }) },
    uShoreGrid: { value: new THREE.Vector2(1, 1) },
    uShoreCellM: { value: 1 },
    uShallowColor: { value: new THREE.Color(SHALLOW_COLOR) }, // converted to linear
    uFoamColor: { value: new THREE.Color(FOAM_COLOR) },
  };
  const make = (shoreOn: { value: number }) => {
    const m = new THREE.MeshStandardMaterial({ color: WATER_COLOR, transparent: true, opacity: WATER_OPACITY });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.uniforms.uAmp = uAmp;
      Object.assign(shader.uniforms, shoreUniforms, { uShoreOn: shoreOn });
      patchWaterShaders(shader);
    };
    // Both materials share one patch, so they share one program (uniforms stay per material).
    m.customProgramCacheKey = () => "yelamu-water-v2";
    return m;
  };
  const seaShoreOn = { value: 0 };
  return {
    material: make(seaShoreOn),
    // Ponds sit at their own level, over ground the sea's shore field calls land: no shore there.
    pondMaterial: make({ value: 0 }),
    setTime(t) {
      if (Number.isFinite(t)) uTime.value = t;
    },
    setAnimated(on) {
      uAmp.value = on ? WAVE_SLOPE : 0;
    },
    setShore(shore) {
      const texture = createShoreTexture(shore);
      shoreUniforms.uShore.value.dispose();
      shoreUniforms.uShore.value = texture;
      shoreUniforms.uShoreGrid.value.set(shore.width, shore.height);
      shoreUniforms.uShoreCellM.value = shore.cellM;
      seaShoreOn.value = 1;
    },
  };
}
