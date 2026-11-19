import * as THREE from "three";
import type { AppContext } from "./appContext";
import { GROUP_COLORS } from "./habitat";
import { describeHabitat, groundHit, habitatIdAt, isTap, type IdentifyGrid } from "./identify";
import { hexToCss } from "./legendEntries";
import { patternNameForGroup } from "./habitatPatterns";
import { projectToScreen } from "./overlay/labels";

/**
 * Tap (or click) the ground to see which habitat is there: a small card pinned to the point,
 * also announced to screen readers. Another tap moves it, a tap off the mapped grid or Escape
 * closes it. Drags, pinches and long presses are left to the camera controls.
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
  text.append(title, detail);
  card.append(swatch, text);
  layer.append(card);

  let pinned: THREE.Vector3 | null = null;
  const scratch = new THREE.Vector3();

  const place = () => {
    if (!pinned) return;
    const p = projectToScreen(scratch.copy(pinned), camera, canvas.clientWidth, canvas.clientHeight);
    card.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
  };
  ctx.onFrame(place);

  const close = () => {
    if (!pinned) return false;
    pinned = null;
    card.hidden = true;
    return true;
  };
  const prevEscape = ctx.handlers.escape;
  ctx.handlers.escape = () => {
    if (!close()) prevEscape();
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
    swatch.className = `swatch identify__swatch swatch--${patternNameForGroup(what.group)}`;
    swatch.style.backgroundColor = hexToCss(GROUP_COLORS[what.group] ?? GROUP_COLORS.unmapped);
    pinned = new THREE.Vector3(hit.x, hit.y, hit.z);
    card.hidden = false;
    place();
    shell.announce(what.detail ? `${what.title}, ${what.detail}` : what.title);
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
