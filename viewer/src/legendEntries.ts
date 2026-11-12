import { GROUP_COLORS, type HabitatClass } from "./habitat";

export interface LegendEntry {
  group: string;
  label: string;
  /** CSS colour like "#3f7fa6". */
  color: string;
}

/** Visitor-facing names for the habitat groups, in legend order. */
export const GROUP_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["water", "Bay, ocean and ponds"],
  ["marsh", "Tidal marsh and flats"],
  ["wetland", "Freshwater wetland and riparian"],
  ["beach", "Beach"],
  ["dune", "Dunes"],
  ["grassland", "Grassland"],
  ["scrub", "Scrub"],
  ["woodland", "Oak and bay woodland"],
  ["rock", "Rock"],
  ["unmapped", "Not yet reconstructed (modern terrain shown for context)"],
];

export function hexToCss(hex: number): string {
  return `#${(hex & 0xffffff).toString(16).padStart(6, "0")}`;
}

/**
 * Legend rows for the habitat groups that occur in `classes` (a class with an unknown
 * group counts as "unmapped", like the terrain colouring does). One row per group.
 */
export function legendEntries(classes: readonly HabitatClass[] | undefined): LegendEntry[] {
  const present = new Set<string>();
  for (const c of classes ?? []) {
    present.add(Object.hasOwn(GROUP_COLORS, c.group) ? c.group : "unmapped");
  }
  return GROUP_LABELS.filter(([group]) => present.has(group)).map(([group, label]) => ({
    group,
    label,
    color: hexToCss(GROUP_COLORS[group]),
  }));
}
