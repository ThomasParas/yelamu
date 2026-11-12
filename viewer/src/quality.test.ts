import { describe, expect, it } from "vitest";
import { QualityController, percentile90 } from "./quality";

/** A controller on a fake clock; `feed(gap, n)` records n frames, advancing the clock by gap each. */
function make(opts: ConstructorParameters<typeof QualityController>[0] = {}) {
  let t = 1000;
  const q = new QualityController({ now: () => t, ...opts });
  const advance = (ms: number) => void (t += ms);
  const feed = (gap: number, n: number) => {
    for (let i = 0; i < n; i++) {
      advance(gap);
      q.record(gap);
    }
  };
  return { q, advance, feed, clock: () => t };
}

describe("percentile90", () => {
  it("uses nearest rank", () => {
    expect(percentile90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(9);
    expect(percentile90([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])).toBe(9);
    expect(percentile90([5])).toBe(5);
    expect(percentile90([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])).toBe(1);
    expect(percentile90([1, 1, 1, 1, 1, 1, 1, 1, 100, 100])).toBe(100);
  });
  it("does not modify its input and handles empty input", () => {
    const a = [3, 1, 2];
    percentile90(a);
    expect(a).toEqual([3, 1, 2]);
    expect(Number.isNaN(percentile90([]))).toBe(true);
  });
});

describe("QualityController", () => {
  it("starts at the initial level (default 2)", () => {
    expect(make().q.level()).toBe(2);
    expect(make({ initial: 0 }).q.level()).toBe(0);
    expect(make({ initial: 1 }).q.level()).toBe(1);
  });

  it("makes no decision with fewer than 20 samples", () => {
    const { q, feed } = make({ degradeAfterMs: 0, minDwellMs: 0 });
    feed(80, 19);
    expect(q.level()).toBe(2);
    feed(80, 1);
    expect(q.level()).toBe(1);
  });

  it("degrades one level after sustained slow frames, then another, never below 0", () => {
    const { q, feed } = make();
    const seen: Array<[number, number]> = [];
    q.onChange((l, p) => seen.push([l, p]));
    feed(40, 20); // 800 ms of slow frames: not long enough yet
    expect(q.level()).toBe(2);
    feed(40, 60); // well past 1500 ms
    expect(q.level()).toBe(1);
    expect(seen).toEqual([[1, 2]]);
    // Dwell: the next change cannot come within 5 s of the previous one.
    feed(40, 60); // 2.4 s
    expect(q.level()).toBe(1);
    feed(40, 100); // 4 s more: dwell over, window refilled
    expect(q.level()).toBe(0);
    expect(seen).toEqual([
      [1, 2],
      [0, 1],
    ]);
    feed(40, 600);
    expect(q.level()).toBe(0); // never below 0
    expect(seen).toHaveLength(2);
  });

  it("does not degrade on a short spike", () => {
    const { q, feed } = make();
    feed(16, 60);
    feed(60, 12); // ~0.7 s of slow frames, then recovery
    feed(16, 200);
    expect(q.level()).toBe(2);
  });

  it("does not degrade when only a few frames are slow (p90 stays low)", () => {
    const { q, feed } = make();
    for (let i = 0; i < 20; i++) {
      feed(16, 9);
      feed(100, 1); // 10% slow: p90 is still a fast frame
    }
    expect(q.level()).toBe(2);
  });

  it("upgrades one level after sustained fast frames, only after the dwell, never above 2", () => {
    const { q, feed } = make({ initial: 0 });
    const seen: Array<[number, number]> = [];
    q.onChange((l, p) => seen.push([l, p]));
    feed(10, 300); // 3 s of fast frames: below upgradeAfterMs (8 s)
    expect(q.level()).toBe(0);
    feed(10, 600); // now > 8 s
    expect(q.level()).toBe(1);
    // After the change the window is cleared; another 8 s of fast frames brings level 2.
    feed(10, 500);
    expect(q.level()).toBe(1);
    feed(10, 400);
    expect(q.level()).toBe(2);
    feed(10, 2000);
    expect(q.level()).toBe(2);
    expect(seen).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });

  it("does not upgrade while frames are only mediocre (between the thresholds)", () => {
    const { q, feed } = make({ initial: 1 });
    feed(20, 2000); // p90 = 20 ms: neither slow (>25) nor fast (<18)
    expect(q.level()).toBe(1);
  });

  it("60 Hz frames (16.7 ms) count as fast: they upgrade after the sustain period and dwell", () => {
    const { q, feed } = make({ initial: 0 });
    feed(16.7, 300); // ~5 s: below upgradeAfterMs (8 s)
    expect(q.level()).toBe(0);
    feed(16.7, 300); // ~10 s in total
    expect(q.level()).toBe(1);
    feed(16.7, 600); // another ~10 s
    expect(q.level()).toBe(2);
  });

  it("20 ms frames neither upgrade nor degrade (the hysteresis band is 18..25 ms)", () => {
    for (const initial of [0, 1, 2] as const) {
      const { q, feed } = make({ initial });
      feed(20, 3000);
      expect(q.level()).toBe(initial);
    }
  });

  it("26 ms frames degrade", () => {
    const { q, feed } = make();
    feed(26, 200);
    expect(q.level()).toBe(1);
  });

  it("respects minDwellMs after a change even when conditions still hold", () => {
    const { q, feed } = make({ degradeAfterMs: 100, minDwellMs: 5000 });
    feed(40, 30);
    expect(q.level()).toBe(1);
    // 100 more slow frames = 4 s < 5 s dwell
    feed(40, 100);
    expect(q.level()).toBe(1);
    feed(40, 40);
    expect(q.level()).toBe(0);
  });

  it("ignores idle gaps, non-finite and negative values", () => {
    const { q, feed } = make({ degradeAfterMs: 1e9, minDwellMs: 0 });
    for (const bad of [500, 501, 5000, Infinity, -1, NaN, -Infinity]) {
      for (let i = 0; i < 30; i++) q.record(bad);
    }
    expect(q.level()).toBe(2);
    expect(q.sampleCount()).toBe(0);
    feed(30, 19);
    expect(q.sampleCount()).toBe(19);
    q.record(499); // counts
    expect(q.sampleCount()).toBe(20);
  });

  it("clears the window when the level changes", () => {
    const { q, feed } = make();
    const counts: number[] = [];
    q.onChange(() => counts.push(q.sampleCount()));
    feed(40, 100);
    expect(q.level()).toBe(1);
    expect(counts).toEqual([0]); // already empty when listeners run
  });

  it("keeps only the last windowSize gaps", () => {
    const { q, feed } = make({ windowSize: 30, degradeAfterMs: 1e9 });
    feed(16, 100);
    expect(q.sampleCount()).toBe(30);
  });

  it("restarts the continuity timer after a long silence", () => {
    const { q, feed, advance } = make();
    feed(40, 30); // 1.2 s slow, not yet 1.5 s
    advance(10_000); // the visitor stopped interacting; no frames recorded
    feed(40, 5);
    expect(q.level()).toBe(2); // the pre-silence slow time does not count
    feed(40, 60);
    expect(q.level()).toBe(1);
  });

  it("onChange payload is (level, previous) and unsubscribe works", () => {
    const { q, feed } = make();
    const a: Array<[number, number]> = [];
    const b: number[] = [];
    const offA = q.onChange((l, p) => a.push([l, p]));
    q.onChange((l) => b.push(l));
    offA();
    feed(40, 100);
    expect(a).toEqual([]);
    expect(b).toEqual([1]);
  });

  it("a throwing listener does not stop the others or the controller", () => {
    const { q, feed } = make();
    const seen: number[] = [];
    q.onChange(() => {
      throw new Error("boom");
    });
    q.onChange((l) => seen.push(l));
    feed(40, 100);
    expect(seen).toEqual([1]);
    expect(q.level()).toBe(1);
  });

  it("reset restores the level silently, clears the window and the dwell", () => {
    const { q, feed } = make();
    const seen: number[] = [];
    q.onChange((l) => seen.push(l));
    feed(40, 100);
    expect(q.level()).toBe(1);
    q.reset();
    expect(q.level()).toBe(2);
    expect(q.sampleCount()).toBe(0);
    expect(seen).toEqual([1]); // reset does not notify
    q.reset(0);
    expect(q.level()).toBe(0);
    // no dwell after a reset: a change can follow as soon as the conditions are met
    feed(10, 900);
    expect(q.level()).toBe(1);
  });

  it("uses the default thresholds from the spec", () => {
    const { q } = make();
    expect(q.options).toMatchObject({
      windowSize: 60,
      degradeAboveMs: 25,
      upgradeBelowMs: 18,
      degradeAfterMs: 1500,
      upgradeAfterMs: 8000,
      minDwellMs: 5000,
      initial: 2,
    });
  });
});
