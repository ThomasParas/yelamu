/** Pure helpers for the Sources panel: human labels for the pipeline parameters. */

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
