/**
 * Which plant shape stands on which habitat: pure tables and a deterministic chooser, no
 * three.js. placement.ts decides WHERE plants go and how big (by habitat group, with a few
 * per-class overrides below); this file decides WHAT each one looks like.
 *
 * The habitat class (from SFEI Hidden Nature SF) is documented; the species mix inside a
 * patch is our illustration of that habitat's typical plants, not a survey of individuals.
 */
import type { HabitatClass } from "../habitat";
import type { VegSpec } from "./placement";

export const SPECIES = ["oak", "bay", "willow", "coyote-brush", "lupine", "tule", "marsh-reed"] as const;
export type Species = (typeof SPECIES)[number];

/** Weighted species mix: [species, weight] pairs (weights need not sum to 1). */
export type SpeciesMix = readonly (readonly [Species, number])[];

/** Mix per habitat group, used when the class name has no entry of its own. */
export const SPECIES_BY_GROUP: Readonly<Record<string, SpeciesMix>> = {
  woodland: [["oak", 1]],
  scrub: [["coyote-brush", 1]],
  grassland: [["coyote-brush", 1]],
  dune: [["lupine", 1]],
  wetland: [["tule", 1]],
  marsh: [["marsh-reed", 1]],
};

/** Mix per habitat class name (SFEI names), overriding the group mix. */
export const SPECIES_BY_CLASS: Readonly<Record<string, SpeciesMix>> = {
  "Coast live oak woodland": [
    ["oak", 0.8],
    ["bay", 0.2],
  ],
  "California Bay Woodland": [
    ["bay", 0.75],
    ["oak", 0.25],
  ],
  "Riparian woodland": [["willow", 1]],
  "Willow grove": [["willow", 1]],
};

/**
 * Placement overrides per class name. Willow thickets are classed as wetland by SFEI, whose
 * group default is a reed bed; willows are small trees, so they get tree spacing and size.
 */
export const SPEC_BY_CLASS: Readonly<Record<string, VegSpec>> = {
  "Riparian woodland": { kind: "tree", perHectare: 55, minScale: 5, maxScale: 9 },
  "Willow grove": { kind: "tree", perHectare: 65, minScale: 4, maxScale: 8 },
};

/** Species mix for a class: its own entry, else its group's, else none. */
export function mixFor(cls: Pick<HabitatClass, "name" | "group">): SpeciesMix | null {
  if (Object.hasOwn(SPECIES_BY_CLASS, cls.name)) return SPECIES_BY_CLASS[cls.name];
  if (Object.hasOwn(SPECIES_BY_GROUP, cls.group)) return SPECIES_BY_GROUP[cls.group];
  return null;
}

/** Pick from a mix with one uniform draw u in [0, 1). */
export function pickSpecies(mix: SpeciesMix, u: number): Species {
  const total = mix.reduce((s, [, w]) => s + w, 0);
  let t = u * total;
  for (const [sp, w] of mix) {
    if (t < w) return sp;
    t -= w;
  }
  return mix[mix.length - 1][0];
}

/**
 * Lookup functions for a class list: the species for (class id, one uniform draw), and the
 * placement override for a class id (undefined = use the group's spec).
 */
export function speciesTables(classes: readonly HabitatClass[]): {
  speciesFor: (classId: number, u: number) => Species | null;
  specForClass: (classId: number) => VegSpec | undefined;
} {
  const mixes = new Map<number, SpeciesMix | null>();
  const specs = new Map<number, VegSpec>();
  for (const c of classes) {
    mixes.set(c.id, mixFor(c));
    if (Object.hasOwn(SPEC_BY_CLASS, c.name)) specs.set(c.id, SPEC_BY_CLASS[c.name]);
  }
  return {
    speciesFor: (id, u) => {
      const mix = mixes.get(id);
      return mix ? pickSpecies(mix, u) : null;
    },
    specForClass: (id) => specs.get(id),
  };
}
