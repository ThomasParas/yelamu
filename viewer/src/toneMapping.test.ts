import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TONE_EXPOSURE, TONE_MAPPING, applyToneMapping, neutralToneMap } from "./toneMapping";

describe("applyToneMapping", () => {
  it("sets Neutral tone mapping and the exposure on the renderer", () => {
    const r = { toneMapping: THREE.NoToneMapping as THREE.ToneMapping, toneMappingExposure: 1 };
    applyToneMapping(r);
    expect(r.toneMapping).toBe(THREE.NeutralToneMapping);
    expect(TONE_MAPPING).toBe(THREE.NeutralToneMapping);
    expect(r.toneMappingExposure).toBe(TONE_EXPOSURE);
  });
});

describe("neutralToneMap (port of three's GLSL)", () => {
  it("keeps black black and never exceeds white, even for bright input", () => {
    expect(neutralToneMap([0, 0, 0])).toEqual([0, 0, 0]);
    for (const v of [0.5, 1, 2, 8]) {
      for (const c of neutralToneMap([v, v * 0.8, v * 0.3])) expect(c).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("is linear in the mid-tones: exposure minus a fixed 0.04 offset", () => {
    const [r, g, b] = neutralToneMap([0.3, 0.2, 0.1], 1);
    expect(r).toBeCloseTo(0.26, 9);
    expect(g).toBeCloseTo(0.16, 9);
    expect(b).toBeCloseTo(0.06, 9);
  });

  it("keeps the order of the channels (no hue flips) and rises monotonically", () => {
    let prev = -1;
    for (let v = 0; v <= 4; v += 0.05) {
      const [r, g, b] = neutralToneMap([v, v * 0.7, v * 0.4]);
      expect(r).toBeGreaterThanOrEqual(g);
      expect(g).toBeGreaterThanOrEqual(b);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });
});
