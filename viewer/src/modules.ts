import type { AppContext } from "./appContext";
import { contextModule } from "./contextModule";
import { creeksModule } from "./creeksModule";
import { effectsModule } from "./effectsModule";
import { infoModule } from "./infoModule";
import { overlayModule } from "./overlayModule";
import { pondsModule } from "./pondsModule";

/** A feature module (overlay, search, hotspots, vegetation, ...) plugged into the app. */
export type AppModule = (ctx: AppContext) => void | Promise<void>;

/**
 * Registered modules run in order after the core view is up. Add a module by importing
 * it here and appending it; a module that throws is logged and does not stop the rest.
 */
export const modules: AppModule[] = [infoModule, effectsModule, pondsModule, contextModule, overlayModule, creeksModule];

export async function initModules(ctx: AppContext): Promise<void> {
  for (const init of modules) {
    try {
      await init(ctx);
    } catch (err) {
      console.error("module failed to initialise", err);
    }
  }
}
