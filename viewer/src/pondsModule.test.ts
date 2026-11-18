import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { mountPonds, pondMaterial } from "./pondsModule";
import type { Ponds } from "./ponds/types";
import { WATER_COLOR, WATER_OPACITY, createWaterMaterial } from "./water/waterMaterial";

const square = (x0: number, z0: number, x1: number, z1: number) => [x0, z0, x1, z0, x1, z1, x0, z1];
const ponds = (...rings: number[][][]): Ponds => ({
  version: 1,
  ponds: rings.map((r, i) => ({ id: `p${i}`, name: null, level_m: 4, source: "t", confidence: "illustrative", rings: r })),
});

describe("pondMaterial", () => {
  it("uses the sea's pond material (same look and motion, no shore effects) when there is one", () => {
    const water = createWaterMaterial();
    expect(pondMaterial({ water })).toBe(water.pondMaterial);
  });

  it("falls back to a plain translucent water-coloured material", () => {
    const m = pondMaterial({}) as THREE.MeshStandardMaterial;
    expect(m).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(m.transparent).toBe(true);
    expect(m.opacity).toBe(WATER_OPACITY);
    expect(m.color.getHex()).toBe(WATER_COLOR);
  });
});

describe("mountPonds", () => {
  it("adds the layer to the scene with the sea material, applies the exaggeration, and asks for a render", () => {
    const scene = new THREE.Scene();
    const water = createWaterMaterial();
    let renders = 0;
    const layer = mountPonds(
      { scene, water, verticalExaggeration: 3, requestRender: () => void renders++ },
      ponds([square(0, 0, 10, 10)], [square(50, 50, 80, 80)]),
    );
    expect(scene.children).toContain(layer.object);
    expect(renders).toBe(1);
    const meshes = layer.object.children as THREE.Mesh[];
    expect(meshes).toHaveLength(2);
    for (const m of meshes) expect(m.material).toBe(water.pondMaterial);
    expect(meshes[0].geometry.getAttribute("position").getY(0)).toBeCloseTo((4 + 0.05) * 3, 4);
  });

  it("reports ponds that could not be drawn and still mounts the others", () => {
    const scene = new THREE.Scene();
    const msgs: string[] = [];
    const layer = mountPonds(
      { scene, verticalExaggeration: 3, requestRender: () => {} },
      ponds([[0, 0, 1, 1, 2, 2]], [square(0, 0, 10, 10)]),
      (m) => msgs.push(m),
    );
    expect(layer.stats().ponds).toBe(1);
    expect(msgs).toHaveLength(1);
  });
});
