import { describe, expect, it } from "vitest";
import { SURPRISE_TARGET_FRACTION, pickSurpriseTarget, type SurpriseTarget } from "./surprise";

const targets: SurpriseTarget[] = [
  { x: 1, z: 1, zoom: 5, place: "a" },
  { x: 2, z: 2, zoom: 5, place: "b" },
  { x: 3, z: 3, zoom: 5 },
];
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

describe("pickSurpriseTarget", () => {
  it("returns null without targets", () => {
    expect(pickSurpriseTarget([], () => 0)).toBeNull();
  });

  it("goes to a target when the first draw is under the fraction", () => {
    expect(pickSurpriseTarget(targets, seq(0.1, 0.0))).toBe(targets[0]);
    expect(pickSurpriseTarget(targets, seq(0.59, 0.5))).toBe(targets[1]);
    expect(pickSurpriseTarget(targets, seq(0.0, 0.99999))).toBe(targets[2]);
  });

  it("falls back to a random land point otherwise", () => {
    expect(pickSurpriseTarget(targets, seq(0.6, 0.0))).toBeNull();
    expect(pickSurpriseTarget(targets, seq(0.99, 0.0))).toBeNull();
  });

  it("is about 60% over many draws", () => {
    let state = 12345;
    const rng = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    let hits = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (pickSurpriseTarget(targets, rng)) hits++;
    expect(hits / n).toBeGreaterThan(SURPRISE_TARGET_FRACTION - 0.05);
    expect(hits / n).toBeLessThan(SURPRISE_TARGET_FRACTION + 0.05);
  });

  it("honours a custom fraction and a rng that returns 1", () => {
    expect(pickSurpriseTarget(targets, seq(0.3, 0), 0.2)).toBeNull();
    expect(pickSurpriseTarget(targets, seq(0.3, 0), 1)).toBe(targets[0]);
    expect(pickSurpriseTarget(targets, seq(0, 1))).toBe(targets[2]);
  });
});
