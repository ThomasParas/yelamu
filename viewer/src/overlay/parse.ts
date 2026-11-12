import type { HeightmapMeta } from "../heightmap";
import {
  CONFIDENCES,
  HOTSPOT_KINDS,
  LANDMARK_KINDS,
  STREET_KINDS,
  type Hotspot,
  type HotspotSource,
  type Landmark,
  type Overlay,
  type Street,
} from "./types";

/** Protective caps: a hostile or broken file must not be able to exhaust memory. */
export const MAX_STREETS = 6000;
export const MAX_STREET_POINTS = 400_000;
export const MAX_PLACES = 5000;
export const MAX_NAME_CHARS = 120;
export const MAX_SOURCES = 20;
/**
 * World coordinates (metres from the terrain centre) must stay within this. The real city
 * is ~20 km across; the cap keeps a hostile value from producing absurd geometry (e.g. a
 * street segment the drape step would subdivide into billions of points).
 */
export const MAX_COORD_M = 1e6;
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 400;

const ID = /^[a-z0-9][a-z0-9-]*$/;

function fail(where: string, what: string): never {
  throw new Error(`overlay: ${where}: ${what}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function finite(v: unknown, where: string, field: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(where, `${field} must be a finite number`);
  return v;
}

/** A finite world coordinate (x or z) within +-MAX_COORD_M metres. */
function worldCoord(v: unknown, where: string, field: string): number {
  const n = finite(v, where, field);
  if (Math.abs(n) > MAX_COORD_M) fail(where, `${field} must be within ±1e6 metres of the origin, got ${n}`);
  return n;
}

function name(v: unknown, where: string): string {
  if (typeof v !== "string" || v.trim() === "") fail(where, "name must be a non-empty string");
  if (v.length > MAX_NAME_CHARS) fail(where, `name is longer than ${MAX_NAME_CHARS} characters`);
  return v;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], where: string, field: string): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    fail(where, `${field} ${JSON.stringify(v)} is not one of ${allowed.join(", ")}`);
  }
  return v as T;
}

function section(raw: Record<string, unknown>, key: string, max: number): unknown[] {
  const v = raw[key];
  if (!Array.isArray(v)) fail(key, "must be an array");
  if (v.length > max) fail(key, `has ${v.length} entries, more than the limit of ${max}`);
  return v;
}

/** Ids must be unique across landmarks AND hotspots: the viewer keys places by id alone. */
function placeId(v: unknown, where: string, seen: Map<string, string>): string {
  if (typeof v !== "string" || !ID.test(v)) {
    fail(where, `id ${JSON.stringify(v)} must match ${ID.source}`);
  }
  const first = seen.get(v);
  if (first !== undefined) fail(where, `duplicate id "${v}" (already used by ${first})`);
  seen.set(v, where);
  return v;
}

function parseStreets(raw: Record<string, unknown>): Street[] {
  const list = section(raw, "streets", MAX_STREETS);
  let points = 0;
  return list.map((s, i) => {
    const where = `streets[${i}]`;
    if (!isRecord(s)) fail(where, "must be an object");
    const label = typeof s.name === "string" ? `${where} ("${s.name.slice(0, 40)}")` : where;
    const streetName = name(s.name, label);
    const kind = oneOf(s.kind, STREET_KINDS, label, "kind");
    if (!Array.isArray(s.lines)) fail(label, "lines must be an array");
    const lines = s.lines.map((line: unknown, j: number) => {
      const lw = `${label} line ${j}`;
      if (!Array.isArray(line)) fail(lw, "must be an array of numbers");
      if (line.length % 2 !== 0) fail(lw, `has an odd number of values (${line.length})`);
      if (line.length < 4) fail(lw, `needs at least 2 points, has ${line.length / 2}`);
      points += line.length / 2;
      if (points > MAX_STREET_POINTS) {
        fail(label, `streets hold more than ${MAX_STREET_POINTS} points in total`);
      }
      const out = new Array<number>(line.length);
      for (let k = 0; k < line.length; k++) {
        const n: unknown = line[k];
        if (typeof n !== "number" || !Number.isFinite(n)) {
          fail(lw, `value ${k} is not a finite number`);
        }
        if (Math.abs(n) > MAX_COORD_M) {
          fail(lw, `value ${k} is out of range (must be within ±1e6 metres), got ${n}`);
        }
        out[k] = n;
      }
      return out;
    });
    return { name: streetName, kind, lines };
  });
}

function parseLandmarks(raw: Record<string, unknown>, seen: Map<string, string>): Landmark[] {
  const list = section(raw, "landmarks", MAX_PLACES);
  return list.map((l, i) => {
    const where = `landmarks[${i}]`;
    if (!isRecord(l)) fail(where, "must be an object");
    const id = placeId(l.id, where, seen);
    const label = `${where} (${id})`;
    return {
      id,
      name: name(l.name, label),
      kind: oneOf(l.kind, LANDMARK_KINDS, label, "kind"),
      x: worldCoord(l.x, label, "x"),
      z: worldCoord(l.z, label, "z"),
      lon: finite(l.lon, label, "lon"),
      lat: finite(l.lat, label, "lat"),
    };
  });
}

function parseSources(v: unknown, label: string): HotspotSource[] {
  if (!Array.isArray(v) || v.length === 0) fail(label, "sources must be a non-empty array");
  if (v.length > MAX_SOURCES) fail(label, `has more than ${MAX_SOURCES} sources`);
  return v.map((s: unknown, k: number) => {
    const sw = `${label} source ${k}`;
    if (!isRecord(s)) fail(sw, "must be an object");
    if (typeof s.title !== "string" || s.title.trim() === "") fail(sw, "title must not be blank");
    if (typeof s.url !== "string") fail(sw, "url must be a string");
    let protocol = "";
    try {
      protocol = new URL(s.url).protocol;
    } catch {
      fail(sw, `url ${JSON.stringify(s.url.slice(0, 80))} is not a valid URL`);
    }
    if (protocol !== "http:" && protocol !== "https:") {
      fail(sw, `url must be http or https, got ${protocol}`);
    }
    return { title: s.title, url: s.url };
  });
}

function parseHotspots(raw: Record<string, unknown>, seen: Map<string, string>): Hotspot[] {
  const list = section(raw, "hotspots", MAX_PLACES);
  return list.map((h, i) => {
    const where = `hotspots[${i}]`;
    if (!isRecord(h)) fail(where, "must be an object");
    const id = placeId(h.id, where, seen);
    const label = `${where} (${id})`;
    const description = h.description;
    if (
      typeof description !== "string" ||
      description.length < DESCRIPTION_MIN ||
      description.length > DESCRIPTION_MAX
    ) {
      const len = typeof description === "string" ? description.length : "not a string";
      fail(label, `description must be ${DESCRIPTION_MIN} to ${DESCRIPTION_MAX} characters (got ${len})`);
    }
    return {
      id,
      name: name(h.name, label),
      kind: oneOf(h.kind, HOTSPOT_KINDS, label, "kind"),
      x: worldCoord(h.x, label, "x"),
      z: worldCoord(h.z, label, "z"),
      lon: finite(h.lon, label, "lon"),
      lat: finite(h.lat, label, "lat"),
      description,
      sources: parseSources(h.sources, label),
      confidence: oneOf(h.confidence, CONFIDENCES, label, "confidence"),
    };
  });
}

/**
 * Validate untrusted overlay JSON and return a clean copy (only the known fields).
 * Throws an Error naming the offending section, index and id.
 */
export function parseOverlay(raw: unknown): Overlay {
  if (!isRecord(raw)) throw new Error("overlay: the file must be a JSON object");
  if (raw.version !== 1) {
    throw new Error(`overlay: unsupported version ${JSON.stringify(raw.version)} (expected 1)`);
  }
  const ids = new Map<string, string>();
  return {
    version: 1,
    streets: parseStreets(raw),
    landmarks: parseLandmarks(raw, ids),
    hotspots: parseHotspots(raw, ids),
  };
}

type FetchLike = (url: string) => Promise<Pick<Response, "ok" | "status" | "json">>;

/**
 * Fetch and validate the overlay named by `meta.overlay_file` next to the heightmap.
 * Resolves null when the dataset has no overlay. Rejects with the URL (and HTTP status)
 * on a failed request, or with the parser's message on bad content.
 */
export async function loadOverlay(
  baseUrl: string,
  meta: Pick<HeightmapMeta, "overlay_file">,
  fetchFn: FetchLike = (u) => fetch(u),
): Promise<Overlay | null> {
  const file = meta.overlay_file;
  if (file === undefined || file === null || file === "") return null;
  if (typeof file !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(file) || file.includes("..")) {
    throw new Error(`overlay: unsupported overlay_file ${JSON.stringify(file)}`);
  }
  const url = `${baseUrl}/${file}`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: HTTP ${res.status}`);
  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new Error(`${url}: not valid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  try {
    return parseOverlay(json);
  } catch (err) {
    throw new Error(`${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
