import type { AppModule } from "./modules";
import { createAbout } from "./ui/about";
import { createLegend } from "./ui/legend";
import { createProvenance } from "./ui/provenance";

/**
 * Legend, Sources and About: they only need the dataset's meta.json, so they exist with or
 * without an overlay. The About dialog opens by itself on a visitor's first visit.
 */
export const infoModule: AppModule = (ctx) => {
  const { shell, meta } = ctx;
  // Vegetation shapes exist only where there is a habitat raster to place them by.
  const vegetation = ctx.vegetation !== null;
  const legend = createLegend(shell, meta, { vegetation });
  const sources = createProvenance(shell, meta, { vegetation });
  const about = createAbout();

  // One info panel at a time keeps the screen readable.
  const openOnly = (panel: { open(): void; close(): void }, others: Array<{ close(): void }>) => {
    for (const o of others) o.close();
    panel.open();
  };
  shell.addAction("legend", "Legend", () => openOnly(legend, [sources]));
  shell.addAction("sources", "Sources", () => openOnly(sources, [legend]));
  shell.addAction("about", "About", () => about.open());

  about.openIfFirstVisit();
};
