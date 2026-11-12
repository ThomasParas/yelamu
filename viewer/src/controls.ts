import * as THREE from "three";
import { keyAction } from "./keys";
import { unitsPerPixel, type ViewRig } from "./viewRig";

/** Wheel zoom feel: the zoom factor is exp(-deltaY * WHEEL_ZOOM_RATE). */
const WHEEL_ZOOM_RATE = 0.0015;
/** Zoom factor of one + / - key press. */
export const KEY_ZOOM_FACTOR = 1.25;
/** Holding Shift multiplies an arrow-key pan step by this. */
const SHIFT_PAN_MULTIPLIER = 3;

/**
 * Drag to pan, wheel / two-finger pinch to zoom, all through the ViewRig (which clamps,
 * places the camera and notifies). Returns a function that removes the listeners.
 */
export function attachPointerControls(
  canvas: HTMLCanvasElement,
  camera: THREE.OrthographicCamera,
  rig: ViewRig,
): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart = 0;
  let zoomStart = 1;

  const upp = () => unitsPerPixel(camera, canvas.clientHeight);

  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const rebasePinch = () => {
    pinchStart = pinchDistance();
    zoomStart = rig.getState().zoom;
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) rebasePinch();
  };

  const onMove = (e: PointerEvent) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    if (e.pointerType === "mouse" && e.buttons === 0) {
      // The button was released outside the window; treat the drag as over.
      pointers.delete(e.pointerId);
      return;
    }
    const next = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, next);
    if (pointers.size === 1) {
      rig.panBy(next.x - prev.x, next.y - prev.y, upp());
    } else if (pointers.size === 2 && pinchStart > 0) {
      rig.setState({ zoom: (zoomStart * pinchDistance()) / pinchStart });
    }
  };

  const onRelease = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 2) {
      // A third finger lifted: restart the pinch from the two that remain.
      rebasePinch();
    } else if (pointers.size < 2) {
      pinchStart = 0;
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    // deltaMode 1 = lines, 2 = pages (Firefox mouse wheels); normalise to pixels.
    const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
    rig.zoomBy(Math.exp(-e.deltaY * px * WHEEL_ZOOM_RATE));
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onRelease);
  canvas.addEventListener("pointercancel", onRelease);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onRelease);
    canvas.removeEventListener("pointercancel", onRelease);
    canvas.removeEventListener("wheel", onWheel);
  };
}

export interface KeyboardHandlers {
  onSearch(): void;
  onHelp(): void;
  onEscape(): void;
  /** Screen pixels an arrow key press pans by (Shift = 3x). */
  panStepPx: number;
}

/**
 * Keyboard shortcuts (see keys.ts). Arrow keys pan and + / - zoom (both may auto-repeat);
 * Q / E rotate, H resets, / searches, ? shows help, Escape escapes. preventDefault is
 * called only for keys that were handled. Returns a function that removes the listener.
 */
export function attachKeyboard(
  root: HTMLElement | Window,
  rig: ViewRig,
  handlers: KeyboardHandlers,
  getUnitsPerPixel: () => number,
): () => void {
  const onKeyDown = (event: Event) => {
    const e = event as KeyboardEvent;
    if (e.defaultPrevented) return;
    const action = keyAction({
      key: e.key,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
      target: e.target as HTMLElement | null,
    });
    if (!action) return;
    const oneShot = action.type !== "pan" && action.type !== "zoom";
    if (oneShot && e.repeat) {
      e.preventDefault();
      return;
    }
    switch (action.type) {
      case "pan": {
        const step = handlers.panStepPx * (e.shiftKey ? SHIFT_PAN_MULTIPLIER : 1);
        // The action is where the VIEW moves; panBy takes a drag, which is the opposite.
        rig.panBy(-action.dx * step, -action.dy * step, getUnitsPerPixel());
        break;
      }
      case "zoom":
        rig.zoomBy(action.dir > 0 ? KEY_ZOOM_FACTOR : 1 / KEY_ZOOM_FACTOR);
        break;
      case "rotate":
        rig.rotate(action.dir);
        break;
      case "reset":
        rig.reset();
        break;
      case "search":
        handlers.onSearch();
        break;
      case "help":
        handlers.onHelp();
        break;
      case "escape":
        handlers.onEscape();
        return; // nothing to prevent: Escape has no default action we are replacing
    }
    e.preventDefault();
  };
  root.addEventListener("keydown", onKeyDown);
  return () => root.removeEventListener("keydown", onKeyDown);
}
