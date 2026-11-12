# Phase 3b-2 results (NOAA 1850s shoreline import), 2026-11-11

Executed from `docs/superpowers/plans/2026-11-11-phase-3b2-noaa-import-design.md`'s plan, `docs/superpowers/plans/2026-11-11-phase-3b2-noaa-import.md` (base `aa1db73`). Tasks N1, N2, N3 and V1 were applied mechanically from the replayed scratch files, one commit each (`457cf11`, `94548f3`, `0fd6d22`, `aa2e20f`); every stated count matched: pipeline 562 to **612** passed plus 3 skipped (Pillow smoke tests), viewer **572**, typecheck and build clean.

> **Licensing.** The NOAA vectors have no access constraints (credit NOAA; not for litigation or navigation); the derived `hand_bay_noaa.geojson` and `hand_marsh_noaa.geojson` are committed, the zips stay in the gitignored `pipeline/data/raw/noaa/`. The rebuilt real-city assets, `noaa-preview.png` and `compare-southeast.png` also contain SFEI-derived data and stay gitignored. Nothing was downloaded in this run (the four zips, 870 KB, came earlier with approval).

## Numbers on the real files

| Measurement | Prototype | This run |
|---|---|---|
| Regenerated NOAA files vs the committed ones | n/a | **byte-identical** (`git status` clean) |
| Unseeded areas | 67 | **67** |
| Bay / marsh / land seeded | 2 / 1 / 1 areas | 2 / 1 / 1 (bay 21,058 ha, marsh 129 ha, land 12,849 ha not written) |
| Overlap between projects | 3965.6 ha in 2 pairs | **3965.6 ha in 2 pairs** (the 1857 bay over the 1852 bay 3935.6 ha, over the Islais marsh 29.9 ha; bay wins). Also 28.2 ha of the 1857 bay over the area seeded as land (reported only after the review) |
| Land cells turned to water | 81,115 | **81,115** (water to land: 0) |
| All cells that differ from the previous build | n/a | 184,956 of 2,771,615 (81,115 land to water; 34,743 land cells in the shore band; 69,098 water cells whose bay-floor depth changed with the new shore) |
| Changed land cells farther than 300 m from a flipped cell | n/a | 393 (Hunters Point hill about 207 cells, the Marin shore at the Golden Gate about 186); the largest drop is 14.3 m and comes from the 0.3 slope limit beside the new shore |
| Ocean Beach dunes | untouched | **0 changed cells** |
| Build | passes | completes; sanity checks pass, `islais-creek` now reads water; overlay cross-check exit 0 (37 landmarks, 11 hotspots) |
| `meta.json` | n/a | `hand_sources`: 3 rows, all `inferred`, naming sheet, year and seed |

Golden Gate: 899 land cells on the Marin side of the strait became water (the 1852 sheet's shore is further back than the modern DEM's). That is about 9 ha; noted, not changed.

## Browser checks (real city, Browser pane, 800 x 637 viewport)

| Check | Result |
|---|---|
| Islais estuary, Hunters Point, India Basin and South Basin, Candlestick | **pass**: animated water where the reconstruction had modern ground, a marsh and channel network at Islais, a peninsula with its own shore at Hunters Point |
| Sources panel | **pass**: "Hand-drawn and sculpted" lists three `hand_water` rows (sheets T-00352 1852 twice, T-00687 1857), all **Inferred**, each naming its seed |
| About, Credits | **pass**: ends with "NOAA National Geodetic Survey, Shoreline Data Rescue Project (historical shoreline vectors, 1850s)" |
| Console | **pass** on a fresh load (no warnings). An earlier load that overlapped a rebuild showed one `ponds.json` parse warning; the file was being rewritten at that moment and does not recur |
| Comparison tool | **pass**: `compare-southeast.png` shows the red 1769 shoreline following the NOAA lines in the preview |
| Rotation (Q and E) across the LOD switch, flicker at the new shores | **not tested** (the pane throttles; no rotation exercised) |
| Reduced motion, phones, assistive technology | **not tested** |

## Independent review (read-only, stronger model) and fixes

Stage 1 (compliance) passed: the changed files match the plan's lists exactly, nothing SFEI-derived or generated is tracked, all three committed features carry a source of 126 to 127 characters and `inferred`, and the shipped-data test reads only committed files. Stage 2 found no defect in the closing, noding, ids, seeds or output code (byte-identical regeneration confirmed) but these real ones, all fixed in `f771e3c` (pipeline now **615** passed plus 5 skipped, **620** with Pillow; viewer 572):

| Finding | Fix |
|---|---|
| The import command wrote both hand files before making the preview, so a missing Pillow or a bad `--bbox` overwrote the committed files, then died without a report | The preview is made first; a missing Pillow reports `run with uv run --with pillow`; tests cover both failures and that nothing is written |
| The new "Islais Creek marsh" check sat inside the 1857 bay area, so it passed with an empty marsh file, and the marsh seed's own spot rendered as bay | Seed and check moved to a point west of the bay area (habitat marsh, 0.50 m); the check also demands 0.4 to 0.6 m, which bay cells never are there. The generated files are unchanged (same area, same seed id) |
| Water covering another project's land-seeded area was not reported (the 1857 bay covers 28.2 ha of the area seeded as land) | The report now ends with a WARNING listing such pairs; on the real files: `CA37B08-6 over CA37A02-7: 28.2 ha` |
| An area bounded by no selected line produced junk provenance text | Refused with a clear error |
| The preview erased any area that sits inside another area's hole, depending on draw order | Each area is drawn on its own mask; a test fails on the old code |
| `--preview` and `--report` ignored the "relative to the pipeline directory" rule | Resolved like the other paths |

Not changed: no viewer test asserts the NOAA credit text (seen in the browser instead).

## What the picture shows, and its limits

- The Islais marsh ends in a **straight north-south seam** where sheet CA37A02 stops; east of it the 1857 bay area wins. This is the importer's closure, not a surveyed feature.
- The closures `a02-islais-mouth` and `a02-golden-gate` (and the Yerba Buena and Treasure Island ring closures) are choices of the importer, labelled as such in `noaa_seeds.json`.
- Unseeded areas (the Pacific shore, Hunters Point's own area `CA37B02B-10`, the north-waterfront pieces) are unchanged: still the modern-DEM guess.
- **Treasure Island and Yerba Buena Island are not covered**: the vectors stop at longitude -122.382.
- **NOAA states the lines' positional accuracy was not determined** (`HOR_ACC` 0), and the 1850s shore was already partly altered by the first fill. Hence `inferred`, never `documented`.

## What still needs a person

1. ~~Confirm or change the uncertain seeds~~ **Done 2026-11-12**: the owner reviewed the preview and accepted every seed and closure; `noaa_seeds.json` records this and keeps the known limits in each note. The data stays Inferred.
2. Decide whether any unseeded area becomes bay, marsh or stays land.
3. Treasure Island and Yerba Buena Island via the T-00687 scan (name file, source and size before downloading).
4. The Phase 3b-1 items (Lake Merced pond, the two `Tidal coastal lagoon` polygons, Rincon Hill and the Market Street dune ridge) and the Phase 3 launch items (About and hotspot review, phone measurement, assistive-tech pass, SFEI reply, hosting).
