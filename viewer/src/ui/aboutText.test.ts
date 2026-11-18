import { describe, expect, it } from "vitest";
import { ABOUT_LAND_AND_WATER_ONLY, ABOUT_VILLAGES, aboutPeopleSentence } from "./aboutText";

describe("About: the villages sentence", () => {
  it("uses the exact wording the owner approved on 2026-11-18", () => {
    expect(ABOUT_VILLAGES).toBe(
      "The map marks the general locations of the five primary Yelamu villages named by SFEI's Hidden Nature SF, " +
        "because leaving them out would erase the people who lived here. The locations are approximate. " +
        "The map does not depict people, and it does not show burial or sacred sites.",
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
