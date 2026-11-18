import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SUN_DIRECTION,
  VERTICAL_EXAGGERATION,
  makeTerrainShade,
  shadeProblem,
  withShade,
  type ShadeMeta,
} from "./terrainShade";

const meta = (over: Partial<ShadeMeta> = {}): ShadeMeta => ({
  file: "shade.u8",
  cols: 3,
  rows: 3,
  stride: 2,
  exaggeration: VERTICAL_EXAGGERATION,
  sun: [...SUN_DIRECTION],
  ...over,
});

describe("shadeProblem", () => {
  it("accepts a grid that covers the map at its stride, with the last row/column included", () => {
    expect(shadeProblem(meta(), { width: 5, height: 5 })).toBeNull();
    expect(shadeProblem(meta({ cols: 4 }), { width: 6, height: 5 })).toBeNull(); // cols 0, 2, 4, 5
  });

  it("rejects a grid of the wrong size or a bad stride", () => {
    expect(shadeProblem(meta(), { width: 7, height: 5 })).toMatch(/does not fit/);
    expect(shadeProblem(meta({ stride: 0 }), { width: 5, height: 5 })).toMatch(/stride/);
  });

  it("rejects a bake made for another exaggeration or sun", () => {
    expect(shadeProblem(meta({ exaggeration: 2 }), { width: 5, height: 5 })).toMatch(/exaggeration/);
    expect(shadeProblem(meta({ sun: [1, 1, 1] }), { width: 5, height: 5 })).toMatch(/sun/);
    expect(shadeProblem(meta({ sun: [1, 1] }), { width: 5, height: 5 })).toMatch(/sun/);
  });
});

describe("makeTerrainShade", () => {
  // 5x5 map, stride 2: coarse samples on map columns/rows 0, 2, 4.
  const bytes = Uint8Array.from([0, 51, 102, 51, 102, 153, 102, 153, 204]);
  const shade = makeTerrainShade(meta(), { width: 5, height: 5 }, bytes);

  it("returns the coarse value exactly on coarse samples", () => {
    expect(shade.at(0)).toBeCloseTo(0, 6);
    expect(shade.at(2)).toBeCloseTo(0.2, 6); // row 0, col 2
    expect(shade.at(4 * 5 + 4)).toBeCloseTo(0.8, 6); // last corner
  });

  it("interpolates bilinearly between them", () => {
    expect(shade.at(1)).toBeCloseTo(0.1, 6); // halfway along row 0
    expect(shade.at(1 * 5 + 1)).toBeCloseTo(0.2, 6); // centre of the first coarse cell
  });

  it("handles a last coarse step shorter than the stride", () => {
    // 6 wide: coarse columns at 0, 2, 4, 5; column 5 is one sample after column 4.
    const s = makeTerrainShade(meta({ cols: 4 }), { width: 6, height: 5 }, Uint8Array.from([
      0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
    ]));
    expect(s.at(5)).toBeCloseTo(1, 6);
    expect(s.at(4)).toBeCloseTo(0, 6);
  });

  it("refuses bytes that do not match the grid", () => {
    expect(() => makeTerrainShade(meta(), { width: 5, height: 5 }, new Uint8Array(8))).toThrow(/expected 9/);
  });
});

describe("withShade", () => {
  const half = { at: () => 0.5 };
  const base = () => [0.4, 0.6, 0.8] as [number, number, number];

  it("darkens ground above the water level", () => {
    expect(withShade(base, half, 1)(0, 5)).toEqual([0.2, 0.3, 0.4]);
  });

  it("leaves ground at or under the water level alone", () => {
    expect(withShade(base, half, 1)(0, 1)).toEqual([0.4, 0.6, 0.8]);
    expect(withShade(base, half, 1)(0, -3)).toEqual([0.4, 0.6, 0.8]);
  });
});

describe("the shipped real-city bake", () => {
  const dir = new URL("../public/assets/real-city/", import.meta.url);
  const city = JSON.parse(readFileSync(new URL("meta.json", dir), "utf8"));

  it("matches this viewer (rebuild with pipeline/scripts/build_shade.py if not)", () => {
    expect(city.shade).toBeDefined();
    expect(shadeProblem(city.shade, city)).toBeNull();
  });

  it("has one byte per coarse sample and stays in a sensible range", () => {
    const bytes = readFileSync(new URL(city.shade.file, dir));
    expect(bytes.length).toBe(city.shade.cols * city.shade.rows);
    let sum = 0;
    for (const b of bytes) sum += b;
    expect(sum / bytes.length / 255).toBeGreaterThan(0.85); // mostly lit
    expect(Math.min(...bytes.slice(0, 100000))).toBeGreaterThan(0); // never black
  });
});
