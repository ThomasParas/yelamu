/**
 * Terrain material that paints the habitat colours per PIXEL from the habitat raster instead
 * of per vertex, so boundaries between habitats are soft, slightly ragged lines rather than
 * 10 m staircases (and the coarse far-away chunks show the same detail as the near ones).
 *
 * The fragment shader turns the world position into a fractional raster position, warps it
 * with a little smooth noise (so edges wander like real ecotones instead of following the
 * grid), then blends the palette colours of the four nearest raster cells. The vertex colour
 * still arrives and multiplies in: it now carries only the darkening factors (baked ground
 * shade, depth under water), see shadeFactorAt in main.ts.
 *
 * The edge is an illustration of a transition, not a mapped line: SFEI's polygons were
 * rasterised at 10 m, and the warp moves an edge by at most EDGE_WARP_CELLS cells.
 */
import * as THREE from "three";

/** How far (in 10 m cells) the noise can push an edge. */
export const EDGE_WARP_CELLS = 1.3;
/** Size of the wiggles along an edge, in cells (one noise period). */
export const EDGE_WARP_PERIOD_CELLS = 3.5;
/**
 * Sharpness of the blend within a cell: 1 = linear across the whole cell (very soft), larger =
 * a narrower transition band centred between samples.
 */
export const EDGE_SHARPNESS = 1.5;

export interface HabitatMaterialOptions {
  /** Class id per raster sample, row-major, row 0 = north. */
  habitat: Uint8Array;
  width: number;
  height: number;
  cellM: number;
  /** LINEAR rgb per class id (3 floats per id), as from paletteToLinear(buildPalette()). */
  palette: Float32Array;
  /** LINEAR rgb for ids beyond the palette. */
  fallback: readonly [number, number, number];
}

const f = (n: number) => n.toFixed(4);

/** Declarations added to the vertex shader (after #include <common>). */
export const VERTEX_PARS = /* glsl */ `
varying vec2 vHabitatXZ;
`;
/** Added to the vertex shader after #include <project_vertex>. */
export const VERTEX_BODY = /* glsl */ `
vHabitatXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;
`;
/** Declarations and helpers added to the fragment shader (after #include <common>). */
export const FRAGMENT_PARS = /* glsl */ `
uniform sampler2D uHabitat;   // R8: class id / 255, NEAREST
uniform sampler2D uPalette;   // 256 x 1 RGBA float: linear colour per class id, NEAREST
uniform vec2 uGridSize;       // raster width, height (samples)
uniform float uCellM;
varying vec2 vHabitatXZ;

float habHash( vec2 p ) {
	return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
// Smooth value noise in -1..1.
float habNoise( vec2 p ) {
	vec2 i = floor( p );
	vec2 u = fract( p );
	u = u * u * ( 3.0 - 2.0 * u );
	float a = habHash( i );
	float b = habHash( i + vec2( 1.0, 0.0 ) );
	float c = habHash( i + vec2( 0.0, 1.0 ) );
	float d = habHash( i + vec2( 1.0, 1.0 ) );
	return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y ) * 2.0 - 1.0;
}
vec3 habColorAt( vec2 cell ) {
	cell = clamp( cell, vec2( 0.0 ), uGridSize - 1.0 );
	float id = texture2D( uHabitat, ( cell + 0.5 ) / uGridSize ).r * 255.0;
	return texture2D( uPalette, vec2( ( floor( id + 0.5 ) + 0.5 ) / 256.0, 0.5 ) ).rgb;
}
vec3 habitatColor( vec2 worldXZ ) {
	// Fractional raster position: sample (0, 0) is the north-west corner, at world
	// ( -(w-1)/2, -(h-1)/2 ) * cell (see terrainMesh.ts).
	vec2 p = worldXZ / uCellM + ( uGridSize - 1.0 ) * 0.5;
	// Two octaves: broad wander plus a finer one (a third of the size) that breaks up the
	// cell corners the broad one leaves.
	vec2 q = p / ${f(EDGE_WARP_PERIOD_CELLS)};
	vec2 r = q * 2.9 + vec2( 5.2, 1.7 );
	p += ${f(EDGE_WARP_CELLS)} * ( 0.7 * vec2( habNoise( q ), habNoise( q + vec2( 17.3, 9.1 ) ) )
		+ 0.3 * vec2( habNoise( r ), habNoise( r + vec2( 3.9, 21.4 ) ) ) );
	vec2 base = floor( p );
	vec2 t = clamp( ( fract( p ) - 0.5 ) * ${f(EDGE_SHARPNESS)} + 0.5, 0.0, 1.0 );
	t = t * t * ( 3.0 - 2.0 * t );
	vec3 c00 = habColorAt( base );
	vec3 c10 = habColorAt( base + vec2( 1.0, 0.0 ) );
	vec3 c01 = habColorAt( base + vec2( 0.0, 1.0 ) );
	vec3 c11 = habColorAt( base + vec2( 1.0, 1.0 ) );
	return mix( mix( c00, c10, t.x ), mix( c01, c11, t.x ), t.y );
}
`;
/** Replaces #include <color_fragment>: habitat colour times the vertex colour (shade factors). */
export const FRAGMENT_COLOR = /* glsl */ `
diffuseColor.rgb *= habitatColor( vHabitatXZ ) * vColor.rgb;
`;

function replaceOnce(source: string, anchor: string, withText: string): string {
  if (!source.includes(anchor)) throw new Error(`habitat shader patch: anchor ${anchor} not found`);
  return source.replace(anchor, withText);
}

/** Patch three's standard-material shader source (exported so tests can check the anchors). */
export function patchHabitatShaders(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = replaceOnce(shader.vertexShader, "#include <common>", `#include <common>${VERTEX_PARS}`);
  shader.vertexShader = replaceOnce(shader.vertexShader, "#include <project_vertex>", `#include <project_vertex>${VERTEX_BODY}`);
  shader.fragmentShader = replaceOnce(shader.fragmentShader, "#include <common>", `#include <common>${FRAGMENT_PARS}`);
  shader.fragmentShader = replaceOnce(shader.fragmentShader, "#include <color_fragment>", FRAGMENT_COLOR);
}

/** 256 x 1 RGBA float palette texture data: every id gets its palette colour or the fallback. */
export function paletteTextureData(palette: Float32Array, fallback: readonly [number, number, number]): Float32Array {
  const data = new Float32Array(256 * 4);
  for (let id = 0; id < 256; id++) {
    const o = id * 3;
    const c = o + 2 < palette.length ? [palette[o], palette[o + 1], palette[o + 2]] : fallback;
    data.set([c[0], c[1], c[2], 1], id * 4);
  }
  return data;
}

export interface HabitatMaterial {
  material: THREE.MeshStandardMaterial;
  dispose(): void;
}

export function createHabitatMaterial(o: HabitatMaterialOptions): HabitatMaterial {
  if (o.habitat.length !== o.width * o.height) {
    throw new Error(`habitat has ${o.habitat.length} samples, expected ${o.width * o.height}`);
  }
  const habitat = new THREE.DataTexture(o.habitat, o.width, o.height, THREE.RedFormat, THREE.UnsignedByteType);
  habitat.unpackAlignment = 1; // rows are `width` bytes, which is usually odd
  habitat.magFilter = habitat.minFilter = THREE.NearestFilter;
  habitat.generateMipmaps = false;
  habitat.flipY = false; // texture row 0 = raster row 0 (north); the shader indexes it that way
  habitat.needsUpdate = true;

  const palette = new THREE.DataTexture(paletteTextureData(o.palette, o.fallback), 256, 1, THREE.RGBAFormat, THREE.FloatType);
  palette.magFilter = palette.minFilter = THREE.NearestFilter;
  palette.generateMipmaps = false;
  palette.colorSpace = THREE.NoColorSpace; // already linear
  palette.needsUpdate = true;

  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHabitat = { value: habitat };
    shader.uniforms.uPalette = { value: palette };
    shader.uniforms.uGridSize = { value: new THREE.Vector2(o.width, o.height) };
    shader.uniforms.uCellM = { value: o.cellM };
    patchHabitatShaders(shader);
  };
  material.customProgramCacheKey = () => "yelamu-habitat-v1";
  return {
    material,
    dispose() {
      material.dispose();
      habitat.dispose();
      palette.dispose();
    },
  };
}
