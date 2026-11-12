import * as THREE from "three";
import type { AppContext } from "./appContext";
import type { AppModule } from "./modules";
import { PondsLayer } from "./ponds/layer";
import { loadPonds } from "./ponds/parse";
import type { Ponds } from "./ponds/types";
import { WATER_COLOR, WATER_OPACITY } from "./water/waterMaterial";

/** What mountPonds needs from the app (a subset of AppContext; `water` may be absent). */
export type PondsHost = Pick<AppContext, "scene" | "verticalExaggeration" | "requestRender"> &
  Partial<Pick<AppContext, "water">>;

/**
 * The material the ponds are drawn with: the sea's own (so ponds share its animated ripples,
 * glint and the Water motion toggle), or, when the host has none, a plain translucent
 * material in the same colour and opacity.
 */
export function pondMaterial(host: Partial<Pick<AppContext, "water">>): THREE.Material {
  return (
    host.water?.material ??
    new THREE.MeshStandardMaterial({ color: WATER_COLOR, transparent: true, opacity: WATER_OPACITY })
  );
}

/** Build the ponds layer and add it to the scene. Ponds are not an optional layer: always visible. */
export function mountPonds(host: PondsHost, ponds: Ponds, report?: (message: string) => void): PondsLayer {
  const layer = new PondsLayer(ponds, pondMaterial(host), host.verticalExaggeration, report);
  host.scene.add(layer.object);
  host.requestRender();
  return layer;
}

/**
 * Freshwater ponds and lagoons from the dataset's ponds.json: flat water surfaces at their
 * own level, drawn with the sea's water material. A dataset without `ponds_file`, or a failed
 * load, leaves the viewer exactly as it was (one console warning). Independent of the layer
 * toggles and the URL hash.
 */
export const pondsModule: AppModule = async (ctx: AppContext) => {
  if (!ctx.meta.ponds_file) return;
  let ponds: Ponds | null;
  try {
    ponds = await loadPonds(ctx.assetBase, ctx.meta);
  } catch (err) {
    console.warn("Ponds not loaded; continuing without them.", err);
    return;
  }
  if (!ponds || ponds.ponds.length === 0) return;
  const problems: string[] = [];
  mountPonds(ctx, ponds, (m) => problems.push(m));
  if (problems.length > 0) console.warn("Some ponds were not fully drawn:", problems);
};
