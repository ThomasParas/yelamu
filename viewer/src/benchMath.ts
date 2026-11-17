/** Pure maths for the on-screen phone benchmark (see bench.ts and docs/research/phone-measurement.md). */

export const PASS = { minFps: 30, maxGapP95Ms: 50, healthyLevel: 2 } as const;

export interface PanSummary {
  frames: number;
  effectiveFps: number;
  cbMs: { median: number | null; p95: number | null; max: number | null };
  frameGapMs: { median: number | null; p95: number | null };
}

function quantile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(1);
}

/** `durations`: ms spent in each render callback; `stamps`: when each frame started (ms). */
export function summarize(durations: number[], stamps: number[], elapsedMs: number): PanSummary {
  const gaps = stamps.slice(1).map((s, i) => s - stamps[i]).sort((a, b) => a - b);
  const d = durations.slice().sort((a, b) => a - b);
  return {
    frames: durations.length,
    effectiveFps: elapsedMs > 0 ? +(durations.length / (elapsedMs / 1000)).toFixed(1) : 0,
    cbMs: { median: quantile(d, 0.5), p95: quantile(d, 0.95), max: quantile(d, 1) },
    frameGapMs: { median: quantile(gaps, 0.5), p95: quantile(gaps, 0.95) },
  };
}

export interface VerdictInput {
  effectiveFps: number;
  gapP95: number | null;
  levelStart: number;
  levelEnd: number;
}

/** The pass rules of the phone measurement note: 30 fps, p95 frame gap under 50 ms, no degrade. */
export function verdict(i: VerdictInput): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!(i.effectiveFps >= PASS.minFps)) reasons.push(`fps ${i.effectiveFps} is under ${PASS.minFps}`);
  if (i.gapP95 === null) reasons.push("no frames were measured");
  else if (!(i.gapP95 < PASS.maxGapP95Ms)) reasons.push(`p95 frame gap ${i.gapP95} ms is over ${PASS.maxGapP95Ms} ms`);
  if (i.levelEnd < i.levelStart) reasons.push(`quality dropped from ${i.levelStart} to ${i.levelEnd}`);
  return { pass: reasons.length === 0, reasons };
}
