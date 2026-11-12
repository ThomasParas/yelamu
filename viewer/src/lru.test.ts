import { describe, expect, it, vi } from "vitest";
import { LruCache } from "./lru";

describe("LruCache", () => {
  it("stores and retrieves values", () => {
    const c = new LruCache<string, number>(2);
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
    expect(c.has("a")).toBe(true);
    expect(c.has("b")).toBe(false);
    expect(c.get("b")).toBeUndefined();
    expect(c.size).toBe(1);
  });

  it("evicts the least recently used entry and calls onEvict", () => {
    const onEvict = vi.fn();
    const c = new LruCache<string, number>(2, onEvict);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    expect(onEvict).toHaveBeenCalledTimes(1);
    expect(onEvict).toHaveBeenCalledWith("a", 1);
    expect(c.has("a")).toBe(false);
    expect(c.size).toBe(2);
  });

  it("get refreshes recency", () => {
    const onEvict = vi.fn();
    const c = new LruCache<string, number>(2, onEvict);
    c.set("a", 1);
    c.set("b", 2);
    c.get("a");
    c.set("c", 3);
    expect(onEvict).toHaveBeenCalledWith("b", 2);
    expect(c.has("a")).toBe(true);
  });

  it("has does not refresh recency", () => {
    const onEvict = vi.fn();
    const c = new LruCache<string, number>(2, onEvict);
    c.set("a", 1);
    c.set("b", 2);
    c.has("a");
    c.set("c", 3);
    expect(onEvict).toHaveBeenCalledWith("a", 1);
  });

  it("evicts in recency order across several inserts", () => {
    const evicted: string[] = [];
    const c = new LruCache<string, number>(2, (k) => evicted.push(k));
    c.set("a", 1);
    c.set("b", 2);
    c.get("a");
    c.set("c", 3); // evicts b
    c.set("d", 4); // evicts a
    expect(evicted).toEqual(["b", "a"]);
  });

  it("replacing an existing key refreshes it and calls onEvict for the old value", () => {
    const onEvict = vi.fn();
    const c = new LruCache<string, number>(2, onEvict);
    c.set("a", 1);
    c.set("b", 2);
    c.set("a", 10);
    expect(onEvict).toHaveBeenCalledWith("a", 1);
    expect(c.size).toBe(2);
    c.set("c", 3); // b is now the oldest
    expect(onEvict).toHaveBeenLastCalledWith("b", 2);
    expect(c.get("a")).toBe(10);
  });

  it("clear calls onEvict for every entry", () => {
    const onEvict = vi.fn();
    const c = new LruCache<string, number>(3, onEvict);
    c.set("a", 1);
    c.set("b", 2);
    c.clear();
    expect(onEvict).toHaveBeenCalledTimes(2);
    expect(c.size).toBe(0);
  });

  it("shrinking the capacity evicts on the next set", () => {
    const evicted: string[] = [];
    const c = new LruCache<string, number>(3, (k) => evicted.push(k));
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    c.capacity = 1;
    c.set("d", 4);
    expect(evicted).toEqual(["a", "b", "c"]);
    expect(c.size).toBe(1);
  });

  it("iterates entries without refreshing recency", () => {
    const c = new LruCache<string, number>(3);
    c.set("a", 1);
    c.set("b", 2);
    expect([...c.entries()]).toEqual([["a", 1], ["b", 2]]);
  });

  it("rejects a capacity below 1", () => {
    expect(() => new LruCache<string, number>(0)).toThrow();
  });
});
