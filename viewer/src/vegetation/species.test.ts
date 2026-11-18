import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { HabitatClass } from "../habitat";
import { mulberry32 } from "../randomLand";
import { VEGETATION_BY_GROUP } from "./placement";
import { SPECIES, SPECIES_BY_CLASS, SPECIES_BY_GROUP, SPEC_BY_CLASS, mixFor, pickSpecies, speciesTables } from "./species";

describe("species tables", () => {
  it("gives every group that grows plants a mix, and only known species", () => {
    for (const [group, spec] of Object.entries(VEGETATION_BY_GROUP)) {
      if (spec) expect(SPECIES_BY_GROUP[group], group).toBeDefined();
    }
    for (const mix of [...Object.values(SPECIES_BY_GROUP), ...Object.values(SPECIES_BY_CLASS)]) {
      for (const [sp, w] of mix) {
        expect(SPECIES).toContain(sp);
        expect(w).toBeGreaterThan(0);
      }
    }
  });

  it("prefers the class mix over the group mix", () => {
    expect(mixFor({ name: "Willow grove", group: "wetland" })).toBe(SPECIES_BY_CLASS["Willow grove"]);
    expect(mixFor({ name: "Fen", group: "wetland" })).toBe(SPECIES_BY_GROUP.wetland);
    expect(mixFor({ name: "Open bay", group: "water" })).toBeNull();
  });

  it("matches class names that exist in the shipped city data", () => {
    const meta = JSON.parse(readFileSync(new URL("../../public/assets/real-city/meta.json", import.meta.url), "utf8"));
    const names = new Set(meta.habitat_classes.map((c: HabitatClass) => c.name));
    for (const name of [...Object.keys(SPECIES_BY_CLASS), ...Object.keys(SPEC_BY_CLASS)]) {
      expect(names.has(name), name).toBe(true);
    }
  });

  it("picks species in proportion to their weights", () => {
    const mix = [
      ["oak", 0.8],
      ["bay", 0.2],
    ] as const;
    expect(pickSpecies(mix, 0)).toBe("oak");
    expect(pickSpecies(mix, 0.79)).toBe("oak");
    expect(pickSpecies(mix, 0.81)).toBe("bay");
    expect(pickSpecies(mix, 0.999999)).toBe("bay");
    const rng = mulberry32(4);
    let bays = 0;
    for (let i = 0; i < 5000; i++) if (pickSpecies(mix, rng()) === "bay") bays++;
    expect(bays / 5000).toBeGreaterThan(0.17);
    expect(bays / 5000).toBeLessThan(0.23);
  });

  it("builds lookups by class id", () => {
    const classes: HabitatClass[] = [
      { id: 3, name: "Coast live oak woodland", group: "woodland" },
      { id: 4, name: "Willow grove", group: "wetland" },
      { id: 5, name: "Fen", group: "wetland" },
      { id: 6, name: "Deep ocean/bay", group: "water" },
    ];
    const t = speciesTables(classes);
    expect(t.speciesFor(3, 0.1)).toBe("oak");
    expect(t.speciesFor(3, 0.95)).toBe("bay");
    expect(t.speciesFor(4, 0.5)).toBe("willow");
    expect(t.speciesFor(5, 0.5)).toBe("tule");
    expect(t.speciesFor(6, 0.5)).toBeNull();
    expect(t.speciesFor(99, 0.5)).toBeNull();
    expect(t.specForClass(4)?.kind).toBe("tree");
    expect(t.specForClass(5)).toBeUndefined();
  });
});
