import { afterEach, describe, expect, it, vi } from "vitest";
import { IDLE_POLL_MS, createIdleAnimator } from "./idleAnimator";

/** A deterministic timer queue with its own clock. */
function fakeEnv() {
  let time = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const env = {
    now: () => time,
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: time + ms, fn });
      return id;
    },
    clearTimer: (h: unknown) => void timers.delete(h as number),
    pending: () => timers.size,
    /** Run timers in order until `ms` have passed. */
    advance(ms: number) {
      const end = time + ms;
      for (;;) {
        let best: [number, { at: number; fn: () => void }] | null = null;
        for (const e of timers) if (e[1].at <= end && (!best || e[1].at < best[1].at)) best = e;
        if (!best) break;
        timers.delete(best[0]);
        time = best[1].at;
        best[1].fn();
      }
      time = end;
    },
    /** Fire the earliest timer right now, however early (a misbehaving timer). */
    fireNow() {
      const first = [...timers][0];
      if (!first) return;
      timers.delete(first[0]);
      first[1].fn();
    },
  };
  return env;
}

describe("createIdleAnimator", () => {
  it("requests renders at the configured rate while enabled and visible", () => {
    const env = fakeEnv();
    const render = vi.fn();
    const a = createIdleAnimator(render, { fps: 10, enabled: () => true, isVisible: () => true, ...env });
    a.start();
    env.advance(1000);
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(9);
    expect(render.mock.calls.length).toBeLessThanOrEqual(10);
    a.stop();
  });

  it("defaults to 15 fps", () => {
    const env = fakeEnv();
    const render = vi.fn();
    const a = createIdleAnimator(render, { enabled: () => true, isVisible: () => true, ...env });
    a.start();
    env.advance(2000);
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(28);
    expect(render.mock.calls.length).toBeLessThanOrEqual(30);
    a.stop();
  });

  it("never exceeds fps even if timers fire early", () => {
    const env = fakeEnv();
    const render = vi.fn();
    const a = createIdleAnimator(render, { fps: 10, enabled: () => true, isVisible: () => true, ...env });
    a.start();
    env.advance(100); // first request at 100 ms
    expect(render).toHaveBeenCalledTimes(1);
    env.fireNow(); // the next tick arrives immediately: too soon
    env.fireNow();
    expect(render).toHaveBeenCalledTimes(1);
    env.advance(100);
    expect(render).toHaveBeenCalledTimes(2);
    a.stop();
  });

  it("does not render while disabled, and resumes when enabled again", () => {
    const env = fakeEnv();
    const render = vi.fn();
    let on = false;
    const a = createIdleAnimator(render, { fps: 10, enabled: () => on, isVisible: () => true, ...env });
    a.start();
    env.advance(3000);
    expect(render).not.toHaveBeenCalled();
    on = true;
    env.advance(IDLE_POLL_MS + 1000); // it notices within one poll, then runs at fps
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(8);
    const before = render.mock.calls.length;
    on = false;
    env.advance(1000);
    expect(render.mock.calls.length).toBeLessThanOrEqual(before + 1);
    const settled = render.mock.calls.length;
    env.advance(5000);
    expect(render.mock.calls.length).toBe(settled);
    on = true;
    env.advance(IDLE_POLL_MS + 500);
    expect(render.mock.calls.length).toBeGreaterThan(settled);
    a.stop();
  });

  it("pauses while the page is hidden", () => {
    const env = fakeEnv();
    const render = vi.fn();
    let visible = true;
    const a = createIdleAnimator(render, { fps: 10, enabled: () => true, isVisible: () => visible, ...env });
    a.start();
    env.advance(500);
    const n = render.mock.calls.length;
    expect(n).toBeGreaterThan(0);
    visible = false;
    env.advance(600); // the in-flight tick notices
    const m = render.mock.calls.length;
    env.advance(5000);
    expect(render.mock.calls.length).toBe(m);
    visible = true;
    env.advance(IDLE_POLL_MS + 500);
    expect(render.mock.calls.length).toBeGreaterThan(m);
    a.stop();
  });

  it("never calls after stop() and leaves no timer behind", () => {
    const env = fakeEnv();
    const render = vi.fn();
    const a = createIdleAnimator(render, { fps: 10, enabled: () => true, isVisible: () => true, ...env });
    a.start();
    env.advance(300);
    const n = render.mock.calls.length;
    a.stop();
    expect(a.isRunning()).toBe(false);
    expect(env.pending()).toBe(0);
    env.advance(10_000);
    expect(render.mock.calls.length).toBe(n);
    // idempotent
    a.stop();
    expect(env.pending()).toBe(0);
  });

  it("can be restarted, and start() twice does not double the rate", () => {
    const env = fakeEnv();
    const render = vi.fn();
    const a = createIdleAnimator(render, { fps: 10, enabled: () => true, isVisible: () => true, ...env });
    a.start();
    a.start();
    expect(env.pending()).toBe(1);
    env.advance(1000);
    expect(render.mock.calls.length).toBeLessThanOrEqual(10);
    a.stop();
    render.mockClear();
    a.start();
    env.advance(1000);
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(9);
    a.stop();
  });

  it("does nothing before start()", () => {
    const env = fakeEnv();
    const render = vi.fn();
    createIdleAnimator(render, { enabled: () => true, isVisible: () => true, ...env });
    env.advance(5000);
    expect(render).not.toHaveBeenCalled();
    expect(env.pending()).toBe(0);
  });

  it("keeps running if requestRender throws", () => {
    const env = fakeEnv();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const a = createIdleAnimator(
      () => {
        calls++;
        throw new Error("boom");
      },
      { fps: 10, enabled: () => true, isVisible: () => true, ...env },
    );
    a.start();
    env.advance(500);
    expect(calls).toBeGreaterThan(2);
    a.stop();
    spy.mockRestore();
  });

  describe("with the default timers", () => {
    afterEach(() => vi.useRealTimers());

    it("works with vitest fake timers", () => {
      vi.useFakeTimers();
      const render = vi.fn();
      const a = createIdleAnimator(render, { fps: 20, enabled: () => true, isVisible: () => true });
      a.start();
      vi.advanceTimersByTime(1000);
      expect(render.mock.calls.length).toBeGreaterThanOrEqual(18);
      expect(render.mock.calls.length).toBeLessThanOrEqual(20);
      a.stop();
      render.mockClear();
      vi.advanceTimersByTime(1000);
      expect(render).not.toHaveBeenCalled();
    });
  });
});
