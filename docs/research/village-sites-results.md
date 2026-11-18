# Village sites results

Design: `docs/superpowers/specs/2026-11-18-village-sites-design.md`. Plan: `docs/superpowers/plans/2026-11-18-village-sites.md`. Each section says what was **not** checked. Browser and benchmark results are added to this file by the later tasks of the plan.

## What was drawn, and from what (2026-11-18)

The map marks the **general locations of the five primary Yelamu villages** that SFEI's Hidden Nature SF names in its story map "Yelamu: the Native Peoples of San Francisco" (January 2026): Sitlintac and Chutchui along Mission Creek, Amuctac and Tubsinte around Visitacion Valley, and Petlenuc in the Presidio near Crissy Field. SFEI's own text, after Milliken (1983, 1995) and the National Park Service (2009), says these are the primary villages and that others existed, so the map never says "all".

Each village is a soft circle of radius 530 m (about the size SFEI draws) and a text label. There are no icons, figures, trails, burial or sacred sites, population numbers, or villages outside San Francisco. Confidence is **Inferred**: SFEI publishes a picture, not point data, so the positions are read off that picture, not copied from coordinates.

Source of truth: `pipeline/data/overlay/villages.json`. `build_overlay.py` projects it into the new `villages` array of `viewer/public/assets/real-city/overlay.json` and records `overlay_villages` (the count) and one `hand_sources` row (layer `villages`) in `meta.json`, so the Sources panel lists the layer.

## How the positions were found

SFEI publishes no point data for the villages. The owner's screenshot of SFEI's village map was aligned to this project's own 1769 land mask:

- The screenshot is north-up. Scale: 10.95 m per pixel.
- Alignment: 96 percent overlap with the mask on the Pacific and Golden Gate coast.
- The five disc centres were read off the aligned picture and rounded to 4 decimal places (about 10 m).
- Radius: about 527 m measured on the picture, set to 530 m in the data.
- Real accuracy: about 150 m, well inside a circle of 1 km across.

| Village | lon | lat | Place phrase |
|---|---|---|---|
| Sitlintac | -122.4152 | 37.7714 | along Mission Creek |
| Chutchui | -122.4235 | 37.7619 | along Mission Creek |
| Amuctac | -122.4016 | 37.7238 | around Visitacion Valley |
| Tubsinte | -122.4148 | 37.7109 | around Visitacion Valley |
| Petlenuc | -122.4552 | 37.7978 | in the Presidio near Crissy Field |

Sanity distances: Chutchui lies about 410 m from Mission Dolores; Sitlintac to Chutchui is about 1280 m. The overlay builder projects the two to (1293.7, -163.5) and (569.2, 895.1) in the viewer frame, 1283 m apart.

SFEI's point data was requested from SFEI by the owner; none is published.

## What the data checks do

`pipeline/tests/test_overlay.py` covers: the validation rules (description 20 to 400 characters, at least one http(s) source, confidence one of the three tags, `radius_m` between 100 and 2000, position inside the region), ids unique across landmarks, hotspots and villages, the projection to viewer x,z, a missing villages file giving an empty list, the meta patch being idempotent and leaving every other meta key and every other layer's `hand_sources` row alone, and the shipped `villages.json` and `overlay.json` (exactly the five ids, the approved card text, radius 530, all inside the city rectangle).

Rebuilding the overlay changed `overlay.json` only by the new `villages` array (streets, landmarks, hotspots and processing are identical to the previous build) and `meta.json` only by `overlay_villages` and one new `hand_sources` row (the seven earlier rows are untouched).

## Viewer and browser results (2026-11-18)

Checked in a real browser (Playwright, desktop 1400 x 900 and phone width 390 x 844) against the production build.

- **Circles in the right places.** The five disc centres, projected through the viewer's own camera, land exactly on the drawn circles. On the map Chutchui sits just south-west of City Hall beside the Mission Dolores area, Sitlintac north-east of it near the Mission Bay and Mission Creek marsh hotspot, Amuctac and Tubsinte around Visitacion Valley with Amuctac to the north-east, and Petlenuc in the Presidio. This agrees with SFEI's picture (Amuctac north-east of Tubsinte, the two Mission Creek villages overlapping). It is a visual agreement, not a measurement: the circles were read from that picture to begin with.
- **A bug found in the browser, fixed.** The first build put the village name labels in the wrong places: `.village-label { position: relative }` beat the `.labels > *` absolute rule, so the label buttons flowed in a row and each was shifted by the widths of the labels before it. The unit tests could not see it (no DOM tests). The circles were right; only the labels were wrong. Fixed in `9556a44`, with a test that the village label leaves its positioning to `.labels > *` (it fails if the rule comes back). An independent reviewer found the same defect at the same time.
- **Petlenuc's name was hidden at the opening view, fixed.** Village labels first ranked equal to hotspots, and a tie goes to the id that sorts first, so every hotspot beat every village; the Mountain Lake and Lobos Creek markers hid the Petlenuc label. Villages now rank one step above hotspots (`VILLAGE_PRIORITY`), with a test. All five names show at the opening view. The cost: the Lobos Creek hotspot marker is hidden at that zoom (it appears when the visitor zooms in).
- **Text on screen.** The Legend row, the About sentence and the Sources row ("Village sites", Inferred, "5 villages") match the owner-approved wording exactly. The village card opens from a label click, a search result and a `p=village-...` link, with kind "Village site", the card text, the Inferred badge and both sources; it works as a bottom sheet at phone width. Esc closes it.
- **Toggle.** "Village sites" is on by default and separate from Landmarks and Hotspots.
- **Benchmark A to E** (production build, desktop Mac, Chrome 157 in Playwright): all PASS at 60 fps, p95 frame gap 18.5 to 18.6 ms, quality 2 to 2. Opening view A: 822,293 triangles, 251 draw calls. Scenario E (whole surround): 1,278,941 triangles, 283 calls. The village discs add about 10,000 triangles in total. Not run on a phone.
- **Tests:** viewer 710 passed (2 skipped), pipeline 728 passed (5 skipped), `tsc` clean, `vite build` clean.

**Not checked:** an automated accessibility scan (axe) was not re-run for this change, because loading it into the page was blocked in this session; the accessibility tree shows the labels as buttons named "Village site: <name>", the panel headings are unchanged, and a reviewer read the markup. A phone run of `?bench`. Reduced motion (the discs are static). The ring-width and outline contrast against the fill, which is slightly different from the bare-ground figures in `uiColors.test.ts` (still above 1.5 to 1). A shared link made before this layer existed that carries an explicit `l=` list will not show villages until the visitor turns them on. The Places panel note still reads "Every hotspot and landmark on the map." (wording awaiting the owner).

## Removing the layer

Delete `pipeline/data/overlay/villages.json` and rerun `uv run python scripts/build_overlay.py --region regions/full-city.json` from `pipeline/`. The `villages` array becomes empty and `overlay_villages` and the `villages` `hand_sources` row are removed from `meta.json`; the viewer's Legend row, About sentence and Sources row appear only when the dataset has villages, so they go too. A city rebuild also drops both meta entries, so rerun `build_overlay.py` after one (the README says so for the overlay already; it now restores the villages too).
