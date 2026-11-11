import { describe, expect, it } from "vitest";
import { fitViewSize, ISO_ELEVATION, isoOffset, panDelta } from "./camera";

describe("isoOffset", () => {
  it("has the requested length", () => {
    expect(isoOffset(100, Math.PI / 4, ISO_ELEVATION).length()).toBeCloseTo(100);
  });

  it("looks down at the isometric angle", () => {
    const v = isoOffset(1, Math.PI / 4, ISO_ELEVATION);
    expect(Math.asin(v.y)).toBeCloseTo(35.264 * (Math.PI / 180), 3);
  });

  it("azimuth 0 puts the camera due south of the target", () => {
    const v = isoOffset(10, 0, Math.PI / 4);
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeGreaterThan(0); // +Z is south
  });
});

describe("panDelta", () => {
  it("dragging right moves the target west so the map follows the cursor", () => {
    const d = panDelta(10, 0, 1, 0, Math.PI / 2);
    expect(d.x).toBeCloseTo(-10);
    expect(d.z).toBeCloseTo(0);
  });

  it("dragging down moves the target north (top-down view)", () => {
    const d = panDelta(0, 10, 1, 0, Math.PI / 2);
    expect(d.x).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(-10);
  });

  it("compensates for foreshortening at the isometric angle", () => {
    const flat = panDelta(0, 10, 1, 0, Math.PI / 2).length();
    const iso = panDelta(0, 10, 1, 0, ISO_ELEVATION).length();
    expect(iso / flat).toBeCloseTo(1 / Math.sin(ISO_ELEVATION), 5);
  });
});

describe("fitViewSize", () => {
  const horizontal = (w: number, d: number) => (w + d) / Math.SQRT2;
  const vertical = (w: number, d: number, h: number) =>
    horizontal(w, d) * Math.sin(ISO_ELEVATION) + h * Math.cos(ISO_ELEVATION);

  it("is limited by the horizontal extent for a flat square map at aspect 1", () => {
    expect(fitViewSize(1000, 1000, 0, 1)).toBeCloseTo(1414.2136 * 1.1, 3);
  });

  it("is limited by the vertical extent at a wide aspect", () => {
    expect(fitViewSize(1000, 1000, 0, 3)).toBeCloseTo(vertical(1000, 1000, 0) * 1.1, 5);
  });

  it("grows at a portrait aspect, where the horizontal extent limits", () => {
    const portrait = fitViewSize(1000, 1000, 0, 0.5);
    expect(portrait).toBeCloseTo((horizontal(1000, 1000) / 0.5) * 1.1, 5);
    expect(portrait).toBeGreaterThan(fitViewSize(1000, 1000, 0, 1));
  });

  it("grows with terrain height", () => {
    expect(fitViewSize(1000, 1000, 300, 3)).toBeGreaterThan(fitViewSize(1000, 1000, 0, 3));
  });
});
