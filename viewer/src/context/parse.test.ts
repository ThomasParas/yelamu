import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadContextDoc, loadContextHeights, parseContext, MAX_PLACES } from "./parse";

const valid = () => ({
  version: 1,
  heights_file: "context.u16",
  heights_format: "uint16-le",
  cols: 6,
  rows: 5,
  x0: -300,
  z0: -200,
  dx: 100,
  dz: 100,
  hole: { i0: 2, i1: 4, j0: 1, j1: 3 },
  min_m: -3,
  max_m: 97,
  water_level_m: 0.6,
  bay_floor_m: -3,
  layers: [{ id: "context", source: "s", confidence: "illustrative", attribution: "a" }],
  places: [{ id: "oakland", name: "Oakland", kind: "town", lon: -122.27, lat: 37.8, x: 10, z: 20, ground_m: 12.5, source: "x" }],
});

describe("parseContext", () => {
  it("accepts a valid document and keeps only the known fields", () => {
    const doc = parseContext({ ...valid(), extra: 1 });
    expect(doc.cols).toBe(6);
    expect(doc.hole).toEqual({ i0: 2, i1: 4, j0: 1, j1: 3 });
    expect(doc.places[0]).toEqual({ id: "oakland", name: "Oakland", kind: "town", lon: -122.27, lat: 37.8, x: 10, z: 20, ground_m: 12.5 });
    expect("extra" in doc).toBe(false);
  });

  it.each([
    ["not an object", 5],
    ["a wrong version", { ...valid(), version: 2 }],
    ["a non-finite number", { ...valid(), dx: Number.NaN }],
    ["a non-positive spacing", { ...valid(), dz: 0 }],
    ["too few vertices", { ...valid(), cols: 1 }],
    ["too many vertices", { ...valid(), cols: 4001 }],
    ["a hole outside the lattice", { ...valid(), hole: { i0: 2, i1: 7, j0: 1, j1: 3 } }],
    ["an empty hole", { ...valid(), hole: { i0: 2, i1: 2, j0: 1, j1: 3 } }],
    ["a height range that is not increasing", { ...valid(), min_m: 5, max_m: 5 }],
    ["an unsupported heights format", { ...valid(), heights_format: "float32" }],
    ["a heights file with a path", { ...valid(), heights_file: "../x.u16" }],
    ["a bad place id", { ...valid(), places: [{ ...valid().places[0], id: "Bad Id" }] }],
    ["a duplicate place id", { ...valid(), places: [valid().places[0], valid().places[0]] }],
    ["a place with no name", { ...valid(), places: [{ ...valid().places[0], name: " " }] }],
    ["a place far outside", { ...valid(), places: [{ ...valid().places[0], x: 1e9 }] }],
    ["too many places", { ...valid(), places: Array.from({ length: MAX_PLACES + 1 }, (_, i) => ({ ...valid().places[0], id: `p${i}` })) }],
  ])("rejects %s", (_name, raw) => {
    expect(() => parseContext(raw)).toThrow(/context:/);
  });
});

const fakeFetch = (routes: Record<string, { status?: number; json?: unknown; bytes?: ArrayBuffer }>) =>
  (async (url: string) => {
    const r = routes[url];
    if (!r) return { ok: false, status: 404 } as Response;
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => r.json,
      arrayBuffer: async () => r.bytes,
    } as unknown as Response;
  }) as unknown as typeof fetch;

describe("loadContextDoc", () => {
  it("returns null when the dataset has no context_file", async () => {
    expect(await loadContextDoc("/a", {}, fakeFetch({}))).toBeNull();
  });

  it("fetches and parses the document next to the heightmap", async () => {
    const f = fakeFetch({ "/a/context.json": { json: valid() } });
    const doc = await loadContextDoc("/a", { context_file: "context.json" }, f);
    expect(doc?.rows).toBe(5);
  });

  it("throws on an HTTP error, so the module can warn and carry on", async () => {
    await expect(loadContextDoc("/a", { context_file: "context.json" }, fakeFetch({}))).rejects.toThrow(/HTTP 404/);
  });

  it("refuses a context_file with a path", async () => {
    await expect(loadContextDoc("/a", { context_file: "../x.json" }, fakeFetch({}))).rejects.toThrow(/context_file/);
  });
});

describe("loadContextHeights", () => {
  it("decodes little-endian uint16 into metres over min_m..max_m", async () => {
    const doc = parseContext({ ...valid(), cols: 2, rows: 2, hole: { i0: 0, i1: 1, j0: 0, j1: 1 }, min_m: 0, max_m: 65535 });
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    [0, 1, 256, 65535].forEach((v, i) => view.setUint16(i * 2, v, true));
    const heights = await loadContextHeights("/a", doc, fakeFetch({ "/a/context.u16": { bytes: buf } }));
    expect(Array.from(heights)).toEqual([0, 1, 256, 65535]);
  });

  it("throws when the file size is wrong", async () => {
    const doc = parseContext({ ...valid(), cols: 2, rows: 2, hole: { i0: 0, i1: 1, j0: 0, j1: 1 } });
    await expect(loadContextHeights("/a", doc, fakeFetch({ "/a/context.u16": { bytes: new ArrayBuffer(6) } }))).rejects.toThrow(/expected 8 bytes/);
  });
});

describe("the committed real-city ring", () => {
  const dir = new URL("../../public/assets/real-city/", import.meta.url);

  it("is accepted by parseContext, with its places and hole", () => {
    const doc = parseContext(JSON.parse(readFileSync(new URL("context.json", dir), "utf8")));
    expect(doc.cols).toBe(814);
    expect(doc.rows).toBe(656);
    expect(doc.hole).toEqual({ i0: 104, i1: 399, j0: 171, j1: 432 });
    expect(doc.places).toHaveLength(20);
    expect(doc.places.map((p) => p.id)).toContain("oakland");
    expect(doc.layers[0].confidence).toBe("illustrative");
    expect(existsSync(new URL(doc.heights_file, dir))).toBe(true);
  });
});
