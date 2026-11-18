import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  CHOP,
  FRAGMENT_NORMAL,
  WATER_COLOR,
  WATER_OPACITY,
  WAVES,
  WAVE_SLOPE,
  createShoreTexture,
  createWaterMaterial,
  patchWaterShaders,
  waveOmega,
} from "./waterMaterial";

/** Run the material's onBeforeCompile on three's real standard-material shader text. */
function compile(m: ReturnType<typeof createWaterMaterial>) {
  const shader = {
    uniforms: {} as Record<string, { value: number }>,
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  m.material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  return shader;
}

describe("createWaterMaterial", () => {
  it("keeps the old look: colour, transparency, opacity", () => {
    const { material } = createWaterMaterial();
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(material.color.getHex()).toBe(WATER_COLOR);
    expect(WATER_COLOR).toBe(0x3f7fa6);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(WATER_OPACITY);
    expect(WATER_OPACITY).toBe(0.8);
  });

  it("starts static: amplitude uniform is 0", () => {
    const m = createWaterMaterial();
    const s = compile(m);
    expect(s.uniforms.uAmp.value).toBe(0);
    expect(s.uniforms.uTime.value).toBe(0);
  });

  it("setAnimated switches the amplitude uniform on and off; setTime updates uTime", () => {
    const m = createWaterMaterial();
    const s = compile(m);
    m.setAnimated(true);
    expect(s.uniforms.uAmp.value).toBe(WAVE_SLOPE);
    m.setTime(12.5);
    expect(s.uniforms.uTime.value).toBe(12.5);
    m.setAnimated(false);
    expect(s.uniforms.uAmp.value).toBe(0);
    m.setTime(Number.NaN); // ignored
    expect(s.uniforms.uTime.value).toBe(12.5);
  });

  it("uniform objects are shared by every compile (state survives recompiles)", () => {
    const m = createWaterMaterial();
    const a = compile(m);
    m.setAnimated(true);
    const b = compile(m);
    expect(b.uniforms.uAmp).toBe(a.uniforms.uAmp);
    expect(b.uniforms.uAmp.value).toBe(WAVE_SLOPE);
  });

  it("patches the vertex and fragment shaders at real three anchors", () => {
    const original = THREE.ShaderLib.standard;
    const s = compile(createWaterMaterial());
    // vertex: world XZ varying
    expect(s.vertexShader).toContain("varying vec2 vWaterXZ;");
    expect(s.vertexShader).toContain("modelMatrix * vec4( transformed, 1.0 )");
    expect(s.vertexShader.indexOf("#include <project_vertex>")).toBeLessThan(s.vertexShader.indexOf("vWaterXZ = "));
    // fragment: uniforms, normal perturbation after the normal chunk, glint before the output
    expect(s.fragmentShader).toContain("uniform float uTime;");
    expect(s.fragmentShader).toContain("uniform float uAmp;");
    const iNormal = s.fragmentShader.indexOf("#include <normal_fragment_maps>");
    const iPerturb = s.fragmentShader.indexOf("vec3 waveNormal");
    const iGlint = s.fragmentShader.indexOf("float glint");
    const iOutput = s.fragmentShader.indexOf("#include <opaque_fragment>");
    expect(iNormal).toBeGreaterThan(-1);
    expect(iNormal).toBeLessThan(iPerturb);
    expect(iPerturb).toBeLessThan(iGlint);
    expect(iGlint).toBeLessThan(iOutput);
    // one term per swell wave and per chop octave
    expect(s.fragmentShader.split("swell += ").length - 1).toBe(WAVES.length);
    expect(s.fragmentShader.split("chop += ").length - 1).toBe(CHOP.length);
    // the shared source is untouched
    expect(original.fragmentShader).not.toContain("uAmp");
    expect(original.vertexShader).not.toContain("vWaterXZ");
  });

  it("each patched section is applied exactly once", () => {
    const s = compile(createWaterMaterial());
    for (const needle of ["varying vec2 vWaterXZ;", "uniform float uAmp;", "float glint =", "vec3 waveNormal"]) {
      expect(s.vertexShader.split(needle).length - 1 + s.fragmentShader.split(needle).length - 1).toBeLessThanOrEqual(2);
    }
    expect(s.fragmentShader.split("vec3 waveNormal").length - 1).toBe(1);
    expect(s.fragmentShader.split("float glint =").length - 1).toBe(1);
  });

  it("throws a clear error when three's shader no longer has an anchor", () => {
    expect(() => patchWaterShaders({ vertexShader: "void main(){}", fragmentShader: "void main(){}" })).toThrow(/anchor/);
  });

  it("shares one program cache key", () => {
    const a = createWaterMaterial().material;
    const b = createWaterMaterial().material;
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
  });
});

describe("shore effects", () => {
  const shore = () => ({ field: new Uint8Array(3 * 2 * 2), width: 3, height: 2, cellM: 10 });

  it("adds the shallows and foam after three's colour chunk", () => {
    const s = compile(createWaterMaterial());
    const iColor = s.fragmentShader.indexOf("#include <color_fragment>");
    const iShore = s.fragmentShader.indexOf("uShoreOn > 0.5");
    expect(iColor).toBeGreaterThan(-1);
    expect(iShore).toBeGreaterThan(iColor);
    expect(s.fragmentShader).toContain("uniform sampler2D uShore;");
  });

  it("is off until a shore field is set, so the water first looks as before", () => {
    const m = createWaterMaterial();
    const s = compile(m) as unknown as { uniforms: Record<string, { value: unknown }> };
    expect(s.uniforms.uShoreOn.value).toBe(0);
    m.setShore(shore());
    expect(s.uniforms.uShoreOn.value).toBe(1);
    expect((s.uniforms.uShoreGrid.value as THREE.Vector2).toArray()).toEqual([3, 2]);
    expect(s.uniforms.uShoreCellM.value).toBe(10);
  });

  it("gives ponds the same motion but never the sea's shore", () => {
    const m = createWaterMaterial();
    const sea = compile(m) as unknown as { uniforms: Record<string, { value: unknown }> };
    const pond = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    m.pondMaterial.onBeforeCompile(pond as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
    m.setShore(shore());
    m.setAnimated(true);
    m.setTime(3);
    expect(pond.uniforms.uShoreOn.value).toBe(0);
    expect(pond.uniforms.uTime).toBe(sea.uniforms.uTime);
    expect(pond.uniforms.uAmp).toBe(sea.uniforms.uAmp);
    expect(m.pondMaterial.customProgramCacheKey()).toBe(m.material.customProgramCacheKey());
  });

  it("uploads the field as a linear-filtered two-channel data texture, row 0 north", () => {
    const t = createShoreTexture(shore());
    expect(t.format).toBe(THREE.RGFormat);
    expect(t.magFilter).toBe(THREE.LinearFilter);
    expect(t.flipY).toBe(false);
    expect(t.unpackAlignment).toBe(2);
    expect(t.colorSpace).toBe(THREE.NoColorSpace);
    expect(() => createShoreTexture({ ...shore(), width: 4 })).toThrow(/expected 16/);
  });
});

describe("ripples", () => {
  it("has swell and chop shares that each add up to 1", () => {
    expect(WAVES.reduce((t, w) => t + w.weight, 0)).toBeCloseTo(1, 6);
    expect(CHOP.reduce((t, o) => t + o.weight, 0)).toBeCloseTo(1, 6);
  });

  it("uses no two swell waves with the same length or direction (that is what made the lattice)", () => {
    expect(new Set(WAVES.map((w) => w.lengthM)).size).toBe(WAVES.length);
    expect(new Set(WAVES.map((w) => w.angleDeg)).size).toBe(WAVES.length);
  });

  it("moves swell at deep-water speed: longer waves travel faster", () => {
    expect(waveOmega(100)).toBeCloseTo(Math.sqrt((9.81 * 2 * Math.PI) / 100), 9);
    const speed = (l: number) => waveOmega(l) / ((2 * Math.PI) / l); // phase speed, m/s
    expect(speed(131)).toBeGreaterThan(speed(43));
  });

  it("leaves three's lit normal flat, so its broad specular cannot draw the ripples as blobs", () => {
    expect(FRAGMENT_NORMAL).not.toMatch(/(^|[^a-zA-Z])normal\s*=/m);
    expect(FRAGMENT_NORMAL).toContain("waveNormal = normalize");
  });

  it("glints only beyond what flat water would, and from the wave normal", () => {
    const s = compile(createWaterMaterial()).fragmentShader;
    expect(s).toContain("dot( waveNormal, halfV )");
    expect(s).toContain("- flatGlint");
  });
});
