# Yelamu Phase 3b (Authenticity) — Design

**Date:** 2026-11-11
**Status:** Approved design; plan to follow
**Builds on:** Phases 0 to 3 (full city, habitat raster, overlay, hotspots). Addresses the "known limits" listed in `docs/research/full-city-results.md` and `phase-3-results.md`.

## 1. Goal

Replace the places where the map shows modern ground or a guess with sourced reconstruction: the south-east shoreline and Treasure Island, the south-east marshes and creeks, graded-away landforms, and freshwater ponds. Every piece must say where it came from.

## 2. Decisions

| Question | Decision |
|---|---|
| Scope | All four: south-east shoreline and Treasure Island; south-east marshes and creeks; lost landforms; freshwater ponds and lagoons |
| Method | **Traced by the owner, aided by a comparison tool** (the owner's choice), plus **NOAA's already-extracted vector shorelines wherever they cover** (found during planning, see 3) |
| Provenance | Every hand-drawn polygon and every landform carries a **required `source` and `confidence`**; the builder rejects inputs without them; the Sources panel lists them |
| Licensing | Hand-traced polygons and landform entries are the owner's work and may be committed. Built heightmaps and rasters stay gitignored while the SFEI habitat layer's license is unresolved |
| Splitting | **3b-1** = tooling that does not depend on unseen file formats. **3b-2** = the NOAA shoreline importer, written after the real files have been inspected |

## 3. Source findings (planning research)

- NOAA's **Shoreline Data Rescue Project** published a vector shoreline extracted from the 1853 San Francisco survey, dataset `CA37B07`. Extent: lon -122.421 to -122.382, lat 37.761 to 37.807 (Yerba Buena Cove, Mission Bay, the northern waterfront). Access constraints: none. Use: credit NOAA; not for litigation or navigation. Positional accuracy: "has not been determined". It is distributed through NOAA's Shoreline Data Explorer (`nsde.ngs.noaa.gov`), a web viewer.
- Other Bay-area sheets exist (for example `WC37E06`, `WC37E11`, `CA37G01`), but their coverage of Hunters Point, Candlestick and Treasure Island, and their download routes, were **not found**; the viewer is not queryable from a script. Finding them is interactive discovery work with the owner.
- NOAA's original T-sheet scans are US federal works (expected public domain; the rights statement is to be confirmed in the plan's first task). The Rumsey/Stanford georeferenced scans are CC BY-NC-SA, so view-only. SFEI's own georeferenced sheets may be viewed in QGIS for reference only.
- SFEI's Mapping Yelamu's Historical Landscape data (the unmapped south) has no release yet.

## 4. Parts

### 3b-1 (this plan)

**A. Georeferencing and comparison tooling**
- `georeference`: scan plus control points (pixel position and known lon/lat) in, a map-aligned GeoTIFF out. Polynomial fit of order 1 to 3 in UTM, residual error reported per control point, **refuses a fit that is too loose or under-determined**. No new dependency.
- `render_compare`: for any bounding box, renders the current reconstruction (water, marsh, land, shoreline) beside and blended over a georeferenced sheet, with a scale bar and coordinate ticks. The tracing feedback loop.
- `check_polygons`: validates hand-drawn files and prints counts, areas, sources and warnings (outside the region, overlaps).

**B. Provenance and inputs**
- Hand-drawn polygon files require per-feature `source` and `confidence`. Landforms require them too and gain a **ridge** shape (a polyline with a half-width and a cited height), for Rincon Hill and the Market Street dune ridge.
- The Sources panel lists hand-drawn and landform sources.

**C. Ponds**
- A pond is a polygon with its own water level. Sources: SFEI's lake and lagoon classes where mapped (a configured class list), plus traced polygons for the unmapped south (Lake Merced's south lake, for example). The pipeline carves a bowl and exports `ponds.json` (world metres, level, source); the viewer draws a flat water surface at each pond's level, so ponds stop being blue ground at land height.
- The `Tidal coastal lagoon` polygons are decided with the comparison tool, by the owner, and recorded.

**D. Guided sessions for the owner**: a written tracing guide (area by area, in order of visible impact, with acceptance checks).

### 3b-2 (a separate small plan, after discovery)
- Inspect the real NOAA files, then write the importer that turns shoreline linework and land/water polygon labels into water polygons with provenance, and extend it to further sheets as they are found.

## 5. Out of scope
Hosting and launch, the cultural layer, vegetation changes, SFEI's license reply, anything needing data nobody has published.

## 6. Testing
- Pure maths tested in Node and Python: polynomial fits recover known distortions, refusal on loose or under-determined fits, ridge falloff, pond carving and level, provenance validation, ponds export, polygon-to-geometry parsing in the viewer.
- Georeferencing and the compare tool are exercised on synthetic sheets with known truth. They have **not** been exercised on a real 1850s sheet; the plan includes that step, with an approval gate for the download.
- Viewer ponds are checked in a real browser on the real city, where the SFEI pond classes give real polygons.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Heights for lost landforms are the weakest source | Each entry needs a cited height; entries without a good source stay out. Ridge and bump stamps are `illustrative` unless a source gives a number |
| Georeferencing error from poorly chosen control points | The tool reports residuals and refuses loose fits; the compare tool shows the result against the modern shoreline |
| NOAA coverage of the south-east may not exist | 3b-2 is conditional on discovery; hand tracing from the scans remains the fallback |
| 1850s sheets are hand-drawn and have their own positional error | Recorded as `inferred`, never `documented`, unless a source states the feature |
