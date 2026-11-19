import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { planChunks, type ChunkPlan } from "../chunks";
import type { HabitatClass } from "../habitat";
import { GROW_FROM, VegetationLayer, growScale, scaleInstances, type VegetationLayerOptions } from "./layer";

const CLASSES: HabitatClass[] = [
  { id: 0, name: "Unmapped", group: "unmapped" },
  { id: 1, name: "Bay", group: "water" },
  { id: 5, name: "Oak", group: "woodland" },
  { id: 9, name: "Scrub", group: "scrub" },
  { id: 10, name: "Willow", group: "wetland" },
];
const SIZE = { width: 129, height: 65, cell_m: 10 };
const PLANS = planChunks(SIZE.width, SIZE.height, 64); // two chunks side by side

function options(over: Partial<VegetationLayerOptions> = {}): VegetationLayerOptions {
  const n = SIZE.width * SIZE.height;
  const heights = new Float32Array(n).fill(40);
  // west chunk: woodland (class 5) on the north half, scrub (9) on the south half; east chunk: reeds (10)
  const habitat = new Uint8Array(n);
  for (let y = 0; y < SIZE.height; y++) {
    for (let x = 0; x < SIZE.width; x++) habitat[y * SIZE.width + x] = x === 64 ? 1 : x > 64 ? 10 : y < 32 ? 5 : 9; // column 64 (shared border) is water
  }
  return { size: SIZE, heights, habitat, classes: CLASSES, waterLevelM: 0.6, exaggeration: 3, seed: 7, growMs: 0, ...over };
}

const chunkMesh = () => new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
const instanced = (m: THREE.Object3D) =>
  m.children.filter((c): c is THREE.InstancedMesh => (c as THREE.InstancedMesh).isInstancedMesh);
/** The plant meshes (not the shadows). */
const veg = (m: THREE.Object3D) => instanced(m).filter((c) => c.name !== "vegetation-shadows");
const shadowsOf = (m: THREE.Object3D) => instanced(m).find((c) => c.name === "vegetation-shadows");

describe("VegetationLayer", () => {
  it("builds one instanced mesh per species per chunk as children of the chunk mesh", () => {
    const layer = new VegetationLayer(options());
    const west = chunkMesh();
    layer.attach(west, PLANS[0]);
    const kids = veg(west);
    expect(kids.map((k) => k.name).sort()).toEqual(["vegetation-coyote-brush", "vegetation-oak"]);
    for (const k of kids) {
      expect(k.count).toBeGreaterThan(0);
      expect(k.frustumCulled).toBe(false);
      expect(k.instanceColor).not.toBeNull();
      expect(k.visible).toBe(true);
    }
    const east = chunkMesh();
    layer.attach(east, PLANS[1]);
    expect(veg(east).map((k) => k.name)).toEqual(["vegetation-tule"]);
    const s = layer.stats();
    expect(s.meshes).toBe(4); // three plant meshes plus the west chunk's shadows (reeds cast none)
    expect(s.instances).toBe([...veg(west), ...veg(east)].reduce((n, k) => n + k.count, 0));
    layer.dispose();
  });

  it("scales y by the exaggeration and keeps x/z in world metres", () => {
    const layer = new VegetationLayer(options({ exaggeration: 3, sizeBoost: 1 }));
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    const tree = veg(m).find((k) => k.name === "vegetation-oak")!;
    const mat = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < Math.min(tree.count, 20); i++) {
      tree.getMatrixAt(i, mat);
      mat.decompose(p, q, s);
      expect(p.y).toBeCloseTo(40 * 3, 3); // flat ground at 40 m, exaggerated x3
      expect(Math.abs(p.x)).toBeLessThanOrEqual(64 * 10);
      expect(s.x).toBeGreaterThanOrEqual(9 - 1e-4);
      expect(s.x).toBeLessThanOrEqual(15 + 1e-4);
      expect(s.y).toBeCloseTo(s.x, 4);
    }
    layer.dispose();
  });

  it("applies sizeBoost to the instance scale", () => {
    const sizes = (boost: number) => {
      const layer = new VegetationLayer(options({ sizeBoost: boost }));
      const m = chunkMesh();
      layer.attach(m, PLANS[0]);
      const tree = veg(m).find((k) => k.name === "vegetation-oak")!;
      const mat = new THREE.Matrix4();
      tree.getMatrixAt(0, mat);
      const s = new THREE.Vector3();
      mat.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
      layer.dispose();
      return s.x;
    };
    expect(sizes(2) / sizes(1)).toBeCloseTo(2, 4);
  });

  it("gives instances a tint in the allowed band", () => {
    const layer = new VegetationLayer(options());
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    const k = veg(m)[0];
    const arr = k.instanceColor!.array;
    for (let i = 0; i < k.count * 3; i++) {
      expect(arr[i]).toBeGreaterThanOrEqual(0.78 - 1e-6);
      expect(arr[i]).toBeLessThanOrEqual(1.12 + 1e-6);
    }
    layer.dispose();
  });

  it("is deterministic: re-attaching the same chunk gives identical instances", () => {
    const layer = new VegetationLayer(options());
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    const first = veg(m).map((k) => Array.from(k.instanceMatrix.array));
    layer.detach(m);
    expect(veg(m)).toHaveLength(0);
    layer.attach(m, PLANS[0]);
    expect(veg(m).map((k) => Array.from(k.instanceMatrix.array))).toEqual(first);
    layer.dispose();
  });

  it("caps instances per chunk", () => {
    const layer = new VegetationLayer(options({ maxInstancesPerChunk: 50 }));
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    expect(layer.stats().instances).toBe(50);
    layer.dispose();
  });

  it("detach disposes the instance buffers but not the shared geometry or material", () => {
    const layer = new VegetationLayer(options());
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    const kids = veg(m);
    let instDisposed = 0;
    let geoDisposed = 0;
    let matDisposed = 0;
    for (const k of kids) {
      k.addEventListener("dispose", () => instDisposed++);
      k.geometry.addEventListener("dispose", () => geoDisposed++);
      (k.material as THREE.Material).addEventListener("dispose", () => matDisposed++);
    }
    layer.detach(m);
    expect(instDisposed).toBe(kids.length);
    expect(geoDisposed).toBe(0);
    expect(matDisposed).toBe(0);
    expect(m.children).toHaveLength(0);
    expect(layer.stats()).toEqual({ instances: 0, meshes: 0 });
    layer.detach(m); // second detach is a no-op
    layer.detach(chunkMesh()); // so is an unknown mesh
    layer.dispose();
  });

  it("re-attaching a mesh replaces its vegetation instead of doubling it", () => {
    const layer = new VegetationLayer(options());
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    const before = layer.stats();
    layer.attach(m, PLANS[0]);
    expect(layer.stats()).toEqual(before);
    expect(veg(m)).toHaveLength(2);
    layer.dispose();
  });

  it("setEnabled(false) hides existing vegetation; setEnabled(true) shows it again", () => {
    const layer = new VegetationLayer(options());
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    layer.setEnabled(false);
    expect(layer.isEnabled()).toBe(false);
    expect(veg(m).every((k) => !k.visible)).toBe(true);
    expect(layer.stats().instances).toBeGreaterThan(0); // still built, just hidden
    layer.setEnabled(true);
    expect(veg(m).every((k) => k.visible)).toBe(true);
    layer.dispose();
  });

  it("chunks attached while disabled get vegetation lazily on refresh after enabling", () => {
    const layer = new VegetationLayer(options({ maxBuildsPerRefresh: 1 }));
    layer.setEnabled(false);
    const a = chunkMesh();
    const b = chunkMesh();
    layer.attach(a, PLANS[0]);
    layer.attach(b, PLANS[1]);
    expect(veg(a)).toHaveLength(0);
    expect(veg(b)).toHaveLength(0);
    expect(layer.stats()).toEqual({ instances: 0, meshes: 0 });
    // refresh does nothing while disabled
    expect(layer.refresh([a, b])).toBe(false);
    expect(veg(a)).toHaveLength(0);
    layer.setEnabled(true);
    expect(veg(a)).toHaveLength(0); // enabling alone builds nothing: refresh does
    // budget 1 per call: first call builds one and reports more pending
    expect(layer.refresh([a, b])).toBe(true);
    expect(veg(a).length + veg(b).length).toBeGreaterThan(0);
    expect(veg(a).length > 0 && veg(b).length > 0).toBe(false);
    expect(layer.refresh([a, b])).toBe(true); // built the last one: render again
    expect(veg(a).length).toBeGreaterThan(0);
    expect(veg(b).length).toBeGreaterThan(0);
    // nothing left: later refreshes are no-ops
    const s = layer.stats();
    expect(layer.refresh([a, b])).toBe(false);
    expect(layer.stats()).toEqual(s);
    layer.dispose();
  });

  it("refresh only builds meshes it is given", () => {
    const layer = new VegetationLayer(options());
    layer.setEnabled(false);
    const a = chunkMesh();
    const b = chunkMesh();
    layer.attach(a, PLANS[0]);
    layer.attach(b, PLANS[1]);
    layer.setEnabled(true);
    expect(layer.refresh(new Set([b]))).toBe(true);
    expect(layer.refresh(new Set([b]))).toBe(false);
    expect(veg(a)).toHaveLength(0);
    expect(veg(b).length).toBeGreaterThan(0);
    layer.dispose();
  });

  it("a mesh detached while pending is forgotten", () => {
    const layer = new VegetationLayer(options());
    layer.setEnabled(false);
    const a = chunkMesh();
    layer.attach(a, PLANS[0]);
    layer.detach(a);
    layer.setEnabled(true);
    layer.refresh([a]);
    expect(veg(a)).toHaveLength(0);
    layer.dispose();
  });

  it("dispose frees everything including the shared assets", () => {
    const layer = new VegetationLayer(options());
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    let geoDisposed = 0;
    for (const k of veg(m)) k.geometry.addEventListener("dispose", () => geoDisposed++);
    layer.dispose();
    expect(m.children).toHaveLength(0);
    expect(geoDisposed).toBeGreaterThan(0);
    expect(layer.stats()).toEqual({ instances: 0, meshes: 0 });
  });

  it("plugs into the terrain hook signature", () => {
    const layer = new VegetationLayer(options());
    const hooks = {
      onLod0Built: (plan: ChunkPlan, mesh: THREE.Mesh) => layer.attach(mesh, plan),
      onLod0Evicted: (_plan: ChunkPlan, mesh: THREE.Mesh) => layer.detach(mesh),
    };
    const m = chunkMesh();
    hooks.onLod0Built(PLANS[0], m);
    expect(layer.stats().meshes).toBeGreaterThan(0);
    hooks.onLod0Evicted(PLANS[0], m);
    expect(layer.stats().meshes).toBe(0);
    layer.dispose();
  });

  it("lays one shadow under every tree and shrub of a chunk, and none under reeds", () => {
    const layer = new VegetationLayer(options());
    const west = chunkMesh();
    const east = chunkMesh();
    layer.attach(west, PLANS[0]);
    layer.attach(east, PLANS[1]);
    const sh = shadowsOf(west)!;
    expect(sh.count).toBe(veg(west).reduce((n, k) => n + k.count, 0));
    expect(sh.renderOrder).toBeGreaterThan(0); // after the sea
    expect(sh.renderOrder).toBeLessThan(1); // before the ponds, village discs, creeks and streets
    expect(shadowsOf(east)).toBeUndefined(); // tule only
    layer.dispose();
  });

  it("hides, shows and frees the shadows with the plants", () => {
    const layer = new VegetationLayer(options());
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    layer.setEnabled(false);
    expect(shadowsOf(m)!.visible).toBe(false);
    layer.setEnabled(true);
    expect(shadowsOf(m)!.visible).toBe(true);
    layer.detach(m);
    expect(shadowsOf(m)).toBeUndefined();
    layer.dispose();
  });

  it("can be built without shadows", () => {
    const layer = new VegetationLayer(options({ shadows: false }));
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    expect(shadowsOf(m)).toBeUndefined();
    layer.dispose();
  });
});

describe("VegetationLayer.setGeometries", () => {
  it("swaps a species' shape and replants built chunks lazily with it", () => {
    const layer = new VegetationLayer(options());
    const west = chunkMesh();
    layer.attach(west, PLANS[0]);
    const before = veg(west).find((k) => k.name === "vegetation-oak")!;
    const count = before.count;
    const shadowScaleBefore = new THREE.Matrix4();
    shadowsOf(west)!.getMatrixAt(0, shadowScaleBefore);

    // A model twice as wide as the procedural oak (unit height, like the real ones).
    const wide = new THREE.BoxGeometry(3, 1, 3).translate(0, 0.5, 0);
    layer.setGeometries({ oak: wide });
    expect(veg(west)).toHaveLength(0); // cleared, waiting for refresh
    expect(layer.refresh([west])).toBe(true);
    const after = veg(west).find((k) => k.name === "vegetation-oak")!;
    expect(after.geometry).toBe(wide);
    expect(after.count).toBe(count); // same plants, same places
    expect(veg(west).find((k) => k.name === "vegetation-coyote-brush")!.geometry).not.toBe(wide);
    // shadows are sized from the new footprint
    const m = new THREE.Matrix4();
    shadowsOf(west)!.getMatrixAt(0, m);
    expect(m.equals(shadowScaleBefore)).toBe(false);
    layer.dispose();
  });

  it("does nothing when given no new shapes", () => {
    const layer = new VegetationLayer(options());
    const west = chunkMesh();
    layer.attach(west, PLANS[0]);
    const kids = veg(west);
    layer.setGeometries({});
    expect(veg(west)).toEqual(kids);
    layer.dispose();
  });
});

describe("grow-in of newly planted chunks", () => {
  const scaleOf = (im: THREE.InstancedMesh, i = 0) => {
    const m = new THREE.Matrix4();
    im.getMatrixAt(i, m);
    return new THREE.Vector3().setFromMatrixScale(m).x;
  };

  it("eases from GROW_FROM to full size", () => {
    expect(growScale(0)).toBeCloseTo(GROW_FROM);
    expect(growScale(1)).toBe(1);
    expect(growScale(2)).toBe(1);
    for (let t = 0.1; t < 1; t += 0.1) expect(growScale(t)).toBeGreaterThan(growScale(t - 0.1));
  });

  it("scales the 3x3 part only, so a plant grows on its spot", () => {
    const full = new THREE.Matrix4().compose(new THREE.Vector3(5, 6, 7), new THREE.Quaternion(), new THREE.Vector3(2, 2, 2));
    const out = new Float32Array(16);
    scaleInstances(new Float32Array(full.elements), out, 0.5);
    const m = new THREE.Matrix4().fromArray(out);
    expect(new THREE.Vector3().setFromMatrixPosition(m).toArray()).toEqual([5, 6, 7]);
    expect(new THREE.Vector3().setFromMatrixScale(m).x).toBeCloseTo(1);
  });

  it("plants start small, grow over growMs, then hold their full matrices", () => {
    const still = new VegetationLayer(options({ growMs: 0 }));
    const grow = new VegetationLayer(options({ growMs: 400 }));
    const a = chunkMesh();
    const b = chunkMesh();
    still.attach(a, PLANS[0]);
    grow.attach(b, PLANS[0]);
    const full = veg(a)[0];
    const im = veg(b)[0];
    expect(scaleOf(im) / scaleOf(full)).toBeCloseTo(GROW_FROM);
    expect(grow.animate(1000)).toBe(true); // starts the clock
    expect(grow.animate(1200)).toBe(true);
    expect(scaleOf(im) / scaleOf(full)).toBeCloseTo(growScale(0.5));
    expect(grow.animate(1400)).toBe(false);
    expect(Array.from(im.instanceMatrix.array)).toEqual(Array.from(full.instanceMatrix.array));
    expect(still.animate(0)).toBe(false);
  });

  it("setGrowMs(0) finishes growing chunks at once, and detach drops them", () => {
    const layer = new VegetationLayer(options({ growMs: 400 }));
    const a = chunkMesh();
    const b = chunkMesh();
    layer.attach(a, PLANS[0]);
    layer.attach(b, PLANS[1]);
    layer.detach(b);
    layer.setGrowMs(0);
    expect(layer.animate(0)).toBe(false);
    const ref = new VegetationLayer(options());
    const c = chunkMesh();
    ref.attach(c, PLANS[0]);
    expect(Array.from(veg(a)[0].instanceMatrix.array)).toEqual(
      Array.from(veg(c)[0].instanceMatrix.array),
    );
  });
});
