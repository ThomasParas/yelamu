export interface LayerDef {
  id: string;
  label: string;
  defaultOn: boolean;
}

const LAYER_DEFS: readonly LayerDef[] = [
  { id: "streets", label: "Streets", defaultOn: false },
  { id: "landmarks", label: "Landmarks", defaultOn: true },
  { id: "hotspots", label: "Hotspots", defaultOn: true },
];

const VILLAGES_LAYER: LayerDef = { id: "villages", label: "Village sites", defaultOn: true };

/**
 * The overlay's layer toggles. "Village sites" exists only when the dataset has villages, so a
 * dataset without them keeps exactly today's three toggles.
 */
export function layerDefsFor(hasVillages: boolean): readonly LayerDef[] {
  return hasVillages ? [...LAYER_DEFS, VILLAGES_LAYER] : LAYER_DEFS;
}
