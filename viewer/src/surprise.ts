export interface SurpriseTarget {
  x: number;
  z: number;
  zoom: number;
  /** Place (hotspot) id to select on arrival, if any. */
  place?: string;
}

/** Share of "Surprise me" clicks that go to a registered target instead of a random land point. */
export const SURPRISE_TARGET_FRACTION = 0.6;

/**
 * A registered surprise target (with probability `fraction`), or null when the caller
 * should pick a random land point instead. Uses `rng` once for the decision and, only
 * when a target is chosen, once more to pick it.
 */
export function pickSurpriseTarget(
  targets: readonly SurpriseTarget[],
  rng: () => number,
  fraction = SURPRISE_TARGET_FRACTION,
): SurpriseTarget | null {
  if (targets.length === 0) return null;
  if (!(rng() < fraction)) return null;
  const i = Math.min(targets.length - 1, Math.max(0, Math.floor(rng() * targets.length)));
  return targets[i];
}
