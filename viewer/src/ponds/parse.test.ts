import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_COORD_M, MAX_PONDS, MAX_POND_POINTS, loadPonds, parsePonds } from "./parse";

const SQUARE = [0, 0, 10, 0, 10, 10, 0, 10];
const pond = (over: Record<string, unknown> = {}) => ({
  id: "lake-merced-north",
  name: "Lake Merced (north)",
  level_m: 5.6,
  source: "Hand-drawn from the 1869 coast survey",
  confidence: "inferred",
  rings: [SQUARE],
  ...over,
});
const doc = (over: Record<string, unknown> = {}) => ({
  version: 1,
  ponds: [pond()],
  processing: { carve_depth_m: 1.5 },
  ...over,
});

describe("parsePonds: valid input", () => {
  it("accepts a complete document and returns a clean copy", () => {
    const raw = doc({ extra: "ignored" });
    (raw.ponds[0] as Record<string, unknown>).junk = 1;
    const p = parsePonds(raw);
    expect(p.version).toBe(1);
    expect(p.ponds).toEqual([pond()]);
    expect(p).not.toHaveProperty("extra");
    expect(p).not.toHaveProperty("processing");
    expect(p.ponds[0]).not.toHaveProperty("junk");
    expect(p.ponds[0].rings[0]).not.toBe((raw.ponds[0] as { rings: number[][] }).rings[0]);
  });

  it("accepts an empty list, a null name, holes, and every confidence", () => {
    expect(parsePonds(doc({ ponds: [] })).ponds).toEqual([]);
    expect(parsePonds(doc({ ponds: [pond({ name: null })] })).ponds[0].name).toBeNull();
    const holes = parsePonds(doc({ ponds: [pond({ rings: [[0, 0, 100, 0, 100, 100, 0, 100], [40, 40, 60, 40, 60, 60]] })] }));
    expect(holes.ponds[0].rings).toHaveLength(2);
    for (const confidence of ["documented", "inferred", "illustrative"]) {
      parsePonds(doc({ ponds: [pond({ confidence })] }));
    }
  });

  it("accepts boundary values: level limits, 3-point rings, long names, coordinate limits", () => {
    parsePonds(doc({ ponds: [pond({ level_m: -100 }), pond({ id: "b", level_m: 1000 })] }));
    parsePonds(doc({ ponds: [pond({ name: "x".repeat(120), source: "s".repeat(300) })] }));
    parsePonds(doc({ ponds: [pond({ rings: [[-MAX_COORD_M, -MAX_COORD_M, MAX_COORD_M, 0, 0, MAX_COORD_M]] })] }));
    parsePonds(doc({ ponds: [pond({ id: "0", level_m: 0 }), pond({ id: "a-1-b" })] }));
  });

  it("turns a whitespace-only name into null", () => {
    expect(parsePonds(doc({ ponds: [pond({ name: "   " })] })).ponds[0].name).toBeNull();
  });

  it("keeps closed rings as given (the geometry step handles the repeated point)", () => {
    const closed = [0, 0, 10, 0, 10, 10, 0, 0];
    expect(parsePonds(doc({ ponds: [pond({ rings: [closed] })] })).ponds[0].rings[0]).toEqual(closed);
  });
});

describe("parsePonds: top level", () => {
  it("rejects non-objects", () => {
    for (const bad of [null, undefined, 5, "x", [], true]) {
      expect(() => parsePonds(bad)).toThrow(/JSON object/);
    }
  });

  it("rejects a wrong or missing version", () => {
    expect(() => parsePonds(doc({ version: 2 }))).toThrow(/version 2/);
    expect(() => parsePonds(doc({ version: "1" }))).toThrow(/version "1"/);
    const { version: _v, ...rest } = doc();
    void _v;
    expect(() => parsePonds(rest)).toThrow(/version/);
  });

  it("rejects a missing or non-array ponds list", () => {
    expect(() => parsePonds(doc({ ponds: {} }))).toThrow(/ponds: must be an array/);
    expect(() => parsePonds(doc({ ponds: undefined }))).toThrow(/ponds: must be an array/);
    expect(() => parsePonds(doc({ ponds: "no" }))).toThrow(/ponds: must be an array/);
  });

  it("caps the number of ponds", () => {
    const many = Array.from({ length: MAX_PONDS + 1 }, (_, i) => pond({ id: `p${i}` }));
    expect(() => parsePonds(doc({ ponds: many }))).toThrow(/more than the limit of 2000/);
    parsePonds(doc({ ponds: many.slice(0, MAX_PONDS) }));
  });
});

describe("parsePonds: ids", () => {
  it("names the index and rejects non-objects", () => {
    expect(() => parsePonds(doc({ ponds: [pond(), 5] }))).toThrow(/ponds\[1\]: must be an object/);
    expect(() => parsePonds(doc({ ponds: [null] }))).toThrow(/ponds\[0\]: must be an object/);
  });

  it("rejects malformed ids", () => {
    for (const id of ["", "Upper", "-lead", "has space", "under_score", "a/b", "é", 5, null, undefined]) {
      expect(() => parsePonds(doc({ ponds: [pond({ id })] }))).toThrow(/ponds\[0\]: id .* must match/);
    }
  });

  it("rejects duplicate ids, naming both indices", () => {
    expect(() => parsePonds(doc({ ponds: [pond(), pond({ id: "other" }), pond()] }))).toThrow(
      /ponds\[2\] \(lake-merced-north\): duplicate id "lake-merced-north" \(already used by ponds\[0\]\)/,
    );
  });
});

describe("parsePonds: fields", () => {
  const bad = (over: Record<string, unknown>) => () => parsePonds(doc({ ponds: [pond(), pond({ id: "second", ...over })] }));

  it("names index and id in every field error", () => {
    expect(bad({ level_m: "high" })).toThrow(/ponds\[1\] \(second\): level_m must be a finite number/);
  });

  it("validates the name", () => {
    expect(bad({ name: 5 })).toThrow(/name must be a string or null/);
    expect(bad({ name: undefined })).toThrow(/name must be a string or null/);
    expect(bad({ name: "x".repeat(121) })).toThrow(/name is longer than 120/);
  });

  it("validates level_m", () => {
    for (const level_m of [NaN, Infinity, -Infinity, null, undefined, "1"]) {
      expect(bad({ level_m })).toThrow(/level_m must be a finite number/);
    }
    expect(bad({ level_m: -100.01 })).toThrow(/level_m must be within -100..1000/);
    expect(bad({ level_m: 1000.5 })).toThrow(/level_m must be within -100..1000/);
  });

  it("validates the source", () => {
    expect(bad({ source: "" })).toThrow(/source must not be blank/);
    expect(bad({ source: "   " })).toThrow(/source must not be blank/);
    expect(bad({ source: 5 })).toThrow(/source must not be blank/);
    expect(bad({ source: "s".repeat(301) })).toThrow(/source is longer than 300/);
  });

  it("validates the confidence", () => {
    expect(bad({ confidence: "certain" })).toThrow(/confidence "certain" is not one of/);
    expect(bad({ confidence: undefined })).toThrow(/confidence undefined is not one of/);
  });
});

describe("parsePonds: rings", () => {
  const withRings = (rings: unknown) => () => parsePonds(doc({ ponds: [pond({ rings })] }));

  it("needs a non-empty array of rings", () => {
    expect(withRings([])).toThrow(/ponds\[0\] \(lake-merced-north\): rings must be a non-empty array/);
    expect(withRings("x")).toThrow(/rings must be a non-empty array/);
    expect(withRings(undefined)).toThrow(/rings must be a non-empty array/);
  });

  it("rejects rings that are not flat arrays, odd, or shorter than three points", () => {
    expect(withRings([5])).toThrow(/ring 0: must be a flat array of numbers/);
    expect(withRings([[[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]])).toThrow(/ring 0: value 0 is not a finite number/);
    expect(withRings([[0, 0, 1, 1, 2, 2, 3]])).toThrow(/odd number of values \(7\)/);
    expect(withRings([[0, 0, 1, 1]])).toThrow(/needs at least 3 points, has 2/);
    expect(withRings([[]])).toThrow(/needs at least 3 points, has 0/);
    expect(withRings([SQUARE, [0, 0, 1, 1]])).toThrow(/ring 1: needs at least 3 points/);
  });

  it("rejects non-finite and out-of-range coordinates", () => {
    expect(withRings([[0, 0, 1, 1, 2, NaN]])).toThrow(/value 5 is not a finite number/);
    expect(withRings([[0, 0, 1, 1, Infinity, 2]])).toThrow(/value 4 is not a finite number/);
    expect(withRings([[0, 0, 1, 1, 2, "3"]])).toThrow(/value 5 is not a finite number/);
    expect(withRings([[0, 0, 1, 1, 2, null]])).toThrow(/value 5 is not a finite number/);
    expect(withRings([[0, 0, 1, 1, 2, MAX_COORD_M + 1]])).toThrow(/value 5 is out of range/);
    expect(withRings([[0, 0, 1, 1, -MAX_COORD_M - 1, 2]])).toThrow(/value 4 is out of range/);
  });

  it("caps the total number of ring points across all ponds", () => {
    const ring = (points: number) => Array.from({ length: points * 2 }, (_, i) => i % 7);
    const big = MAX_POND_POINTS / 2;
    parsePonds(doc({ ponds: [pond({ rings: [ring(big)] }), pond({ id: "b", rings: [ring(big)] })] }));
    expect(() =>
      parsePonds(doc({ ponds: [pond({ rings: [ring(big)] }), pond({ id: "b", rings: [ring(big), ring(3)] })] })),
    ).toThrow(/ponds\[1\] \(b\): ponds hold more than 400000 ring points/);
  });
});

describe("loadPonds", () => {
  const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });

  it("returns null when the dataset has no ponds_file (and does not fetch)", async () => {
    let called = false;
    const f = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };
    expect(await loadPonds("/assets/x", {}, f)).toBeNull();
    expect(await loadPonds("/assets/x", { ponds_file: "" }, f)).toBeNull();
    expect(called).toBe(false);
  });

  it("fetches base/file and parses it", async () => {
    let seen = "";
    const p = await loadPonds("/assets/x", { ponds_file: "ponds.json" }, async (u) => {
      seen = u;
      return { ok: true, status: 200, json: async () => doc() };
    });
    expect(seen).toBe("/assets/x/ponds.json");
    expect(p?.ponds[0].id).toBe("lake-merced-north");
  });

  it("reports the URL and status of a failed request", async () => {
    await expect(
      loadPonds("/a", { ponds_file: "ponds.json" }, async () => ({ ok: false, status: 404, json: async () => ({}) })),
    ).rejects.toThrow("failed to fetch /a/ponds.json: HTTP 404");
  });

  it("propagates a network failure", async () => {
    await expect(
      loadPonds("/a", { ponds_file: "ponds.json" }, async () => {
        throw new TypeError("network down");
      }),
    ).rejects.toThrow("network down");
  });

  it("reports the URL for invalid JSON and for invalid content", async () => {
    await expect(
      loadPonds("/a", { ponds_file: "ponds.json" }, async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      })),
    ).rejects.toThrow(/\/a\/ponds\.json: not valid JSON/);
    await expect(loadPonds("/a", { ponds_file: "ponds.json" }, ok({ version: 9 }))).rejects.toThrow(
      /\/a\/ponds\.json: ponds: unsupported version 9/,
    );
  });

  it("refuses file names that could leave the dataset folder", async () => {
    for (const f of ["../x.json", "a/b.json", "/etc/passwd", "..", "a..b", "a\\b.json", "https://evil.example/x.json"]) {
      await expect(loadPonds("/a", { ponds_file: f }, ok(doc()))).rejects.toThrow(/unsupported ponds_file/);
    }
  });
});

// The synthetic dataset is generated (npm run make:city-synth && npm run make:ponds-synth),
// so this only runs where it has been generated.
const synthUrl = new URL("../../public/assets/city-synth/ponds.json", import.meta.url);
describe.skipIf(!existsSync(synthUrl))("generated synthetic ponds.json", () => {
  it("parses with the strict validator", () => {
    const p = parsePonds(JSON.parse(readFileSync(synthUrl, "utf8")));
    expect(p.ponds.length).toBeGreaterThanOrEqual(2);
    expect(p.ponds.some((x) => x.rings.length > 1)).toBe(true);
    for (const x of p.ponds) expect(x.confidence).toBe("illustrative");
  });
});
