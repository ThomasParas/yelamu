import { describe, expect, it } from "vitest";
import { layerDefsFor } from "./layerDefs";

describe("layerDefsFor", () => {
  it("adds the on-by-default 'Village sites' toggle after Hotspots when the dataset has villages", () => {
    const defs = layerDefsFor(true);
    expect(defs.map((d) => d.id)).toEqual(["streets", "landmarks", "hotspots", "villages"]);
    expect(defs[3]).toEqual({ id: "villages", label: "Village sites", defaultOn: true });
  });

  it("leaves it out (no toggle) when the dataset has none, keeping today's three", () => {
    expect(layerDefsFor(false)).toEqual([
      { id: "streets", label: "Streets", defaultOn: false },
      { id: "landmarks", label: "Landmarks", defaultOn: true },
      { id: "hotspots", label: "Hotspots", defaultOn: true },
    ]);
  });
});
