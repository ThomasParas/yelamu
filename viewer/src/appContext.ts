import type * as THREE from "three";
import type { HeightmapMeta } from "./heightmap";
import type { LayerSelection } from "./layerSelection";
import type { PlaceSelection } from "./placeSelection";
import type { QualityController } from "./quality";
import type { SurpriseTarget } from "./surprise";
import type { TerrainChunks } from "./terrainChunks";
import type { Shell } from "./ui/shell";
import type { VegetationLayer } from "./vegetation/layer";
import type { ViewRig } from "./viewRig";
import type { WaterMaterial } from "./water/waterMaterial";

/** Callbacks for the keyboard shortcuts that belong to modules built on top of the core. */
export interface KeyHandlers {
  /** "/" pressed. Default: no-op. A search module replaces it to focus its input. */
  search(): void;
  /** "?" pressed. Default: no-op. A help module replaces it to open the help panel. */
  help(): void;
  /** Escape pressed. Default: closes the top-most open panel. Wrap it to add behaviour. */
  escape(): void;
}

/** A place outside the overlay (a town in the grey surrounding ring): a modern landmark label. */
export interface ExtraPlace {
  id: string;
  name: string;
  /** "town", "peak" or "airport". */
  kind: string;
  /** World metres. */
  x: number;
  z: number;
  lon: number;
  lat: number;
  /** Ground height at the place, real metres (labels sit at groundM * verticalExaggeration). */
  groundM: number;
}

/**
 * Everything a feature module needs, built once by start() in main.ts after the data has
 * loaded. Modules receive it from initModules (modules.ts) and keep a reference.
 */
export interface AppContext {
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  /** Camera pose: pan, zoom, rotate, flyTo, onChange. */
  rig: ViewRig;
  shell: Shell;
  meta: HeightmapMeta;
  /** Heights in metres, row-major, row 0 = north edge (see terrainMesh.ts). */
  heights: Float32Array;
  habitat: Uint8Array | null;
  terrain: TerrainChunks;
  /** Ask for one render on the next animation frame (cheap to call repeatedly). */
  requestRender(): void;
  /**
   * Like requestRender, but for frames nobody asked for by interacting (the idle water
   * animation): the frame only draws the scene, skips terrain updates and onFrame
   * callbacks, and is not fed to the quality controller.
   */
  requestIdleRender(): void;
  /** Watches interaction frame gaps and steps the effects level down/up. */
  quality: QualityController;
  /** Plants on the full-resolution chunks; null when the dataset has no habitat raster. */
  vegetation: VegetationLayer | null;
  /** The water surface material (animation on/off, time). */
  water: WaterMaterial;
  /** Base URL of the selected dataset folder, e.g. "/assets/slice" (no trailing slash). */
  assetBase: string;
  /** Vertical exaggeration applied to terrain (and anything that must sit on it). */
  verticalExaggeration: number;
  /** Enabled optional layers; mirrored into the URL hash (`l=`). */
  layers: LayerSelection;
  /** The selected hotspot / landmark id; mirrored into the URL hash (`p=`). */
  place: PlaceSelection;
  /**
   * Places "Surprise me" may fly to instead of a random land point (about 60% of the
   * time when non-empty). Modules push onto it; `place` is selected on arrival.
   */
  surpriseTargets: SurpriseTarget[];
  /**
   * Extra landmark-like places that modules contribute BEFORE the overlay module runs (the
   * context module adds the ring's towns). The overlay module labels, searches and lists them.
   */
  extraPlaces: ExtraPlace[];
  /**
   * Run `cb` after every renderer.render (camera matrices are current). A callback that
   * throws is removed and logged once. Returns an unsubscribe function.
   */
  onFrame(cb: () => void): () => void;
  handlers: KeyHandlers;
}
