import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { HAZE_COLOR, HAZE_FOG_FRAGMENT, HAZE_MAX, HAZE_SCALE_M, HAZE_START_M, createHaze, hazeAmount } from "./haze";
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
