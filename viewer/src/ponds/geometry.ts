import * as THREE from "three";
import type { Pond } from "./types";

/**
 * Metres the water surface floats above `level_m`. The pipeline carves the bed below the
 * level, so this only has to beat depth-buffer precision where the bed meets the surface at
 * the shore (a sliver of terrain at exactly the water level would otherwise flicker).
 */
export const POND_SURFACE_LIFT_M = 0.05;
/** Rings enclosing less than this (square metres) are treated as degenerate and skipped. */
export const MIN_RING_AREA_M2 = 1e-6;

/**
 * Signed area of a flat [x0, z0, x1, z1, ...] ring in the x/z plane (shoelace formula,
 * relative to the first point so far-from-origin coordinates do not lose precision).
 * A repeated closing point adds nothing. The sign only tells the winding; callers that
 * care about size use the absolute value.
 */
export function ringArea(ring: readonly number[]): number {
  const n = ring.length / 2;
  if (n < 3) return 0;
  const ox = ring[0];
  const oz = ring[1];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[2 * i] - ox;
    const az = ring[2 * i + 1] - oz;
    const bx = ring[2 * j] - ox;
    const bz = ring[2 * j + 1] - oz;
    sum += ax * bz - bx * az;
  }
  return sum / 2;
}

const isDegenerate = (ring: readonly number[] | undefined) =>
  !ring || ring.length < 6 || Math.abs(ringArea(ring)) < MIN_RING_AREA_M2;

/**
 * Shape points for a ring. ShapeGeometry lays the shape in the x/y plane, and the
 * rotation below (rotateX(-90 degrees)) sends shape y to world -z, so z is negated here
 * to land on the right world z (+z south). Without the negation the pond would be mirrored
 * north to south.
 */
function shapePoints(ring: readonly number[]): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i + 1 < ring.length; i += 2) pts.push(new THREE.Vector2(ring[i], -ring[i + 1]));
  return pts;
}

/**
 * Flat triangulated water surface for one pond at y = (level_m + POND_SURFACE_LIFT_M) *
 * exaggeration, in world coordinates (the mesh needs no transform). Triangulated with
 * three's earcut: rings[0] is the outline, rings[1..] are holes; winding does not matter.
 * Positions and normals only (+y); no uv.
 *
 * A hole with no area is skipped. Returns null when the outer ring has no area or nothing
 * could be triangulated. Both are reported through `report` (when given) instead of thrown, so one bad
 * pond cannot take the rest down.
 */
export function buildPondGeometry(
  pond: Pond,
  exaggeration: number,
  report?: (message: string) => void,
): THREE.BufferGeometry | null {
  if (!Number.isFinite(exaggeration)) throw new Error(`pond geometry: exaggeration must be finite, got ${exaggeration}`);
  const outer = pond.rings[0];
  if (isDegenerate(outer)) {
    report?.(`pond "${pond.id}": outer ring is degenerate (no area); pond skipped`);
    return null;
  }
  const shape = new THREE.Shape(shapePoints(outer));
  for (let j = 1; j < pond.rings.length; j++) {
    const hole = pond.rings[j];
    if (isDegenerate(hole)) {
      report?.(`pond "${pond.id}": hole ${j} is degenerate (no area); hole skipped`);
      continue;
    }
    shape.holes.push(new THREE.Path(shapePoints(hole)));
  }
  const geometry = new THREE.ShapeGeometry(shape);
  if (!geometry.getIndex() || geometry.getIndex()!.count === 0) {
    geometry.dispose();
    report?.(`pond "${pond.id}": triangulation produced no triangles; pond skipped`);
    return null;
  }
  geometry.rotateX(-Math.PI / 2); // shape (x, -z, 0) -> world (x, 0, z); normal +z -> +y
  geometry.translate(0, (pond.level_m + POND_SURFACE_LIFT_M) * exaggeration, 0);
  geometry.deleteAttribute("uv"); // unused by the water shader
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}
