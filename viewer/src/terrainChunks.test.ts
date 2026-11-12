import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TerrainChunks } from "./terrainChunks";

// 33x33 samples, 10 m cells -> world x/z in [-160, 160]; 4x4 chunks of 8 cells (80 m).
const size = { width: 33, height: 33, cell_m: 10 };
const heights = new Float32Array(33 * 33).map((_, i) => (i % 33) + Math.floor(i / 33));
const material = new THREE.MeshBasicMaterial();

/** Top-down camera centred on (x, z) seeing a square of `view` metres at zoom 1. */
function camera(x: number, z: number, view: number, zoom: number): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(-view / 2, view / 2, view / 2, -view / 2, -1e5, 1e5);
  cam.zoom = zoom;
  cam.up.set(0, 0, -1);
  cam.position.set(x, 1000, z);
  cam.lookAt(x, 0, z);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
}

function make(opts: Partial<ConstructorParameters<typeof TerrainChunks>[5]> = {}) {
  return new TerrainChunks(
    heights,
    size,
    3,
    () => [1, 1, 1],
    material,
    { chunkCells: 8, switchZoom: 2, ...opts },
  );
}

const lodMeshes = (t: TerrainChunks, lod: number) =>
  t.root.children.filter((m) => m.userData.lod === lod) as THREE.Mesh[];
const visible = (t: TerrainChunks, lod: number) => lodMeshes(t, lod).filter((m) => m.visible);

describe("TerrainChunks", () => {
  it("builds a visible LOD1 mesh for every chunk at construction", () => {
    const t = make();
    expect(lodMeshes(t, 1)).toHaveLength(16);
    expect(visible(t, 1)).toHaveLength(16);
    expect(lodMeshes(t, 0)).toHaveLength(0);
    // Stride-4 chunks of 8 cells: 3x3 vertices each, with colours.
    const g = lodMeshes(t, 1)[0].geometry;
    expect(g.getAttribute("position").count).toBe(9);
    expect(g.getAttribute("color")).toBeDefined();
    t.dispose();
  });

  it("shows only LOD1 and builds nothing when zoomed out", () => {
    const t = make();
    const pending = t.update(camera(0, 0, 400, 1));
    expect(pending).toBe(false);
    expect(t.stats()).toMatchObject({ lod: 1, lod0Resident: 0, lod0Visible: 0, lod1Visible: 16 });
    t.dispose();
  });

  it("builds LOD0 only for chunks in view when zoomed in, and hides LOD1", () => {
    const t = make();
    // View 400 m at zoom 4 -> 100 m square around (-100, -100): x,z in [-150, -50].
    // Chunks span 80 m: columns/rows [-160,-80] and [-80,0] -> 2 x 2 chunks.
    const pending = t.update(camera(-100, -100, 400, 4));
    expect(pending).toBe(false);
    expect(t.stats()).toMatchObject({ lod: 0, lod0Resident: 4, lod0Visible: 4, lod1Visible: 0 });
    expect(visible(t, 0)[0].geometry.getAttribute("position").count).toBe(81);
    t.dispose();
  });

  it("can see a single chunk", () => {
    const t = make();
    t.update(camera(-100, -100, 400, 12)); // 33 m square: x,z in [-116, -83]
    expect(t.stats()).toMatchObject({ lod0Resident: 1, lod0Visible: 1 });
    t.dispose();
  });

  it("switches back to LOD1 and hides LOD0 when zooming out", () => {
    const t = make();
    t.update(camera(-100, -100, 400, 12));
    t.update(camera(-100, -100, 400, 1));
    expect(t.stats()).toMatchObject({ lod: 1, lod0Visible: 0, lod1Visible: 16, lod0Resident: 1 });
    t.dispose();
  });

  it("hides cached LOD0 chunks that leave the view but keeps them resident", () => {
    const t = make();
    t.update(camera(-100, -100, 400, 12));
    t.update(camera(100, 100, 400, 12));
    expect(t.stats()).toMatchObject({ lod0Resident: 2, lod0Visible: 1 });
    // Going back reuses the cached mesh: nothing new is built.
    const before = lodMeshes(t, 0);
    t.update(camera(-100, -100, 400, 12));
    expect(lodMeshes(t, 0)).toEqual(before);
    expect(t.stats()).toMatchObject({ lod0Resident: 2, lod0Visible: 1 });
    t.dispose();
  });

  it("caps builds per update and reports pending work", () => {
    const t = make({ maxBuildsPerUpdate: 6 });
    const cam = camera(0, 0, 800, 2); // sees the whole 320 m grid
    expect(t.update(cam)).toBe(true);
    expect(t.stats().lod0Resident).toBe(6);
    expect(t.update(cam)).toBe(true);
    expect(t.stats().lod0Resident).toBe(12);
    expect(t.update(cam)).toBe(false);
    expect(t.stats()).toMatchObject({ lod0Resident: 16, lod0Visible: 16 });
    t.dispose();
  });

  it("builds the chunks nearest the view centre first", () => {
    const t = make({ maxBuildsPerUpdate: 4 });
    t.update(camera(0, 0, 800, 2));
    // The four chunks touching the origin come first.
    const bounds = visible(t, 0).map((m) => {
      m.geometry.computeBoundingBox();
      return m.geometry.boundingBox!;
    });
    expect(bounds).toHaveLength(4);
    for (const b of bounds) {
      expect(b.min.x).toBeGreaterThanOrEqual(-80);
      expect(b.max.x).toBeLessThanOrEqual(80);
      expect(b.min.z).toBeGreaterThanOrEqual(-80);
      expect(b.max.z).toBeLessThanOrEqual(80);
    }
    t.dispose();
  });

  it("evicts least recently used LOD0 chunks and disposes their geometry", () => {
    const t = make({ lruCapacity: 2 });
    t.update(camera(-100, -100, 400, 12));
    const first = lodMeshes(t, 0)[0];
    let disposed = 0;
    first.geometry.addEventListener("dispose", () => disposed++);

    t.update(camera(100, -100, 400, 12));
    expect(t.stats().lod0Resident).toBe(2);
    expect(disposed).toBe(0);
    t.update(camera(100, 100, 400, 12)); // third chunk: evicts the first
    expect(t.stats().lod0Resident).toBe(2);
    expect(disposed).toBe(1);
    expect(t.root.children.includes(first)).toBe(false);
    expect(lodMeshes(t, 0)).toHaveLength(2);
    t.dispose();
  });

  it("does not thrash when more chunks are in view than the LRU capacity", () => {
    const t = make({ lruCapacity: 2, maxBuildsPerUpdate: 100 });
    const cam = camera(0, 0, 800, 2);
    expect(t.update(cam)).toBe(false);
    expect(t.stats()).toMatchObject({ lod0Resident: 16, lod0Visible: 16 });
    t.dispose();
  });

  it("follows setSwitchZoom on the next update (both directions)", () => {
    const t = make({ switchZoom: 2 });
    const cam = camera(-100, -100, 400, 3);
    t.update(cam);
    expect(t.stats().lod).toBe(0);
    t.setSwitchZoom(4); // e.g. the window got wider: more chunks fit, switch later
    t.update(cam);
    expect(t.stats()).toMatchObject({ lod: 1, lod0Visible: 0, lod1Visible: 16 });
    t.setSwitchZoom(1.5);
    t.update(cam);
    expect(t.stats().lod).toBe(0);
    expect(t.stats().lod0Visible).toBeGreaterThan(0);
    t.dispose();
  });

  it("keeps LOD1 visible under in-view chunks whose LOD0 is not built yet (no holes)", () => {
    const t = make({ maxBuildsPerUpdate: 1 });
    // View 200 m at zoom 2 -> 100 m square around the origin: 2 x 2 chunks in view.
    const cam = camera(0, 0, 200, 2);
    const inViewLod1 = () => visible(t, 1).length;
    expect(t.update(cam)).toBe(true);
    expect(visible(t, 0)).toHaveLength(1);
    expect(inViewLod1()).toBe(3); // the other three in-view chunks still show LOD1
    // The visible LOD1 chunks are exactly the in-view chunks without a visible LOD0.
    const covered = (m: THREE.Mesh) => {
      m.geometry.computeBoundingBox();
      return m.geometry.boundingBox!;
    };
    const lod0Box = covered(visible(t, 0)[0]);
    for (const m of visible(t, 1)) {
      const b = covered(m);
      expect(b.min.x === lod0Box.min.x && b.min.z === lod0Box.min.z).toBe(false);
    }
    expect(t.update(cam)).toBe(true);
    expect(visible(t, 0)).toHaveLength(2);
    expect(inViewLod1()).toBe(2);
    expect(t.update(cam)).toBe(true);
    expect(t.update(cam)).toBe(false);
    expect(visible(t, 0)).toHaveLength(4);
    expect(inViewLod1()).toBe(0); // out-of-view chunks have neither
    expect(visible(t, 0).length + inViewLod1()).toBe(4);
    t.dispose();
  });

  it("drops LOD1 under a chunk that leaves the view while LOD0 is pending", () => {
    const t = make({ maxBuildsPerUpdate: 1 });
    t.update(camera(0, 0, 200, 2));
    t.update(camera(-120, -120, 100, 2)); // 50 m square inside one corner chunk
    expect(visible(t, 0).length + visible(t, 1).length).toBe(1);
    t.dispose();
  });

  it("returns LOD0 memory to the base capacity once back at LOD1", () => {
    const t = make({ lruCapacity: 2, maxBuildsPerUpdate: 100 });
    t.update(camera(0, 0, 800, 2)); // all 16 in view: capacity grows, 16 resident
    expect(t.stats().lod0Resident).toBe(16);
    t.update(camera(0, 0, 800, 1)); // zoomed out -> LOD1
    expect(t.stats()).toMatchObject({ lod: 1, lod0Resident: 2, lod0Visible: 0 });
    expect(lodMeshes(t, 0)).toHaveLength(2);
    t.dispose();
  });

  it("dispose removes everything and disposes geometries", () => {
    const t = make();
    t.update(camera(-100, -100, 400, 12));
    const geos = t.root.children.map((m) => (m as THREE.Mesh).geometry);
    let n = 0;
    for (const g of geos) g.addEventListener("dispose", () => n++);
    t.dispose();
    expect(t.root.children).toHaveLength(0);
    expect(n).toBe(geos.length);
  });

  it("works without colorAt", () => {
    const t = new TerrainChunks(heights, size, 1, undefined, material, { chunkCells: 8, switchZoom: 2 });
    expect(lodMeshes(t, 1)[0].geometry.getAttribute("color")).toBeUndefined();
    t.dispose();
  });
});
