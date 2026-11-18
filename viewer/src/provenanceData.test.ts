import { describe, expect, it } from "vitest";
import type { HandSource } from "./heightmap";
import { HAND_SOURCES_NOTE, OVERLAY_NOTE, VEGETATION_NOTE, formatValue, handSourceRows, processingEntries } from "./provenanceData";

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

describe("handSourceRows", () => {
  const hs = (over: Record<string, unknown> = {}) =>
    ({ layer: "hand_water", source: "Coast Survey", confidence: "inferred", count: 3, ...over }) as HandSource;

  it("labels the known layers and words the count", () => {
    const rows = handSourceRows([
      hs(),
      hs({ layer: "landforms", source: "Sculpted", count: 2 }),
      hs({ layer: "ponds", source: "Pond file", count: 1, confidence: "documented" }),
    ]);
    expect(rows).toEqual([
      { layer: "hand_water", label: "Hand-drawn water", source: "Coast Survey", confidence: "inferred", countText: "3 polygons" },
      { layer: "landforms", label: "Sculpted landforms", source: "Sculpted", confidence: "inferred", countText: "2 landforms" },
      { layer: "ponds", label: "Ponds", source: "Pond file", confidence: "documented", countText: "1 pond" },
    ]);
  });

  it("labels the villages layer after ponds, with singular and plural counts", () => {
    const rows = handSourceRows([
      hs({ layer: "villages", source: "SFEI", count: 5 }),
      hs({ layer: "ponds", source: "Pond file", count: 1 }),
    ]);
    expect(rows.map((r) => r.layer)).toEqual(["ponds", "villages"]);
    expect(rows[1]).toMatchObject({ label: "Village sites", countText: "5 villages" });
    expect(handSourceRows([hs({ layer: "villages", count: 1 })])[0].countText).toBe("1 village");
  });

  it("uses singular and plural correctly, including zero", () => {
    expect(handSourceRows([hs({ count: 1 })])[0].countText).toBe("1 polygon");
    expect(handSourceRows([hs({ count: 0 })])[0].countText).toBe("0 polygons");
    expect(handSourceRows([hs({ layer: "landforms", count: 1 })])[0].countText).toBe("1 landform");
    expect(handSourceRows([hs({ layer: "ponds", count: 5 })])[0].countText).toBe("5 ponds");
  });

  it("sorts known layers in a fixed order, then others by id, then by source", () => {
    const rows = handSourceRows([
      hs({ layer: "zeta_layer", source: "a" }),
      hs({ layer: "ponds", source: "b" }),
      hs({ layer: "hand_water", source: "z source" }),
      hs({ layer: "alpha_layer", source: "a" }),
      hs({ layer: "hand_water", source: "a source" }),
      hs({ layer: "landforms", source: "m" }),
    ]);
    expect(rows.map((r) => `${r.layer}:${r.source}`)).toEqual([
      "hand_water:a source",
      "hand_water:z source",
      "landforms:m",
      "ponds:b",
      "alpha_layer:a",
      "zeta_layer:a",
    ]);
  });

  it("humanises unknown layer ids and counts them as items", () => {
    const rows = handSourceRows([hs({ layer: "wind_gaps", count: 2 }), hs({ layer: "constructor", count: 1 })]);
    expect(rows.map((r) => r.label)).toEqual(["Constructor", "Wind gaps"]);
    expect(rows[1].countText).toBe("2 items");
    expect(rows[0].countText).toBe("1 item");
  });

  it("tolerates junk input", () => {
    for (const bad of [undefined, null, "x", 5, {}, true]) {
      expect(handSourceRows(bad as unknown as HandSource[])).toEqual([]);
    }
    expect(handSourceRows([])).toEqual([]);
    const rows = handSourceRows([
      null,
      5,
      "str",
      [],
      {},
      { layer: "" },
      { layer: "   " },
      { layer: 7 },
      hs(),
    ] as unknown as HandSource[]);
    expect(rows).toHaveLength(1);
  });

  it("fills in missing fields without throwing", () => {
    const rows = handSourceRows([
      { layer: "ponds" },
      { layer: "ponds", source: "   ", confidence: 5, count: "3" },
      { layer: "ponds", source: "x", count: -1 },
      { layer: "ponds", source: "y", count: 1.5 },
      { layer: "ponds", source: "z", count: NaN },
    ] as unknown as HandSource[]);
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r.countText).toBe("");
      expect(r.confidence).toBe("");
    }
    expect(rows.find((r) => r.source === "Source not recorded")).toBeDefined();
  });

  it("clips very long text", () => {
    const row = handSourceRows([hs({ source: "s".repeat(1000), layer: "q".repeat(500) })])[0];
    expect(row.source.length).toBe(200);
    expect(row.label.length).toBeLessThanOrEqual(60);
  });

  it("does not modify its input", () => {
    const input = [hs({ layer: "ponds" }), hs()];
    const copy = JSON.stringify(input);
    handSourceRows(input);
    expect(JSON.stringify(input)).toBe(copy);
  });
});

describe("HAND_SOURCES_NOTE", () => {
  it("is plain text", () => {
    expect(HAND_SOURCES_NOTE).toMatch(/^Features drawn or sculpted by hand/);
  });
});
