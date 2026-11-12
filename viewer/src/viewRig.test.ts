import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ISO_AZIMUTH, ISO_ELEVATION, isoOffset } from "./camera";
import {
  CAMERA_DISTANCE,
  ROT_STEP,
  ViewRig,
  azimuthFor,
  clampTarget,
  clampZoom,
  easeInOutCubic,
  interpolateView,
  unitsPerPixel,
  type ViewRigOptions,
} from "./viewRig";

const BOUNDS = { halfWidth: 1000, halfDepth: 500 };

describe("azimuthFor", () => {
  it("is the isometric azimuth plus quarter turns", () => {
    expect(azimuthFor(0)).toBeCloseTo(ISO_AZIMUTH);
    expect(azimuthFor(1)).toBeCloseTo(ISO_AZIMUTH + Math.PI / 2);
    expect(azimuthFor(3)).toBeCloseTo(ISO_AZIMUTH + (3 * Math.PI) / 2);
    expect(ROT_STEP).toBeCloseTo(Math.PI / 2);
  });
});

describe("clampTarget", () => {
  it("leaves points inside the expanded rectangle alone", () => {
    expect(clampTarget(10, -20, BOUNDS, 100)).toEqual([10, -20]);
  });
  it("clamps to half extent plus margin on each axis", () => {
    expect(clampTarget(5000, 5000, BOUNDS, 100)).toEqual([1100, 600]);
    expect(clampTarget(-5000, -5000, BOUNDS, 100)).toEqual([-1100, -600]);
  });
  it("margin 0 clamps to the map edge", () => {
    expect(clampTarget(2000, 0, BOUNDS, 0)).toEqual([1000, 0]);
  });
  it("sends non-finite input to the centre instead of poisoning the camera", () => {
    expect(clampTarget(NaN, Infinity, BOUNDS, 0)).toEqual([0, 0]);
  });
});

describe("clampZoom", () => {
  it("clamps to [min, max]", () => {
    expect(clampZoom(0.1, 0.8, 40)).toBe(0.8);
    expect(clampZoom(100, 0.8, 40)).toBe(40);
    expect(clampZoom(3, 0.8, 40)).toBe(3);
  });
  it("falls back to min for NaN", () => {
    expect(clampZoom(NaN, 0.8, 40)).toBe(0.8);
  });
});

describe("easeInOutCubic", () => {
  it("pins the ends, is 0.5 at the middle and monotone", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    let prev = 0;
    for (let i = 1; i <= 20; i++) {
      const v = easeInOutCubic(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it("clamps t outside 0..1", () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });
});

describe("interpolateView", () => {
  const a = { x: 0, z: 0, zoom: 1 };
  const b = { x: 100, z: -50, zoom: 16 };
  it("returns exact endpoints at t=0 and t=1", () => {
    expect(interpolateView(a, b, 0)).toEqual(a);
    expect(interpolateView(a, b, 1)).toEqual(b);
  });
  it("interpolates the target linearly and the zoom geometrically", () => {
    const m = interpolateView(a, b, 0.5);
    expect(m.x).toBeCloseTo(50);
    expect(m.z).toBeCloseTo(-25);
    expect(m.zoom).toBeCloseTo(4); // sqrt(1 * 16)
  });
});

describe("unitsPerPixel", () => {
  it("is view height over zoom over viewport height", () => {
    const cam = new THREE.OrthographicCamera(-100, 100, 50, -50, -1, 1);
    cam.zoom = 2;
    expect(unitsPerPixel(cam, 400)).toBeCloseTo(100 / 2 / 400);
  });
  it("never divides by zero", () => {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    expect(Number.isFinite(unitsPerPixel(cam, 0))).toBe(true);
  });
});

/** A rig on a fake clock: frames only run when the test calls step(). */
function harness(over: Partial<ViewRigOptions> & { reduced?: boolean } = {}) {
  const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, -1e5, 1e5);
  let t = 1000;
  let queue: Array<(t: number) => void> = [];
  const rig = new ViewRig(camera, {
    bounds: BOUNDS,
    margin: 100,
    minZoom: 0.8,
    maxZoom: 40,
    reducedMotion: () => over.reduced ?? false,
    now: () => t,
    schedule: (cb) => void queue.push(cb),
    ...over,
  });
  /** Advance the clock by ms and run the frame callbacks that were pending. */
  const step = (ms: number) => {
    t += ms;
    const q = queue;
    queue = [];
    for (const cb of q) cb(t);
  };
  const run = (totalMs: number, frameMs = 16) => {
    for (let elapsed = 0; elapsed < totalMs; elapsed += frameMs) step(frameMs);
  };
  const pending = () => queue.length;
  return { camera, rig, step, run, pending };
}

describe("ViewRig state", () => {
  it("starts at the origin with the camera zoom and rot 0", () => {
    const { rig } = harness();
    expect(rig.getState()).toEqual({ x: 0, z: 0, zoom: 1, rot: 0 });
    expect(rig.isAnimating()).toBe(false);
  });

  it("setState clamps target and zoom and normalises rot", () => {
    const { rig } = harness();
    rig.setState({ x: 99999, z: -99999, zoom: 999, rot: 5 });
    expect(rig.getState()).toEqual({ x: 1100, z: -600, zoom: 40, rot: 1 });
    rig.setState({ zoom: 0.01 });
    expect(rig.getState().zoom).toBe(0.8);
  });

  it("setState with a partial leaves the other fields alone", () => {
    const { rig } = harness();
    rig.setState({ x: 10, z: 20, zoom: 2, rot: 2 });
    rig.setState({ x: 30 });
    expect(rig.getState()).toEqual({ x: 30, z: 20, zoom: 2, rot: 2 });
  });

  it("setState ignores non-finite fields", () => {
    const { rig } = harness();
    rig.setState({ x: 10, zoom: 2 });
    rig.setState({ x: NaN, zoom: Infinity, z: NaN });
    expect(rig.getState()).toMatchObject({ x: 10, z: 0, zoom: 2 });
  });

  it("zoomBy multiplies and clamps", () => {
    const { rig } = harness();
    rig.zoomBy(2);
    expect(rig.getState().zoom).toBeCloseTo(2);
    rig.zoomBy(1000);
    expect(rig.getState().zoom).toBe(40);
    rig.zoomBy(1e-9);
    expect(rig.getState().zoom).toBe(0.8);
  });

  it("panBy moves the target using the current azimuth and clamps to the bounds", () => {
    const { rig } = harness();
    rig.setState({ rot: 0 });
    // Dragging right by 10px at 2 units/px moves the target west, and a little south-west
    // or north-west depending on azimuth; check against panDelta's definition at 45 degrees.
    rig.panBy(10, 0, 2);
    const s = rig.getState();
    expect(s.x).toBeCloseTo(-20 * Math.cos(ISO_AZIMUTH));
    expect(s.z).toBeCloseTo(20 * Math.sin(ISO_AZIMUTH));
    rig.panBy(-1e7, 0, 1);
    expect(rig.getState().x).toBeLessThanOrEqual(1100);
    expect(rig.getState().z).toBeGreaterThanOrEqual(-600);
    expect(rig.getState().z).toBeLessThanOrEqual(600);
  });

  it("panBy follows the rotated view", () => {
    const a = harness();
    const b = harness();
    b.rig.setState({ rot: 1 });
    a.rig.panBy(0, 10, 1);
    b.rig.panBy(0, 10, 1);
    // Rotating the view by a quarter turn rotates the pan direction by the same amount.
    const sa = a.rig.getState();
    const sb = b.rig.getState();
    expect(Math.hypot(sa.x, sa.z)).toBeCloseTo(Math.hypot(sb.x, sb.z));
    expect(sb.x).toBeCloseTo(sa.z);
    expect(sb.z).toBeCloseTo(-sa.x);
  });
});

describe("ViewRig camera placement", () => {
  it("place() puts the camera at target + isoOffset looking at the target", () => {
    const { rig, camera } = harness();
    rig.setState({ x: 300, z: -200, zoom: 4, rot: 2 });
    const expected = isoOffset(CAMERA_DISTANCE, azimuthFor(2), ISO_ELEVATION).add(
      new THREE.Vector3(300, 0, -200),
    );
    expect(camera.position.distanceTo(expected)).toBeLessThan(1e-6);
    expect(camera.zoom).toBe(4);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const toTarget = new THREE.Vector3(300, 0, -200).sub(camera.position).normalize();
    expect(dir.distanceTo(toTarget)).toBeLessThan(1e-6);
  });

  it("the constructor places the camera so the first frame is correct", () => {
    const { camera } = harness();
    expect(camera.position.length()).toBeCloseTo(CAMERA_DISTANCE);
  });
});

describe("ViewRig onChange", () => {
  it("fires once per discrete change and not when nothing changed", () => {
    const { rig } = harness();
    let n = 0;
    rig.onChange(() => n++);
    rig.zoomBy(2);
    expect(n).toBe(1);
    rig.setState({ x: 5 });
    expect(n).toBe(2);
    rig.setState({ x: 5 });
    expect(n).toBe(2);
    rig.zoomBy(1);
    expect(n).toBe(2);
  });

  it("the unsubscribe function stops notifications", () => {
    const { rig } = harness();
    let n = 0;
    const off = rig.onChange(() => n++);
    rig.zoomBy(2);
    off();
    rig.zoomBy(2);
    expect(n).toBe(1);
  });

  it("fires on every animation frame, with the camera already updated", () => {
    const { rig, camera, run } = harness();
    const zooms: number[] = [];
    rig.onChange(() => zooms.push(camera.zoom));
    rig.flyTo(500, 0, 8);
    run(2000);
    expect(zooms.length).toBeGreaterThan(5);
    expect(zooms[zooms.length - 1]).toBe(8);
  });
});

describe("ViewRig.flyTo", () => {
  it("animates over ~600ms and lands exactly on the clamped target", () => {
    const { rig, run, step } = harness();
    rig.flyTo(400, -300, 6);
    expect(rig.isAnimating()).toBe(true);
    run(300);
    const mid = rig.getState();
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(400);
    expect(rig.isAnimating()).toBe(true);
    run(320); // total ~620 ms
    step(16);
    expect(rig.getState()).toEqual({ x: 400, z: -300, zoom: 6, rot: 0 });
    expect(rig.isAnimating()).toBe(false);
  });

  it("is exact at t=1 even when a frame overshoots the duration", () => {
    const { rig, step } = harness();
    rig.flyTo(123.456, 78.9, 3.3);
    step(5000);
    expect(rig.getState()).toEqual({ x: 123.456, z: 78.9, zoom: 3.3, rot: 0 });
    expect(rig.isAnimating()).toBe(false);
  });

  it("keeps the current zoom when none is given", () => {
    const { rig, step } = harness();
    rig.setState({ zoom: 5 });
    rig.flyTo(100, 100);
    step(5000);
    expect(rig.getState().zoom).toBe(5);
  });

  it("clamps the destination to the map plus margin and the zoom range", () => {
    const { rig, step } = harness();
    rig.flyTo(1e6, -1e6, 1e6);
    step(5000);
    expect(rig.getState()).toEqual({ x: 1100, z: -600, zoom: 40, rot: 0 });
  });

  it("is instant under reduced motion", () => {
    const { rig, pending } = harness({ reduced: true });
    let n = 0;
    rig.onChange(() => n++);
    rig.flyTo(400, -300, 6);
    expect(rig.getState()).toEqual({ x: 400, z: -300, zoom: 6, rot: 0 });
    expect(rig.isAnimating()).toBe(false);
    expect(pending()).toBe(0);
    expect(n).toBe(1);
  });

  it("cancels a running flight and replaces it", () => {
    const { rig, run, step } = harness();
    rig.flyTo(900, 0, 10);
    run(200);
    const partial = rig.getState().x;
    expect(partial).toBeGreaterThan(0);
    rig.flyTo(-200, 100, 2);
    step(5000);
    expect(rig.getState()).toEqual({ x: -200, z: 100, zoom: 2, rot: 0 });
    expect(rig.isAnimating()).toBe(false);
    // The first flight's leftover frame callbacks must not move the camera any more.
    step(100);
    expect(rig.getState().x).toBe(-200);
  });

  it("a flight started mid-flight begins from where the camera is now", () => {
    const { rig, run } = harness();
    rig.flyTo(900, 0, 10);
    run(250);
    const before = rig.getState();
    rig.flyTo(-200, 100, 2);
    expect(rig.getState()).toEqual(before); // no jump when the new flight starts
  });

  it("user panning or zooming cancels the view animation", () => {
    const { rig, run } = harness();
    rig.flyTo(900, 0, 10);
    run(100);
    rig.panBy(1, 0, 1);
    expect(rig.isAnimating()).toBe(false);
    const s = rig.getState();
    run(1000);
    expect(rig.getState()).toEqual(s);
  });

  it("setState cancels animation", () => {
    const { rig, run } = harness();
    rig.flyTo(900, 0, 10);
    run(100);
    rig.setState({ x: 50, z: 50, zoom: 2 });
    run(1000);
    expect(rig.getState()).toMatchObject({ x: 50, z: 50, zoom: 2 });
    expect(rig.isAnimating()).toBe(false);
  });
});

describe("ViewRig.rotate", () => {
  const norm = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

  it("turns a quarter turn over ~350ms and ends at the right rot", () => {
    const { rig, run, step } = harness();
    rig.rotate(1);
    expect(rig.isAnimating()).toBe(true);
    expect(rig.getState().rot).toBe(1); // rot is the destination
    run(400);
    step(16);
    expect(rig.getState().rot).toBe(1);
    expect(rig.getAzimuth()).toBeCloseTo(azimuthFor(1));
    expect(rig.isAnimating()).toBe(false);
  });

  it("takes the shortest way: rot 0 -> 3 sweeps -90 degrees, never +270", () => {
    const { rig, run } = harness();
    const seen: number[] = [rig.getAzimuth()];
    rig.onChange(() => seen.push(rig.getAzimuth()));
    rig.rotate(-1);
    run(500);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThanOrEqual(seen[i - 1] + 1e-9);
    const total = norm(seen[seen.length - 1] - seen[0]);
    expect(total).toBeCloseTo(-ROT_STEP);
    expect(Math.abs(seen[seen.length - 1] - seen[0])).toBeCloseTo(ROT_STEP);
    expect(rig.getState().rot).toBe(3);
  });

  it("wraps 3 -> 0 forwards", () => {
    const { rig, run } = harness();
    rig.setState({ rot: 3 });
    const start = rig.getAzimuth();
    rig.rotate(1);
    run(500);
    expect(rig.getState().rot).toBe(0);
    expect(norm(rig.getAzimuth() - start)).toBeCloseTo(ROT_STEP);
    // The camera really ended up at the rot-0 position.
    const expected = isoOffset(CAMERA_DISTANCE, azimuthFor(0), ISO_ELEVATION);
    expect(rig.camera.position.distanceTo(expected)).toBeLessThan(1e-3);
  });

  it("keeps the target fixed while rotating", () => {
    const { rig, run } = harness();
    rig.setState({ x: 200, z: -100 });
    rig.rotate(1);
    run(200);
    expect(rig.getState()).toMatchObject({ x: 200, z: -100 });
  });

  it("is instant under reduced motion", () => {
    const { rig, pending } = harness({ reduced: true });
    rig.rotate(1);
    expect(rig.getState().rot).toBe(1);
    expect(rig.isAnimating()).toBe(false);
    expect(pending()).toBe(0);
    expect(norm(rig.getAzimuth() - azimuthFor(1))).toBeCloseTo(0);
  });

  it("presses made during a turn chain: two presses make a half turn", () => {
    const { rig, run } = harness();
    rig.rotate(1);
    run(100);
    rig.rotate(1);
    expect(rig.getState().rot).toBe(2);
    run(1000);
    expect(rig.getState().rot).toBe(2);
    expect(norm(rig.getAzimuth() - azimuthFor(2))).toBeCloseTo(0);
    expect(rig.isAnimating()).toBe(false);
  });

  it("rotating while a flight is running keeps the flight going to its destination", () => {
    const { rig, run } = harness();
    rig.flyTo(400, 0, 6);
    run(100);
    rig.rotate(1);
    run(2000);
    expect(rig.getState()).toEqual({ x: 400, z: 0, zoom: 6, rot: 1 });
  });
});

describe("ViewRig.reset", () => {
  it("animates back to the view the rig was created with", () => {
    const { rig, run } = harness();
    rig.setState({ x: 500, z: 100, zoom: 9, rot: 2 });
    rig.reset();
    expect(rig.isAnimating()).toBe(true);
    run(1500);
    expect(rig.getState()).toEqual({ x: 0, z: 0, zoom: 1, rot: 0 });
    expect(rig.isAnimating()).toBe(false);
  });

  it("returns by the shortest turn (3 -> 0 is a forward quarter turn)", () => {
    const { rig, run } = harness();
    rig.setState({ rot: 3 });
    const start = rig.getAzimuth();
    const seen: number[] = [];
    rig.onChange(() => seen.push(rig.getAzimuth()));
    rig.reset();
    run(1500);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1] - 1e-9);
    expect(seen[seen.length - 1] - start).toBeCloseTo(ROT_STEP);
  });

  it("is instant under reduced motion", () => {
    const { rig, pending } = harness({ reduced: true });
    rig.setState({ x: 500, zoom: 9, rot: 2 });
    rig.reset();
    expect(rig.getState()).toEqual({ x: 0, z: 0, zoom: 1, rot: 0 });
    expect(pending()).toBe(0);
  });
});

describe("ViewRig user input during a rotation", () => {
  it("panning lets a running rotation finish", () => {
    const { rig, run } = harness();
    rig.rotate(1);
    run(100);
    rig.panBy(5, 0, 1);
    expect(rig.isAnimating()).toBe(true);
    run(1000);
    expect(rig.getState().rot).toBe(1);
    expect(rig.getAzimuth()).toBeCloseTo(azimuthFor(1));
    expect(rig.isAnimating()).toBe(false);
  });
});
