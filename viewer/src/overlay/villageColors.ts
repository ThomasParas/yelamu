/**
 * Colours of the village layer: a warm tan taken from SFEI's own map colour for the disc, a
 * dark brown for the outline and the label text. uiColors.test.ts checks all of them against
 * the ground colours, and checks that ui.css (--village-fg, --village-halo) holds the label values.
 *
 * Why the outline is dark and not a brighter tan: the ground colours run from woodland (dark)
 * to beach and dune (light), and a tan outline lighter than the disc measures 1.07 to 1.11:1
 * against beach and dune, so it would vanish there. A dark brown ring holds at least 1.8:1
 * against every ground colour (the bar streets are held to is 1.5:1), while the tan fill
 * keeps the soft "general location" look.
 */
export const VILLAGE_FILL = 0xcaaf8f;
export const VILLAGE_FILL_OPACITY = 0.45;
export const VILLAGE_FILL_SELECTED_OPACITY = 0.68;

export const VILLAGE_OUTLINE = 0x4a3418;
export const VILLAGE_OUTLINE_OPACITY = 0.9;
/** The selected village gets a darker, fully opaque ring. */
export const VILLAGE_OUTLINE_SELECTED = 0x2e2010;
export const VILLAGE_OUTLINE_SELECTED_OPACITY = 1;

/** Label text and the warm halo drawn around it so it reads over any ground colour. */
export const VILLAGE_LABEL_TEXT = 0x3b2a14;
export const VILLAGE_LABEL_HALO = 0xfff4e0;
export const VILLAGE_LABEL_HALO_ALPHA = 0.95;
