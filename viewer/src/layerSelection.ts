import { cleanLayers } from "./appState";

/**
 * Which optional layers are enabled. Shared by the URL hash sync and by whichever module
 * owns each layer; ids are validated the same way as in the URL (see appState.ts).
 *
 * "Unset" and "empty" differ: constructed with `undefined` (the hash had no `l`), each
 * layer starts from its own default (see register()); constructed with a list - even an
 * empty one (`l=`) - the list is the whole truth and defaults do not apply.
 *
 * Defaults are decided per layer id: a layer the visitor already toggled keeps their choice,
 * but a layer nobody has decided yet (its module registers later) still gets its default.
 */
export class LayerSelection {
  private ids: string[];
  /** True once the selection came from the hash or the user changed it. */
  private touched: boolean;
  /** True when a whole list is the truth (the hash, or replace()): defaults never apply. */
  private listIsTruth: boolean;
  /** Ids decided one by one (set(), or a default already applied). */
  private readonly decided = new Set<string>();
  private readonly listeners = new Set<(ids: string[]) => void>();

  constructor(initial?: readonly string[]) {
    this.ids = cleanLayers(initial ?? []);
    this.touched = initial !== undefined;
    this.listIsTruth = initial !== undefined;
  }

  has(id: string): boolean {
    return this.ids.includes(id);
  }

  /** Sorted copy of the enabled ids. */
  list(): string[] {
    return [...this.ids];
  }

  /**
   * What goes into the URL hash: `undefined` while the selection is still the untouched
   * defaults (so a default view has a clean URL), the sorted list otherwise (`[]` = all off).
   */
  hashValue(): string[] | undefined {
    return this.touched ? this.list() : undefined;
  }

  /**
   * A module declares an optional layer. A layer nobody has decided yet (not named by a
   * hash list, not set()) takes `defaultOn`. While the selection is untouched that is
   * silent (no change event, the hash stays clean); if the visitor has already changed
   * something, the list changes for real and listeners are told so the hash stays accurate.
   * Otherwise the existing selection decides. Returns whether the layer is on.
   */
  register(id: string, defaultOn: boolean): boolean {
    if (!this.listIsTruth && !this.decided.has(id)) {
      this.decided.add(id);
      if (defaultOn && !this.has(id)) {
        const next = cleanLayers([...this.ids, id]);
        if (next.length !== this.ids.length) {
          this.ids = next;
          if (this.touched) this.notify();
        }
      }
    }
    return this.has(id);
  }

  set(id: string, on: boolean): void {
    this.decided.add(id);
    if (on === this.has(id)) return;
    this.apply(on ? [...this.ids, id] : this.ids.filter((x) => x !== id));
  }

  /** Swap in a whole list (a hand-edited hash): it decides every layer, defaults no longer apply. */
  replace(ids: readonly string[]): void {
    this.listIsTruth = true;
    this.apply(ids);
  }

  private apply(ids: readonly string[]): void {
    const next = cleanLayers(ids);
    this.touched = true;
    if (next.length === this.ids.length && next.every((id, i) => id === this.ids[i])) return;
    this.ids = next;
    this.notify();
  }

  private notify(): void {
    for (const cb of [...this.listeners]) cb(this.list());
  }

  onChange(cb: (ids: string[]) => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
}
