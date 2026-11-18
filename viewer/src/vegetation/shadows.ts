/**
 * Contact shadows: a soft dark patch on the ground under each tree and shrub, so plants sit
 * on the terrain instead of looking pasted on. One instanced quad per chunk carries every
 * shadow in it (one extra draw call per planted chunk). The patch is pushed a little away
 * from the sun and stretched along that direction, and tilted to the slope under it so it
 * does not dig into hillsides. Reeds get none: they stand at the water's edge, where a dark
 * patch reads as mud. The maths is here, pure; layer.ts turns it into three.js objects.
 */
import * as THREE from "three";
import type { GridSize } from "../terrainMesh";
import { SUN_DIRECTION } from "../terrainShade";
import { heightOnMesh, type VegInstance } from "./placement";

/** Darkness at the centre of a shadow (0..1). */
export const SHADOW_OPACITY = 0.5;
/** How far the patch moves away from the sun, as a share of the plant's footprint radius. */
export const SHADOW_OFFSET = 0.3;
/** Length over width of the patch, along the shadow direction. */
export const SHADOW_STRETCH = 1.3;
/** Size of the patch against the plant's footprint (a little wider than the crown). */
export const SHADOW_SIZE = 1.15;
/** Lift above the terrain, world units, against z-fighting (with a polygon offset). */
export const SHADOW_LIFT = 0.3;
/** After the sea (0), before the ponds (1), village discs (1.2, 1.4), creeks (1.6) and streets (2). */
export const SHADOW_RENDER_ORDER = 0.5;
const TEXTURE_SIZE = 64;

/** Unit direction (world X, Z) that shadows fall in: away from the sun. */
export function shadowDirection(sun: readonly [number, number, number] = SUN_DIRECTION): [number, number] {
  const len = Math.hypot(sun[0], sun[2]);
  return len > 0 ? [-sun[0] / len, -sun[2] / len] : [1, 0];
}

/** Half the wider horizontal extent of a geometry: its footprint radius at scale 1. */
export function footprintRadius(geometry: THREE.BufferGeometry): number {
  geometry.computeBoundingBox();
  const b = geometry.boundingBox!;
  return Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
}

/**
 * RGBA bytes for the shadow texture: black, alpha falling smoothly from the centre to 0 at
 * the rim (a quad of radius 1 maps the texture edge to distance 1).
 */
export function shadowTextureData(size = TEXTURE_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = ((x + 0.5) / size) * 2 - 1;
      const dy = ((y + 0.5) / size) * 2 - 1;
      const r = Math.min(1, Math.hypot(dx, dy));
      // full core out to 35% of the radius, then a smooth fall to 0 at the rim
      const t = Math.min(1, (1 - r) / 0.65);
      const a = t * t * (3 - 2 * t);
      data[(y * size + x) * 4 + 3] = Math.round(a * 255);
    }
  }
  return data;
}

/** Unit normal of the rendered terrain at a fractional sample position (world units, exaggerated). */
export function terrainNormal(
  heights: Float32Array,
  size: GridSize,
  exaggeration: number,
  px: number,
  py: number,
): [number, number, number] {
  const e = 0.5;
  const dhdx = ((heightOnMesh(heights, size, px + e, py) - heightOnMesh(heights, size, px - e, py)) * exaggeration) / (2 * e * size.cell_m);
  const dhdz = ((heightOnMesh(heights, size, px, py + e) - heightOnMesh(heights, size, px, py - e)) * exaggeration) / (2 * e * size.cell_m);
  const len = Math.hypot(dhdx, 1, dhdz);
  return [-dhdx / len, 1 / len, -dhdz / len];
}

/** Where one shadow goes: centre (world), unit normal, yaw about +y, and radii. */
export interface ShadowPlacement {
  x: number;
  y: number;
  z: number;
  normal: [number, number, number];
  /** Rotation about +y that turns local +x into the shadow direction. */
  yaw: number;
  /** Radius along the shadow direction and across it, world units. */
  along: number;
  across: number;
}

/**
 * Place the shadow of one plant whose footprint radius (at its drawn scale) is `radius`.
 * Heights are metres; the result is in world units (y exaggerated).
 */
export function placeShadow(
  v: Pick<VegInstance, "x" | "z">,
  radius: number,
  heights: Float32Array,
  size: GridSize,
  exaggeration: number,
  dir: readonly [number, number] = shadowDirection(),
): ShadowPlacement {
  const r = radius * SHADOW_SIZE;
  const x = v.x + dir[0] * radius * SHADOW_OFFSET;
  const z = v.z + dir[1] * radius * SHADOW_OFFSET;
  const px = x / size.cell_m + (size.width - 1) / 2;
  const py = z / size.cell_m + (size.height - 1) / 2;
  return {
    x,
    y: heightOnMesh(heights, size, px, py) * exaggeration + SHADOW_LIFT,
    z,
    normal: terrainNormal(heights, size, exaggeration, px, py),
    yaw: Math.atan2(-dir[1], dir[0]),
    along: r * SHADOW_STRETCH,
    across: r,
  };
}

/** Flat quad of radius 1 lying in the XZ plane, facing up. */
export function makeShadowGeometry(): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
}

/** Transparent black with the radial alpha; never writes depth, pulled towards the camera. */
export function makeShadowMaterial(): THREE.MeshBasicMaterial {
  const tex = new THREE.DataTexture(shadowTextureData(), TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return new THREE.MeshBasicMaterial({
    color: 0x000000,
    map: tex,
    transparent: true,
    opacity: SHADOW_OPACITY,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

const UP = new THREE.Vector3(0, 1, 0);
const n3 = new THREE.Vector3();
const qTilt = new THREE.Quaternion();
const qYaw = new THREE.Quaternion();
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();

/** Instance matrix for a placement: yaw about +y, then tilt +y onto the ground normal. */
export function shadowMatrix(p: ShadowPlacement, out: THREE.Matrix4): THREE.Matrix4 {
  qTilt.setFromUnitVectors(UP, n3.set(p.normal[0], p.normal[1], p.normal[2]));
  qYaw.setFromAxisAngle(UP, p.yaw);
  return out.compose(pos.set(p.x, p.y, p.z), qTilt.multiply(qYaw), scl.set(p.along, 1, p.across));
}
