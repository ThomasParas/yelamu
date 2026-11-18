import type { HeightmapMeta } from "../heightmap";
import { CONFIDENCES } from "../overlay/types";
import type { Creeks, MappedCreek, ModelledStream } from "./types";

/**
 * Protective caps: a hostile or broken file must not be able to exhaust memory.
 * KEEP IN SYNC with pipeline/yelamu/creeks.py: the pipeline refuses to write a creeks.json this
 * parser would reject, and a pipeline test reads this file and fails when the numbers differ.
 */
export const MAX_MAPPED = 500;
export const MAX_MODELLED = 20_000;
export const MAX_CREEK_POINTS = 400_000;
/**
 * Total length of all lines, metres (2000 km; the shipped data is about 150 km). The point cap
 * alone is not enough: with coordinates up to MAX_COORD_M a few long segments would be draped
 * into billions of vertices.
 */
export const MAX_CREEK_LENGTH_M = 2_000_000;
export const MAX_NAME_CHARS = 120;
export const MAX_SOURCE_CHARS = 300;
/** World coordinates (metres from the terrain centre) must stay within this. */
export const MAX_COORD_M = 1e6;
export const MIN_ORDER = 1;
export const MAX_ORDER = 8;

const ID = /^[a-z0-9][a-z0-9-]*$/;

function fail(where: string, what: string): never {
  throw new Error(`creeks: ${where}: ${what}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parsePoints(v: unknown, label: string, budget: { points: number; lengthM: number }): number[] {
  if (!Array.isArray(v)) fail(label, "points must be a flat array of numbers");
  if (v.length % 2 !== 0) fail(label, `points has an odd number of values (${v.length})`);
  if (v.length < 4) fail(label, `needs at least 2 points, has ${v.length / 2}`);
  budget.points += v.length / 2;
  if (budget.points > MAX_CREEK_POINTS) fail(label, `creeks hold more than ${MAX_CREEK_POINTS} points in total`);
  const out = new Array<number>(v.length);
  for (let k = 0; k < v.length; k++) {
    const n: unknown = v[k];
    if (typeof n !== "number" || !Number.isFinite(n)) fail(label, `value ${k} is not a finite number`);
    if (Math.abs(n) > MAX_COORD_M) fail(label, `value ${k} is out of range (must be within ±1e6 metres), got ${n}`);
    out[k] = n;
  }
  for (let k = 2; k < out.length; k += 2) {
    budget.lengthM += Math.hypot(out[k] - out[k - 2], out[k + 1] - out[k - 1]);
  }
  if (budget.lengthM > MAX_CREEK_LENGTH_M) {
    fail(label, `creeks hold more than ${MAX_CREEK_LENGTH_M / 1000} km of line in total`);
  }
  return out;
}

/**
 * Validate untrusted creeks JSON and return a clean copy (only the known fields). A name that is
 * only whitespace becomes null. Throws an Error naming the line.
 */
export function parseCreeks(raw: unknown): Creeks {
  if (!isRecord(raw)) throw new Error("creeks: the file must be a JSON object");
  if (raw.version !== 1) {
    throw new Error(`creeks: unsupported version ${JSON.stringify(raw.version)} (expected 1)`);
  }
  const mappedRaw = raw.mapped;
  const modelledRaw = raw.modelled;
  if (!Array.isArray(mappedRaw)) fail("mapped", "must be an array");
  if (!Array.isArray(modelledRaw)) fail("modelled", "must be an array");
  if (mappedRaw.length > MAX_MAPPED) fail("mapped", `has ${mappedRaw.length} entries, more than the limit of ${MAX_MAPPED}`);
  if (modelledRaw.length > MAX_MODELLED) {
    fail("modelled", `has ${modelledRaw.length} entries, more than the limit of ${MAX_MODELLED}`);
  }

  const budget = { points: 0, lengthM: 0 };
  const seen = new Set<string>();
  const mapped = mappedRaw.map((c: unknown, i: number): MappedCreek => {
    const where = `mapped[${i}]`;
    if (!isRecord(c)) fail(where, "must be an object");
    if (typeof c.id !== "string" || !ID.test(c.id)) fail(where, `id ${JSON.stringify(c.id)} must match ${ID.source}`);
    const label = `${where} (${c.id})`;
    if (seen.has(c.id)) fail(label, `duplicate id "${c.id}"`);
    seen.add(c.id);
    let name: string | null = null;
    if (c.name !== null && c.name !== undefined) {
      if (typeof c.name !== "string") fail(label, "name must be text or null");
      if (c.name.length > MAX_NAME_CHARS) fail(label, `name is longer than ${MAX_NAME_CHARS} characters`);
      name = c.name.trim() === "" ? null : c.name;
    }
    if (typeof c.sources !== "string") fail(label, "sources must be text");
    if (c.sources.length > MAX_SOURCE_CHARS) fail(label, `sources is longer than ${MAX_SOURCE_CHARS} characters`);
    const confidence = c.confidence;
    if (typeof confidence !== "string" || !(CONFIDENCES as readonly string[]).includes(confidence)) {
      fail(label, `confidence ${JSON.stringify(confidence)} is not one of ${CONFIDENCES.join(", ")}`);
    }
    return {
      id: c.id,
      name,
      confidence: confidence as MappedCreek["confidence"],
      sources: c.sources,
      points: parsePoints(c.points, label, budget),
    };
  });
  const modelled = modelledRaw.map((m: unknown, i: number): ModelledStream => {
    const where = `modelled[${i}]`;
    if (!isRecord(m)) fail(where, "must be an object");
    const order = m.order;
    if (typeof order !== "number" || !Number.isInteger(order) || order < MIN_ORDER || order > MAX_ORDER) {
      fail(where, `order ${JSON.stringify(order)} must be a whole number from ${MIN_ORDER} to ${MAX_ORDER}`);
    }
    return { order, points: parsePoints(m.points, where, budget) };
  });
  return { version: 1, mapped, modelled };
}

type FetchLike = (url: string) => Promise<Pick<Response, "ok" | "status" | "json">>;

/**
 * Fetch and validate the creeks file named by `meta.creeks_file` next to the heightmap. Resolves
 * null when the dataset has none. Rejects with the URL (and HTTP status) on a failed request, or
 * with the parser's message on bad content.
 */
export async function loadCreeks(
  baseUrl: string,
  meta: Pick<HeightmapMeta, "creeks_file">,
  fetchImpl: FetchLike = (u) => fetch(u),
): Promise<Creeks | null> {
  const file = meta.creeks_file;
  if (file === undefined || file === null || file === "") return null;
  if (typeof file !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(file) || file.includes("..")) {
    throw new Error(`creeks: unsupported creeks_file ${JSON.stringify(file)}`);
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
    return parseCreeks(json);
  } catch (err) {
    throw new Error(`${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
