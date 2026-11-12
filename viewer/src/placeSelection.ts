import { isPlaceId } from "./appState";

/**
 * The selected hotspot or landmark (an overlay id), mirrored into the URL hash as `p=`.
 * Invalid ids are ignored, so a hand-edited hash cannot put junk into the app.
 */
export class PlaceSelection {
  private id: string | undefined;
  private known: ((id: string) => boolean) | null = null;
  private readonly listeners = new Set<(id: string | undefined) => void>();

  constructor(initial?: string) {
    this.id = isPlaceId(initial) ? initial : undefined;
  }

  get(): string | undefined {
    return this.id;
  }

  /**
   * From now on only ids for which `isKnown` is true can be selected (a hand-edited hash
   * naming a place that is not in the loaded overlay clears the selection instead of
   * lingering in the URL). An already selected unknown id is cleared now, notifying.
   */
  restrictTo(isKnown: (id: string) => boolean): void {
    this.known = isKnown;
    if (this.id !== undefined && !isKnown(this.id)) this.set(undefined);
  }

  /** Select a place (or `undefined` to clear). Notifies only when the value changes. */
  set(id: string | undefined): void {
    const next = isPlaceId(id) && (this.known === null || this.known(id)) ? id : undefined;
    if (next === this.id) return;
    this.id = next;
    for (const cb of [...this.listeners]) cb(next);
  }

  onChange(cb: (id: string | undefined) => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
}
