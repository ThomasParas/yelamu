# Yelamu

An interactive 3D map of the San Francisco peninsula as it was around 1769, the
homeland of the Ramaytush.

- Design: `docs/superpowers/specs/`
- Plans: `docs/superpowers/plans/`
- `pipeline/`: offline Python data pipeline (terrain reconstruction)
- `viewer/`: Vite + Three.js viewer

## Rebuilding the data

The built map data in `viewer/public/assets/real-city/` is committed. To regenerate it you need
the raw inputs in `pipeline/data/raw/` (not in git, they are large): `dem.tif` (USGS 3DEP),
`sf_habitats.geojson`, `bay.geojson` and `marsh.geojson` (SFEI Hidden Nature SF),
`noaa/extracted/<project>/` (NOAA Shoreline Data Rescue Project vectors) and `tiger/` (Census
TIGER/Line). The creek layers come from two public SFEI ArcGIS services: from `pipeline/`, run
`uv run python scripts/fetch_creeks.py both`; the files land in the git-ignored
`pipeline/data/raw/sfei-creeks/`. `docs/research/slice-results.md` and `docs/research/2026-data-sources.md` say where
each came from. Then, from `pipeline/`:

```
uv run python -m yelamu.cli --region regions/full-city.json
uv run python scripts/build_overlay.py --region regions/full-city.json
uv run python scripts/build_context.py --region regions/full-city.json
uv run python scripts/build_shade.py ../viewer/public/assets/real-city
uv run python scripts/build_creeks.py ../viewer/public/assets/real-city
uv run python scripts/build_llms_full.py ../viewer/public/assets/real-city ../viewer/public/llms-full.txt
uv run python scripts/verify_overlay_data.py ../viewer/public/assets/real-city
```

`build_llms_full.py` writes `viewer/public/llms-full.txt`, the plain-text description for language models, from `meta.json` and `overlay.json`; rerun it after any change to places or meta (a test fails when the committed file is stale). The counts in the hidden description in `viewer/index.html` ("47 modern landmarks", "about 18 landscape features") are checked by the same test file and need a hand edit when places are added.

Run the overlay, context and shade steps after the terrain step (the terrain build rewrites `meta.json`, which drops the overlay's `overlay_villages` count and village `hand_sources` row, so `build_overlay.py` has to be rerun after any city rebuild; it restores them from `pipeline/data/overlay/villages.json`). The terrain build also drops the creek entries (`creeks_file`, `creeks_mapped`, `creeks_modelled` and the two creek `hand_sources` rows), so after a city rebuild rerun `build_creeks.py` too, in this order: `build_overlay.py`, then `build_shade.py`, then `build_creeks.py`, because each of them rewrites `meta.json`. The shade step bakes the ground shading (hill shadows and ambient occlusion) from the built heightmap; it must use the viewer's vertical exaggeration and sun direction (`viewer/src/terrainShade.ts`), and the viewer ignores a bake that does not match. The context step builds the grey surround: modern terrain (USGS 3DEP) around the 1769 map, for orientation only (see `docs/superpowers/specs/2026-11-17-surrounding-terrain-design.md`). The hand
data files in `pipeline/data/full-city/hand/` are described in the README beside them; three of
them are generated (`scripts/import_noaa.py`, `scripts/trace_flat_lakes.py`,
`scripts/trace_treasure_island.py`). Terms for every source are in `NOTICE.md`.

## Licence

The pipeline, the viewer and the data this project publishes (the reconstructed terrain, habitat
raster and pond files) are licensed under the **GNU General Public License, version 3 or (at your
option) any later version** (`LICENSE`). The reconstruction is built from SFEI's Hidden Nature SF
data, which is itself GPL-3.0-or-later; the other sources and their terms are listed in `NOTICE.md`.
This map is not a survey and is not for navigation, engineering or legal use.
