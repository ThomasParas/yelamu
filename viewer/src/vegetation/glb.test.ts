import { describe, expect, it, vi } from "vitest";
import { MAX_MODEL_TRIANGLES, MODEL_SPECIES, loadTreeModels, parseTreeGlb } from "./glb";

/** Minimal GLB writer for the tests: one primitive, the given accessors packed into one buffer. */
function glb(opts: {
  positions: number[];
  colors?: number[];
  colorType?: "float" | "ushort";
  colorSize?: 3 | 4;
  indices?: number[];
  json?: (g: Record<string, unknown>) => void;
  magic?: number;
}): ArrayBuffer {
  const parts: { bytes: Uint8Array; componentType: number; type: string; count: number; normalized?: boolean }[] = [];
  const attributes: Record<string, number> = {};
  const push = (bytes: Uint8Array, componentType: number, type: string, count: number, normalized?: boolean) => {
    parts.push({ bytes, componentType, type, count, normalized });
    return parts.length - 1;
  };
  attributes.POSITION = push(new Uint8Array(Float32Array.from(opts.positions).buffer), 5126, "VEC3", opts.positions.length / 3);
  if (opts.colors) {
    const size = opts.colorSize ?? 4;
    const n = opts.colors.length / size;
    attributes.COLOR_0 =
      opts.colorType === "float"
        ? push(new Uint8Array(Float32Array.from(opts.colors).buffer), 5126, size === 3 ? "VEC3" : "VEC4", n)
        : push(new Uint8Array(Uint16Array.from(opts.colors.map((c) => Math.round(c * 65535))).buffer), 5123, size === 3 ? "VEC3" : "VEC4", n, true);
  }
  let indices: number | undefined;
  if (opts.indices) indices = push(new Uint8Array(Uint16Array.from(opts.indices).buffer), 5123, "SCALAR", opts.indices.length);
  const pad4 = (n: number) => (n + 3) & ~3;
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  for (const p of parts) {
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: p.bytes.length });
    accessors.push({ bufferView: bufferViews.length - 1, componentType: p.componentType, count: p.count, type: p.type, normalized: p.normalized });
    offset = pad4(offset + p.bytes.length);
  }
  const bin = new Uint8Array(offset);
  let at = 0;
  for (const p of parts) {
    bin.set(p.bytes, at);
    at = pad4(at + p.bytes.length);
  }
  const gltf: Record<string, unknown> = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: bin.length }],
    bufferViews,
    accessors,
    meshes: [{ primitives: [{ attributes, indices, mode: 4 }] }],
  };
  opts.json?.(gltf);
  let json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPadded = new Uint8Array(pad4(json.length)).fill(0x20);
  jsonPadded.set(json);
  json = jsonPadded;
  const total = 12 + 8 + json.length + 8 + bin.length;
  const out = new ArrayBuffer(total);
  const dv = new DataView(out);
  dv.setUint32(0, opts.magic ?? 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, json.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(out, 20, json.length).set(json);
  dv.setUint32(20 + json.length, bin.length, true);
  dv.setUint32(24 + json.length, 0x004e4942, true);
  new Uint8Array(out, 28 + json.length, bin.length).set(bin);
  return out;
}

// A 2 m tall square pyramid (4 sides + 2 floor triangles, indexed), green apex, brown base.
const PYRAMID = {
  positions: [0, 2, 0, -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5],
  colors: [0.1, 0.5, 0.1, 1, 0.3, 0.2, 0.1, 1, 0.3, 0.2, 0.1, 1, 0.3, 0.2, 0.1, 1, 0.3, 0.2, 0.1, 1],
  indices: [0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 1, 4, 1, 2, 3, 1, 3, 4],
};

describe("parseTreeGlb", () => {
  it("unpacks an indexed mesh into triangles with colours, rescaled to unit height", () => {
    const g = parseTreeGlb(glb(PYRAMID));
    const pos = g.getAttribute("position");
    expect(pos.count).toBe(18);
    expect(g.getIndex()).toBeNull();
    expect(g.boundingBox!.max.y).toBeCloseTo(1, 6); // 2 m tall model scaled to 1
    expect(g.boundingBox!.max.x).toBeCloseTo(0.25, 6);
    const col = g.getAttribute("color");
    expect(col.itemSize).toBe(3);
    expect(col.getX(0)).toBeCloseTo(0.1, 4); // apex, normalized ushort decoded
    expect(col.getY(0)).toBeCloseTo(0.5, 4);
    expect(g.getAttribute("normal").count).toBe(18);
  });

  it("reads float VEC3 colours and unindexed meshes as well", () => {
    const tri = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], colors: [1, 0, 0, 0, 1, 0, 0, 0, 1], colorType: "float" as const, colorSize: 3 as const };
    const g = parseTreeGlb(glb(tri));
    expect(g.getAttribute("position").count).toBe(3);
    expect(g.getAttribute("color").getZ(2)).toBe(1);
  });

  it("refuses files it does not understand", () => {
    expect(() => parseTreeGlb(glb({ ...PYRAMID, magic: 0x12345678 }))).toThrow(/not a GLB/);
    expect(() => parseTreeGlb(glb({ ...PYRAMID, colors: undefined }))).toThrow(/COLOR_0/);
    expect(() => parseTreeGlb(glb({ ...PYRAMID, indices: [0, 1, 9] }))).toThrow(/out of range/);
    expect(() =>
      parseTreeGlb(glb({ ...PYRAMID, json: (g) => (g.meshes as unknown[]).push({ primitives: [{ attributes: {} }] }) })),
    ).toThrow(/one mesh primitive/);
    const many = Array.from({ length: (MAX_MODEL_TRIANGLES + 1) * 3 }, (_, i) => i % 5);
    expect(() => parseTreeGlb(glb({ ...PYRAMID, indices: many }))).toThrow(/triangles/);
  });
});

describe("loadTreeModels", () => {
  it("returns the models that load and leaves out the rest, with a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const file = glb(PYRAMID);
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith("/willow.glb") ? new Response(null, { status: 404 }) : new Response(file.slice(0)),
    );
    const models = await loadTreeModels("/assets/plants", fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(MODEL_SPECIES.length);
    expect(fetchFn).toHaveBeenCalledWith("/assets/plants/oak.glb");
    expect(Object.keys(models).sort()).toEqual(["bay", "oak"]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
