# Vertical slice results: Yerba Buena Cove / Mission Bay (2026-11-11)

Test box (lon/lat): west -122.42, south 37.755, east -122.37, north 37.805. Grid 444 x 558 cells at 10 m, UTM 10N.

> **Licensing gate.** The output is derived from SFEI's "San Francisco Historical Habitats" layer, which has **no stated license** (see `2026-data-sources.md`). The generated assets and the two images below are therefore **gitignored** (`viewer/public/assets/real/`, `docs/research/local/`). Do not publish or push them until SFEI confirms terms in writing.

## How to reproduce

```bash
cd pipeline
source ../docs/research/slice.env
curl -L -o data/raw/dem.tif "$DEM_URL"                      # 222,936,410 bytes, EPSG:4269
curl -L -o data/raw/sf_habitats.geojson "$SFEI_URL"          # 450 features
uv run python -m yelamu.habitats data/raw/sf_habitats.geojson --field HabitatCla \
  --bay "Deep ocean/bay" "Shallow ocean/bay" "Tidal flat" \
  --marsh "Tidal marsh" "Tidal slough" --out data/raw        # bay: 15, marsh: 14 polygons
uv run python -m yelamu.cli --dem data/raw/dem.tif --bbox -122.42 37.755 -122.37 37.805 --cell 10 \
  --bay data/raw/bay.geojson --marsh data/raw/marsh.geojson \
  --coverage data/raw/sf_habitats.geojson \
  --landforms data/slice/landforms.json --checks data/slice/checks.json \
  --out ../viewer/public/assets/real
cd ../viewer && npx vite     # then open http://localhost:5173/?data=real
```

(If `vite` crashes with `fsevents.watch is not a function`, see Addendum A6 of the plan.)

## Sanity checks (`pipeline/data/slice/checks.json`): all 3 pass

| Place | Result | Expectation |
|---|---|---|
| Coit Tower (Telegraph Hill summit) | 90.8 m | at least 60 m |
| Chase Center (former Mission Bay tidal flat) | -3.0 m (bay) | at most 1.0 m |
| Ferry Building (Yerba Buena Cove) | -3.0 m (bay) | at most 1.0 m |

## What the slice contains

- Bay 50.2% of cells (of which 27.6% is the **gap fill**, below), tidal marsh 5.2%, dry land 44.6%.
- Layers in `meta.json`: `terrain` (inferred), `water` (documented), `open_water_gap_fill` (inferred). No `landforms` layer, because none were added.

## What it got right (compared with the historical picture)

- Yerba Buena Cove is open water, curving in toward the base of Telegraph Hill and the Financial District.
- A headland (Rincon Point) projects into the bay south of the cove.
- Mission Bay is a large open basin with a tidal-marsh fringe along its western and southern edges, and a creek/slough inland (the Mission Creek area).
- Potrero Point projects into the bay at the south-east.
- Telegraph Hill, Nob/Russian Hill and Potrero Hill stand clear of the water.

## What it got wrong or left out

1. **Unmapped strip handled by a rule, not data.** SFEI's layer maps only the northern part of the city, and has no polygons east of about lon -122.377 (open bay). Without a fix the whole eastern strip rendered as flat land. `--coverage` now treats a cell as open bay where **no** SFEI polygon exists **and** the modern DEM is at or below 0.5 m (open water on today's DEM reads 0 to -1 m). Tagged `inferred`.
2. **The south is unmapped.** About a third of the cells SFEI does not map are real land (Potrero Hill, Dogpatch); they correctly stay land. But the historical marsh and creek mouth there (Islais Creek and the south end of Mission Bay) are missing until that area is mapped, which the Mapping Yelamu's Historical Landscape project says it will do.
3. **The modern city is baked into the terrain.** The lidar "bare earth" DEM still contains graded streets and building pads. At zoom, the street grid shows as a lattice on the hillsides. A low-pass filter on land cells would reduce this; not yet tried.
4. **Hard coast edges.** Land is clamped to at least 1.0 m next to a -3.0 m bay floor, so a 4 m step (12 m on screen at 3x exaggeration) shows as a wall along the shoreline. A sloped shelf near the coast would look right.
5. **Lost landforms are missing.** Rincon Hill, the east face of Telegraph Hill and the Market Street dune ridge were graded away, and `landforms.json` is empty. I did **not** invent numbers: they need the 1850s Coast Survey sheets (CC BY-NC-SA scan, view-only reference; not downloaded).
6. **Approximate shoreline near Montgomery Street.** The Transamerica Pyramid site (about 600 Montgomery St) reads as bay. That is near the 1847 shoreline, so it may or may not be right at 10 m resolution; check against the T-sheet.
7. **'Tidal coastal lagoon'** (2 polygons in the box) is in neither water list, so it stays dry land. Undecided; needs a look at the T-sheets.
8. **Vertical datum.** DEM heights are NAVD88 while the water plane is a flat 0.6 m; no tidal datum offset was modelled.
9. **Water plane.** The bay floor of the data square is visibly darker than the surrounding plane in the viewer.
10. **Single-cell speck** of land in the middle of the bay (a one-cell artifact).

## Decision: **Go to Phase 2, with these first**

The slice proves the approach: a de-developed 1769 shoreline can be built from modern lidar plus SFEI's mapped water, with a transparent fallback where SFEI has no map, and it renders recognisably in the isometric viewer. Before or during Phase 2:

1. **SFEI license** (blocking for any public release).
2. Smooth urban artifacts out of the DEM and add a sloped coastal shelf.
3. Hand-sculpt lost landforms from the 1850s sheets, with sources recorded.
4. Decide the 'Tidal coastal lagoon' polygons.
5. Plan how to cover the unmapped south (wait for the Yelamu mapping project, or reconstruct from the T-sheets).

## Local images (gitignored)

- `docs/research/local/slice-classes.png`: classification map (blue bay, green marsh, brown land shaded by height).
- `docs/research/local/slice-3d-zoomed.jpg`: the viewer, zoomed.
