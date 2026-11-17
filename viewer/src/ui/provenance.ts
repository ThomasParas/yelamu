/** Sources panel: where each data layer comes from and how sure we are. */
import { confidenceInfo } from "../confidence";
import type { HeightmapMeta } from "../heightmap";
import { HAND_SOURCES_NOTE, OVERLAY_NOTE, VEGETATION_NOTE, handSourceRows } from "../provenanceData";
import { confidenceBadge } from "./hotspotPanel";
import type { Shell } from "./shell";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function createProvenance(
  shell: Shell,
  meta: Pick<HeightmapMeta, "layers" | "processing" | "overlay_file" | "hand_sources">,
  options: { vegetation?: boolean } = {},
) {
  const panel = shell.addPanel("provenance", "Sources");
  const parts: Node[] = [];

  parts.push(el("h3", "panel__subtitle", "Data layers"));
  const layers = meta.layers ?? [];
  if (layers.length === 0) {
    parts.push(el("p", "panel__note", "No data layers are listed for this dataset."));
  }
  for (const layer of layers) {
    const card = el("section", "prov");
    card.appendChild(el("h4", "prov__title", layer.id));
    const dl = el("dl", "prov__list");
    const info = confidenceInfo(layer.confidence);
    const confidenceDd = el("dd");
    confidenceDd.append(confidenceBadge(layer.confidence), el("span", "hotspot__meaning", info.meaning));
    const rows: Array<[string, Node | string]> = [
      ["Source", layer.source],
      ["Confidence", confidenceDd],
      ["Attribution", layer.attribution],
    ];
    for (const [term, value] of rows) {
      dl.appendChild(el("dt", undefined, term));
      if (typeof value === "string") dl.appendChild(el("dd", undefined, value));
      else dl.appendChild(value);
    }
    card.appendChild(dl);
    parts.push(card);
  }

  const handRows = handSourceRows(meta.hand_sources);
  if (handRows.length > 0) {
    parts.push(el("h3", "panel__subtitle", "Hand-drawn and sculpted"));
    parts.push(el("p", "panel__note", HAND_SOURCES_NOTE));
    for (const row of handRows) {
      const card = el("section", "prov");
      card.appendChild(el("h4", "prov__title", row.label));
      const dl = el("dl", "prov__list");
      const info = confidenceInfo(row.confidence);
      const confidenceDd = el("dd");
      confidenceDd.append(confidenceBadge(row.confidence), el("span", "hotspot__meaning", info.meaning));
      const rows: Array<[string, Node | string]> = [
        ["Source", row.source],
        ["Confidence", confidenceDd],
      ];
      if (row.countText) rows.push(["Features", row.countText]);
      for (const [term, value] of rows) {
        dl.appendChild(el("dt", undefined, term));
        if (typeof value === "string") dl.appendChild(el("dd", undefined, value));
        else dl.appendChild(value);
      }
      card.appendChild(dl);
      parts.push(card);
    }
  }

  // The raw processing settings (meta.processing) are deliberately not shown to visitors: they are
  // build parameters that live in the data file and the repository.

  if (meta.overlay_file) {
    parts.push(el("h3", "panel__subtitle", "Streets and landmarks"));
    parts.push(el("p", "panel__note", OVERLAY_NOTE));
  }

  if (options.vegetation) {
    parts.push(el("h3", "panel__subtitle", "Vegetation"));
    parts.push(el("p", "panel__note", VEGETATION_NOTE));
  }

  panel.el.replaceChildren(...parts);
  return panel;
}
