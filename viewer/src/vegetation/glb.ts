/**
 * Tree models from Blender (pipeline/scripts/make_plants_blender.py): one small GLB per tree
 * species, read by a minimal GLB parser instead of three's GLTFLoader. The files hold exactly
 * one triangle mesh with POSITION and a linear COLOR_0, which is all the vegetation layer
 * draws (as instances, flat shaded), so the full loader would be bundle weight for nothing.
 *
 * Anything unexpected (a missing file, another layout, too many triangles) leaves that species
 * on its procedural shape from geometry.ts: the models are a refinement, never a dependency.
 */
import * as THREE from "three";
import type { VegetationGeometries } from "./geometry";
import type { Species } from "./species";

/** Species that have a Blender model. Shrubs and reeds stay procedural. */
export const MODEL_SPECIES = ["oak", "bay", "willow"] as const satisfies readonly Species[];
/** Most triangles a model may have (the pipeline's detailed set aims for 480 or fewer). */
export const MAX_MODEL_TRIANGLES = 600;

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

interface Accessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  normalized?: boolean;
  count: number;
  type: string;
}
interface BufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}
interface Gltf {
  accessors?: Accessor[];
  bufferViews?: BufferView[];
  meshes?: { primitives: { attributes: Record<string, number>; indices?: number; mode?: number }[] }[];
}

/** Read an accessor as plain floats (normalized integer types scaled to 0..1). */
function readAccessor(gltf: Gltf, bin: DataView, index: number): { data: Float32Array; size: number } {
  const a = gltf.accessors?.[index];
  if (!a || a.bufferView === undefined) throw new Error(`accessor ${index} missing`);
  const view = gltf.bufferViews?.[a.bufferView];
  if (!view) throw new Error(`bufferView ${a.bufferView} missing`);
  const size = COMPONENTS[a.type];
  if (!size) throw new Error(`accessor type ${a.type} not supported`);
  const [bytes, read, scale] = (
    {
      5126: [4, (o: number) => bin.getFloat32(o, true), 1],
      5125: [4, (o: number) => bin.getUint32(o, true), 1],
      5123: [2, (o: number) => bin.getUint16(o, true), 65535],
      5121: [1, (o: number) => bin.getUint8(o), 255],
    } as Record<number, [number, (o: number) => number, number]>
  )[a.componentType] ?? [0, () => 0, 1];
  if (!bytes) throw new Error(`component type ${a.componentType} not supported`);
  const stride = view.byteStride ?? bytes * size;
  const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const end = start + stride * (a.count - 1) + bytes * size;
  if (a.count < 1) throw new Error(`accessor ${index} is empty`);
  if (end > (view.byteOffset ?? 0) + view.byteLength || end > bin.byteLength) {
    throw new Error(`accessor ${index} runs past its buffer view`);
  }
  const div = a.normalized ? scale : 1;
  const data = new Float32Array(a.count * size);
  for (let i = 0; i < a.count; i++) {
    for (let c = 0; c < size; c++) data[i * size + c] = read(start + i * stride + c * bytes) / div;
  }
  return { data, size };
}

/**
 * Parse a GLB holding one triangle mesh into a non-indexed geometry with position, normal
 * (per face) and colour (rgb) attributes, rescaled so its top is at y = 1, like the
 * procedural tree shapes. Throws on anything it does not expect.
 */
export function parseTreeGlb(buffer: ArrayBuffer): THREE.BufferGeometry {
  const dv = new DataView(buffer);
  if (buffer.byteLength < 20 || dv.getUint32(0, true) !== GLB_MAGIC) throw new Error("not a GLB file");
  if (dv.getUint32(4, true) !== 2) throw new Error(`GLB version ${dv.getUint32(4, true)} not supported`);
  let gltf: Gltf | null = null;
  let bin: DataView | null = null;
  for (let at = 12; at + 8 <= buffer.byteLength; ) {
    const len = dv.getUint32(at, true);
    const type = dv.getUint32(at + 4, true);
    if (at + 8 + len > buffer.byteLength) throw new Error("GLB chunk runs past the file");
    if (type === CHUNK_JSON) gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, at + 8, len))) as Gltf;
    else if (type === CHUNK_BIN) bin = new DataView(buffer, at + 8, len);
    at += 8 + len;
  }
  if (!gltf || !bin) throw new Error("GLB needs a JSON and a binary chunk");
  const prims = gltf.meshes?.flatMap((m) => m.primitives) ?? [];
  if (prims.length !== 1) throw new Error(`expected one mesh primitive, found ${prims.length}`);
  const prim = prims[0];
  if ((prim.mode ?? 4) !== 4) throw new Error("only triangle meshes are supported");
  if (prim.attributes.POSITION === undefined || prim.attributes.COLOR_0 === undefined) {
    throw new Error("the mesh needs POSITION and COLOR_0");
  }
  const pos = readAccessor(gltf, bin, prim.attributes.POSITION);
  const col = readAccessor(gltf, bin, prim.attributes.COLOR_0);
  if (pos.size !== 3 || col.size < 3) throw new Error("POSITION must be VEC3 and COLOR_0 VEC3 or VEC4");
  const vertices = pos.data.length / 3;
  if (col.data.length / col.size !== vertices) throw new Error("COLOR_0 and POSITION counts differ");
  const index = prim.indices === undefined ? null : readAccessor(gltf, bin, prim.indices).data;
  const corners = index ? index.length : vertices;
  if (corners % 3 !== 0 || corners === 0) throw new Error("not a whole number of triangles");
  if (corners / 3 > MAX_MODEL_TRIANGLES) throw new Error(`${corners / 3} triangles, more than ${MAX_MODEL_TRIANGLES}`);

  const position = new Float32Array(corners * 3);
  const color = new Float32Array(corners * 3);
  for (let k = 0; k < corners; k++) {
    const v = index ? index[k] : k;
    if (!(v >= 0 && v < vertices)) throw new Error(`index ${v} out of range`);
    for (let c = 0; c < 3; c++) {
      position[k * 3 + c] = pos.data[v * 3 + c];
      color[k * 3 + c] = col.data[v * col.size + c];
    }
  }
  if (!position.every(Number.isFinite) || !color.every(Number.isFinite)) throw new Error("non-finite values");
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(position, 3));
  g.setAttribute("color", new THREE.BufferAttribute(color, 3));
  g.computeBoundingBox();
  const top = g.boundingBox!.max.y;
  if (!(top > 0)) throw new Error("the model has no height");
  g.scale(1 / top, 1 / top, 1 / top);
  g.computeVertexNormals(); // non-indexed, so these are face normals
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * Fetch and parse every tree model under `base` (a URL folder). Species whose file is missing
 * or invalid are left out (with a console warning), so the caller keeps their procedural shape.
 */
export async function loadTreeModels(
  base: string,
  fetchFn: (url: string) => Promise<Response> = (u) => fetch(u),
): Promise<Partial<VegetationGeometries>> {
  const out: Partial<VegetationGeometries> = {};
  await Promise.all(
    MODEL_SPECIES.map(async (sp) => {
      try {
        const res = await fetchFn(`${base}/${sp}.glb`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        out[sp] = parseTreeGlb(await res.arrayBuffer());
      } catch (err) {
        console.warn(`Tree model ${sp}.glb not used; keeping the simple shape.`, err);
      }
    }),
  );
  return out;
}
