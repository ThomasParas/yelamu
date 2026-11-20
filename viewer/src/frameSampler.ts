/**
 * Frame-time samples for the quality controller (quality.ts) that measure what the device
 * can do, not how fast the visitor's input arrives.
 *
 * The map renders on demand, so the gap between two rendered frames is the frame cost OR
 * the wait for the next input, whichever is longer. A mouse wheel sends separate notches
 * 30-100 ms apart and each one zooms at once, so a zoom on a fast machine looked like
 * 15-30 fps: the controller stepped down to level 0 and switched the vegetation off.
 *
 * Instead, for a short window after each interactive frame, an empty animation-frame loop
 * keeps ticking and the gaps between its ticks are recorded. Between wheel notches it ticks
 * at the display rate; a costly frame makes the next tick late by its cost. All callbacks
 * of one animation frame share a timestamp, so a frame to leave out (a chunk-building burst)
 * is named by that timestamp, whatever order the callbacks run in.
 */

/** How long the loop keeps sampling after the last interactive frame (ms). */
export const SAMPLE_WINDOW_MS = 300;

export interface FrameSamplerDeps {
  /** requestAnimationFrame (injected for tests). */
  raf: (cb: (t: number) => void) => void;
  /** Receives each sampled gap in ms (e.g. QualityController.record). */
  record: (gapMs: number) => void;
}

export interface FrameSampler {
  /**
   * An interactive frame ran with animation-frame timestamp `t`: keep sampling for
   * SAMPLE_WINDOW_MS. `exclude`: this frame's cost is not steady state (the gap that
   * starts at it is not recorded).
   */
  frame(t: number, exclude?: boolean): void;
  /** True while the sampling loop is running. */
  running(): boolean;
}

export function createFrameSampler(deps: FrameSamplerDeps): FrameSampler {
  let until = -Infinity;
  let last: number | null = null;
  let running = false;
  const excluded = new Set<number>();

  const tick = (t: number) => {
    if (last !== null && t > last && !excluded.has(last)) deps.record(t - last);
    // Forget exclusions that are used up; one for this very frame (t) may still be needed.
    for (const x of excluded) if (last === null || x <= last) excluded.delete(x);
    if (t < until) {
      last = t;
      deps.raf(tick);
    } else {
      running = false;
      last = null;
    }
  };

  return {
    frame(t, exclude = false) {
      until = Math.max(until, t + SAMPLE_WINDOW_MS);
      if (exclude) excluded.add(t);
      if (!running) {
        // Start from this frame, so its own cost is in the first gap.
        running = true;
        last = t;
        deps.raf(tick);
      }
    },
    running: () => running,
  };
}
