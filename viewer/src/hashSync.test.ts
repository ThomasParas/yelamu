import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "./appState";
import { createHashSync } from "./hashSync";

let state: AppState;
let writes: string[];

beforeEach(() => {
  vi.useFakeTimers();
  state = { x: 0, z: 0, zoom: 1, rot: 0 };
  writes = [];
});
afterEach(() => vi.useRealTimers());

const make = (delayMs?: number) =>
  createHashSync({ getState: () => state, write: (h) => writes.push(h), delayMs });

describe("createHashSync", () => {
  it("does not write on creation or when nothing changed", () => {
    const sync = make();
    sync.schedule();
    vi.advanceTimersByTime(1000);
    expect(writes).toEqual([]);
  });

  it("writes the encoded state once after the debounce delay", () => {
    const sync = make(250);
    state = { ...state, x: 12.34 };
    sync.schedule();
    vi.advanceTimersByTime(249);
    expect(writes).toEqual([]);
    vi.advanceTimersByTime(2);
    expect(writes).toEqual(["x=12.3&z=0.0&k=1.00&r=0"]);
  });

  it("restarts the timer on every schedule (trailing debounce)", () => {
    const sync = make(250);
    for (let i = 1; i <= 5; i++) {
      state = { ...state, x: i };
      sync.schedule();
      vi.advanceTimersByTime(200);
    }
    expect(writes).toEqual([]);
    vi.advanceTimersByTime(60);
    expect(writes).toEqual(["x=5.0&z=0.0&k=1.00&r=0"]);
  });

  it("skips writes whose encoded form equals the last one (sub-rounding changes)", () => {
    const sync = make(10);
    state = { ...state, x: 5 };
    sync.schedule();
    vi.advanceTimersByTime(20);
    state = { ...state, x: 5.01 };
    sync.schedule();
    vi.advanceTimersByTime(20);
    expect(writes).toHaveLength(1);
    state = { ...state, x: 6 };
    sync.schedule();
    vi.advanceTimersByTime(20);
    expect(writes).toHaveLength(2);
  });

  it("flush() writes immediately and cancels the pending timer", () => {
    const sync = make(250);
    state = { ...state, zoom: 4, layers: ["streets"] };
    sync.schedule();
    sync.flush();
    expect(writes).toEqual(["x=0.0&z=0.0&k=4.00&r=0&l=streets"]);
    vi.advanceTimersByTime(1000);
    expect(writes).toHaveLength(1);
  });

  it("cancel() drops a pending write", () => {
    const sync = make(250);
    state = { ...state, x: 9 };
    sync.schedule();
    sync.cancel();
    vi.advanceTimersByTime(1000);
    expect(writes).toEqual([]);
  });

  it("markWritten() records a state that came from the URL so it is not echoed back", () => {
    const sync = make(10);
    state = { ...state, x: 77 };
    sync.markCurrent();
    sync.schedule();
    vi.advanceTimersByTime(50);
    expect(writes).toEqual([]);
  });
});
