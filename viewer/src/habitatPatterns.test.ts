import { describe, expect, it } from "vitest";
import { blend, contrastRatio } from "./a11y";
import { CREEK_COLOR, CREEK_OPACITY, MODELLED_COLOR, MODELLED_OPACITY } from "./creeks/colors";
import { GROUP_COLORS, srgbToLinear } from "./habitat";
import {
  GROUP_PATTERNS,
  LIGHT_PATTERNS,
  PATTERN_CELL_PX,
  PATTERN_DARK,
  PATTERN_DASHES,
  PATTERN_GLSL,
  PATTERN_LIGHT,
  PATTERN_NONE,
  patternById,
  patternNameForGroup,
} from "./habitatPatterns";
import { STREET_COLOR, STREET_OPACITY } from "./overlay/streetsLayer";

const css = (await import("node:fs")).readFileSync(new URL("./ui/ui.css", import.meta.url), "utf8");

const linearToSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
/** A ground colour at the core of its pattern mark, the way the shader makes it (in linear light). */
function marked(hex: number, pattern: number): number {
  const light = LIGHT_PATTERNS.includes(pattern);
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const lin = srgbToLinear(((hex >> shift) & 255) / 255);
    const m = light ? lin + (1 - lin) * PATTERN_LIGHT : lin * (1 - PATTERN_DARK);
    out |= Math.round(Math.min(1, Math.max(0, linearToSrgb(m))) * 255) << shift;
  }
  return out;
}

describe("habitat patterns", () => {
  it("patterns the groups that are hard to tell apart under red-green colour blindness", () => {
    // Measured pairs (2026-11-18): dune/grassland, dune/beach, marsh/scrub, wetland/rock.
    for (const [a, b] of [["dune", "grassland"], ["dune", "beach"], ["marsh", "scrub"], ["wetland", "rock"]]) {
      expect(GROUP_PATTERNS[a] ?? PATTERN_NONE, `${a} vs ${b}`).not.toBe(GROUP_PATTERNS[b] ?? PATTERN_NONE);
    }
  });

  it("maps class ids to their group's pattern, leaving gaps and unlisted groups plain", () => {
    const byId = patternById([
      { id: 0, group: "water" },
      { id: 2, group: "dune" },
      { id: 3, group: "marsh" },
      { id: 300, group: "rock" },
    ]);
    expect(byId).toEqual([PATTERN_NONE, PATTERN_NONE, GROUP_PATTERNS.dune, PATTERN_DASHES]);
  });

  it("names the legend swatch class, with a ui.css rule for every pattern in use", () => {
    expect(patternNameForGroup("grassland")).toBe("none");
    expect(patternNameForGroup("scrub")).toBe("rings");
    for (const group of Object.keys(GROUP_PATTERNS)) {
      expect(css).toContain(`.swatch--${patternNameForGroup(group)}`);
    }
  });

  it("writes its constants into the shader", () => {
    expect(PATTERN_GLSL).toContain(PATTERN_CELL_PX.toFixed(4));
    expect(PATTERN_GLSL).toContain(PATTERN_DARK.toFixed(4));
    expect(PATTERN_GLSL).toContain(PATTERN_LIGHT.toFixed(4));
  });
});

describe("lines over a pattern mark still clear 1.5:1", () => {
  const patterned = Object.entries(GROUP_PATTERNS).map(([g, p]) => [g, marked(GROUP_COLORS[g], p)] as const);

  it("street lines, at each class's opacity", () => {
    for (const [kind, opacity] of Object.entries(STREET_OPACITY)) {
      for (const [group, ground] of patterned) {
        const ratio = contrastRatio(blend(STREET_COLOR, opacity, ground), ground);
        expect(ratio, `${kind} streets over marked ${group}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  it("creek and modelled stream lines", () => {
    for (const [colour, opacity, kind] of [
      [CREEK_COLOR, CREEK_OPACITY, "creek"],
      [MODELLED_COLOR, MODELLED_OPACITY, "modelled stream"],
    ] as const) {
      for (const [group, ground] of patterned) {
        const ratio = contrastRatio(blend(colour, opacity, ground), ground);
        expect(ratio, `${kind} over marked ${group}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(1.5);
      }
    }
  });
});
