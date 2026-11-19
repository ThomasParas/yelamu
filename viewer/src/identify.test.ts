import { describe, expect, it } from "vitest";
import { describeHabitat, groundHit, habitatIdAt, isTap, surfaceY, type IdentifyGrid } from "./identify";

// A 5 x 5 grid, 10 m cells, centred on the origin (x and z from -20 to 20 m).
function grid(heightAt: (col: number, row: number) => number, exaggeration = 2): IdentifyGrid {
  const heights = new Float32Array(25);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) heights[r * 5 + c] = heightAt(c, r);
  let minM = Infinity;
  let maxM = -Infinity;
  for (const h of heights) {
    minM = Math.min(minM, h);
    maxM = Math.max(maxM, h);
  }
  return { heights, width: 5, height: 5, cellM: 10, exaggeration, waterLevelM: 0.5, minM, maxM };
}
const down = (dx: number, dz: number) => {
  const l = Math.hypot(dx, 1, dz);
  return { x: dx / l, y: -1 / l, z: dz / l };
};

describe("surfaceY", () => {
  it("interpolates the heights, scaled by the exaggeration, in the terrain mesh's frame", () => {
    const g = grid((c) => c * 2); // rising to the east: 0, 2, 4, 6, 8 m
    expect(surfaceY(g, 0, 0)).toBeCloseTo(4 * 2);
    expect(surfaceY(g, 5, 0)).toBeCloseTo(5 * 2);
    expect(surfaceY(g, 20, 20)).toBeCloseTo(8 * 2);
  });

  it("is the water level where the ground is below it, and null off the grid", () => {
    const g = grid(() => -3);
    expect(surfaceY(g, 0, 0)).toBeCloseTo(0.5 * 2);
    expect(surfaceY(g, 20.1, 0)).toBeNull();
    expect(surfaceY(g, 0, -21)).toBeNull();
  });
});

describe("groundHit", () => {
  it("finds the point below a straight-down ray", () => {
    const g = grid(() => 5);
    const hit = groundHit(g, { x: 3, y: 1000, z: -4 }, { x: 0, y: -1, z: 0 });
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(3);
    expect(hit!.y).toBeCloseTo(10);
    expect(hit!.z).toBeCloseTo(-4);
  });

  it("lands on the slope where a slanted ray meets it (to well under a metre)", () => {
    const g = grid((c) => c * 4); // y = 2 * 4 * (x / 10 + 2) = 0.8x + 16
    const dir = down(1, 0.5);
    const L = 500; // start well up the ray that passes over the grid's centre at y = 30
    const origin = { x: -L * dir.x, y: 30 - L * dir.y, z: -L * dir.z };
    const hit = groundHit(g, origin, dir)!;
    expect(hit).not.toBeNull();
    expect(Math.abs(hit.y - surfaceY(g, hit.x, hit.z)!)).toBeLessThan(0.01);
    // It is the first crossing: a little earlier along the ray is still above the ground.
    const back = { x: hit.x - dir.x * 2, y: hit.y - dir.y * 2, z: hit.z - dir.z * 2 };
    expect(back.y).toBeGreaterThan(surfaceY(g, back.x, back.z) ?? -Infinity);
  });

  it("stops at the first hill, not the ground behind it", () => {
    const g = grid((c) => (c === 2 ? 20 : 0)); // a ridge along the middle column
    const hit = groundHit(g, { x: -400, y: 400, z: 0 }, down(1, 0))!;
    // The ray (y = -x) meets the ridge's near face (y = 4x + 40 for -10 < x < 0) at x = -8.
    expect(hit.x).toBeCloseTo(-8, 1);
    expect(hit.y).toBeCloseTo(8, 1);
  });

  it("returns null when the ray misses the grid or points up", () => {
    const g = grid(() => 1);
    expect(groundHit(g, { x: 500, y: 100, z: 0 }, down(1, 0))).toBeNull();
    expect(groundHit(g, { x: 0, y: 100, z: 0 }, { x: 0, y: 1, z: 0 })).toBeNull();
  });
});

describe("habitatIdAt", () => {
  it("reads the nearest cell, row 0 to the north", () => {
    const g = grid(() => 1);
    const habitat = Uint8Array.from({ length: 25 }, (_, i) => i);
    expect(habitatIdAt(g, habitat, -20, -20)).toBe(0);
    expect(habitatIdAt(g, habitat, 0, 0)).toBe(12);
    expect(habitatIdAt(g, habitat, 14, 16)).toBe(4 * 5 + 3);
    expect(habitatIdAt(g, habitat, 26, 0)).toBeNull();
  });
});

describe("describeHabitat", () => {
  const classes = [
    { id: 0, name: "Unmapped", group: "unmapped" },
    { id: 6, name: "Beach", group: "beach" },
    { id: 12, name: "Coastal scrub", group: "scrub" },
    { id: 40, name: "Mystery", group: "nonsense" },
  ];

  it("names the mapped type and its legend group", () => {
    expect(describeHabitat(classes, 12)).toEqual({ group: "scrub", title: "Coastal scrub", detail: "Scrub" });
  });

  it("gives the project's own classes plain names", () => {
    const own = [{ id: 2, name: "Bay (hand-drawn)", group: "water" }, { id: 3, name: "Marsh (hand-drawn)", group: "marsh" }];
    expect(describeHabitat(own, 2)).toEqual({ group: "water", title: "Bay", detail: "Bay, ocean and ponds" });
    expect(describeHabitat(own, 3).title).toBe("Tidal marsh");
  });

  it("does not repeat the group when it has the same name", () => {
    expect(describeHabitat(classes, 6)).toEqual({ group: "beach", title: "Beach", detail: "" });
  });

  it("calls unmapped, unknown-group and missing ids not covered", () => {
    for (const id of [0, 40, 99]) {
      expect(describeHabitat(classes, id).group).toBe("unmapped");
      expect(describeHabitat(classes, id).title).toBe("Not covered by the historical habitat map");
    }
  });
});

describe("isTap", () => {
  it("is a short, still, one-finger press", () => {
    expect(isTap(0, 100, 1)).toBe(true);
    expect(isTap(8 * 8, 500, 1)).toBe(true);
    expect(isTap(9 * 9, 100, 1)).toBe(false); // a drag
    expect(isTap(0, 800, 1)).toBe(false); // a long press
    expect(isTap(0, 100, 2)).toBe(false); // a pinch
  });
});
