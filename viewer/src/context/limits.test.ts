import { describe, expect, it } from "vitest";
import { fitViewSize } from "../camera";
import { ringBounds, ringFitViewSize, ringMinZoom, ringRect } from "./limits";
import type { ContextDoc } from "./types";

const doc = {
  cols: 11,
  rows: 6,
  x0: -1000,
  z0: -300,
  dx: 400,
  dz: 200,
} as ContextDoc;

describe("ringRect and ringBounds", () => {
  it("spans the lattice vertices", () => {
    expect(ringRect(doc)).toEqual({ minX: -1000, maxX: 3000, minZ: -300, maxZ: 700 });
  });
  it("is a centred rectangle in the MapBounds form", () => {
    expect(ringBounds(doc)).toEqual({ halfWidth: 2000, halfDepth: 500, centerX: 1000, centerZ: 200 });
  });
});

describe("ringMinZoom", () => {
  it("is the ratio of the fits times a safety factor", () => {
    expect(ringMinZoom(100, 400, 1)).toBeCloseTo(0.25);
    expect(ringMinZoom(100, 400)).toBeCloseTo(0.25 * 0.92);
  });
  it("rejects non-positive sizes", () => {
    expect(() => ringMinZoom(0, 400)).toThrow();
    expect(() => ringMinZoom(100, -1)).toThrow();
  });
});

describe("ringFitViewSize", () => {
  it("is the camera fit of the ring rectangle", () => {
    expect(ringFitViewSize(doc, 50, 1.5)).toBeCloseTo(fitViewSize(4000, 1000, 50, 1.5));
  });
});
