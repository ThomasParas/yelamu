/**
 * Habitat patterns: an optional texture mark per habitat group, so the ground classes can be told
 * apart without relying on colour (for colour-blind visitors; measured 2026-11-18, under red-green
 * colour blindness dune/grassland, marsh/scrub and wetland/rock/unmapped come out nearly the same,
 * and dune/beach is close for everyone). Off by default; the "Habitat patterns" layer turns it on.
 *
 * The marks are drawn by the terrain shader (habitatMaterial.ts), anchored to the ground so they
 * do not slide while panning, and kept at about PATTERN_CELL_PX on screen at every zoom by
 * blending between two power-of-two cell sizes. The class whose colour dominates a pixel decides
 * its pattern, so the pattern edges follow the soft colour edges.
 *
 * Dark marks only darken grounds that are well lighter than woodland (the darkest ground), and
 * marsh/wetland get light marks, so creek and street lines keep their contrast (uiColors.test.ts).
 */

export const PATTERN_NONE = 0;
export const PATTERN_DOTS = 1;
export const PATTERN_RINGS = 2;
export const PATTERN_DASHES = 3;
export const PATTERN_CROSSES = 4;

/** Pattern per habitat group; groups not listed stay plain. */
export const GROUP_PATTERNS: Readonly<Record<string, number>> = {
  dune: PATTERN_DOTS,
  scrub: PATTERN_RINGS,
  marsh: PATTERN_DASHES,
  wetland: PATTERN_DASHES,
  rock: PATTERN_CROSSES,
};

/** Name of each pattern, for the legend swatch CSS class (`swatch--<name>`). */
export const PATTERN_NAMES = ["none", "dots", "rings", "dashes", "crosses"] as const;

/** Most a dark mark darkens the ground (share of its colour). */
export const PATTERN_DARK = 0.32;
/** Most a light mark moves the ground towards white. */
export const PATTERN_LIGHT = 0.38;
/** Patterns whose marks are light (the rest are dark). */
export const LIGHT_PATTERNS: readonly number[] = [PATTERN_DASHES];
/** Target size of one pattern cell on screen, CSS-ish pixels (device pixels in the shader). */
export const PATTERN_CELL_PX = 14;

/** Layer id of the toggle (in the URL as `l=...,habitat-patterns`). */
export const PATTERNS_LAYER = "habitat-patterns";

/** Pattern code per class id (index = id), from each class's group. */
export function patternById(classes: readonly { id: number; group: string }[]): number[] {
  const out: number[] = [];
  for (const c of classes) if (c.id >= 0 && c.id < 256) out[c.id] = GROUP_PATTERNS[c.group] ?? PATTERN_NONE;
  return Array.from(out, (v) => v ?? PATTERN_NONE);
}

/** The pattern name for a habitat group (for the legend swatch). */
export function patternNameForGroup(group: string): (typeof PATTERN_NAMES)[number] {
  return PATTERN_NAMES[GROUP_PATTERNS[group] ?? PATTERN_NONE];
}

/** Colour factor of the darkest mark (what a dark mark multiplies the ground by at its core). */
export const PATTERN_DARKEST = 1 - PATTERN_DARK;

const f = (n: number) => n.toFixed(4);

/**
 * GLSL: mark coverage (0..1) of `pattern` at world position `xz`. `px` is metres per screen pixel
 * here (from derivatives). Two cell sizes around PATTERN_CELL_PX pixels are blended.
 */
export const PATTERN_GLSL = /* glsl */ `
float patSegment( vec2 p, vec2 a, vec2 b ) {
	vec2 pa = p - a, ba = b - a;
	float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 );
	return length( pa - ba * h );
}
// Coverage of one pattern in a cell grid of size cellM; aa = cell units per pixel.
float patCell( float pattern, vec2 xz, float cellM, float aa ) {
	vec2 g = xz / cellM;
	// Every other row shifted half a cell, so the marks form a staggered grid, not stripes.
	g.x += 0.5 * mod( floor( g.y ), 2.0 );
	vec2 u = fract( g ) - 0.5;
	float d;
	float r;
	if ( pattern < 1.5 ) { d = length( u ); r = 0.17; }                                   // dots
	else if ( pattern < 2.5 ) { d = abs( length( u ) - 0.2 ); r = 0.06; }                 // rings
	else if ( pattern < 3.5 ) { d = patSegment( u, vec2( -0.28, 0.0 ), vec2( 0.28, 0.0 ) ); r = 0.07; } // dashes
	else { d = min( patSegment( u, vec2( -0.18 ), vec2( 0.18 ) ),
		patSegment( u, vec2( -0.18, 0.18 ), vec2( 0.18, -0.18 ) ) ); r = 0.06; }           // crosses
	return 1.0 - smoothstep( r - aa, r + aa, d );
}
float habPattern( float pattern, vec2 xz, float px ) {
	if ( pattern < 0.5 ) return 0.0;
	float level = log2( max( px * ${f(PATTERN_CELL_PX)}, 1e-3 ) );
	float l0 = floor( level );
	float k = smoothstep( 0.25, 0.75, level - l0 );
	float c0 = exp2( l0 );
	float c1 = c0 * 2.0;
	float a = patCell( pattern, xz, c0, px / c0 );
	float b = patCell( pattern, xz, c1, px / c1 );
	return mix( a, b, k );
}
// The ground colour with its pattern marks: dark marks darken, light ones move towards white.
vec3 habApplyPattern( vec3 c, float pattern, float cover ) {
	if ( cover <= 0.0 ) return c;
	bool light = abs( pattern - ${f(PATTERN_DASHES)} ) < 0.5;
	return light ? mix( c, vec3( 1.0 ), ${f(PATTERN_LIGHT)} * cover ) : c * ( 1.0 - ${f(PATTERN_DARK)} * cover );
}
`;
