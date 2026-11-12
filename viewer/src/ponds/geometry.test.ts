import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { POND_SURFACE_LIFT_M, buildPondGeometry, ringArea } from "./geometry";
import type { Pond } from "./types";

/** `rings` is a list of rings, or a single flat ring as a shorthand. */
const pond = (rings: number[][] | number[], over: Partial<Pond> = {}): Pond => ({
  id: "test-pond",
  name: null,
  level_m: 5,
  source: "test",
  confidence: "illustrative",
  rings: (typeof rings[0] === "number" ? [rings] : rings) as number[][],
  ...over,
});
const square = (x0: number, z0: number, x1: number, z1: number) => [x0, z0, x1, z0, x1, z1, x0, z1];

function positions(g: THREE.BufferGeometry) {
  const p = g.getAttribute("position");
  return Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)] as const);
}
function triangles(g: THREE.BufferGeometry) {
  const idx = g.getIndex()!;
  const p = g.getAttribute("position");
  const out: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [];
  for (let i = 0; i < idx.count; i += 3) {
    out.push([0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, idx.getX(i + k))) as [THREE.Vector3, THREE.Vector3, THREE.Vector3]);
  }
  return out;
}
/** Area in the x/z plane; the triangle normals must also face up (+y). */
function areaXZ(g: THREE.BufferGeometry) {
  return triangles(g).reduce((sum, [a, b, c]) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    return sum + n.y / 2; // signed: positive when the face points up
  }, 0);
}

describe("ringArea", () => {
  it("is signed shoelace area in the x/z plane, ignoring a repeated closing point", () => {
    expect(ringArea(square(0, 0, 10, 10))).toBe(100);
    expect(ringArea([0, 0, 0, 10, 10, 10, 10, 0])).toBe(-100);
    expect(ringArea([...square(0, 0, 10, 10), 0, 0])).toBe(100);
    expect(ringArea([0, 0, 5, 5, 10, 10])).toBe(0);
  });

  it("stays accurate far from the origin", () => {
    expect(ringArea(square(900000, 900000, 900010, 900010))).toBeCloseTo(100, 6);
  });
});

describe("buildPondGeometry", () => {
  it("makes a square from two triangles on a flat surface at (level + lift) * exaggeration", () => {
    const g = buildPondGeometry(pond(square(10, 20, 30, 50), { level_m: 5.6 }), 3)!;
    expect(g.getIndex()!.count / 3).toBe(2);
    const y = Math.fround((5.6 + POND_SURFACE_LIFT_M) * 3);
    for (const [, vy] of positions(g)) expect(vy).toBe(y);
    expect(POND_SURFACE_LIFT_M).toBe(0.05);
  });

  it("keeps vertices within the ring bounds in world x/z", () => {
    const ring = [100, -50, 220, -10, 260, 80, 150, 140, 90, 60];
    const g = buildPondGeometry(pond([ring]), 3)!;
    for (const [x, , z] of positions(g)) {
      expect(x).toBeGreaterThanOrEqual(90);
      expect(x).toBeLessThanOrEqual(260);
      expect(z).toBeGreaterThanOrEqual(-50);
      expect(z).toBeLessThanOrEqual(140);
    }
    // Every ring point is a vertex at its own (x, z).
    const have = new Set(positions(g).map(([x, , z]) => `${x},${z}`));
    for (let i = 0; i < ring.length; i += 2) expect(have.has(`${ring[i]},${ring[i + 1]}`)).toBe(true);
  });

  it("does not mirror north and south: a pond at negative z (north) has vertices at negative z", () => {
    const north = buildPondGeometry(pond(square(0, -300, 100, -200)), 1)!;
    for (const [, , z] of positions(north)) expect(z).toBeLessThan(0);
    const south = buildPondGeometry(pond(square(0, 200, 100, 300)), 1)!;
    for (const [, , z] of positions(south)) expect(z).toBeGreaterThan(0);
    // East stays east too.
    const east = buildPondGeometry(pond(square(200, 0, 300, 100)), 1)!;
    for (const [x] of positions(east)) expect(x).toBeGreaterThan(0);
  });

  it("faces up whichever way the ring winds, with +y normals", () => {
    const ccw = square(0, 0, 40, 40);
    const cw = [0, 0, 0, 40, 40, 40, 40, 0];
    for (const ring of [ccw, cw]) {
      const g = buildPondGeometry(pond([ring]), 3)!;
      expect(areaXZ(g)).toBeCloseTo(1600, 3);
      const n = g.getAttribute("normal");
      for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeCloseTo(1, 6);
    }
  });

  it("triangulates a square with a square hole to outer minus hole", () => {
    const g = buildPondGeometry(pond([square(0, 0, 100, 100), square(40, 40, 60, 60)]), 3)!;
    expect(areaXZ(g)).toBeCloseTo(100 * 100 - 20 * 20, 3);
    // No triangle centre falls inside the hole.
    for (const [a, b, c] of triangles(g)) {
      const cx = (a.x + b.x + c.x) / 3;
      const cz = (a.z + b.z + c.z) / 3;
      expect(cx > 40 && cx < 60 && cz > 40 && cz < 60).toBe(false);
    }
  });

  it("handles holes wound either way and a closed outer ring", () => {
    const outerClosed = [...square(0, 0, 100, 100), 0, 0];
    const holeCw = [40, 40, 40, 60, 60, 60, 60, 40];
    const g = buildPondGeometry(pond([outerClosed, holeCw]), 1)!;
    expect(areaXZ(g)).toBeCloseTo(9600, 3);
  });

  it("supports several holes", () => {
    const g = buildPondGeometry(pond([square(0, 0, 100, 100), square(10, 10, 20, 20), square(60, 60, 80, 80)]), 1)!;
    expect(areaXZ(g)).toBeCloseTo(10000 - 100 - 400, 3);
  });

  it("scales only y with the exaggeration", () => {
    const a = buildPondGeometry(pond(square(0, 0, 10, 10), { level_m: 2 }), 1)!;
    const b = buildPondGeometry(pond(square(0, 0, 10, 10), { level_m: 2 }), 4)!;
    expect(positions(a)[0][1]).toBeCloseTo(2.05, 5);
    expect(positions(b)[0][1]).toBeCloseTo(8.2, 5);
    expect(positions(a).map(([x, , z]) => [x, z])).toEqual(positions(b).map(([x, , z]) => [x, z]));
  });

  it("handles negative levels", () => {
    const g = buildPondGeometry(pond(square(0, 0, 10, 10), { level_m: -2 }), 3)!;
    expect(positions(g)[0][1]).toBeCloseTo((-2 + POND_SURFACE_LIFT_M) * 3, 5);
  });

  it("has a bounding sphere, positions and normals but no uv", () => {
    const g = buildPondGeometry(pond(square(0, 0, 10, 10)), 3)!;
    expect(g.boundingSphere).not.toBeNull();
    expect(g.getAttribute("position")).toBeDefined();
    expect(g.getAttribute("normal")).toBeDefined();
    expect(g.getAttribute("uv")).toBeUndefined();
  });
});

describe("buildPondGeometry: degenerate input", () => {
  it("returns null and reports when the outer ring has zero area", () => {
    const msgs: string[] = [];
    const collinear = [0, 0, 5, 5, 10, 10];
    expect(buildPondGeometry(pond([collinear]), 3, (m) => msgs.push(m))).toBeNull();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatch(/test-pond.*outer ring/);
    // Three identical points, and a closed 3-point ring that collapses to a line.
    expect(buildPondGeometry(pond([[1, 1, 1, 1, 1, 1]]), 3)).toBeNull();
    expect(buildPondGeometry(pond([[0, 0, 10, 10, 0, 0]]), 3)).toBeNull();
  });

  it("does not throw without a report callback", () => {
    expect(() => buildPondGeometry(pond([[0, 0, 5, 5, 10, 10]]), 3)).not.toThrow();
  });

  it("skips only the degenerate hole and keeps the pond", () => {
    const msgs: string[] = [];
    const g = buildPondGeometry(pond([square(0, 0, 100, 100), [50, 50, 60, 60, 70, 70], square(10, 10, 20, 20)]), 1, (m) =>
      msgs.push(m),
    )!;
    expect(g).not.toBeNull();
    expect(areaXZ(g)).toBeCloseTo(10000 - 100, 3);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatch(/hole 1/);
  });

  it("returns null when there are no rings at all", () => {
    expect(buildPondGeometry(pond([]), 3)).toBeNull();
  });

  it("rejects a non-finite exaggeration", () => {
    expect(() => buildPondGeometry(pond([square(0, 0, 1, 1)]), NaN)).toThrow(/exaggeration/);
  });
});
