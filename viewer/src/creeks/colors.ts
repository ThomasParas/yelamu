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
 * Close-up ribbon widths, metres: the thinnest a ribbon ever is. Seen from far away a ribbon this
 * thin is under a pixel (the opening view is about 38 px per km across the city), so width.ts widens
 * it with the zoom, in steps, until it is about the target width on the screen (below), up to
 * MAX_WIDTH_M. Close up these are what is drawn: still wider than a real creek, but a few pixels.
 * (A single fixed width of 26 / 13 / 18 / 22 m was tried first and looked like a river at zoom 12.)
 */
export const CREEK_WIDTH_M = 12;
/** Modelled channels by Strahler order: order 3, order 4, order 5 and up. */
export const MODELLED_WIDTH_M = { 3: 6, 4: 9, 5: 12 } as const;

/** Width on the screen, CSS pixels, a ribbon is widened to when the close-up width would be thinner. */
export const CREEK_TARGET_PX = 2.5;
export const MODELLED_TARGET_PX = { 3: 1.5, 4: 2, 5: 2.5 } as const;
/** Widths come in levels base * WIDTH_STEP^n, so a ribbon is rebuilt only when it must grow by about 30%. */
export const WIDTH_STEP = 1.3;
/** No ribbon is ever wider than this, metres, however far out the camera is. */
export const MAX_WIDTH_M = 160;

/** Metres a ribbon floats above max(ground, water): above the villages' 5 m would hide them, so 3. */
export const CREEK_LIFT_M = 3;
/** Longest horizontal gap between draped points, metres. */
export const CREEK_STEP_M = 20;
/** Draws after the sea and ponds (renderOrder 0 and 1) and the village discs (1.2, 1.4), before the streets (2). */
export const CREEK_RENDER_ORDER = 1.6;
