# Hand-drawn water polygons

`hand_bay.geojson` and `hand_marsh.geojson` hold water you trace yourself where the SFEI
layer has no data (mainly the south-east of the city). Both start as empty
FeatureCollections and are read by `regions/full-city.json`.

- Format: GeoJSON `Polygon` or `MultiPolygon` features in lon/lat (EPSG:4326). Draw them
  in geojson.io or QGIS, tracing the 1850s US Coast Survey sheets, and save over the file.
- `hand_bay` is open bay, `hand_marsh` is tidal marsh. Where both cover a cell, bay wins.
- Hand-drawn polygons count as mapped, so the modern-elevation gap fill never overrides
  them. They show up in the output as the `hand_water` layer, tagged `inferred`.
- Only trace from sources you may use. Never copy data from a source whose terms forbid it.
- More files can be listed under `hand_bay` / `hand_marsh` in the region file.
