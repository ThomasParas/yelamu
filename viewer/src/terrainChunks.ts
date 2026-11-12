import * as THREE from "three";
import {
  chunkKey,
  chunkWorldBounds,
  lodForZoom,
  planChunks,
  strideFor,
  type ChunkPlan,
  type Lod,
} from "./chunks";
import { LruCache } from "./lru";
import { buildChunkGeometry, type GridSize } from "./terrainMesh";

export interface TerrainChunksOptions {
  /** Cells per chunk edge. Default 128. */
  chunkCells?: number;
  /** Camera zoom at or above which full-resolution chunks are used. */
  switchZoom: number;
  /** Max resident full-resolution chunks (grows if more are in view). Default 96. */
  lruCapacity?: number;
  /** Max full-resolution chunks built by one update() call. Default 6. */
  maxBuildsPerUpdate?: number;
  /** Observers of the full-resolution chunk lifecycle (e.g. a vegetation layer). */
  hooks?: TerrainChunkHooks;
}

/**
 * Called for LOD0 (full resolution) chunk meshes only. `onLod0Built` runs right after the
 * mesh has been created and added to `root`; `onLod0Evicted` runs when the LRU drops it
 * (or on dispose), BEFORE its geometry is disposed and the mesh is removed from `root`,
 * so a hook can detach children it added. A throwing hook is logged and ignored.
 */
export interface TerrainChunkHooks {
  onLod0Built(plan: ChunkPlan, mesh: THREE.Mesh): void;
  onLod0Evicted(plan: ChunkPlan, mesh: THREE.Mesh): void;
}

export type ColorAt = (cellIndex: number, heightM: number) => [number, number, number];

interface Entry {
  plan: ChunkPlan;
  bounds: THREE.Box3;
  lod1: THREE.Mesh;
}

/**
 * Chunked terrain with two global levels of detail. All chunks share one LOD at a time
 * (picked from camera zoom), so LOD boundaries never meet: LOD1 (stride 4) covers every
 * chunk and is built up front; LOD0 (stride 1) is built lazily for chunks in view and
 * kept in an LRU cache. The decisions live in chunks.ts; this class only wires them to
 * three.js objects. The material is shared and owned by the caller.
 */
export class TerrainChunks {
  readonly root = new THREE.Group();

  private readonly entries: Entry[];
  private readonly lod0: LruCache<string, THREE.Mesh>;
  private readonly visibleLod0 = new Set<THREE.Mesh>();
  private readonly baseCapacity: number;
  private readonly maxBuilds: number;
  private readonly hooks: TerrainChunkHooks | undefined;
  private switchZoom: number;
  private currentLod: Lod = 1;

  private readonly frustum = new THREE.Frustum();
  private readonly projScreen = new THREE.Matrix4();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();

  constructor(
    private readonly heights: Float32Array,
    private readonly size: GridSize,
    private readonly exaggeration: number,
    private readonly colorAt: ColorAt | undefined,
    private readonly material: THREE.Material,
    options: TerrainChunksOptions,
  ) {
    const chunkCells = options.chunkCells ?? 128;
    this.switchZoom = options.switchZoom;
    this.baseCapacity = options.lruCapacity ?? 96;
    this.maxBuilds = options.maxBuildsPerUpdate ?? 6;
    this.hooks = options.hooks;
    this.lod0 = new LruCache<string, THREE.Mesh>(this.baseCapacity, (_key, mesh) => {
      this.runHook("onLod0Evicted", mesh);
      this.visibleLod0.delete(mesh);
      this.root.remove(mesh);
      mesh.geometry.dispose();
    });

    const plan = planChunks(size.width, size.height, chunkCells);
    this.entries = plan.map((chunk) => {
      const [minH, maxH] = this.heightRange(chunk);
      const ys = [minH * exaggeration, maxH * exaggeration];
      const b = chunkWorldBounds(chunk, size, Math.min(...ys), Math.max(...ys));
      const lod1 = this.makeMesh(chunk, 1);
      this.root.add(lod1);
      return { plan: chunk, bounds: new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max)), lod1 };
    });
  }

  /** Replace the zoom at which full-resolution chunks take over; used by the next update(). */
  setSwitchZoom(zoom: number): void {
    this.switchZoom = zoom;
  }

  /**
   * Pick the LOD for the camera and make the right meshes visible. Returns true when
   * full-resolution chunks in view are still waiting to be built (call again next frame).
   */
  update(camera: THREE.OrthographicCamera): boolean {
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const lod = lodForZoom(camera.zoom, this.switchZoom);
    this.currentLod = lod;

    if (lod === 1) {
      for (const e of this.entries) e.lod1.visible = true;
      this.hideAllLod0();
      // Zoomed out again: give back the memory the full-resolution working set grew into.
      this.lod0.capacity = this.baseCapacity;
      this.lod0.trim();
      return false;
    }

    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    const inView = this.entries.filter((e) => this.frustum.intersectsBox(e.bounds));

    // Never let the cache be smaller than the working set, or it would thrash.
    this.lod0.capacity = Math.max(this.baseCapacity, inView.length);

    // Pass 1: reuse cached meshes (this also refreshes their recency, so the builds in
    // pass 2 can only evict chunks that are not in view).
    const nowVisible = new Set<THREE.Mesh>();
    const covered = new Set<Entry>(); // in-view chunks whose LOD0 mesh is shown
    const missing: Entry[] = [];
    for (const e of inView) {
      const mesh = this.lod0.get(chunkKey(e.plan, 0));
      if (mesh) {
        nowVisible.add(mesh);
        covered.add(e);
      } else missing.push(e);
    }

    // Pass 2: build the missing chunks nearest the view centre first, up to the cap.
    this.viewCentre(camera, this.tmpPos);
    const centre = this.tmpPos;
    const dist = (e: Entry) => {
      const c = e.bounds.getCenter(this.tmpDir);
      return (c.x - centre.x) ** 2 + (c.z - centre.z) ** 2;
    };
    const order = missing.map((e) => ({ e, d: dist(e) })).sort((a, b) => a.d - b.d);
    let built = 0;
    for (const { e } of order) {
      if (built >= this.maxBuilds) break;
      const mesh = this.makeMesh(e.plan, 0);
      this.root.add(mesh);
      this.lod0.set(chunkKey(e.plan, 0), mesh);
      this.runHook("onLod0Built", mesh);
      nowVisible.add(mesh);
      covered.add(e);
      built++;
    }

    // A chunk keeps its LOD1 mesh until its LOD0 mesh is shown, so builds that are still
    // pending never leave a hole. Chunks outside the view show neither.
    const inViewSet = new Set(inView);
    for (const e of this.entries) e.lod1.visible = inViewSet.has(e) && !covered.has(e);

    for (const m of this.visibleLod0) if (!nowVisible.has(m)) m.visible = false;
    for (const m of nowVisible) m.visible = true;
    this.visibleLod0.clear();
    for (const m of nowVisible) this.visibleLod0.add(m);

    return missing.length > built;
  }

  /** The full-resolution meshes currently shown (read-only view; do not keep it across updates). */
  visibleLod0Meshes(): ReadonlySet<THREE.Mesh> {
    return this.visibleLod0;
  }

  stats(): { lod: Lod; lod0Resident: number; lod0Visible: number; lod1Visible: number } {
    return {
      lod: this.currentLod,
      lod0Resident: this.lod0.size,
      lod0Visible: this.visibleLod0.size,
      lod1Visible: this.entries.filter((e) => e.lod1.visible).length,
    };
  }

  /** Free all geometry. The shared material is left alone. */
  dispose(): void {
    this.lod0.clear();
    this.visibleLod0.clear();
    for (const e of this.entries) {
      this.root.remove(e.lod1);
      e.lod1.geometry.dispose();
    }
    this.root.clear();
  }

  private makeMesh(chunk: ChunkPlan, lod: Lod): THREE.Mesh {
    const geometry = buildChunkGeometry(
      this.heights,
      this.size,
      chunk,
      strideFor(lod),
      this.exaggeration,
      this.colorAt,
    );
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.userData.lod = lod;
    mesh.userData.plan = chunk;
    mesh.matrixAutoUpdate = false; // chunks sit at the origin and never move
    return mesh;
  }

  private runHook(name: keyof TerrainChunkHooks, mesh: THREE.Mesh): void {
    if (!this.hooks) return;
    try {
      this.hooks[name](mesh.userData.plan as ChunkPlan, mesh);
    } catch (err) {
      console.error(`terrain chunk hook ${name} failed`, err);
    }
  }

  private heightRange(c: ChunkPlan): [number, number] {
    const { width } = this.size;
    let lo = Infinity;
    let hi = -Infinity;
    for (let y = c.y0; y <= c.y0 + c.h; y++) {
      const row = y * width;
      for (let x = c.x0; x <= c.x0 + c.w; x++) {
        const h = this.heights[row + x];
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    return [lo, hi];
  }

  private hideAllLod0(): void {
    for (const m of this.visibleLod0) m.visible = false;
    this.visibleLod0.clear();
  }

  /** Where the view axis meets the ground plane (y = 0); falls back to the camera position. */
  private viewCentre(camera: THREE.OrthographicCamera, out: THREE.Vector3): THREE.Vector3 {
    camera.getWorldPosition(out);
    camera.getWorldDirection(this.tmpDir);
    if (this.tmpDir.y < -1e-6) out.addScaledVector(this.tmpDir, -out.y / this.tmpDir.y);
    return out;
  }
}
