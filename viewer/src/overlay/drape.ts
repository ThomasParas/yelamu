import * as THREE from "three";

export type HeightAt = (x: number, z: number) => number;

/**
 * At most this many points are inserted into any one segment. Real streets are metres to
 * a few kilometres long (a 3 km segment at a 10 m step needs 300), but the overlay file is
 * untrusted: without a cap one segment of a few hundred kilometres would allocate
 * billions of points. Beyond the cap the segment is simply sampled more coarsely.
 */
export const MAX_INSERTED_PER_SEGMENT = 2000;

/**
 * Subdivide a flat [x0, z0, x1, z1, ...] polyline so that consecutive points are at most
 * `stepM` apart horizontally, and read each point's height from `heightAt`. Returns a
 * flat [x, y, z, ...] array (original vertices are kept exactly). A trailing unpaired
 * value is ignored; fewer than one point gives []. A segment gets at most
 * MAX_INSERTED_PER_SEGMENT inserted points (coarser than `stepM` beyond that).
 */
export function drapePolyline(points: number[], heightAt: HeightAt, stepM: number): number[] {
  if (!(stepM > 0) || !Number.isFinite(stepM)) throw new RangeError(`stepM must be > 0, got ${stepM}`);
  const n = Math.floor(points.length / 2);
  const out: number[] = [];
  if (n < 1) return out;
  let px = points[0];
  let pz = points[1];
  out.push(px, heightAt(px, pz), pz);
  for (let i = 1; i < n; i++) {
    const x = points[2 * i];
    const z = points[2 * i + 1];
    const wanted = Math.max(1, Math.ceil(Math.hypot(x - px, z - pz) / stepM - 1e-9));
    const parts = Math.min(wanted, MAX_INSERTED_PER_SEGMENT + 1);
    for (let k = 1; k < parts; k++) {
      const t = k / parts;
      const sx = px + (x - px) * t;
      const sz = pz + (z - pz) * t;
      out.push(sx, heightAt(sx, sz), sz);
    }
    out.push(x, heightAt(x, z), z);
    px = x;
    pz = z;
  }
  return out;
}

/**
 * Positions for THREE.LineSegments: every polyline is draped (see drapePolyline) and cut
 * into pairs of consecutive points, so a draped line of k points contributes 2 * (k - 1)
 * vertices. y = (height + liftM) * exaggeration, i.e. in the same scaled frame as the
 * terrain mesh; liftM keeps the line above the coarse terrain. No lines gives an empty
 * geometry.
 */
export function buildSegmentGeometry(
  lines: number[][],
  heightAt: HeightAt,
  stepM: number,
  exaggeration: number,
  liftM: number,
): THREE.BufferGeometry {
  const draped = lines.map((l) => drapePolyline(l, heightAt, stepM));
  let segments = 0;
  for (const d of draped) segments += Math.max(0, d.length / 3 - 1);
  const positions = new Float32Array(segments * 6);
  let o = 0;
  for (const d of draped) {
    const count = d.length / 3;
    for (let i = 0; i + 1 < count; i++) {
      for (const j of [i, i + 1]) {
        positions[o++] = d[3 * j];
        positions[o++] = (d[3 * j + 1] + liftM) * exaggeration;
        positions[o++] = d[3 * j + 2];
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
