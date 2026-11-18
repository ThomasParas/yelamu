import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { CREEK_TARGET_PX, CREEK_WIDTH_M, MAX_WIDTH_M, MODELLED_TARGET_PX, MODELLED_WIDTH_M } from "./colors";
import { CreeksLayer } from "./layer";
import { ribbonWidth } from "./width";
import type { Creeks } from "./types";

const creeks: Creeks = {
  version: 1,
  mapped: [{ id: "creek-1", name: "Test Creek", confidence: "inferred", sources: "", points: [0, 0, 100, 0] }],
  modelled: [
    { order: 3, points: [0, 50, 100, 50] },
    { order: 5, points: [0, 100, 100, 100] },
    { order: 7, points: [0, 150, 100, 150] },
  ],
};
const opts = { waterLevelM: 0.6, exaggeration: 3 };
const flat = () => 10;

function meshNames(g: THREE.Object3D): string[] {
  const names: string[] = [];
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) names.push(o.name);
  });
  return names.sort();
}

describe("CreeksLayer", () => {
  it("builds one mapped mesh and one modelled mesh per width band that has lines", () => {
    const layer = new CreeksLayer(creeks, flat, opts);
    // orders 5 and 7 share the "5 and up" band; no order 4 line, so no order-4 mesh
    expect(meshNames(layer)).toEqual(["creeks-mapped-ribbons", "creeks-modelled-order-3", "creeks-modelled-order-5"]);
    layer.dispose();
  });

  it("builds only the meshes for what is present", () => {
    expect(meshNames(new CreeksLayer({ version: 1, mapped: [], modelled: [] }, flat, opts))).toEqual([]);
    expect(
      meshNames(new CreeksLayer({ version: 1, mapped: [], modelled: [{ order: 4, points: [0, 0, 50, 0] }] }, flat, opts)),
    ).toEqual(["creeks-modelled-order-4"]);
  });

  it("toggles each group on its own", () => {
    const layer = new CreeksLayer(creeks, flat, opts);
    const mapped = layer.getObjectByName("creeks-mapped")!;
    const modelled = layer.getObjectByName("creeks-modelled")!;
    expect(mapped.visible && modelled.visible && layer.visible).toBe(true);

    layer.setMappedEnabled(false);
    expect(mapped.visible).toBe(false);
    expect(modelled.visible).toBe(true);
    expect(layer.visible).toBe(true);

    layer.setMappedEnabled(true);
    layer.setModelledEnabled(false);
    expect(mapped.visible).toBe(true);
    expect(modelled.visible).toBe(false);
    layer.dispose();
  });

  it("puts the ribbons at (ground + lift) * exaggeration and draws them double-sided", () => {
    const layer = new CreeksLayer(creeks, flat, opts);
    const mesh = layer.getObjectByName("creeks-mapped-ribbons") as THREE.Mesh;
    const y = mesh.geometry.getAttribute("position").getY(0);
    expect(y).toBeCloseTo((10 + 3) * 3);
    expect((mesh.material as THREE.Material).side).toBe(THREE.DoubleSide);
    layer.dispose();
  });

  it("removes itself from its parent on dispose", () => {
    const scene = new THREE.Group();
    const layer = new CreeksLayer(creeks, flat, opts);
    scene.add(layer);
    expect(layer.parent).toBe(scene);
    layer.dispose();
    expect(layer.parent).toBeNull();
    expect(scene.children).toHaveLength(0);
  });
});

/** Horizontal distance between the first left and right vertex of a mesh (the ribbon width on flat ground). */
function widthOf(layer: THREE.Object3D, name: string): number {
  const mesh = layer.getObjectByName(name) as THREE.Mesh;
  const p = mesh.geometry.getAttribute("position");
  return Math.hypot(p.getX(0) - p.getX(1), p.getZ(0) - p.getZ(1));
}

describe("CreeksLayer width by zoom", () => {
  const MAPPED = "creeks-mapped-ribbons";
  const M3 = "creeks-modelled-order-3";
  const M5 = "creeks-modelled-order-5";

  it("builds at the close-up widths without update() or with no metres per pixel given", () => {
    for (const layer of [new CreeksLayer(creeks, flat, opts), new CreeksLayer(creeks, flat, { ...opts, mPerPx: 0 })]) {
      expect(widthOf(layer, MAPPED)).toBeCloseTo(CREEK_WIDTH_M);
      expect(widthOf(layer, M3)).toBeCloseTo(MODELLED_WIDTH_M[3]);
      expect(widthOf(layer, M5)).toBeCloseTo(MODELLED_WIDTH_M[5]);
      layer.dispose();
    }
  });

  it("builds at the zoom-dependent widths when the constructor is given metres per pixel", () => {
    const layer = new CreeksLayer(creeks, flat, { ...opts, mPerPx: 26 });
    expect(widthOf(layer, MAPPED)).toBeCloseTo(ribbonWidth(CREEK_WIDTH_M, CREEK_TARGET_PX, 26));
    expect(widthOf(layer, M3)).toBeCloseTo(ribbonWidth(MODELLED_WIDTH_M[3], MODELLED_TARGET_PX[3], 26));
    expect(widthOf(layer, MAPPED)).toBeGreaterThan(CREEK_WIDTH_M);
    layer.dispose();
  });

  it("update() with a large metres per pixel widens every band, each by its own target, and returns true", () => {
    const layer = new CreeksLayer(creeks, flat, opts);
    expect(layer.update(26)).toBe(true);
    const mapped = widthOf(layer, MAPPED);
    const m3 = widthOf(layer, M3);
    const m5 = widthOf(layer, M5);
    expect(mapped).toBeCloseTo(ribbonWidth(CREEK_WIDTH_M, CREEK_TARGET_PX, 26));
    expect(m3).toBeCloseTo(ribbonWidth(MODELLED_WIDTH_M[3], MODELLED_TARGET_PX[3], 26));
    expect(m5).toBeCloseTo(ribbonWidth(MODELLED_WIDTH_M[5], MODELLED_TARGET_PX[5], 26));
    expect(mapped).toBeGreaterThanOrEqual(CREEK_TARGET_PX * 26);
    expect(m3).toBeGreaterThanOrEqual(MODELLED_TARGET_PX[3] * 26);
    expect(mapped).toBeGreaterThan(CREEK_WIDTH_M * 3);
    layer.dispose();
  });

  it("caps the width at 160 m however far out it is", () => {
    const layer = new CreeksLayer(creeks, flat, opts);
    layer.update(1e5);
    expect(widthOf(layer, MAPPED)).toBeCloseTo(MAX_WIDTH_M);
    expect(widthOf(layer, M3)).toBeCloseTo(MAX_WIDTH_M);
    layer.dispose();
  });

  it("a second update() with the same value returns false and keeps the same geometry objects", () => {
    const layer = new CreeksLayer(creeks, flat, opts);
    layer.update(26);
    const before = [MAPPED, M3, M5].map((n) => (layer.getObjectByName(n) as THREE.Mesh).geometry);
    expect(layer.update(26)).toBe(false);
    // a different value inside the same level changes nothing either
    expect(layer.update(26.001)).toBe(false);
    const after = [MAPPED, M3, M5].map((n) => (layer.getObjectByName(n) as THREE.Mesh).geometry);
    after.forEach((g, i) => expect(g).toBe(before[i]));
    layer.dispose();
  });

  it("update() at the construction value returns false and rebuilds nothing", () => {
    const layer = new CreeksLayer(creeks, flat, { ...opts, mPerPx: 26 });
    const before = (layer.getObjectByName(MAPPED) as THREE.Mesh).geometry;
    expect(layer.update(26)).toBe(false);
    expect((layer.getObjectByName(MAPPED) as THREE.Mesh).geometry).toBe(before);
    layer.dispose();
  });

  it("returns to the close-up widths when update() is given a small value again", () => {
    const layer = new CreeksLayer(creeks, flat, opts);
    layer.update(40);
    expect(widthOf(layer, MAPPED)).toBeGreaterThan(CREEK_WIDTH_M);
    expect(layer.update(0.5)).toBe(true);
    expect(widthOf(layer, MAPPED)).toBeCloseTo(CREEK_WIDTH_M);
    expect(widthOf(layer, M5)).toBeCloseTo(MODELLED_WIDTH_M[5]);
    layer.dispose();
  });

  it("rebuilds only the bands whose width changed", () => {
    // band 3 wants 1.5 px, band 5 wants 2.5 px: at 6 m/px band 3 wants 9 m (over its 6 m base),
    // while band 5 wants 15 m (over its 12 m) and the mapped creek wants 15 m (over its 12 m).
    // At 4.5 m/px band 3 wants 6.75 m (over 6), band 5 and mapped want 11.25 m (under 12): unchanged.
    const layer = new CreeksLayer(creeks, flat, opts);
    const geo = (n: string) => (layer.getObjectByName(n) as THREE.Mesh).geometry;
    const [g0m, g0a, g0b] = [geo(MAPPED), geo(M3), geo(M5)];
    expect(layer.update(4.5)).toBe(true);
    expect(geo(M3)).not.toBe(g0a);
    expect(geo(MAPPED)).toBe(g0m);
    expect(geo(M5)).toBe(g0b);
    layer.dispose();
  });

  it("disposes the geometry it replaces and keeps the materials", () => {
    const layer = new CreeksLayer(creeks, flat, opts);
    const mesh = layer.getObjectByName(MAPPED) as THREE.Mesh;
    const oldGeometry = mesh.geometry;
    const material = mesh.material;
    const geometryDispose = vi.spyOn(oldGeometry, "dispose");
    const materialDispose = vi.spyOn(material as THREE.Material, "dispose");
    layer.update(40);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).not.toHaveBeenCalled();
    expect(mesh.geometry).not.toBe(oldGeometry);
    expect(mesh.material).toBe(material);
    layer.dispose();
  });

  it("keeps the names, render order and the visibility toggles through an update", () => {
    const layer = new CreeksLayer(creeks, flat, opts);
    layer.setMappedEnabled(false);
    layer.setModelledEnabled(true);
    layer.update(40);
    expect(meshNames(layer)).toEqual(["creeks-mapped-ribbons", "creeks-modelled-order-3", "creeks-modelled-order-5"]);
    expect(layer.getObjectByName("creeks-mapped")!.visible).toBe(false);
    expect(layer.getObjectByName("creeks-modelled")!.visible).toBe(true);
    // a group switched off during an update is the right width when it is shown again
    layer.update(2);
    layer.setMappedEnabled(true);
    expect(widthOf(layer, MAPPED)).toBeCloseTo(CREEK_WIDTH_M);
    layer.update(40);
    layer.setMappedEnabled(false);
    layer.update(2);
    layer.setMappedEnabled(true);
    expect(widthOf(layer, MAPPED)).toBeCloseTo(CREEK_WIDTH_M);
    const mesh = layer.getObjectByName(MAPPED) as THREE.Mesh;
    expect(mesh.renderOrder).toBe(1.6);
    layer.dispose();
  });

  it("disposes the current (rebuilt) geometry and the materials with the layer", () => {
    const layer = new CreeksLayer(creeks, flat, opts);
    layer.update(40);
    const mesh = layer.getObjectByName(MAPPED) as THREE.Mesh;
    const geometryDispose = vi.spyOn(mesh.geometry, "dispose");
    const materialDispose = vi.spyOn(mesh.material as THREE.Material, "dispose");
    layer.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it("treats a non-finite value as the close-up widths, and an empty layer updates to false", () => {
    const layer = new CreeksLayer(creeks, flat, opts);
    layer.update(40);
    const w = widthOf(layer, MAPPED);
    expect(layer.update(Number.NaN)).toBe(true); // NaN falls back to the close-up widths
    expect(widthOf(layer, MAPPED)).toBeCloseTo(CREEK_WIDTH_M);
    expect(w).toBeGreaterThan(CREEK_WIDTH_M);
    layer.dispose();
    expect(new CreeksLayer({ version: 1, mapped: [], modelled: [] }, flat, opts).update(40)).toBe(false);
  });
});
