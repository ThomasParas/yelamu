import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CreeksLayer } from "./layer";
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
