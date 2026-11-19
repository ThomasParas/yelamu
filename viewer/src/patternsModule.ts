import type { AppContext } from "./appContext";
import { PATTERNS_LAYER } from "./habitatPatterns";
import type { AppModule } from "./modules";

/** Root attribute that switches the legend swatches to their patterned look (ui.css). */
export const PATTERNS_ROOT_ATTR = "data-habitat-patterns";

/**
 * The "Habitat patterns" layer: texture marks on the ground classes that are hard to tell apart
 * by colour alone (see habitatPatterns.ts). Off by default; the legend swatches show the same
 * marks while it is on. Nothing to do for a dataset without a habitat raster.
 */
export const patternsModule: AppModule = (ctx: AppContext) => {
  const material = ctx.habitatMaterial;
  if (!material) return;
  const root = document.documentElement;

  const apply = () => {
    const on = ctx.layers.has(PATTERNS_LAYER);
    material.setPatterns(on);
    material.setPixelRatio(ctx.renderer.getPixelRatio());
    if (on) root.setAttribute(PATTERNS_ROOT_ATTR, "");
    else root.removeAttribute(PATTERNS_ROOT_ATTR);
    toggle.set(on);
    ctx.requestRender();
  };

  const on = ctx.layers.register(PATTERNS_LAYER, false);
  const toggle = ctx.shell.addToggle(PATTERNS_LAYER, "Habitat patterns", on, (v) => ctx.layers.set(PATTERNS_LAYER, v));
  ctx.layers.onChange(apply);
  window.addEventListener("resize", apply); // the pixel ratio changes when a window moves screens
  apply();
};
