import type { Hotspot, Village } from "./types";

/** What the hotspot panel shows where a hotspot shows its kind ("creek", "marsh"). */
export const VILLAGE_KIND_TEXT = "Village site";

/** A place the hotspot panel can show: a hotspot, or a village with its kind text swapped in. */
export type PanelPlace = Omit<Hotspot, "kind"> & { kind: string };

/** A village as the hotspot panel wants it: same card, badge and sources, kind "Village site". */
export function villagePanelEntry(v: Village): PanelPlace {
  return { ...v, kind: VILLAGE_KIND_TEXT };
}
