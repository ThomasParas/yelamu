import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  HAZE_COLOR,
  HAZE_EDGE_IN_M,
  HAZE_EDGE_MAX,
  HAZE_FOG_FRAGMENT,
  HAZE_MAX,
  HAZE_SCALE_M,
  HAZE_START_M,
  createHaze,
  hazeAmount,
  hazeEdgeAmount,
  hazeFogFragment,
  rectEdgeDistance,
  setHazeEdge,
} from "./haze";
import { CAMERA_DISTANCE } from "./viewRig";

describe("distance haze", () => {
  it("leaves everything up to the start untouched, so a zoomed-in view has none", () => {
    expect(hazeAmount(-5000)).toBe(0);
    expect(hazeAmount(0)).toBe(0);
    expect(hazeAmount(HAZE_START_M)).toBe(0);
  });

  it("grows with distance and never fully hides the ground", () => {
    let last = 0;
    for (let d = HAZE_START_M + 500; d <= 60_000; d += 500) {
      const h = hazeAmount(d);
      expect(h).toBeGreaterThan(last);
      expect(h).toBeLessThan(HAZE_MAX);
      last = h;
    }
    expect(HAZE_MAX).toBeLessThan(1);
  });

  it("stays light over the city and is strong on the far side (view depths in metres)", () => {
    // Whole-city view: the Golden Gate sits about 5 km past the view target, the top of the
    // screen about 9.5 km; fully zoomed out the top is about 14 km.
    expect(hazeAmount(5000)).toBeLessThan(0.45);
    expect(hazeAmount(9500)).toBeGreaterThan(0.55);
    expect(hazeAmount(14000)).toBeGreaterThan(0.65);
  });

  it("feeds the same curve to the shader through the fog uniforms", () => {
    const fog = createHaze();
    expect(THREE.ShaderChunk.fog_fragment).toBe(HAZE_FOG_FRAGMENT);
    expect(fog.near).toBe(CAMERA_DISTANCE + HAZE_START_M);
    expect(fog.far - fog.near).toBe(HAZE_SCALE_M);
    expect(fog.color.getHex()).toBe(HAZE_COLOR);
    expect(HAZE_FOG_FRAGMENT).toContain(HAZE_MAX.toFixed(4));
    expect(HAZE_FOG_FRAGMENT).toContain("vFogDepth - fogNear");
  });
});

describe("edge mist around the surrounding terrain", () => {
  const rect = { minX: -14000, maxX: 34000, minZ: -19000, maxZ: 20000 };

  it("measures signed distance to the rectangle's edge", () => {
    expect(rectEdgeDistance(rect, 0, 0)).toBe(-14000); // nearest side is the west edge
    expect(rectEdgeDistance(rect, 34000, 0)).toBe(0);
    expect(rectEdgeDistance(rect, 0, 21000)).toBe(1000);
  });

  it("is clear well inside, full at the edge and beyond", () => {
    expect(hazeEdgeAmount(-HAZE_EDGE_IN_M - 1)).toBe(0);
    expect(hazeEdgeAmount(-HAZE_EDGE_IN_M / 2)).toBeCloseTo(HAZE_EDGE_MAX / 2);
    expect(hazeEdgeAmount(0)).toBe(HAZE_EDGE_MAX);
    expect(hazeEdgeAmount(5000)).toBe(HAZE_EDGE_MAX);
  });

  it("the whole city (about 18 by 16 km round the origin) stays clear of it", () => {
    for (const [x, z] of [[-8900, -7800], [8900, -7800], [-8900, 7800], [8900, 7800]]) {
      expect(hazeEdgeAmount(rectEdgeDistance(rect, x, z))).toBe(0);
    }
  });

  it("writes the rectangle into the fog step, and leaves it out without a ring", () => {
    const withRing = hazeFogFragment(rect);
    expect(withRing).toContain("-14000.0 - vHazeXZ.x");
    expect(withRing).toContain("vHazeXZ.y - 20000.0");
    expect(withRing).toContain(`smoothstep( ${(-HAZE_EDGE_IN_M).toFixed(1)}, 0.0, hazeEdgeD )`);
    expect(hazeFogFragment(null)).not.toContain("hazeEdge");
    setHazeEdge(rect);
    expect(THREE.ShaderChunk.fog_fragment).toBe(withRing);
    setHazeEdge(null);
    expect(THREE.ShaderChunk.fog_fragment).toBe(HAZE_FOG_FRAGMENT);
  });

  it("passes the world position on, with instances placed by their matrix", () => {
    createHaze();
    expect(THREE.ShaderChunk.fog_vertex).toContain("vHazeXZ = ( modelMatrix * hazeWorld ).xz");
    expect(THREE.ShaderChunk.fog_vertex).toContain("instanceMatrix * hazeWorld");
    expect(THREE.ShaderChunk.fog_pars_fragment).toContain("varying vec2 vHazeXZ");
  });
});
