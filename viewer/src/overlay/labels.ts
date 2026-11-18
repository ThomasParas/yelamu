import * as THREE from "three";
import type { LandmarkKind } from "./types";

/** Project a world point to CSS pixels (origin top-left). The camera's matrices must be current. */
export function projectToScreen(
  point: THREE.Vector3,
  camera: THREE.Camera,
  widthPx: number,
  heightPx: number,
): { x: number; y: number } {
  const ndc = point.clone().project(camera);
  return { x: (ndc.x * 0.5 + 0.5) * widthPx, y: (-ndc.y * 0.5 + 0.5) * heightPx };
}

/** A screen rectangle (x, y = top-left corner) competing for space. */
export interface DeclutterItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  priority: number;
}

/**
 * Greedy label placement: highest priority first (ties by id, so the result does not
 * depend on input order); an item is kept unless it overlaps an already kept one, with
 * `padding` pixels of clear space required between rectangles. Returns the kept ids.
 */
export function declutter(items: readonly DeclutterItem[], padding: number): Set<string> {
  const order = [...items].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const kept: DeclutterItem[] = [];
  const ids = new Set<string>();
  for (const it of order) {
    if (ids.has(it.id)) continue;
    const clash = kept.some(
      (k) =>
        it.x < k.x + k.w + padding &&
        k.x < it.x + it.w + padding &&
        it.y < k.y + k.h + padding &&
        k.y < it.y + it.h + padding,
    );
    if (clash) continue;
    kept.push(it);
    ids.add(it.id);
  }
  return ids;
}

/** Declutter priority of a landmark label by kind (hotspots use HOTSPOT_PRIORITY). */
export const HOTSPOT_PRIORITY = 100;
/** Village names rank with hotspots, so they win over every landmark. */
export const VILLAGE_PRIORITY = HOTSPOT_PRIORITY;
const LANDMARK_PRIORITY: Record<LandmarkKind, number> = {
  hill: 60,
  park: 56,
  bridge: 55,
  neighborhood: 50,
  fort: 46,
  beach: 45,
  water: 44,
  building: 40,
  other: 30,
  region: 58,
};
export function landmarkPriority(kind: string): number {
  return Object.hasOwn(LANDMARK_PRIORITY, kind) ? LANDMARK_PRIORITY[kind as LandmarkKind] : 30;
}

export interface LabelItem {
  id: string;
  text: string;
  /** World position of the anchor; y is already scaled (exaggerated). */
  x: number;
  z: number;
  y: number;
  kind: "landmark" | "hotspot" | "village" | "region";
  priority: number;
}

/**
 * Landmark label text and the halo drawn around it so it reads over any ground colour.
 * ui.css (--label-fg, --label-halo) must hold the same values; uiColors.test.ts checks both
 * the sync and the contrast.
 */
export const LABEL_TEXT = 0x1c2429;
export const LABEL_HALO = 0xffffff;
export const LABEL_HALO_ALPHA = 0.95;

/** Clear space kept between two labels, CSS pixels. */
export const LABEL_PADDING_PX = 4;
/** Labels whose box is further than this outside the viewport are not shown. */
const CULL_MARGIN_PX = 8;
const SELECTED_BOOST = 10_000;

interface Entry {
  item: LabelItem;
  el: HTMLElement;
  dot: HTMLElement | null;
  shown: boolean;
  measured: boolean;
  /** Size and anchor (the point the box is positioned by) in CSS pixels. */
  w: number;
  h: number;
  ax: number;
  ay: number;
  tx: number;
  ty: number;
}

/**
 * DOM labels over the canvas: small text for landmarks and clickable markers for
 * hotspots. One element is created per item and reused; styles are only written when a
 * value changes. Text always goes through textContent.
 */
export class LabelLayer {
  readonly el: HTMLDivElement;
  private entries: Entry[] = [];
  private selected: string | undefined;
  private lastSize = "";
  private readonly scratch = new THREE.Vector3();

  constructor(
    parent: HTMLElement,
    private readonly onActivate: (id: string) => void,
  ) {
    this.el = document.createElement("div");
    this.el.className = "labels";
    parent.prepend(this.el);
  }

  setItems(items: readonly LabelItem[]): void {
    for (const e of this.entries) e.el.remove();
    this.entries = items.map((item) => this.createEntry(item));
    this.el.append(...this.entries.map((e) => e.el));
    this.applySelected();
  }

  /** Highlight (and keep on screen) one item, or none. */
  setSelected(id: string | undefined): void {
    this.selected = id;
    this.applySelected();
  }

  update(
    camera: THREE.Camera,
    widthPx: number,
    heightPx: number,
    visibleKinds: ReadonlySet<string>,
  ): void {
    const size = `${widthPx}x${heightPx}`;
    if (size !== this.lastSize) {
      // A resize can change fonts via media queries: measure again.
      this.lastSize = size;
      for (const e of this.entries) e.measured = false;
    }
    camera.updateMatrixWorld();

    const candidates: DeclutterItem[] = [];
    const byId = new Map<string, Entry>();
    for (const e of this.entries) {
      if (!visibleKinds.has(e.item.kind)) continue;
      const p = projectToScreen(this.scratch.set(e.item.x, e.item.y, e.item.z), camera, widthPx, heightPx);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      // Cheap anchor test first, so off-screen items are never measured.
      if (
        p.x < -200 ||
        p.x > widthPx + 200 ||
        p.y < -100 ||
        p.y > heightPx + 100
      ) {
        continue;
      }
      this.measure(e);
      const x = Math.round(p.x - e.ax);
      const y = Math.round(p.y - e.ay);
      if (x > widthPx + CULL_MARGIN_PX || y > heightPx + CULL_MARGIN_PX || x + e.w < -CULL_MARGIN_PX || y + e.h < -CULL_MARGIN_PX) {
        continue;
      }
      e.tx = x;
      e.ty = y;
      byId.set(e.item.id, e);
      candidates.push({
        id: e.item.id,
        x,
        y,
        w: e.w,
        h: e.h,
        priority: e.item.priority + (e.item.id === this.selected ? SELECTED_BOOST : 0),
      });
    }
    const keep = declutter(candidates, LABEL_PADDING_PX);

    for (const e of this.entries) {
      const show = keep.has(e.item.id) && byId.has(e.item.id);
      if (show) {
        e.el.style.transform = `translate(${e.tx}px, ${e.ty}px)`;
        if (!e.shown) e.el.hidden = false;
      } else if (e.shown) {
        e.el.hidden = true;
      }
      e.shown = show;
    }
  }

  dispose(): void {
    this.el.remove();
    this.entries = [];
  }

  private createEntry(item: LabelItem): Entry {
    let el: HTMLElement;
    let dot: HTMLElement | null = null;
    if (item.kind === "hotspot") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "marker";
      button.setAttribute("aria-label", `Hotspot: ${item.text}`);
      dot = document.createElement("span");
      dot.className = "marker__dot";
      dot.setAttribute("aria-hidden", "true");
      const name = document.createElement("span");
      name.className = "marker__name";
      name.setAttribute("aria-hidden", "true");
      name.textContent = item.text;
      button.append(dot, name);
      button.addEventListener("click", () => this.onActivate(item.id));
      el = button;
    } else if (item.kind === "village") {
      // A clickable name (no marker: the disc on the map is the symbol).
      const button = document.createElement("button");
      button.type = "button";
      button.className = "village-label";
      button.setAttribute("aria-label", `Village site: ${item.text}`);
      button.textContent = item.text;
      button.addEventListener("click", () => this.onActivate(item.id));
      el = button;
    } else {
      el = document.createElement("span");
      el.className = "label";
      el.setAttribute("aria-hidden", "true");
      el.textContent = item.text;
    }
    el.hidden = true;
    return { item, el, dot, shown: false, measured: false, w: 0, h: 0, ax: 0, ay: 0, tx: 0, ty: 0 };
  }

  /** Read the element's size once (it must be visible to have one). */
  private measure(e: Entry): void {
    if (e.measured) return;
    const wasHidden = e.el.hidden;
    if (wasHidden) {
      e.el.style.transform = "translate(-9999px, -9999px)";
      e.el.hidden = false;
    }
    e.w = e.el.offsetWidth;
    e.h = e.el.offsetHeight;
    if (e.dot) {
      // The dot, not the box, sits on the map point.
      e.ax = e.dot.offsetLeft + e.dot.offsetWidth / 2;
      e.ay = e.h / 2;
    } else {
      e.ax = e.w / 2;
      e.ay = e.h + 4; // just above the point
    }
    if (wasHidden) e.el.hidden = true;
    e.measured = true;
  }

  private applySelected(): void {
    for (const e of this.entries) {
      const on = e.item.id === this.selected;
      e.el.classList.toggle("is-selected", on);
      if (on) e.el.setAttribute("aria-current", "true");
      else e.el.removeAttribute("aria-current");
    }
  }
}
