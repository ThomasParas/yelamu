import { describe, expect, it } from "vitest";
import { buildSegmentGeometry, drapePolyline } from "./drape";

const flat = () => 0;
const ramp = (x: number) => x / 10; // height grows 1 m per 10 m east

describe("drapePolyline", () => {
  it("keeps short segments as they are", () => {
    expect(drapePolyline([0, 0, 5, 0], ramp, 10)).toEqual([0, 0, 0, 5, 0.5, 0]);
  });

  it("subdivides so that no step exceeds stepM", () => {
    const out = drapePolyline([0, 0, 100, 0], flat, 30);
    // ceil(100 / 30) = 4 parts -> 5 points
    expect(out.length / 3).toBe(5);
    const xs = out.filter((_, i) => i % 3 === 0);
    expect(xs).toEqual([0, 25, 50, 75, 100]);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeLessThanOrEqual(30);
  });

  it("an exact multiple of the step does not add an extra point", () => {
    expect(drapePolyline([0, 0, 100, 0], flat, 50).length / 3).toBe(3);
    expect(drapePolyline([0, 0, 100, 0], flat, 100).length / 3).toBe(2);
  });

  it("measures the step horizontally on diagonals", () => {
    const out = drapePolyline([0, 0, 30, 40], flat, 10); // length 50 -> 5 parts
    expect(out.length / 3).toBe(6);
    expect(out.slice(3, 6)).toEqual([6, 0, 8]);
  });

  it("takes y from heightAt (un-exaggerated) and keeps original vertices exactly", () => {
    const out = drapePolyline([0, 0, 20, 0, 20, 20], ramp, 10);
    // points: (0,0) (10,0) (20,0) (20,10) (20,20)
    expect(out.length / 3).toBe(5);
    expect(out[1]).toBe(0);
    expect(out[4]).toBe(1);
    expect(out.slice(6, 9)).toEqual([20, 2, 0]);
    expect(out.slice(12, 15)).toEqual([20, 2, 20]);
  });

  it("handles degenerate input", () => {
    expect(drapePolyline([], flat, 10)).toEqual([]);
    expect(drapePolyline([3, 4], ramp, 10)).toEqual([3, 0.3, 4]);
    expect(drapePolyline([1, 1, 1, 1], flat, 10)).toEqual([1, 0, 1, 1, 0, 1]); // zero-length segment
    expect(drapePolyline([0, 0, 10, 0, 99], flat, 10).length / 3).toBe(2); // trailing value ignored
  });

  it("rejects a non-positive step", () => {
    expect(() => drapePolyline([0, 0, 1, 1], flat, 0)).toThrow(RangeError);
    expect(() => drapePolyline([0, 0, 1, 1], flat, -5)).toThrow(RangeError);
    expect(() => drapePolyline([0, 0, 1, 1], flat, NaN)).toThrow(RangeError);
  });
});

describe("buildSegmentGeometry", () => {
  const pos = (g: ReturnType<typeof buildSegmentGeometry>) =>
    Array.from(g.getAttribute("position").array as Float32Array);

  it("pairs consecutive points of every line", () => {
    const g = buildSegmentGeometry([[0, 0, 10, 0, 10, 10]], flat, 100, 1, 0);
    // 3 points -> 2 segments -> 4 vertices
    expect(g.getAttribute("position").count).toBe(4);
    expect(pos(g)).toEqual([0, 0, 0, 10, 0, 0, 10, 0, 0, 10, 0, 10]);
  });

  it("does not join separate lines", () => {
    const g = buildSegmentGeometry([[0, 0, 10, 0], [50, 0, 60, 0]], flat, 100, 1, 0);
    expect(g.getAttribute("position").count).toBe(4);
    expect(pos(g).slice(3, 9)).toEqual([10, 0, 0, 50, 0, 0]);
  });

  it("applies (height + lift) * exaggeration to y only", () => {
    const g = buildSegmentGeometry([[0, 0, 10, 0]], ramp, 100, 3, 4);
    expect(pos(g)).toEqual([0, 12, 0, 10, 15, 0]); // (0+4)*3, (1+4)*3
  });

  it("subdivides before pairing", () => {
    const g = buildSegmentGeometry([[0, 0, 100, 0]], flat, 25, 1, 0);
    expect(g.getAttribute("position").count).toBe(8); // 4 segments
  });

  it("returns an empty geometry for no input", () => {
    expect(buildSegmentGeometry([], flat, 10, 1, 0).getAttribute("position").count).toBe(0);
    expect(buildSegmentGeometry([[1, 1]], flat, 10, 1, 0).getAttribute("position").count).toBe(0);
    expect(buildSegmentGeometry([[]], flat, 10, 1, 0).getAttribute("position").count).toBe(0);
  });

  it("computes a bounding sphere that contains the line", () => {
    const g = buildSegmentGeometry([[0, 0, 100, 0]], flat, 50, 1, 0);
    expect(g.boundingSphere).not.toBeNull();
    expect(g.boundingSphere!.radius).toBeGreaterThanOrEqual(50);
  });
});
