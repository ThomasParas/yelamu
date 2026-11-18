/** Local search over place names. Pure: no DOM. */

export type SearchGroup = "hotspot" | "village" | "landmark" | "street";

export interface SearchItem {
  id: string;
  name: string;
  group: SearchGroup;
  kind: string;
  x: number;
  z: number;
}

interface Entry {
  item: SearchItem;
  norm: string;
}

export interface SearchIndex {
  entries: Entry[];
}

export const MIN_QUERY_CHARS = 2;
const GROUP_WEIGHT: Record<SearchGroup, number> = { hotspot: 0, village: 1, landmark: 2, street: 3 };

/**
 * Lowercase, strip diacritics, drop apostrophes, turn every other run of punctuation and
 * whitespace into one space, trim. "St. Mary's  Square" -> "st marys square".
 */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function weight(group: SearchGroup): number {
  return Object.hasOwn(GROUP_WEIGHT, group) ? GROUP_WEIGHT[group] : 9;
}

/**
 * Index the items. Items whose normalised names are equal collapse to one: the best group
 * (hotspot, village, landmark, street) wins, then the first in input order. Items with an empty
 * normalised name are skipped.
 */
export function buildSearchIndex(items: readonly SearchItem[]): SearchIndex {
  const best = new Map<string, Entry>();
  for (const item of items) {
    const norm = normalize(item.name);
    if (norm === "") continue;
    const have = best.get(norm);
    if (!have || weight(item.group) < weight(have.item.group)) best.set(norm, { item, norm });
  }
  return { entries: [...best.values()] };
}

/** 0 exact, 1 name prefix, 2 word prefix, 3 substring, or -1 for no match. */
function tier(norm: string, q: string): number {
  if (norm === q) return 0;
  if (norm.startsWith(q)) return 1;
  if (norm.includes(` ${q}`)) return 2;
  if (norm.includes(q)) return 3;
  return -1;
}

/**
 * Best matches for a query, at most `limit`. Rank: exact name, name prefix, word prefix,
 * substring; ties go to hotspots, then village sites, then landmarks, then streets, then the shorter name,
 * then alphabetical order (then id). A query shorter than 2 characters finds nothing.
 */
export function search(index: SearchIndex, query: string, limit = 8): SearchItem[] {
  const q = normalize(query);
  if (q.length < MIN_QUERY_CHARS || !(limit > 0)) return [];
  const hits: Array<{ e: Entry; t: number }> = [];
  for (const e of index.entries) {
    const t = tier(e.norm, q);
    if (t >= 0) hits.push({ e, t });
  }
  hits.sort(
    (a, b) =>
      a.t - b.t ||
      weight(a.e.item.group) - weight(b.e.item.group) ||
      a.e.norm.length - b.e.norm.length ||
      (a.e.norm < b.e.norm ? -1 : a.e.norm > b.e.norm ? 1 : 0) ||
      (a.e.item.id < b.e.item.id ? -1 : a.e.item.id > b.e.item.id ? 1 : 0),
  );
  return hits.slice(0, Math.floor(limit)).map((h) => h.e.item);
}

const GROUP_LABEL: Record<SearchGroup, string> = {
  hotspot: "Hotspot",
  village: "Village site",
  landmark: "Landmark",
  street: "Street",
};

/** Small secondary label for a result: "Hotspot · creek", "Landmark · park", "Village site", "Street". */
export function searchMetaLabel(item: SearchItem): string {
  const group = Object.hasOwn(GROUP_LABEL, item.group) ? GROUP_LABEL[item.group] : item.group;
  return item.group === "street" || item.group === "village" || !item.kind ? group : `${group} · ${item.kind}`;
}
