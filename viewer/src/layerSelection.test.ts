import { describe, expect, it } from "vitest";
import { cleanLayers, decodeState, encodeState } from "./appState";
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

describe("LayerSelection defaults are per layer", () => {
  it("toggling another layer first does not cancel a later layer's default-on", () => {
    const l = new LayerSelection(undefined);
    const seen: string[][] = [];
    l.onChange((ids) => seen.push(ids));
    l.set("vegetation", true); // the visitor acts before the overlay module has registered
    expect(seen).toEqual([["vegetation"]]);
    expect(l.register("landmarks", true)).toBe(true);
    expect(l.has("landmarks")).toBe(true);
    // The list changed while touched, so listeners (the URL hash) hear about it.
    expect(seen).toEqual([["vegetation"], ["landmarks", "vegetation"]]);
    expect(l.hashValue()).toEqual(["landmarks", "vegetation"]);
    expect(l.register("hotspots", true)).toBe(true);
    expect(seen).toHaveLength(3);
    expect(l.register("streets", false)).toBe(false);
    expect(seen).toHaveLength(3);
  });

  it("a layer the visitor decided is not overridden by its default", () => {
    const l = new LayerSelection(undefined);
    l.set("landmarks", true);
    l.set("landmarks", false); // explicitly off
    expect(l.register("landmarks", true)).toBe(false);
    expect(l.has("landmarks")).toBe(false);
    const m = new LayerSelection(undefined);
    m.set("streets", true);
    expect(m.register("streets", false)).toBe(true);
  });

  it("register() twice keeps the first decision", () => {
    const l = new LayerSelection(undefined);
    expect(l.register("landmarks", true)).toBe(true);
    l.set("landmarks", false);
    expect(l.register("landmarks", true)).toBe(false);
  });

  it("a hash-provided list wins for every id, including an empty one", () => {
    const l = new LayerSelection(["streets"]);
    let n = 0;
    l.onChange(() => n++);
    expect(l.register("landmarks", true)).toBe(false);
    expect(l.register("hotspots", true)).toBe(false);
    expect(l.list()).toEqual(["streets"]);
    const none = new LayerSelection([]);
    expect(none.register("landmarks", true)).toBe(false);
    expect(none.list()).toEqual([]);
    expect(n).toBe(0);
  });

  it("replace() with a list decides every id (a hand-edited hash is the whole truth)", () => {
    const l = new LayerSelection(undefined);
    l.replace(["streets"]);
    expect(l.register("landmarks", true)).toBe(false);
  });

  it("stays silent while nothing was touched", () => {
    const l = new LayerSelection(undefined);
    let n = 0;
    l.onChange(() => n++);
    l.register("landmarks", true);
    l.register("hotspots", true);
    expect(n).toBe(0);
    expect(l.hashValue()).toBeUndefined();
  });
});

describe("the villages layer", () => {
  it("is a valid layer id, kept in a list from the URL and sorted with the rest", () => {
    expect(cleanLayers(["villages", "streets", "landmarks"])).toEqual(["landmarks", "streets", "villages"]);
    expect(decodeState("l=hotspots,villages").layers).toEqual(["hotspots", "villages"]);
    expect(new LayerSelection(["villages"]).has("villages")).toBe(true);
  });

  it("is on by default (no l=), and an explicit list without it leaves it off", () => {
    const fresh = new LayerSelection();
    expect(fresh.register("villages", true)).toBe(true);
    expect(fresh.hashValue()).toBeUndefined();
    const explicit = new LayerSelection(["landmarks"]);
    expect(explicit.register("villages", true)).toBe(false);
  });

  it("round-trips through the hash", () => {
    const s = { x: 0, z: 0, zoom: 1, rot: 0, layers: ["villages"] };
    expect(decodeState(encodeState(s)).layers).toEqual(["villages"]);
  });
});
