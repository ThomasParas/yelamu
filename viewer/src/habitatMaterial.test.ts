import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { makeShadeFactorAt, shadeByDepth } from "./habitat";
import {
  FRAGMENT_COLOR,
  FRAGMENT_PARS,
  VERTEX_BODY,
  createHabitatMaterial,
  paletteTextureData,
  patchHabitatShaders,
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
    expect(material.customProgramCacheKey()).toBe("yelamu-habitat-v1");
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
    expect(Array.from(data.slice(0, 8))).toEqual(Array.from(Float32Array.from([0.1, 0.2, 0.3, 1, 0.4, 0.5, 0.6, 1])));
    expect(Array.from(data.slice(8, 12))).toEqual(Array.from(Float32Array.from([0.9, 0.8, 0.7, 1])));
    expect(Array.from(data.slice(255 * 4))).toEqual(Array.from(Float32Array.from([0.9, 0.8, 0.7, 1])));
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
