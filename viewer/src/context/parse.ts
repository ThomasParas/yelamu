import { decodeHeights, type HeightmapMeta, type LayerInfo } from "../heightmap";
import { CONFIDENCES } from "../overlay/types";
import type { ContextDoc, ContextPlace } from "./types";

/**
 * Protective caps. KEEP IN SYNC with pipeline/yelamu/context.py (MAX_PLACES, MAX_NAME_CHARS):
 * the pipeline refuses to write what this parser would reject.
 */
export const MAX_PLACES = 200;
export const MAX_NAME_CHARS = 120;
export const MAX_AXIS_VERTICES = 4000;
export const MAX_VERTICES = 4_000_000;
export const MAX_COORD_M = 1e6;
const ID = /^[a-z0-9][a-z0-9-]*$/;
const FILE = /^[A-Za-z0-9._-]+$/;

function fail(what: string): never {
  throw new Error(`context: ${what}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${what} must be a finite number`);
  return v;
}

function positive(v: unknown, what: string): number {
  const n = num(v, what);
  if (!(n > 0)) fail(`${what} must be greater than 0`);
  return n;
}

function int(v: unknown, what: string): number {
  const n = num(v, what);
  if (!Number.isInteger(n)) fail(`${what} must be an integer`);
  return n;
}

function coord(v: unknown, what: string): number {
  const n = num(v, what);
  if (Math.abs(n) > MAX_COORD_M) fail(`${what} is out of range (within ±1e6 metres), got ${n}`);
  return n;
}

function str(v: unknown, what: string, max: number): string {
  if (typeof v !== "string" || v.trim() === "" || v.length > max) fail(`${what} must be 1 to ${max} characters`);
  return v.trim();
}

function parseLayers(v: unknown): LayerInfo[] {
  if (!Array.isArray(v)) fail("layers must be an array");
  return v.map((l: unknown, i) => {
    if (!isRecord(l)) fail(`layers[${i}] must be an object`);
    const confidence = l.confidence;
    if (typeof confidence !== "string" || !(CONFIDENCES as readonly string[]).includes(confidence)) {
      fail(`layers[${i}].confidence must be one of ${CONFIDENCES.join(", ")}`);
    }
    return {
      id: str(l.id, `layers[${i}].id`, 60),
      source: str(l.source, `layers[${i}].source`, 600),
      confidence: confidence as LayerInfo["confidence"],
      attribution: str(l.attribution, `layers[${i}].attribution`, 300),
    };
  });
}

function parsePlaces(v: unknown): ContextPlace[] {
  if (!Array.isArray(v)) fail("places must be an array");
  if (v.length > MAX_PLACES) fail(`places has ${v.length} entries, more than the limit of ${MAX_PLACES}`);
  const seen = new Set<string>();
  return v.map((p: unknown, i) => {
    if (!isRecord(p)) fail(`places[${i}] must be an object`);
    const id = p.id;
    if (typeof id !== "string" || !ID.test(id)) fail(`places[${i}].id must be lower-case letters, digits and hyphens`);
    if (seen.has(id)) fail(`places[${i}]: duplicate id "${id}"`);
    seen.add(id);
    return {
      id,
      name: str(p.name, `places[${i}] (${id}) name`, MAX_NAME_CHARS),
      kind: str(p.kind, `places[${i}] (${id}) kind`, 30),
      lon: num(p.lon, `places[${i}] (${id}) lon`),
      lat: num(p.lat, `places[${i}] (${id}) lat`),
      x: coord(p.x, `places[${i}] (${id}) x`),
      z: coord(p.z, `places[${i}] (${id}) z`),
      ground_m: num(p.ground_m, `places[${i}] (${id}) ground_m`),
    };
  });
}

/** Validate untrusted context.json and return a clean copy. Throws an Error starting "context:". */
export function parseContext(raw: unknown): ContextDoc {
  if (!isRecord(raw)) fail("the file must be a JSON object");
  if (raw.version !== 1) fail(`unsupported version ${JSON.stringify(raw.version)} (expected 1)`);
  if (raw.heights_format !== "uint16-le") fail(`unsupported heights_format ${JSON.stringify(raw.heights_format)}`);
  if (typeof raw.heights_file !== "string" || !FILE.test(raw.heights_file)) fail("heights_file must be a plain file name");
  const cols = int(raw.cols, "cols");
  const rows = int(raw.rows, "rows");
  if (cols < 2 || rows < 2) fail("cols and rows must be at least 2");
  if (cols > MAX_AXIS_VERTICES || rows > MAX_AXIS_VERTICES || cols * rows > MAX_VERTICES) {
    fail(`${cols} x ${rows} vertices is more than the limit`);
  }
  if (!isRecord(raw.hole)) fail("hole must be an object");
  const hole = {
    i0: int(raw.hole.i0, "hole.i0"),
    i1: int(raw.hole.i1, "hole.i1"),
    j0: int(raw.hole.j0, "hole.j0"),
    j1: int(raw.hole.j1, "hole.j1"),
  };
  if (!(0 <= hole.i0 && hole.i0 < hole.i1 && hole.i1 <= cols - 1 && 0 <= hole.j0 && hole.j0 < hole.j1 && hole.j1 <= rows - 1)) {
    fail("the hole must be a non-empty range of cells inside the lattice");
  }
  const min_m = num(raw.min_m, "min_m");
  const max_m = num(raw.max_m, "max_m");
  if (!(max_m > min_m)) fail("max_m must be greater than min_m");
  return {
    version: 1,
    heights_file: raw.heights_file,
    cols,
    rows,
    x0: coord(raw.x0, "x0"),
    z0: coord(raw.z0, "z0"),
    dx: positive(raw.dx, "dx"),
    dz: positive(raw.dz, "dz"),
    hole,
    min_m,
    max_m,
    water_level_m: num(raw.water_level_m, "water_level_m"),
    bay_floor_m: num(raw.bay_floor_m, "bay_floor_m"),
    layers: parseLayers(raw.layers),
    places: parsePlaces(raw.places),
  };
}

async function fetchChecked(url: string, fetchFn: typeof fetch): Promise<Response> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: HTTP ${res.status}`);
  return res;
}

/** The ring description, or null when the dataset has none. Throws on a fetch or validation failure. */
export async function loadContextDoc(
  baseUrl: string,
  meta: Pick<HeightmapMeta, "context_file">,
  fetchFn: typeof fetch = fetch,
): Promise<ContextDoc | null> {
  if (!meta.context_file) return null;
  if (!FILE.test(meta.context_file)) throw new Error("context: context_file must be a plain file name");
  const res = await fetchChecked(`${baseUrl}/${meta.context_file}`, fetchFn);
  return parseContext(await res.json());
}

/** Ring heights in metres, row-major, row 0 = north (the lattice layout of ContextDoc). */
export async function loadContextHeights(
  baseUrl: string,
  doc: ContextDoc,
  fetchFn: typeof fetch = fetch,
): Promise<Float32Array> {
  const url = `${baseUrl}/${doc.heights_file}`;
  const buffer = await (await fetchChecked(url, fetchFn)).arrayBuffer();
  const count = doc.cols * doc.rows;
  if (buffer.byteLength !== count * 2) {
    throw new Error(`${url}: expected ${count * 2} bytes for ${doc.cols}x${doc.rows}, got ${buffer.byteLength}`);
  }
  const view = new DataView(buffer);
  const q = new Uint16Array(count);
  for (let i = 0; i < count; i++) q[i] = view.getUint16(i * 2, true);
  return decodeHeights(q, { width: doc.cols, height: doc.rows, min_m: doc.min_m, max_m: doc.max_m });
}
