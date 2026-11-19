/** Pure helpers for the Sources panel: human labels for the pipeline parameters. */
import type { HandSource } from "./heightmap";

export interface ProcessingEntry {
  key: string;
  label: string;
  value: string;
}

interface Known {
  label: string;
  unit?: string;
}

const KNOWN: ReadonlyArray<readonly [string, Known]> = [
  ["smooth_m", { label: "Terrain smoothing distance", unit: "m" }],
  ["shelf_m", { label: "Width of the sloping bay floor at the shore", unit: "m" }],
  ["shore_slope", { label: "Steepest rise allowed for land beside the shore (metres per metre)" }],
  ["shore_open_cells", { label: "Piers and thin spits removed where narrower than", unit: "cells" }],
  ["open_water_max_m", { label: "Unmapped ground at or below this height counts as open bay", unit: "m" }],
  ["coverage", { label: "SFEI habitat map used to find unmapped areas" }],
];

const MAX_VALUE_CHARS = 200;

function humanize(key: string): string {
  const t = key.replace(/[_-]+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : key;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(4)));
}

/** Plain text for any JSON value, clipped so a huge value cannot flood the panel. */
export function formatValue(v: unknown): string {
  let text: string;
  if (typeof v === "number") text = formatNumber(v);
  else if (typeof v === "string") text = v;
  else if (typeof v === "boolean") text = v ? "yes" : "no";
  else if (v === null || v === undefined) text = "not recorded";
  else {
    try {
      text = JSON.stringify(v);
    } catch {
      text = String(v);
    }
  }
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS - 1)}…` : text;
}

/**
 * Labelled rows for `meta.processing`: known parameters first in a fixed order with
 * plain labels and units, then any others alphabetically with a humanised key.
 */
export function processingEntries(processing: Record<string, unknown> | undefined): ProcessingEntry[] {
  if (!processing || typeof processing !== "object") return [];
  const out: ProcessingEntry[] = [];
  const seen = new Set<string>();
  for (const [key, known] of KNOWN) {
    if (!Object.hasOwn(processing, key)) continue;
    seen.add(key);
    const raw = processing[key];
    const base = formatValue(raw);
    out.push({
      key,
      label: known.label,
      value: known.unit && typeof raw === "number" ? `${base} ${known.unit}` : base,
    });
  }
  for (const key of Object.keys(processing).sort()) {
    if (seen.has(key)) continue;
    out.push({ key, label: humanize(key), value: formatValue(processing[key]) });
  }
  return out;
}

export const OVERLAY_NOTE =
  "Modern streets: US Census Bureau TIGER/Line, approximate positions; landmarks are approximate.";

/** Shown on the Sources panel (and echoed in the Legend) whenever vegetation shapes can appear. */
export const VEGETATION_NOTE =
  "Vegetation shapes (trees, shrubs, reeds) are illustrative: they show the kind of plants, not individual plants.";

/** Shown above the hand-drawn and sculpted rows on the Sources panel. */
export const HAND_SOURCES_NOTE =
  "Features drawn or sculpted by hand for this map. Each row names its source and how sure we are.";

export interface HandSourceRow {
  /** The pipeline's layer id, e.g. "hand_water". */
  layer: string;
  /** Human label for the layer, e.g. "Hand-drawn water". */
  label: string;
  source: string;
  /** As given in the data; look it up with confidenceInfo (an unknown value is shown as-is). */
  confidence: string;
  /** "3 polygons", "1 landform"; empty when the count is missing or not a whole number. */
  countText: string;
}

/** Known layers, in display order: label, and the singular / plural noun for the count. */
const HAND_LAYERS: ReadonlyArray<readonly [string, { label: string; one: string; many: string }]> = [
  ["hand_water", { label: "Hand-drawn water", one: "polygon", many: "polygons" }],
  ["landforms", { label: "Sculpted landforms", one: "landform", many: "landforms" }],
  ["ponds", { label: "Ponds", one: "pond", many: "ponds" }],
  ["villages", { label: "Village sites", one: "village", many: "villages" }],
  ["creeks", { label: "Historical creeks", one: "line", many: "lines" }],
  ["modelled_streams", { label: "Modelled streams", one: "channel", many: "channels" }],
];
const MAX_LAYER_CHARS = 60;
// A Sources-panel source sentence may run longer than a generic value (the village note carries a caveat).
const MAX_SOURCE_CHARS = 300;

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Rows for `meta.hand_sources`: one per entry, with a human layer label, the source text, the
 * confidence and a count such as "3 polygons". Known layers come first in a fixed order, other
 * layers after them alphabetically by id (shown with a humanised id); within a layer rows
 * are sorted by source. Tolerant of junk: a non-array gives [], entries that are not objects or
 * have no layer id are dropped, a missing source reads "Source not recorded".
 */
export function handSourceRows(items: readonly HandSource[] | undefined): HandSourceRow[] {
  if (!Array.isArray(items)) return [];
  const known = new Map(HAND_LAYERS.map(([id, info], i) => [id, { info, order: i }] as const));
  const rows: Array<HandSourceRow & { order: number }> = [];
  for (const raw of items as unknown[]) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.layer !== "string" || item.layer.trim() === "") continue;
    const layer = item.layer;
    const entry = known.get(layer);
    const count = item.count;
    const noun = entry?.info ?? { one: "item", many: "items" };
    const countText =
      typeof count === "number" && Number.isSafeInteger(count) && count >= 0
        ? `${count} ${count === 1 ? noun.one : noun.many}`
        : "";
    const source = typeof item.source === "string" && item.source.trim() !== "" ? item.source : "Source not recorded";
    rows.push({
      layer,
      label: entry ? entry.info.label : clip(humanize(layer), MAX_LAYER_CHARS),
      source: clip(source, MAX_SOURCE_CHARS),
      confidence: typeof item.confidence === "string" ? item.confidence : "",
      countText,
      order: entry ? entry.order : HAND_LAYERS.length,
    });
  }
  rows.sort((a, b) => a.order - b.order || cmp(a.layer, b.layer) || cmp(a.source, b.source));
  return rows.map(({ order: _order, ...row }) => {
    void _order;
    return row;
  });
}
