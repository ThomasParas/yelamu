import { describe, expect, it } from "vitest";
import type { Village } from "./types";
import { VILLAGE_KIND_TEXT, villagePanelEntry } from "./villageSite";

const v: Village = {
  id: "village-chutchui",
  name: "Chutchui",
  x: 1,
  z: 2,
  lon: -122.4,
  lat: 37.77,
  radius_m: 530,
  description: "General location of a Yelamu village site along Mission Creek.",
  sources: [{ title: "SFEI Hidden Nature SF", url: "https://example.org/sfei" }],
  confidence: "inferred",
};

describe("villagePanelEntry", () => {
  it("gives the hotspot panel the kind text 'Village site' and keeps the card, badge and sources", () => {
    expect(VILLAGE_KIND_TEXT).toBe("Village site");
    const entry = villagePanelEntry(v);
    expect(entry.kind).toBe("Village site");
    expect(entry.name).toBe("Chutchui");
    expect(entry.description).toBe(v.description);
    expect(entry.confidence).toBe("inferred");
    expect(entry.sources).toEqual(v.sources);
  });
});
