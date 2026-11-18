import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  SHADOW_LIFT,
  SHADOW_OFFSET,
  SHADOW_SIZE,
  SHADOW_STRETCH,
  footprintRadius,
  placeShadow,
  shadowDirection,
  shadowMatrix,
  shadowTextureData,
  terrainNormal,
} from "./shadows";

const SIZE = { width: 21, height: 21, cell_m: 10 };
const flat = () => new Float32Array(SIZE.width * SIZE.height).fill(5);
/** Rising 1 m per cell towards +x (east). */
const rampEast = () => {
  const h = new Float32Array(SIZE.width * SIZE.height);
  for (let y = 0; y < SIZE.height; y++) for (let x = 0; x < SIZE.width; x++) h[y * SIZE.width + x] = x;
  return h;
};

describe("shadowDirection", () => {
  it("points away from the sun in the ground plane", () => {
    const [dx, dz] = shadowDirection([-1, 1.2, 0.6]);
    expect(Math.hypot(dx, dz)).toBeCloseTo(1, 9);
    expect(dx).toBeGreaterThan(0); // sun in the west, shadows to the east
    expect(dz).toBeLessThan(0); // sun towards +z, shadows towards -z
  });
});

describe("footprintRadius", () => {
  it("is half the wider horizontal extent", () => {
    expect(footprintRadius(new THREE.BoxGeometry(4, 10, 2))).toBeCloseTo(2, 9);
  });
});

describe("shadowTextureData", () => {
  it("is opaque in the middle, clear at the rim, and black", () => {
    const n = 16;
    const d = shadowTextureData(n);
    const alpha = (x: number, y: number) => d[(y * n + x) * 4 + 3];
    expect(alpha(n / 2, n / 2)).toBeGreaterThan(230);
    expect(alpha(0, 0)).toBe(0);
    expect(alpha(0, n / 2)).toBeLessThan(10);
    for (let i = 0; i < n * n; i++) expect(d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]).toBe(0);
  });
});

describe("terrainNormal", () => {
  it("is straight up on flat ground", () => {
    const [x, y, z] = terrainNormal(flat(), SIZE, 3, 10, 10);
    expect([x, y, z].map((v) => +v.toFixed(9))).toEqual([0, 1, 0]);
  });

  it("leans away from the uphill side, scaled by the exaggeration", () => {
    const [x, y] = terrainNormal(rampEast(), SIZE, 3, 10, 10);
    // slope 1 m per 10 m, times 3 = 0.3
    expect(x).toBeCloseTo(-0.3 / Math.hypot(0.3, 1), 6);
    expect(y).toBeCloseTo(1 / Math.hypot(0.3, 1), 6);
  });
});

describe("placeShadow", () => {
  it("moves the patch away from the sun, sizes it from the footprint and lifts it off the ground", () => {
    const dir: [number, number] = [1, 0];
    const p = placeShadow({ x: 0, z: 0 }, 4, flat(), SIZE, 3, dir);
    expect(p.x).toBeCloseTo(4 * SHADOW_OFFSET, 9);
    expect(p.z).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(5 * 3 + SHADOW_LIFT, 9);
    expect(p.across).toBeCloseTo(4 * SHADOW_SIZE, 9);
    expect(p.along).toBeCloseTo(4 * SHADOW_SIZE * SHADOW_STRETCH, 9);
  });

  it("sits on a slope at the slope's height", () => {
    const p = placeShadow({ x: 0, z: 0 }, 4, rampEast(), SIZE, 3, [1, 0]);
    // world x 1.2 m east of the centre sample (column 10, height 10 m)
    expect(p.y).toBeCloseTo((10 + (4 * SHADOW_OFFSET) / 10) * 3 + SHADOW_LIFT, 6);
  });
});

describe("shadowMatrix", () => {
  it("stretches local +x along the shadow direction and keeps the quad on the ground plane", () => {
    const dir = shadowDirection();
    const p = placeShadow({ x: 0, z: 0 }, 2, flat(), SIZE, 3, dir);
    const m = shadowMatrix(p, new THREE.Matrix4());
    const tip = new THREE.Vector3(1, 0, 0).applyMatrix4(m);
    const centre = new THREE.Vector3(0, 0, 0).applyMatrix4(m);
    const v = tip.sub(centre);
    expect(v.length()).toBeCloseTo(p.along, 6);
    expect(v.x / v.length()).toBeCloseTo(dir[0], 6);
    expect(v.z / v.length()).toBeCloseTo(dir[1], 6);
    expect(v.y).toBeCloseTo(0, 6);
  });
});
