# Historical creeks: design

Date: 2026-11-18. Owner: Yelamu Map Maker session. Status: built; the body below is the design as written, and "Corrections after the build" at the end says where the build differs.

## Goal

Draw San Francisco's historical creeks on the map as lines on the terrain, so the water that ran through the 1769 landscape is visible and not only named in hotspot cards. Triggered by SFEI's story map, which shows full-city creeks, ponds and tidal systems.

## What SFEI publishes (read-only inspection, 2026-11-18)

Both are public ArcGIS feature services owned by SFEI's Resilient Landscapes programme (`rlandscapes`). Neither states a licence.

| | Hand-mapped creeks | Modelled streams |
|---|---|---|
| Item | "San Francisco Historical Creeks", id `b09c42756dd84305a919bccf46b0e88b`, tags HNSF, SFEI | "MYHL_HistoricStreams", id `6e1a2f7920c14e7e92075d3209d72573`, copyright text "SFEI-ASC 2024" |
| Service | `services1.arcgis.com/8V9ShUQ1DGYVLtOg/.../San_Francisco_Historical_Creeks/FeatureServer`, layer 0 | `.../MYHL_HistoricStreams/FeatureServer`, layer 1 |
| Features | 26 lines (2,015 vertices, 84 KB as GeoJSON) | 10,270 segments, Strahler order 2 to 6 |
| Covers | north and central city, lon -122.485 to -122.403, lat 37.755 to 37.809 | the whole city and beyond, lon -122.514 to -122.380, lat 37.590 to 37.805, as measured in the downloaded file (the item page's extent, lat 37.69 to 37.749, was wrong or stale) |
| Attributes | name (8 of 26), `stream_typ` ("well located" on 8 lines), program tag (HNSF or WLA, original or revised), digitising method, cited sources (Hoadley 1855, Goddard 1869, Hall 1870, Wheeler 1870, Warner 1847, SeepCity and others) | `StrahlerID` only |
| Method | Mostly "historical DEM flow accumulation", checked against cited 19th-century maps | Derived by SFEI from a historical elevation model, accumulation threshold 0.1 km2, order 1 dropped as "inconsistent". The description has unfilled blanks ("developed by ____") |

Order counts in the modelled set: order 2 has 5,086 segments, order 3 has 2,803, order 4 has 1,765, order 5 has 586, order 6 has 30. The downloaded file (order 3 and up) holds 5,184 features: 2,803 of order 3, 1,765 of order 4, 586 of order 5 and 30 of order 6. One order-3 feature is a MultiLineString of two lines, so the build reads 5,185 line segments (2,804 of order 3).

**Cross-check already made.** Chutchui Creek ends about 330 m from the Sitlintac village disc and passes about 500 m from the Chutchui disc. That fits the village positions read off SFEI's picture. It is a sanity check, not a measurement.

**Not checked:** whether either set reaches Mission Creek's lower reach (the hand-mapped extent stops at lon -122.403); how the lines sit on this project's shoreline and 1769 land mask (this is the first task of the plan).

## Decisions (owner, 2026-11-18)

1. **Both datasets**, the modelled one labelled as modelled.
2. **Ship both together.** The modelled data has no stated licence, so the SFEI email asks about creeks and their terms; if SFEI says no, the layer is removed (recipe at the end), as with the village sites.
3. **Modelled density: order 3 and up** (5,184 features, 5,185 line segments, merged into continuous channels). Order 2 is not drawn.
4. **Two toggles**, separate from Landmarks, Hotspots and Village sites.
5. **Overlap:** modelled pieces within 100 m of a hand-mapped creek are not drawn (owner, 2026-11-18), so each creek is drawn once, by the hand-mapped line, and the modelled streams show the rest of the city. Found in the real data: the modelled file covers the whole city, so north of lat 37.755 it runs along the hand-mapped creeks.

Risk the owner accepted: publishing before the licence is confirmed. Unlike the village sites this is a copyright and terms question, not a question of respect, so the plan keeps it easy to undo: all creek data lives in one file and one build script.

## Scope

In: the two line layers, their provenance and Legend rows, labels for named creeks, search and a card for named creeks that do not already have a hotspot, a NOTICE credit.

Out: culverts or "what is under the street now", flow animation, shore stages, SFEI's expanded creek mapping (due fall 2027), headwater order 1 and 2 channels, any claim that a modelled line is an observed creek.

## Data path

1. `pipeline/scripts/fetch_creeks.py` downloads both services to `pipeline/data/raw/sfei-creeks/` (git-ignored). It records the URLs, the query used and the download date next to the files. **The modelled download needs the owner's approval before it runs** (the owner has approved only the 26 hand-mapped lines, already downloaded).
2. `pipeline/yelamu/creeks.py` reads the GeoJSON, projects to the viewer frame with the same `lonlat_to_world` the overlay uses, simplifies each line (about 3 m tolerance), and for the modelled set drops order 2, cuts out the pieces within 100 m of a hand-mapped line, then chains segments that join end to end with the same order into one polyline each. Lines that run into open bay or ocean water are trimmed where they cross the 1769 land mask (the DEM is a historical DEM, but its edges are not our shoreline).
3. `pipeline/scripts/build_creeks.py` writes `viewer/public/assets/real-city/creeks.json` and adds to `meta.json`: `creeks_mapped` and `creeks_modelled` (counts) and two `hand_sources` rows. Like the village sites, a city rebuild drops the meta additions, so the README says to rerun `build_creeks.py` after `build_overlay.py` and `build_shade.py`.
4. `creeks.json` (version 1): `mapped`: list of `{id, name (optional), confidence, basis, sources[], points}` and `modelled`: list of `{order, points}`. `points` is a flat `[x, z, ...]` array in metres, rounded to 0.1 m. Same shape discipline as `overlay.json`: sizes capped, strings capped, `parse.ts` validates everything because the file is untrusted at runtime.
5. Raw SFEI files never enter git. The shipped `creeks.json` is derived data, so `NOTICE.md` gets a row crediting SFEI, GPL-3.0-or-later pending SFEI's reply.

**Confidence.** Hand-mapped lines SFEI marks "well located" are Documented; the other hand-mapped lines are Inferred (flow accumulation checked against cited maps). Modelled lines are Illustrative (computed channels, not observed). The exact tags and words are shown to the owner before shipping.

## Viewer

New folder `viewer/src/creeks/` (`types.ts`, `parse.ts`, `geometry.ts`, `layer.ts`, tests), registered with a few lines in `modules.ts` and `main.ts` and one line each in `layerDefs.ts`, `legendEntries.ts`, `provenanceData.ts`, `heightmap.ts` (meta type), and `search`/`placesList` for named creeks. Shared files get small edits only (see `yelamu-session-ownership`).

- **Drawing.** Each polyline becomes a flat ribbon mesh draped on the terrain with `drapePolyline` (the existing helper), not a 1 px line: streets are hairlines, but a creek must stay visible at the opening zoom. Widths: hand-mapped 9 m; modelled 5 m (order 3), 7 m (order 4), 10 m (order 5 and 6). Lift 3 m, `depthWrite` false, `polygonOffset`, `renderOrder` between the village discs (1.2 / 1.4) and the streets (2): 1.6. Checked against main at 4928d6c: the foam and shallows are computed inside the sea material (`water/waterMaterial.ts`, `setShore`, sea plane `renderOrder` 0) and ponds draw at `POND_RENDER_ORDER` 1 with their own material, so the creeks draw over both and no value needs agreeing. What stays open is the look at creek mouths, which the real-browser check covers.
- **Colour.** From the shared colour tokens (water blue family), never hard-coded. A test in `uiColors.test.ts` requires the line to hold at least the contrast the village outline holds (above 1.5:1) on dune, beach, marsh and shaded ground, at the opacities used (hand-mapped about 0.9, modelled about 0.55).
- **Toggles.** "Historical creeks" and "Modelled streams", both on by default, separate from the other layers. Old share links with an explicit `l=` list hide them, as they do for the village sites.
- **Labels.** Named hand-mapped creeks (Arroyo Dolores, Old Arroyo Dolores, Chutchui Creek, Petlenuc Creek, Ojo de Agua de Figueroa, El Polin, Coyote Gulch) get a text label at the line's midpoint. Lobos Creek is not labelled again: it already has a hotspot marker. Labels use the landmark label style; they are not new markers.
- **Cards.** Named hand-mapped creeks with no hotspot get a card (kind "Historical creek") with SFEI's cited sources, opened from the label, from search and from a `p=` link. Unnamed lines and all modelled lines have no card: the Legend and Sources rows carry the explanation.
- **Pick targets.** None on the lines themselves in this version.
- **Performance budget.** Hand-mapped about 8,000 triangles; modelled depends on the chained, simplified result and has a budget of 60,000 triangles. The plan measures bench A to E in Playwright before merging and drops order 3 if the budget is exceeded.

## Proposed wording (shown to the owner verbatim before it ships)

- Legend, "Historical creeks": "Creek lines mapped by SFEI's Hidden Nature SF from 19th-century maps and a historical elevation model. Approximate; most are inferred."
- Legend, "Modelled streams": "Stream channels computed by SFEI from a historical elevation model, shown where no hand-mapped creek exists. Larger channels only. Computed, not observed."
- Sources rows: one per layer, with the SFEI item names and the confidence above.
- Card for a named creek: "{Name}, a historical creek as mapped by SFEI's Hidden Nature SF, after {cited sources}. The line is approximate: creeks moved, and later streets and sewers buried or removed many of them."
- Places panel note (still "Every hotspot and landmark on the map."): proposed "Every hotspot, village site, creek and landmark on the map." Needs approval.

## Fit with the Visual Improvements session

Disjoint areas. Creeks touch `pipeline/` and a new `viewer/src/creeks/`. They do not touch `water/`, `habitatMaterial.ts`, `terrainShade.ts` or `terrainMesh.ts`. The two meet at creek mouths and in draw order. Their shoreline foam and shallows have merged (main 4928d6c); this branch is rebased on it. Whichever of the two merges second rebases.

## Verification (each reported honestly, with what was not checked)

- Pipeline tests: parsing, projection to the viewer frame, simplification, order filter, chaining, land-mask trimming, validation limits, shipped-data checks (counts agree with `meta.json`), idempotent meta patch, removal recipe.
- Viewer tests: parse limits, ribbon geometry, toggles, search and card, colour contrast, label priority (creek labels must not hide village names or hotspot markers).
- A real-browser check at 1400 x 900 and 390 x 844: lines land on the terrain valleys, mouths meet the shore, labels sit on the lines, card works. Viewer tests are node-only, so CSS and DOM bugs need this check (the village labels showed it).
- Bench A to E in Playwright (not the browser pane); close the Playwright browser afterwards.
- A comparison of the lines against SFEI's own map (the owner's screenshot) as a visual agreement only.

## Removing the layer

Run `build_creeks.py --remove` (to be defined in the plan). It deletes `viewer/public/assets/real-city/creeks.json` and removes `creeks_mapped`, `creeks_modelled` and the two creek `hand_sources` rows from `meta.json`. The Legend rows, toggles and Sources rows appear only when the dataset has creeks, so they go too. Then delete the `NOTICE.md` row.

## Corrections after the build (2026-11-18)

The sections above are the design as it was written. Where the build differs, this section is the record (details and numbers in `docs/research/creeks-results.md`).

1. **`meta.json` keys.** The build adds `creeks_file` (`"creeks.json"`) as well as the counts `creeks_mapped` and `creeks_modelled`, and the two `hand_sources` rows (`creeks`, `modelled_streams`). `build_overlay.py` writes the `villages` row after them, so the rows list in that order.
2. **Named creeks are hotspots, not a label layer.** There is no separate label layer and no "Historical creek" card kind. The seven named hand-mapped creeks that had no hotspot (Arroyo Dolores, Old Arroyo Dolores, Chutchui Creek, Petlenuc Creek, Ojo de Agua de Figueroa, El Polin, Coyote Gulch) became entries in `pipeline/data/overlay/hotspots.json` (kind `creek`), so the marker, the card, search, the Places panel and `p=` links all come from the existing hotspot machinery. Lobos Creek already had a hotspot. This replaces the "Labels" and "Cards" bullets of the Viewer section.
3. **Ribbon widths as built.** Hand-mapped creeks 26 m; modelled streams 13 m (order 3), 18 m (order 4) and 22 m (order 5 and up), instead of the 9 m and 5 / 7 / 10 m written above. The first build (12 m hand-mapped; 6, 9 and 12 m modelled) was invisible at the opening zoom (a fraction of a pixel). The compromise: the lines are faint at the opening view and about 10 px wide at the closest zoom, because one width in world metres cannot be thin when close and visible when far. Lift (3 m) and render order (1.6) are as designed.
4. **The overlap rule, and what it did.** Modelled pieces within 100 m of a hand-mapped creek are not drawn (`--overlap-buffer`, default 100), so each creek is drawn once, by the hand-mapped line. In the real data the modelled file covers the whole city, so about 13.4 km of modelled line ran within 50 m of a hand-mapped one (15.1 km within 100 m). The rule removed 15,085 m of modelled segment length: modelled channels went from 247 to 225, modelled length from 147.2 km to 132.1 km, and `creeks.json` from 55,465 to 51,004 bytes. The hand-mapped lines did not change (26 lines). The modelled file's extent is lat 37.590 to 37.805, not the south only as the item page said.
5. **Mission Creek's lower reach is drawn by neither set.** The hand-mapped layer stops short of it (the nearest hand-mapped line to the mouth at lon -122.39, lat 37.77 is 2,234 m away; the nearest modelled line is 1,086 m away), and the research for this layer found no public line dataset for that reach. In this project's habitat grid that area is drawn as hand-drawn bay water, from NOAA's 1852 T-sheet (T-00352; the 1857 sheet T-00687 overlaps it), so a line there would sit in the water.
6. **Islais Creek has a hotspot but no line.** No modelled channel of order 3 or higher crosses the Islais estuary, and SFEI's hand-mapped layer does not reach it. **`creek-1` ends on a hillside** (the north side of Bernal Heights, near world (686, 1633)): its modelled continuation lay inside the overlap buffer, so it was dropped, and the nearest drawn modelled line is 676 m away.
7. **Legend and Sources wording, as approved by the owner.** Where the design says "1850s" the shipped text says "19th-century maps", because the cited maps run from 1847 to 1870. Legend, "Historical creeks": "Creek lines mapped by SFEI's Hidden Nature SF from 19th-century maps and a historical elevation model. Approximate; most are inferred. Drawn wider than the real channel." Legend, "Modelled streams": "Stream channels computed by SFEI from a historical elevation model, shown where no hand-mapped creek exists. Larger channels only. Computed, not observed. Drawn wider than the real channel." Sources rows: "Creek lines from SFEI's 'San Francisco Historical Creeks' layer (Hidden Nature SF), mapped from 19th-century maps and a historical elevation model. Approximate." and "Stream channels computed by SFEI from a historical elevation model ('MYHL_HistoricStreams'), Strahler order 3 and up, left out within 100 m of a hand-mapped creek. Computed, not observed."
