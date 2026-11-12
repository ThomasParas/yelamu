/**
 * Automatic quality controller: watches the gaps between rendered frames during
 * interaction and steps the effects level down when the map is struggling (and back up
 * when there is plenty of headroom). Pure: the clock is injected, nothing touches the DOM.
 *
 * Levels: 2 = full (vegetation + animated water), 1 = reduced (vegetation, still water),
 * 0 = minimal (neither).
 */
export type QualityLevel = 0 | 1 | 2;

export interface QualityOptions {
  /** Clock in milliseconds. Default performance.now(). */
  now?: () => number;
  /** How many recent frame gaps the percentile is computed over. Default 60. */
  windowSize?: number;
  /** Degrade when the 90th percentile gap stays above this (ms). Default 25 (~40 fps). */
  degradeAboveMs?: number;
  /** Upgrade when the 90th percentile gap stays below this (ms). Default 14 (~70 fps). */
  upgradeBelowMs?: number;
  /** How long the slow condition must hold continuously. Default 1500 ms. */
  degradeAfterMs?: number;
  /** How long the fast condition must hold continuously. Default 8000 ms. */
  upgradeAfterMs?: number;
  /** No level change within this long of the previous one. Default 5000 ms. */
  minDwellMs?: number;
  /** Starting level. Default 2. */
  initial?: QualityLevel;
}

/** Frame gaps at or above this are idle time between interactions, not frame cost. */
export const MAX_FRAME_GAP_MS = 500;
/** Fewer samples than this make no decision. */
export const MIN_SAMPLES = 20;
/** If more than this passes between two record() calls the "continuously" streak restarts. */
export const MAX_SILENCE_MS = 1000;

/** Nearest-rank 90th percentile (NaN for an empty list). Does not modify its input. */
export function percentile90(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(0.9 * sorted.length) - 1)];
}

export class QualityController {
  readonly options: Required<QualityOptions>;
  private current: QualityLevel;
  private gaps: number[] = [];
  private slowSince: number | null = null;
  private fastSince: number | null = null;
  private lastChangeAt: number | null = null;
  private lastRecordAt: number | null = null;
  private readonly listeners = new Set<(level: QualityLevel, previous: QualityLevel) => void>();

  constructor(options: QualityOptions = {}) {
    this.options = {
      now: options.now ?? (() => performance.now()),
      windowSize: options.windowSize ?? 60,
      degradeAboveMs: options.degradeAboveMs ?? 25,
      upgradeBelowMs: options.upgradeBelowMs ?? 14,
      degradeAfterMs: options.degradeAfterMs ?? 1500,
      upgradeAfterMs: options.upgradeAfterMs ?? 8000,
      minDwellMs: options.minDwellMs ?? 5000,
      initial: options.initial ?? 2,
    };
    this.current = this.options.initial;
  }

  level(): QualityLevel {
    return this.current;
  }

  /** Number of gaps currently in the window (for tests and the debug overlay). */
  sampleCount(): number {
    return this.gaps.length;
  }

  /** 90th percentile of the current window (NaN when empty). */
  p90(): number {
    return percentile90(this.gaps);
  }

  /**
   * Feed the time between two consecutive rendered frames during interaction. Idle gaps
   * (>= 500 ms) and non-finite or negative values are ignored.
   */
  record(frameGapMs: number): void {
    if (!Number.isFinite(frameGapMs) || frameGapMs < 0 || frameGapMs >= MAX_FRAME_GAP_MS) return;
    const o = this.options;
    const now = o.now();
    if (this.lastRecordAt !== null && now - this.lastRecordAt > MAX_SILENCE_MS) {
      // The visitor stopped interacting for a while: the old streaks no longer count.
      this.slowSince = null;
      this.fastSince = null;
    }
    this.lastRecordAt = now;

    this.gaps.push(frameGapMs);
    if (this.gaps.length > o.windowSize) this.gaps.shift();
    if (this.gaps.length < MIN_SAMPLES) {
      this.slowSince = null;
      this.fastSince = null;
      return;
    }

    const p90 = percentile90(this.gaps);
    if (p90 > o.degradeAboveMs) this.slowSince ??= now;
    else this.slowSince = null;
    if (p90 < o.upgradeBelowMs) this.fastSince ??= now;
    else this.fastSince = null;

    if (this.lastChangeAt !== null && now - this.lastChangeAt < o.minDwellMs) return;

    if (this.slowSince !== null && now - this.slowSince >= o.degradeAfterMs && this.current > 0) {
      this.change((this.current - 1) as QualityLevel, now);
    } else if (this.fastSince !== null && now - this.fastSince >= o.upgradeAfterMs && this.current < 2) {
      this.change((this.current + 1) as QualityLevel, now);
    }
  }

  /** Subscribe to level changes; returns the unsubscribe function. */
  onChange(cb: (level: QualityLevel, previous: QualityLevel) => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  /**
   * Back to `level` (default: the initial level) with an empty window and no dwell.
   * Silent: listeners are NOT notified, the caller applies the level itself.
   */
  reset(level: QualityLevel = this.options.initial): void {
    this.current = level;
    this.clearState();
    this.lastChangeAt = null;
  }

  private change(next: QualityLevel, now: number): void {
    const previous = this.current;
    this.current = next;
    this.lastChangeAt = now;
    this.clearState();
    for (const cb of [...this.listeners]) {
      try {
        cb(next, previous);
      } catch (err) {
        console.error("quality listener failed", err);
      }
    }
  }

  private clearState(): void {
    this.gaps = [];
    this.slowSince = null;
    this.fastSince = null;
    this.lastRecordAt = null;
  }
}
