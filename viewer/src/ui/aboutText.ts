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

// Wording approved by the owner on 2026-11-20, after a reader asked what "Yelamu" means. Facts from the
// Association of Ramaytush Ohlone's "Terminology" page; it does not call Yelamu a name for the people.
/** The "About the name" paragraph: text, then "Source: Association of Ramaytush Ohlone, " + linked title + ".". */
export const ABOUT_NAME_TEXT =
  'About the name: "Yelamu" comes from the Mission Dolores registers, where it names a place, probably a ' +
  "village, whose location is unknown. In 1995 the anthropologist Randall Milliken used it as a cover term for " +
  "the villages and territory in what is now San Francisco County. There is no proof those villages formed a " +
  'single tribe, and the people are the Ramaytush. We use "Yelamu" only as the title of this map. ';
export const ABOUT_NAME_SOURCE_LEAD = "Source: Association of Ramaytush Ohlone, ";
export const ABOUT_NAME_LINK_TEXT = "Terminology";
export const ABOUT_NAME_URL = "https://www.ramaytush.org/terminology.html";

// Wording requested by the owner on 2026-11-18: "Built by Thomas Paras", the name a link to ThomasParas.com.
/** The byline at the very end of the About dialog: lead text, linked name, closing full stop. */
export const ABOUT_BYLINE_LEAD = "Built by ";
export const ABOUT_BYLINE_NAME = "Thomas Paras";
export const ABOUT_BYLINE_TAIL = ".";
export const ABOUT_BYLINE_URL = "https://thomasparas.com/";

export function aboutPeopleSentence(villages: boolean | undefined): string {
  return villages ? ABOUT_VILLAGES : ABOUT_LAND_AND_WATER_ONLY;
}
