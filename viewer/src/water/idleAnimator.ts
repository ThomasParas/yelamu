/**
 * Keeps the render loop ticking at a low, fixed rate while something (the water) is
 * animating and the visitor is NOT interacting. The app renders on demand, so without
 * this the water would freeze whenever the camera is still.
 *
 * Throttled to `fps` requests per second, and only while enabled() is true AND the page
 * is visible; otherwise it just polls slowly (IDLE_POLL_MS) so it resumes by itself.
 * Nothing is scheduled before start() or after stop().
 */
export interface IdleAnimatorOptions {
  /** Maximum requestRender calls per second. Default 15. */
  fps?: number;
  /** Is there anything to animate right now? */
  enabled: () => boolean;
  /** Is the page visible? Default: document.visibilityState !== "hidden". */
  isVisible?: () => boolean;
  /** Clock in ms. Default performance.now(). */
  now?: () => number;
  /** Timer functions (injectable for tests). Default setTimeout / clearTimeout. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface IdleAnimator {
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

/** How often to look again while disabled or hidden. */
export const IDLE_POLL_MS = 500;

export function createIdleAnimator(requestRender: () => void, opts: IdleAnimatorOptions): IdleAnimator {
  const fps = Math.max(1, opts.fps ?? 15);
  const interval = 1000 / fps;
  const isVisible =
    opts.isVisible ?? (() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const now = opts.now ?? (() => performance.now());
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let running = false;
  let handle: unknown = null;
  let lastRequest = -Infinity;

  const schedule = (ms: number) => {
    handle = setTimer(tick, ms);
  };
  const tick = () => {
    handle = null;
    if (!running) return;
    if (!opts.enabled() || !isVisible()) {
      schedule(IDLE_POLL_MS);
      return;
    }
    const t = now();
    // Timers can fire a little early or late; never exceed the frame budget.
    if (t - lastRequest >= interval - 1) {
      lastRequest = t;
      try {
        requestRender();
      } catch (err) {
        console.error("idle animator render request failed", err);
      }
    }
    schedule(interval);
  };

  return {
    start() {
      if (running) return;
      running = true;
      schedule(interval);
    },
    stop() {
      running = false;
      if (handle !== null) {
        clearTimer(handle);
        handle = null;
      }
    },
    isRunning: () => running,
  };
}
