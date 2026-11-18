import { describe, expect, it } from "vitest";
import type { ExtraPlace } from "../appContext";
import {
  REGION_LABEL_MAX_ZOOM,
  REGION_PLACE_ZOOM,
  REGION_PRIORITY,
  baseLabelKinds,
  labelKindsFor,
  regionSearchItems,
} from "./regionLabels";

describe("labelKindsFor", () => {
  const base = new Set(["landmark", "hotspot"]);
  it("adds region labels only when zoomed out and landmarks are on", () => {
    expect(labelKindsFor(base, 1, true).has("region")).toBe(true);
    expect(labelKindsFor(base, REGION_LABEL_MAX_ZOOM, true).has("region")).toBe(true);
    expect(labelKindsFor(base, REGION_LABEL_MAX_ZOOM + 0.01, true).has("region")).toBe(false);
    expect(labelKindsFor(base, 1, false).has("region")).toBe(false);
    expect(labelKindsFor(base, Number.NaN, true).has("region")).toBe(false);
  });
  it("forces region labels at any zoom when a ring place is chosen, but never with Landmarks off", () => {
    expect(labelKindsFor(base, 5, true, true).has("region")).toBe(true);
    expect(labelKindsFor(base, Number.NaN, true, true).has("region")).toBe(true);
    expect(labelKindsFor(base, 5, false, true).has("region")).toBe(false);
    expect(labelKindsFor(base, 5, true, false).has("region")).toBe(false);
  });
  it("keeps the base kinds and does not modify the base set", () => {
    const out = labelKindsFor(base, 1, true);
    expect(out.has("landmark") && out.has("hotspot")).toBe(true);
    expect(base.has("region")).toBe(false);
  });
});

describe("regionSearchItems", () => {
  const places: ExtraPlace[] = [
    { id: "oakland", name: "Oakland", kind: "town", x: 1, z: 2, lon: -122.27, lat: 37.8, groundM: 5 },
  ];
  it("maps ring places to landmark search items", () => {
    expect(regionSearchItems(places)).toEqual([{ id: "oakland", name: "Oakland", group: "landmark", kind: "town", x: 1, z: 2 }]);
  });
});

describe("constants", () => {
  it("rank ring labels above ordinary landmarks and fly in gently", () => {
    expect(REGION_PRIORITY).toBeGreaterThan(50);
    expect(REGION_PLACE_ZOOM).toBeLessThan(2);
  });
});

describe("village label kind", () => {
  const on = (...ids: string[]) => (id: string) => ids.includes(id);

  it("baseLabelKinds has 'village' exactly when the villages layer is on", () => {
    expect(baseLabelKinds(on("landmarks", "hotspots", "villages")).has("village")).toBe(true);
    expect(baseLabelKinds(on("landmarks", "hotspots")).has("village")).toBe(false);
    expect([...baseLabelKinds(on("villages"))]).toEqual(["village"]);
    expect([...baseLabelKinds(on("landmarks", "hotspots"))].sort()).toEqual(["hotspot", "landmark"]);
    expect(baseLabelKinds(on("streets")).size).toBe(0);
  });

  it("labelKindsFor keeps 'village' at every zoom (the region-zoom rule only adds region labels)", () => {
    const base = baseLabelKinds(on("villages"));
    for (const zoom of [0.8, 1, REGION_LABEL_MAX_ZOOM, 3, 40, Number.NaN]) {
      for (const landmarksOn of [true, false]) {
        expect(labelKindsFor(base, zoom, landmarksOn).has("village"), `zoom ${zoom}`).toBe(true);
        expect(labelKindsFor(base, zoom, landmarksOn, true).has("village"), `forced, zoom ${zoom}`).toBe(true);
      }
    }
  });

  it("labelKindsFor never adds 'village' when the layer is off", () => {
    const base = baseLabelKinds(on("landmarks", "hotspots"));
    expect(labelKindsFor(base, 1, true, true).has("village")).toBe(false);
  });
});
