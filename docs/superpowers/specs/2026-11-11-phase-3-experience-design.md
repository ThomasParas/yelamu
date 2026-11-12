# Yelamu Phase 3 (The Experience) — Design

**Date:** 2026-11-11
**Status:** Approved design; plan to follow
**Builds on:** [`2026-11-11-yelamu-3d-map-design.md`](2026-11-11-yelamu-3d-map-design.md) (Section 6, viewer interaction; Section 8 steps 3 to 5) and the finished Phase 2 (full city, chunked LOD viewer, habitat colours).

## 1. Goal

Turn the working full-city renderer into something a visitor can actually use and trust: find where they are, look things up, understand what is documented and what is inferred, and have it run well on a phone. All of it is viewer work plus one small data-build script. None of it depends on SFEI's reply about licensing (the data already in use stays local until that reply).

## 2. Decisions

| Question | Decision |
|---|---|
| Focus | Experience first; the data-authenticity work (hand-drawn south-east, Treasure Island, lost landforms, ponds) is a separate "Phase 3b" plan once you choose sources |
| Scope | All four bundles: orientation and navigation, information and trust, robustness and accessibility, visual richness |
| UI technology | Plain DOM and CSS, no framework; the current app is one canvas and a status line |
| Overlay data | US Census TIGER/Line roads for San Francisco County (public domain, 594 KB zip), converted by a one-time build script into a compact file in grid-local metres, so the viewer needs no map projection code |
| Search | Local only: landmarks, hotspots and street names; no geocoder and no street addresses |
| Privacy | The page makes no third-party requests: no external fonts, trackers or map tiles |
| Hotspot text | Every entry must cite a source and carry a confidence tag; a test rejects entries without one. No invented facts and no cultural or village content |

## 3. Parts

Each part ships on its own.

### 3A. Navigation and robustness (foundation)
- **App state in the URL hash:** camera target, zoom, rotation step, dataset and layer toggles, encoded and decoded by tested pure functions. This gives share links and survives reloads.
- **Camera rig** replacing the current controls: pan, zoom, rotation in 90 degree steps, **clamped** to the map bounds (with a margin) and to zoom limits, and animated fly-to (an instant jump under reduced motion).
- **Keyboard:** arrows pan, plus and minus zoom, `Q`/`E` rotate, `H` resets the view, `/` focuses search.
- **UI shell:** a top bar (search, layer toggles, reset, "surprise me") and panels, laid out for phones. Plain DOM with ARIA labels.

### 3B. Orientation
- **Modern overlay:** street lines draped on the terrain (heights sampled from the heightmap), a landmark list with labels, both toggleable and drawn faint so they do not compete with the landscape.
- **Search** over landmark, hotspot and street names with simple ranking (prefix, then word prefix, then substring), a result list, keyboard selection, and a fly-to.
- **Build script** `pipeline/scripts/build_overlay.py`: TIGER roads, landmarks and hotspots in, one `overlay.json` out, coordinates converted to the grid's metres.

### 3C. Information and trust
- **Hotspots:** `hotspots.json` entries (id, name, kind, position, description, sources, confidence), validated both in Python (build time) and TypeScript (load time). Markers on the map; clicking opens an info panel.
- **Legend:** habitat group colours, with the unmapped grey explained.
- **Provenance panel:** built from `meta.json` (`layers`, `processing`): what is documented, what is inferred, what is illustrative.
- **About dialog:** states that the Ramaytush Ohlone are a living community and links to the Association; credits SFEI, USGS and the Census Bureau; says plainly which parts are reconstructed. Required before any public launch.

### 3D. Visual richness
- **Vegetation:** instanced trees, scrub and tules scattered by habitat class from a seeded generator, built only for full-resolution chunks and disposed with them, capped per chunk. Always tagged `illustrative` in the UI; has a toggle.
- **Animated water:** a small shader tweak on the existing water material (moving normals, sun glint); static under reduced motion.

### 3E. Hardening
- **Automatic quality controller:** a pure, tested state machine that watches frame times and turns vegetation and water animation off (and back on, with hysteresis) when the frame rate drops.
- **Phone measurement protocol:** run the debug benchmark on a real phone over the local network; record results; tune `MAX_COARSE_SPACING_PX` and vegetation caps from them.
- **Accessibility pass:** keyboard reachability of every control, focus order and visible focus, ARIA live status, reduced-motion and colour-blind-safe overlay colours (luminance contrast, not hue alone).

## 4. Out of scope

Hand-drawn south-east and Treasure Island, lost landforms, freshwater ponds (Phase 3b data plan); the cultural layer; hosting and launch; geocoding street addresses; the time slider and deep time.

## 5. Data and licensing

- TIGER/Line is US federal data: public domain, credit "US Census Bureau" (courtesy, not required).
- Landmark positions come from well-known public places; hotspot content from citable sources recorded per entry.
- The SFEI-derived assets remain gitignored until SFEI replies in writing.

## 6. Testing

- **Pure logic is unit-tested:** state codec, clamping, rotation maths, search ranking, hotspot validation, vegetation placement determinism and density, the quality controller, height sampling for the overlay.
- **Build script:** tested with a small synthetic road file, then run on the real TIGER data.
- **DOM and WebGL are verified in a real browser** with a written checklist, plus the existing frame-time benchmark.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Scope (four bundles) | Parts ship independently; the plan orders them 3A, 3B, 3C, 3D, 3E |
| Vegetation costs too much GPU on phones | Capped per chunk, only at full-resolution LOD, quality controller turns it off |
| Hotspot facts being wrong or unsourced | Schema test requires sources; every entry reviewed against its source |
| Street overlay clutter | Major streets by default, faint colour, layer toggle |
| TIGER positions less precise than local data | Fine for orientation at 10 m cells; the overlay is labelled "modern, approximate" |
