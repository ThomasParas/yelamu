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
  ["marsh", "Tidal marsh"],
  ["mudflat", "Tidal mud flat"],
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
  "Beyond the area mapped for 1769, the grey ground is today's terrain and coastline, shown only for orientation. It is not a reconstruction.";

// Wording approved by the owner on 2026-11-18
// Reworded by the owner's approval on 2026-11-19
/** Legend "Map symbols" row for datasets that mark the village sites (`overlay_villages` > 0). */
export const VILLAGES_LEGEND_NOTE =
  "General locations of five villages named by SFEI, around the time of Spanish contact. Approximate; names and locations are not official.";

/** True when meta says the dataset has village sites. The field is never validated, so read it defensively. */
export function hasVillages(meta: { overlay_villages?: unknown } | null | undefined): boolean {
  const n = meta?.overlay_villages;
  return typeof n === "number" && n > 0;
}

// Wording approved by the owner on 2026-11-18
/** Legend "Map symbols" rows for the creek layers (`creeks_mapped` and `creeks_modelled` > 0). */
export const CREEKS_LEGEND_NOTE =
  "Creek lines mapped by SFEI's Hidden Nature SF from 19th-century maps and a historical elevation model. Approximate; most are inferred. Drawn wider than the real channel.";
export const MODELLED_LEGEND_NOTE =
  "Stream channels computed by SFEI from a historical elevation model, shown where no hand-mapped creek exists. Larger channels only. Computed, not observed. Drawn wider than the real channel.";

function positiveCount(n: unknown): boolean {
  return typeof n === "number" && n > 0;
}

/**
 * Rows of the Legend's "Map symbols" list as [icon kind, text]; the icon kind is the suffix of the
 * `legend__icon--*` CSS class. The village row appears only when the dataset has villages, the
 * creek rows only when it has those layers.
 */
export function symbolRows(
  meta: { overlay_villages?: unknown; creeks_mapped?: unknown; creeks_modelled?: unknown } | null | undefined,
): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["marker", "Hotspot: select it to read about the place."],
    ["label", "Text label: a landmark, mostly modern, shown for orientation. Positions are approximate."],
  ];
  if (hasVillages(meta)) rows.push(["village", VILLAGES_LEGEND_NOTE]);
  if (positiveCount(meta?.creeks_mapped)) rows.push(["creek", CREEKS_LEGEND_NOTE]);
  if (positiveCount(meta?.creeks_modelled)) rows.push(["modelled", MODELLED_LEGEND_NOTE]);
  rows.push(["street", "Thin dark line: a modern street, for orientation only."]);
  return rows;
}

/** Extra plain-text lines the Legend shows beneath the ground colours, depending on the dataset. */
export function legendNotes(meta: { ponds_file?: string | null; context_file?: string | null }): string[] {
  const notes: string[] = [];
  if (typeof meta.ponds_file === "string" && meta.ponds_file !== "") notes.push(PONDS_LEGEND_NOTE);
  if (typeof meta.context_file === "string" && meta.context_file !== "") notes.push(CONTEXT_LEGEND_NOTE);
  return notes;
}
