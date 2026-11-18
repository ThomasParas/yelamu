import * as THREE from "three";
import type { HeightAt } from "./drape";
import type { Village } from "./types";
import {
  VILLAGE_FILL,
  VILLAGE_FILL_OPACITY,
  VILLAGE_FILL_SELECTED_OPACITY,
  VILLAGE_OUTLINE,
  VILLAGE_OUTLINE_OPACITY,
  VILLAGE_OUTLINE_SELECTED,
  VILLAGE_OUTLINE_SELECTED_OPACITY,
} from "./villageColors";

/** Metres a disc floats above max(ground, water): covers the coarse terrain LOD (streets use 4). */
export const VILLAGE_LIFT_M = 5;
/** The outline floats this much higher than the fill, so the fill never covers it. */
const RING_EXTRA_LIFT_M = 1;
/** Segments around the circle, and concentric rows of the fill (a flat fan would cut through hills). */
export const VILLAGE_SEGMENTS = 64;
export const VILLAGE_RINGS = 8;
/** Horizontal width of the outline, metres. */
export const VILLAGE_RING_WIDTH_M = 16;

export interface DiscGeometryOptions {
  /** Centre, world metres (viewer frame). */
  cx: number;
  cz: number;
  radiusM: number;
  /** Ground height in metres, NOT exaggerated. */
  heightAt: HeightAt;
  waterLevelM: number;
  /** Around the circle (at least 3). */
  segments: number;
  /** Concentric rows in the fill (at least 1). */
  rings: number;
  ringWidthM: number;
  /** Metres above max(ground, water), before the exaggeration. */
  liftM: number;
  exaggeration: number;
}

export interface MeshData {
  /** Flat [x, y, z, ...], y already exaggerated. */
  positions: Float32Array;
  indices: Uint32Array;
}

export interface DiscGeometry {
  /** A centre vertex plus `rings` rows of `segments` vertices, triangulated. */
  fill: MeshData;
  /** A strip of `segments` quads: inner edge at radius - width, outer edge at radius. */
  ring: MeshData;
}

/**
 * Pure geometry for one village disc, draped over the terrain: every vertex sits at
 * (max(ground, water) + lift) * exaggeration, so it is above ground and above the sea.
 * Deterministic. Triangles are counter-clockwise seen from above (+y), which is how the
 * camera looks at them. The outline keeps a constant horizontal width and floats a little
 * above the fill.
 */
export function buildDiscGeometry(o: DiscGeometryOptions): DiscGeometry {
  if (!(o.radiusM > 0) || !Number.isFinite(o.radiusM)) throw new RangeError(`radiusM must be > 0, got ${o.radiusM}`);
  const n = Math.max(3, Math.floor(o.segments) || 3);
  const rows = Math.max(1, Math.floor(o.rings) || 1);
  const width = Math.min(Math.max(o.ringWidthM, 0) || 0, o.radiusM / 2) || o.radiusM / 20;

  const y = (x: number, z: number, extraLiftM: number) =>
    (Math.max(o.heightAt(x, z), o.waterLevelM) + o.liftM + extraLiftM) * o.exaggeration;
  const cos = new Float64Array(n);
  const sin = new Float64Array(n);
  for (let s = 0; s < n; s++) {
    cos[s] = Math.cos((2 * Math.PI * s) / n);
    sin[s] = Math.sin((2 * Math.PI * s) / n);
  }

  // --- fill: centre, then `rows` rings of n vertices ---
  const fillPos = new Float32Array((1 + rows * n) * 3);
  fillPos.set([o.cx, y(o.cx, o.cz, 0), o.cz], 0);
  for (let k = 1; k <= rows; k++) {
    const r = (o.radiusM * k) / rows;
    for (let s = 0; s < n; s++) {
      const x = o.cx + r * cos[s];
      const z = o.cz + r * sin[s];
      fillPos.set([x, y(x, z, 0), z], 3 * (1 + (k - 1) * n + s));
    }
  }
  const ringIndex = (k: number, s: number) => 1 + (k - 1) * n + (s % n);
  const fillIdx = new Uint32Array((n + (rows - 1) * n * 2) * 3);
  let w = 0;
  for (let s = 0; s < n; s++) {
    fillIdx[w++] = 0;
    fillIdx[w++] = ringIndex(1, s + 1);
    fillIdx[w++] = ringIndex(1, s);
  }
  for (let k = 1; k < rows; k++) {
    for (let s = 0; s < n; s++) {
      const i0 = ringIndex(k, s);
      const i1 = ringIndex(k, s + 1);
      const o0 = ringIndex(k + 1, s);
      const o1 = ringIndex(k + 1, s + 1);
      fillIdx[w++] = i0;
      fillIdx[w++] = i1;
      fillIdx[w++] = o0;
      fillIdx[w++] = i1;
      fillIdx[w++] = o1;
      fillIdx[w++] = o0;
    }
  }

  // --- outline: n quads, vertex 2s on the inner edge and 2s + 1 on the outer edge ---
  const ringPos = new Float32Array(n * 2 * 3);
  for (let s = 0; s < n; s++) {
    for (const [slot, r] of [[0, o.radiusM - width], [1, o.radiusM]] as const) {
      const x = o.cx + r * cos[s];
      const z = o.cz + r * sin[s];
      ringPos.set([x, y(x, z, RING_EXTRA_LIFT_M), z], 3 * (2 * s + slot));
    }
  }
  const ringIdx = new Uint32Array(n * 2 * 3);
  w = 0;
  for (let s = 0; s < n; s++) {
    const a = 2 * s;
    const b = a + 1;
    const c = 2 * ((s + 1) % n);
    const d = c + 1;
    ringIdx[w++] = a;
    ringIdx[w++] = c;
    ringIdx[w++] = b;
    ringIdx[w++] = c;
    ringIdx[w++] = d;
    ringIdx[w++] = b;
  }

  return { fill: { positions: fillPos, indices: fillIdx }, ring: { positions: ringPos, indices: ringIdx } };
}

export interface VillageDiscsOptions {
  waterLevelM: number;
  exaggeration: number;
  liftM?: number;
  segments?: number;
  rings?: number;
  ringWidthM?: number;
}

function toGeometry(data: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  g.setIndex(new THREE.BufferAttribute(data.indices, 1));
  g.computeBoundingSphere();
  return g;
}

function material(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    opacity,
    transparent: true,
    depthWrite: false,
    // Pull toward the camera so the draped surface never z-fights with the terrain beneath.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
  });
}

interface Disc {
  fill: THREE.Mesh;
  ring: THREE.Mesh;
}

/**
 * The village discs: one translucent tan fill and one outline per village, draped over the
 * terrain. Static geometry built once, nothing runs per frame. Draws after the sea and
 * ponds (renderOrder 1) and before the streets (2).
 */
export class VillageDiscs extends THREE.Group {
  private readonly discs = new Map<string, Disc>();
  private readonly fillMaterial = material(VILLAGE_FILL, VILLAGE_FILL_OPACITY);
  private readonly fillSelected = material(VILLAGE_FILL, VILLAGE_FILL_SELECTED_OPACITY);
  private readonly ringMaterial = material(VILLAGE_OUTLINE, VILLAGE_OUTLINE_OPACITY);
  private readonly ringSelected = material(VILLAGE_OUTLINE_SELECTED, VILLAGE_OUTLINE_SELECTED_OPACITY);
  private selected: string | undefined;

  constructor(villages: readonly Village[], heightAt: HeightAt, opts: VillageDiscsOptions) {
    super();
    this.name = "villages";
    for (const v of villages) {
      const g = buildDiscGeometry({
        cx: v.x,
        cz: v.z,
        radiusM: v.radius_m,
        heightAt,
        waterLevelM: opts.waterLevelM,
        segments: opts.segments ?? VILLAGE_SEGMENTS,
        rings: opts.rings ?? VILLAGE_RINGS,
        ringWidthM: opts.ringWidthM ?? VILLAGE_RING_WIDTH_M,
        liftM: opts.liftM ?? VILLAGE_LIFT_M,
        exaggeration: opts.exaggeration,
      });
      const fill = new THREE.Mesh(toGeometry(g.fill), this.fillMaterial);
      const ring = new THREE.Mesh(toGeometry(g.ring), this.ringMaterial);
      fill.renderOrder = 1.2;
      ring.renderOrder = 1.4;
      const group = new THREE.Group();
      group.name = v.id;
      for (const m of [fill, ring, group]) {
        m.matrixAutoUpdate = false;
        m.updateMatrix();
      }
      group.add(fill, ring);
      this.add(group);
      this.discs.set(v.id, { fill, ring });
    }
  }

  setEnabled(on: boolean): void {
    this.visible = on;
  }

  /** Brighten one village's disc (or none). An unknown id selects nothing. */
  setSelected(id: string | undefined): void {
    if (id === this.selected) return;
    const was = this.selected !== undefined ? this.discs.get(this.selected) : undefined;
    if (was) {
      was.fill.material = this.fillMaterial;
      was.ring.material = this.ringMaterial;
    }
    const now = id !== undefined ? this.discs.get(id) : undefined;
    if (now) {
      now.fill.material = this.fillSelected;
      now.ring.material = this.ringSelected;
    }
    this.selected = now ? id : undefined;
  }

  dispose(): void {
    for (const { fill, ring } of this.discs.values()) {
      fill.geometry.dispose();
      ring.geometry.dispose();
    }
    this.discs.clear();
    for (const m of [this.fillMaterial, this.fillSelected, this.ringMaterial, this.ringSelected]) m.dispose();
    this.clear();
  }
}
