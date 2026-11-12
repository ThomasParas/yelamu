import { describe, expect, it } from "vitest";
import { OVERLAY_NOTE, VEGETATION_NOTE, formatValue, processingEntries } from "./provenanceData";

describe("formatValue", () => {
  it("formats scalars", () => {
    expect(formatValue(30)).toBe("30");
    expect(formatValue(0.123456789)).toBe("0.1235");
    expect(formatValue("abc")).toBe("abc");
    expect(formatValue(true)).toBe("yes");
    expect(formatValue(false)).toBe("no");
    expect(formatValue(null)).toBe("not recorded");
    expect(formatValue(undefined)).toBe("not recorded");
    expect(formatValue(NaN)).toBe("NaN");
  });

  it("serialises objects and clips long values", () => {
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
    expect(formatValue("x".repeat(500)).length).toBe(200);
    expect(formatValue("x".repeat(500)).endsWith("…")).toBe(true);
  });

  it("survives values that cannot be serialised", () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(typeof formatValue(loop)).toBe("string");
  });
});

describe("processingEntries", () => {
  it("labels the known parameters, with units, in a fixed order", () => {
    const rows = processingEntries({
      coverage: 0.82,
      shore_open_cells: 12,
      smooth_m: 30,
      open_water_max_m: 6,
      shelf_m: 80,
      shore_slope: 0.05,
    });
    expect(rows.map((r) => r.key)).toEqual([
      "smooth_m",
      "shelf_m",
      "shore_slope",
      "shore_open_cells",
      "open_water_max_m",
      "coverage",
    ]);
    expect(rows[0]).toEqual({ key: "smooth_m", label: "Terrain smoothing distance", value: "30 m" });
    expect(rows[3].value).toBe("12 cells");
    expect(rows[2].value).toBe("0.05");
    expect(rows[5].value).toBe("0.82");
  });

  it("appends unknown keys alphabetically with a humanised label", () => {
    const rows = processingEntries({ zeta_value: 1, alpha_beta: "x", smooth_m: 10 });
    expect(rows.map((r) => r.key)).toEqual(["smooth_m", "alpha_beta", "zeta_value"]);
    expect(rows[1].label).toBe("Alpha beta");
  });

  it("does not add a unit to a non-numeric value and handles missing input", () => {
    expect(processingEntries({ smooth_m: "n/a" })[0].value).toBe("n/a");
    expect(processingEntries(undefined)).toEqual([]);
    expect(processingEntries({})).toEqual([]);
  });

  it("ignores inherited properties", () => {
    expect(processingEntries(Object.create({ smooth_m: 5 }) as Record<string, unknown>)).toEqual([]);
  });
});

describe("OVERLAY_NOTE", () => {
  it("is the agreed wording", () => {
    expect(OVERLAY_NOTE).toBe(
      "Modern streets: US Census Bureau TIGER/Line, approximate positions; landmarks are approximate.",
    );
  });
});

describe("VEGETATION_NOTE", () => {
  it("says the shapes are illustrative", () => {
    expect(VEGETATION_NOTE).toBe(
      "Vegetation shapes (trees, shrubs, reeds) are illustrative: they show the kind of plants, not individual plants.",
    );
  });
});
