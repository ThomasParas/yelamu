/**
 * Shareable view state, kept in the URL hash (e.g. `#x=123.4&z=-56.7&k=3.20&r=1&l=streets,landmarks`).
 * Everything here is pure: no DOM, no three.js.
 */
export interface AppState {
  /** Camera target, world metres (+x east, +z south, same frame as terrainMesh.ts). */
  x: number;
  z: number;
  /** Orthographic camera zoom. */
  zoom: number;
  /** Quarter turns of the camera around the target, in half steps: 0, 0.5, ... 3.5. */
  rot: number;
  /**
   * Ids of enabled optional layers, sorted. `undefined` means "not specified" (the app
   * uses each layer's default); `[]` means "every optional layer is off" and is written as `l=`.
   */
  layers?: string[];
  /** Id of the selected hotspot or landmark, written as `p=<id>`. */
  place?: string;
}

export const MAX_LAYERS = 12;
export const MAX_PLACE_ID_CHARS = 48;
/** Hash text beyond this many characters is ignored, so a hostile link cannot make us loop long. */
const MAX_HASH_CHARS = 4096;

const LAYER_ID = /^[a-z0-9-]+$/;
const PLACE_ID = /^[a-z0-9][a-z0-9-]*$/;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/** Turns per rotation step: a half quarter turn, so the view snaps every 45 degrees. */
export const ROT_UNIT = 0.5;

/**
 * Snap to the nearest half quarter turn and wrap into 0..3.5 (negatives and huge values too).
 * Whole numbers are the four diagonal views, as in links shared before 8 views existed.
 */
export function normalizeRot(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const steps = Math.round(n / ROT_UNIT);
  return (((steps % 8) + 8) % 8) * ROT_UNIT || 0;
}

/** Valid ids only, de-duplicated, at most MAX_LAYERS (first ones win), then sorted. */
export function cleanLayers(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || !LAYER_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    if (seen.size >= MAX_LAYERS) break;
  }
  return [...seen].sort();
}

/** True for an id that may be written to / read from `p=`. */
export function isPlaceId(id: unknown): id is string {
  return typeof id === "string" && id.length <= MAX_PLACE_ID_CHARS && PLACE_ID.test(id);
}

function fixed(n: number, decimals: number): string {
  const s = n.toFixed(decimals);
  // toFixed keeps the sign of tiny negatives ("-0.0"); never write a negative zero.
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

/** Compact hash text WITHOUT the leading '#'. Non-finite numbers are left out. */
export function encodeState(s: AppState): string {
  const parts: string[] = [];
  if (Number.isFinite(s.x)) parts.push(`x=${fixed(s.x, 1)}`);
  if (Number.isFinite(s.z)) parts.push(`z=${fixed(s.z, 1)}`);
  if (Number.isFinite(s.zoom)) parts.push(`k=${fixed(s.zoom, 2)}`);
  if (Number.isFinite(s.rot)) parts.push(`r=${normalizeRot(s.rot)}`);
  // Unset layers are left out; an explicit empty selection is written as an empty `l=`.
  if (s.layers !== undefined) parts.push(`l=${cleanLayers(s.layers).join(",")}`);
  if (isPlaceId(s.place)) parts.push(`p=${s.place}`);
  return parts.join("&");
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function parseNumber(v: string): number | undefined {
  const t = v.trim();
  if (!NUMBER.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Tolerant parse of a location hash. Accepts a leading '#', ignores unknown keys, drops
 * values that are not finite numbers, snaps r to 0..3.5 and filters layer ids. A repeated
 * key takes its last VALID value. Never throws; returns only what it could read.
 * `layers` is present (possibly `[]`) only when the hash has an `l` key.
 * Huge-but-finite numbers are returned as is: the view rig clamps them to the map.
 */
export function decodeState(hash: string): Partial<AppState> {
  const out: Partial<AppState> = {};
  if (typeof hash !== "string") return out;
  let text = hash.length > MAX_HASH_CHARS ? hash.slice(0, MAX_HASH_CHARS) : hash;
  if (text.startsWith("#")) text = text.slice(1);

  for (const pair of text.split("&")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const key = pair.slice(0, eq);
    const value = safeDecode(pair.slice(eq + 1));
    switch (key) {
      case "x":
      case "z": {
        const n = parseNumber(value);
        if (n !== undefined) out[key] = n;
        break;
      }
      case "k": {
        const n = parseNumber(value);
        if (n !== undefined) out.zoom = n;
        break;
      }
      case "r": {
        const n = parseNumber(value);
        if (n !== undefined) out.rot = normalizeRot(n);
        break;
      }
      case "l":
        out.layers = cleanLayers(value.split(","));
        break;
      case "p":
        if (isPlaceId(value)) out.place = value;
        break;
      default:
        break;
    }
  }
  return out;
}
