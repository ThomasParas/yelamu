import { encodeState, type AppState } from "./appState";

export interface HashSyncOptions {
  getState: () => AppState;
  /** Receives the encoded state (no '#'); main.ts puts it in the URL with history.replaceState. */
  write: (encoded: string) => void;
  /** Quiet period before a scheduled write happens. Default 250 ms. */
  delayMs?: number;
}

export interface HashSync {
  /** Something may have changed: (re)start the debounce timer. */
  schedule(): void;
  /** Write now if the state differs from what was last written. */
  flush(): void;
  /** Drop any pending write. */
  cancel(): void;
  /** Treat the current state as already in the URL (e.g. just read from it). */
  markCurrent(): void;
}

/** Debounced, change-only writer for the URL hash. Timers are the global ones. */
export function createHashSync(options: HashSyncOptions): HashSync {
  const delay = options.delayMs ?? 250;
  let last = encodeState(options.getState());
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const flush = () => {
    clear();
    const next = encodeState(options.getState());
    if (next === last) return;
    last = next;
    options.write(next);
  };
  return {
    schedule() {
      clear();
      timer = setTimeout(flush, delay);
    },
    flush,
    cancel: clear,
    markCurrent() {
      last = encodeState(options.getState());
    },
  };
}
