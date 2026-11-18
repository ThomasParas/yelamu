import { describe, expect, it } from "vitest";
import { overlaySearchItems, polylineMidpoint, streetSearchItems } from "./searchItems";
import type { Overlay } from "./types";

describe("polylineMidpoint", () => {
  it("is the middle of a straight segment", () => {
    expect(polylineMidpoint([0, 0, 10, 0])).toEqual({ x: 5, z: 0 });
  });

  it("goes by arc length, not by vertex count", () => {
    // 90 m then 10 m: half-length 50 m lies on the first segment
    const m = polylineMidpoint([0, 0, 90, 0, 90, 10])!;
    expect(m.x).toBeCloseTo(50);
    expect(m.z).toBeCloseTo(0);
  });

  it("crosses into later segments", () => {
    const m = polylineMidpoint([0, 0, 10, 0, 10, 30])!;
    expect(m.x).toBeCloseTo(10);
    expect(m.z).toBeCloseTo(10 + 0); // total 40, half 20: 10 m up the second segment
  });

  it("copes with degenerate lines", () => {
    expect(polylineMidpoint([])).toBeNull();
    expect(polylineMidpoint([3, 4])).toEqual({ x: 3, z: 4 });
    expect(polylineMidpoint([3, 4, 3, 4])).toEqual({ x: 3, z: 4 });
  });
});

describe("streetSearchItems", () => {
  it("keeps one item per name, at the midpoint of its longest line", () => {
    const items = streetSearchItems([
      { name: "Market St", kind: "primary", lines: [[0, 0, 10, 0], [100, 100, 300, 100]] },
      { name: "market st", kind: "primary", lines: [[0, 500, 50, 500]] },
      { name: "Oak St", kind: "local", lines: [[0, 0, 0, 20]] },
    ]);
    expect(items.map((i) => i.name)).toEqual(["Market St", "Oak St"]);
    expect(items[0]).toMatchObject({ group: "street", kind: "primary", x: 200, z: 100 });
    expect(items[1]).toMatchObject({ x: 0, z: 10 });
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
  });

  it("skips streets without usable lines", () => {
    expect(streetSearchItems([{ name: "Empty", kind: "local", lines: [] }])).toEqual([]);
  });
});

describe("overlaySearchItems", () => {
  it("combines hotspots, landmarks and streets", () => {
    const overlay: Overlay = {
      version: 1,
      streets: [{ name: "Oak St", kind: "local", lines: [[0, 0, 0, 20]] }],
      landmarks: [{ id: "peak", name: "Peak", kind: "hill", x: 1, z: 2, lon: 0, lat: 0 }],
      hotspots: [
        {
          id: "creek",
          name: "Creek",
          kind: "creek",
          x: 3,
          z: 4,
          lon: 0,
          lat: 0,
          description: "d".repeat(25),
          sources: [{ title: "t", url: "https://a.org" }],
          confidence: "inferred",
        },
      ],
      villages: [],
    };
    const items = overlaySearchItems(overlay);
    expect(items.map((i) => [i.group, i.id])).toEqual([
      ["hotspot", "creek"],
      ["landmark", "peak"],
      ["street", "street-0"],
    ]);
    expect(items[0]).toMatchObject({ x: 3, z: 4, kind: "creek" });
  });
});

describe("village search items", () => {
  const village = (id: string, name: string, x: number, z: number) => ({
    id,
    name,
    x,
    z,
    lon: -122.4,
    lat: 37.7,
    radius_m: 530,
    description: "A village site used only in tests.",
    sources: [{ title: "t", url: "https://example.org" }],
    confidence: "inferred" as const,
  });

  it("adds one 'village' item per village, after hotspots and before landmarks", () => {
    const overlay: Overlay = {
      version: 1,
      streets: [],
      landmarks: [{ id: "peak", name: "Peak", kind: "hill", x: 1, z: 2, lon: 0, lat: 0 }],
      hotspots: [],
      villages: [village("village-chutchui", "Chutchui", 7, 8)],
    };
    const items = overlaySearchItems(overlay);
    expect(items.map((i) => [i.group, i.id])).toEqual([
      ["village", "village-chutchui"],
      ["landmark", "peak"],
    ]);
    expect(items[0]).toMatchObject({ name: "Chutchui", x: 7, z: 8, kind: "village" });
  });

  it("adds nothing when there are no villages", () => {
    const overlay: Overlay = { version: 1, streets: [], landmarks: [], hotspots: [], villages: [] };
    expect(overlaySearchItems(overlay)).toEqual([]);
  });
});
