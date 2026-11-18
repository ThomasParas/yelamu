/** About-dialog wording that depends on the dataset. Pure strings and a chooser, so tests need no DOM. */

/** Today's sentence, kept for datasets without village sites. */
export const ABOUT_LAND_AND_WATER_ONLY =
  "This map shows land and water only. It does not depict villages, people or sacred sites.";

// Wording approved by the owner on 2026-11-18
/** Replaces ABOUT_LAND_AND_WATER_ONLY when the dataset marks the primary Yelamu villages. */
export const ABOUT_VILLAGES =
  "The map marks the general locations of the five primary Yelamu villages named by SFEI's Hidden Nature SF, " +
  "because leaving them out would erase the people who lived here. The locations are approximate. " +
  "The map does not depict people, and it does not show burial or sacred sites.";

export function aboutPeopleSentence(villages: boolean | undefined): string {
  return villages ? ABOUT_VILLAGES : ABOUT_LAND_AND_WATER_ONLY;
}
