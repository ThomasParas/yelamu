/**
 * Colours of the creek layers: one dark water-blue family for both, told apart by width and
 * opacity (the modelled streams are thinner and fainter). uiColors.test.ts checks them against the
 * ground colours (not the open-water blue: a creek that ends in a pond has nothing to stand out
 * from there) and checks that ui.css holds the same values for the Legend swatches.
 * The blue is darker than the sea's (water/waterMaterial.ts) on purpose: a mid blue disappears
 * on the grey-green marsh and wetland ground.
 */
export const CREEK_COLOR = 0x153f5e;
export const CREEK_OPACITY = 0.95;
export const MODELLED_COLOR = 0x153f5e;
export const MODELLED_OPACITY = 0.7;

/**
 * Ribbon widths, metres. A creek must stay visible at the opening zoom (about 38 px per km across
 * the city there, so 26 m is one pixel), which makes these far wider than a real creek and wider than
 * a street. They look heavy only at the closest zoom (about 12 px at zoom 12). Looked at in a browser, 2026-11-18.
 */
export const CREEK_WIDTH_M = 26;
/** Modelled channels by Strahler order: order 3, order 4, order 5 and up. */
export const MODELLED_WIDTH_M = { 3: 13, 4: 18, 5: 22 } as const;

/** Metres a ribbon floats above max(ground, water): above the villages' 5 m would hide them, so 3. */
export const CREEK_LIFT_M = 3;
/** Longest horizontal gap between draped points, metres. */
export const CREEK_STEP_M = 20;
/** Draws after the sea and ponds (renderOrder 0 and 1) and the village discs (1.2, 1.4), before the streets (2). */
export const CREEK_RENDER_ORDER = 1.6;
