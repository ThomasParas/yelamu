import * as THREE from "three";
import { ISO_AZIMUTH, ISO_ELEVATION, isoOffset, panDelta } from "./camera";
import { normalizeRot } from "./appState";

/** Distance of the camera from its target. Irrelevant for orthographic projection. */
export const CAMERA_DISTANCE = 20000;
/** One rotation step: a quarter turn. */
export const ROT_STEP = Math.PI / 2;
export const ROTATE_MS = 350;
export const FLY_MS = 600;

/** Camera azimuth for a number of quarter turns (may be negative or above 3). */
export function azimuthFor(rot: number): number {
  return ISO_AZIMUTH + rot * ROT_STEP;
}

export interface MapBounds {
  /** Half the map extent east-west / north-south, in metres, about the centre. */
  halfWidth: number;
  halfDepth: number;
  /** Centre of the rectangle in world metres; default 0 (the origin, the city's centre). */
  centerX?: number;
  centerZ?: number;
}

/** Keep the target inside the map rectangle expanded by `margin` metres on every side. */
export function clampTarget(
  x: number,
  z: number,
  bounds: MapBounds,
  margin: number,
): [number, number] {
  const ox = bounds.centerX ?? 0;
  const oz = bounds.centerZ ?? 0;
  const mx = bounds.halfWidth + margin;
  const mz = bounds.halfDepth + margin;
  const cx = Number.isFinite(x) ? Math.min(ox + mx, Math.max(ox - mx, x)) : ox;
  const cz = Number.isFinite(z) ? Math.min(oz + mz, Math.max(oz - mz, z)) : oz;
  return [cx, cz];
}

export function clampZoom(zoom: number, min: number, max: number): number {
  if (!Number.isFinite(zoom)) return min;
  return Math.min(max, Math.max(min, zoom));
}

export function easeInOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

export interface ViewTarget {
  x: number;
  z: number;
  zoom: number;
}

/**
 * Linear in the target position, geometric in zoom (so a zoom change feels even). `t` is
 * NOT eased here; callers ease it first. t <= 0 and t >= 1 return the endpoints exactly.
 */
export function interpolateView(from: ViewTarget, to: ViewTarget, t: number): ViewTarget {
  if (t <= 0) return { x: from.x, z: from.z, zoom: from.zoom };
  if (t >= 1) return { x: to.x, z: to.z, zoom: to.zoom };
  return {
    x: from.x + (to.x - from.x) * t,
    z: from.z + (to.z - from.z) * t,
    zoom: Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * t),
  };
}

/** World units covered by one CSS pixel at the camera's current zoom. */
export function unitsPerPixel(camera: THREE.OrthographicCamera, viewportHeightPx: number): number {
  return (camera.top - camera.bottom) / camera.zoom / Math.max(1, viewportHeightPx);
}

/** What the URL hash and the UI see: `rot` is the DESTINATION quarter turn, 0..3. */
export interface ViewState extends ViewTarget {
  rot: number;
}

export interface ViewRigOptions {
  bounds: MapBounds;
  /** Metres the target may stray beyond the map rectangle. */
  margin: number;
  minZoom: number;
  maxZoom: number;
  reducedMotion: () => boolean;
  /** Clock in ms; defaults to performance.now. Injected by tests. */
  now?: () => number;
  /** Request one callback on the next frame; defaults to requestAnimationFrame. */
  schedule?: (cb: (t: number) => void) => void;
}

interface Animation {
  token: number;
  start: number;
  duration: number;
  view: { from: ViewTarget; to: ViewTarget } | null;
  az: { from: number; to: number } | null;
}

/**
 * Owns the camera pose: target (x, z), zoom and rotation about the target. Every mutation
 * clamps, repositions the camera (place()) and then notifies onChange listeners, so
 * consumers only need to request a render. Animations (rotate, flyTo, reset) run on the
 * injected clock; they are instant when `reducedMotion()` is true.
 */
export class ViewRig {
  private x = 0;
  private z = 0;
  private zoom: number;
  /** Quarter turns, UNWRAPPED (can be negative or above 3) so animations take the short way. */
  private rotTarget = 0;
  private azimuth = azimuthFor(0);
  private anim: Animation | null = null;
  private seq = 0;
  private readonly listeners = new Set<() => void>();
  private readonly initial: ViewState;
  private readonly now: () => number;
  private readonly schedule: (cb: (t: number) => void) => void;

  constructor(
    readonly camera: THREE.OrthographicCamera,
    private readonly options: ViewRigOptions,
  ) {
    this.now = options.now ?? (() => performance.now());
    this.schedule = options.schedule ?? ((cb) => void requestAnimationFrame(cb));
    this.zoom = clampZoom(camera.zoom, options.minZoom, options.maxZoom);
    this.initial = this.getState();
    this.place();
  }

  getState(): ViewState {
    return { x: this.x, z: this.z, zoom: this.zoom, rot: normalizeRot(this.rotTarget) };
  }

  /** The current pan bounds (a copy) and minimum zoom. */
  getLimits(): { bounds: MapBounds; minZoom: number } {
    return { bounds: { ...this.options.bounds }, minZoom: this.options.minZoom };
  }

  /**
   * Change the pan bounds and/or the minimum zoom, then clamp the current view to them.
   * Ends in setState, so x, z and zoom are all re-clamped and listeners are notified (once,
   * and only if the view actually moved). Like any setState it cancels a running animation.
   */
  setLimits(limits: { bounds?: MapBounds; minZoom?: number }): void {
    if (limits.bounds) this.options.bounds = { ...limits.bounds };
    if (limits.minZoom !== undefined && Number.isFinite(limits.minZoom) && limits.minZoom > 0) {
      this.options.minZoom = limits.minZoom;
    }
    this.setState({ zoom: this.zoom });
  }

  /** Current (possibly mid-animation) camera azimuth in radians. */
  getAzimuth(): number {
    return this.azimuth;
  }

  isAnimating(): boolean {
    return this.anim !== null;
  }

  /** Instant jump. Clamps, ignores non-finite fields, cancels any animation. */
  setState(partial: Partial<ViewState>): void {
    const before = this.signature();
    this.cancel();
    const nx = partial.x !== undefined && Number.isFinite(partial.x) ? partial.x : this.x;
    const nz = partial.z !== undefined && Number.isFinite(partial.z) ? partial.z : this.z;
    [this.x, this.z] = clampTarget(nx, nz, this.options.bounds, this.options.margin);
    if (partial.zoom !== undefined && Number.isFinite(partial.zoom)) {
      this.zoom = clampZoom(partial.zoom, this.options.minZoom, this.options.maxZoom);
    }
    if (partial.rot !== undefined && Number.isFinite(partial.rot)) {
      this.rotTarget = normalizeRot(partial.rot);
      this.azimuth = azimuthFor(this.rotTarget);
    }
    this.commitIfChanged(before);
  }

  /**
   * Pan as if the map were dragged by (dxPx, dyPx) screen pixels, using the CURRENT
   * azimuth. Cancels a running fly-to (the user took over) but lets a rotation finish.
   */
  panBy(dxPx: number, dyPx: number, unitsPerPx: number): void {
    const before = this.signature();
    this.dropViewAnimation();
    const d = panDelta(dxPx, dyPx, unitsPerPx, this.azimuth, ISO_ELEVATION);
    [this.x, this.z] = clampTarget(this.x + d.x, this.z + d.z, this.options.bounds, this.options.margin);
    this.commitIfChanged(before);
  }

  zoomBy(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const before = this.signature();
    this.dropViewAnimation();
    this.zoom = clampZoom(this.zoom * factor, this.options.minZoom, this.options.maxZoom);
    this.commitIfChanged(before);
  }

  /** One quarter turn: +1 turns the map clockwise as seen from above, -1 anticlockwise. */
  rotate(dir: 1 | -1): void {
    const before = this.signature();
    this.rotTarget += dir;
    if (this.options.reducedMotion()) {
      this.anim = null;
      this.azimuth = azimuthFor(this.rotTarget);
      this.commitIfChanged(before);
      return;
    }
    this.begin(undefined, ROTATE_MS);
  }

  /** Back to the view the rig was created with, by the shortest turn. */
  reset(): void {
    if (this.options.reducedMotion()) {
      this.setState(this.initial);
      return;
    }
    this.rotTarget += shortestTurn(normalizeRot(this.rotTarget), this.initial.rot);
    this.begin({ x: this.initial.x, z: this.initial.z, zoom: this.initial.zoom }, FLY_MS);
  }

  /** Glide to (x, z), optionally changing zoom. Cancels and replaces a running animation. */
  flyTo(x: number, z: number, zoom?: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const [cx, cz] = clampTarget(x, z, this.options.bounds, this.options.margin);
    const czoom = clampZoom(
      zoom !== undefined && Number.isFinite(zoom) ? zoom : this.zoom,
      this.options.minZoom,
      this.options.maxZoom,
    );
    if (this.options.reducedMotion()) {
      const before = this.signature();
      this.anim = null;
      this.azimuth = azimuthFor(this.rotTarget);
      this.x = cx;
      this.z = cz;
      this.zoom = czoom;
      this.commitIfChanged(before);
      return;
    }
    this.begin({ x: cx, z: cz, zoom: czoom }, FLY_MS);
  }

  /** Position the camera at target + isoOffset looking at the target (no notification). */
  place(): void {
    const off = isoOffset(CAMERA_DISTANCE, this.azimuth, ISO_ELEVATION);
    this.camera.position.set(this.x + off.x, off.y, this.z + off.z);
    this.camera.lookAt(this.x, 0, this.z);
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
  }

  /** Called after every state change, including each animation frame. Returns unsubscribe. */
  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  // --- internals ---

  private signature(): string {
    return `${this.x}|${this.z}|${this.zoom}|${this.azimuth}`;
  }

  private commit(): void {
    this.place();
    for (const cb of [...this.listeners]) cb();
  }

  private commitIfChanged(before: string): void {
    if (this.signature() !== before) this.commit();
  }

  /** Stop animating; a half-finished turn jumps to its destination. */
  private cancel(): void {
    this.anim = null;
    this.azimuth = azimuthFor(this.rotTarget);
  }

  /** The user took over the view: stop gliding, but let a rotation finish. */
  private dropViewAnimation(): void {
    if (!this.anim) return;
    this.anim.view = null;
    if (!this.anim.az) this.anim = null;
  }

  /**
   * Start (replace) the animation. The azimuth channel always heads for the current
   * rotTarget; the view channel heads for `toView`, or - when only a rotation was
   * requested - keeps going to the destination of a flight already in progress.
   */
  private begin(toView: ViewTarget | undefined, duration: number): void {
    const dest = toView ?? this.anim?.view?.to;
    const from: ViewTarget = { x: this.x, z: this.z, zoom: this.zoom };
    const view =
      dest && (dest.x !== from.x || dest.z !== from.z || dest.zoom !== from.zoom)
        ? { from, to: dest }
        : null;
    const azTo = azimuthFor(this.rotTarget);
    const az = this.azimuth !== azTo ? { from: this.azimuth, to: azTo } : null;
    if (!view && !az) {
      this.anim = null;
      return;
    }
    const token = ++this.seq;
    this.anim = { token, start: this.now(), duration, view, az };
    this.schedule(() => this.frame(token));
  }

  private frame(token: number): void {
    const a = this.anim;
    if (!a || a.token !== token) return; // cancelled or replaced
    const raw = (this.now() - a.start) / a.duration;
    const t = raw >= 1 ? 1 : Math.max(0, raw);
    const e = easeInOutCubic(t);
    if (a.view) {
      const v = interpolateView(a.view.from, a.view.to, e);
      this.x = v.x;
      this.z = v.z;
      this.zoom = v.zoom;
    }
    if (a.az) this.azimuth = e >= 1 ? a.az.to : a.az.from + (a.az.to - a.az.from) * e;
    if (t >= 1) this.anim = null;
    this.commit();
    if (this.anim) this.schedule(() => this.frame(token));
  }
}

/** Signed quarter turns (-1, 0, 1 or 2) that take rotation `from` to `to`, both in 0..3. */
function shortestTurn(from: number, to: number): number {
  const diff = (((to - from) % 4) + 4) % 4;
  return diff === 3 ? -1 : diff;
}
