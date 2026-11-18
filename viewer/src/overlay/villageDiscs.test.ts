import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Village } from "./types";
import { buildDiscGeometry, VillageDiscs, type DiscGeometryOptions } from "./villageDiscs";

const opts = (over: Partial<DiscGeometryOptions> = {}): DiscGeometryOptions => ({
  cx: 100,
  cz: -200,
  radiusM: 500,
  heightAt: () => 10,
  waterLevelM: 0,
  segments: 64,
  rings: 8,
  ringWidthM: 16,
  liftM: 5,
  exaggeration: 2,
  ...over,
});

const village = (id: string, x: number, z: number): Village => ({
  id,
  name: id,
  x,
  z,
  lon: -122.4,
  lat: 37.7,
  radius_m: 530,
  description: "A village site used only in tests.",
  sources: [{ title: "t", url: "https://example.org" }],
  confidence: "inferred",
});

describe("buildDiscGeometry: fill", () => {
  it("has a centre vertex plus rings x segments, and a triangle fan plus ring bands", () => {
    const { fill } = buildDiscGeometry(opts());
    expect(fill.positions.length / 3).toBe(1 + 8 * 64);
    // 64 fan triangles + 7 bands of 64 quads (2 triangles each)
    expect(fill.indices.length / 3).toBe(64 + 7 * 64 * 2);
    expect(Math.max(...fill.indices)).toBe(fill.positions.length / 3 - 1);
  });

  it("covers the disc: the first vertex is the centre, the outermost ring sits at the radius", () => {
    const { fill } = buildDiscGeometry(opts());
    expect(fill.positions[0]).toBe(100);
    expect(fill.positions[2]).toBe(-200);
    const last = fill.positions.length / 3 - 1;
    for (const v of [last, last - 17, last - 63]) {
      const d = Math.hypot(fill.positions[3 * v] - 100, fill.positions[3 * v + 2] + 200);
      expect(d).toBeCloseTo(500, 3);
    }
  });

  it("has no degenerate triangles and no NaN", () => {
    const { fill, ring } = buildDiscGeometry(opts({ heightAt: (x, z) => 20 * Math.sin(x / 50) + z / 30 }));
    for (const part of [fill, ring]) {
      expect(part.positions.every(Number.isFinite)).toBe(true);
      const p = part.positions;
      for (let i = 0; i < part.indices.length; i += 3) {
        const [a, b, c] = [part.indices[i], part.indices[i + 1], part.indices[i + 2]];
        expect(new Set([a, b, c]).size).toBe(3);
        // area in the horizontal plane
        const area =
          Math.abs((p[3 * b] - p[3 * a]) * (p[3 * c + 2] - p[3 * a + 2]) - (p[3 * c] - p[3 * a]) * (p[3 * b + 2] - p[3 * a + 2])) / 2;
        expect(area).toBeGreaterThan(1e-6);
      }
    }
  });

  it("lifts every vertex above max(ground, water) by the same lift, scaled by the exaggeration", () => {
    const ground = (x: number) => Math.max(-4, (x - 100) * 0.1); // west half under water, east half rising
    const { fill } = buildDiscGeometry(opts({ heightAt: ground, waterLevelM: 0 }));
    for (let v = 0; v < fill.positions.length / 3; v++) {
      const x = fill.positions[3 * v];
      const expected = (Math.max(ground(x), 0) + 5) * 2;
      expect(fill.positions[3 * v + 1]).toBeCloseTo(expected, 2);
    }
  });

  it("is deterministic", () => {
    const h = (x: number, z: number) => x * 0.01 + z * 0.02;
    const a = buildDiscGeometry(opts({ heightAt: h }));
    const b = buildDiscGeometry(opts({ heightAt: h }));
    expect(Array.from(a.fill.positions)).toEqual(Array.from(b.fill.positions));
    expect(Array.from(a.fill.indices)).toEqual(Array.from(b.fill.indices));
    expect(Array.from(a.ring.positions)).toEqual(Array.from(b.ring.positions));
  });

  it("winds counter-clockwise seen from above, so the disc faces the camera", () => {
    const { fill, ring } = buildDiscGeometry(opts());
    for (const part of [fill, ring]) {
      const p = part.positions;
      for (let i = 0; i < part.indices.length; i += 3) {
        const [a, b, c] = [part.indices[i], part.indices[i + 1], part.indices[i + 2]];
        const ux = p[3 * b] - p[3 * a];
        const uz = p[3 * b + 2] - p[3 * a + 2];
        const vx = p[3 * c] - p[3 * a];
        const vz = p[3 * c + 2] - p[3 * a + 2];
        // normal.y of (b - a) x (c - a) is uz * vx - ux * vz
        expect(uz * vx - ux * vz).toBeGreaterThan(0);
      }
    }
  });
});

describe("buildDiscGeometry: ring", () => {
  it("is a strip of 2 x segments vertices and 2 x segments triangles", () => {
    const { ring } = buildDiscGeometry(opts());
    expect(ring.positions.length / 3).toBe(2 * 64);
    expect(ring.indices.length / 3).toBe(2 * 64);
  });

  it("has a constant horizontal width, ending exactly at the radius", () => {
    const { ring } = buildDiscGeometry(opts({ heightAt: (x) => x * 0.05 }));
    for (let s = 0; s < 64; s++) {
      const rIn = Math.hypot(ring.positions[6 * s] - 100, ring.positions[6 * s + 2] + 200);
      const rOut = Math.hypot(ring.positions[6 * s + 3] - 100, ring.positions[6 * s + 5] + 200);
      expect(rOut).toBeCloseTo(500, 3);
      expect(rOut - rIn).toBeCloseTo(16, 3);
    }
  });

  it("sits slightly above the fill so it is never hidden by it", () => {
    const { fill, ring } = buildDiscGeometry(opts());
    expect(ring.positions[1]).toBeGreaterThan(fill.positions[1]);
  });

  it("is lifted above max(ground, water) too", () => {
    const { ring } = buildDiscGeometry(opts({ heightAt: () => -10, waterLevelM: 2, liftM: 5, exaggeration: 1 }));
    for (let v = 0; v < ring.positions.length / 3; v++) expect(ring.positions[3 * v + 1]).toBeGreaterThanOrEqual(7);
  });
});

describe("buildDiscGeometry: bad input", () => {
  it("clamps tiny segment counts and a ring wider than the disc, never producing NaN", () => {
    const g = buildDiscGeometry(opts({ segments: 1, rings: 0, ringWidthM: 9999 }));
    for (const part of [g.fill, g.ring]) {
      expect(part.positions.every(Number.isFinite)).toBe(true);
      expect(part.indices.length).toBeGreaterThan(0);
    }
  });

  it("rejects a non-positive or non-finite radius", () => {
    expect(() => buildDiscGeometry(opts({ radiusM: 0 }))).toThrow(RangeError);
    expect(() => buildDiscGeometry(opts({ radiusM: Number.NaN }))).toThrow(RangeError);
  });
});

describe("VillageDiscs", () => {
  const make = () =>
    new VillageDiscs([village("village-a", 0, 0), village("village-b", 1000, 0)], () => 3, {
      waterLevelM: 0,
      exaggeration: 1,
    });
  const fillMaterial = (d: VillageDiscs, i: number) => (d.children[i].children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;

  it("is a group with one fill and one ring mesh per village", () => {
    const d = make();
    expect(d).toBeInstanceOf(THREE.Group);
    expect(d.children).toHaveLength(2);
    for (const g of d.children) expect(g.children).toHaveLength(2);
    d.dispose();
  });

  it("draws translucent tan without writing depth, offset toward the camera", () => {
    const d = make();
    const m = fillMaterial(d, 0);
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect(m.polygonOffset).toBe(true);
    expect(m.opacity).toBeCloseTo(0.45, 2);
    expect(m.color.getHex()).toBe(0xcaaf8f);
    d.dispose();
  });

  it("setEnabled toggles visibility", () => {
    const d = make();
    d.setEnabled(false);
    expect(d.visible).toBe(false);
    d.setEnabled(true);
    expect(d.visible).toBe(true);
    d.dispose();
  });

  it("setSelected brightens only the selected disc, and clears again", () => {
    const d = make();
    const base = fillMaterial(d, 0).opacity;
    d.setSelected("village-a");
    expect(fillMaterial(d, 0).opacity).toBeGreaterThan(base);
    expect(fillMaterial(d, 1).opacity).toBe(base);
    d.setSelected("village-nope");
    expect(fillMaterial(d, 0).opacity).toBe(base);
    d.setSelected("village-b");
    d.setSelected(undefined);
    expect(fillMaterial(d, 1).opacity).toBe(base);
    d.dispose();
  });

  it("dispose empties the group", () => {
    const d = make();
    d.dispose();
    expect(d.children).toHaveLength(0);
  });

  it("an empty list makes an empty group", () => {
    const d = new VillageDiscs([], () => 0, { waterLevelM: 0, exaggeration: 1 });
    expect(d.children).toHaveLength(0);
  });
});
