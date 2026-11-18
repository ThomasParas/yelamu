import type { SearchItem } from "../search";
import type { Overlay, Street } from "./types";

/** Point halfway along a polyline's length (flat [x0, z0, x1, z1, ...]); null when it has no points. */
export function polylineMidpoint(line: readonly number[]): { x: number; z: number } | null {
  const n = Math.floor(line.length / 2);
  if (n < 1) return null;
  let total = 0;
  for (let i = 1; i < n; i++) total += Math.hypot(line[2 * i] - line[2 * i - 2], line[2 * i + 1] - line[2 * i - 1]);
  if (total === 0) return { x: line[0], z: line[1] };
  let remaining = total / 2;
  for (let i = 1; i < n; i++) {
    const len = Math.hypot(line[2 * i] - line[2 * i - 2], line[2 * i + 1] - line[2 * i - 1]);
    if (remaining <= len && len > 0) {
      const t = remaining / len;
      return {
        x: line[2 * i - 2] + (line[2 * i] - line[2 * i - 2]) * t,
        z: line[2 * i - 1] + (line[2 * i + 1] - line[2 * i - 1]) * t,
      };
    }
    remaining -= len;
  }
  return { x: line[2 * (n - 1)], z: line[2 * (n - 1) + 1] };
}

function lineLength(line: readonly number[]): number {
  let total = 0;
  for (let i = 2; i + 1 < line.length; i += 2) total += Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1]);
  return total;
}

/**
 * One search item per street NAME: a street that appears in several records (or with
 * several lines) is placed at the midpoint of its longest line. Ids are `street-<n>`.
 */
export function streetSearchItems(streets: readonly Street[]): SearchItem[] {
  const byName = new Map<string, { street: Street; line: readonly number[]; len: number }>();
  for (const street of streets) {
    const key = street.name.trim().toLowerCase();
    for (const line of street.lines) {
      const len = lineLength(line);
      const have = byName.get(key);
      if (!have || len > have.len) byName.set(key, { street, line, len });
    }
  }
  const items: SearchItem[] = [];
  let n = 0;
  for (const { street, line } of byName.values()) {
    const mid = polylineMidpoint(line);
    if (!mid) continue;
    items.push({ id: `street-${n++}`, name: street.name, group: "street", kind: street.kind, x: mid.x, z: mid.z });
  }
  return items;
}

/** Hotspots, village sites, landmarks and street names as search items. */
export function overlaySearchItems(overlay: Overlay): SearchItem[] {
  return [
    ...overlay.hotspots.map((h): SearchItem => ({ id: h.id, name: h.name, group: "hotspot", kind: h.kind, x: h.x, z: h.z })),
    ...overlay.villages.map((v): SearchItem => ({ id: v.id, name: v.name, group: "village", kind: "village", x: v.x, z: v.z })),
    ...overlay.landmarks.map((l): SearchItem => ({ id: l.id, name: l.name, group: "landmark", kind: l.kind, x: l.x, z: l.z })),
    ...streetSearchItems(overlay.streets),
  ];
}
