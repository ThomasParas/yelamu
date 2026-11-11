import * as THREE from "three";
import { ISO_AZIMUTH, ISO_ELEVATION, isoOffset, panDelta } from "./camera";

const CAMERA_DISTANCE = 20000;

/** Drag to pan, wheel / pinch to zoom. Keeps the isometric angle fixed. */
export function attachControls(
  canvas: HTMLCanvasElement,
  camera: THREE.OrthographicCamera,
  onChange: () => void,
): { target: THREE.Vector3; place: () => void } {
  const target = new THREE.Vector3();
  const offset = isoOffset(CAMERA_DISTANCE, ISO_AZIMUTH, ISO_ELEVATION);

  const place = () => {
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    onChange();
  };

  const unitsPerPixel = () => (camera.top - camera.bottom) / camera.zoom / canvas.clientHeight;

  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart = 0;
  let zoomStart = 1;

  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      pinchStart = pinchDistance();
      zoomStart = camera.zoom;
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, next);
    if (pointers.size === 1) {
      target.add(
        panDelta(next.x - prev.x, next.y - prev.y, unitsPerPixel(), ISO_AZIMUTH, ISO_ELEVATION),
      );
    } else if (pointers.size === 2 && pinchStart > 0) {
      camera.zoom = THREE.MathUtils.clamp((zoomStart * pinchDistance()) / pinchStart, 0.3, 40);
    }
    place();
  });

  const release = (e: PointerEvent) => pointers.delete(e.pointerId);
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * Math.exp(-e.deltaY * 0.0015), 0.3, 40);
      place();
    },
    { passive: false },
  );

  return { target, place };
}
