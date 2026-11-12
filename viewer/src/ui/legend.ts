/** Legend panel: what the ground colours and map symbols mean. */
import type { HeightmapMeta } from "../heightmap";
import { legendEntries, legendNotes } from "../legendEntries";
import { VEGETATION_NOTE } from "../provenanceData";
import type { Shell } from "./shell";

export function createLegend(
  shell: Shell,
  meta: Pick<HeightmapMeta, "habitat_classes" | "overlay_file" | "ponds_file">,
  options: { vegetation?: boolean } = {},
) {
  const panel = shell.addPanel("legend", "Legend");

  const heading = document.createElement("h3");
  heading.className = "panel__subtitle";
  heading.textContent = "Ground";
  const list = document.createElement("ul");
  list.className = "legend";
  for (const e of legendEntries(meta.habitat_classes)) {
    const li = document.createElement("li");
    li.className = "legend__row";
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.backgroundColor = e.color; // our own constant, never data
    swatch.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = e.label;
    li.append(swatch, text);
    list.appendChild(li);
  }

  const parts: Node[] = [heading, list];
  if (list.children.length === 0) {
    const none = document.createElement("p");
    none.className = "panel__note";
    none.textContent = "This dataset has no ground classes.";
    parts.splice(1, 1, none);
  }

  for (const text of legendNotes(meta)) {
    const note = document.createElement("p");
    note.className = "panel__note";
    note.textContent = text;
    parts.push(note);
  }

  if (meta.overlay_file) {
    const symbols = document.createElement("h3");
    symbols.className = "panel__subtitle";
    symbols.textContent = "Map symbols";
    const sym = document.createElement("ul");
    sym.className = "legend legend--symbols";
    const rows: Array<[string, string]> = [
      ["marker", "Hotspot: select it to read about the place."],
      ["label", "Text label: a landmark. Positions are approximate."],
      ["street", "Thin dark line: a modern street, for orientation only."],
    ];
    for (const [kind, text] of rows) {
      const li = document.createElement("li");
      li.className = "legend__row";
      const icon = document.createElement("span");
      icon.className = `legend__icon legend__icon--${kind}`;
      icon.setAttribute("aria-hidden", "true");
      const t = document.createElement("span");
      t.textContent = text;
      li.append(icon, t);
      sym.appendChild(li);
    }
    parts.push(symbols, sym);
  }

  if (options.vegetation) {
    // The same sentence as on the Sources panel, so the two never disagree.
    const note = document.createElement("p");
    note.className = "panel__note";
    note.textContent = VEGETATION_NOTE;
    parts.push(note);
  }

  panel.el.replaceChildren(...parts);
  return panel;
}
