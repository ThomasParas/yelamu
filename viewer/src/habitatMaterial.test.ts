import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { makeShadeFactorAt, shadeByDepth } from "./habitat";
import {
  DRY_BAND_M,
  FRAGMENT_COLOR,
  GROUND_NOISE_SIZE,
  GROUND_VARY_DOWN,
  GROUND_VARY_UP,
  FRAGMENT_PARS,
  VERTEX_BODY,
  createHabitatMaterial,
  groundNoiseData,
  paletteTextureData,
  patchHabitatShaders,
  tileNoise,
} from "./habitatMaterial";

const options = () => ({
  habitat: Uint8Array.from([0, 1, 2, 1, 1, 0]), // 3 x 2, odd row length on purpose
  width: 3,
  height: 2,
  cellM: 10,
  palette: Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]), // ids 0 and 1
  fallback: [0.9, 0.8, 0.7] as const,
});

/** Run the material's onBeforeCompile on three's real standard-material shader text. */
function compile(material: THREE.MeshStandardMaterial) {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  return shader;
}

describe("patchHabitatShaders", () => {
  it("patches three's real standard shader at every anchor", () => {
    const s = compile(createHabitatMaterial(options()).material);
    expect(s.vertexShader).toContain("varying vec2 vHabitatXZ;");
    expect(s.vertexShader).toContain("varying float vHabitatY;");
    expect(s.vertexShader).toContain(VERTEX_BODY.trim());
    // the world position is computed after `transformed` exists
    expect(s.vertexShader.indexOf(VERTEX_BODY.trim())).toBeGreaterThan(s.vertexShader.indexOf("#include <project_vertex>"));
    expect(s.fragmentShader).toContain(FRAGMENT_PARS.trim());
    expect(s.fragmentShader).toContain(FRAGMENT_COLOR.trim());
    // the vertex colour still multiplies in (it carries the shade factors), but only as rgb
    expect(s.fragmentShader).not.toContain("#include <color_fragment>");
    expect(FRAGMENT_COLOR).toContain("vColor.rgb");
  });

  it("fails loudly if three renames an anchor", () => {
    expect(() => patchHabitatShaders({ vertexShader: "void main() {}", fragmentShader: "" })).toThrow(/anchor/);
  });
});

describe("createHabitatMaterial", () => {
  it("binds the raster, palette and grid uniforms", () => {
    const { material } = createHabitatMaterial(options());
    const s = compile(material);
    const habitat = s.uniforms.uHabitat.value as THREE.DataTexture;
    const palette = s.uniforms.uPalette.value as THREE.DataTexture;
    expect(habitat.image.width).toBe(3);
    expect(habitat.image.height).toBe(2);
    expect(habitat.unpackAlignment).toBe(1); // rows are 3 bytes
    expect(habitat.flipY).toBe(false); // row 0 = north, as the shader indexes it
    expect(habitat.magFilter).toBe(THREE.NearestFilter); // ids must never be interpolated
    expect(palette.image.width).toBe(256);
    expect(palette.magFilter).toBe(THREE.NearestFilter);
    expect(palette.colorSpace).toBe(THREE.NoColorSpace); // already linear
    expect((s.uniforms.uGridSize.value as THREE.Vector2).toArray()).toEqual([3, 2]);
    expect(s.uniforms.uCellM.value).toBe(10);
  });

  it("keeps vertex colours on and gets its own program cache key", () => {
    const { material } = createHabitatMaterial(options());
    expect(material.vertexColors).toBe(true);
    expect(material.customProgramCacheKey()).toBe("yelamu-habitat-v4");
  });

  it("binds the water surface, the dry band in world units and the shore colour", () => {
    const s = compile(
      createHabitatMaterial({ ...options(), seaIds: [1], waterY: 1.8, exaggeration: 3, shoreColor: [0.5, 0.4, 0.3] }).material,
    );
    expect(s.uniforms.uWaterY.value).toBe(1.8);
    expect(s.uniforms.uDryBand.value).toBeCloseTo(DRY_BAND_M * 3, 6);
    expect((s.uniforms.uShoreColor.value as THREE.Vector3).toArray()).toEqual([0.5, 0.4, 0.3]);
    const palette = (s.uniforms.uPalette.value as THREE.DataTexture).image.data as Float32Array;
    expect(palette[1 * 4 + 3]).toBe(1); // id 1 is sea
    expect(palette[0 * 4 + 3]).toBe(0);
  });

  it("keeps sea colours off dry ground in the shader, with a land fallback", () => {
    expect(FRAGMENT_PARS).toContain("smoothstep( uWaterY, uWaterY + uDryBand, worldY )");
    expect(FRAGMENT_PARS).toContain("habLandNear");
    expect(FRAGMENT_COLOR).toContain("vHabitatY");
  });

  it("refuses a raster that does not match its size", () => {
    expect(() => createHabitatMaterial({ ...options(), width: 4 })).toThrow(/expected 8/);
  });
});

describe("paletteTextureData", () => {
  it("puts each palette colour at its id and the fallback everywhere else", () => {
    const o = options();
    const data = paletteTextureData(o.palette, o.fallback);
    expect(data.length).toBe(256 * 4);
    expect(Array.from(data.slice(0, 8))).toEqual(Array.from(Float32Array.from([0.1, 0.2, 0.3, 0, 0.4, 0.5, 0.6, 0])));
    expect(Array.from(data.slice(8, 12))).toEqual(Array.from(Float32Array.from([0.9, 0.8, 0.7, 0])));
    expect(Array.from(data.slice(255 * 4))).toEqual(Array.from(Float32Array.from([0.9, 0.8, 0.7, 0])));
  });

  it("marks the sea classes in alpha", () => {
    const o = options();
    const data = paletteTextureData(o.palette, o.fallback, [1, 7]);
    expect([data[3], data[7], data[7 * 4 + 3], data[8 * 4 + 3]]).toEqual([0, 1, 1, 0]);
  });
});

describe("makeShadeFactorAt", () => {
  const f = makeShadeFactorAt(0, 20);

  it("is white (no change) on dry ground", () => {
    expect(f(0, 5)).toEqual([1, 1, 1]);
    expect(f(0, 0)).toEqual([1, 1, 1]);
  });

  it("carries the same depth darkening the old vertex colours had", () => {
    expect(f(0, -10)).toEqual(shadeByDepth([1, 1, 1], -10, 0, 20));
    expect(f(0, -10)[0]).toBeLessThan(1);
  });
});

describe("ground colour variation", () => {
  it("tileNoise wraps seamlessly and stays in -1..1", () => {
    for (const [u, v] of [[0, 0.3], [0.25, 0], [0.71, 0.13]]) {
      expect(tileNoise(u, v, 8, 1)).toBeCloseTo(tileNoise(u + 1, v, 8, 1), 9);
      expect(tileNoise(u, v, 8, 1)).toBeCloseTo(tileNoise(u, v + 1, 8, 1), 9);
    }
    for (let i = 0; i < 500; i++) {
      const n = tileNoise(i * 0.0137, i * 0.0291, 8, 2);
      expect(Math.abs(n)).toBeLessThanOrEqual(1);
    }
  });

  it("bakes a texture whose edges meet (no seam where it repeats) and that averages to grey", () => {
    const size = 64;
    const d = groundNoiseData(size, 8);
    expect(d.length).toBe(size * size * 4);
    const at = (x: number, y: number, ch: number) => d[(y * size + x) * 4 + ch];
    let edge = 0;
    for (let i = 0; i < size; i++) for (const ch of [0, 1, 2]) {
      edge = Math.max(edge, Math.abs(at(size - 1, i, ch) - at(0, i, ch)), Math.abs(at(i, size - 1, ch) - at(i, 0, ch)));
    }
    expect(edge).toBeLessThan(40); // neighbours across the wrap differ like any two neighbours
    for (const ch of [0, 1, 2]) {
      let sum = 0;
      for (let i = 0; i < size * size; i++) sum += d[i * 4 + ch];
      expect(Math.abs(sum / (size * size) - 128)).toBeLessThan(20); // mipmaps fade to "no change"
    }
  });

  it("binds a repeating, mipmapped noise texture and fetches it twice", () => {
    const { material } = createHabitatMaterial(options());
    const s = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, { value: unknown }> };
    material.onBeforeCompile(s as never, undefined as never);
    const t = s.uniforms.uGroundNoise.value as THREE.DataTexture;
    expect(t.image.width).toBe(GROUND_NOISE_SIZE);
    expect(t.wrapS).toBe(THREE.RepeatWrapping);
    expect(t.generateMipmaps).toBe(true);
    expect(FRAGMENT_PARS.match(/texture2D\( uGroundNoise/g)).toHaveLength(2);
    expect(FRAGMENT_COLOR).toContain("habGroundVary");
  });

  it("brightens further than it darkens", () => {
    expect(GROUND_VARY_UP).toBeGreaterThan(GROUND_VARY_DOWN);
  });
});
