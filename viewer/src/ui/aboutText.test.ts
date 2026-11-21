import { describe, expect, it } from "vitest";
import {
  ABOUT_BYLINE_LEAD,
  ABOUT_BYLINE_NAME,
  ABOUT_BYLINE_TAIL,
  ABOUT_BYLINE_URL,
  ABOUT_LAND_AND_WATER_ONLY,
  ABOUT_NAME_LINK_TEXT,
  ABOUT_NAME_SOURCE_LEAD,
  ABOUT_NAME_TEXT,
  ABOUT_NAME_URL,
  ABOUT_VILLAGES,
  aboutPeopleSentence,
} from "./aboutText";

describe("About: the byline at the very end", () => {
  it("reads 'Built by Thomas Paras.' with the name as the link text", () => {
    expect(ABOUT_BYLINE_LEAD + ABOUT_BYLINE_NAME + ABOUT_BYLINE_TAIL).toBe("Built by Thomas Paras.");
    expect(ABOUT_BYLINE_NAME).toBe("Thomas Paras");
  });

  it("links the name to the owner's site over https", () => {
    expect(ABOUT_BYLINE_URL).toBe("https://thomasparas.com/");
    expect(new URL(ABOUT_BYLINE_URL).protocol).toBe("https:");
  });
});

describe("About: the name paragraph", () => {
  it("uses the exact wording the owner approved on 2026-11-20", () => {
    expect(ABOUT_NAME_TEXT + ABOUT_NAME_SOURCE_LEAD + ABOUT_NAME_LINK_TEXT + ".").toBe(
      'About the name: "Yelamu" comes from the Mission Dolores registers, where it names a place, probably a ' +
        "village, whose location is unknown. In 1995 the anthropologist Randall Milliken used it as a cover term " +
        "for the villages and territory in what is now San Francisco County. There is no proof those villages formed " +
        'a single tribe, and the people are the Ramaytush. We use "Yelamu" only as the title of this map. ' +
        "Source: Association of Ramaytush Ohlone, Terminology.",
    );
  });

  it("links the Association's own terminology page over https", () => {
    expect(ABOUT_NAME_URL).toBe("https://www.ramaytush.org/terminology.html");
    expect(new URL(ABOUT_NAME_URL).protocol).toBe("https:");
  });

  it("never calls Yelamu a name for the people", () => {
    expect(ABOUT_NAME_TEXT).not.toMatch(/Yelamu (is|are) (the|a) (people|name of the people)/i);
    expect(ABOUT_NAME_TEXT).toContain("the people are the Ramaytush");
  });
});

describe("About: the villages sentence", () => {
  it("uses the exact wording the owner approved on 2026-11-19", () => {
    expect(ABOUT_VILLAGES).toBe(
      "The map marks the general locations of five villages named by SFEI's Hidden Nature SF, " +
        "because leaving them out would erase the people who lived here. The locations are approximate, " +
        "and the names and spellings are SFEI's, not official ones. We will update this map as better " +
        "information becomes available. The map does not depict people, and it does not show burial or sacred sites.",
    );
  });

  it("keeps today's sentence for datasets without villages", () => {
    expect(ABOUT_LAND_AND_WATER_ONLY).toBe(
      "This map shows land and water only. It does not depict villages, people or sacred sites.",
    );
  });

  it("chooses between them by the villages flag", () => {
    expect(aboutPeopleSentence(true)).toBe(ABOUT_VILLAGES);
    expect(aboutPeopleSentence(false)).toBe(ABOUT_LAND_AND_WATER_ONLY);
    expect(aboutPeopleSentence(undefined)).toBe(ABOUT_LAND_AND_WATER_ONLY);
  });

  it("never mixes the two: the village text does not claim land and water only", () => {
    expect(ABOUT_VILLAGES).not.toContain("land and water only");
    expect(ABOUT_VILLAGES).not.toContain("does not depict villages");
  });
});
