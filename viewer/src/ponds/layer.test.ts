import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { POND_RENDER_ORDER, PondsLayer } from "./layer";
import type { Pond, Ponds } from "./types";

const square = (x0: number, z0: number, x1: number, z1: number) => [x0, z0, x1, z0, x1, z1, x0, z1];
const pond = (id: string, rings: number[][], level_m = 5): Pond => ({
  id,
  name: null,
  level_m,
  source: "test",
  confidence: "illustrative",
  rings,
});
const ponds = (...list: Pond[]): Ponds => ({ version: 1, ponds: list });
const material = () => new THREE.MeshStandardMaterial({ transparent: true });
const meshes = (layer: PondsLayer) => layer.object.children as THREE.Mesh[];

describe("PondsLayer", () => {
  it("creates one mesh per valid pond, sharing the given material", () => {
    const m = material();
    const layer = new PondsLayer(
      ponds(pond("a", [square(0, 0, 10, 10)]), pond("b", [square(100, 100, 200, 200), square(120, 120, 140, 140)])),
      m,
      3,
    );
    expect(meshes(layer)).toHaveLength(2);
    expect(meshes(layer).map((x) => x.userData.pondId)).toEqual(["a", "b"]);
    expect(meshes(layer).map((x) => x.name)).toEqual(["pond-a", "pond-b"]);
    for (const x of meshes(layer)) {
      expect(x.material).toBe(m);
      expect(x.renderOrder).toBe(POND_RENDER_ORDER);
      expect(x.frustumCulled).toBe(true);
      expect(x.position.toArray()).toEqual([0, 0, 0]);
    }
    expect(POND_RENDER_ORDER).toBeGreaterThan(0);
    expect(layer.stats().ponds).toBe(2);
    expect(layer.skipped()).toEqual([]);
  });

  it("counts triangles: 2 for a square, more with a hole", () => {
    const one = new PondsLayer(ponds(pond("a", [square(0, 0, 10, 10)])), material(), 3);
    expect(one.stats()).toEqual({ ponds: 1, triangles: 2 });
    const holed = new PondsLayer(ponds(pond("a", [square(0, 0, 100, 100), square(40, 40, 60, 60)])), material(), 3);
    expect(holed.stats().triangles).toBeGreaterThan(2);
    const both = new PondsLayer(
      ponds(pond("a", [square(0, 0, 10, 10)]), pond("b", [square(0, 0, 100, 100), square(40, 40, 60, 60)])),
      material(),
      3,
    );
    expect(both.stats().triangles).toBe(2 + holed.stats().triangles);
  });

  it("puts the surface at the level times the exaggeration plus the lift", () => {
    const layer = new PondsLayer(ponds(pond("a", [square(0, 0, 10, 10)], 7)), material(), 3);
    const pos = meshes(layer)[0].geometry.getAttribute("position");
    expect(pos.getY(0)).toBeCloseTo((7 + 0.05) * 3, 4);
  });

  it("skips ponds whose outline has no area, reports them, and keeps the rest", () => {
    const msgs: string[] = [];
    const layer = new PondsLayer(
      ponds(pond("flat", [[0, 0, 5, 5, 10, 10]]), pond("ok", [square(0, 0, 10, 10)])),
      material(),
      3,
      (m) => msgs.push(m),
    );
    expect(meshes(layer).map((x) => x.userData.pondId)).toEqual(["ok"]);
    expect(layer.skipped()).toEqual(["flat"]);
    expect(layer.stats().ponds).toBe(1);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("flat");
  });

  it("copes with an empty list", () => {
    const layer = new PondsLayer(ponds(), material(), 3);
    expect(layer.stats()).toEqual({ ponds: 0, triangles: 0 });
    layer.dispose();
  });

  it("toggles visibility on the group", () => {
    const layer = new PondsLayer(ponds(pond("a", [square(0, 0, 10, 10)])), material(), 3);
    expect(layer.object.visible).toBe(true);
    layer.setVisible(false);
    expect(layer.object.visible).toBe(false);
    layer.setVisible(true);
    expect(layer.object.visible).toBe(true);
  });

  it("disposes the geometries but not the shared material", () => {
    const m = material();
    let materialDisposed = false;
    m.addEventListener("dispose", () => (materialDisposed = true));
    const layer = new PondsLayer(ponds(pond("a", [square(0, 0, 10, 10)]), pond("b", [square(20, 20, 30, 30)])), m, 3);
    const geos = meshes(layer).map((x) => x.geometry);
    let disposed = 0;
    for (const g of geos) g.addEventListener("dispose", () => disposed++);
    layer.dispose();
    expect(disposed).toBe(2);
    expect(materialDisposed).toBe(false);
    expect(layer.object.children).toHaveLength(0);
    expect(layer.stats()).toEqual({ ponds: 0, triangles: 0 });
  });

  it("can be added to a scene and found by pond id", () => {
    const scene = new THREE.Scene();
    const layer = new PondsLayer(ponds(pond("a", [square(0, 0, 10, 10)])), material(), 3);
    scene.add(layer.object);
    expect(scene.getObjectByName("pond-a")?.userData.pondId).toBe("a");
  });
});
