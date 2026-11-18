import { fitViewSize } from "./camera";
import type { AppContext } from "./appContext";
import { decodeState } from "./appState";
import { makeRingColorAt } from "./context/colors";
import { ContextLayer } from "./context/layer";
import { holeMatchesCity, ringBounds, ringFitViewSize, ringMinZoom } from "./context/limits";
import { loadContextDoc, loadContextHeights } from "./context/parse";
import type { AppModule } from "./modules";

/**
 * The grey modern ring around the 1769 map (context.json + context.u16). Runs BEFORE the overlay
 * module: it hands the ring's towns over through ctx.extraPlaces, widens the camera limits, and
 * draws the terrain. It first loads the description and the heights (the 1 MB file, so the ring
 * appears a moment after the city) and only then changes anything. A dataset without
 * `context_file`, a ring that does not fit the city, or a ring that fails to load leaves the
 * viewer exactly as it was (one console warning).
 */
export const contextModule: AppModule = async (ctx: AppContext) => {
  // The view as main.ts left it, before any await: used below to tell whether the visitor has
  // moved since.
  const startState = ctx.rig.getState();

  // (a) the description, (b) the heights: nothing is touched until both have arrived.
  let doc;
  let heights;
  try {
    doc = await loadContextDoc(ctx.assetBase, ctx.meta);
    if (!doc) return;
    if (!holeMatchesCity(doc, ctx.meta)) {
      console.warn("Surrounding terrain does not fit this city map; continuing without it.");
      return;
    }
    heights = await loadContextHeights(ctx.assetBase, doc);
  } catch (err) {
    console.warn("Surrounding terrain not loaded; continuing without it.", err);
    return;
  }

  // Build the terrain first, so that if it throws nothing below has been changed yet.
  const exaggeration = ctx.verticalExaggeration;
  let layer;
  try {
    layer = new ContextLayer(doc, heights, {
      exaggeration,
      // At or below the sea floor plane (main.ts puts it at meta.min_m - 0.5), so the skirt never
      // shows a gap even where the ring dips deeper than the city.
      floorY: (Math.min(ctx.meta.min_m, doc.min_m) - 0.5) * exaggeration,
      colorAt: makeRingColorAt(doc.water_level_m),
    });
  } catch (err) {
    console.warn("Surrounding terrain could not be built; continuing without it.", err);
    return;
  }

  // (c) the towns, for the overlay module (it runs after this one)
  for (const p of doc.places) {
    ctx.extraPlaces.push({ id: p.id, name: p.name, kind: p.kind, x: p.x, z: p.z, lon: p.lon, lat: p.lat, groundM: p.ground_m });
  }

  // (d) wider camera limits, kept right as the window is resized
  const originalMinZoom = ctx.rig.getLimits().minZoom;
  const cityW = ctx.meta.width * ctx.meta.cell_m;
  const cityD = ctx.meta.height * ctx.meta.cell_m;
  const cityMaxH = (ctx.meta.max_m - ctx.meta.min_m) * exaggeration;
  const ringMaxH = (doc.max_m - doc.min_m) * exaggeration;
  const bounds = ringBounds(doc);
  let widened = false;
  const widen = () => {
    const aspect = ctx.canvas.clientWidth / Math.max(1, ctx.canvas.clientHeight);
    const minZoom = Math.min(
      originalMinZoom,
      ringMinZoom(fitViewSize(cityW, cityD, cityMaxH, aspect), ringFitViewSize(doc, ringMaxH, aspect)),
    );
    if (!widened) {
      widened = true;
      ctx.rig.setLimits({ bounds, minZoom });
    } else if (Math.abs(minZoom - ctx.rig.getLimits().minZoom) > 1e-9) {
      // The bounds do not change on resize; setLimits ends in setState, which would cancel a
      // running flight, so only call it when the minimum zoom really moved.
      ctx.rig.setLimits({ minZoom });
    }
  };
  widen();
  // A shared link may point beyond the original limits (zoomed out over the grey ring). main.ts
  // clamped it on load, before the ring was known; apply it again now that the limits are wider,
  // unless the visitor has moved the view since this module started.
  const now = ctx.rig.getState();
  if (now.x === startState.x && now.z === startState.z && now.zoom === startState.zoom) {
    const fromHash = decodeState(location.hash);
    ctx.rig.setState({ x: fromHash.x, z: fromHash.z, zoom: fromHash.zoom });
  }
  window.addEventListener("resize", widen);

  // (e) the terrain itself
  ctx.scene.add(layer.object);
  ctx.requestRender();
};
