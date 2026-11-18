import { describe, expect, it } from "vitest";
import { decodeState, encodeState, isPlaceId, type AppState } from "./appState";

const base: AppState = { x: 123.4, z: -56.7, zoom: 3.2, rot: 1, layers: ["landmarks", "streets"] };

describe("encodeState", () => {
  it("produces the compact documented form without a leading #", () => {
    expect(encodeState(base)).toBe("x=123.4&z=-56.7&k=3.20&r=1&l=landmarks,streets");
  });

  it("rounds x and z to 0.1 and zoom to 2 decimals", () => {
    expect(encodeState({ ...base, x: 1.26, z: -0.04, zoom: 2.34567, layers: undefined })).toBe(
      "x=1.3&z=0.0&k=2.35&r=1",
    );
  });

  it("never writes a negative zero", () => {
    expect(encodeState({ ...base, x: -0.01, z: -0, layers: undefined })).toBe("x=0.0&z=0.0&k=3.20&r=1");
  });

  it("omits l only when layers is unset", () => {
    expect(encodeState({ ...base, layers: undefined })).not.toContain("l=");
  });

  it("writes an explicit empty selection as an empty l=", () => {
    expect(encodeState({ ...base, layers: [] })).toBe("x=123.4&z=-56.7&k=3.20&r=1&l=");
  });

  it("sorts and de-duplicates layers and drops invalid ids", () => {
    const s = encodeState({ ...base, layers: ["b", "a", "b", "Bad Id", "x&y"] });
    expect(s.endsWith("l=a,b")).toBe(true);
  });

  it("normalises the rotation into 0..3", () => {
    expect(encodeState({ ...base, rot: 5, layers: undefined })).toContain("r=1");
    expect(encodeState({ ...base, rot: -1, layers: undefined })).toContain("r=3");
  });

  it("skips non-finite numbers rather than writing NaN", () => {
    const s = encodeState({ ...base, x: NaN, zoom: Infinity, layers: undefined });
    expect(s).toBe("z=-56.7&r=1");
  });
});

describe("decodeState", () => {
  it("round-trips an encoded state", () => {
    expect(decodeState(encodeState(base))).toEqual(base);
  });

  it("round-trips with unset layers (layers key stays absent)", () => {
    const s = { ...base, layers: undefined };
    const d = decodeState(encodeState(s));
    expect(d).toEqual({ x: 123.4, z: -56.7, zoom: 3.2, rot: 1 });
    expect("layers" in d).toBe(false);
  });

  it("round-trips an explicit empty selection", () => {
    const d = decodeState(encodeState({ ...base, layers: [] }));
    expect(d.layers).toEqual([]);
  });

  it("a hash without l has no layers key; l= has an empty one", () => {
    expect("layers" in decodeState("x=1&z=2")).toBe(false);
    expect(decodeState("x=1&l=").layers).toEqual([]);
  });

  it("accepts a leading #, with or without", () => {
    expect(decodeState("#x=5&z=6")).toEqual({ x: 5, z: 6 });
    expect(decodeState("x=5&z=6")).toEqual({ x: 5, z: 6 });
  });

  it("returns an empty object for empty or garbage input", () => {
    expect(decodeState("")).toEqual({});
    expect(decodeState("#")).toEqual({});
    expect(decodeState("&&&===&")).toEqual({});
    expect(decodeState("lorem ipsum")).toEqual({});
    expect(decodeState("\u0000￿%%%")).toEqual({});
  });

  it("ignores unknown keys", () => {
    expect(decodeState("x=1&foo=bar&__proto__=1&constructor=2")).toEqual({ x: 1 });
  });

  it("omits non-finite and non-numeric values", () => {
    expect(decodeState("x=NaN&z=Infinity&k=-Infinity&r=abc")).toEqual({});
    expect(decodeState("x=&z=&k=&r=")).toEqual({});
    expect(decodeState("x=1e999&z=0x10&k=1,5")).toEqual({});
  });

  it("keeps huge but finite numbers (the rig clamps them)", () => {
    expect(decodeState("x=1e300")).toEqual({ x: 1e300 });
  });

  it("accepts negative, decimal and exponent forms", () => {
    expect(decodeState("x=-12.5&z=.5&k=2e0")).toEqual({ x: -12.5, z: 0.5, zoom: 2 });
  });

  it("clamps r to an integer 0..3 (mod 4)", () => {
    expect(decodeState("r=0").rot).toBe(0);
    expect(decodeState("r=3").rot).toBe(3);
    expect(decodeState("r=4").rot).toBe(0);
    expect(decodeState("r=-1").rot).toBe(3);
    expect(decodeState("r=6").rot).toBe(2);
    expect(decodeState("r=1.6").rot).toBe(2);
    expect(decodeState("r=1e20").rot).toBe(0);
  });

  it("duplicate keys: the last valid value wins", () => {
    expect(decodeState("x=1&x=2&x=3")).toEqual({ x: 3 });
    expect(decodeState("x=1&x=oops")).toEqual({ x: 1 });
  });

  it("splits layers on commas, keeps valid ids, de-duplicates, sorts", () => {
    expect(decodeState("l=streets,landmarks,streets").layers).toEqual(["landmarks", "streets"]);
    expect(decodeState("l=a-b,c1").layers).toEqual(["a-b", "c1"]);
  });

  it("drops layer ids that are not lowercase alphanumerics or hyphens", () => {
    expect(decodeState("l=ok,Bad,has space,a_b,<script>,x.y,,").layers).toEqual(["ok"]);
  });

  it("caps layers at 12", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `l${String(i).padStart(2, "0")}`);
    const out = decodeState(`l=${ids.join(",")}`).layers!;
    expect(out).toHaveLength(12);
    expect(out).toEqual(ids.slice(0, 12));
  });

  it("treats an explicit empty l= as an explicit empty selection", () => {
    expect(decodeState("l=").layers).toEqual([]);
  });

  it("neutralises script-looking input", () => {
    const d = decodeState("x=<script>alert(1)</script>&l=<img src=x onerror=alert(1)>&r=javascript:1");
    expect(d).toEqual({ layers: [] });
  });

  it("percent-decodes values and survives malformed escapes", () => {
    expect(decodeState("l=a%2Cb")).toEqual({ layers: ["a", "b"] });
    expect(() => decodeState("x=%E0%A4%A&l=%")).not.toThrow();
  });

  it("never throws on pathological input", () => {
    const inputs = ["#".repeat(100000), "x=".repeat(50000), "=".repeat(10), "&".repeat(10), "x=1&".repeat(10000)];
    for (const i of inputs) expect(() => decodeState(i)).not.toThrow();
    // @ts-expect-error deliberately wrong type
    expect(decodeState(undefined)).toEqual({});
    // @ts-expect-error deliberately wrong type
    expect(decodeState(null)).toEqual({});
  });
});

describe("place (p=)", () => {
  it("is written after the layers and only when set and valid", () => {
    expect(encodeState({ ...base, place: "mission-creek" })).toBe(
      "x=123.4&z=-56.7&k=3.20&r=1&l=landmarks,streets&p=mission-creek",
    );
    expect(encodeState({ ...base, layers: undefined, place: "a1" }).endsWith("&r=1&p=a1")).toBe(true);
    expect(encodeState({ ...base, place: undefined })).not.toContain("p=");
    expect(encodeState({ ...base, place: "" })).not.toContain("p=");
    expect(encodeState({ ...base, place: "Bad Id&x=1" })).not.toContain("p=");
    expect(encodeState({ ...base, place: "a".repeat(49) })).not.toContain("p=");
  });

  it("round-trips", () => {
    const s = { ...base, place: "lobos-creek" };
    expect(decodeState(encodeState(s))).toEqual(s);
  });

  it("accepts ids up to 48 characters and no more", () => {
    expect(decodeState(`p=${"a".repeat(48)}`).place).toBe("a".repeat(48));
    expect(decodeState(`p=${"a".repeat(49)}`)).toEqual({});
  });

  it("rejects ids that are not lowercase alphanumerics and hyphens, or start with a hyphen", () => {
    for (const bad of ["Upper", "-lead", "has space", "a_b", "a.b", "<script>", "a%2Fb", ""]) {
      expect(decodeState(`p=${bad}`).place).toBeUndefined();
    }
    expect(decodeState("p=0abc-d").place).toBe("0abc-d");
  });

  it("keeps the last valid value of a repeated key", () => {
    expect(decodeState("p=one&p=BAD").place).toBe("one");
    expect(decodeState("p=one&p=two").place).toBe("two");
  });
});

describe("isPlaceId", () => {
  it("validates", () => {
    expect(isPlaceId("a")).toBe(true);
    expect(isPlaceId("a-b-1")).toBe(true);
    expect(isPlaceId("")).toBe(false);
    expect(isPlaceId(5)).toBe(false);
    expect(isPlaceId(undefined)).toBe(false);
  });
});

describe("village place ids (p=village-xxx)", () => {
  it("are valid place ids and round-trip", () => {
    expect(isPlaceId("village-chutchui")).toBe(true);
    expect(decodeState("p=village-petlenuc").place).toBe("village-petlenuc");
    expect(decodeState(encodeState({ ...base, place: "village-sitlintac" })).place).toBe("village-sitlintac");
  });
});
