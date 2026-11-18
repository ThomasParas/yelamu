/**
 * Vegetation drawn as instanced meshes parented to the full-resolution terrain chunks, so
 * a plant is shown, hidden and freed together with the chunk under it. All placement
 * maths lives in placement.ts; this class only turns instances into three.js objects.
 *
 * Wire it with TerrainChunks hooks: onLod0Built -> attach, onLod0Evicted -> detach, and
 * call refresh(terrain.visibleLod0Meshes()) after each frame so chunks that were built
 * while the layer was off get their plants once it is switched on.
 */
import * as THREE from "three";
import type { ChunkPlan } from "../chunks";
import type { HabitatClass } from "../habitat";
import type { GridSize } from "../terrainMesh";
import { mulberry32 } from "../randomLand";
import {
  makeVegetationGeometries,
  makeVegetationMaterial,
  tintFor,
  type VegetationGeometries,
} from "./geometry";
import { chunkSeed, groupNameForClass, placeChunkVegetation, type VegInstance, type VegSpec } from "./placement";
import { SPECIES, speciesTables, type Species } from "./species";

export interface VegetationLayerOptions {
  size: GridSize;
  /** Whole-grid heights in metres. */
  heights: Float32Array;
  /** Whole-grid habitat class ids. */
  habitat: Uint8Array;
  classes: HabitatClass[];
  waterLevelM: number;
  /** Terrain vertical exaggeration: plant bases are lifted by this factor. */
  exaggeration: number;
  seed?: number;
  /** Cap per chunk (all kinds together). Default 1500. */
  maxInstancesPerChunk?: number;
  /**
   * Multiplier on every plant's size. The terrain is 10 m resolution and vertically
   * exaggerated, so true-size plants would be specks; this is the "illustrative" fudge.
   * Default 1.5.
   */
  sizeBoost?: number;
  /** Chunks built per refresh() call (keeps a frame short). Default 3. */
  maxBuildsPerRefresh?: number;
}

export const DEFAULT_VEGETATION_SEED = 0x59454c41; // "YELA"
export const DEFAULT_MAX_INSTANCES_PER_CHUNK = 1500;
export const DEFAULT_SIZE_BOOST = 1.5;

interface Built {
  meshes: THREE.InstancedMesh[];
  instances: number;
}

export class VegetationLayer {
  private readonly geometries: VegetationGeometries;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly groupOfClass: (id: number) => string;
  private readonly speciesFor: (classId: number, u: number) => Species | null;
  private readonly specForClass: (classId: number) => VegSpec | undefined;
  private readonly seed: number;
  private readonly maxInstances: number;
  private readonly sizeBoost: number;
  private readonly maxBuilds: number;
  private enabled = true;
  /** Every attached chunk mesh with its plan. */
  private readonly chunks = new Map<THREE.Mesh, ChunkPlan>();
  /** Vegetation currently built per chunk mesh. */
  private readonly built = new Map<THREE.Mesh, Built>();
  /** Attached chunks that have no vegetation yet (attached while disabled). */
  private readonly pending = new Set<THREE.Mesh>();

  private readonly m4 = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scl = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly col = new THREE.Color();

  constructor(private readonly opts: VegetationLayerOptions) {
    this.geometries = makeVegetationGeometries();
    this.material = makeVegetationMaterial();
    this.groupOfClass = groupNameForClass(opts.classes);
    ({ speciesFor: this.speciesFor, specForClass: this.specForClass } = speciesTables(opts.classes));
    this.seed = opts.seed ?? DEFAULT_VEGETATION_SEED;
    this.maxInstances = opts.maxInstancesPerChunk ?? DEFAULT_MAX_INSTANCES_PER_CHUNK;
    this.sizeBoost = opts.sizeBoost ?? DEFAULT_SIZE_BOOST;
    this.maxBuilds = opts.maxBuildsPerRefresh ?? 3;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** A full-resolution chunk mesh now exists: remember it and, if enabled, plant it. */
  attach(mesh: THREE.Mesh, plan: ChunkPlan): void {
    this.detach(mesh); // never double up
    this.chunks.set(mesh, plan);
    if (this.enabled) this.build(mesh, plan);
    else this.pending.add(mesh);
  }

  /** The chunk mesh is about to be freed: dispose its instance buffers (shared assets stay). */
  detach(mesh: THREE.Mesh): void {
    this.chunks.delete(mesh);
    this.pending.delete(mesh);
    const b = this.built.get(mesh);
    if (!b) return;
    this.built.delete(mesh);
    for (const im of b.meshes) {
      mesh.remove(im);
      im.dispose();
    }
  }

  /** Show or hide all vegetation; future attaches follow the setting. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    for (const b of this.built.values()) for (const im of b.meshes) im.visible = on;
  }

  /**
   * Plant chunks that were attached while the layer was off, for the given (visible)
   * meshes, at most `maxBuildsPerRefresh` per call. Returns true when the scene changed
   * or more of the given meshes still wait, i.e. the caller should render again (the next
   * call then returns false once everything is planted). O(1) when nothing is pending.
   */
  refresh(visibleMeshes: Iterable<THREE.Mesh>): boolean {
    if (!this.enabled || this.pending.size === 0) return false;
    let built = 0;
    for (const mesh of visibleMeshes) {
      if (!this.pending.has(mesh)) continue;
      if (built >= this.maxBuilds) return true;
      this.pending.delete(mesh);
      const plan = this.chunks.get(mesh);
      if (plan) this.build(mesh, plan);
      built++;
    }
    return built > 0;
  }

  stats(): { instances: number; meshes: number } {
    let instances = 0;
    let meshes = 0;
    for (const b of this.built.values()) {
      instances += b.instances;
      meshes += b.meshes.length;
    }
    return { instances, meshes };
  }

  /** Free everything, including the shared geometry and material. */
  dispose(): void {
    for (const mesh of [...this.chunks.keys()]) this.detach(mesh);
    for (const g of Object.values(this.geometries)) g.dispose();
    this.material.dispose();
  }

  private build(mesh: THREE.Mesh, plan: ChunkPlan): void {
    const o = this.opts;
    const list = placeChunkVegetation({
      chunk: plan,
      size: o.size,
      heights: o.heights,
      habitat: o.habitat,
      groupOfClass: this.groupOfClass,
      waterLevelM: o.waterLevelM,
      seed: this.seed,
      maxInstances: this.maxInstances,
      specForClass: this.specForClass,
    });
    const tintRng = mulberry32(chunkSeed(this.seed, plan.cx, plan.cy) ^ 0x7f4a7c15);
    // A separate stream for the species draw, so tints do not shift when a mix changes.
    const speciesRng = mulberry32(chunkSeed(this.seed, plan.cx, plan.cy) ^ 0x2545f491);
    const bySpecies = new Map<Species, VegInstance[]>();
    let placed = 0;
    for (const v of list) {
      const sp = this.speciesFor(v.classId, speciesRng());
      if (!sp) continue;
      let items = bySpecies.get(sp);
      if (!items) bySpecies.set(sp, (items = []));
      items.push(v);
      placed++;
    }

    const meshes: THREE.InstancedMesh[] = [];
    for (const sp of SPECIES) {
      const items = bySpecies.get(sp);
      if (!items) continue;
      const im = new THREE.InstancedMesh(this.geometries[sp], this.material, items.length);
      im.name = `vegetation-${sp}`;
      // The parent chunk is already culled by its own bounds and hidden when out of view.
      im.frustumCulled = false;
      // Positions are world coordinates and chunks sit at the origin: nothing to update.
      im.matrixAutoUpdate = false;
      for (let i = 0; i < items.length; i++) {
        const v = items[i];
        const s = v.scale * this.sizeBoost;
        this.pos.set(v.x, v.y * o.exaggeration, v.z);
        this.quat.setFromAxisAngle(this.up, v.rotation);
        this.scl.set(s, s, s);
        im.setMatrixAt(i, this.m4.compose(this.pos, this.quat, this.scl));
        const [r, g, b] = tintFor(v.group, tintRng);
        im.setColorAt(i, this.col.setRGB(r, g, b));
      }
      im.visible = this.enabled;
      mesh.add(im);
      meshes.push(im);
    }
    this.built.set(mesh, { meshes, instances: placed });
  }
}
