import * as THREE from "three";
import { describe, expect, it } from "vitest";
import mergeGeometries, { TINT_RANGE, makeVegetationGeometries, makeVegetationMaterial, tintFor } from "./geometry";
import { mulberry32 } from "../randomLand";

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

  it("builds a tree, a shrub and a reed with vertex colours", () => {
    for (const g of [geos.tree, geos.shrub, geos.reed]) {
      const pos = g.getAttribute("position");
      expect(pos.count).toBeGreaterThan(0);
      expect(pos.count % 3).toBe(0);
      expect(g.getAttribute("color").count).toBe(pos.count);
      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
      }
    }
  });

  it("is low poly", () => {
    expect(geos.tree.getAttribute("position").count / 3).toBeLessThan(60);
    expect(geos.shrub.getAttribute("position").count / 3).toBeLessThan(60);
    expect(geos.reed.getAttribute("position").count / 3).toBeLessThan(40);
  });

  it("has unit height trees, with the trunk base a little below the ground", () => {
    const b = bbox(geos.tree);
    expect(b.max.y).toBeCloseTo(1, 5);
    expect(b.min.y).toBeLessThan(0);
    expect(b.min.y).toBeGreaterThan(-0.15);
    expect(b.max.x).toBeLessThan(0.5);
    expect(b.max.x).toBeGreaterThan(0.2);
  });

  it("has a squashed shrub of radius about 1 that does not go far below ground", () => {
    const b = bbox(geos.shrub);
    expect(b.max.y).toBeGreaterThan(0.5);
    expect(b.max.y).toBeLessThan(1);
    expect(b.min.y).toBeGreaterThanOrEqual(-0.5);
    expect(b.max.x).toBeLessThanOrEqual(1.0001);
  });

  it("has thin tall reeds", () => {
    const b = bbox(geos.reed);
    expect(b.max.y).toBeCloseTo(1, 1);
    expect(b.max.x - b.min.x).toBeLessThan(0.6);
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
