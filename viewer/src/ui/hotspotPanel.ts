/** Side panel with the details of one hotspot (or village site). All text from data goes through textContent. */
import { confidenceInfo } from "../confidence";
import type { PanelPlace } from "../overlay/villageSite";
import type { Panel, Shell } from "./shell";

export interface HotspotPanel {
  /** Fill and open the panel for `hotspot` (a village arrives with its kind text "Village site"). */
  show(hotspot: PanelPlace): void;
  /** Close the panel (calls the onClose handlers). */
  hide(): void;
  isOpen(): boolean;
  onClose(handler: () => void): void;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** A badge whose text is always visible (colour is only a hint). */
export function confidenceBadge(confidence: string): HTMLElement {
  const info = confidenceInfo(confidence);
  const badge = node("span", `badge badge--${info.key}`, info.label);
  badge.title = info.meaning;
  return badge;
}

/** Only absolute http(s) links reach the DOM. */
export function safeLink(url: string, text: string): HTMLElement {
  let ok = false;
  try {
    const p = new URL(url).protocol;
    ok = p === "http:" || p === "https:";
  } catch {
    ok = false;
  }
  if (!ok) return node("span", undefined, text);
  const a = node("a", "link", text);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

export function createHotspotPanel(shell: Shell): HotspotPanel {
  const panel: Panel = shell.addPanel("hotspot", "Hotspot");

  const show = (h: PanelPlace) => {
    panel.setTitle(h.name);
    const info = confidenceInfo(h.confidence);

    const kind = node("p", "hotspot__kind", h.kind);
    const description = node("p", "hotspot__description", h.description);

    const confidence = node("div", "hotspot__confidence");
    confidence.append(confidenceBadge(h.confidence), node("span", "hotspot__meaning", info.meaning));

    const sourcesTitle = node("h3", "panel__subtitle", "Sources");
    const sources = node("ul", "hotspot__sources");
    for (const s of h.sources) {
      const li = node("li");
      li.appendChild(safeLink(s.url, s.title));
      sources.appendChild(li);
    }

    const close = node("button", "btn btn--text hotspot__close", "Close");
    close.type = "button";
    close.addEventListener("click", () => panel.close());

    panel.el.replaceChildren(kind, description, confidence, sourcesTitle, sources, close);
    panel.open();
  };

  return {
    show,
    hide: () => panel.close(),
    isOpen: () => panel.isOpen(),
    onClose: (h) => panel.onClose(h),
  };
}
