import { describe, expect, it } from "vitest";
import { GROUP_COLORS, shadeByDepth, srgbToLinear } from "../habitat";
import { LIGHTEN_MAX, LIGHTEN_TOP_M, makeRingColorAt } from "./colors";

const lin = (hex: number): [number, number, number] => [
  srgbToLinear(((hex >> 16) & 255) / 255),
  srgbToLinear(((hex >> 8) & 255) / 255),
  srgbToLinear((hex & 255) / 255),
];

describe("makeRingColorAt", () => {
  const colorAt = makeRingColorAt(0.6, 6);

  it("uses the unmapped ground colour on low land", () => {
    const base = lin(GROUP_COLORS.unmapped);
    const c = colorAt(0.6 + 0.001);
    base.forEach((v, i) => expect(c[i]).toBeCloseTo(v, 3));
  });

  it("lightens with height, up to the maximum, and never past 1", () => {
    const base = lin(GROUP_COLORS.unmapped);
    const top = colorAt(0.6 + LIGHTEN_TOP_M * 3);
    base.forEach((v, i) => expect(top[i]).toBeCloseTo(Math.min(1, v * (1 + LIGHTEN_MAX)), 5));
    for (const v of colorAt(5000)) expect(v).toBeLessThanOrEqual(1);
  });

  it("uses the water colour shaded by depth below the water level", () => {
    const water = lin(GROUP_COLORS.water);
    expect(colorAt(-3)).toEqual(shadeByDepth(water, -3, 0.6, 6));
    expect(colorAt(0.6)).toEqual(shadeByDepth(water, 0.6, 0.6, 6));
  });
});
