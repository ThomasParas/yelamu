import * as THREE from "three";
import type { HeightAt } from "../overlay/drape";
import {
  CREEK_COLOR,
  CREEK_LIFT_M,
  CREEK_OPACITY,
  CREEK_RENDER_ORDER,
  CREEK_STEP_M,
  CREEK_TARGET_PX,
  CREEK_WIDTH_M,
  MODELLED_COLOR,
  MODELLED_OPACITY,
  MODELLED_TARGET_PX,
  MODELLED_WIDTH_M,
} from "./colors";
import { buildRibbons, type RibbonMesh, type RibbonOptions } from "./ribbon";
import type { Creeks } from "./types";
import { ribbonWidth } from "./width";

export interface CreeksLayerOptions {
  waterLevelM: number;
  exaggeration: number;
  /** World metres per CSS pixel to build the first widths for. Omitted (or 0): the close-up widths. */
  mPerPx?: number;
}

/** One mesh of ribbons: its lines, its close-up width and target pixels, and the width it is built at now. */
interface Band {
  mesh: THREE.Mesh;
  lines: number[][];
  baseM: number;
  targetPx: number;
  widthM: number;
}

function geometry(mesh: RibbonMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  g.computeBoundingSphere();
  return g;
}

function material(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    opacity,
    transparent: true,
    depthWrite: false,
    // Pull toward the camera so the draped ribbon never z-fights with the terrain beneath.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
  });
}

/** The modelled width band of an order: 3, 4, or 5 for everything from 5 up. */
function band(order: number): 3 | 4 | 5 {
  return order >= 5 ? 5 : order >= 4 ? 4 : 3;
}

/**
 * The creek ribbons: one mesh for the hand-mapped creeks and one per width band for the modelled
 * streams (3 meshes), each toggled with its layer. The geometry lives on the CPU and its width follows
 * the zoom in discrete levels (width.ts): update() rebuilds a band only when its level changes, so
 * the ribbons still drape over the terrain at every width and nothing runs per frame.
 */
export class CreeksLayer extends THREE.Group {
  private readonly mappedGroup = new THREE.Group();
  private readonly modelledGroup = new THREE.Group();
  private readonly bands: Band[] = [];
  private readonly common: Omit<RibbonOptions, "widthM">;

  constructor(creeks: Creeks, heightAt: HeightAt, opts: CreeksLayerOptions) {
    super();
    this.name = "creeks";
    this.mappedGroup.name = "creeks-mapped";
    this.modelledGroup.name = "creeks-modelled";
    this.common = { heightAt, waterLevelM: opts.waterLevelM, stepM: CREEK_STEP_M, liftM: CREEK_LIFT_M, exaggeration: opts.exaggeration };
    const mPerPx = opts.mPerPx ?? 0;

    const addBand = (group: THREE.Group, name: string, lines: number[][], baseM: number, targetPx: number, mat: THREE.Material) => {
      const widthM = ribbonWidth(baseM, targetPx, mPerPx);
      const mesh = new THREE.Mesh(geometry(buildRibbons(lines, { ...this.common, widthM })), mat);
      mesh.name = name;
      mesh.renderOrder = CREEK_RENDER_ORDER;
      group.add(mesh);
      this.bands.push({ mesh, lines, baseM, targetPx, widthM });
    };

    if (creeks.mapped.length > 0) {
      addBand(
        this.mappedGroup,
        "creeks-mapped-ribbons",
        creeks.mapped.map((c) => c.points),
        CREEK_WIDTH_M,
        CREEK_TARGET_PX,
        material(CREEK_COLOR, CREEK_OPACITY),
      );
    }
    for (const b of [3, 4, 5] as const) {
      const lines = creeks.modelled.filter((m) => band(m.order) === b).map((m) => m.points);
      if (lines.length === 0) continue;
      addBand(this.modelledGroup, `creeks-modelled-order-${b}`, lines, MODELLED_WIDTH_M[b], MODELLED_TARGET_PX[b], material(MODELLED_COLOR, MODELLED_OPACITY));
    }
    this.add(this.mappedGroup, this.modelledGroup);
  }

  /**
   * Set the widths for `mPerPx` world metres per CSS pixel. Rebuilds the geometry of each band whose
   * width level changed (disposing the old one; materials and visibility stay) and returns true if any
   * did. Hidden groups are kept current too, so a group shown again is already the right width.
   * A value that is not a positive finite number asks for the close-up widths.
   */
  update(mPerPx: number): boolean {
    let changed = false;
    for (const b of this.bands) {
      const widthM = ribbonWidth(b.baseM, b.targetPx, mPerPx);
      if (widthM === b.widthM) continue;
      const next = geometry(buildRibbons(b.lines, { ...this.common, widthM }));
      b.mesh.geometry.dispose();
      b.mesh.geometry = next;
      b.widthM = widthM;
      changed = true;
    }
    return changed;
  }

  setMappedEnabled(on: boolean): void {
    this.mappedGroup.visible = on;
  }

  setModelledEnabled(on: boolean): void {
    this.modelledGroup.visible = on;
  }

  dispose(): void {
    this.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.removeFromParent();
  }
}
