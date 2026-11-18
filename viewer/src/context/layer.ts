import * as THREE from "three";
import { buildTileGeometry, planTiles, type TileOptions } from "./geometry";
import type { ContextDoc } from "./types";

export interface ContextLayerOptions extends TileOptions {
  /** Cells per tile edge. Default 96. */
  tileCells?: number;
  /** Shared material; default a smooth-shaded vertex-colour standard material like the city's. */
  material?: THREE.Material;
}

/** The grey modern ring: one static mesh per tile, in world coordinates, culled by the camera. */
export class ContextLayer {
  readonly object = new THREE.Group();
  private readonly material: THREE.Material;
  private readonly ownsMaterial: boolean;
  private triangles = 0;

  constructor(doc: ContextDoc, heights: Float32Array, options: ContextLayerOptions) {
    this.object.name = "context";
    this.ownsMaterial = !options.material;
    this.material = options.material ?? new THREE.MeshStandardMaterial({ vertexColors: true });
    for (const tile of planTiles(doc.cols, doc.rows, options.tileCells ?? 96)) {
      const geometry = buildTileGeometry(doc, heights, tile, options);
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.name = `context-${tile.i0}-${tile.j0}`;
      mesh.matrixAutoUpdate = false; // static: positions are already in world coordinates
      mesh.updateMatrix();
      this.object.add(mesh);
      this.triangles += (geometry.getIndex()?.count ?? 0) / 3;
    }
  }

  setVisible(on: boolean): void {
    this.object.visible = on;
  }

  stats(): { tiles: number; triangles: number } {
    return { tiles: this.object.children.length, triangles: this.triangles };
  }

  dispose(): void {
    for (const child of this.object.children) (child as THREE.Mesh).geometry.dispose();
    this.object.clear();
    if (this.ownsMaterial) this.material.dispose();
    this.triangles = 0;
  }
}
