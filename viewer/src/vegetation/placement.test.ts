import { describe, expect, it } from "vitest";
import { planChunks, type ChunkPlan } from "../chunks";
import { GROUP_COLORS, type HabitatClass } from "../habitat";
import {
  MAX_SLOPE_DEG,
  VEGETATION_BY_GROUP,
  chunkSeed,
  groupNameForClass,
  heightOnMesh,
  placeChunkVegetation,
  vegetationForGroup,
} from "./placement";

const CLASSES: HabitatClass[] = [
  { id: 0, name: "Unmapped", group: "unmapped" },
  { id: 1, name: "Bay", group: "water" },
  { id: 2, name: "Marsh", group: "marsh" },
  { id: 3, name: "Dune", group: "dune" },
  { id: 4, name: "Beach", group: "beach" },
  { id: 5, name: "Oak", group: "woodland" },
  { id: 7, name: "Prairie", group: "grassland" },
  { id: 9, name: "Scrub", group: "scrub" },
  { id: 10, name: "Willow", group: "wetland" },
  { id: 11, name: "Rock", group: "rock" },
  { id: 12, name: "Odd", group: "no-such-group" },
];
const groupOf = groupNameForClass(CLASSES);
const WATER = 0.6;

interface Grid {
  size: { width: number; height: number; cell_m: number };
  heights: Float32Array;
  habitat: Uint8Array;
}
function grid(
  width: number,
  height: number,
  heightAt: (x: number, y: number) => number,
  classAt: (x: number, y: number) => number,
  cell_m = 10,
): Grid {
  const heights = new Float32Array(width * height);
  const habitat = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      heights[y * width + x] = heightAt(x, y);
      habitat[y * width + x] = classAt(x, y);
    }
  }
  return { size: { width, height, cell_m }, heights, habitat };
}

function place(g: Grid, chunk: ChunkPlan, over: Partial<Parameters<typeof placeChunkVegetation>[0]> = {}) {
  return placeChunkVegetation({
    chunk,
    size: g.size,
    heights: g.heights,
    habitat: g.habitat,
    groupOfClass: groupOf,
    waterLevelM: WATER,
    seed: 1234,
    maxInstances: 100_000,
    ...over,
  });
}

/** Sample-space position of an instance (inverse of the world mapping in terrainMesh.ts). */
const toSample = (g: Grid, v: { x: number; z: number }) => ({
  px: v.x / g.size.cell_m + (g.size.width - 1) / 2,
  py: v.z / g.size.cell_m + (g.size.height - 1) / 2,
});

describe("VEGETATION_BY_GROUP", () => {
  it("has the specified table", () => {
    const t = VEGETATION_BY_GROUP;
    expect(t.woodland).toMatchObject({ kind: "tree", perHectare: 45 });
    expect(t.scrub).toMatchObject({ kind: "shrub", perHectare: 70 });
    expect(t.grassland).toMatchObject({ kind: "shrub", perHectare: 6 });
    expect(t.dune).toMatchObject({ kind: "shrub", perHectare: 8 });
    expect(t.wetland).toMatchObject({ kind: "reed", perHectare: 60 });
    expect(t.marsh).toMatchObject({ kind: "reed", perHectare: 90 });
    for (const g of ["beach", "water", "rock", "unmapped"]) expect(t[g]).toBeNull();
  });
  it("covers every habitat group and has sane scale ranges", () => {
    for (const g of Object.keys(GROUP_COLORS)) expect(Object.hasOwn(VEGETATION_BY_GROUP, g)).toBe(true);
    for (const spec of Object.values(VEGETATION_BY_GROUP)) {
      if (!spec) continue;
      expect(spec.minScale).toBeGreaterThan(0);
      expect(spec.maxScale).toBeGreaterThanOrEqual(spec.minScale);
      expect(spec.perHectare).toBeGreaterThan(0);
    }
  });
  it("vegetationForGroup ignores prototype keys and unknown groups", () => {
    expect(vegetationForGroup("woodland")?.kind).toBe("tree");
    expect(vegetationForGroup("toString")).toBeNull();
    expect(vegetationForGroup("nope")).toBeNull();
  });
});

describe("groupNameForClass", () => {
  it("maps ids to groups; unknown ids and unknown groups are unmapped", () => {
    expect(groupOf(5)).toBe("woodland");
    expect(groupOf(1)).toBe("water");
    expect(groupOf(12)).toBe("unmapped");
    expect(groupOf(200)).toBe("unmapped");
    expect(groupNameForClass([])(3)).toBe("unmapped");
  });
});

describe("chunkSeed", () => {
  it("is deterministic and depends on every argument", () => {
    expect(chunkSeed(1, 2, 3)).toBe(chunkSeed(1, 2, 3));
    const seeds = new Set([chunkSeed(1, 2, 3), chunkSeed(2, 2, 3), chunkSeed(1, 3, 3), chunkSeed(1, 2, 4), chunkSeed(1, 3, 2)]);
    expect(seeds.size).toBe(5);
    expect(Number.isInteger(chunkSeed(1, 2, 3))).toBe(true);
  });
});

describe("heightOnMesh", () => {
  it("interpolates exactly on the rendered triangles (diagonal SW-NE)", () => {
    // 2x2 samples: a=NW=0, c=NE=10, b=SW=20, d=SE=40
    const h = new Float32Array([0, 10, 20, 40]);
    const size = { width: 2, height: 2, cell_m: 1 };
    expect(heightOnMesh(h, size, 0, 0)).toBe(0);
    expect(heightOnMesh(h, size, 1, 0)).toBe(10);
    expect(heightOnMesh(h, size, 0, 1)).toBe(20);
    expect(heightOnMesh(h, size, 1, 1)).toBe(40);
    // on the diagonal b-c (u+v=1) both triangles agree: midpoint of 20 and 10
    expect(heightOnMesh(h, size, 0.5, 0.5)).toBeCloseTo(15, 5);
    // inside triangle (a,b,c): a + u(c-a) + v(b-a)
    expect(heightOnMesh(h, size, 0.25, 0.25)).toBeCloseTo(0 + 0.25 * 10 + 0.25 * 20, 5);
    // inside triangle (b,d,c): d + (1-u)(b-d) + (1-v)(c-d)
    expect(heightOnMesh(h, size, 0.75, 0.75)).toBeCloseTo(40 + 0.25 * (20 - 40) + 0.25 * (10 - 40), 5);
  });
});

describe("placeChunkVegetation", () => {
  const woodland = grid(129, 129, () => 50, () => 5);
  const full = planChunks(129, 129, 128)[0];

  it("is deterministic", () => {
    const a = place(woodland, full);
    const b = place(woodland, full);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it("differs for different seeds and different chunks", () => {
    const a = place(woodland, full);
    const b = place(woodland, full, { seed: 99 });
    expect(b).not.toEqual(a);
    const g = grid(257, 129, () => 50, () => 5);
    const [c0, c1] = planChunks(257, 129, 128);
    const p0 = place(g, c0);
    const p1 = place(g, c1);
    // same relative layout would mean the seed ignored the chunk index
    const rel = (list: typeof p0, chunk: ChunkPlan) =>
      list.slice(0, 5).map((v) => [toSample(g, v).px - chunk.x0, toSample(g, v).py - chunk.y0]);
    expect(rel(p1, c1)).not.toEqual(rel(p0, c0));
  });

  it("reaches the expected density on a big woodland patch (within 15%)", () => {
    const list = place(woodland, full);
    const hectares = (128 * 10 * 128 * 10) / 10_000;
    const expected = 45 * hectares;
    expect(list.length).toBeGreaterThan(expected * 0.85);
    expect(list.length).toBeLessThan(expected * 1.15);
    expect(list.every((v) => v.kind === "tree" && v.group === "woodland")).toBe(true);
  });

  it("reaches the expected density for each vegetated group", () => {
    for (const [classId, group] of [
      [9, "scrub"],
      [3, "dune"],
      [7, "grassland"],
      [10, "wetland"],
      [2, "marsh"],
    ] as const) {
      const g = grid(129, 129, () => 50, () => classId);
      const list = place(g, full);
      const expected = VEGETATION_BY_GROUP[group]!.perHectare * 163.84;
      // sparse groups have few instances, so allow more relative noise there
      const tol = expected > 500 ? 0.15 : 0.3;
      expect(list.length, group).toBeGreaterThan(expected * (1 - tol));
      expect(list.length, group).toBeLessThan(expected * (1 + tol));
    }
  });

  it("does not double count shared chunk borders", () => {
    const g = grid(257, 129, () => 50, () => 5);
    const [c0, c1] = planChunks(257, 129, 128);
    const total = place(g, c0).length + place(g, c1).length;
    const expected = 45 * (256 * 128 * 100) / 10_000;
    expect(total).toBeGreaterThan(expected * 0.9);
    expect(total).toBeLessThan(expected * 1.1);
  });

  it("respects maxInstances and thins uniformly and deterministically", () => {
    // west half woodland (trees), east half scrub (shrubs): thinning must keep the mix and the spread
    const g = grid(129, 129, () => 50, (x) => (x < 64 ? 5 : 9));
    const all = place(g, full);
    const capped = place(g, full, { maxInstances: 1500 });
    expect(capped.length).toBe(1500);
    expect(place(g, full, { maxInstances: 1500 })).toEqual(capped);
    // every kept instance is one of the unthinned ones
    const key = (v: { x: number; z: number }) => `${v.x},${v.z}`;
    const allKeys = new Set(all.map(key));
    expect(capped.every((v) => allKeys.has(key(v)))).toBe(true);
    // the share of trees is preserved (within a few points)
    const share = (l: typeof all) => l.filter((v) => v.kind === "tree").length / l.length;
    expect(Math.abs(share(capped) - share(all))).toBeLessThan(0.04);
    // spread: each quadrant keeps about its proportional part
    const quad = (l: typeof all) => {
      const q = [0, 0, 0, 0];
      for (const v of l) {
        const { px, py } = toSample(g, v);
        q[(px < 64 ? 0 : 1) + (py < 64 ? 0 : 2)]++;
      }
      return q.map((n) => n / l.length);
    };
    const qa = quad(all);
    const qc = quad(capped);
    for (let i = 0; i < 4; i++) expect(Math.abs(qa[i] - qc[i])).toBeLessThan(0.04);
    // exactly at the limit and below it: nothing is removed
    expect(place(g, full, { maxInstances: all.length })).toEqual(all);
    expect(place(g, full, { maxInstances: 0 })).toEqual([]);
  });

  it("puts nothing on water, unmapped, beach, rock or unknown groups", () => {
    for (const classId of [0, 1, 4, 11, 12, 99]) {
      const g = grid(65, 65, () => 50, () => classId);
      expect(place(g, planChunks(65, 65, 64)[0]), `class ${classId}`).toEqual([]);
    }
  });

  it("assigns each instance the group and kind of the sample it stands on", () => {
    // vertical stripes of classes
    const stripes = [5, 4, 9, 11, 10, 1, 3, 0];
    const g = grid(129, 65, () => 50, (x) => stripes[Math.floor(x / 16) % stripes.length]);
    const list = place(g, planChunks(129, 65, 128)[0]);
    expect(list.length).toBeGreaterThan(100);
    const kinds = { woodland: "tree", scrub: "shrub", wetland: "reed", dune: "shrub" } as Record<string, string>;
    const seen = new Set<string>();
    for (const v of list) {
      const { px, py } = toSample(g, v);
      const id = g.habitat[Math.round(py) * 129 + Math.round(px)];
      expect(groupOf(id)).toBe(v.group);
      expect(v.kind).toBe(kinds[v.group]);
      seen.add(v.group);
    }
    expect([...seen].sort()).toEqual(["dune", "scrub", "wetland", "woodland"]);
  });

  it("keeps trees and shrubs off the shore band but lets reeds reach the water line", () => {
    const wl = WATER;
    for (const [classId, kind, offset, expectAny] of [
      [5, "tree", 0.2, false], // <= water + 0.3
      [9, "shrub", 0.29, false],
      [5, "tree", 0.35, true],
      [10, "reed", 0.1, true], // wetland reeds down to water + 0.05
      [2, "reed", 0.1, true],
      [2, "reed", 0.02, false],
      [2, "reed", -0.5, false], // marsh below water level: tidal, no reeds
    ] as const) {
      const g = grid(65, 65, () => wl + offset, () => classId);
      const list = place(g, planChunks(65, 65, 64)[0]);
      expect(list.length > 0, `${kind} at +${offset}`).toBe(expectAny);
      if (expectAny) expect(list.every((v) => v.kind === kind)).toBe(true);
    }
  });

  it("skips ground steeper than 35 degrees but keeps gentle slopes", () => {
    const rise = (deg: number) => Math.tan((deg * Math.PI) / 180) * 10; // metres per 10 m cell
    expect(MAX_SLOPE_DEG).toBe(35);
    const steep = grid(65, 65, (x) => 20 + x * rise(40), () => 5);
    expect(place(steep, planChunks(65, 65, 64)[0])).toEqual([]);
    const gentle = grid(65, 65, (x) => 20 + x * rise(30), () => 5);
    expect(place(gentle, planChunks(65, 65, 64)[0]).length).toBeGreaterThan(100);
    // a steep half and a gentle half: trees only on the gentle side
    const mixed = grid(65, 65, (x) => 20 + (x < 32 ? x * rise(45) : 32 * rise(45) + (x - 32) * rise(10)), () => 5);
    const list = place(mixed, planChunks(65, 65, 64)[0]);
    expect(list.length).toBeGreaterThan(50);
    for (const v of list) expect(toSample(mixed, v).px).toBeGreaterThan(31.4);
  });

  it("stands every instance on the rendered surface (un-exaggerated height)", () => {
    const g = grid(65, 65, (x, y) => 20 + 3 * Math.sin(x / 7) + 2 * Math.cos(y / 5), () => 5);
    const list = place(g, planChunks(65, 65, 64)[0]);
    expect(list.length).toBeGreaterThan(50);
    for (const v of list) {
      const { px, py } = toSample(g, v);
      expect(v.y).toBeCloseTo(heightOnMesh(g.heights, g.size, px, py), 4);
    }
  });

  it("keeps positions inside the chunk (world frame of terrainMesh.ts)", () => {
    const g = grid(300, 200, () => 50, () => 5);
    const plan = planChunks(300, 200, 128);
    for (const chunk of plan) {
      const list = place(g, chunk, { maxInstances: 100_000 });
      expect(list.length).toBeGreaterThan(0);
      const cx = (g.size.width - 1) / 2;
      const cz = (g.size.height - 1) / 2;
      const xMin = (chunk.x0 - cx) * 10;
      const xMax = (chunk.x0 + chunk.w - cx) * 10;
      const zMin = (chunk.y0 - cz) * 10;
      const zMax = (chunk.y0 + chunk.h - cz) * 10;
      for (const v of list) {
        expect(v.x).toBeGreaterThanOrEqual(xMin);
        expect(v.x).toBeLessThanOrEqual(xMax);
        expect(v.z).toBeGreaterThanOrEqual(zMin);
        expect(v.z).toBeLessThanOrEqual(zMax);
      }
    }
  });

  it("keeps scale within the group's range and rotation within a turn", () => {
    const g = grid(129, 129, () => 50, (x) => [5, 9, 3, 10][Math.floor(x / 32) % 4]);
    const list = place(g, full);
    expect(list.length).toBeGreaterThan(200);
    for (const v of list) {
      const spec = VEGETATION_BY_GROUP[v.group]!;
      expect(v.scale).toBeGreaterThanOrEqual(spec.minScale);
      expect(v.scale).toBeLessThanOrEqual(spec.maxScale);
      expect(v.rotation).toBeGreaterThanOrEqual(0);
      expect(v.rotation).toBeLessThan(Math.PI * 2);
    }
    // the scale actually varies
    expect(new Set(list.filter((v) => v.kind === "tree").map((v) => v.scale)).size).toBeGreaterThan(10);
  });

  it("handles partial edge chunks and tiny grids", () => {
    const g = grid(70, 70, () => 50, () => 9);
    const plan = planChunks(70, 70, 64);
    expect(plan).toHaveLength(4);
    const last = plan[3]; // 5x5 cells
    const list = place(g, last);
    for (const v of list) {
      const { px, py } = toSample(g, v);
      expect(px).toBeGreaterThanOrEqual(last.x0);
      expect(px).toBeLessThanOrEqual(last.x0 + last.w);
      expect(py).toBeGreaterThanOrEqual(last.y0);
      expect(py).toBeLessThanOrEqual(last.y0 + last.h);
    }
    const tiny = grid(2, 2, () => 50, () => 9);
    expect(() => place(tiny, planChunks(2, 2, 64)[0])).not.toThrow();
  });

  it("rejects mismatched array sizes", () => {
    const g = grid(33, 33, () => 50, () => 5);
    expect(() => place(g, planChunks(33, 33, 32)[0], { heights: new Float32Array(10) })).toThrow();
    expect(() => place(g, planChunks(33, 33, 32)[0], { habitat: new Uint8Array(10) })).toThrow();
  });
});
