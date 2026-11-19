/** About-dialog wording that depends on the dataset. Pure strings and a chooser, so tests need no DOM. */

/** Today's sentence, kept for datasets without village sites. */
export const ABOUT_LAND_AND_WATER_ONLY =
  "This map shows land and water only. It does not depict villages, people or sacred sites.";

// Wording approved by the owner on 2026-11-18
// Reworded by the owner's approval on 2026-11-19, after the Ramaytush Tribe's reply (names and locations not official).
/** Replaces ABOUT_LAND_AND_WATER_ONLY when the dataset marks the village sites. */
export const ABOUT_VILLAGES =
  "The map marks the general locations of five villages named by SFEI's Hidden Nature SF, " +
  "because leaving them out would erase the people who lived here. The locations are approximate, " +
  "and the names and spellings are SFEI's, not official ones. We will update this map as better " +
  "information becomes available. The map does not depict people, and it does not show burial or sacred sites.";

// Wording requested by the owner on 2026-11-18: "Built by Thomas Paras", the name a link to ThomasParas.com.
/** The byline at the very end of the About dialog: lead text, linked name, closing full stop. */
export const ABOUT_BYLINE_LEAD = "Built by ";
export const ABOUT_BYLINE_NAME = "Thomas Paras";
export const ABOUT_BYLINE_TAIL = ".";
export const ABOUT_BYLINE_URL = "https://thomasparas.com/";

export function aboutPeopleSentence(villages: boolean | undefined): string {
  return villages ? ABOUT_VILLAGES : ABOUT_LAND_AND_WATER_ONLY;
}
