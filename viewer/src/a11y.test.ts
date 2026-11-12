import { describe, expect, it } from "vitest";
import { blend, contrastRatio, meetsContrast, nextAnnouncement, relativeLuminance } from "./a11y";

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance(0x000000)).toBe(0);
    expect(relativeLuminance(0xffffff)).toBeCloseTo(1, 10);
  });
  it("matches known WCAG values", () => {
    expect(relativeLuminance(0xff0000)).toBeCloseTo(0.2126, 4);
    expect(relativeLuminance(0x00ff00)).toBeCloseTo(0.7152, 4);
    expect(relativeLuminance(0x0000ff)).toBeCloseTo(0.0722, 4);
  });
  it("ignores bits above 24", () => {
    expect(relativeLuminance(0xff000000 | 0x336699)).toBeCloseTo(relativeLuminance(0x336699), 12);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white, in either order", () => {
    expect(contrastRatio(0x000000, 0xffffff)).toBeCloseTo(21, 6);
    expect(contrastRatio(0xffffff, 0x000000)).toBeCloseTo(21, 6);
  });
  it("is 1 for identical colours", () => {
    expect(contrastRatio(0x123456, 0x123456)).toBe(1);
    expect(contrastRatio(0xffffff, 0xffffff)).toBe(1);
  });
  it("matches published values for #767676 and #777777 on white", () => {
    expect(contrastRatio(0x767676, 0xffffff)).toBeCloseTo(4.54, 2); // the lightest grey that passes AA
    expect(contrastRatio(0x777777, 0xffffff)).toBeCloseTo(4.48, 2);
  });
  it("matches the well-known mid greys on white", () => {
    expect(contrastRatio(0x808080, 0xffffff)).toBeCloseTo(3.95, 2);
    expect(contrastRatio(0x595959, 0xffffff)).toBeCloseTo(7.0, 1);
  });
});

describe("meetsContrast", () => {
  it("compares against the minimum, inclusive", () => {
    expect(meetsContrast(0x767676, 0xffffff, 4.5)).toBe(true);
    expect(meetsContrast(0x777777, 0xffffff, 4.5)).toBe(false);
    expect(meetsContrast(0x000000, 0xffffff, 21 - 1e-9)).toBe(true);
    expect(meetsContrast(0x123456, 0x123456, 1)).toBe(true);
    expect(meetsContrast(0x123456, 0x123456, 1.01)).toBe(false);
  });
});

describe("blend", () => {
  it("mixes a foreground over a background by alpha", () => {
    expect(blend(0xffffff, 1, 0x000000)).toBe(0xffffff);
    expect(blend(0xffffff, 0, 0x102030)).toBe(0x102030);
    expect(blend(0xffffff, 0.5, 0x000000)).toBe(0x808080);
    expect(blend(0xff0000, 0.25, 0x0000ff)).toBe(0x4000bf);
  });
  it("clamps alpha", () => {
    expect(blend(0xffffff, 2, 0x000000)).toBe(0xffffff);
    expect(blend(0xffffff, -1, 0x000000)).toBe(0x000000);
  });
});

describe("nextAnnouncement", () => {
  it("returns the text unchanged when it differs from the previous one", () => {
    expect(nextAnnouncement("Streets on", "Streets off")).toBe("Streets on");
    expect(nextAnnouncement("Streets on", "")).toBe("Streets on");
  });
  it("makes a repeated message differ so screen readers announce it again", () => {
    const first = nextAnnouncement("Selected: Lobos Creek", "");
    const second = nextAnnouncement("Selected: Lobos Creek", first);
    expect(second).not.toBe(first);
    expect(second.trim()).toBe("Selected: Lobos Creek");
    expect(nextAnnouncement("Selected: Lobos Creek", second)).toBe(first);
  });
});
