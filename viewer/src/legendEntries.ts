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
  ["unmapped", "Not covered by the historical habitat map (modern terrain shown for context)"],
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

/** Legend line for datasets that draw ponds (those with `ponds_file`). Plain text, no colour of its own. */
export const PONDS_LEGEND_NOTE = "Ponds and lagoons sit at their own water level.";

// Wording approved by the owner on 2026-11-17
/** Legend line for datasets with the grey surrounding terrain (those with `context_file`). */
export const CONTEXT_LEGEND_NOTE =
  "Beyond the area mapped for 1769, the grey-brown ground is today's terrain and coastline, shown only for orientation. It is not a reconstruction.";

/** Extra plain-text lines the Legend shows beneath the ground colours, depending on the dataset. */
export function legendNotes(meta: { ponds_file?: string | null; context_file?: string | null }): string[] {
  const notes: string[] = [];
  if (typeof meta.ponds_file === "string" && meta.ponds_file !== "") notes.push(PONDS_LEGEND_NOTE);
  if (typeof meta.context_file === "string" && meta.context_file !== "") notes.push(CONTEXT_LEGEND_NOTE);
  return notes;
}
