import { describe, expect, it } from "vitest";
import { PASS, summarize, verdict } from "./benchMath";

describe("summarize", () => {
  it("reports fps, callback time and frame gaps", () => {
    // 11 frames, 20 ms apart (50 fps), each callback taking 5 ms (one slow one, 30 ms)
    const stamps = Array.from({ length: 11 }, (_, i) => 1000 + i * 20);
    const durations = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 30];
    const s = summarize(durations, stamps, 220);
    expect(s.frames).toBe(11);
    expect(s.effectiveFps).toBe(50);
    expect(s.cbMs.median).toBe(5);
    expect(s.cbMs.max).toBe(30);
    expect(s.frameGapMs.median).toBe(20);
    expect(s.frameGapMs.p95).toBe(20);
  });

  it("copes with no frames at all", () => {
    const s = summarize([], [], 1000);
    expect(s.frames).toBe(0);
    expect(s.effectiveFps).toBe(0);
    expect(s.frameGapMs.p95).toBeNull();
  });
});

describe("verdict", () => {
  const ok = { effectiveFps: 45, gapP95: 30, levelStart: 2, levelEnd: 2 };
  it("passes when fast, steady and not degraded", () => {
    expect(verdict(ok)).toEqual({ pass: true, reasons: [] });
    expect(PASS.minFps).toBe(30);
    expect(PASS.maxGapP95Ms).toBe(50);
  });

  it("names every failing reason", () => {
    const v = verdict({ effectiveFps: 22, gapP95: 80, levelStart: 2, levelEnd: 1 });
    expect(v.pass).toBe(false);
    expect(v.reasons).toEqual([
      "fps 22 is under 30",
      "p95 frame gap 80 ms is over 50 ms",
      "quality dropped from 2 to 1",
    ]);
  });

  it("fails a run with no measurable frames", () => {
    expect(verdict({ effectiveFps: 0, gapP95: null, levelStart: 2, levelEnd: 2 }).pass).toBe(false);
  });
});
