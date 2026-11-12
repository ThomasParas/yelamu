import type { HeightmapMeta } from "../heightmap";
import { CONFIDENCES } from "../overlay/types";
import type { Pond, Ponds } from "./types";

/**
 * Protective caps: a hostile or broken file must not be able to exhaust memory.
 * KEEP IN SYNC with pipeline/yelamu/ponds.py (MAX_PONDS ... MAX_LEVEL_M and the id pattern):
 * the pipeline refuses to write a ponds.json this parser would reject, and a pipeline test
 * reads this file and fails when the numbers differ.
 */
export const MAX_PONDS = 2000;
export const MAX_POND_POINTS = 400_000;
export const MAX_NAME_CHARS = 120;
export const MAX_SOURCE_CHARS = 300;
/** World coordinates (metres from the terrain centre) must stay within this. */
export const MAX_COORD_M = 1e6;
/** Water levels in real metres; anything outside is a pipeline mistake, not a lake. */
export const MIN_LEVEL_M = -100;
export const MAX_LEVEL_M = 1000;

const ID = /^[a-z0-9][a-z0-9-]*$/;

function fail(where: string, what: string): never {
  throw new Error(`ponds: ${where}: ${what}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseRings(v: unknown, label: string, budget: { points: number }): number[][] {
  if (!Array.isArray(v) || v.length === 0) fail(label, "rings must be a non-empty array");
  return v.map((ring: unknown, j: number) => {
    const rw = `${label} ring ${j}`;
    if (!Array.isArray(ring)) fail(rw, "must be a flat array of numbers");
    if (ring.length % 2 !== 0) fail(rw, `has an odd number of values (${ring.length})`);
    if (ring.length < 6) fail(rw, `needs at least 3 points, has ${ring.length / 2}`);
    budget.points += ring.length / 2;
    if (budget.points > MAX_POND_POINTS) {
      fail(label, `ponds hold more than ${MAX_POND_POINTS} ring points in total`);
    }
    const out = new Array<number>(ring.length);
    for (let k = 0; k < ring.length; k++) {
      const n: unknown = ring[k];
      if (typeof n !== "number" || !Number.isFinite(n)) fail(rw, `value ${k} is not a finite number`);
      if (Math.abs(n) > MAX_COORD_M) {
        fail(rw, `value ${k} is out of range (must be within ±1e6 metres), got ${n}`);
      }
      out[k] = n;
    }
    return out;
  });
}

/**
 * Validate untrusted ponds JSON and return a clean copy (only the known fields; the
 * pipeline's `processing` block and anything else is dropped). A name that is only
 * whitespace becomes null. Throws an Error naming the pond index and id.
 */
export function parsePonds(raw: unknown): Ponds {
  if (!isRecord(raw)) throw new Error("ponds: the file must be a JSON object");
  if (raw.version !== 1) {
    throw new Error(`ponds: unsupported version ${JSON.stringify(raw.version)} (expected 1)`);
  }
  const list = raw.ponds;
  if (!Array.isArray(list)) fail("ponds", "must be an array");
  if (list.length > MAX_PONDS) fail("ponds", `has ${list.length} entries, more than the limit of ${MAX_PONDS}`);

  const seen = new Map<string, number>();
  const budget = { points: 0 };
  const ponds = list.map((p: unknown, i: number): Pond => {
    const where = `ponds[${i}]`;
    if (!isRecord(p)) fail(where, "must be an object");
    if (typeof p.id !== "string" || !ID.test(p.id)) {
      fail(where, `id ${JSON.stringify(p.id)} must match ${ID.source}`);
    }
    const id = p.id;
    const label = `${where} (${id})`;
    const first = seen.get(id);
    if (first !== undefined) fail(label, `duplicate id "${id}" (already used by ponds[${first}])`);
    seen.set(id, i);

    let name: string | null;
    if (p.name === null) name = null;
    else if (typeof p.name === "string") {
      if (p.name.length > MAX_NAME_CHARS) fail(label, `name is longer than ${MAX_NAME_CHARS} characters`);
      name = p.name.trim() === "" ? null : p.name;
    } else fail(label, "name must be a string or null");

    const level = p.level_m;
    if (typeof level !== "number" || !Number.isFinite(level)) fail(label, "level_m must be a finite number");
    if (level < MIN_LEVEL_M || level > MAX_LEVEL_M) {
      fail(label, `level_m must be within ${MIN_LEVEL_M}..${MAX_LEVEL_M} metres, got ${level}`);
    }

    if (typeof p.source !== "string" || p.source.trim() === "") fail(label, "source must not be blank");
    if (p.source.length > MAX_SOURCE_CHARS) fail(label, `source is longer than ${MAX_SOURCE_CHARS} characters`);

    const confidence = p.confidence;
    if (typeof confidence !== "string" || !(CONFIDENCES as readonly string[]).includes(confidence)) {
      fail(label, `confidence ${JSON.stringify(confidence)} is not one of ${CONFIDENCES.join(", ")}`);
    }

    return {
      id,
      name,
      level_m: level,
      source: p.source,
      confidence: confidence as Pond["confidence"],
      rings: parseRings(p.rings, label, budget),
    };
  });
  return { version: 1, ponds };
}

type FetchLike = (url: string) => Promise<Pick<Response, "ok" | "status" | "json">>;

/**
 * Fetch and validate the ponds file named by `meta.ponds_file` next to the heightmap.
 * Resolves null when the dataset has none. Rejects with the URL (and HTTP status) on a
 * failed request, or with the parser's message on bad content.
 */
export async function loadPonds(
  baseUrl: string,
  meta: Pick<HeightmapMeta, "ponds_file">,
  fetchImpl: FetchLike = (u) => fetch(u),
): Promise<Ponds | null> {
  const file = meta.ponds_file;
  if (file === undefined || file === null || file === "") return null;
  if (typeof file !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(file) || file.includes("..")) {
    throw new Error(`ponds: unsupported ponds_file ${JSON.stringify(file)}`);
  }
  const url = `${baseUrl}/${file}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: HTTP ${res.status}`);
  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new Error(`${url}: not valid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  try {
    return parsePonds(json);
  } catch (err) {
    throw new Error(`${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
