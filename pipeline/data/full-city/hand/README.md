# Hand-drawn water and ponds

`hand_bay.geojson` (open bay), `hand_marsh.geojson` (tidal marsh) and `hand_ponds.geojson`
(freshwater ponds) hold water you trace yourself where the SFEI layer has no data (mainly the
south-east of the city and Lake Merced). All three start as empty FeatureCollections and are
read by `regions/full-city.json`. The full workflow, area by area, is in
`docs/research/tracing-guide.md`.

- Format: GeoJSON `Polygon` or `MultiPolygon` features in lon/lat (EPSG:4326). Draw them in
  geojson.io or QGIS and save over the file.
- **Every feature needs `properties.source` and `properties.confidence`.** The build refuses
  a feature without them. `source` is non-blank text of at most 200 characters naming the sheet
  or text and how you read it; `confidence` is `documented`, `inferred` or `illustrative`
  (a feature traced from a historical map is `inferred` at best).
- `hand_bay` is open bay, `hand_marsh` is tidal marsh. Where both cover a cell, bay wins.
- `hand_ponds` features may also carry `level_m` (the water surface height in metres; the
  default is the median modern ground height inside the polygon), `name` and `id`.
- Hand-drawn polygons count as mapped, so the modern-elevation gap fill never overrides them.
  They appear in the output as the `hand_water` layer (and `ponds`), and in the viewer's
  Sources panel under "Hand-drawn and sculpted".
- Only trace from sources you may use. Never copy data from a source whose terms forbid it.
- Check a file before building: `uv run python scripts/check_polygons.py FILE --region regions/full-city.json`.

## NOAA 1850s shoreline (generated files)

`hand_bay_noaa.geojson` and `hand_marsh_noaa.geojson` are **generated**: do not edit them by
hand. `regions/full-city.json` lists each after your own hand file; the build unions all the
files of a list, so overlaps between them are fine. Both may be empty
(`{"type": "FeatureCollection", "features": []}`), which adds nothing.

They come from the NOAA Shoreline Data Rescue Project vectors of the 1850s Coast Survey
sheets (`data/raw/noaa/extracted/<project>/historicl1` and `projbnd`).
`scripts/import_noaa.py` closes each project's lines into numbered candidate areas, and
your seeds in `noaa_seeds.json` say which areas are bay, marsh or land. Land is not written,
and unseeded areas are left unchanged. Every written feature has `confidence: inferred` (or
lower, if a seed says so), a `source` naming the project, sheet, year and seed, and
`area_id`, `area_m2` and `seed`.

Regenerate (from `pipeline/`):

    uv run python scripts/import_noaa.py --projects CA37A02 CA37B02B CA37B07 CA37B08 \
        --seeds data/full-city/hand/noaa_seeds.json

To list the candidate areas only (no seeds; nothing is written), leave out `--seeds`. To
see them, add `--preview preview.png` (needs Pillow: run with `uv run --with pillow python`).
`--bbox W S E N` crops the preview, and `--preview-assets ../viewer/public/assets/real-city`
draws the current build underneath. The report prints, for every area, its id, hectares, an
inside point to copy into a seed, its sheet and its year. Ids are stable for the same lines and
settings, but change when closures or settings change: seeds are points, not ids, so they
keep working.

`noaa_seeds.json` is an object:

- `seeds`: a list of `{id, project, lon, lat, class, source, confidence, note?}`.
  - `id` is lower-case letters, digits and `-`, unique in the file.
  - `project` is the NOAA project whose area the seed classes (seeds never class another
    project's areas).
  - `class` is `bay`, `marsh` or `land`.
  - `source` (at most 200 characters) is why you read it so.
  - `confidence` is one of the levels above.
  - `note` is for doubts.

  A seed must lie inside one area. Two seeds of different classes in one area are an error.
- `closures` (optional): a list of `{id, project, coordinates: [[lon, lat], ...], source,
  note?}`. These are straight lines you draw where the NOAA lines do not separate two places,
  e.g. across the Golden Gate (to keep the ocean shore out) or a ring around Yerba Buena and
  Treasure Islands (not in the vectors). They split that project's areas and are never
  written themselves.
- `note` (optional): free text.

Any seed or input error exits with status 1 and writes nothing.

## Lake Merced (generated file entries)

`hand_ponds.geojson` currently holds the three Lake Merced lakes, **generated** by
`scripts/trace_flat_lakes.py` from the flat lake surface of the modern DEM (level 5.6 m,
`confidence: inferred`; the outline is the modern one). Re-run:

    uv run python scripts/trace_flat_lakes.py --region regions/full-city.json \
        --out data/full-city/hand/hand_ponds.geojson

Replace the file by hand if you trace a historical outline.
