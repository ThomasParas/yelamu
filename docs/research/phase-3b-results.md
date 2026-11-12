# Phase 3b-1 results (authenticity tooling), 2026-11-11

Executed from `docs/superpowers/plans/2026-11-11-phase-3b-authenticity-tooling.md` (base `1510a3e`), one commit per task (`8401af7` through `09bc418`). The files were applied mechanically in plan order from the verified scratch copies; every red-then-green step and every stated test count matched (pipeline 310 to **504** passed plus 1 skipped Pillow smoke test, viewer 505 to **572**), typecheck and build clean.

> **Licensing gate.** The real-city assets, `ponds.json` and the compare image come from the SFEI habitat layer, which still has no stated license. They are gitignored. Nothing was downloaded in this phase.

## Numbers on the real city

| Measurement | Prototype | This run (repo build) |
|---|---|---|
| Build | 4.4 s | completes; `Carved 17 ponds (17 from SFEI, 0 hand-drawn), 1755 cells`; one 1-cell polygon dropped |
| `ponds.json` | 29.8 KB | 30 KB; `meta.json` has `ponds_file` and four `hand_sources` rows (counts 2, 1, 13, 1; all Documented) |
| Cells that differ from the Phase 3 heightmap | 2,323 (1,755 pond + 568 bank) | **2,323 of 2,771,615** |
| Overlay and its cross-check | n/a | rebuilt, 37 landmarks and 11 hotspots, cross-check exit 0 |
| Pond meshes in the scene | n/a | 17 |

## Browser checks (real city, Browser pane)

| Check | Result |
|---|---|
| Mountain Lake: flat surface at its own level, no wall on the uphill shore | **pass**: a broad terraced ramp (terraces are the 10 m cell size under flat shading) |
| Sources panel "Hand-drawn and sculpted" | **pass**: four rows, Documented badges, counts "2 ponds", "1 pond", "13 ponds", "1 pond"; the data-layer list also shows a `ponds` layer ("17 freshwater ponds from 4 sources ...") |
| Legend line "Ponds and lagoons sit at their own water level." | **pass** (present in the panel text) |
| `ponds.json` missing | **pass**: exactly one console warning, no pond meshes, the map works |
| Frame cost of ponds | **no measurable cost**: same view with and without `ponds.json` gave 19 and 17 fps (p90 52 and 59 ms), 41 and 38 draw calls, 661,531 and 661,208 triangles. The absolute numbers are **not** comparable to Phase 3's 8.3 ms: this pane was rendering a 1100 x 750 emulated viewport at zoom 14 and was throttled; only the A/B comparison means anything |
| Water motion off and reduced motion on ponds | **not tested** (ponds share the sea's material, so they should follow the toggle; unverified) |
| Flicker while rotating across the LOD switch | **not tested** |
| Crissy Field lagoon | **not looked at** |
| Compare tool on real output | **produced** (`docs/research/local/compare-mountain-lake.png`, three panels, grey sheet placeholder) |

## What was NOT exercised

- Georeferencing on a real 1850s sheet (no sheet downloaded; synthetic sheets with known truth only).
- Phones, reduced motion, assistive technology.

## What still needs a person

See the end of the plan: download a real sheet (name file, source and size first), trace Lake Merced (not in SFEI), decide the two `Tidal coastal lagoon` polygons, cite heights for Rincon Hill and the Market Street dune ridge, then the 3b-2 NOAA importer after discovery. The Phase 3 open items (About and hotspot review, phone measurement, SFEI reply, hosting) still stand.
