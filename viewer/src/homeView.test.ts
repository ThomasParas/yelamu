import { describe, expect, it } from "vitest";
import { fitViewSize } from "./camera";
import { homeView, mappedLandBounds } from "./homeView";

const classes = [
  { id: 0, name: "Unmapped", group: "unmapped" },
  { id: 1, name: "Bay", group: "water" },
  { id: 2, name: "Dunes", group: "dune" },
  { id: 3, name: "Tidal marsh", group: "marsh" },
];

describe("mappedLandBounds", () => {
  it("frames the mapped land only, not water or unmapped ground", () => {
    // 5 x 4 grid, 10 m cells: land in columns 1..2 of row 1 and column 3 of row 2.
    const h = Uint8Array.from([
      1, 1, 1, 1, 0,
      1, 2, 2, 1, 0,
      1, 1, 1, 3, 0,
      0, 0, 0, 0, 0,
    ]);
    // Column c sits at x = (c - 2) * 10, row r at z = (r - 1.5) * 10.
    expect(mappedLandBounds(h, 5, 4, 10, classes)).toEqual({ x0: -10, x1: 10, z0: -5, z1: 5 });
  });

  it("is null when nothing is mapped land", () => {
    expect(mappedLandBounds(Uint8Array.from([0, 1, 1, 0]), 2, 2, 10, classes)).toBeNull();
  });
});

describe("homeView", () => {
  it("centres on the rectangle and zooms by how much smaller it is than the map", () => {
    const rect = { x0: -7000, x1: 4000, z0: -4500, z1: 4200 };
    for (const aspect of [0.46, 1.6]) {
      const v = homeView(rect, 17700, 15650, 300, aspect);
      expect(v.x).toBe(-1500);
      expect(v.z).toBe(-150);
      expect(v.zoom).toBeCloseTo(fitViewSize(17700, 15650, 300, aspect) / fitViewSize(11000, 8700, 300, aspect), 9);
      expect(v.zoom).toBeGreaterThan(1.3);
    }
  });

  it("never zooms out past the whole-map fit", () => {
    expect(homeView({ x0: -1e5, x1: 1e5, z0: -1e5, z1: 1e5 }, 1000, 1000, 10, 1).zoom).toBe(1);
  });
});
