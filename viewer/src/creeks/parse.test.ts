import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_CREEK_LENGTH_M,
  MAX_CREEK_POINTS,
  MAX_MAPPED,
  MAX_MODELLED,
  MAX_NAME_CHARS,
  MAX_SOURCE_CHARS,
  loadCreeks,
  parseCreeks,
} from "./parse";

const mapped = (over: Record<string, unknown> = {}) => ({
  id: "creek-1",
  name: "Test Creek",
  confidence: "inferred",
  sources: "Hoadley 1855",
  points: [0, 0, 10, 0],
  ...over,
});
const doc = (over: Record<string, unknown> = {}) => ({
  version: 1,
  mapped: [mapped()],
  modelled: [{ order: 3, points: [0, 0, 10, 0, 20, 5] }],
  ...over,
});

describe("parseCreeks", () => {
  it("returns a clean copy and drops unknown fields", () => {
    const out = parseCreeks({ ...doc(), processing: { x: 1 }, mapped: [{ ...mapped(), extra: 1 }] });
    expect(out.version).toBe(1);
    expect(out.mapped[0]).toEqual(mapped());
    expect(out.modelled[0]).toEqual({ order: 3, points: [0, 0, 10, 0, 20, 5] });
    expect("processing" in out).toBe(false);
  });

  it("accepts a null name and an empty sources text", () => {
    const out = parseCreeks(doc({ mapped: [mapped({ name: null, sources: "" })] }));
    expect(out.mapped[0].name).toBeNull();
  });

  it("turns a whitespace-only name into null", () => {
    expect(parseCreeks(doc({ mapped: [mapped({ name: "   " })] })).mapped[0].name).toBeNull();
  });

  it.each([
    ["a non-object", 5, /object/],
    ["an unknown version", doc({ version: 2 }), /version/],
    ["mapped that is not an array", doc({ mapped: {} }), /mapped/],
    ["a bad id", doc({ mapped: [mapped({ id: "Creek 1" })] }), /id/],
    ["a duplicate id", doc({ mapped: [mapped(), mapped()] }), /duplicate/],
    ["an unknown confidence", doc({ mapped: [mapped({ confidence: "certain" })] }), /confidence/],
    ["a name that is too long", doc({ mapped: [mapped({ name: "N".repeat(MAX_NAME_CHARS + 1) })] }), /name/],
    ["sources that are too long", doc({ mapped: [mapped({ sources: "s".repeat(MAX_SOURCE_CHARS + 1) })] }), /sources/],
    ["an odd number of coordinates", doc({ mapped: [mapped({ points: [0, 0, 1] })] }), /odd|points/],
    ["fewer than two points", doc({ mapped: [mapped({ points: [0, 0] })] }), /at least 2 points/],
    ["a NaN coordinate", doc({ mapped: [mapped({ points: [0, 0, NaN, 1] })] }), /finite/],
    ["a coordinate out of range", doc({ mapped: [mapped({ points: [0, 0, 2e6, 1] })] }), /range/],
    ["a string coordinate", doc({ mapped: [mapped({ points: [0, 0, "1", 1] })] }), /finite/],
    ["an order of zero", doc({ modelled: [{ order: 0, points: [0, 0, 1, 1] }] }), /order/],
    ["an order of nine", doc({ modelled: [{ order: 9, points: [0, 0, 1, 1] }] }), /order/],
    ["a fractional order", doc({ modelled: [{ order: 3.5, points: [0, 0, 1, 1] }] }), /order/],
  ])("rejects %s", (_label, input, pattern) => {
    expect(() => parseCreeks(input)).toThrow(pattern);
  });

  it("enforces the count limits", () => {
    const many = Array.from({ length: MAX_MAPPED + 1 }, (_, i) => mapped({ id: `c${i}` }));
    expect(() => parseCreeks(doc({ mapped: many }))).toThrow(/mapped/);
    const streams = Array.from({ length: MAX_MODELLED + 1 }, () => ({ order: 3, points: [0, 0, 1, 1] }));
    expect(() => parseCreeks(doc({ modelled: streams }))).toThrow(/modelled/);
  });

  it("enforces the total length of line, mapped and modelled together", () => {
    expect(MAX_CREEK_LENGTH_M).toBe(2_000_000);
    const line = (metres: number) => [-1e6, 0, -1e6 + metres, 0]; // one segment, `metres` long
    // 1000 km of mapped line plus just under 1000 km of modelled line passes ...
    const under = doc({ mapped: [mapped({ points: line(1_000_000) })], modelled: [{ order: 3, points: line(999_999) }] });
    expect(() => parseCreeks(under)).not.toThrow();
    // ... and a metre more does not
    const over = doc({ mapped: [mapped({ points: line(1_000_000) })], modelled: [{ order: 3, points: line(1_000_001) }] });
    expect(() => parseCreeks(over)).toThrow(/more than 2000 km of line in total/);
    // one hostile segment across the whole coordinate range (2828 km) is refused, with the line named
    expect(() => parseCreeks(doc({ modelled: [{ order: 3, points: [-1e6, -1e6, 1e6, 1e6] }] }))).toThrow(
      /modelled\[0\].*2000 km/,
    );
    // many short lines add up too
    const many = Array.from({ length: 21 }, () => ({ order: 3, points: line(100_000) }));
    expect(() => parseCreeks(doc({ modelled: many }))).toThrow(/2000 km/);
  });

  it("enforces the total point budget", () => {
    const big = { order: 3, points: new Array(2 * (MAX_CREEK_POINTS / 2 + 1)).fill(1) };
    expect(() => parseCreeks(doc({ modelled: [big, big] }))).toThrow(/points in total/);
  });
});

describe("loadCreeks", () => {
  const ok = (json: unknown) => async () => ({ ok: true, status: 200, json: async () => json });

  it("resolves null when the dataset has no creeks_file", async () => {
    expect(await loadCreeks("/a", {}, ok(doc()))).toBeNull();
    expect(await loadCreeks("/a", { creeks_file: "" }, ok(doc()))).toBeNull();
  });

  it("fetches next to the heightmap and parses", async () => {
    let url = "";
    const out = await loadCreeks("/assets/x", { creeks_file: "creeks.json" }, async (u) => {
      url = u;
      return { ok: true, status: 200, json: async () => doc() };
    });
    expect(url).toBe("/assets/x/creeks.json");
    expect(out?.mapped).toHaveLength(1);
  });

  it("rejects a file name with a path in it, an HTTP error and bad content, naming the URL", async () => {
    await expect(loadCreeks("/a", { creeks_file: "../x.json" }, ok(doc()))).rejects.toThrow(/unsupported/);
    await expect(
      loadCreeks("/a", { creeks_file: "creeks.json" }, async () => ({ ok: false, status: 404, json: async () => ({}) })),
    ).rejects.toThrow(/404/);
    await expect(loadCreeks("/a", { creeks_file: "creeks.json" }, ok({ version: 3 }))).rejects.toThrow(/creeks\.json.*version/);
  });
});

describe("the shipped creeks.json", () => {
  it("parses, and meta counts agree with it", () => {
    const base = new URL("../../public/assets/real-city/", import.meta.url);
    const meta = JSON.parse(readFileSync(new URL("meta.json", base), "utf8"));
    const creeks = parseCreeks(JSON.parse(readFileSync(new URL("creeks.json", base), "utf8")));
    expect(meta.creeks_mapped).toBe(creeks.mapped.length);
    expect(meta.creeks_modelled).toBe(creeks.modelled.length);
  });
});
