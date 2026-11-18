import type { Confidence } from "../heightmap";

export const STREET_KINDS = ["primary", "secondary", "local"] as const;
export type StreetKind = (typeof STREET_KINDS)[number];

// "region" is only produced by the context module (extraPlaces), never by overlay.json.
export const LANDMARK_KINDS = [
  "park",
  "bridge",
  "hill",
  "building",
  "neighborhood",
  "beach",
  "water",
  "fort",
  "other",
  "region",
] as const;
export type LandmarkKind = (typeof LANDMARK_KINDS)[number];

export const HOTSPOT_KINDS = [
  "creek",
  "lagoon",
  "marsh",
  "dune",
  "hill",
  "shoreline",
  "bay",
  "lake",
  "valley",
  "other",
] as const;
export type HotspotKind = (typeof HOTSPOT_KINDS)[number];

export const CONFIDENCES = ["documented", "inferred", "illustrative"] as const satisfies readonly Confidence[];

/** x, z are world metres in the viewer frame (+x east, +z south, origin at the grid centre). */
export interface Street {
  name: string;
  kind: StreetKind;
  /** Each line is a flat [x0, z0, x1, z1, ...] polyline. */
  lines: number[][];
}

export interface Landmark {
  id: string;
  name: string;
  kind: LandmarkKind;
  x: number;
  z: number;
  lon: number;
  lat: number;
}

export interface HotspotSource {
  title: string;
  url: string;
}

export interface Hotspot {
  id: string;
  name: string;
  kind: HotspotKind;
  x: number;
  z: number;
  lon: number;
  lat: number;
  description: string;
  sources: HotspotSource[];
  confidence: Confidence;
}

export interface Overlay {
  version: 1;
  streets: Street[];
  landmarks: Landmark[];
  hotspots: Hotspot[];
}
