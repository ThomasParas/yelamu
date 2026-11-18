import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { HOTSPOT_PRIORITY, VILLAGE_PRIORITY, declutter, landmarkPriority, projectToScreen, type DeclutterItem } from "./labels";

const item = (id: string, x: number, y: number, priority = 1, w = 50, h = 14): DeclutterItem => ({
  id,
  x,
  y,
  w,
  h,
  priority,
});

describe("projectToScreen", () => {
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -100, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  it("maps the view centre to the canvas centre", () => {
    const p = projectToScreen(new THREE.Vector3(0, 0, 0), camera, 800, 600);
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeCloseTo(300);
  });

  it("puts up at the top (y grows downwards) and right at the right", () => {
    const tr = projectToScreen(new THREE.Vector3(10, 10, 0), camera, 800, 600);
    expect(tr.x).toBeCloseTo(800);
    expect(tr.y).toBeCloseTo(0);
    const bl = projectToScreen(new THREE.Vector3(-10, -10, 0), camera, 800, 600);
    expect(bl.x).toBeCloseTo(0);
    expect(bl.y).toBeCloseTo(600);
  });

  it("follows the camera zoom and does not modify the input point", () => {
    const zoomed = camera.clone();
    zoomed.zoom = 2;
    zoomed.updateProjectionMatrix();
    zoomed.updateMatrixWorld();
    const pt = new THREE.Vector3(5, 0, 0);
    const p = projectToScreen(pt, zoomed, 200, 200);
    expect(p.x).toBeCloseTo(200); // 5 m at zoom 2 is the right edge
    expect(pt.toArray()).toEqual([5, 0, 0]);
  });

  it("returns points outside the viewport as out-of-range coordinates", () => {
    expect(projectToScreen(new THREE.Vector3(30, 0, 0), camera, 100, 100).x).toBeCloseTo(200);
  });
});

describe("declutter", () => {
  it("keeps everything that does not overlap", () => {
    const kept = declutter([item("a", 0, 0), item("b", 100, 0), item("c", 0, 100)], 4);
    expect([...kept].sort()).toEqual(["a", "b", "c"]);
  });

  it("drops the lower priority of two overlapping items", () => {
    const kept = declutter([item("low", 10, 0, 1), item("high", 0, 0, 5)], 4);
    expect([...kept]).toEqual(["high"]);
  });

  it("requires the padding between rectangles", () => {
    // a covers x 0..50; b starts at 52: 2 px gap
    expect(declutter([item("a", 0, 0, 2), item("b", 52, 0, 1)], 4).has("b")).toBe(false);
    expect(declutter([item("a", 0, 0, 2), item("b", 52, 0, 1)], 2).has("b")).toBe(true);
    expect(declutter([item("a", 0, 0, 2), item("b", 54, 0, 1)], 4).has("b")).toBe(true);
    // padding applies vertically too
    expect(declutter([item("a", 0, 0, 2), item("b", 0, 16, 1)], 4).has("b")).toBe(false);
    expect(declutter([item("a", 0, 0, 2), item("b", 0, 18, 1)], 4).has("b")).toBe(true);
  });

  it("breaks priority ties by id, whatever the input order", () => {
    const a = item("a", 0, 0, 3);
    const b = item("b", 5, 0, 3);
    expect([...declutter([a, b], 4)]).toEqual(["a"]);
    expect([...declutter([b, a], 4)]).toEqual(["a"]);
  });

  it("is greedy: a dropped item does not block others", () => {
    // b overlaps a (dropped), c overlaps b but not a: c survives
    const kept = declutter([item("a", 0, 0, 9), item("b", 40, 0, 5), item("c", 80, 0, 1)], 4);
    expect([...kept].sort()).toEqual(["a", "c"]);
  });

  it("is deterministic for identical input and handles empty input and duplicate ids", () => {
    expect(declutter([], 4).size).toBe(0);
    const input = Array.from({ length: 30 }, (_, i) => item(`i${i}`, (i * 13) % 90, (i * 7) % 40, i % 4));
    expect([...declutter(input, 4)]).toEqual([...declutter([...input].reverse(), 4)]);
    expect(declutter([item("x", 0, 0), item("x", 500, 0)], 4).size).toBe(1);
  });

  it("does not mutate its input", () => {
    const input = [item("b", 0, 0, 1), item("a", 0, 0, 2)];
    declutter(input, 4);
    expect(input.map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("landmarkPriority", () => {
  it("ranks kinds and defaults unknown ones", () => {
    expect(landmarkPriority("hill")).toBeGreaterThan(landmarkPriority("building"));
    expect(landmarkPriority("nonsense")).toBe(landmarkPriority("other"));
    expect(landmarkPriority("constructor")).toBe(landmarkPriority("other"));
  });
});

describe("village label priority", () => {
  it("equals the hotspot priority, so village names win over every landmark", () => {
    expect(VILLAGE_PRIORITY).toBe(HOTSPOT_PRIORITY);
    for (const kind of ["hill", "park", "bridge", "neighborhood", "fort", "beach", "water", "building", "other", "region"]) {
      expect(VILLAGE_PRIORITY).toBeGreaterThan(landmarkPriority(kind));
    }
  });

  it("declutter keeps a village label over an overlapping landmark label", () => {
    const kept = declutter([item("landmark", 0, 0, landmarkPriority("hill")), item("village", 10, 3, VILLAGE_PRIORITY)], 4);
    expect([...kept]).toEqual(["village"]);
  });
});
