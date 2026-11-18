/**
 * Places panel: every hotspot and landmark as a list of buttons, so the whole map can be
 * reached from the keyboard or a screen reader without hunting for markers on the canvas.
 * Choosing one closes the panel (returning focus to the Places button) and calls onSelect,
 * which flies there and opens the hotspot panel. All names go through textContent.
 */
import type { PlaceGroup } from "../placesList";
import type { Panel, Shell } from "./shell";

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function createPlacesPanel(shell: Shell, groups: readonly PlaceGroup[], onSelect: (id: string) => void): Panel {
  const panel = shell.addPanel("places", "Places");
  const parts: Node[] = [];
  parts.push(node("p", "panel__note", "Every hotspot, village site and landmark on the map. Choose one to fly there."));
  for (const group of groups) {
    const headingId = `places-${group.title.toLowerCase().replace(/\s+/g, "-")}`;
    const heading = node("h3", "panel__subtitle", group.title);
    heading.id = headingId;
    const list = node("ul", "places");
    list.setAttribute("aria-labelledby", headingId);
    for (const item of group.items) {
      const li = node("li");
      const button = node("button", "places__item");
      button.type = "button";
      button.dataset.place = item.id;
      button.append(node("span", "places__name", item.name), node("span", "places__kind", item.kind));
      button.addEventListener("click", () => {
        panel.close();
        onSelect(item.id);
      });
      li.appendChild(button);
      list.appendChild(li);
    }
    parts.push(heading, list);
  }
  if (groups.length === 0) parts.push(node("p", "panel__note", "This dataset has no places."));
  panel.el.replaceChildren(...parts);
  return panel;
}
