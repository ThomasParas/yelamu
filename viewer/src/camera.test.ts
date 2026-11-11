import { describe, expect, it } from "vitest";
import { ISO_ELEVATION, isoOffset, panDelta } from "./camera";

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
