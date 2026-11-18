# Creeks results

Design: `docs/superpowers/specs/2026-11-18-creeks-design.md`. Plan: `docs/superpowers/plans/2026-11-18-creeks.md`. Each section says what was **not** checked. Updated the same day (Task 4b) for the overlap rule below. Browser and benchmark results are added to this file by the later tasks of the plan.

## What was drawn, and from what (2026-11-18)

`viewer/public/assets/real-city/creeks.json` holds two sets of lines in the viewer's world frame (metres from the terrain centre, x east, z south), written by `pipeline/scripts/build_creeks.py` from two public SFEI ArcGIS layers (downloaded by `fetch_creeks.py` into the git-ignored `pipeline/data/raw/sfei-creeks/`):

- **Hand-mapped creeks**: SFEI's "San Francisco Historical Creeks" (26 features, `san_francisco_historical_creeks.geojson`). All 26 survive the build, as 26 lines (none split, none lost). 482 points, 16.2 km. Confidence: 8 **documented** (SFEI's own "well located" flag) and 18 **inferred** (the other 17 and one marked "Sometimes dry"). Ten of the 26 carry a name, eight distinct names: Lobos Creek, Arroyo Dolores, Old Arroyo Dolores, Chutchui Creek, Ojo de Agua de Figueroa, El Polin, Coyote Gulch, and Petlenuc Creek, which is three separate lines (`creek-17`, `creek-18`, `creek-19`).
- **Modelled streams**: SFEI's "MYHL_HistoricStreams" (`myhl_historic_streams_order3.geojson`: 5,184 features of Strahler order 3 and up, 2,803 of order 3, 1,765 of order 4, 586 of order 5, 30 of order 6; one order-3 feature is a MultiLineString of two lines, so the build reads 5,185 line segments, 2,804 of order 3). The file covers the whole city and more (lat 37.590 to 37.805, lon -122.514 to -122.380), not only the south. Segments that meet end to end with the same order are merged into channels. Modelled pieces within **100 m of a hand-mapped creek are not drawn** (the overlap rule, below). Result: **225 channels** (133 of order 3, 64 of order 4, 25 of order 5, 3 of order 6), 2,421 points, 132.1 km. Illustrative: computed channels, not observed creeks.

**The overlap rule (owner decision, 2026-11-18).** The first build (Task 4) drew the modelled channels everywhere, which put about 13 km of modelled line on top of hand-mapped creeks (see answer 3). The owner decided each creek is drawn once, by the hand-mapped line. `build_creeks.py` now cuts every trimmed modelled segment against the union of the hand-mapped lines (as drawn, after trimming and simplifying) buffered by 100 m (`--overlap-buffer`, default 100, 0 turns it off; recorded as `processing.overlap_buffer_m`) and keeps only the parts outside, before the segments are chained. It removed 15,085 m of modelled segment length (the `dropped_near_mapped_m` statistic, measured before simplification). The hand-mapped lines are identical to the first build (26 lines, 482 points); only the modelled set changed.

| | before (no overlap rule) | after (100 m) |
|---|---|---|
| Modelled channels | 247 (145 / 70 / 29 / 3 of order 3 / 4 / 5 / 6) | 225 (133 / 64 / 25 / 3) |
| Modelled length | 147.2 km | 132.1 km (order 3: 71.2, 4: 41.3, 5: 18.2, 6: 1.4) |
| Modelled points | 2,704 | 2,421 |
| Points in the file | 3,186 | 2,903 |
| `creeks.json` | 55,465 bytes | 51,004 bytes |

After the rule, 0.4 m of modelled line lies inside the 100 m buffer (a rounding effect of simplification; none inside 95 m), and the nearest any hand-mapped line end comes to a remaining modelled line is 99.9 m.

Processing: simplified at 3 m (the default), pieces shorter than 30 m after trimming dropped, lines cut where they enter open bay or ocean in this project's 1769 habitat raster (classes "Open bay (inferred from modern elevation)", "Bay (hand-drawn)", "Deep ocean/bay", "Shallow ocean/bay"; ponds, lagoons, marsh and tidal flat are not cut). A point outside the 1771 x 1565 grid counts as wet.

`creeks.json` is **51,004 bytes (51 KB)** with **2,903 points** in total (482 mapped + 2,421 modelled); the first build, before the overlap rule, was 55,465 bytes and 3,186 points. That is far under the 1.5 MB threshold in the plan, so the default 3 m tolerance stays and `--tolerance 5` was not needed or run.

`meta.json` changed only by `creeks_file`, `creeks_mapped` (26), `creeks_modelled` (225) and two `hand_sources` rows (`creeks`, confidence inferred, count 26; `modelled_streams`, confidence illustrative, count 225). Every existing key and row, including `shade` and `overlay_villages`, is untouched. The overlap rule changed only the `modelled_streams` row (its text now ends "Strahler order 3 and up, left out within 100 m of a hand-mapped creek. Computed, not observed." and its count went from 247 to 225) and `creeks_modelled`. The two row texts are proposed Sources wording and still await the owner's approval (Task 7).

## Answers to the six questions

1. **Points and size.** 3,186 points, 55,465 bytes; tolerance 3 m. See above.
2. **Modelled channels.** After the overlap rule: 225, by order: 133 (3), 64 (4), 25 (5), 3 (6). Length by order: 71.2 km, 41.3 km, 18.2 km, 1.4 km. Merging took 5,185 line segments down to channels (a confluence or a change of order keeps segments apart). Before the rule: 247 channels (145, 70, 29, 3), 78.7 km, 46.4 km, 20.7 km and 1.4 km.
3. **The lat 37.749 to 37.755 gap: there was none, and the premise was wrong; the overlap was resolved by the owner's rule.** The modelled file that was downloaded is not limited to the south of the city. Its order-3-and-up lines run from lat 37.590 (south of the city rectangle) to lat 37.805, so the modelled set also covers the area the hand-mapped set covers. The facts below were measured on the first build, before the overlap rule:
   - The hand-mapped layer ends at lat 37.7552 (`creek-1`, south end at world (686.5, 1633.4)), 13.3 m from the nearest modelled line. 21 of the 26 hand-mapped lines touch a modelled line (0 m, or 0.3 m for `creek-10`) or come within 5 m of one (`creek-16`, 4.9 m).
   - 16 modelled channels (11 of order 3, 4 of order 4, 1 of order 5) have a point inside the lat 37.749 to 37.755 band; no hand-mapped line does. So south of lat 37.755 only modelled lines are drawn, and there is no visible break between the two sets.
   - **Overlap north of lat 37.755.** 68.8 km of the 147.2 km of modelled output lies north of lat 37.755, where the hand-mapped lines are. 13.4 km of modelled output runs within 50 m of a hand-mapped line (15.1 km within 100 m). In those places the same creek would be drawn twice (the hand-mapped line over the modelled one). It also means the draft Legend text for "Modelled streams" ("for the south of the city, where no hand-mapped creeks exist yet") is not accurate as written. The owner decided to hide modelled channels within 100 m of a hand-mapped line (see "The overlap rule" above), which also makes the Legend wording "for the south of the city" unnecessary: the proposed text is now "shown where no hand-mapped creek exists".
   - **Consequence of the rule at the south end of the hand-mapped layer.** The 900 m order-3 modelled channel that followed `creek-1` (13.3 m from its south end) lay wholly inside the 100 m buffer and is gone, so `creek-1`'s south end at (686.5, 1633.4) is now 675.7 m from the nearest drawn modelled line (an order-3 channel at x 1,344 to 1,750, z 1,347 to 1,790). The visible hand-over between the two sets that existed in the first build is now a gap of that size at `creek-1`. The hand-mapped line ends where SFEI ends it; whether the creek really continued south as the modelled channel suggests was not checked. Other hand-mapped ends are at least 99.9 m from a drawn modelled line, and the farthest (`creek-22`, `creek-23`, `creek-21`) 1.5 to 1.9 km.
4. **Mission Creek mouth.** Lon -122.39, lat 37.77 is world (3514, -22), in the cell class "Bay (hand-drawn)", 5 m from the nearest bay-mask cell. No hand-mapped line lies within 200 m of it: the nearest is Chutchui Creek at 2,234 m (then `creek-1` at 2,784 m and `creek-4` at 2,892 m). The nearest modelled line is 1,086 m away (first build; the overlap rule can only make it farther). The hand-mapped layer does reach this project's shore at Mission Bay, further west: Chutchui Creek ends 13 m from the bay mask in Tidal marsh at (1288, 165), Arroyo Dolores 7 m from it at (784, 956) and `creek-1` 10 m at (894, 950). So the lower reach of Mission Creek between roughly x = 1,300 and the mouth point is not drawn by either set.
5. **Length removed by the bay trim.** Hand-mapped: 17,035 m raw, 16,394 m after trimming, so 641 m (3.8 percent) removed; simplification then took another 150 m, leaving 16,244 m. The trim is concentrated in Arroyo Dolores (2,406 to 2,001 m, 17 percent), `creek-22` (146 to 94 m) and `creek-23` (140 to 81 m); the other lines lose a few percent at most. Modelled (order 3 and up): 278,766 m raw, 147,539 m after trimming, so 131,228 m (47.1 percent) removed; chaining, simplification and dropping channels shorter than 30 m took another 337 m, leaving 147,202 m. These are the first-build figures. With the overlap rule, a further 15,085 m of trimmed modelled segments is removed before chaining and 132,099 m is drawn. **Nearly all of that trim is not bay**: 129,594 m (46.5 percent of the raw length) lies outside the city rectangle (the file runs south to lat 37.59, beyond the rectangle's south edge at lat 37.700), and only 763 m (0.3 percent) falls in the bay mask. The rest, 148,409 m (53.2 percent), is dry land inside the rectangle.
6. **The named lines: midpoint in world metres and the habitat class there** (midpoint by length along the drawn line).

   | Line | Confidence | Length | Midpoint (x, z) | Habitat class |
   |---|---|---|---|---|
   | Lobos Creek (`creek-2`) | documented | 1,005 m | (-4671, -1897) | Riparian woodland |
   | Arroyo Dolores (`creek-3`) | documented | 2,001 m | (-178, 999) | Unmapped |
   | Ojo de Agua de Figueroa (`creek-7`) | inferred | 575 m | (-1419, -3018) | Coastal prairie/scrub |
   | Old Arroyo Dolores (`creek-8`) | inferred | 1,245 m | (-32, -6) | Stabilized dune/dune scrub/grassland |
   | Chutchui Creek (`creek-9`) | inferred | 1,268 m | (751, 233) | Coastal prairie |
   | El Polin (`creek-16`) | inferred | 439 m | (-2319, -2769) | Coastal scrub |
   | Petlenuc Creek (`creek-17`) | documented | 172 m | (-2222, -3042) | Coastal prairie |
   | Petlenuc Creek (`creek-18`) | documented | 571 m | (-2095, -2859) | Coastal scrub |
   | Petlenuc Creek (`creek-19`) | documented | 473 m | (-2159, -3338) | Coastal prairie |
   | Coyote Gulch (`creek-25`) | inferred | 283 m | (-4443, -2973) | Stabilized dune/dune scrub/grassland |

   Arroyo Dolores's midpoint lies on "Unmapped" ground: that part of the city has no SFEI habitat polygon in the raster. Old Arroyo Dolores's midpoint is in the dune class even though it is a creek line: the habitat raster is a vegetation map, not a map of water.

## What was not checked

- **Where the lines sit in the viewer.** Everything above is computed in the world frame against the habitat raster. Nothing was loaded in a browser; whether the lines follow the terrain valleys, how they meet the shore and the ponds, and how they look at the opening zoom come with the viewer tasks.
- **The accuracy of SFEI's lines.** The hand-mapped lines were not compared with the 19th-century maps they cite; the modelled lines are SFEI's computation from a historical elevation model and were not checked against anything. One check was made: the Chutchui Creek and village cross-check in the design (an agreement of two readings of SFEI's own work, not an independent measurement).
- **The preview image** (a flat plan view over the habitat raster, made for this task and not committed) was looked at once; the lines were not compared with SFEI's own map.
- **Whether the modelled lines the overlap rule removed are the same creeks** as the hand-mapped ones. Only the distance between them was measured (13.4 km within 50 m, 15.1 km within 100 m, as above); a modelled channel 80 m from a hand-mapped line could be a different tributary. The 100 m figure is the owner's choice and was not tuned against any map.
- **The look of the result.** The overlap rule and the new gap at `creek-1` were not seen in a browser or on the preview image, and the preview image was not redrawn after the rule.
- **The viewer.** Nothing in the viewer reads `creeks.json` yet, so the changed counts are not reflected in any Legend, Sources or toggle behaviour; those come with the viewer tasks.
- **The licence.** SFEI's layers carry no stated licence for either file; the owner's request to SFEI is outstanding. The modelled layer's description has unfilled blanks.
- **One small difference from the design's numbers, and one resolved.** The design counts 8 named hand-mapped features; the file holds 10 named features (eight names). It was not checked whether SFEI changed the layer since the design was written or the design miscounted. The modelled count is not a difference: the file holds 5,184 features (2,803 of order 3, as the design says), one of which is a MultiLineString of two lines, which is why the build counts 5,185 line segments (2,804 of order 3). The design's modelled extent (lat 37.692 to 37.749) came from the item page and was wrong or stale; the downloaded file spans lat 37.590 to 37.805 and lon -122.514 to -122.380.

## Removing the layer

From `pipeline/`, run `uv run python scripts/build_creeks.py ../viewer/public/assets/real-city --remove`. It deletes `viewer/public/assets/real-city/creeks.json` and removes `creeks_file`, `creeks_mapped`, `creeks_modelled` and the two `hand_sources` rows (`creeks`, `modelled_streams`) from `meta.json`. The viewer's Legend rows, toggles and Sources rows appear only when the dataset has creeks, so they go too. Then delete the SFEI creeks row from `NOTICE.md`. A city rebuild also drops the meta entries, so rerun `build_creeks.py` after `build_overlay.py` and `build_shade.py` (the README says so).
