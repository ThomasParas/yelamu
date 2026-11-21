import * as THREE from "three";
import { SHORE_DEPTH_RANGE_M, SHORE_DIST_SCALE } from "./shoreField";

/** The old static look: translucent blue plane. */
export const WATER_COLOR = 0x3f7fa6;
export const WATER_OPACITY = 0.8;
/**
 * Largest tilt (dimensionless slope) of the animated normal, reached only where every wave
 * peaks together; 0.24 is about 13.5 degrees. Typical tilts are a third of that.
 */
export const WAVE_SLOPE = 0.24;

/** One travelling sine wave of the ripple pattern. */
export interface Wave {
  /** Direction of travel in the world XZ plane, degrees from +X towards +Z. */
  angleDeg: number;
  lengthM: number;
  /** Share of WAVE_SLOPE (the shares add up to 1). */
  weight: number;
  /** Phase at the origin, radians, so the crests do not all line up at (0, 0). */
  phase: number;
}

/**
 * The swell: long waves that only shade the water (a few per cent lighter on slopes facing
 * the sun). The first version tilted the lit normal with two crossed waves, which added up
 * to a repeating egg-crate lattice: three's broad specular and the sun glint picked it out
 * as a grid of pale blobs. Four waves with unrelated directions and lengths, crests bent by
 * a little noise, and only a faint shade, do not read as a pattern.
 */
export const WAVES: readonly Wave[] = [
  { angleDeg: 29, lengthM: 97, weight: 0.33, phase: 0 },
  { angleDeg: 71, lengthM: 61, weight: 0.25, phase: 1.7 },
  { angleDeg: -13, lengthM: 43, weight: 0.22, phase: 4.1 },
  { angleDeg: 118, lengthM: 131, weight: 0.2, phase: 2.6 },
];

/** One octave of the chop: drifting smooth noise whose slope makes the glitter. */
export interface ChopOctave {
  /** Noise cell size, metres. */
  scaleM: number;
  /** Rotation of the noise grid, degrees (so the octaves' grids do not line up). */
  angleDeg: number;
  /** Drift, metres per second, in world X and Z. */
  drift: readonly [number, number];
  /** Share of the chop slope (the shares add up to 1). */
  weight: number;
}

/**
 * The chop: noise, not sines, because any small set of sine waves repeats, and at map zoom
 * the glint turned that into a grid or stripes. Each octave fades out once its cells are
 * under about 8 pixels.
 */
export const CHOP: readonly ChopOctave[] = [
  { scaleM: 24, angleDeg: 17, drift: [1.1, 0.6], weight: 0.5 },
  { scaleM: 11, angleDeg: 61, drift: [-0.5, 0.9], weight: 0.3 },
  { scaleM: 5, angleDeg: -38, drift: [0.7, -0.4], weight: 0.2 },
];
/** How far (metres) the noise bends the crests. */
export const WAVE_WARP_M = 24;
/** Scale of that noise, metres per noise cell. */
export const WAVE_WARP_SCALE_M = 180;
const GRAVITY = 9.81;

/** Angular frequency (rad/s) of a deep-water wave of this length: omega = sqrt(g * 2 pi / L). */
export function waveOmega(lengthM: number): number {
  return Math.sqrt((GRAVITY * 2 * Math.PI) / lengthM);
}
/** Sharpness and strength of the sun glint (only while animated). */
export const GLINT_POWER = 300;
export const GLINT_STRENGTH = 0.55;
/** Chop slope per unit of noise gradient (times WAVE_SLOPE): how far the glitter facets tilt. */
export const CHOP_GAIN = 0.7;
/** How much the ripples' sun-facing slopes lighten (and the others darken) the water. */
export const WAVE_SHADE = 0.6;

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
  /**
   * Optional, one byte per sample: 1 where the ground just under the water level is tidal
   * marsh or mud flat (shoreField.ts dryMask). The sea is left clear there.
   */
  dry?: Uint8Array | null;
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
  /**
   * Turn on shallows and foam from a shore field (until then the water looks as before).
   * Returns the field's texture, for the ground's wet shore band to share.
   */
  setShore(shore: WaterShore): THREE.DataTexture;
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
const vec3 WAVE_SUN = vec3( -0.5976, 0.7171, 0.3586 ); // normalize( -1, 1.2, 0.6 ), the scene's sun
float waveHash( vec2 p ) {
	return fract( sin( dot( p, vec2( 269.5, 183.3 ) ) ) * 43758.5453 );
}
// Smooth value noise in 0..1.
// Gradient of waveNoise (analytic, from the same four corners), in -1.5..1.5 per cell.
vec2 waveNoiseGrad( vec2 p ) {
	vec2 i = floor( p );
	vec2 u = fract( p );
	vec2 du = 6.0 * u * ( 1.0 - u );
	u = u * u * ( 3.0 - 2.0 * u );
	float a = waveHash( i );
	float b = waveHash( i + vec2( 1.0, 0.0 ) );
	float c = waveHash( i + vec2( 0.0, 1.0 ) );
	float d = waveHash( i + vec2( 1.0, 1.0 ) );
	return du * vec2( b - a + ( a - b - c + d ) * u.y, c - a + ( a - b - c + d ) * u.x );
}
float waveNoise( vec2 p ) {
	vec2 i = floor( p );
	vec2 u = fract( p );
	u = u * u * ( 3.0 - 2.0 * u );
	return mix( mix( waveHash( i ), waveHash( i + vec2( 1.0, 0.0 ) ), u.x ),
		mix( waveHash( i + vec2( 0.0, 1.0 ) ), waveHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
`;
/** GLSL for one chop octave: adds its noise slope (per metre, times the cell size) to chop. */
function chopGlsl(o: ChopOctave): string {
  const a = (o.angleDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  // rotate world XZ into the octave's noise grid, then scale to cells
  const m = [c / o.scaleM, sn / o.scaleM, -sn / o.scaleM, c / o.scaleM];
  return `
	{
		vec2 d = vWaterXZ - uTime * vec2( ${f(o.drift[0])}, ${f(o.drift[1])} );
		vec2 g = waveNoiseGrad( vec2( dot( d, vec2( ${f(m[0])}, ${f(m[1])} ) ), dot( d, vec2( ${f(m[2])}, ${f(m[3])} ) ) ) );
		// back to world axes (the inverse rotation); the gradient is per cell, a dimensionless slope scale
		chop += ${f(o.weight)} * ( 1.0 - smoothstep( ${f(o.scaleM * 0.06)}, ${f(o.scaleM * 0.125)}, mpp ) )
			* vec2( g.x * ${f(c)} - g.y * ${f(sn)}, g.x * ${f(sn)} + g.y * ${f(c)} );
	}`;
}

/** GLSL for one wave: adds its slope to `slope`, faded out once it is under a few pixels. */
function waveGlsl(w: Wave): string {
  const a = (w.angleDeg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dz = Math.sin(a);
  const k = (2 * Math.PI) / w.lengthM;
  return `
	swell += ${f(w.weight)} * ( 1.0 - smoothstep( ${f(w.lengthM * 0.06)}, ${f(w.lengthM * 0.125)}, mpp ) )
		* cos( dot( p, vec2( ${f(dx * k)}, ${f(dz * k)} ) ) - uTime * ${f(waveOmega(w.lengthM))} + ${f(w.phase)} )
		* vec2( ${f(dx)}, ${f(dz)} );`;
}

/**
 * Added after #include <normal_fragment_maps>. The waves of WAVES, travelling across world
 * XZ at deep-water speeds, over a position bent by smooth noise; the slope of their sum
 * tilts the world-space up vector into waveNormal (view space). A wave fades out when
 * zoomed so far out that it would be under about 8 pixels long (it would only shimmer).
 *
 * three's own lighting keeps the flat normal: its broad specular sheen turned every
 * tilted patch into a large pale blob that changed with the view angle (the old "grid").
 * The ripples show only through the glint and the gentle sun-side shade below.
 * With uAmp = 0 the branch is skipped and waveNormal is the plane's own.
 */
export const FRAGMENT_NORMAL = /* glsl */ `
vec3 waveNormal = normal;
float waveShade = 0.0;
if ( uAmp > 0.0 ) {
	float mpp = length( fwidth( vWaterXZ ) ); // metres per pixel
	vec2 q = vWaterXZ / ${f(WAVE_WARP_SCALE_M)};
	vec2 p = vWaterXZ + ${f(WAVE_WARP_M * 2)} * ( vec2( waveNoise( q ), waveNoise( q + vec2( 31.7, 11.3 ) ) ) - 0.5 );
	vec2 swell = vec2( 0.0 );
	vec2 chop = vec2( 0.0 );${WAVES.map(waveGlsl).join("")}${CHOP.map(chopGlsl).join("")}
	// The swell shades: a Lambert ratio against flat water, sun-facing slopes a little lighter.
	vec3 swellN = normalize( vec3( -swell.x * uAmp, 1.0, -swell.y * uAmp ) );
	waveShade = dot( swellN, WAVE_SUN ) / WAVE_SUN.y - 1.0;
	// The chop glints: scattered facets that catch the sun.
	vec2 c = chop * uAmp * ${f(CHOP_GAIN)};
	waveNormal = normalize( ( viewMatrix * vec4( normalize( vec3( -c.x, 1.0, -c.y ) ), 0.0 ) ).xyz );
}
`;
/**
 * Added before #include <opaque_fragment>: the ripple shade, then a glint where the wave normal faces
 * the half vector between the sun (same direction as the scene's DirectionalLight) and
 * the viewer. Only while animated, so the static plane is unchanged.
 */
export const FRAGMENT_GLINT = /* glsl */ `
if ( uAmp > 0.0 ) {
	outgoingLight *= 1.0 + ${f(WAVE_SHADE)} * waveShade;
	vec3 sunView = normalize( ( viewMatrix * vec4( WAVE_SUN, 0.0 ) ).xyz );
	vec3 halfV = normalize( sunView + geometryViewDir );
	// Only what the ripples add over flat water: looking towards the sun the flat plane itself
	// lines up with the sun, and an absolute glint washed the whole sea out pale, with the
	// tilted slopes showing as dark rows.
	// Also calmer the more the whole view faces the sun, or that angle is a dazzle of patches.
	vec3 upView = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
	float flatGlint = pow( max( dot( upView, halfV ), 0.0 ), ${f(GLINT_POWER)} );
	float glint = max( pow( max( dot( waveNormal, halfV ), 0.0 ), ${f(GLINT_POWER)} ) - flatGlint, 0.0 )
		* ( 1.0 - 0.6 * flatGlint );
	outgoingLight += vec3( 1.0, 0.96, 0.85 ) * glint * ${f(GLINT_STRENGTH)};
}
`;

/** Declarations added to the fragment shader when a shore field is given. */
export const FRAGMENT_SHORE_PARS = /* glsl */ `
uniform float uShoreOn;     // 0 until a shore field is set
uniform sampler2D uShore;   // RG8, LINEAR: R depth, G signed distance (shoreField.ts)
uniform sampler2D uDry;     // R8, LINEAR: 1 over tidal marsh and flat (water left clear)
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
	float dry = 0.0;
	if ( uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0 ) {
		dry = texture2D( uDry, uv ).r;
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
	// Tidal marsh and mud flat lie just under the water level but are ground, not open water:
	// no blue sheet over them. Fully clear pixels are dropped, so they do not hide lines and
	// markers drawn on that ground afterwards.
	diffuseColor.a *= 1.0 - smoothstep( 0.25, 0.75, dry );
	if ( diffuseColor.a < 0.004 ) discard;
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

/** R8 texture over the dry mask (0/1 per sample), scaled to 0/255; linear for a soft edge. */
export function createDryTexture(dry: Uint8Array, width: number, height: number): THREE.DataTexture {
  if (dry.length !== width * height) throw new Error(`dry mask has ${dry.length} bytes, expected ${width * height}`);
  const bytes = new Uint8Array(dry.length);
  for (let i = 0; i < dry.length; i++) bytes[i] = dry[i] ? 255 : 0;
  const t = new THREE.DataTexture(bytes, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  t.unpackAlignment = 1;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
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
    uDry: { value: createDryTexture(new Uint8Array(1), 1, 1) },
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
    m.customProgramCacheKey = () => "yelamu-water-v3";
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
      shoreUniforms.uDry.value.dispose();
      shoreUniforms.uDry.value = createDryTexture(shore.dry ?? new Uint8Array(shore.width * shore.height), shore.width, shore.height);
      shoreUniforms.uShoreGrid.value.set(shore.width, shore.height);
      shoreUniforms.uShoreCellM.value = shore.cellM;
      seaShoreOn.value = 1;
      return texture;
    },
  };
}
