/**
 * Colour contrast of the viewer UI, checked against the real ui.css tokens and the colour
 * constants exported by the modules that draw things. WCAG 2.x: 4.5:1 for text, 3:1 for
 * UI parts such as focus rings. Streets are the one exception: a faint orientation aid
 * drawn as 1 px lines, held to 1.5:1 against every ground colour (see streetsLayer.ts).
 *
 * Measured numbers (light theme unless noted), kept here so a reviewer need not run it:
 *   label text 1c2429 on its white halo ........ 15.7:1   (on bare ground: 2.6 woodland .. 11.1 beach)
 *   street slate 1f2a33: darkest ground (woodland 4f6b3f) 2.4:1, lightest (beach e6d9a8) 10.3:1,
 *     worst case over all ten ground colours 2.35:1 (primary) / 1.74:1 (local, 0.6 opacity)
 *   old street cream fff3d6: woodland 5.4:1 but beach 1.28:1, dune 1.55:1 -> replaced
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { blend, contrastRatio, meetsContrast } from "./a11y";
import { GROUP_COLORS } from "./habitat";
import { LABEL_HALO, LABEL_HALO_ALPHA, LABEL_TEXT } from "./overlay/labels";
import { STREET_COLOR, STREET_OPACITY } from "./overlay/streetsLayer";
import { SCENE_BACKGROUND } from "./theme";
import { VEG_COLORS } from "./vegetation/geometry";
import { VEGETATION_BY_GROUP } from "./vegetation/placement";

// Read the real stylesheet (vitest replaces CSS imports with an empty string).
const css = readFileSync(new URL("./ui/ui.css", import.meta.url), "utf8");

interface Rgba {
  color: number;
  alpha: number;
}
type Tokens = Record<string, string>;

function tokensOf(block: string): Tokens {
  const out: Tokens = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
function color(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return { color: parseInt(hex[1], 16), alpha: 1 };
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value);
  if (!rgba) throw new Error(`cannot parse colour ${value}`);
  return { color: (+rgba[1] << 16) | (+rgba[2] << 8) | +rgba[3], alpha: rgba[4] === undefined ? 1 : +rgba[4] };
}

const rootBlock = /:root\s*\{([^}]*)\}/.exec(css)![1];
const darkBlock = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)![1];
const light = tokensOf(rootBlock);
const themes: Record<string, Tokens> = { light, dark: { ...light, ...tokensOf(darkBlock) } };

const grounds = Object.entries(GROUP_COLORS);
const hexCss = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const fmt = (n: number) => n.toFixed(2);

describe("ui.css tokens", () => {
  it("parses both themes", () => {
    expect(light.text).toBe("#1c2429");
    expect(themes.dark.text).toBe("#e8eef1");
    expect(themes.dark["accent-text"]).toBe("#0d1a20");
    expect(themes.dark["label-fg"]).toBe(light["label-fg"]); // labels sit on the unthemed canvas
  });

  it("keeps the label colours in sync with overlay/labels.ts", () => {
    expect(color(light["label-fg"]).color).toBe(LABEL_TEXT);
    const halo = color(light["label-halo"]);
    expect(halo.color).toBe(LABEL_HALO);
    expect(halo.alpha).toBeCloseTo(LABEL_HALO_ALPHA, 5);
  });
});

describe.each(Object.keys(themes))("text contrast, %s theme (>= 4.5:1)", (name) => {
  const t = themes[name];
  const c = (k: string) => color(t[k]).color;
  const pairs: Array<[string, string, string]> = [
    ["text", "surface-strong", "body text on panels"],
    ["text", "bg", "body text on the page background"],
    ["text-muted", "surface-strong", "muted text on panels"],
    ["text-muted", "bg", "muted text on the page background"],
    ["accent", "surface-strong", "links and accent text on panels"],
    ["accent-text", "accent", "selected marker, pressed and primary buttons"],
    ["bg", "text", "toast (inverted)"],
    ["doc-fg", "doc-bg", "documented badge"],
    ["inf-fg", "inf-bg", "inferred badge"],
    ["ill-fg", "ill-bg", "illustrative badge"],
  ];
  it.each(pairs)("%s on %s (%s)", (fg, bg) => {
    expect(contrastRatio(c(fg), c(bg)), `${fg} on ${bg} in ${name}`).toBeGreaterThanOrEqual(4.5);
  });

  it("text on the hover and active-option tint of a panel", () => {
    const hover = color(t.hover);
    const tinted = blend(hover.color, hover.alpha, c("surface-strong"));
    expect(contrastRatio(c("text"), tinted)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c("text-muted"), tinted)).toBeGreaterThanOrEqual(4.5);
  });

  it("marker chip text stays readable over every ground colour", () => {
    const surface = color(t.surface);
    for (const [group, ground] of grounds) {
      const chip = blend(surface.color, surface.alpha, ground);
      const ratio = contrastRatio(c("text"), chip);
      expect(ratio, `marker chip over ${group} (${hexCss(ground)})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the status line text stays readable over every ground colour", () => {
    const surface = color(t.surface);
    for (const [group, ground] of grounds) {
      const box = blend(surface.color, surface.alpha, ground);
      expect(contrastRatio(c("text-muted"), box), `status over ${group}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the focus ring is visible against panels and the page (>= 3:1)", () => {
    expect(contrastRatio(c("focus"), c("surface-strong"))).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(c("focus"), c("bg"))).toBeGreaterThanOrEqual(3);
  });
});

describe("map labels", () => {
  it("text on its halo meets 4.5:1, also over every ground colour", () => {
    expect(meetsContrast(LABEL_TEXT, LABEL_HALO, 4.5)).toBe(true);
    for (const [group, ground] of grounds) {
      const halo = blend(LABEL_HALO, LABEL_HALO_ALPHA, ground);
      expect(contrastRatio(LABEL_TEXT, halo), `halo over ${group}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("canvas focus ring", () => {
  it("is a fixed colour that stands out from the (unthemed) scene background", () => {
    const ring = color(light["canvas-ring"]).color;
    expect(contrastRatio(ring, SCENE_BACKGROUND)).toBeGreaterThanOrEqual(3);
    // and in dark mode it is the same colour: the scene does not change with the theme
    expect(themes.dark["canvas-ring"]).toBe(light["canvas-ring"]);
  });
});

describe("street lines (a faint orientation aid, not text)", () => {
  const lum = (h: number) => contrastRatio(h, 0x000000); // monotonic in luminance
  const sorted = [...grounds].sort((a, b) => lum(a[1]) - lum(b[1]));
  const [darkestName, darkest] = sorted[0];
  const [lightestName, lightest] = sorted[sorted.length - 1];

  it("identifies the extremes", () => {
    expect(darkestName).toBe("woodland");
    expect(lightestName).toBe("beach");
  });

  it("clears 1.5:1 against the darkest and lightest ground colours", () => {
    expect(contrastRatio(STREET_COLOR, darkest)).toBeGreaterThanOrEqual(1.5);
    expect(contrastRatio(STREET_COLOR, lightest)).toBeGreaterThanOrEqual(1.5);
  });

  it("clears 1.5:1 against every ground colour, at each street class's opacity", () => {
    for (const [kind, opacity] of Object.entries(STREET_OPACITY)) {
      for (const [group, ground] of grounds) {
        const drawn = blend(STREET_COLOR, opacity, ground);
        const ratio = contrastRatio(drawn, ground);
        expect(ratio, `${kind} streets over ${group}: ${fmt(ratio)}`).toBeGreaterThanOrEqual(1.5);
      }
    }
  });
});

describe("vegetation shapes against their ground", () => {
  // Not WCAG: a rough check that a plant is told apart from the colour it stands on.
  it("each plant colour differs from the ground of every group it grows in", () => {
    const colorOf = { tree: VEG_COLORS.canopy, shrub: VEG_COLORS.shrub, reed: VEG_COLORS.reed };
    for (const [group, spec] of Object.entries(VEGETATION_BY_GROUP)) {
      if (!spec) continue;
      const ratio = contrastRatio(colorOf[spec.kind], GROUP_COLORS[group]);
      expect(ratio, `${spec.kind} on ${group}: ${fmt(ratio)}`).toBeGreaterThanOrEqual(1.3);
    }
  });
});
