import { fitViewSize } from "./camera";
import type { AppContext } from "./appContext";
import { makeRingColorAt } from "./context/colors";
import { ContextLayer } from "./context/layer";
import { ringBounds, ringFitViewSize, ringMinZoom } from "./context/limits";
import { loadContextDoc, loadContextHeights } from "./context/parse";
import type { AppModule } from "./modules";

/**
 * The grey modern ring around the 1769 map (context.json + context.u16). Runs BEFORE the overlay
 * module: it hands the ring's towns over through ctx.extraPlaces, widens the camera limits, and
 * draws the terrain once its heights have arrived (the 1 MB file is not awaited, so the city and
 * the overlay appear first). A dataset without `context_file`, or a failed load, leaves the
 * viewer exactly as it was (one console warning).
 */
export const contextModule: AppModule = async (ctx: AppContext) => {
  let doc;
  try {
    doc = await loadContextDoc(ctx.assetBase, ctx.meta);
  } catch (err) {
    console.warn("Surrounding terrain not loaded; continuing without it.", err);
    return;
  }
  if (!doc) return;

  for (const p of doc.places) {
    ctx.extraPlaces.push({ id: p.id, name: p.name, kind: p.kind, x: p.x, z: p.z, lon: p.lon, lat: p.lat, groundM: p.ground_m });
  }

  const exaggeration = ctx.verticalExaggeration;
  const original = ctx.rig.getLimits();
  const cityW = ctx.meta.width * ctx.meta.cell_m;
  const cityD = ctx.meta.height * ctx.meta.cell_m;
  const cityMaxH = (ctx.meta.max_m - ctx.meta.min_m) * exaggeration;
  const ringMaxH = (doc.max_m - doc.min_m) * exaggeration;
  const widen = () => {
    const aspect = ctx.canvas.clientWidth / Math.max(1, ctx.canvas.clientHeight);
    const minZoom = ringMinZoom(fitViewSize(cityW, cityD, cityMaxH, aspect), ringFitViewSize(doc, ringMaxH, aspect));
    ctx.rig.setLimits({ bounds: ringBounds(doc), minZoom: Math.min(original.minZoom, minZoom) });
  };
  widen();
  window.addEventListener("resize", widen);

  void (async () => {
    try {
      const heights = await loadContextHeights(ctx.assetBase, doc);
      const layer = new ContextLayer(doc, heights, {
        exaggeration,
        floorY: (ctx.meta.min_m - 0.5) * exaggeration, // the sea floor plane's height (main.ts)
        colorAt: makeRingColorAt(doc.water_level_m),
      });
      ctx.scene.add(layer.object);
      ctx.requestRender();
    } catch (err) {
      console.warn("Surrounding terrain heights not loaded; continuing without them.", err);
      window.removeEventListener("resize", widen);
      ctx.rig.setLimits(original);
    }
  })();
};
