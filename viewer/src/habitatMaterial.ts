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
 *
 * Sea colours stay under the sea: the warp and blend would otherwise smear the bay's blue up
 * to a cell or so onto the shore, which on a steep bank shows as dark wedges standing out of
 * the water. Above the water surface the sea classes (marked in the palette's alpha) drop
 * out of the blend and their weight goes to the land samples, or to SHORE_COLOR where all
 * four are sea.
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
/** Height (metres, before exaggeration) over which sea colours fade out above the water. */
export const DRY_BAND_M = 0.4;

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
  /** Class ids of the sea (see seaClassIds); none = no sea handling. */
  seaIds?: readonly number[];
  /** World y of the water surface (water level times the vertical exaggeration). */
  waterY?: number;
  /** Vertical exaggeration, to turn DRY_BAND_M into world units. */
  exaggeration?: number;
  /** LINEAR rgb for ground above the water where every nearby sample is sea. */
  shoreColor?: readonly [number, number, number];
}

const f = (n: number) => n.toFixed(4);

/** Declarations added to the vertex shader (after #include <common>). */
export const VERTEX_PARS = /* glsl */ `
varying vec2 vHabitatXZ;
varying float vHabitatY;
`;
/** Added to the vertex shader after #include <project_vertex>. */
export const VERTEX_BODY = /* glsl */ `
vec4 habWorld = modelMatrix * vec4( transformed, 1.0 );
vHabitatXZ = habWorld.xz;
vHabitatY = habWorld.y;
`;
/** Declarations and helpers added to the fragment shader (after #include <common>). */
export const FRAGMENT_PARS = /* glsl */ `
uniform sampler2D uHabitat;   // R8: class id / 255, NEAREST
uniform sampler2D uPalette;   // 256 x 1 RGBA float: linear colour per class id (a = 1 for sea), NEAREST
uniform vec2 uGridSize;       // raster width, height (samples)
uniform float uCellM;
uniform float uWaterY;        // world y of the water surface
uniform float uDryBand;       // world-y band above it over which sea colours fade out
uniform vec3 uShoreColor;     // linear colour where all four samples are sea, above water
varying vec2 vHabitatXZ;
varying float vHabitatY;

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
vec4 habColorAt( vec2 cell ) {
	cell = clamp( cell, vec2( 0.0 ), uGridSize - 1.0 );
	float id = texture2D( uHabitat, ( cell + 0.5 ) / uGridSize ).r * 255.0;
	return texture2D( uPalette, vec2( ( floor( id + 0.5 ) + 0.5 ) / 256.0, 0.5 ) );
}
// The 8 neighbours of a cell, for habLandNear.
const vec2 HAB_RING[8] = vec2[8](
	vec2( 1.0, 0.0 ), vec2( -1.0, 0.0 ), vec2( 0.0, 1.0 ), vec2( 0.0, -1.0 ),
	vec2( 1.0, 1.0 ), vec2( -1.0, 1.0 ), vec2( 1.0, -1.0 ), vec2( -1.0, -1.0 ) );
// Mean colour of the land (non-sea) cells in the first ring around the cell that has any,
// out to two cells; the shore colour if there are none.
vec3 habLandNear( vec2 cell ) {
	for ( int r = 1; r <= 2; r++ ) {
		vec3 sum = vec3( 0.0 );
		float n = 0.0;
		for ( int i = 0; i < 8; i++ ) {
			vec4 c = habColorAt( cell + HAB_RING[ i ] * float( r ) );
			sum += c.rgb * ( 1.0 - c.a );
			n += 1.0 - c.a;
		}
		if ( n > 0.5 ) return sum / n;
	}
	return uShoreColor;
}
vec3 habitatColor( vec2 worldXZ, float worldY ) {
	// Fractional raster position: sample (0, 0) is the north-west corner, at world
	// ( -(w-1)/2, -(h-1)/2 ) * cell (see terrainMesh.ts).
	vec2 p = worldXZ / uCellM + ( uGridSize - 1.0 ) * 0.5;
	vec2 p0 = p;
	// Two octaves: broad wander plus a finer one (a third of the size) that breaks up the
	// cell corners the broad one leaves.
	vec2 q = p / ${f(EDGE_WARP_PERIOD_CELLS)};
	vec2 r = q * 2.9 + vec2( 5.2, 1.7 );
	p += ${f(EDGE_WARP_CELLS)} * ( 0.7 * vec2( habNoise( q ), habNoise( q + vec2( 17.3, 9.1 ) ) )
		+ 0.3 * vec2( habNoise( r ), habNoise( r + vec2( 3.9, 21.4 ) ) ) );
	vec2 base = floor( p );
	vec2 t = clamp( ( fract( p ) - 0.5 ) * ${f(EDGE_SHARPNESS)} + 0.5, 0.0, 1.0 );
	t = t * t * ( 3.0 - 2.0 * t );
	vec4 c00 = habColorAt( base );
	vec4 c10 = habColorAt( base + vec2( 1.0, 0.0 ) );
	vec4 c01 = habColorAt( base + vec2( 0.0, 1.0 ) );
	vec4 c11 = habColorAt( base + vec2( 1.0, 1.0 ) );
	// Bilinear weights; above the water a sea sample's weight goes to its land neighbours.
	float dry = smoothstep( uWaterY, uWaterY + uDryBand, worldY );
	vec4 w = vec4( ( 1.0 - t.x ) * ( 1.0 - t.y ), t.x * ( 1.0 - t.y ), ( 1.0 - t.x ) * t.y, t.x * t.y );
	w *= 1.0 - dry * vec4( c00.a, c10.a, c01.a, c11.a );
	float kept = w.x + w.y + w.z + w.w;
	vec3 c = c00.rgb * w.x + c10.rgb * w.y + c01.rgb * w.z + c11.rgb * w.w;
	// Where little or no land weight is left, fade (smoothly, so no seam) to the land just
	// beyond the blend: only shore pixels on a bank pay for that lookup.
	float lost = ( 1.0 - kept ) * 0.1;
	if ( lost < 1e-4 ) return c / kept;
	return ( c + habLandNear( floor( p0 + 0.5 ) ) * lost ) / ( kept + lost );
}
`;
/** Replaces #include <color_fragment>: habitat colour times the vertex colour (shade factors). */
export const FRAGMENT_COLOR = /* glsl */ `
diffuseColor.rgb *= habitatColor( vHabitatXZ, vHabitatY ) * vColor.rgb;
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

/**
 * 256 x 1 RGBA float palette texture data: every id gets its palette colour or the fallback;
 * alpha is 1 for the sea classes in `seaIds`, 0 for everything else.
 */
export function paletteTextureData(
  palette: Float32Array,
  fallback: readonly [number, number, number],
  seaIds: readonly number[] = [],
): Float32Array {
  const sea = new Set(seaIds);
  const data = new Float32Array(256 * 4);
  for (let id = 0; id < 256; id++) {
    const o = id * 3;
    const c = o + 2 < palette.length ? [palette[o], palette[o + 1], palette[o + 2]] : fallback;
    data.set([c[0], c[1], c[2], sea.has(id) ? 1 : 0], id * 4);
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

  const palette = new THREE.DataTexture(paletteTextureData(o.palette, o.fallback, o.seaIds), 256, 1, THREE.RGBAFormat, THREE.FloatType);
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
    shader.uniforms.uWaterY = { value: o.waterY ?? 0 };
    shader.uniforms.uDryBand = { value: DRY_BAND_M * (o.exaggeration ?? 1) };
    shader.uniforms.uShoreColor = { value: new THREE.Vector3(...(o.shoreColor ?? o.fallback)) };
    patchHabitatShaders(shader);
  };
  material.customProgramCacheKey = () => "yelamu-habitat-v2";
  return {
    material,
    dispose() {
      material.dispose();
      habitat.dispose();
      palette.dispose();
    },
  };
}
