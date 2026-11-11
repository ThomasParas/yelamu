import { describe, expect, it } from "vitest";
import { buildTerrainGeometry } from "./terrainMesh";

const size = { width: 3, height: 3, cell_m: 10 };
// Row 0 is the NORTH edge. Heights 0..8 make every vertex identifiable.
const heights = Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8]);

describe("buildTerrainGeometry", () => {
  const geo = buildTerrainGeometry(heights, size);
  const pos = geo.getAttribute("position");

  it("puts each height on the matching vertex", () => {
    for (let i = 0; i < 9; i++) expect(pos.getY(i)).toBeCloseTo(i);
  });

  it("is centred on the origin and spans (n-1) cells", () => {
    expect(pos.getX(0)).toBeCloseTo(-10); // west edge
    expect(pos.getX(2)).toBeCloseTo(10); // east edge
  });

  it("puts row 0 (north) at negative Z", () => {
    expect(pos.getZ(0)).toBeCloseTo(-10); // north-west corner
    expect(pos.getZ(6)).toBeCloseTo(10); // south-west corner
  });

  it("applies vertical exaggeration", () => {
    const tall = buildTerrainGeometry(heights, size, 3);
    expect(tall.getAttribute("position").getY(8)).toBeCloseTo(24);
  });

  it("rejects mismatched sizes", () => {
    expect(() => buildTerrainGeometry(new Float32Array(4), size)).toThrow();
  });
});
