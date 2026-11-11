import * as THREE from "three";

/** True isometric: 45 degrees round, looking down at atan(1/sqrt(2)) (about 35.26 deg). */
export const ISO_AZIMUTH = Math.PI / 4;
export const ISO_ELEVATION = Math.atan(1 / Math.SQRT2);

/** Camera offset from its target. Azimuth 0 puts the camera due south of the target. */
export function isoOffset(distance: number, azimuth: number, elevation: number): THREE.Vector3 {
  return new THREE.Vector3(
    distance * Math.cos(elevation) * Math.sin(azimuth),
    distance * Math.sin(elevation),
    distance * Math.cos(elevation) * Math.cos(azimuth),
  );
}

/**
 * How far the camera target moves on the ground for a mouse drag of (dx, dy) pixels,
 * so the terrain appears to follow the cursor.
 */
export function panDelta(
  dx: number,
  dy: number,
  unitsPerPixel: number,
  azimuth: number,
  elevation: number,
): THREE.Vector3 {
  const right = new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth));
  const forward = new THREE.Vector3(-Math.sin(azimuth), 0, -Math.cos(azimuth));
  // A ground distance d along `forward` shows up on screen as d * sin(elevation).
  const forwardScale = 1 / Math.sin(elevation);
  return right
    .multiplyScalar(-dx * unitsPerPixel)
    .add(forward.multiplyScalar(dy * unitsPerPixel * forwardScale));
}

export function createIsoCamera(viewSize: number, aspect: number): THREE.OrthographicCamera {
  const half = viewSize / 2;
  // Huge near/far: an orthographic camera does not care, and the terrain is tall.
  return new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, -1e5, 1e5);
}

/**
 * Orthographic view HEIGHT (world units) that fits the whole map in the isometric view,
 * with a 10% margin. The map's footprint is projected at azimuth 45 degrees: its
 * horizontal screen extent is (width + depth) / sqrt(2); vertically that footprint is
 * foreshortened by sin(elevation) and the tallest terrain adds height * cos(elevation).
 * The result is the larger of the vertical need and the horizontal need divided by aspect.
 */
export function fitViewSize(
  widthM: number,
  depthM: number,
  maxHeightM: number,
  aspect: number,
): number {
  const horizontalExtent = (widthM + depthM) / Math.SQRT2;
  const verticalExtent =
    ((widthM + depthM) / Math.SQRT2) * Math.sin(ISO_ELEVATION) +
    maxHeightM * Math.cos(ISO_ELEVATION);
  return Math.max(verticalExtent, horizontalExtent / aspect) * 1.1;
}
