# Yelamu 3D Map — Design

**Date:** 2026-11-11
**Status:** Draft for review

## 1. Summary

An interactive, public web map of Yelamu (the San Francisco landscape as it was
around 1769, inhabited by the Ramaytush Ohlone), shown as a real-time 3D scene
viewed through a locked isometric camera. Inspired by isometricsf.com in look and
feel, but built differently: that project restyles Google 3D imagery with AI image
models, and no equivalent imagery exists for 1769, so this project reconstructs
the terrain from data and renders it live.

## 2. Decisions

| Question | Decision |
|---|---|
| What "3D" means | Real 3D scene, orthographic isometric camera (not pre-rendered tiles) |
| Launch content | Landscape first; cultural layer added later, separately |
| Time depicted | Single snapshot, ~1769 (pre-Spanish contact) |
| Audience | Public from the start |
| Technical approach | Custom Three.js scene fed by an offline data pipeline |

## 3. Goals and non-goals

**Goals**
- A credible, good-looking reconstruction of the 1769 landscape: shoreline, bay
  and ocean, lagoons, creeks, marshes, dunes, hills, and habitat types.
- Smooth, intuitive exploration on laptop and phone.
- Every layer shows its source and confidence, so the map stays honest.
- A cultural layer that is accurate, clearly approximate, and shaped by the
  Ramaytush Ohlone community.

**Non-goals (deferred)**
- Time slider across eras.
- Deep time (pre-1769 sea levels and landscapes).
- Depictions of people, ceremonies, or artifacts.
- AI-generated imagery of any kind.

## 4. Architecture

Two independent parts joined by static files:

```
[Data pipeline, Python, offline]  -->  static assets  -->  [Viewer, Vite + TS + Three.js]
```

Either side can change without breaking the other, provided the asset format
(Section 5.3) is kept stable.

## 5. Data pipeline

### 5.1 Inputs
1. Modern elevation model (USGS 3DEP lidar), baseline only.
2. SFEI historical ecology layers: reconstructed shoreline, channels, habitats.
3. 1850s US Coast Survey topographic sheets, as the reference for pre-grading
   hills and dunes. Availability and georeferencing options are an open research
   item (see Section 9).

### 5.2 Steps
1. **Extent and projection.** One local coordinate system (UTM zone 10N) covering
   the city plus bay and ocean margin.
2. **Water mask.** Use the historical shoreline to classify bay, lagoon, and
   marsh. Where the modern elevation model shows reclaimed fill (e.g. Mission
   Bay, Financial District, Crissy Field), lower it to water or marsh level.
3. **Restore lost landforms.** A short, hand-curated list: Sunset and Richmond
   dune fields, Rincon Hill, the Market Street dune ridge, cut-down portions of
   Telegraph Hill. Sculpted by hand with the historical sheets as reference,
   because no clean dataset exists. v1 may be approximate.
4. **Export** the assets in 5.3.

### 5.3 Output assets
- Heightmap (16-bit image), in a few LOD chunks.
- Habitat splat-map (one class per pixel).
- Creek and shoreline vectors (JSON).
- Per-layer metadata: `source`, `confidence` (`documented` | `inferred` |
  `illustrative`), and attribution text.

### 5.4 Rule
Every layer carries a `source` and `confidence` tag, and the viewer can display
them.

## 6. Viewer

**Stack:** Vite + TypeScript + Three.js, deployed as static files (Cloudflare
Pages, Netlify, or GitHub Pages). react-three-fiber is not used initially; revisit
at planning time.

**Scene**
- Terrain: displaced mesh from the heightmap, in LOD chunks.
- Ground shading: custom shader using the splat-map, hillshade, and a stylized
  painterly palette.
- Water: animated shader for bay, ocean, lagoons, creeks, tinted by depth; marsh
  shown as shallow, patchy water.
- Vegetation: instanced trees, scrub, tules, grass, scattered by habitat class
  with a seeded random generator. Labeled `illustrative` in the UI.

**Camera:** orthographic, locked isometric angle, pan and zoom, optional 90°
rotation snaps, constrained to preserve the diorama feel.

**Interaction**
- Modern overlay toggle (faint modern streets and landmarks for orientation).
- Place search by modern address or place, with fly-to.
- Hotspots: click a site, creek, or landform for a panel with description, source,
  and confidence.
- Layer toggles, shareable links (camera state in URL), "surprise me", reset view.
- Touch pan and pinch on mobile with a lower detail budget.

**Targets:** 60 fps on a mid-range laptop, 30 fps on a phone, initial load under
about 10 MB.

## 7. Cultural layer

Built as a separate data file behind a feature flag, so the landscape can launch
independently and the layer can be pulled without affecting the rest.

**Data model per entry:** name (as recorded by the Association of Ramaytush
Ohlone, or flagged where only a historical spelling exists), type (village, trail,
resource area), approximate area, short description, sources, confidence,
consultation status.

**Rules**
1. Show uncertainty honestly: villages as soft zones, not exact pins.
2. Do not map sensitive sites (shellmounds, burials) at precise locations.
3. No invented depictions in v1: no people, ceremonies, artifacts, or
   AI-generated imagery.
4. Present tense: the About page states the Ramaytush Ohlone are a living
   community and links to the Association.

**Sources:** build on the SFEI / Association of Ramaytush Ohlone / Exploratorium
project "Mapping Yelamu's Historical Landscape" rather than duplicating it, plus
ethnographic and mission-record scholarship (to be verified during research).

**Consultation:** contact the Association before building the cultural layer.
Ask what they want shown, what to leave out, and how to credit them. Their
answer has veto power over this layer. The plan does not assume the outcome.

## 8. Build order

0. Research spike: dataset availability, licenses, attribution terms,
   georeferencing of 1850s sheets; draft outreach to the Association.
1. Vertical slice: de-develop one hard test area (Yerba Buena Cove / Mission Bay)
   end to end and render it flat-shaded.
2. Full-city terrain, water, habitat shading.
3. Vegetation, camera polish, modern overlay, search, share links.
4. Hotspots and provenance panel; launch the landscape.
5. Cultural layer after consultation, behind its feature flag.

## 9. Open questions

- Which 1850s Coast Survey sheets are available, at what resolution, and under
  what terms?
- Licensing and attribution requirements for the SFEI layers (the compilation
  page lists GPL; individual layers may differ).
- How closely the SFEI/ARO project's village data can be reused, and on what
  terms.
- Hosting choice and domain.

## 10. Testing

- **Data pipeline:** deterministic outputs; unit tests on coordinate transforms;
  sanity checks against known points (Twin Peaks unchanged; Mission Bay at water
  or marsh level; shoreline within tolerance of SFEI polygons).
- **Viewer:** screenshot comparison at fixed camera positions; automated
  frame-rate and download-size checks against the targets.
- **Public readiness:** keyboard navigation, reduced-motion mode, color-blind-safe
  overlay palette.

## 11. Risks

| Risk | Mitigation |
|---|---|
| De-development accuracy (dunes, leveled hills) | Curated hand-sculpting, confidence tags, early vertical slice |
| Data licensing and attribution | Research spike before any build |
| Cultural accuracy and trust | Separate layer, early outreach, no invented imagery, community veto |
| Mobile performance | LOD chunks, lower detail budget |
| Scope creep | Landscape-first launch; time slider and deep time deferred |
