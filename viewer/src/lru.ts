/** Least-recently-used cache backed by Map insertion order. */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(
    public capacity: number,
    private readonly onEvict?: (key: K, value: V) => void,
  ) {
    if (capacity < 1) throw new Error(`capacity must be >= 1, got ${capacity}`);
  }

  get size(): number {
    return this.map.size;
  }

  /** Does not refresh recency. */
  has(key: K): boolean {
    return this.map.has(key);
  }

  /** Refreshes recency. */
  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      const old = this.map.get(key) as V;
      this.map.delete(key);
      if (old !== value) this.onEvict?.(key, old);
    }
    this.map.set(key, value);
    while (this.map.size > this.capacity) {
      // The first key in iteration order is the least recently used.
      const [oldKey, oldValue] = this.map.entries().next().value as [K, V];
      this.map.delete(oldKey);
      this.onEvict?.(oldKey, oldValue);
    }
  }

  /** Oldest first; does not refresh recency. */
  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  clear(): void {
    const all = [...this.map];
    this.map.clear();
    for (const [k, v] of all) this.onEvict?.(k, v);
  }
}
