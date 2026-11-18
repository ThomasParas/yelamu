import { describe, expect, it } from "vitest";
import type { ExtraPlace } from "../appContext";
import {
  REGION_LABEL_MAX_ZOOM,
  REGION_PLACE_ZOOM,
  REGION_PRIORITY,
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
