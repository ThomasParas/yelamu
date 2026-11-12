/** Pure data for the Places panel: every hotspot and landmark, grouped and sorted by name. */

export interface PlaceEntry {
  id: string;
  name: string;
  /** Hotspot or landmark kind, e.g. "creek" or "hill". */
  kind: string;
}

export interface PlaceGroup {
  title: "Hotspots" | "Landmarks";
  items: PlaceEntry[];
}

const compare = (a: PlaceEntry, b: PlaceEntry) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function clean(list: ReadonlyArray<PlaceEntry>): PlaceEntry[] {
  const seen = new Set<string>();
  const out: PlaceEntry[] = [];
  for (const p of list) {
    if (!p.name.trim() || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ id: p.id, name: p.name, kind: p.kind });
  }
  return out.sort(compare);
}

/** Hotspots first, then landmarks; a group with no entries is left out. */
export function groupPlaces(
  hotspots: ReadonlyArray<PlaceEntry>,
  landmarks: ReadonlyArray<PlaceEntry>,
): PlaceGroup[] {
  const groups: PlaceGroup[] = [
    { title: "Hotspots", items: clean(hotspots) },
    { title: "Landmarks", items: clean(landmarks) },
  ];
  return groups.filter((g) => g.items.length > 0);
}

/** The screen-reader announcement when a place is selected. */
export function selectedAnnouncement(name: string): string {
  return `Selected: ${name}`;
}

/** The announcement for a layer toggle, e.g. "Streets on". */
export function layerAnnouncement(label: string, on: boolean): string {
  return `${label} ${on ? "on" : "off"}`;
}
