# Full-city results (Phase 2, 2026-11-11)

Grid 1771 x 1565 cells at 10 m (UTM 10N), bbox lon -122.53..-122.33, lat 37.70..37.84. Heights -3..279 m.

> **Licensing gate.** The output is derived from SFEI's "San Francisco Historical Habitats" layer, which has **no stated license**. The generated assets (`viewer/public/assets/real-city/`) and the screenshots below (`docs/research/local/`) are gitignored. Do not publish or push them until SFEI confirms terms in writing.

## How to reproduce

```bash
cd pipeline
uv run python -m yelamu.cli --region regions/full-city.json          # about 2 s, exit 0 = sanity checks pass
uv run --with pillow python scripts/render_classes.py ../viewer/public/assets/real-city ../docs/research/local/city-classes.png
cd ../viewer && npx vite                                              # open /?data=real-city&debug
```

Needs `pipeline/data/raw/{dem.tif,sf_habitats.geojson,bay.geojson,marsh.geojson}` (see `slice-results.md`). If `vite` crashes with `fsevents.watch is not a function`, see Addendum A6 of the Phase 0+1 plan.

## Pipeline

| Measurement | Plan's prototype | This run |
|---|---|---|
| Wall time / peak memory | 2.2 s / 472 MB | 2.22 s / 467 MB |
| Gap-filled open bay (no SFEI polygon, modern DEM at or below 0.5 m) | 43.4% | 1,202,477 cells (43.4%) |
| Thin modern land removed | 628 cells | 628 cells |
| `heightmap.u16` | 5,543,230 B (2,573,926 gzipped) | identical |
| `habitat.u8` | 2,771,615 B (47,279 gzipped) | identical |
| Sanity checks (Twin Peaks, Mount Davidson, ocean off Ocean Beach, Ferry Building) | pass | pass (exit 0) |

Total over the wire about 2.6 MB gzipped, against the spec's 10 MB budget.

## Viewer (measured in a real browser on an Apple desktop, 120 Hz display)

| View | Triangles | Draw calls | Result |
|---|---|---|---|
| Whole city, coarse LOD | 346,430 | 184 | stable, no hitches |
| Just above the LOD switch (zoom 2.86 in a 1500x900 window), panning continuously for 4 s | 2.56 M | 81 (79 chunks) | 112 fps effective; median 0.4 ms CPU per frame; 95th-percentile frame gap 15.9 ms (an occasional dropped frame while chunks build) |
| Zoomed in on dunes and the hills (zoom 5.2) | 917 k | 30 | 116 fps |

Synthetic city (no real data): 184 draw calls, 343,204 triangles, LOD 1, switch at zoom 2.61, no console errors.

**Not measured:** phones and low-end GPUs. The knob to turn is `MAX_COARSE_SPACING_PX` in `viewer/src/main.ts` (see Task 11 Step 4 of the plan).

## What it looks like

Local images: `docs/research/local/city-classes.png`, `city-3d-whole.jpg`, `city-3d-zoomed.jpg`.

**Right:**
- A recognisable San Francisco with real relief. North and west: tan dune country, dark-green oak woodland patches, small blue ponds and lakes, a teal marsh fringe at the Mission Bay and north shore. Habitat colours line up with the classification map.
- The bay is one uniform blue with no visible data edge (the sea-floor plane works). The SFEI water margin and the inferred bay are the same colour because both are group `water`.
- No seams between chunks, no holes, no popping when crossing the LOD switch.

**Known limits (expected, not bugs; see Addendum B of the plan):**
- The south and south-east (about 31% of the cells) are unmapped and grey, with a modern harbour shoreline and modern terrain.
- Treasure Island (1930s fill) shows as land. The Marin Headlands, Yerba Buena Island and an East Bay sliver appear as unmapped land at the edges of the box.
- Freshwater ponds and lagoons are colour only (about 1,900 cells), not carved into the terrain.
- Vertical exaggeration is 3, which makes Twin Peaks and Mount Davidson very dramatic.

## Decision: **Go to Phase 3**

The full city builds in seconds, loads small, and runs at the display's refresh rate on desktop. Candidates for Phase 3, roughly in order of impact on realism:

1. **SFEI license** (blocking for any public release).
2. **Hand-draw the south-east and Treasure Island** into `pipeline/data/full-city/hand/` from a source you may use; this is where the grey area becomes real data.
3. Hand-sculpt lost landforms (Rincon Hill and others) into `pipeline/data/full-city/landforms.json` from the 1850s sheets.
4. Carve freshwater ponds and lagoons; decide the 'Tidal coastal lagoon' polygons.
5. Measure on a phone and tune `MAX_COARSE_SPACING_PX`; consider lowering the vertical exaggeration.
6. Vegetation, the modern-street overlay, search, hotspots and the provenance panel, the constrained camera, animated water.
7. The cultural layer, only with the Ramaytush Ohlone community's involvement (outreach draft is unsent).
