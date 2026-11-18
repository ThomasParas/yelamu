import type { ExtraPlace } from "../appContext";
import type { SearchItem } from "../search";

/** Ring place labels (towns beyond the 1769 map) are drawn only at or below this camera zoom. */
export const REGION_LABEL_MAX_ZOOM = 1.6;
/** Declutter priority of a ring label: above ordinary landmarks, below hotspots. */
export const REGION_PRIORITY = 58;
/** Zoom a search result or Places entry for a ring place flies to (exactly this, in or out). */
export const REGION_PLACE_ZOOM = 1.2;

/**
 * The label kinds the enabled layers switch on: landmark and hotspot labels with their layers,
 * and village names with the Village sites layer (they are never hidden by zoom, see labelKindsFor).
 */
export function baseLabelKinds(isOn: (layerId: string) => boolean): Set<string> {
  const kinds = new Set<string>();
  if (isOn("landmarks")) kinds.add("landmark");
  if (isOn("hotspots")) kinds.add("hotspot");
  if (isOn("villages")) kinds.add("village");
  return kinds;
}

/**
 * The label kinds to show this frame: `base` plus "region" when Landmarks is on and the camera is
 * zoomed out, or whenever `forceRegion` is set (a ring place is selected, so its label must show).
 * Kinds already in `base` (including "village") are kept at every zoom.
 */
export function labelKindsFor(
  base: ReadonlySet<string>,
  zoom: number,
  landmarksOn: boolean,
  forceRegion = false,
): ReadonlySet<string> {
  if (!landmarksOn || !(forceRegion || zoom <= REGION_LABEL_MAX_ZOOM)) return base;
  const out = new Set(base);
  out.add("region");
  return out;
}

export function regionSearchItems(places: readonly ExtraPlace[]): SearchItem[] {
  return places.map((p): SearchItem => ({ id: p.id, name: p.name, group: "landmark", kind: p.kind, x: p.x, z: p.z }));
}
