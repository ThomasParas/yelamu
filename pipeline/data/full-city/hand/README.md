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
