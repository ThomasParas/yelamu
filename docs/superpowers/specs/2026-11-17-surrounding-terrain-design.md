# Surrounding terrain: a grey modern context ring, then 1850s shores in stages

Status: design approved by the owner 2026-11-17 (conversation). Next: owner reviews this file, then the implementation plan.

## Why

The 1769 map covers San Francisco only (lon -122.53 to -122.33, lat 37.70 to 37.84, 10 m cells). Beyond it there is open water and nothing else, so the peninsula looks like it floats. The owner wants the surroundings filled in, even greyed and coarse: Marin (Sausalito, Tiburon, the headlands, Mount Tamalpais), the East Bay (Richmond to San Leandro, Oakland, Berkeley, Emeryville, Alameda), and the peninsula south to at least Millbrae and Linda Mar (Pacifica).

## Decisions already made

1. **Ship a grey modern ring first, then add the 1850s Bay shore in stages after launch.** The launch does not wait for the 1850s work.
2. **Outside the 1769 map the terrain is modern, in one muted grey-brown, labelled as modern.** The legend says so. No habitat colours, no plants, no streets in the ring.
3. **1850s shore, where a source exists, comes later** (East Bay, then the peninsula bayshore, then Marin), using the NOAA Shoreline Data Rescue vectors and the existing importer. Where a stage is not done, that shore stays modern and the legend says so.
4. **The ring data format must already accept hand-drawn water and marsh polygons**, so each later stage adds data only, with no viewer change.
5. **Modern place names only.** The ring does not name peoples or territories; Marin and the East Bay were other peoples' homelands and that would be cultural content needing community review.

## Non-goals

- 10 m detail outside SF (18.8 M cells, 37.6 MB of heights; not viable on phones).
- Habitat colouring, vegetation, ponds, TIGER streets or hotspots in the ring.
- Reconstructing 1769 terrain in the ring. It is orientation only; confidence **illustrative**.
- Any claim about who lived where outside the existing About text.

## What the visitor sees

- The opening view and all existing share links are unchanged (the default framing keeps using the city's numbers).
- The visitor can zoom out and pan until the whole ring is in view.
- The ring is one muted grey-brown, shaded by the same lighting as the city (flat shading).
- The bay is the same translucent water plane as today, so it continues to the ring's edges.
- About 20 modern place labels appear only when zoomed out and are searchable: Oakland, Berkeley, Alameda, Emeryville, San Leandro, Richmond, Sausalito, Tiburon, Mount Tamalpais, Brisbane, South San Francisco, San Bruno, Millbrae, Pacifica, Linda Mar, SFO, and similar. Exact list and positions are part of the plan; each is checked against a source.
- A crisp edge separates the coloured 1769 map from the grey ring. The plan's prototype step compares it with a soft fade; the owner picks.

## Data (pipeline)

- **Source:** the 3DEP elevation file already on disk (`pipeline/data/raw/dem.tif`, lon -123 to -122, lat 37 to 38, no gaps). No new downloads.
- **Extent:** lon -122.60 to -122.05, lat 37.58 to 37.93 (48.4 x 38.8 km), rounded outward to whole cells.
- **Cell size:** about 60 m, so about 520,000 cells and about 1 MB of heights.
- **Alignment (exact):** the grid is anchored at the city map's north-west corner. The city is 17,700 m wide and 15,640 m tall; 15,640 is not a multiple of 60, so the ring uses a column spacing of 60 m (295 columns across the city) and a row spacing of 15,640 / 261 = 59.92 m (261 rows). Cells are therefore very slightly non-square, and the city's four edges land exactly on ring grid lines. The ring stores `cell_x_m` and `cell_y_m`.
- **Resampling:** area-average from the DEM onto the UTM 10N ring grid (not nearest; it must not alias ridges), then 16-bit quantisation over the ring's own min and max, written like the city heightmap (raw little-endian uint16, row 0 = north).
- **Output:** `context.u16` and a `context` block in the existing `meta.json` (size, spacing, bounds, min and max, source, attribution, confidence `illustrative`), inside `viewer/public/assets/real-city/`. One dataset folder; no change to the deploy pruning.
- **Region file:** a new optional `context` key in `pipeline/regions/full-city.json` (bbox, cell size, output), validated by `region.py` and listed in `processing` in the meta.
- **Stage hook:** the same `context` key accepts `hand_bay` and `hand_marsh` polygon lists (same GeoJSON files and rules as the city: source and confidence required, bay beats marsh). Ring cells inside bay polygons are set to a bay floor value; inside marsh polygons to the marsh level. With no polygons the ring is the modern shore.
- **Build:** a new `scripts/build_context.py` over a new `yelamu/context.py`; tests first.

## Viewer

- **New module `context`** (own files; the city terrain classes are not changed). It reads the `context` block and heights, and builds the ring as tiles of roughly 64 x 64 cells (so the frustum can cull them), leaving out cells inside the city rectangle.
- **Seam:** the ring's inner edge sits on the city's edge (exact alignment above) and gets a short vertical skirt in the same colour, so the 60 m versus 10 m edge never shows a crack.
- **Material:** `MeshStandardMaterial`, flat shading, one vertex colour from a single ramp (grey-brown, slightly lighter with height), so it lights like the city.
- **Water:** the existing water plane and sea floor are reused. Ring cells below the water level are covered by the plane.
- **Loading:** fetched after the city is up, in parallel with idle work; a failure to load the ring never breaks the map (console warning only, as for `overlay.json`).
- **Camera:** the pan bounds and minimum zoom widen so the whole ring fits. Default framing is computed from the city only. The depth range (near and far planes) must include the ring's tallest point (about 783 m against 279 m).
- **Labels and search:** the context place labels use the existing labels layer with a "context" class shown only below a zoom threshold; search items are added with the same flag.
- **Cost:** about 0.9 M extra triangles when the whole ring is in view (about 1.1 M with the city at coarse LOD); the phone ran 1.4 M at 60 fps. If an older phone struggles, the cell size goes to 90 m by changing the region value and rebuilding. The quality controller is unchanged.
- **Benchmark:** `?bench` gets a scenario E, "whole ring in view", with the same pass rule.

## Honesty and wording (a gate)

- **Legend:** an entry "Grey: modern terrain and shoreline, shown for orientation only; not part of the 1769 reconstruction."
- **Sources panel:** a `context` layer row: USGS 3DEP, modern, 60 m, confidence **illustrative**, with the stage list below once any stage ships.
- **About:** one short paragraph saying the grey area is today's terrain and coastline, that the Bay edge there includes modern fill, and that it is not a reconstruction.
- **Owner approval:** the About and Legend wording was a launch gate; the new text is shown to the owner verbatim and approved before it goes in. Provenance wording follows the same rule as the rest of the Sources panel.
- No claims about peoples or territories in the ring.

## Stages after launch (data only)

Each stage follows the SF process (`docs/research/tracing-guide.md`, `docs/research/phase-3b2-results.md`): ask before downloading, import the NOAA vectors with the existing importer (seeds, closures, preview image), owner checks the preview, the polygons go into the ring's `hand_bay` and `hand_marsh`, rebuild, check the compare image, review.

1. **East Bay** (Richmond to San Leandro, Alameda, the Oakland Estuary): NOAA project CA37B02A "Martinez to San Francisquito Creek" and CA37C12 "Entrance to San Antonio Creek".
2. **Peninsula bayshore** (San Bruno, SFO, Millbrae to Redwood City): CA37B03, CA37B06, CA37B11, and CA37B02A.
3. **Marin** (Sausalito, Tiburon, Richardson Bay, Corte Madera): CA37C06 "San Rafael to Point Bonita".

Project coverage is from catalogue titles only; each stage first downloads and checks the vectors. SFEI's statewide Historical Ecology GIS Data Compilation v2.3 (GPL-3.0-or-later, 49 MB) may add marsh classes; its Bay-wide layer is unconfirmed until opened (download needs approval). The Pacific coast has no 1850s sheet in the catalogue list and stays modern.

## Testing and verification

- **Pipeline (tests first):** exact grid alignment of the city rectangle; area-average resample on a synthetic DEM; quantisation round trip; `context` region key validation (missing, wrong type, bbox not containing the city); meta block contents; polygon stage hook (bay beats marsh; source required).
- **Viewer (tests first, node):** tile plan leaves out the city rectangle exactly; skirt geometry counts; widened camera bounds and minimum zoom; default framing unchanged (a regression test with today's numbers); near/far include the ring.
- **Browser:** default view; whole ring; a close-up of the seam on the north and south edges and the Golden Gate; rotation with Mount Tam; the legend, About and Sources text; the axe check again; reduced motion unchanged.
- **Phone:** scenario E over Tailscale on the owner's phone; record in `docs/research/launch-results.md`.
- **Prototype first:** before the plan is locked, a throwaway render shows crisp edge versus fade and the Mount Tam effect; no project code changes in that step.

## Risks

- A visible crack or colour jump at the seam.
- Mount Tam (766 m) dominating the northern view when rotated.
- Load on older phones in the whole-ring view.
- Until stage 1, the East Bay shore is modern (Alameda, Oakland port, SFO and Foster City are fill, 2 to 3 m in the DEM) beside SF's 1850s shore.
- Label clutter and wrong label positions.
- The owner's wording gate delaying launch.

## Open points for the plan

- Crisp edge or soft fade (decided on the prototype).
- Whether 60 m stays or 90 m is needed (decided by the phone run).
- The exact label list and zoom threshold.

## Amendments made while planning (2026-11-17)

These refine the design above; where they differ, they win.

1. **Own file, not a meta block.** The ring is described by `context.json` and `context.u16`, discovered through a new `meta.json` key `context_file` (patched in by `scripts/build_context.py`, like `overlay_file`), and listed in `meta.layers` as the layer `context`. A city rebuild rewrites meta.json and drops `context_file` and the layer entry, so run `scripts/build_context.py` again after any city rebuild (the README says so); the ring's own files are never touched by a city rebuild. A dataset without the key simply has no ring.
2. **Vertex lattice with explicit hole indices.** `context.json` stores the lattice origin, spacings (`dx` 60 m, `dz` 59.92 m for the real city), vertex counts and the hole as integer cell indices (`i0, i1, j0, j1`), so the viewer needs no floating-point alignment test. The hole is the city mesh rectangle, 17,700 x 15,640 m.
3. **City-edge heights.** The ring's vertices on the hole boundary take the city heightmap's values (bilinear along the edge), so the two surfaces meet at the same height; skirts hide the small remaining gaps.
4. **Open water is flattened.** Ring vertices at or below 0.5 m become the bay floor (-3 m), so the ring's water shades like the city's bay.
5. **Outer skirt.** The ring is a slab: its outer edge also gets a skirt (down to the sea floor plane) so no cut edge shows daylight.
6. **Colour.** Land uses the existing "unmapped" ground colour (`GROUP_COLORS.unmapped`), up to 15 percent lighter with height; the Legend row for that colour already says "modern terrain shown for context". Water uses the water colour with the city's depth shading.
7. **Places ride the existing label, search and Places machinery** as landmarks of a new kind `region`, passed from the context module to the overlay module through `AppContext.extraPlaces`. They are labelled only at zoom 1.6 or less, and selecting one flies to zoom 1.2.
8. **Camera.** Near and far planes are already +-1e5, so no change. Pan bounds become a rectangle with a centre offset (the ring is not centred on the city), and the minimum zoom is computed from the ring's fit. The sea and sea-floor planes grow from 4x to 6x the city extent.
9. **Tiles** are 96 x 96 cells (about 63 tiles).
10. **Optional follow-ups chosen in the look-and-decide task:** a soft colour fade at the city edge, and a soft height knee for Mount Tamalpais.
