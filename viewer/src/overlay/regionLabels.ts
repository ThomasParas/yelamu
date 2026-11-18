import type { ExtraPlace } from "../appContext";
import type { SearchItem } from "../search";

/** Ring place labels (towns beyond the 1769 map) are drawn only at or below this camera zoom. */
export const REGION_LABEL_MAX_ZOOM = 1.6;
/** Declutter priority of a ring label: above ordinary landmarks, below hotspots. */
export const REGION_PRIORITY = 58;
/** Zoom a search result or Places entry for a ring place flies to (never zooms out). */
export const REGION_PLACE_ZOOM = 1.2;

/** The label kinds to show this frame: `base` plus "region" when zoomed out and Landmarks is on. */
export function labelKindsFor(base: ReadonlySet<string>, zoom: number, landmarksOn: boolean): ReadonlySet<string> {
  if (!landmarksOn || !(zoom <= REGION_LABEL_MAX_ZOOM)) return base;
  const out = new Set(base);
  out.add("region");
  return out;
}

export function regionSearchItems(places: readonly ExtraPlace[]): SearchItem[] {
  return places.map((p): SearchItem => ({ id: p.id, name: p.name, group: "landmark", kind: p.kind, x: p.x, z: p.z }));
}
