import { describe, expect, it } from "vitest";
import { cleanLayers } from "./appState";
import {
  REDUCED_EFFECTS_MESSAGE,
  VEGETATION_LAYER,
  WATER_MOTION_DISABLED_REASON,
  WATER_MOTION_LAYER,
  defaultVegetationOn,
  degradeMessage,
  effectiveEffects,
} from "./effects";
import type { QualityLevel } from "./quality";

describe("layer ids", () => {
  it("are valid for the hash codec", () => {
    for (const id of [VEGETATION_LAYER, WATER_MOTION_LAYER]) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
      expect(cleanLayers([id])).toEqual([id]);
    }
  });
});

describe("defaultVegetationOn", () => {
  it("is on for fine pointers and off for coarse ones", () => {
    expect(defaultVegetationOn(false)).toBe(true);
    expect(defaultVegetationOn(true)).toBe(false);
  });
});

describe("effectiveEffects", () => {
  const base = { vegetation: true, waterMotion: true, level: 2 as QualityLevel, reducedMotion: false };

  it("shows everything at full quality", () => {
    expect(effectiveEffects(base)).toEqual({ vegetation: true, waterAnimation: true });
  });

  it("level 1: vegetation but still water", () => {
    expect(effectiveEffects({ ...base, level: 1 })).toEqual({ vegetation: true, waterAnimation: false });
  });

  it("level 0: neither", () => {
    expect(effectiveEffects({ ...base, level: 0 })).toEqual({ vegetation: false, waterAnimation: false });
  });

  it("toggles switch each effect off independently", () => {
    expect(effectiveEffects({ ...base, vegetation: false })).toEqual({ vegetation: false, waterAnimation: true });
    expect(effectiveEffects({ ...base, waterMotion: false })).toEqual({ vegetation: true, waterAnimation: false });
  });

  it("reduced motion never animates the water, whatever the toggle", () => {
    expect(effectiveEffects({ ...base, reducedMotion: true })).toEqual({ vegetation: true, waterAnimation: false });
  });

  it("covers every combination consistently", () => {
    for (const vegetation of [true, false])
      for (const waterMotion of [true, false])
        for (const level of [0, 1, 2] as const)
          for (const reducedMotion of [true, false]) {
            const e = effectiveEffects({ vegetation, waterMotion, level, reducedMotion });
            expect(e.vegetation).toBe(vegetation && level >= 1);
            expect(e.waterAnimation).toBe(waterMotion && level === 2 && !reducedMotion);
          }
  });
});

describe("degradeMessage", () => {
  const full = { vegetation: true, waterAnimation: true };
  const noWater = { vegetation: true, waterAnimation: false };
  const none = { vegetation: false, waterAnimation: false };

  it("announces a degrade that switched something off", () => {
    expect(degradeMessage(1, 2, full, noWater)).toBe(REDUCED_EFFECTS_MESSAGE);
    expect(degradeMessage(0, 1, noWater, none)).toBe(REDUCED_EFFECTS_MESSAGE);
    expect(REDUCED_EFFECTS_MESSAGE).toBe("Reduced effects to keep the map smooth");
  });
  it("stays quiet when nothing visible changed, and on upgrades", () => {
    expect(degradeMessage(1, 2, none, none)).toBeNull();
    expect(degradeMessage(1, 2, noWater, noWater)).toBeNull();
    expect(degradeMessage(2, 1, noWater, full)).toBeNull();
    expect(degradeMessage(1, 1, full, full)).toBeNull();
  });
});

describe("texts", () => {
  it("explains the disabled water-motion toggle", () => {
    expect(WATER_MOTION_DISABLED_REASON).toMatch(/reduce motion/);
  });
});
