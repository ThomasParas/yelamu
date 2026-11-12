import { describe, expect, it } from "vitest";
import {
  MAX_STREETS,
  MAX_STREET_POINTS,
  loadOverlay,
  parseOverlay,
} from "./parse";

const street = (over: Record<string, unknown> = {}) => ({
  name: "Market St",
  kind: "primary",
  lines: [[0, 0, 10, 10]],
  ...over,
});
const landmark = (over: Record<string, unknown> = {}) => ({
  id: "twin-peaks",
  name: "Twin Peaks",
  kind: "hill",
  x: 1,
  z: 2,
  lon: -122.44,
  lat: 37.75,
  ...over,
});
const hotspot = (over: Record<string, unknown> = {}) => ({
  id: "mission-creek",
  name: "Mission Creek",
  kind: "creek",
  x: 1,
  z: 2,
  lon: -122.4,
  lat: 37.77,
  description: "A tidal creek that drained into the bay near here.",
  sources: [{ title: "Hidden Nature SF", url: "https://hidden-nature.org/" }],
  confidence: "documented",
  ...over,
});
const doc = (over: Record<string, unknown> = {}) => ({
  version: 1,
  streets: [street()],
  landmarks: [landmark()],
  hotspots: [hotspot()],
  ...over,
});

describe("parseOverlay: valid input", () => {
  it("accepts a complete document and returns a clean copy", () => {
    const raw = doc({ extra: "ignored" });
    (raw.streets[0] as Record<string, unknown>).junk = 1;
    const o = parseOverlay(raw);
    expect(o.version).toBe(1);
    expect(o.streets).toEqual([street()]);
    expect(o.landmarks).toEqual([landmark()]);
    expect(o.hotspots).toEqual([hotspot()]);
    expect(o).not.toHaveProperty("extra");
    expect(o.streets[0]).not.toHaveProperty("junk");
    expect(o.streets[0].lines[0]).not.toBe((raw.streets[0] as { lines: number[][] }).lines[0]);
  });

  it("accepts empty sections and every allowed kind / confidence", () => {
    expect(parseOverlay(doc({ streets: [], landmarks: [], hotspots: [] })).streets).toEqual([]);
    for (const kind of ["primary", "secondary", "local"]) parseOverlay(doc({ streets: [street({ kind })] }));
    for (const kind of ["park", "bridge", "hill", "building", "neighborhood", "beach", "water", "fort", "other"]) {
      parseOverlay(doc({ landmarks: [landmark({ kind })] }));
    }
    for (const kind of ["creek", "lagoon", "marsh", "dune", "hill", "shoreline", "bay", "lake", "valley", "other"]) {
      parseOverlay(doc({ hotspots: [hotspot({ kind })] }));
    }
    for (const confidence of ["documented", "inferred", "illustrative"]) {
      parseOverlay(doc({ hotspots: [hotspot({ confidence })] }));
    }
  });

  it("accepts http and https source urls, negative and fractional coordinates", () => {
    const o = parseOverlay(
      doc({
        landmarks: [landmark({ x: -1234.5, z: 0.25 })],
        hotspots: [hotspot({ sources: [{ title: "a", url: "http://example.org/x" }, { title: "b", url: "https://example.org/y?z=1" }] })],
      }),
    );
    expect(o.landmarks[0].x).toBe(-1234.5);
    expect(o.hotspots[0].sources).toHaveLength(2);
  });
});

describe("parseOverlay: top level", () => {
  it("rejects non-objects", () => {
    for (const bad of [null, undefined, 5, "x", [], true]) {
      expect(() => parseOverlay(bad)).toThrow(/JSON object/);
    }
  });

  it("rejects a wrong or missing version", () => {
    expect(() => parseOverlay(doc({ version: 2 }))).toThrow(/version 2/);
    expect(() => parseOverlay(doc({ version: "1" }))).toThrow(/version "1"/);
    const { version: _v, ...rest } = doc();
    void _v;
    expect(() => parseOverlay(rest)).toThrow(/version/);
  });

  it("rejects non-array or missing sections, naming the section", () => {
    expect(() => parseOverlay(doc({ streets: {} }))).toThrow(/streets: must be an array/);
    expect(() => parseOverlay(doc({ landmarks: "no" }))).toThrow(/landmarks: must be an array/);
    expect(() => parseOverlay(doc({ hotspots: undefined }))).toThrow(/hotspots: must be an array/);
  });
});

describe("parseOverlay: streets", () => {
  it("names the street index and name in errors", () => {
    expect(() => parseOverlay(doc({ streets: [street(), street({ name: "Bad St", kind: "highway" })] }))).toThrow(
      /streets\[1\] \("Bad St"\).*kind "highway"/,
    );
  });

  it("rejects non-object entries and blank names", () => {
    expect(() => parseOverlay(doc({ streets: [5] }))).toThrow(/streets\[0\]: must be an object/);
    expect(() => parseOverlay(doc({ streets: [street({ name: "  " })] }))).toThrow(/name must be a non-empty/);
    expect(() => parseOverlay(doc({ streets: [street({ name: "x".repeat(121) })] }))).toThrow(/longer than/);
  });

  it("rejects lines that are not arrays, odd, or shorter than two points", () => {
    expect(() => parseOverlay(doc({ streets: [street({ lines: "x" })] }))).toThrow(/lines must be an array/);
    expect(() => parseOverlay(doc({ streets: [street({ lines: [5] })] }))).toThrow(/line 0.*array of numbers/);
    expect(() => parseOverlay(doc({ streets: [street({ lines: [[0, 0, 1, 1, 2]] })] }))).toThrow(/odd number of values \(5\)/);
    expect(() => parseOverlay(doc({ streets: [street({ lines: [[0, 0]] })] }))).toThrow(/at least 2 points/);
    expect(() => parseOverlay(doc({ streets: [street({ lines: [[0, 0, 1, 1], []] })] }))).toThrow(/line 1.*at least 2 points/);
  });

  it("rejects non-finite or non-number values", () => {
    for (const bad of [NaN, Infinity, -Infinity, "3", null]) {
      expect(() => parseOverlay(doc({ streets: [street({ lines: [[0, 0, bad, 1]] })] }))).toThrow(/value 2 is not a finite number/);
    }
  });

  it("allows a street with no lines", () => {
    expect(parseOverlay(doc({ streets: [street({ lines: [] })] })).streets[0].lines).toEqual([]);
  });

  it("caps the number of streets", () => {
    const many = Array.from({ length: MAX_STREETS + 1 }, () => street());
    expect(() => parseOverlay(doc({ streets: many }))).toThrow(/more than the limit of 6000/);
    expect(parseOverlay(doc({ streets: many.slice(0, MAX_STREETS) })).streets).toHaveLength(MAX_STREETS);
  });

  it("caps the total number of street points", () => {
    const line = new Array<number>(2 * (MAX_STREET_POINTS / 2)).fill(1);
    const ok = doc({ streets: [street({ lines: [line, line] })] });
    expect(parseOverlay(ok).streets[0].lines).toHaveLength(2);
    const over = doc({ streets: [street({ lines: [line, line, [0, 0, 1, 1]] })] });
    expect(() => parseOverlay(over)).toThrow(/more than 400000 points/);
  });
});

describe("parseOverlay: ids", () => {
  it("rejects bad landmark and hotspot ids", () => {
    for (const id of ["Twin Peaks", "-x", "a_b", "", "UPPER", "a/b", 5, null, undefined]) {
      expect(() => parseOverlay(doc({ landmarks: [landmark({ id })] }))).toThrow(/landmarks\[0\]: id/);
      expect(() => parseOverlay(doc({ hotspots: [hotspot({ id })] }))).toThrow(/hotspots\[0\]: id/);
    }
  });

  it("rejects duplicates within a section but allows the same id across sections", () => {
    expect(() => parseOverlay(doc({ landmarks: [landmark(), landmark({ name: "Again" })] }))).toThrow(
      /landmarks\[1\]: duplicate id "twin-peaks"/,
    );
    expect(() => parseOverlay(doc({ hotspots: [hotspot(), hotspot()] }))).toThrow(/hotspots\[1\]: duplicate id/);
    expect(() => parseOverlay(doc({ landmarks: [landmark({ id: "same" })], hotspots: [hotspot({ id: "same" })] }))).not.toThrow();
  });

  it("includes the id in later errors", () => {
    expect(() => parseOverlay(doc({ landmarks: [landmark({ x: NaN })] }))).toThrow(/landmarks\[0\] \(twin-peaks\): x must be a finite/);
    expect(() => parseOverlay(doc({ landmarks: [landmark({ kind: "mountain" })] }))).toThrow(/\(twin-peaks\).*kind "mountain"/);
    for (const f of ["z", "lon", "lat"]) {
      expect(() => parseOverlay(doc({ landmarks: [landmark({ [f]: "1" })] }))).toThrow(new RegExp(`${f} must be a finite`));
      expect(() => parseOverlay(doc({ hotspots: [hotspot({ [f]: Infinity })] }))).toThrow(new RegExp(`${f} must be a finite`));
    }
  });
});

describe("parseOverlay: hotspots", () => {
  it("enforces the description length 20..400", () => {
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ description: "x".repeat(19) })] }))).toThrow(/20 to 400 characters \(got 19\)/);
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ description: "x".repeat(401) })] }))).toThrow(/got 401/);
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ description: 5 })] }))).toThrow(/not a string/);
    parseOverlay(doc({ hotspots: [hotspot({ description: "x".repeat(20) })] }));
    parseOverlay(doc({ hotspots: [hotspot({ description: "x".repeat(400) })] }));
  });

  it("requires a non-empty sources array", () => {
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ sources: [] })] }))).toThrow(/sources must be a non-empty array/);
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ sources: "x" })] }))).toThrow(/sources must be a non-empty array/);
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ sources: undefined })] }))).toThrow(/sources/);
  });

  it("rejects blank titles and non-http(s) or malformed urls", () => {
    const src = (s: unknown) => doc({ hotspots: [hotspot({ sources: [s] })] });
    expect(() => parseOverlay(src({ title: " ", url: "https://a.org" }))).toThrow(/source 0.*title must not be blank/);
    expect(() => parseOverlay(src({ title: 5, url: "https://a.org" }))).toThrow(/title/);
    expect(() => parseOverlay(src({ title: "t", url: "javascript:alert(1)" }))).toThrow(/must be http or https, got javascript:/);
    expect(() => parseOverlay(src({ title: "t", url: "data:text/html,hi" }))).toThrow(/http or https/);
    expect(() => parseOverlay(src({ title: "t", url: "ftp://a.org/x" }))).toThrow(/http or https/);
    expect(() => parseOverlay(src({ title: "t", url: "not a url" }))).toThrow(/not a valid URL/);
    expect(() => parseOverlay(src({ title: "t", url: 5 }))).toThrow(/url must be a string/);
    expect(() => parseOverlay(src(null))).toThrow(/must be an object/);
  });

  it("rejects an unknown confidence", () => {
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ confidence: "certain" })] }))).toThrow(/confidence "certain"/);
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ confidence: undefined })] }))).toThrow(/confidence/);
  });

  it("rejects an unknown hotspot kind", () => {
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ kind: "volcano" })] }))).toThrow(/kind "volcano"/);
  });
});

describe("loadOverlay", () => {
  const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });

  it("returns null when the dataset has no overlay_file (and does not fetch)", async () => {
    let called = false;
    const f = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };
    expect(await loadOverlay("/assets/x", {}, f)).toBeNull();
    expect(await loadOverlay("/assets/x", { overlay_file: "" }, f)).toBeNull();
    expect(called).toBe(false);
  });

  it("fetches base/file and parses it", async () => {
    let seen = "";
    const o = await loadOverlay("/assets/x", { overlay_file: "overlay.json" }, async (u) => {
      seen = u;
      return { ok: true, status: 200, json: async () => doc() };
    });
    expect(seen).toBe("/assets/x/overlay.json");
    expect(o?.hotspots[0].id).toBe("mission-creek");
  });

  it("reports the URL and status of a failed request", async () => {
    await expect(
      loadOverlay("/a", { overlay_file: "overlay.json" }, async () => ({ ok: false, status: 404, json: async () => ({}) })),
    ).rejects.toThrow("failed to fetch /a/overlay.json: HTTP 404");
  });

  it("reports the URL for invalid JSON and for invalid content", async () => {
    await expect(
      loadOverlay("/a", { overlay_file: "overlay.json" }, async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      })),
    ).rejects.toThrow(/\/a\/overlay\.json: not valid JSON/);
    await expect(loadOverlay("/a", { overlay_file: "overlay.json" }, ok({ version: 9 }))).rejects.toThrow(
      /\/a\/overlay\.json: overlay: unsupported version 9/,
    );
  });

  it("refuses file names that could leave the dataset folder", async () => {
    for (const f of ["../x.json", "a/b.json", "/etc/passwd", "..", "a..b/c", "https://evil.example/x.json"]) {
      await expect(loadOverlay("/a", { overlay_file: f }, ok(doc()))).rejects.toThrow(/unsupported overlay_file/);
    }
  });
});

// The generated synthetic dataset (npm run make:overlay-synth) must satisfy the parser.
// import.meta.glob finds nothing when the file has not been generated, and the test is skipped.
const synth = Object.values(
  import.meta.glob("../../public/assets/city-synth/overlay.json", { eager: true, import: "default" }),
);
describe.skipIf(synth.length === 0)("synthetic overlay file", () => {
  it("parses", () => {
    const o = parseOverlay(synth[0]);
    expect(o.hotspots.map((h) => h.name)).toEqual([
      "Synthetic test hotspot A",
      "Synthetic test hotspot B",
      "Synthetic test hotspot C",
    ]);
    expect(o.hotspots.every((h) => h.confidence === "illustrative")).toBe(true);
    expect(o.landmarks).toHaveLength(6);
    expect(new Set(o.streets.map((s) => s.kind))).toEqual(new Set(["primary", "secondary", "local"]));
  });
});
