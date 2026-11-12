import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  STREET_COLOR,
  STREET_OPACITY,
  STREET_LIFT_M,
  STREET_STEP_M,
  STREET_THRESHOLDS,
  StreetsLayer,
  streetKindVisibility,
} from "./streetsLayer";

const t = { secondary: 2, local: 4 };

describe("streetKindVisibility", () => {
  it("always shows primary streets", () => {
    expect(streetKindVisibility(0.1, t).primary).toBe(true);
    expect(streetKindVisibility(Number.NaN, t).primary).toBe(true);
  });

  it("adds secondary then local as the zoom grows", () => {
    expect(streetKindVisibility(1.99, t)).toEqual({ primary: true, secondary: false, local: false });
    expect(streetKindVisibility(2, t)).toEqual({ primary: true, secondary: true, local: false });
    expect(streetKindVisibility(3.99, t)).toEqual({ primary: true, secondary: true, local: false });
    expect(streetKindVisibility(4, t)).toEqual({ primary: true, secondary: true, local: true });
    expect(streetKindVisibility(40, t)).toEqual({ primary: true, secondary: true, local: true });
  });

  it("treats a non-finite zoom as zoomed out", () => {
    expect(streetKindVisibility(Number.NaN, t)).toEqual({ primary: true, secondary: false, local: false });
  });
});

describe("named constants", () => {
  it("are exported for tuning", () => {
    expect(STREET_LIFT_M).toBe(4);
    expect(STREET_STEP_M).toBeGreaterThan(0);
    expect(STREET_THRESHOLDS.secondary).toBeLessThan(STREET_THRESHOLDS.local);
  });
});

describe("StreetsLayer", () => {
  const overlay = {
    streets: [
      { name: "A", kind: "primary" as const, lines: [[0, 0, 100, 0]] },
      { name: "B", kind: "secondary" as const, lines: [[0, 10, 100, 10]] },
      { name: "C", kind: "local" as const, lines: [[0, 20, 100, 20], [0, 30, 100, 30]] },
    ],
  };
  const make = () =>
    new StreetsLayer(overlay, () => 1, { exaggeration: 3, liftM: STREET_LIFT_M, stepM: 50, thresholds: t });
  const kids = (l: StreetsLayer) => Object.fromEntries(l.object.children.map((c) => [c.name, c.visible]));

  it("builds one LineSegments per kind with the documented material settings", () => {
    const l = make();
    expect(l.object.children).toHaveLength(3);
    const primary = l.object.children[0] as THREE.LineSegments;
    expect(primary).toBeInstanceOf(THREE.LineSegments);
    const m = primary.material as THREE.LineBasicMaterial;
    expect(m.color.getHex()).toBe(STREET_COLOR);
    expect(m.opacity).toBe(0.95);
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect(((l.object.children[1] as THREE.LineSegments).material as THREE.LineBasicMaterial).color.getHex()).toBe(STREET_COLOR);
    expect(((l.object.children[2] as THREE.LineSegments).material as THREE.LineBasicMaterial).opacity).toBe(STREET_OPACITY.local);
  });

  it("puts each street in its own kind's geometry, lifted and exaggerated", () => {
    const l = make();
    const counts = l.object.children.map((c) => (c as THREE.LineSegments).geometry.getAttribute("position").count);
    expect(counts).toEqual([4, 4, 8]); // 100 m at 50 m steps = 2 segments per line
    const pos = (l.object.children[0] as THREE.LineSegments).geometry.getAttribute("position");
    expect(pos.getY(0)).toBe((1 + STREET_LIFT_M) * 3);
  });

  it("update() shows kinds by zoom and reports changes", () => {
    const l = make();
    expect(l.update(1)).toBe(true);
    expect(kids(l)).toEqual({ "streets-primary": true, "streets-secondary": false, "streets-local": false });
    expect(l.update(1)).toBe(false);
    expect(l.update(3)).toBe(true);
    expect(kids(l)["streets-secondary"]).toBe(true);
    expect(l.update(3.5)).toBe(false); // new zoom, same visibility
    expect(l.update(5)).toBe(true);
    expect(kids(l)["streets-local"]).toBe(true);
    expect(l.update(1)).toBe(true);
    expect(kids(l)["streets-local"]).toBe(false);
  });

  it("setEnabled toggles the whole group without losing the per-kind state", () => {
    const l = make();
    l.update(5);
    l.setEnabled(false);
    expect(l.object.visible).toBe(false);
    expect(l.isEnabled()).toBe(false);
    l.setEnabled(true);
    expect(l.object.visible).toBe(true);
    expect(kids(l)["streets-local"]).toBe(true);
  });

  it("copes with an overlay without streets", () => {
    const l = new StreetsLayer({ streets: [] }, () => 0, { exaggeration: 1, liftM: 0, stepM: 10, thresholds: t });
    expect(() => l.update(10)).not.toThrow();
    expect((l.object.children[0] as THREE.LineSegments).geometry.getAttribute("position").count).toBe(0);
  });
});
