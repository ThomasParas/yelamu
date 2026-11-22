import * as THREE from "three";
import type { AppContext } from "./appContext";
import { GROUP_COLORS } from "./habitat";
import { clampCard, describeHabitat, groundHit, habitatIdAt, isTap, type IdentifyGrid } from "./identify";
import { hexToCss } from "./legendEntries";
import { patternNameForGroup } from "./habitatPatterns";
import { projectToScreen } from "./overlay/labels";

/**
 * Tap (or click) the ground to see which habitat is there: a small card pinned to the point,
 * also announced to screen readers. Another tap moves it; its close button, a tap off the
 * mapped grid or Escape closes it. Drags, pinches and long presses are left to the camera controls.
 */
export const identifyModule = (ctx: AppContext) => {
  const { habitat, meta, canvas, camera, shell } = ctx;
  if (!habitat) return;
  const classes = meta.habitat_classes ?? [];
  const grid: IdentifyGrid = {
    heights: ctx.heights,
    width: meta.width,
    height: meta.height,
    cellM: meta.cell_m,
    exaggeration: ctx.verticalExaggeration,
    waterLevelM: meta.water_level_m,
    minM: meta.min_m,
    maxM: meta.max_m,
  };

  const layer = document.createElement("div");
  layer.className = "identify";
  // Right after the map labels: painted over them, still under the toolbar and panels.
  const labels = shell.root.querySelector(":scope > .labels");
  if (labels) labels.after(layer);
  else shell.root.prepend(layer);
  const card = document.createElement("div");
  card.className = "identify__card";
  card.hidden = true;
  const swatch = document.createElement("span");
  swatch.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.className = "identify__text";
  const title = document.createElement("strong");
  const detail = document.createElement("span");
  detail.className = "identify__detail";
  const note = document.createElement("span");
  note.className = "identify__detail identify__note";
  text.append(title, detail, note);
  // The only part of the card that takes pointer input: the rest lets drags reach the map.
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "identify__close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.title = "Close (Esc)";
  const glyph = document.createElement("span");
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = "×";
  closeBtn.append(glyph);
  card.append(swatch, text, closeBtn);
  layer.append(card);

  let pinned: THREE.Vector3 | null = null;
  const scratch = new THREE.Vector3();

  // Card size and the toolbar's bottom edge, measured when the card is filled and on resize
  // (not every frame: reading layout right after moving the card would force a reflow).
  const size = { w: 0, h: 0, top: 0 };
  const topbar = shell.root.querySelector(".topbar");
  const measure = () => {
    size.w = card.offsetWidth;
    size.h = card.offsetHeight;
    size.top = topbar ? topbar.getBoundingClientRect().bottom : 0;
  };
  const place = () => {
    if (!pinned) return;
    const vw = canvas.clientWidth;
    const vh = canvas.clientHeight;
    const p = projectToScreen(scratch.copy(pinned), camera, vw, vh);
    const { shiftX, below } = clampCard({ x: p.x, y: p.y, w: size.w, h: size.h, vw, vh, top: size.top });
    card.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    card.style.setProperty("--shift-x", `${shiftX.toFixed(1)}px`);
    card.toggleAttribute("data-below", below);
  };
  window.addEventListener("resize", () => {
    if (!pinned) return;
    fitText();
    measure();
    place();
  });
  ctx.onFrame(place);

  const close = () => {
    if (!pinned) return false;
    pinned = null;
    // Focus on the close button would be lost with the card: hand it back to the map.
    const hadFocus = card.contains(document.activeElement);
    card.hidden = true;
    if (hadFocus) canvas.focus({ preventScroll: true });
    return true;
  };
  closeBtn.addEventListener("click", () => void close());
  const prevEscape = ctx.handlers.escape;
  ctx.handlers.escape = () => {
    if (!close()) prevEscape();
  };

  // A wrapped name keeps its box as wide as the space it was offered, not as its longest
  // line, which leaves a gap before the close button. Measure the lines and shrink to them.
  const range = document.createRange();
  const fitText = () => {
    text.style.width = "";
    let left = Infinity;
    let right = -Infinity;
    // The text nodes only: a range over the elements would also return their full-width boxes.
    for (const el of [title, detail, note]) {
      if (el.hidden || !el.firstChild) continue;
      range.selectNodeContents(el.firstChild);
      for (const r of range.getClientRects()) {
        left = Math.min(left, r.left);
        right = Math.max(right, r.right);
      }
    }
    if (right > left) text.style.width = `${Math.ceil(right - left)}px`;
  };

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const identifyAt = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    const hit = groundHit(grid, raycaster.ray.origin, raycaster.ray.direction);
    const id = hit && habitatIdAt(grid, habitat, hit.x, hit.z);
    if (!hit || id === null) {
      close();
      return;
    }
    const what = describeHabitat(classes, id);
    title.textContent = what.title;
    detail.textContent = what.detail;
    detail.hidden = !what.detail;
    note.textContent = what.note ?? "";
    note.hidden = !what.note;
    swatch.className = `swatch identify__swatch swatch--${patternNameForGroup(what.group)}`;
    swatch.style.backgroundColor = hexToCss(GROUP_COLORS[what.group] ?? GROUP_COLORS.unmapped);
    pinned = new THREE.Vector3(hit.x, hit.y, hit.z);
    card.hidden = false;
    fitText();
    measure();
    place();
    shell.announce([what.title, what.detail, what.note].filter(Boolean).join(", "));
  };

  // Tap detection alongside the camera controls (which keep their own listeners).
  const down = new Map<number, { x: number; y: number; t: number }>();
  let maxPointers = 0;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (down.size === 0) maxPointers = 0;
    down.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    maxPointers = Math.max(maxPointers, down.size);
  });
  const release = (e: PointerEvent, cancelled: boolean) => {
    const start = down.get(e.pointerId);
    down.delete(e.pointerId);
    if (!start || cancelled) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (isTap(dx * dx + dy * dy, performance.now() - start.t, maxPointers)) identifyAt(e.clientX, e.clientY);
  };
  canvas.addEventListener("pointerup", (e) => release(e, false));
  canvas.addEventListener("pointercancel", (e) => release(e, true));
};
