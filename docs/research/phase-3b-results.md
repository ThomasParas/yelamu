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
| Sources panel "Hand-drawn and sculpted" | **pass before the review fixes** (four SFEI rows, Documented); **superseded**: after the fixes the section is absent until something is hand-drawn. The data-layer list shows a `ponds` layer ("17 freshwater ponds from 4 sources ...") |
| Legend line "Ponds and lagoons sit at their own water level." | **pass** (present in the panel text) |
| `ponds.json` missing | **pass**: exactly one console warning, no pond meshes, the map works |
| Frame cost of ponds | **no measurable cost**: same view with and without `ponds.json` gave 19 and 17 fps (p90 52 and 59 ms), 41 and 38 draw calls, 661,531 and 661,208 triangles. The absolute numbers are **not** comparable to Phase 3's 8.3 ms: this pane was rendering a 1100 x 750 emulated viewport at zoom 14 and was throttled; only the A/B comparison means anything |
| Water motion off and reduced motion on ponds | **not tested** (ponds share the sea's material, so they should follow the toggle; unverified) |
| Flicker while rotating across the LOD switch | **not tested** |
| Crissy Field lagoon | **not looked at** |
| Compare tool on real output | **produced** (`docs/research/local/compare-mountain-lake.png`, three panels, grey sheet placeholder) |

## Independent review (read-only, stronger model) and fixes

Stage 1 (compliance) passed: the changed files match the plan's list exactly, nothing SFEI-derived or generated is tracked. Stage 2 found real defects that no test or browser check had caught. All were fixed test-first, one commit each (`c944165` through `8b2f0e7`); pipeline is now at **562** tests (+1 skipped), viewer unchanged at **572** (one comment added in `parse.ts`).

| Finding | Fix |
|---|---|
| Overlapping ponds drew two water surfaces (the exported ring was the full polygon, carving used only the cells the pond owns) | Lower-priority ponds lose the area of higher-priority ones before export; every pond is clipped to the grid; a pond split in two gets ids suffixed `-2`, `-3` |
| The pipeline could emit a `ponds.json` the viewer rejects whole (name over 120 characters, level outside -100..1000), leaving carved beds and no water | Both sides share the limits; the pipeline raises, naming the feature; a test builds the worst allowed pond |
| Pond edges floated: the bank blend let the ground just outside a pond stay up to 1.75 m below its level (44 of 113 shore cells on the Crissy lagoon) | Lower bound uses distance minus half a cell. On the real city 121 of 706 shore cells were more than 0.5 m below their pond's level, now 32; 31 of those are bay or marsh cells, which the blend never touches |
| Georeferencing accepted near-collinear control points (six points within 3 m of a 4 km line passed with RMS 1.1 m, yet a point 1 km off the line mapped about 400 m wrong) | Refuses badly conditioned fits (limits per order, 100 / 500 / 2000), degenerate hulls, and order 2 or 3 outputs that extend far beyond the control points (order 1 warns) |
| SFEI ponds were listed under "Hand-drawn and sculpted", and labelled Documented although their level is the modern DEM median | Only hand ponds produce `hand_sources` rows; SFEI ponds and the `ponds` layer are **Inferred** ("extent from SFEI, level from the modern DEM") |
| One collapsed hole aborted the whole build | Collapsed holes are dropped with a note; a collapsed outer ring drops an SFEI pond and refuses a hand pond |
| A pond level under the sea plane (0.6 m) was accepted | Refused for hand ponds, dropped for SFEI ones |
| Compare-tool lon/lat ticks used the middle latitude and longitude (40 to 50 m off) | Computed on the edge they are drawn on |
| Minor: negative depth or shelf accepted; `check_polygons` ignored level and name; `--report` written on refusal; a stale docstring | Fixed |

Real city after the fixes: 17 ponds, 1,755 cells, `ponds.json` 30 KB, no `hand_sources` (nothing is hand-drawn yet), sanity checks and the overlay cross-check pass. The browser checks above were made **before** the fixes and not repeated; the changes affect pond edges (higher ground at the shore) and the Sources panel (the hand-drawn section no longer appears while nothing is hand-drawn).

## Re-check after the review fixes (real city, Browser pane)

| Check | Result |
|---|---|
| Rebuilt assets are the fixed ones | **pass**: `ponds.json` has 17 ponds, all `inferred`, source "SFEI ... (extent); water level from the modern DEM"; `meta.json` has no `hand_sources` |
| Mountain Lake | **pass**: unchanged look, flat surface, ramp on the uphill shore, no console messages |
| Barrier-beach lagoon 1 (Presidio shore, level 3.45 m) | **pass**: the narrow lagoon behind the sandy bar sits on the ground with no hovering sheet |
| Ponds share the sea's water material | **pass** (checked in the scene: one material for all 17 meshes, identical to the water module's) |
| Water motion toggle | **partly**: the checkbox turned off and the shared material means ponds follow it; an animated-versus-still difference on a pond was not seen directly |
| Whole-city view across the LOD switch | **pass**: LOD 1 draws the ponds without artifacts |
| Console | no warnings or errors |

Still **not** tested: reduced motion with the OS setting, rotation (Q and E) across the LOD switch while watching for shoreline flicker, phones.

## What was NOT exercised

- Georeferencing on a real 1850s sheet (no sheet downloaded; synthetic sheets with known truth only).
- Phones, reduced motion, assistive technology.

## What still needs a person

See the end of the plan: download a real sheet (name file, source and size first), trace Lake Merced (not in SFEI), decide the two `Tidal coastal lagoon` polygons, cite heights for Rincon Hill and the Market Street dune ridge, then the 3b-2 NOAA importer after discovery. The Phase 3 open items (About and hotspot review, phone measurement, SFEI reply, hosting) still stand.
