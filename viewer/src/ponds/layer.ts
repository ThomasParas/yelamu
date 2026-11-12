import * as THREE from "three";
import { buildPondGeometry } from "./geometry";
import type { Ponds } from "./types";

/**
 * Pond surfaces draw after the sea plane (renderOrder 0) and the opaque terrain, both of
 * which they sit above. All ponds share one material, so they also share one program.
 */
export const POND_RENDER_ORDER = 1;

/**
 * Freshwater ponds as flat water surfaces: one mesh per pond, positioned in world
 * coordinates (the meshes carry no transform). The material is shared and owned by the
 * caller, normally the sea's animated water material, so ponds ripple with the sea and
 * follow the Water motion toggle without any wiring of their own.
 */
export class PondsLayer {
  readonly object = new THREE.Group();
  private readonly skippedIds: string[] = [];
  private triangles = 0;

  /**
   * @param report told about each pond (or hole) that could not be drawn
   */
  constructor(
    ponds: Ponds,
    material: THREE.Material,
    exaggeration: number,
    report?: (message: string) => void,
  ) {
    this.object.name = "ponds";
    for (const pond of ponds.ponds) {
      const geometry = buildPondGeometry(pond, exaggeration, report);
      if (!geometry) {
        this.skippedIds.push(pond.id);
        continue;
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `pond-${pond.id}`;
      mesh.userData.pondId = pond.id;
      mesh.renderOrder = POND_RENDER_ORDER;
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false; // static: positions are already in world coordinates
      mesh.updateMatrix();
      this.object.add(mesh);
      this.triangles += (geometry.getIndex()?.count ?? 0) / 3;
    }
  }

  setVisible(on: boolean): void {
    this.object.visible = on;
  }

  /** Ponds drawn and their triangle count (for the debug overlay). */
  stats(): { ponds: number; triangles: number } {
    return { ponds: this.object.children.length, triangles: this.triangles };
  }

  /** Ids of ponds that were left out because their outline had no area. */
  skipped(): readonly string[] {
    return this.skippedIds;
  }

  /** Free the geometries. The material is shared and stays with its owner. */
  dispose(): void {
    for (const child of this.object.children) (child as THREE.Mesh).geometry.dispose();
    this.object.clear();
    this.triangles = 0;
  }
}
