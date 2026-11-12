import { cleanLayers } from "./appState";

/**
 * Which optional layers are enabled. Shared by the URL hash sync and by whichever module
 * owns each layer; ids are validated the same way as in the URL (see appState.ts).
 *
 * "Unset" and "empty" differ: constructed with `undefined` (the hash had no `l`), each
 * layer starts from its own default (see register()); constructed with a list - even an
 * empty one (`l=`) - the list is the whole truth and defaults do not apply.
 */
export class LayerSelection {
  private ids: string[];
  /** True once the selection came from the hash or the user changed it. */
  private touched: boolean;
  private readonly listeners = new Set<(ids: string[]) => void>();

  constructor(initial?: readonly string[]) {
    this.ids = cleanLayers(initial ?? []);
    this.touched = initial !== undefined;
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
   * A module declares an optional layer. When the selection is still unset the layer takes
   * `defaultOn` (silently: no change event, the hash stays clean); otherwise the existing
   * selection decides. Returns whether the layer is on.
   */
  register(id: string, defaultOn: boolean): boolean {
    if (!this.touched && defaultOn && !this.has(id)) {
      this.ids = cleanLayers([...this.ids, id]);
    }
    return this.has(id);
  }

  set(id: string, on: boolean): void {
    if (on === this.has(id)) return;
    this.replace(on ? [...this.ids, id] : this.ids.filter((x) => x !== id));
  }

  replace(ids: readonly string[]): void {
    const next = cleanLayers(ids);
    this.touched = true;
    if (next.length === this.ids.length && next.every((id, i) => id === this.ids[i])) return;
    this.ids = next;
    for (const cb of [...this.listeners]) cb(this.list());
  }

  onChange(cb: (ids: string[]) => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
}
