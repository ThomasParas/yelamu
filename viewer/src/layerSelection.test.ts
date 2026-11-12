import { describe, expect, it } from "vitest";
import { LayerSelection } from "./layerSelection";

describe("LayerSelection", () => {
  it("starts from the initial ids, cleaned and sorted", () => {
    const l = new LayerSelection(["streets", "Bad Id", "landmarks", "streets"]);
    expect(l.list()).toEqual(["landmarks", "streets"]);
    expect(l.has("streets")).toBe(true);
    expect(l.has("nope")).toBe(false);
  });

  it("set(id, on) adds and removes, notifying only on real changes", () => {
    const l = new LayerSelection([]);
    let n = 0;
    l.onChange(() => n++);
    l.set("b", true);
    l.set("a", true);
    expect(l.list()).toEqual(["a", "b"]);
    expect(n).toBe(2);
    l.set("a", true);
    expect(n).toBe(2);
    l.set("a", false);
    l.set("a", false);
    expect(l.list()).toEqual(["b"]);
    expect(n).toBe(3);
  });

  it("rejects invalid ids", () => {
    const l = new LayerSelection([]);
    l.set("<script>", true);
    l.set("Upper", true);
    expect(l.list()).toEqual([]);
  });

  it("replace() swaps the whole selection and notifies once if it differs", () => {
    const l = new LayerSelection(["a"]);
    let n = 0;
    l.onChange(() => n++);
    l.replace(["b", "a"]);
    expect(l.list()).toEqual(["a", "b"]);
    expect(n).toBe(1);
    l.replace(["a", "b"]);
    expect(n).toBe(1);
  });

  it("onChange passes the sorted list and can be unsubscribed", () => {
    const l = new LayerSelection([]);
    const seen: string[][] = [];
    const off = l.onChange((ids) => seen.push(ids));
    l.set("x", true);
    off();
    l.set("y", true);
    expect(seen).toEqual([["x"]]);
  });
});

describe("LayerSelection defaults (unset vs empty)", () => {
  it("unset selection: register() applies the default and keeps the hash clean", () => {
    const l = new LayerSelection(undefined);
    let n = 0;
    l.onChange(() => n++);
    expect(l.register("landmarks", true)).toBe(true);
    expect(l.register("hotspots", true)).toBe(true);
    expect(l.register("streets", false)).toBe(false);
    expect(l.list()).toEqual(["hotspots", "landmarks"]);
    expect(l.hashValue()).toBeUndefined();
    expect(n).toBe(0);
  });

  it("explicit empty selection (l=): defaults are NOT applied, every layer is off", () => {
    const l = new LayerSelection([]);
    expect(l.register("landmarks", true)).toBe(false);
    expect(l.register("hotspots", true)).toBe(false);
    expect(l.list()).toEqual([]);
    expect(l.hashValue()).toEqual([]);
  });

  it("explicit selection wins over defaults in both directions", () => {
    const l = new LayerSelection(["streets"]);
    expect(l.register("streets", false)).toBe(true);
    expect(l.register("landmarks", true)).toBe(false);
    expect(l.list()).toEqual(["streets"]);
  });

  it("the first user change makes the selection explicit", () => {
    const l = new LayerSelection(undefined);
    l.register("landmarks", true);
    l.register("hotspots", true);
    l.set("streets", true);
    expect(l.hashValue()).toEqual(["hotspots", "landmarks", "streets"]);
    const m = new LayerSelection(undefined);
    m.register("landmarks", true);
    m.set("landmarks", false);
    expect(m.hashValue()).toEqual([]);
  });

  it("register() ignores invalid ids", () => {
    const l = new LayerSelection(undefined);
    expect(l.register("Bad Id", true)).toBe(false);
  });
});
