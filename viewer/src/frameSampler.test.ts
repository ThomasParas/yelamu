import { describe, expect, it } from "vitest";
import { createFrameSampler, SAMPLE_WINDOW_MS } from "./frameSampler";
import { QualityController, type QualityLevel } from "./quality";

const VSYNC = 1000 / 60;

/**
 * A 60 Hz display with on-demand rendering, as in main.ts: an input (a mouse-wheel notch)
 * every `inputEveryMs` asks for one render costing `costMs`; while a render is still busy
 * the display drops frames. Returns the quality level after `durationMs` of zooming.
 */
function zoomFor(opts: { costMs: number; inputEveryMs: number; durationMs: number; measure: "renderGaps" | "sampler" }): QualityLevel {
  let now = 0;
  const quality = new QualityController({ now: () => now });
  let queue: ((t: number) => void)[] = [];
  const sampler = createFrameSampler({ raf: (cb) => queue.push(cb), record: (g) => quality.record(g) });
  let lastRender = 0;
  let nextInput = 0;
  let busyUntil = 0;
  let wantRender = false;
  for (let k = 0; (now = k * VSYNC) < opts.durationMs; k++) {
    while (nextInput <= now) {
      wantRender = true;
      nextInput += opts.inputEveryMs;
    }
    if (now < busyUntil) continue; // still drawing the previous frame
    const callbacks = queue;
    queue = [];
    if (wantRender) {
      wantRender = false;
      busyUntil = now + opts.costMs;
      // The old measure: the gap since the previous rendered frame.
      if (opts.measure === "renderGaps" && lastRender && now - lastRender < 500) quality.record(now - lastRender);
      lastRender = now;
      if (opts.measure === "sampler") sampler.frame(now);
    }
    for (const cb of callbacks) cb(now);
  }
  return quality.level();
}

describe("frame sampler", () => {
  it("does not mistake slow mouse-wheel notches on a fast device for slow rendering", () => {
    // The bug: notches 80 ms apart, 2 ms frames. Gaps between renders say 12 fps.
    const fast = { costMs: 2, inputEveryMs: 80, durationMs: 20_000 };
    expect(zoomFor({ ...fast, measure: "renderGaps" })).toBe(0); // vegetation switched off
    expect(zoomFor({ ...fast, measure: "sampler" })).toBe(2);
  });

  it("still steps down on a device that really is slow", () => {
    expect(zoomFor({ costMs: 45, inputEveryMs: 50, durationMs: 20_000, measure: "sampler" })).toBe(0);
    expect(zoomFor({ costMs: 45, inputEveryMs: 16, durationMs: 20_000, measure: "sampler" })).toBe(0);
  });

  it("keeps sampling for a while after an interactive frame, then stops", () => {
    const gaps: number[] = [];
    let queue: ((t: number) => void)[] = [];
    const s = createFrameSampler({ raf: (cb) => queue.push(cb), record: (g) => gaps.push(g) });
    s.frame(0);
    let t = 0;
    while (queue.length > 0) {
      const q = queue;
      queue = [];
      t += VSYNC;
      for (const cb of q) cb(t);
    }
    expect(s.running()).toBe(false);
    const frames = SAMPLE_WINDOW_MS / VSYNC; // 18 at 60 Hz (one more if rounding lands under)
    expect(gaps.length).toBeGreaterThanOrEqual(Math.floor(frames));
    expect(gaps.length).toBeLessThanOrEqual(Math.floor(frames) + 1);
    for (const g of gaps) expect(g).toBeCloseTo(VSYNC);
  });

  it("leaves out the gap after an excluded frame, whichever callback runs first", () => {
    for (const tickFirst of [true, false]) {
      const gaps: number[] = [];
      let queue: ((t: number) => void)[] = [];
      const s = createFrameSampler({ raf: (cb) => queue.push(cb), record: (g) => gaps.push(g) });
      s.frame(0);
      const batch = (t: number, frame?: () => void) => {
        const q = queue;
        queue = [];
        if (!tickFirst) frame?.();
        for (const cb of q) cb(t);
        if (tickFirst) frame?.();
      };
      batch(16); // 0 -> 16 recorded
      batch(116, () => s.frame(116, true)); // 16 -> 116 recorded (the excluded cost comes after)
      batch(216); // 116 -> 216: the excluded build frame's cost, left out
      batch(232); // 216 -> 232 recorded
      expect(gaps).toEqual([16, 100, 16]);
    }
  });
});
