import type { AppContext } from "./appContext";
import { CreeksLayer } from "./creeks/layer";
import { loadCreeks } from "./creeks/parse";
import type { HeightmapMeta } from "./heightmap";
import type { AppModule } from "./modules";
import { makeHeightSampler } from "./overlay/heightAt";

export interface CreekLayerDef {
  id: string;
  label: string;
  defaultOn: boolean;
}

/** The two creek layers. Ids are what the URL hash `l=` carries, so they must not change. */
export const CREEK_LAYERS = {
  creeks: { id: "creeks", label: "Historical creeks", defaultOn: true },
  modelled: { id: "modelled-streams", label: "Modelled streams", defaultOn: true },
} as const satisfies Record<string, CreekLayerDef>;

const count = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

/** The toggles a dataset gets: one per layer that has lines (read defensively, meta is never validated). */
export function creekLayerDefs(meta: Pick<HeightmapMeta, "creeks_mapped" | "creeks_modelled">): CreekLayerDef[] {
  const out: CreekLayerDef[] = [];
  if (count(meta.creeks_mapped) > 0) out.push(CREEK_LAYERS.creeks);
  if (count(meta.creeks_modelled) > 0) out.push(CREEK_LAYERS.modelled);
  return out;
}

/**
 * Historical creeks: SFEI's hand-mapped creek lines and its modelled stream channels, drawn as
 * ribbons on the terrain, each with its own layer toggle. A dataset without `creeks_file`, or a
 * failed load or a failure while building the layer, leaves the viewer exactly as it was (one console warning).
 */
export const creeksModule: AppModule = async (ctx: AppContext) => {
  if (!ctx.meta.creeks_file) return;
  let creeks;
  try {
    creeks = await loadCreeks(ctx.assetBase, ctx.meta);
  } catch (err) {
    console.warn("Creeks not loaded; continuing without them.", err);
    return;
  }
  if (!creeks || (creeks.mapped.length === 0 && creeks.modelled.length === 0)) return;

  // The toggles follow what the file really holds, through the same rule the dataset's meta uses.
  const defs = creekLayerDefs({ creeks_mapped: creeks.mapped.length, creeks_modelled: creeks.modelled.length });

  // Building the ribbons and wiring the toggles can throw (a bad height grid, a duplicate toggle id).
  // The scene is touched last, so a failure leaves the viewer as it was, with one warning.
  let built: CreeksLayer | undefined;
  try {
    const heightAt = makeHeightSampler(ctx.heights, ctx.meta);
    const layer = new CreeksLayer(creeks, heightAt, {
      waterLevelM: ctx.meta.water_level_m,
      exaggeration: ctx.verticalExaggeration,
    });
    built = layer;
    const handles = new Map<string, ReturnType<typeof ctx.shell.addToggle>>();
    const sync = () => {
      layer.setMappedEnabled(ctx.layers.has(CREEK_LAYERS.creeks.id));
      layer.setModelledEnabled(ctx.layers.has(CREEK_LAYERS.modelled.id));
      for (const def of defs) handles.get(def.id)?.set(ctx.layers.has(def.id));
      ctx.requestRender();
    };
    for (const def of defs) {
      const on = ctx.layers.register(def.id, def.defaultOn);
      handles.set(def.id, ctx.shell.addToggle(def.id, def.label, on, (v) => ctx.layers.set(def.id, v)));
    }
    ctx.layers.onChange(sync);
    sync();
    ctx.scene.add(layer);
  } catch (err) {
    console.warn("Creeks not drawn; continuing without them.", err);
    built?.dispose();
  }
};
