import { drapePolyline, type HeightAt } from "../overlay/drape";

export interface RibbonOptions {
  /** Ground height in metres, NOT exaggerated. */
  heightAt: HeightAt;
  waterLevelM: number;
  /** Horizontal width of the ribbon, metres. */
  widthM: number;
  /** Longest horizontal distance between draped centre-line points, metres. */
  stepM: number;
  /** Metres above max(ground, water), before the exaggeration. */
  liftM: number;
  exaggeration: number;
}

export interface RibbonMesh {
  /** Flat [x, y, z, ...], y already exaggerated. */
  positions: Float32Array;
  indices: Uint32Array;
}

/**
 * A flat ribbon along each polyline, draped over the terrain. Each line is subdivided with
 * drapePolyline (so it follows the relief), then every centre-line point gets a left and a right
 * vertex half a width away, perpendicular to the line there (the direction is averaged over the
 * neighbouring segments, so a bend does not open a gap). Every vertex sits at
 * (max(ground, water) + lift) * exaggeration, so it is above ground and above the sea. Lines with
 * fewer than two distinct points are skipped. Deterministic; triangles are drawn double-sided.
 */
export function buildRibbons(lines: readonly (readonly number[])[], o: RibbonOptions): RibbonMesh {
  if (!(o.widthM > 0) || !Number.isFinite(o.widthM)) throw new RangeError(`widthM must be > 0, got ${o.widthM}`);
  const half = o.widthM / 2;
  const positions: number[] = [];
  const indices: number[] = [];

  for (const line of lines) {
    const draped = drapePolyline(line as number[], o.heightAt, o.stepM);
    const xs: number[] = [];
    const zs: number[] = [];
    for (let i = 0; i + 2 < draped.length; i += 3) {
      // Drop a point that repeats the previous one: it has no direction.
      if (xs.length > 0 && draped[i] === xs[xs.length - 1] && draped[i + 2] === zs[zs.length - 1]) continue;
      xs.push(draped[i]);
      zs.push(draped[i + 2]);
    }
    if (xs.length < 2) continue;

    const base = positions.length / 3;
    for (let i = 0; i < xs.length; i++) {
      const prev = Math.max(0, i - 1);
      const next = Math.min(xs.length - 1, i + 1);
      let tx = xs[next] - xs[prev];
      let tz = zs[next] - zs[prev];
      const len = Math.hypot(tx, tz) || 1;
      tx /= len;
      tz /= len;
      const nx = -tz * half;
      const nz = tx * half;
      for (const side of [1, -1]) {
        const x = xs[i] + nx * side;
        const z = zs[i] + nz * side;
        positions.push(x, (Math.max(o.heightAt(x, z), o.waterLevelM) + o.liftM) * o.exaggeration, z);
      }
    }
    for (let i = 0; i + 1 < xs.length; i++) {
      const a = base + 2 * i;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}
