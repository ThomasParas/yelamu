import * as THREE from "three";
import { describe, expect, it } from "vitest";
import mergeGeometries, { TINT_RANGE, makeVegetationGeometries, makeVegetationMaterial, tintFor } from "./geometry";
import { mulberry32 } from "../randomLand";
import { SPECIES } from "./species";

describe("mergeGeometries", () => {
  it("concatenates positions, normals and colours of non-indexed parts", () => {
    const a = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const b = new THREE.TetrahedronGeometry(1, 0).toNonIndexed();
    const ca = a.getAttribute("position").count;
    const cb = b.getAttribute("position").count;
    const m = mergeGeometries([
      { geometry: a, color: [1, 0, 0] },
      { geometry: b, color: [0, 0, 1] },
    ]);
    expect(m.getIndex()).toBeNull();
    expect(m.getAttribute("position").count).toBe(ca + cb);
    expect(m.getAttribute("normal").count).toBe(ca + cb);
    const color = m.getAttribute("color");
    expect([color.getX(0), color.getY(0), color.getZ(0)]).toEqual([1, 0, 0]);
    expect([color.getX(ca), color.getY(ca), color.getZ(ca)]).toEqual([0, 0, 1]);
    expect(m.boundingBox).not.toBeNull();
  });
  it("also accepts indexed parts", () => {
    const m = mergeGeometries([{ geometry: new THREE.ConeGeometry(1, 1, 6), color: [0, 1, 0] }]);
    expect(m.getIndex()).toBeNull();
    expect(m.getAttribute("position").count).toBeGreaterThan(0);
  });
});

describe("vegetation geometries", () => {
  const geos = makeVegetationGeometries();
  const bbox = (g: THREE.BufferGeometry) => {
    g.computeBoundingBox();
    return g.boundingBox!;
  };

  const TREES = ["oak", "bay", "willow"] as const;
  const SHRUBS = ["coyote-brush", "lupine"] as const;
  const REEDS = ["tule", "marsh-reed"] as const;
  const tris = (g: THREE.BufferGeometry) => g.getAttribute("position").count / 3;

  it("builds one vertex-coloured shape per species", () => {
    expect(Object.keys(geos).sort()).toEqual([...SPECIES].sort());
    for (const sp of SPECIES) {
      const g = geos[sp];
      const pos = g.getAttribute("position");
      expect(pos.count, sp).toBeGreaterThan(0);
      expect(pos.count % 3).toBe(0);
      expect(g.getAttribute("color").count).toBe(pos.count);
      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
      }
    }
  });

  it("stays within the triangle budget (tens of thousands are drawn at once)", () => {
    // The most numerous shapes (shrubs, reeds) must stay as cheap as the old generic ones.
    expect(tris(geos.oak)).toBeLessThanOrEqual(70);
    expect(tris(geos.bay)).toBeLessThanOrEqual(50);
    expect(tris(geos.willow)).toBeLessThanOrEqual(60);
    for (const sp of [...SHRUBS, ...REEDS]) expect(tris(geos[sp]), sp).toBeLessThanOrEqual(28);
  });

  it("has unit height trees that start at (or a little below) the ground", () => {
    for (const sp of TREES) {
      const b = bbox(geos[sp]);
      expect(b.max.y, sp).toBeCloseTo(1, 5);
      expect(b.min.y, sp).toBeLessThanOrEqual(0.1);
      expect(b.min.y, sp).toBeGreaterThan(-0.15);
    }
  });

  it("gives the oak a crown wider than it is tall, and the bay a narrower one", () => {
    const width = (sp: (typeof TREES)[number]) => {
      const b = bbox(geos[sp]);
      return Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
    };
    expect(width("oak")).toBeGreaterThan(1);
    expect(width("bay")).toBeLessThan(width("oak") * 0.75);
  });

  it("has low shrubs of radius about 1 that do not go far below ground", () => {
    for (const sp of SHRUBS) {
      const b = bbox(geos[sp]);
      expect(b.max.y, sp).toBeGreaterThan(0.5);
      expect(b.max.y, sp).toBeLessThan(1);
      expect(b.min.y, sp).toBeGreaterThanOrEqual(-0.5);
      expect(Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z), sp).toBeLessThanOrEqual(1.0001);
    }
  });

  it("has thin tall reed clumps", () => {
    for (const sp of REEDS) {
      const b = bbox(geos[sp]);
      expect(b.max.y, sp).toBeCloseTo(1, 1);
      expect(b.max.x - b.min.x, sp).toBeLessThan(0.6);
    }
  });

  it("makes a vertex-coloured flat-shaded standard material", () => {
    const m = makeVegetationMaterial();
    expect(m).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(m.vertexColors).toBe(true);
    expect(m.flatShading).toBe(true);
  });
});

describe("tintFor", () => {
  const groups = ["woodland", "scrub", "grassland", "dune", "wetland", "marsh", "unknown-group"];

  it("returns three multipliers within the tint range", () => {
    const rng = mulberry32(5);
    for (const g of groups) {
      for (let i = 0; i < 200; i++) {
        const t = tintFor(g, rng);
        expect(t).toHaveLength(3);
        for (const c of t) {
          expect(c).toBeGreaterThanOrEqual(TINT_RANGE.min);
          expect(c).toBeLessThanOrEqual(TINT_RANGE.max);
        }
      }
    }
  });

  it("is deterministic for a given rng stream and varies between draws", () => {
    const a = tintFor("woodland", mulberry32(9));
    const b = tintFor("woodland", mulberry32(9));
    expect(a).toEqual(b);
    const rng = mulberry32(9);
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(tintFor("woodland", rng).join(","));
    expect(seen.size).toBeGreaterThan(40);
  });

  it("stays subtle: the average is close to 1", () => {
    const rng = mulberry32(3);
    let sum = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) sum += tintFor("scrub", rng).reduce((s, c) => s + c, 0) / 3;
    expect(sum / n).toBeGreaterThan(0.9);
    expect(sum / n).toBeLessThan(1.1);
  });
});
