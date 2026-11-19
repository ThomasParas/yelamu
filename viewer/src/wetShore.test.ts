import { describe, expect, it } from "vitest";
import { blend, contrastRatio } from "./a11y";
import { CREEK_COLOR, CREEK_OPACITY, MODELLED_COLOR, MODELLED_OPACITY } from "./creeks/colors";
import { GROUP_COLORS, srgbToLinear } from "./habitat";
import { FRAGMENT_COLOR, FRAGMENT_PARS, GROUND_DARKEST, WET_DARK, WET_FLOOR_LUM, WET_HEIGHT_M, WET_WIDTH_M, createHabitatMaterial } from "./habitatMaterial";
import { STREET_COLOR, STREET_OPACITY } from "./overlay/streetsLayer";
import * as THREE from "three";

const linearToSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
/** A ground colour at the darkest point of the wet band, as the shader makes it (linear light, floored). */
function wet(hex: number): number {
  const lin = [16, 8, 0].map((shift) => srgbToLinear(((hex >> shift) & 255) / 255));
  const lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const k = Math.max(1 - WET_DARK, Math.min(1, WET_FLOOR_LUM / lum));
  let out = 0;
  for (const [j, shift] of [16, 8, 0].entries()) {
    const v = lin[j] * k;
    out |= Math.round(Math.min(1, Math.max(0, linearToSrgb(v))) * 255) << shift;
  }
  return out;
}

describe("wet shore band", () => {
  const land = Object.entries(GROUP_COLORS).filter(([g]) => g !== "water");

  it("is a narrow, low band (it must not swallow the pale beach strip)", () => {
    expect(WET_WIDTH_M).toBeLessThanOrEqual(10);
    expect(WET_HEIGHT_M).toBeLessThanOrEqual(1.5);
    expect(WET_DARK).toBeLessThan(0.4);
  });

  it("never darkens below the darkest woodland, and gives sand most of the effect", () => {
    expect(WET_FLOOR_LUM).toBeGreaterThan(0);
    const lum = (hex: number) => {
      const l = [16, 8, 0].map((s) => srgbToLinear(((hex >> s) & 255) / 255));
      return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
    };
    expect(lum(wet(GROUP_COLORS.woodland))).toBeGreaterThanOrEqual(lum(GROUP_COLORS.woodland) * GROUND_DARKEST * 0.98);
    expect(lum(wet(GROUP_COLORS.beach)) / lum(GROUP_COLORS.beach)).toBeLessThan(0.75);
  });

  it("keeps street, creek and modelled stream lines at 1.5:1 over the wettest ground", () => {
    const lines: [string, number, number][] = [
      ["creek", CREEK_COLOR, CREEK_OPACITY],
      ["modelled stream", MODELLED_COLOR, MODELLED_OPACITY],
      ...Object.entries(STREET_OPACITY).map(([k, o]) => [`${k} street`, STREET_COLOR, o] as [string, number, number]),
    ];
    for (const [name, colour, opacity] of lines) {
      for (const [group, ground] of land) {
        const g = wet(ground);
        const ratio = contrastRatio(blend(colour, opacity, g), g);
        expect(ratio, `${name} over wet ${group}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  it("is wired into the ground colour, and off until the shore field arrives", () => {
    expect(FRAGMENT_PARS).toContain("float habWet(");
    expect(FRAGMENT_PARS).toContain("if ( uShoreOn < 0.5 ) return 1.0;");
    expect(FRAGMENT_COLOR).toContain("habGround *= habWet( vHabitatXZ, vHabitatY, habGround );");
    expect(FRAGMENT_PARS).toContain(WET_FLOOR_LUM.toFixed(6));
    const m = createHabitatMaterial({
      habitat: new Uint8Array(4), width: 2, height: 2, cellM: 10,
      palette: new Float32Array(3), fallback: [0.5, 0.5, 0.5], exaggeration: 3,
    });
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: "#include <common>\n#include <project_vertex>", fragmentShader: "#include <common>\n#include <color_fragment>" };
    m.material.onBeforeCompile(shader as never, undefined as never);
    expect(shader.uniforms.uShoreOn.value).toBe(0);
    expect(shader.uniforms.uWetHeight.value).toBeCloseTo(WET_HEIGHT_M * 3);
    const tex = new THREE.DataTexture(new Uint8Array(2), 1, 1, THREE.RGFormat);
    m.setShore(tex);
    expect(shader.uniforms.uShoreOn.value).toBe(1);
    expect(shader.uniforms.uShore.value).toBe(tex);
    m.dispose();
  });
});
