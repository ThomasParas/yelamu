import { describe, expect, it } from "vitest";
import { makeHeightSampler } from "./heightAt";

// 3 columns x 2 rows, 10 m cells. Columns at x = -10, 0, 10; rows at z = -5, 5 (row 0 = north).
//   row 0:  0  10  20
//   row 1: 30  40  50
const heights = new Float32Array([0, 10, 20, 30, 40, 50]);
const size = { width: 3, height: 2, cell_m: 10 };
const h = makeHeightSampler(heights, size);

describe("makeHeightSampler", () => {
  it("is exact at cell centres", () => {
    expect(h(-10, -5)).toBeCloseTo(0);
    expect(h(0, -5)).toBeCloseTo(10);
    expect(h(10, -5)).toBeCloseTo(20);
    expect(h(-10, 5)).toBeCloseTo(30);
    expect(h(0, 5)).toBeCloseTo(40);
    expect(h(10, 5)).toBeCloseTo(50);
  });

  it("is linear between samples", () => {
    expect(h(-5, -5)).toBeCloseTo(5); // halfway along the north row
    expect(h(5, 5)).toBeCloseTo(45);
    expect(h(-10, 0)).toBeCloseTo(15); // halfway between rows at the west column
    expect(h(0, 0)).toBeCloseTo(25);
    expect(h(2.5, -5)).toBeCloseTo(12.5);
    // bilinear at the middle of the first cell: mean of 0, 10, 30, 40
    expect(h(-5, 0)).toBeCloseTo(20);
  });

  it("clamps outside the grid to the nearest edge", () => {
    expect(h(-1000, -1000)).toBeCloseTo(0);
    expect(h(1000, 1000)).toBeCloseTo(50);
    expect(h(1000, -1000)).toBeCloseTo(20);
    expect(h(-1000, 1000)).toBeCloseTo(30);
    expect(h(0, -1000)).toBeCloseTo(10); // clamps z, keeps x
    expect(h(1000, 0)).toBeCloseTo(35); // clamps x, interpolates z
  });

  it("puts north at -z and east at +x", () => {
    expect(h(0, -5)).toBeLessThan(h(0, 5)); // row 0 (north) is lower here
    expect(h(-10, 0)).toBeLessThan(h(10, 0));
  });

  it("handles non-finite input and one-sample axes", () => {
    expect(h(NaN, NaN)).toBeCloseTo(25);
    expect(Number.isFinite(h(Infinity, -Infinity))).toBe(true);
    const one = makeHeightSampler(new Float32Array([7]), { width: 1, height: 1, cell_m: 10 });
    expect(one(123, -456)).toBe(7);
    const row = makeHeightSampler(new Float32Array([0, 10]), { width: 2, height: 1, cell_m: 10 });
    expect(row(0, 99)).toBeCloseTo(5);
    const col = makeHeightSampler(new Float32Array([0, 10]), { width: 1, height: 2, cell_m: 10 });
    expect(col(99, 0)).toBeCloseTo(5);
  });

  it("matches the terrain vertex frame: grid centre is the origin", () => {
    const sq = makeHeightSampler(new Float32Array([1, 2, 3, 4]), { width: 2, height: 2, cell_m: 100 });
    expect(sq(-50, -50)).toBeCloseTo(1);
    expect(sq(50, -50)).toBeCloseTo(2);
    expect(sq(-50, 50)).toBeCloseTo(3);
    expect(sq(50, 50)).toBeCloseTo(4);
    expect(sq(0, 0)).toBeCloseTo(2.5);
  });

  it("rejects a mismatched array", () => {
    expect(() => makeHeightSampler(new Float32Array(5), size)).toThrow(/expected 6/);
  });
});
