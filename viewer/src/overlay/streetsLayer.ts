import * as THREE from "three";
import { buildSegmentGeometry, type HeightAt } from "./drape";
import type { Overlay, StreetKind } from "./types";
import { STREET_KINDS } from "./types";

/** Metres the street lines float above the terrain, so the coarse LOD cannot hide them. */
export const STREET_LIFT_M = 4;
/** Longest horizontal distance between draped street vertices, metres. */
export const STREET_STEP_M = 20;
/**
 * Camera zoom at which each street class appears (primary streets are always shown).
 * Tune against the real data: the camera zoom runs 0.8 .. 40.
 */
export const STREET_THRESHOLDS = { secondary: 2.5, local: 5 } as const;

export interface StreetThresholds {
  secondary: number;
  local: number;
}

export interface StreetKindVisibility {
  primary: boolean;
  secondary: boolean;
  local: boolean;
}

/** Which street classes are drawn at a camera zoom: more detail as you zoom in. */
export function streetKindVisibility(zoom: number, t: StreetThresholds): StreetKindVisibility {
  const z = Number.isFinite(zoom) ? zoom : 0;
  return { primary: true, secondary: z >= t.secondary, local: z >= t.local };
}

export interface StreetsLayerOptions {
  exaggeration: number;
  liftM: number;
  stepM: number;
  thresholds: StreetThresholds;
}

/**
 * Street line colour: a dark slate. Streets are a faint orientation aid, not text, so the
 * bar is a 1.5:1 contrast against every ground colour (WCAG asks 3:1 for graphics; a 1 px
 * line over a busy map cannot honestly reach that). A pale line cannot do it: the beach and
 * dune colours are lighter than any cream (1.28:1), while a dark line clears 1.5:1 on all of
 * them. uiColors.test.ts enforces this, including each class's opacity.
 */
export const STREET_COLOR = 0x1f2a33;
/** More opaque for bigger streets. */
export const STREET_OPACITY: Readonly<Record<StreetKind, number>> = {
  primary: 0.95,
  secondary: 0.85,
  local: 0.6,
};
const STYLE: Record<StreetKind, { color: number; opacity: number }> = {
  primary: { color: STREET_COLOR, opacity: STREET_OPACITY.primary },
  secondary: { color: STREET_COLOR, opacity: STREET_OPACITY.secondary },
  local: { color: STREET_COLOR, opacity: STREET_OPACITY.local },
};

/** The modern street network as thin lines draped over the terrain. */
export class StreetsLayer {
  readonly object = new THREE.Group();
  private readonly meshes = new Map<StreetKind, THREE.LineSegments>();
  private enabled = true;
  private lastZoom = Number.NaN;

  constructor(
    overlay: Pick<Overlay, "streets">,
    heightAt: HeightAt,
    private readonly opts: StreetsLayerOptions,
  ) {
    this.object.name = "streets";
    for (const kind of STREET_KINDS) {
      const lines = overlay.streets.filter((s) => s.kind === kind).flatMap((s) => s.lines);
      const material = new THREE.LineBasicMaterial({
        color: STYLE[kind].color,
        opacity: STYLE[kind].opacity,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.LineSegments(
        buildSegmentGeometry(lines, heightAt, opts.stepM, opts.exaggeration, opts.liftM),
        material,
      );
      mesh.name = `streets-${kind}`;
      mesh.renderOrder = 2;
      mesh.visible = false;
      this.meshes.set(kind, mesh);
      this.object.add(mesh);
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.object.visible = on;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Show the street classes that suit this zoom. Returns true when anything changed. */
  update(zoom: number): boolean {
    if (zoom === this.lastZoom) return false;
    this.lastZoom = zoom;
    const vis = streetKindVisibility(zoom, this.opts.thresholds);
    let changed = false;
    for (const kind of STREET_KINDS) {
      const mesh = this.meshes.get(kind)!;
      if (mesh.visible !== vis[kind]) {
        mesh.visible = vis[kind];
        changed = true;
      }
    }
    return changed;
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.object.removeFromParent();
  }
}
