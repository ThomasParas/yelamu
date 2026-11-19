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
import {
  SHADOW_RENDER_ORDER,
  footprintRadius,
  makeShadowGeometry,
  makeShadowMaterial,
  placeShadow,
  shadowDirection,
  shadowMatrix,
} from "./shadows";

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
  /** Soft contact shadows under trees and shrubs (see shadows.ts). Default true. */
  shadows?: boolean;
  /**
   * Newly planted chunks grow in over this many ms (from GROW_FROM of full size) instead of
   * popping in. 0 = no animation. Default DEFAULT_GROW_MS; see setGrowMs (reduced motion).
   */
  growMs?: number;
}

export const DEFAULT_VEGETATION_SEED = 0x59454c41; // "YELA"
export const DEFAULT_MAX_INSTANCES_PER_CHUNK = 1500;
export const DEFAULT_SIZE_BOOST = 1.5;
export const DEFAULT_GROW_MS = 400;
/** Size a newly planted plant starts at, as a share of its full size. */
export const GROW_FROM = 0.3;

/** Grow-in scale at `t` (0..1 of the animation): ease-out cubic from GROW_FROM to 1. */
export function growScale(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return GROW_FROM + (1 - GROW_FROM) * (1 - (1 - u) ** 3);
}

/** Write `full` into `out` with the upper 3x3 of every 4x4 matrix scaled by `g` (positions kept). */
export function scaleInstances(full: Float32Array, out: Float32Array, g: number): void {
  for (let o = 0; o < full.length; o += 16) {
    for (let k = 0; k < 11; k++) out[o + k] = k % 4 === 3 ? full[o + k] : full[o + k] * g;
    for (let k = 11; k < 16; k++) out[o + k] = full[o + k];
  }
}

interface Built {
  meshes: THREE.InstancedMesh[];
  instances: number;
}

/** A chunk's plants growing in: their full-size matrices and when the growth started. */
interface Growing {
  meshes: THREE.InstancedMesh[];
  full: Float32Array[];
  /** Set at the first animate() call, so a slow build frame does not eat the animation. */
  start: number | null;
}

export class VegetationLayer {
  private readonly geometries: VegetationGeometries;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly shadowGeometry: THREE.BufferGeometry;
  private readonly shadowMaterial: THREE.MeshBasicMaterial;
  /** Footprint radius of each species at scale 1 (sizes its shadow). */
  private readonly footprint: Record<Species, number>;
  private readonly shadowDir = shadowDirection();
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
  /** Chunks whose plants are still growing in. */
  private readonly growing = new Map<THREE.Mesh, Growing>();
  private growMs: number;

  private readonly m4 = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scl = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly col = new THREE.Color();

  constructor(private readonly opts: VegetationLayerOptions) {
    this.geometries = makeVegetationGeometries();
    this.material = makeVegetationMaterial();
    this.shadowGeometry = makeShadowGeometry();
    this.shadowMaterial = makeShadowMaterial();
    this.footprint = Object.fromEntries(SPECIES.map((sp) => [sp, footprintRadius(this.geometries[sp])])) as Record<
      Species,
      number
    >;
    this.groupOfClass = groupNameForClass(opts.classes);
    ({ speciesFor: this.speciesFor, specForClass: this.specForClass } = speciesTables(opts.classes));
    this.seed = opts.seed ?? DEFAULT_VEGETATION_SEED;
    this.maxInstances = opts.maxInstancesPerChunk ?? DEFAULT_MAX_INSTANCES_PER_CHUNK;
    this.sizeBoost = opts.sizeBoost ?? DEFAULT_SIZE_BOOST;
    this.maxBuilds = opts.maxBuildsPerRefresh ?? 3;
    this.growMs = opts.growMs ?? DEFAULT_GROW_MS;
  }

  /** Grow-in time for chunks planted from now on (0 = appear at once, e.g. reduced motion). */
  setGrowMs(ms: number): void {
    this.growMs = Math.max(0, ms);
    if (this.growMs === 0) for (const mesh of [...this.growing.keys()]) this.finishGrowing(mesh);
  }

  /**
   * Advance the grow-in of newly planted chunks to time `now` (ms, e.g. performance.now()).
   * Returns true while any chunk is still growing, i.e. the caller should render again.
   */
  animate(now: number): boolean {
    for (const [mesh, g] of this.growing) {
      if (g.start === null) g.start = now;
      const t = this.growMs > 0 ? (now - g.start) / this.growMs : 1;
      if (t >= 1) {
        this.finishGrowing(mesh);
        continue;
      }
      const scale = growScale(t);
      g.meshes.forEach((im, i) => {
        scaleInstances(g.full[i], im.instanceMatrix.array as Float32Array, scale);
        im.instanceMatrix.needsUpdate = true;
      });
    }
    return this.growing.size > 0;
  }

  private finishGrowing(mesh: THREE.Mesh): void {
    const g = this.growing.get(mesh);
    if (!g) return;
    this.growing.delete(mesh);
    g.meshes.forEach((im, i) => {
      (im.instanceMatrix.array as Float32Array).set(g.full[i]);
      im.instanceMatrix.needsUpdate = true;
    });
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
    this.growing.delete(mesh);
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

  /**
   * Swap in new shapes for some species (the Blender tree models, see glb.ts). Old shapes are
   * freed; chunks already planted are cleared and queued, so refresh() replants them with the
   * new shapes (and correctly sized shadows) as they come into view.
   */
  setGeometries(replace: Partial<VegetationGeometries>): void {
    const changed = SPECIES.filter((sp) => replace[sp] && replace[sp] !== this.geometries[sp]);
    if (changed.length === 0) return;
    for (const mesh of [...this.built.keys()]) {
      const plan = this.chunks.get(mesh)!;
      this.detach(mesh);
      this.chunks.set(mesh, plan);
      this.pending.add(mesh);
    }
    for (const sp of changed) {
      this.geometries[sp].dispose();
      this.geometries[sp] = replace[sp]!;
      this.footprint[sp] = footprintRadius(this.geometries[sp]);
    }
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
    this.shadowGeometry.dispose();
    this.shadowMaterial.map?.dispose();
    this.shadowMaterial.dispose();
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
    const shadows = o.shadows === false ? null : this.buildShadows(bySpecies);
    if (shadows) {
      mesh.add(shadows);
      meshes.push(shadows);
    }
    this.built.set(mesh, { meshes, instances: placed });
    if (this.growMs > 0 && meshes.length > 0) {
      const full = meshes.map((im) => (im.instanceMatrix.array as Float32Array).slice());
      meshes.forEach((im, i) => scaleInstances(full[i], im.instanceMatrix.array as Float32Array, GROW_FROM));
      this.growing.set(mesh, { meshes, full, start: null });
    }
  }

  /** One instanced mesh with a shadow under every tree and shrub of the chunk, or null if none. */
  private buildShadows(bySpecies: Map<Species, VegInstance[]>): THREE.InstancedMesh | null {
    const o = this.opts;
    let n = 0;
    for (const items of bySpecies.values()) for (const v of items) if (v.kind !== "reed") n++;
    if (n === 0) return null;
    const im = new THREE.InstancedMesh(this.shadowGeometry, this.shadowMaterial, n);
    im.name = "vegetation-shadows";
    im.renderOrder = SHADOW_RENDER_ORDER;
    im.frustumCulled = false;
    im.matrixAutoUpdate = false;
    let i = 0;
    for (const [sp, items] of bySpecies) {
      for (const v of items) {
        if (v.kind === "reed") continue;
        const radius = this.footprint[sp] * v.scale * this.sizeBoost;
        const p = placeShadow(v, radius, o.heights, o.size, o.exaggeration, this.shadowDir);
        im.setMatrixAt(i++, shadowMatrix(p, this.m4));
      }
    }
    im.visible = this.enabled;
    return im;
  }
}
