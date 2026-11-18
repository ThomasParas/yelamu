import * as THREE from "three";
import type { HeightAt } from "../overlay/drape";
import {
  CREEK_COLOR,
  CREEK_LIFT_M,
  CREEK_OPACITY,
  CREEK_RENDER_ORDER,
  CREEK_STEP_M,
  CREEK_WIDTH_M,
  MODELLED_COLOR,
  MODELLED_OPACITY,
  MODELLED_WIDTH_M,
} from "./colors";
import { buildRibbons, type RibbonMesh } from "./ribbon";
import type { Creeks } from "./types";

export interface CreeksLayerOptions {
  waterLevelM: number;
  exaggeration: number;
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
 * streams (3 meshes), each toggled with its layer. Static geometry built once; nothing runs per frame.
 */
export class CreeksLayer extends THREE.Group {
  private readonly mappedGroup = new THREE.Group();
  private readonly modelledGroup = new THREE.Group();

  constructor(creeks: Creeks, heightAt: HeightAt, opts: CreeksLayerOptions) {
    super();
    this.name = "creeks";
    this.mappedGroup.name = "creeks-mapped";
    this.modelledGroup.name = "creeks-modelled";
    const common = { heightAt, waterLevelM: opts.waterLevelM, stepM: CREEK_STEP_M, liftM: CREEK_LIFT_M, exaggeration: opts.exaggeration };

    if (creeks.mapped.length > 0) {
      const mesh = new THREE.Mesh(
        geometry(buildRibbons(creeks.mapped.map((c) => c.points), { ...common, widthM: CREEK_WIDTH_M })),
        material(CREEK_COLOR, CREEK_OPACITY),
      );
      mesh.name = "creeks-mapped-ribbons";
      mesh.renderOrder = CREEK_RENDER_ORDER;
      this.mappedGroup.add(mesh);
    }
    for (const b of [3, 4, 5] as const) {
      const lines = creeks.modelled.filter((m) => band(m.order) === b).map((m) => m.points);
      if (lines.length === 0) continue;
      const mesh = new THREE.Mesh(
        geometry(buildRibbons(lines, { ...common, widthM: MODELLED_WIDTH_M[b] })),
        material(MODELLED_COLOR, MODELLED_OPACITY),
      );
      mesh.name = `creeks-modelled-order-${b}`;
      mesh.renderOrder = CREEK_RENDER_ORDER;
      this.modelledGroup.add(mesh);
    }
    this.add(this.mappedGroup, this.modelledGroup);
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
