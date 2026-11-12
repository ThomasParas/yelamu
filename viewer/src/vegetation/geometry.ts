/**
 * Shared low-poly plant shapes (built once, drawn as instances) and the per-instance
 * colour variation. Shapes are unit sized and scaled per instance by placement.ts:
 *   tree  - height 1 (scale = height in metres): short brown trunk + green cone canopy
 *   shrub - radius 1 (scale = radius in metres): a squashed icosahedron
 *   reed  - height 1 (scale = clump height in metres): three thin tapered blades
 * Vertex colours are LINEAR (like the terrain's), so the sRGB hex values go through
 * srgbToLinear. They are illustrative shapes, not botanical models.
 */
import * as THREE from "three";
import { srgbToLinear } from "../habitat";

export type RGB = [number, number, number];

/** sRGB hex -> linear [r, g, b] for vertex colours. */
export function hexToLinear(hex: number): RGB {
  return [
    srgbToLinear(((hex >> 16) & 255) / 255),
    srgbToLinear(((hex >> 8) & 255) / 255),
    srgbToLinear((hex & 255) / 255),
  ];
}

// Chosen to stand out against the ground colours in habitat.ts (woodland 4f6b3f, scrub
// 8a9a5a, dune d8c58a, marsh 7fa06a, wetland 6f9a8a): darker or warmer than the ground.
export const VEG_COLORS = {
  trunk: 0x6b4a2f,
  canopy: 0x24502b,
  shrub: 0x5f7a38,
  reed: 0x8c6d2c,
} as const;

export interface GeometryPart {
  geometry: THREE.BufferGeometry;
  /** Linear vertex colour for the whole part. */
  color: RGB;
}

/**
 * Merge parts into one non-indexed geometry with position, normal and colour attributes
 * (flat-shaded faces, so the normals are per-face). Input geometries are not modified.
 * A minimal stand-in for BufferGeometryUtils.mergeGeometries that adds the colour.
 */
export function mergeGeometries(parts: readonly GeometryPart[]): THREE.BufferGeometry {
  const flat = parts.map(({ geometry, color }) => {
    const g = geometry.getIndex() ? geometry.toNonIndexed() : geometry.clone();
    g.computeVertexNormals();
    return { g, color };
  });
  const total = flat.reduce((n, p) => n + p.g.getAttribute("position").count, 0);
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const colour = new Float32Array(total * 3);
  let at = 0;
  for (const { g, color } of flat) {
    const pos = g.getAttribute("position");
    const nor = g.getAttribute("normal");
    for (let i = 0; i < pos.count; i++, at++) {
      position.set([pos.getX(i), pos.getY(i), pos.getZ(i)], at * 3);
      normal.set([nor.getX(i), nor.getY(i), nor.getZ(i)], at * 3);
      colour.set(color, at * 3);
    }
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colour, 3));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
export default mergeGeometries;

export interface VegetationGeometries {
  tree: THREE.BufferGeometry;
  shrub: THREE.BufferGeometry;
  reed: THREE.BufferGeometry;
}

function tree(): THREE.BufferGeometry {
  // trunk: y from -0.08 (a little below ground) to 0.22; canopy cone: y 0.18 .. 1
  const trunk = new THREE.CylinderGeometry(0.045, 0.06, 0.3, 5).translate(0, 0.07, 0);
  const canopy = new THREE.ConeGeometry(0.32, 0.82, 6).translate(0, 0.59, 0);
  return mergeGeometries([
    { geometry: trunk, color: hexToLinear(VEG_COLORS.trunk) },
    { geometry: canopy, color: hexToLinear(VEG_COLORS.canopy) },
  ]);
}

function shrub(): THREE.BufferGeometry {
  // radius 1, squashed to 0.6 high, sunk 0.15 so the bottom hides in the ground
  const blob = new THREE.IcosahedronGeometry(1, 0).scale(1, 0.6, 1).translate(0, 0.45, 0);
  return mergeGeometries([{ geometry: blob, color: hexToLinear(VEG_COLORS.shrub) }]);
}

function reed(): THREE.BufferGeometry {
  const blade = (h: number, x: number, z: number, lean: number) =>
    new THREE.ConeGeometry(0.05, h, 4)
      .translate(0, h / 2, 0)
      .rotateZ(lean)
      .translate(x, 0, z);
  const c = hexToLinear(VEG_COLORS.reed);
  return mergeGeometries([
    { geometry: blade(1, 0, 0, 0), color: c },
    { geometry: blade(0.8, 0.12, 0.06, -0.18), color: c },
    { geometry: blade(0.9, -0.1, -0.08, 0.2), color: c },
  ]);
}

export function makeVegetationGeometries(): VegetationGeometries {
  return { tree: tree(), shrub: shrub(), reed: reed() };
}

/** Lit like the terrain: flat shaded, colours from the vertices (times the instance tint). */
export function makeVegetationMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
}

/** Per-instance colour multipliers stay inside this band so the variation is slight. */
export const TINT_RANGE = { min: 0.78, max: 1.12 } as const;

// Per-group lean: [r, g, b] bias added to the random brightness (kept small).
const TINT_BIAS: Record<string, RGB> = {
  woodland: [-0.02, 0.02, -0.02],
  scrub: [0.02, 0.0, -0.03],
  grassland: [0.03, 0.01, -0.03],
  dune: [0.03, 0.0, -0.02],
  wetland: [-0.02, 0.01, 0.03],
  marsh: [0.03, 0.01, -0.02],
};

/**
 * Slight random colour variation for one instance: a shared brightness factor plus a
 * small per-channel wobble and a group bias. Returns multipliers for the vertex colour
 * (instanceColor x vertexColor), each within TINT_RANGE. Consumes 4 draws from `rng`.
 */
export function tintFor(group: string, rng: () => number): RGB {
  const bias = Object.hasOwn(TINT_BIAS, group) ? TINT_BIAS[group] : [0, 0, 0];
  const brightness = 0.86 + rng() * 0.2; // 0.86 .. 1.06
  const out: RGB = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const v = brightness + bias[c] + (rng() - 0.5) * 0.06;
    out[c] = Math.min(TINT_RANGE.max, Math.max(TINT_RANGE.min, v));
  }
  return out;
}
