/**
 * Shared low-poly plant shapes, one per species in species.ts (built once, drawn as
 * instances), and the per-instance colour variation. Shapes are unit sized and scaled per
 * instance by placement.ts according to the plant kind:
 *   tree kind  (oak, bay, willow)      - height 1, scale = height in metres
 *   shrub kind (coyote-brush, lupine)  - radius about 1, scale = radius in metres
 *   reed kind  (tule, marsh-reed)      - height 1, scale = clump height in metres
 * Vertex colours are LINEAR (like the terrain's), so the sRGB hex values go through
 * srgbToLinear. They are illustrative shapes, not botanical models.
 */
import * as THREE from "three";
import { srgbToLinear } from "../habitat";
import type { Species } from "./species";

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
// Each species gets its own leaf colour so mixed stands (oak with bay) read as two plants.
export const VEG_COLORS = {
  trunk: 0x6b4a2f,
  oak: 0x30492a, // coast live oak: dark, slightly blue-green evergreen leaves
  bay: 0x6e8538, // California bay laurel: brighter yellow-green, sets it apart from oak
  willow: 0x5a6e40, // arroyo willow: grey olive, darker than the pale wetland ground
  coyoteBrush: 0x5f7a38,
  lupine: 0x8a9775, // bush lupine: silvery grey-green
  tule: 0x52693a,
  reed: 0x8c6d2c, // salt marsh in late summer: tawny
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

export type VegetationGeometries = Record<Species, THREE.BufferGeometry>;

/**
 * A rounded leaf mass: an icosahedron (20 faces) squashed to radii (rx, ry, rz) and centred
 * at (x, y, z), turned by `turn` radians about +y so neighbouring lobes do not line up.
 */
function lobe(rx: number, ry: number, rz: number, x: number, y: number, z: number, turn = 0) {
  return new THREE.IcosahedronGeometry(1, 0).scale(rx, ry, rz).rotateY(turn).translate(x, y, z);
}

/** Open (capless) 5-sided trunk from y0 to y1: the caps are never seen. 10 faces. */
function trunk(rTop: number, rBottom: number, y0: number, y1: number, x = 0, z = 0, lean = 0) {
  return new THREE.CylinderGeometry(rTop, rBottom, y1 - y0, 5, 1, true)
    .translate(0, (y1 - y0) / 2, 0)
    .rotateZ(lean)
    .translate(x, y0, z);
}

/** Uniformly rescale so the top of the geometry is exactly y = 1 (unit height shapes). */
function toUnitHeight(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeBoundingBox();
  const top = g.boundingBox!.max.y;
  if (top > 0) g.scale(1 / top, 1 / top, 1 / top);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * Coast live oak (height 1): a short trunk under a broad, lumpy dome that is wider than it
 * is tall, the shape that sets oak woodland apart from the conifers planted much later.
 */
function oak(): THREE.BufferGeometry {
  const leaf = hexToLinear(VEG_COLORS.oak);
  return toUnitHeight(
    mergeGeometries([
      { geometry: trunk(0.05, 0.075, -0.08, 0.36), color: hexToLinear(VEG_COLORS.trunk) },
      { geometry: lobe(0.5, 0.36, 0.46, -0.04, 0.64, 0), color: leaf },
      { geometry: lobe(0.32, 0.24, 0.3, 0.34, 0.54, 0.16, 0.6), color: leaf },
      { geometry: lobe(0.3, 0.22, 0.32, -0.26, 0.5, -0.2, 1.1), color: leaf },
    ]),
  );
}

/** California bay laurel (height 1): a denser, taller oval crown on a short trunk. */
function bay(): THREE.BufferGeometry {
  const leaf = hexToLinear(VEG_COLORS.bay);
  return toUnitHeight(
    mergeGeometries([
      { geometry: trunk(0.04, 0.06, -0.08, 0.3), color: hexToLinear(VEG_COLORS.trunk) },
      { geometry: lobe(0.32, 0.4, 0.3, 0, 0.56, 0), color: leaf },
      { geometry: lobe(0.22, 0.22, 0.22, 0.05, 0.84, 0.03, 0.7), color: leaf },
    ]),
  );
}

/**
 * Arroyo willow (height 1): a many-stemmed thicket that rises straight from the ground (no
 * single trunk) into a broad, uneven, pale crown; about as wide as it is tall.
 */
function willow(): THREE.BufferGeometry {
  const leaf = hexToLinear(VEG_COLORS.willow);
  return toUnitHeight(
    mergeGeometries([
      { geometry: lobe(0.34, 0.42, 0.32, 0, 0.5, 0), color: leaf },
      { geometry: lobe(0.26, 0.32, 0.26, 0.3, 0.34, 0.12, 0.5), color: leaf },
      { geometry: lobe(0.26, 0.3, 0.24, -0.28, 0.32, -0.14, 1.0), color: leaf },
    ]),
  );
}

/**
 * Coyote brush (radius 1, like the old shrub): a low irregular mound, a main mass with a
 * smaller one leaning off it, sunk a little so the bottom hides in the ground.
 */
function coyoteBrush(): THREE.BufferGeometry {
  const leaf = hexToLinear(VEG_COLORS.coyoteBrush);
  return mergeGeometries([
    { geometry: lobe(0.82, 0.5, 0.78, -0.14, 0.32, 0), color: leaf },
    { geometry: new THREE.OctahedronGeometry(1, 0).scale(0.5, 0.42, 0.5).translate(0.5, 0.26, 0.18), color: leaf },
  ]);
}

/** Bush lupine (radius 1): one rounder, silvery mound. */
function lupine(): THREE.BufferGeometry {
  return mergeGeometries([
    { geometry: lobe(0.92, 0.62, 0.92, 0, 0.36, 0, 0.4), color: hexToLinear(VEG_COLORS.lupine) },
  ]);
}

/** n thin 3-sided blades of heights hs, fanned around the clump centre. */
function blades(hs: readonly number[], spread: number, radius: number, hex: number) {
  const c = hexToLinear(hex);
  return hs.map((h, i) => {
    const a = (i / hs.length) * Math.PI * 2;
    const r = i === 0 ? 0 : spread;
    return {
      geometry: new THREE.ConeGeometry(radius, h, 3, 1, true)
        .translate(0, h / 2, 0)
        .rotateZ(r === 0 ? 0 : 0.14 * Math.cos(a))
        .rotateX(r === 0 ? 0 : 0.14 * Math.sin(a))
        .translate(r * Math.cos(a), 0, r * Math.sin(a)),
      color: c,
    };
  });
}

/** Tule (height 1): a dense clump of tall straight dark-green stems. */
function tule(): THREE.BufferGeometry {
  return mergeGeometries(blades([1, 0.9, 0.85, 0.95, 0.8, 0.88], 0.12, 0.045, VEG_COLORS.tule));
}

/** Salt marsh plants (height 1): the old reed clump, three tawny tapered blades. */
function marshReed(): THREE.BufferGeometry {
  const blade = (h: number, x: number, z: number, lean: number) =>
    new THREE.ConeGeometry(0.05, h, 4).translate(0, h / 2, 0).rotateZ(lean).translate(x, 0, z);
  const c = hexToLinear(VEG_COLORS.reed);
  return mergeGeometries([
    { geometry: blade(1, 0, 0, 0), color: c },
    { geometry: blade(0.8, 0.12, 0.06, -0.18), color: c },
    { geometry: blade(0.9, -0.1, -0.08, 0.2), color: c },
  ]);
}

export function makeVegetationGeometries(): VegetationGeometries {
  return {
    oak: oak(),
    bay: bay(),
    willow: willow(),
    "coyote-brush": coyoteBrush(),
    lupine: lupine(),
    tule: tule(),
    "marsh-reed": marshReed(),
  };
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
