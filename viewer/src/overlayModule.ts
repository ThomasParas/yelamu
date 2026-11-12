import type { AppContext } from "./appContext";
import type { AppModule } from "./modules";
import { makeHeightSampler } from "./overlay/heightAt";
import { HOTSPOT_PRIORITY, LabelLayer, landmarkPriority, type LabelItem } from "./overlay/labels";
import { loadOverlay } from "./overlay/parse";
import { overlaySearchItems } from "./overlay/searchItems";
import {
  STREET_LIFT_M,
  STREET_STEP_M,
  STREET_THRESHOLDS,
  StreetsLayer,
} from "./overlay/streetsLayer";
import type { Hotspot, Landmark } from "./overlay/types";
import { groupPlaces, selectedAnnouncement } from "./placesList";
import { buildSearchIndex, search, type SearchItem } from "./search";
import { createHotspotPanel } from "./ui/hotspotPanel";
import { createPlacesPanel } from "./ui/placesPanel";
import { createSearchBox } from "./ui/searchBox";

/** Camera zoom used when flying to a search result or a surprise hotspot (never zooms out). */
export const PLACE_ZOOM = { hotspot: 6, landmark: 4, street: 4 } as const;

const LAYER_DEFS = [
  { id: "streets", label: "Streets", defaultOn: false },
  { id: "landmarks", label: "Landmarks", defaultOn: true },
  { id: "hotspots", label: "Hotspots", defaultOn: true },
] as const;

/**
 * Modern streets, landmark labels, hotspot markers + panel and local search, all driven by
 * the dataset's overlay.json. A dataset without `overlay_file`, or a failed load, leaves
 * the viewer exactly as it was (one console warning).
 */
export const overlayModule: AppModule = async (ctx: AppContext) => {
  let overlay;
  try {
    overlay = await loadOverlay(ctx.assetBase, ctx.meta);
  } catch (err) {
    console.warn("Overlay not loaded; continuing without streets, labels and hotspots.", err);
    return;
  }
  if (!overlay) return;

  const { shell, rig, layers, place } = ctx;
  const heightAt = makeHeightSampler(ctx.heights, ctx.meta);
  const exaggeration = ctx.verticalExaggeration;
  /** World y for a label at (x, z): the ground, or the water surface where that is higher. */
  const groundY = (x: number, z: number) => Math.max(heightAt(x, z), ctx.meta.water_level_m) * exaggeration;

  // --- streets (built on first use: the layer starts off) ---
  let streets: StreetsLayer | null = null;
  const ensureStreets = (): StreetsLayer => {
    if (!streets) {
      streets = new StreetsLayer(overlay, heightAt, {
        exaggeration,
        liftM: STREET_LIFT_M,
        stepM: STREET_STEP_M,
        thresholds: STREET_THRESHOLDS,
      });
      streets.update(ctx.camera.zoom);
      ctx.scene.add(streets.object);
    }
    return streets;
  };

  // --- labels and markers ---
  const hotspots = new Map<string, Hotspot>(overlay.hotspots.map((h) => [h.id, h]));
  const landmarks = new Map<string, Landmark>(overlay.landmarks.map((l) => [l.id, l]));
  const items: LabelItem[] = [
    ...overlay.landmarks.map(
      (l): LabelItem => ({ id: l.id, text: l.name, x: l.x, z: l.z, y: groundY(l.x, l.z), kind: "landmark", priority: landmarkPriority(l.kind) }),
    ),
    ...overlay.hotspots.map(
      (h): LabelItem => ({ id: h.id, text: h.name, x: h.x, z: h.z, y: groundY(h.x, h.z), kind: "hotspot", priority: HOTSPOT_PRIORITY }),
    ),
  ];

  const panel = createHotspotPanel(shell);
  const labels = new LabelLayer(shell.root, (id) => place.set(id));
  labels.setItems(items);

  // --- layer toggles (defaults apply only when the URL has no `l`) ---
  const visibleKinds = new Set<string>();
  const handles = new Map<string, ReturnType<typeof shell.addToggle>>();
  const syncLayers = () => {
    visibleKinds.clear();
    if (layers.has("landmarks")) visibleKinds.add("landmark");
    if (layers.has("hotspots")) visibleKinds.add("hotspot");
    const wantStreets = layers.has("streets");
    if (wantStreets) ensureStreets().setEnabled(true);
    else streets?.setEnabled(false);
    for (const def of LAYER_DEFS) handles.get(def.id)?.set(layers.has(def.id));
    ctx.requestRender();
  };
  for (const def of LAYER_DEFS) {
    const on = layers.register(def.id, def.defaultOn);
    handles.set(def.id, shell.addToggle(def.id, def.label, on, (v) => layers.set(def.id, v)));
  }
  layers.onChange(syncLayers);
  syncLayers();

  // --- per frame: street detail by zoom, label placement ---
  // Streets switch before the render (rig changes arrive first), labels after it, when
  // the camera matrices are final.
  rig.onChange(() => {
    if (streets?.update(ctx.camera.zoom)) ctx.requestRender();
  });
  ctx.onFrame(() => labels.update(ctx.camera, ctx.canvas.clientWidth, ctx.canvas.clientHeight, visibleKinds));

  // --- places: one selection drives the panel, the highlight and the hash (`p=`) ---
  const applyPlace = (id: string | undefined) => {
    labels.setSelected(id);
    const hotspot = id ? hotspots.get(id) : undefined;
    if (hotspot) panel.show(hotspot);
    else panel.hide();
    ctx.requestRender();
  };
  place.onChange((id) => {
    applyPlace(id);
    // Screen readers hear the selection even when no panel opens (a landmark).
    const name = id ? (hotspots.get(id)?.name ?? landmarks.get(id)?.name) : undefined;
    if (name) shell.announce(selectedAnnouncement(name));
  });
  panel.onClose(() => {
    if (place.get() && hotspots.has(place.get()!)) place.set(undefined);
  });
  // A place in the URL (shared link): validate it now that the overlay is known.
  const initial = place.get();
  if (initial && !hotspots.has(initial) && !landmarks.has(initial)) place.set(undefined);
  else applyPlace(place.get());

  // Esc: close a panel first; otherwise drop a selected landmark.
  const defaultEscape = ctx.handlers.escape;
  ctx.handlers.escape = () => {
    if (shell.closeTopPanel()) return;
    if (place.get()) place.set(undefined);
    else defaultEscape();
  };

  // --- search ---
  const index = buildSearchIndex(overlaySearchItems(overlay));
  const choose = (item: SearchItem) => {
    const zoom = Math.max(rig.getState().zoom, PLACE_ZOOM[item.group]);
    rig.flyTo(item.x, item.z, zoom);
    if (item.group === "street") return;
    // Same place picked again: the panel may have been closed, so reopen it directly.
    if (place.get() === item.id) applyPlace(item.id);
    else place.set(item.id);
  };
  const box = createSearchBox(shell.searchSlot, {
    query: (text) => search(index, text),
    onSelect: choose,
  });
  ctx.handlers.search = () => box.focus();

  // --- Places: a keyboard and screen-reader route to every hotspot and landmark ---
  const placeItems = new Map<string, SearchItem>();
  for (const item of overlaySearchItems(overlay)) if (item.group !== "street") placeItems.set(item.id, item);
  const placesPanel = createPlacesPanel(
    shell,
    groupPlaces(
      overlay.hotspots.map((h) => ({ id: h.id, name: h.name, kind: h.kind })),
      overlay.landmarks.map((l) => ({ id: l.id, name: l.name, kind: l.kind })),
    ),
    (id) => {
      const item = placeItems.get(id);
      if (item) choose(item);
    },
  );
  shell.addAction("places", "Places", () => placesPanel.open(), { first: true });

  // --- Surprise me sometimes goes to a hotspot ---
  for (const h of overlay.hotspots) {
    ctx.surpriseTargets.push({ x: h.x, z: h.z, zoom: PLACE_ZOOM.hotspot, place: h.id });
  }

  ctx.requestRender();
};
