/** Pure rules for the vegetation and water-motion effects (no DOM, no three.js). */
import type { QualityLevel } from "./quality";

/** Layer ids (they appear in the URL hash `l=`, so they must match ^[a-z0-9-]+$). */
export const VEGETATION_LAYER = "vegetation";
export const WATER_MOTION_LAYER = "water-motion";

export const REDUCED_EFFECTS_MESSAGE = "Reduced effects to keep the map smooth";
export const WATER_MOTION_DISABLED_REASON =
  "Water motion is off because your device is set to reduce motion.";

/** Phones and tablets (coarse pointer) start with vegetation off; it can be switched on. */
export function defaultVegetationOn(coarsePointer: boolean): boolean {
  return !coarsePointer;
}

export interface EffectInputs {
  /** The visitor's toggles (layer on/off). */
  vegetation: boolean;
  waterMotion: boolean;
  /** Automatic quality level: 2 full, 1 reduced, 0 minimal. */
  level: QualityLevel;
  /** prefers-reduced-motion: reduce. */
  reducedMotion: boolean;
}

export interface EffectiveEffects {
  vegetation: boolean;
  waterAnimation: boolean;
}

/** What is really drawn: the visitor's choice, limited by quality level and motion preference. */
export function effectiveEffects(i: EffectInputs): EffectiveEffects {
  return {
    vegetation: i.vegetation && i.level >= 1,
    waterAnimation: i.waterMotion && i.level >= 2 && !i.reducedMotion,
  };
}

/**
 * The toast to show after a quality change: only when the level went DOWN and something
 * that was visible actually got switched off (so it never claims a reduction that the
 * visitor could not see). Upgrades are silent.
 */
export function degradeMessage(
  level: QualityLevel,
  previous: QualityLevel,
  before: EffectiveEffects,
  after: EffectiveEffects,
): string | null {
  if (level >= previous) return null;
  const lost = (before.vegetation && !after.vegetation) || (before.waterAnimation && !after.waterAnimation);
  return lost ? REDUCED_EFFECTS_MESSAGE : null;
}
