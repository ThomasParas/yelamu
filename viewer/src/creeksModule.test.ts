import type * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "./appContext";
import { CREEK_LAYERS, creekLayerDefs, creeksModule } from "./creeksModule";
import { CreeksLayer } from "./creeks/layer";
import { CREEK_TARGET_PX, CREEK_WIDTH_M, MODELLED_TARGET_PX, MODELLED_WIDTH_M } from "./creeks/colors";
import { loadCreeks } from "./creeks/parse";
import { ribbonWidth } from "./creeks/width";
import { LayerSelection } from "./layerSelection";

// The real loader, wrapped so a test can see whether it was asked to load anything.
vi.mock("./creeks/parse", async (importOriginal) => {
  const real = await importOriginal<typeof import("./creeks/parse")>();
  return { ...real, loadCreeks: vi.fn(real.loadCreeks) };
});

describe("creekLayerDefs", () => {
  it("offers a toggle only for each layer the dataset has", () => {
    expect(creekLayerDefs({})).toEqual([]);
    expect(creekLayerDefs({ creeks_mapped: 26, creeks_modelled: 0 }).map((d) => d.id)).toEqual(["creeks"]);
    expect(creekLayerDefs({ creeks_mapped: 0, creeks_modelled: 40 }).map((d) => d.id)).toEqual(["modelled-streams"]);
    expect(creekLayerDefs({ creeks_mapped: 26, creeks_modelled: 40 }).map((d) => d.id)).toEqual(["creeks", "modelled-streams"]);
  });

  it("labels them and turns both on by default", () => {
    expect(CREEK_LAYERS.creeks).toMatchObject({ label: "Historical creeks", defaultOn: true });
    expect(CREEK_LAYERS.modelled).toMatchObject({ id: "modelled-streams", label: "Modelled streams", defaultOn: true });
  });

  it("ignores junk counts", () => {
    expect(creekLayerDefs({ creeks_mapped: "26" as unknown as number, creeks_modelled: -1 })).toEqual([]);
    expect(creekLayerDefs({ creeks_mapped: Number.NaN })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------- the module itself

interface ToggleCall {
  id: string;
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  set: ReturnType<typeof vi.fn>;
}

const mappedCreek = {
  id: "creek-1",
  name: "Test Creek",
  confidence: "inferred",
  sources: "Hoadley 1855",
  points: [0, 0, 30, 0],
};
const modelledStream = { order: 3, points: [0, 10, 30, 10] };

function creeksDoc(over: Record<string, unknown> = {}) {
  return { version: 1, mapped: [mappedCreek], modelled: [modelledStream], ...over };
}

function stubFetch(body: unknown, status = 200) {
  const fn = vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function makeCtx(opts: { noFile?: boolean; hash?: string[]; heights?: Float32Array } = {}) {
  const toggles: ToggleCall[] = [];
  const add = vi.fn();
  const requestRender = vi.fn();
  const layers = new LayerSelection(opts.hash);
  // The camera sees 10,000 m top to bottom on a 1,000 px tall canvas: 10 m per pixel at zoom 1.
  const camera = { top: 5000, bottom: -5000, zoom: 1 };
  const rigListeners: Array<() => void> = [];
  const unsubscribe = vi.fn();
  const ctx = {
    camera,
    canvas: { clientHeight: 1000 },
    rig: {
      onChange: (cb: () => void) => {
        rigListeners.push(cb);
        return unsubscribe;
      },
    },
    assetBase: "/assets/test",
    meta: {
      width: 2,
      height: 2,
      cell_m: 100,
      water_level_m: 0.6,
      ...(opts.noFile ? {} : { creeks_file: "creeks.json" }),
    },
    heights: opts.heights ?? new Float32Array([1, 2, 3, 4]),
    verticalExaggeration: 3,
    layers,
    scene: { add },
    requestRender,
    shell: {
      addToggle: (id: string, label: string, checked: boolean, onChange: (on: boolean) => void) => {
        const set = vi.fn();
        toggles.push({ id, label, checked, onChange, set });
        return { set, disable: vi.fn(), enable: vi.fn() };
      },
    },
  } as unknown as AppContext;
  return { ctx, toggles, add, requestRender, layers, camera, rigListeners, unsubscribe };
}

function added(add: ReturnType<typeof vi.fn>): CreeksLayer {
  expect(add).toHaveBeenCalledTimes(1);
  return add.mock.calls[0][0] as CreeksLayer;
}

function child(layer: THREE.Group, name: string): THREE.Object3D {
  const found = layer.children.find((c) => c.name === name);
  expect(found, `child ${name}`).toBeDefined();
  return found!;
}

describe("creeksModule", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(loadCreeks).mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does nothing, and asks for nothing, when the dataset has no creeks_file", async () => {
    const fetchSpy = stubFetch(creeksDoc());
    const { ctx, toggles, add } = makeCtx({ noFile: true });
    await creeksModule(ctx);
    expect(loadCreeks).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(toggles).toEqual([]);
    expect(add).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns once and leaves the viewer unchanged when the file cannot be fetched (HTTP 404)", async () => {
    stubFetch({}, 404);
    const { ctx, toggles, add, requestRender } = makeCtx();
    await creeksModule(ctx);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][1])).toMatch(/404/);
    expect(toggles).toEqual([]);
    expect(add).not.toHaveBeenCalled();
    expect(requestRender).not.toHaveBeenCalled();
  });

  it("warns once and adds nothing when the file is invalid", async () => {
    stubFetch(creeksDoc({ version: 7 }));
    const { ctx, toggles, add } = makeCtx();
    await creeksModule(ctx);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(toggles).toEqual([]);
    expect(add).not.toHaveBeenCalled();
  });

  it("adds the layer once and two default-on toggles, creeks first, when both lists are present", async () => {
    const fetchSpy = stubFetch(creeksDoc());
    const { ctx, toggles, add, layers } = makeCtx();
    await creeksModule(ctx);
    expect(fetchSpy).toHaveBeenCalledWith("/assets/test/creeks.json");
    expect(warn).not.toHaveBeenCalled();
    expect(toggles.map((t) => [t.id, t.label, t.checked])).toEqual([
      ["creeks", "Historical creeks", true],
      ["modelled-streams", "Modelled streams", true],
    ]);
    expect(layers.has("creeks") && layers.has("modelled-streams")).toBe(true);
    const layer = added(add);
    expect(layer).toBeInstanceOf(CreeksLayer);
    expect(child(layer, "creeks-mapped").visible).toBe(true);
    expect(child(layer, "creeks-modelled").visible).toBe(true);
  });

  it("offers only the creeks toggle when the file holds only mapped lines", async () => {
    stubFetch(creeksDoc({ modelled: [] }));
    const { ctx, toggles, add, layers } = makeCtx();
    await creeksModule(ctx);
    expect(toggles.map((t) => t.id)).toEqual(["creeks"]);
    expect(layers.has("modelled-streams")).toBe(false);
    expect(added(add)).toBeInstanceOf(CreeksLayer);
  });

  it("offers only the modelled toggle when the file holds only modelled lines", async () => {
    stubFetch(creeksDoc({ mapped: [] }));
    const { ctx, toggles, add } = makeCtx();
    await creeksModule(ctx);
    expect(toggles.map((t) => t.id)).toEqual(["modelled-streams"]);
    added(add);
  });

  it("adds nothing for a file with no lines at all", async () => {
    stubFetch(creeksDoc({ mapped: [], modelled: [] }));
    const { ctx, toggles, add } = makeCtx();
    await creeksModule(ctx);
    expect(toggles).toEqual([]);
    expect(add).not.toHaveBeenCalled();
  });

  it("toggling a layer off hides only its own group, updates the toggle and asks for a render", async () => {
    stubFetch(creeksDoc());
    const { ctx, toggles, add, layers, requestRender } = makeCtx();
    await creeksModule(ctx);
    const layer = added(add);
    const mapped = child(layer, "creeks-mapped");
    const modelled = child(layer, "creeks-modelled");
    const creeksToggle = toggles.find((t) => t.id === "creeks")!;
    const modelledToggle = toggles.find((t) => t.id === "modelled-streams")!;
    const rendersBefore = requestRender.mock.calls.length;

    creeksToggle.onChange(false); // the visitor unticks "Historical creeks"
    expect(layers.has("creeks")).toBe(false);
    expect(mapped.visible).toBe(false);
    expect(modelled.visible).toBe(true);
    expect(creeksToggle.set).toHaveBeenLastCalledWith(false);
    expect(modelledToggle.set).toHaveBeenLastCalledWith(true);
    expect(requestRender.mock.calls.length).toBeGreaterThan(rendersBefore);

    creeksToggle.onChange(true);
    modelledToggle.onChange(false);
    expect(mapped.visible).toBe(true);
    expect(modelled.visible).toBe(false);
    expect(modelledToggle.set).toHaveBeenLastCalledWith(false);
    expect(creeksToggle.set).toHaveBeenLastCalledWith(true);

    layers.set("modelled-streams", true); // another part of the viewer (e.g. the hash) turns it back on
    expect(modelled.visible).toBe(true);
    expect(modelledToggle.set).toHaveBeenLastCalledWith(true);
  });

  it("keeps both groups hidden when the URL hash lists layers that do not include the creeks", async () => {
    stubFetch(creeksDoc());
    const { ctx, toggles, add, layers } = makeCtx({ hash: ["streets"] });
    await creeksModule(ctx);
    const layer = added(add);
    expect(layers.list()).toEqual(["streets"]);
    expect(child(layer, "creeks-mapped").visible).toBe(false);
    expect(child(layer, "creeks-modelled").visible).toBe(false);
    expect(toggles.map((t) => [t.id, t.checked])).toEqual([["creeks", false], ["modelled-streams", false]]);
    expect(toggles.every((t) => t.set.mock.calls.at(-1)?.[0] === false)).toBe(true);
  });

  it("warns once and leaves the viewer unchanged when the layer cannot be built (heights of the wrong size)", async () => {
    stubFetch(creeksDoc());
    const { ctx, toggles, add, requestRender } = makeCtx({ heights: new Float32Array(3) });
    await expect(creeksModule(ctx)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(toggles).toEqual([]);
    expect(add).not.toHaveBeenCalled();
    expect(requestRender).not.toHaveBeenCalled();
  });

  it("warns once and never adds the layer to the scene when the wiring fails", async () => {
    stubFetch(creeksDoc());
    const { ctx, add } = makeCtx();
    (ctx.shell as unknown as { addToggle: () => never }).addToggle = () => {
      throw new Error("toggle already exists");
    };
    await expect(creeksModule(ctx)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();
  });

  it("shows exactly the creek layers a hash names", async () => {
    stubFetch(creeksDoc());
    const { ctx, add } = makeCtx({ hash: ["modelled-streams"] });
    await creeksModule(ctx);
    const layer = added(add);
    expect(child(layer, "creeks-mapped").visible).toBe(false);
    expect(child(layer, "creeks-modelled").visible).toBe(true);
  });
});

describe("creeksModule width by zoom", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Horizontal distance between the first left and right vertex of a ribbon mesh. */
  function widthOf(layer: THREE.Group, name: string): number {
    const mesh = layer.getObjectByName(name) as THREE.Mesh;
    const p = mesh.geometry.getAttribute("position");
    return Math.hypot(p.getX(0) - p.getX(1), p.getZ(0) - p.getZ(1));
  }
  // The test creeks run along x, the ground is level enough that the horizontal gap is the width.
  const MAPPED = "creeks-mapped-ribbons";
  const MODELLED = "creeks-modelled-order-3";

  it("builds at the width for the camera it finds (10 m per pixel: far out)", async () => {
    stubFetch(creeksDoc());
    const { ctx, add, rigListeners } = makeCtx();
    await creeksModule(ctx);
    const layer = added(add);
    expect(rigListeners).toHaveLength(1);
    expect(widthOf(layer, MAPPED)).toBeCloseTo(ribbonWidth(CREEK_WIDTH_M, CREEK_TARGET_PX, 10));
    expect(widthOf(layer, MAPPED)).toBeGreaterThan(CREEK_WIDTH_M);
    expect(widthOf(layer, MODELLED)).toBeCloseTo(ribbonWidth(MODELLED_WIDTH_M[3], MODELLED_TARGET_PX[3], 10));
  });

  it("rebuilds the ribbons on a rig change that crosses a level, and asks for a render", async () => {
    stubFetch(creeksDoc());
    const { ctx, add, camera, rigListeners, requestRender } = makeCtx();
    await creeksModule(ctx);
    const layer = added(add);
    const far = widthOf(layer, MAPPED);

    camera.zoom = 100; // 0.1 m per pixel: close up
    const rendersBefore = requestRender.mock.calls.length;
    rigListeners[0]();
    expect(widthOf(layer, MAPPED)).toBeCloseTo(CREEK_WIDTH_M);
    expect(widthOf(layer, MODELLED)).toBeCloseTo(MODELLED_WIDTH_M[3]);
    expect(far).toBeGreaterThan(widthOf(layer, MAPPED));
    expect(requestRender.mock.calls.length).toBe(rendersBefore + 1);

    camera.zoom = 0.5; // 20 m per pixel: wider than at 10
    rigListeners[0]();
    expect(widthOf(layer, MAPPED)).toBeCloseTo(ribbonWidth(CREEK_WIDTH_M, CREEK_TARGET_PX, 20));
    expect(widthOf(layer, MAPPED)).toBeGreaterThan(far);
  });

  it("does not rebuild or ask for a render when a rig change stays inside the same level", async () => {
    stubFetch(creeksDoc());
    const { ctx, add, camera, rigListeners, requestRender } = makeCtx();
    await creeksModule(ctx);
    const layer = added(add);
    const geometry = (layer.getObjectByName(MAPPED) as THREE.Mesh).geometry;
    const rendersBefore = requestRender.mock.calls.length;
    camera.zoom = 1.001;
    rigListeners[0]();
    expect((layer.getObjectByName(MAPPED) as THREE.Mesh).geometry).toBe(geometry);
    expect(requestRender.mock.calls.length).toBe(rendersBefore);
  });

  it("reads the canvas height too: a taller canvas is closer, so thinner", async () => {
    stubFetch(creeksDoc());
    const { ctx, add, rigListeners } = makeCtx();
    await creeksModule(ctx);
    const layer = added(add);
    const far = widthOf(layer, MAPPED);
    (ctx.canvas as unknown as { clientHeight: number }).clientHeight = 100000; // 0.1 m per pixel
    rigListeners[0]();
    expect(widthOf(layer, MAPPED)).toBeCloseTo(CREEK_WIDTH_M);
    expect(far).toBeGreaterThan(CREEK_WIDTH_M);
  });

  it("falls back to the close-up widths when the canvas has no height yet", async () => {
    stubFetch(creeksDoc());
    const { ctx, add } = makeCtx();
    (ctx.canvas as unknown as { clientHeight: number }).clientHeight = 0;
    await creeksModule(ctx);
    expect(widthOf(added(add), MAPPED)).toBeCloseTo(CREEK_WIDTH_M);
  });

  it("keeps the toggles working after a rebuild", async () => {
    stubFetch(creeksDoc());
    const { ctx, add, toggles, camera, rigListeners } = makeCtx();
    await creeksModule(ctx);
    const layer = added(add);
    toggles.find((t) => t.id === "creeks")!.onChange(false);
    camera.zoom = 100;
    rigListeners[0]();
    expect(layer.getObjectByName("creeks-mapped")!.visible).toBe(false);
    toggles.find((t) => t.id === "creeks")!.onChange(true);
    expect(layer.getObjectByName("creeks-mapped")!.visible).toBe(true);
    expect(widthOf(layer, MAPPED)).toBeCloseTo(CREEK_WIDTH_M);
  });

  it("does not listen to the rig when the layer could not be built", async () => {
    stubFetch(creeksDoc());
    const { ctx, rigListeners } = makeCtx({ heights: new Float32Array(3) });
    await creeksModule(ctx);
    expect(rigListeners).toHaveLength(0);
  });
});
