# Tracing guide (Phase 3b)

How to add hand-drawn water, ponds and lost landforms to the Yelamu map, with the comparison tool. Written for the owner. Every step has a check so you know when to stop.

## The rules

1. **Everything hand-drawn carries `source` and `confidence`.** The build refuses a polygon or landform without them. Write the source so a stranger could find it again: sheet name, year, the archive, and how you read the feature ("shoreline = edge of the marsh hatching").
2. **Confidence words.** `documented`: a source states the feature (a text, or a vector dataset). `inferred`: you read it off a historical map or reasoned from several sources. `illustrative`: drawn to give an impression. Anything you trace from an 1850s sheet is `inferred` at best.
3. **Licences.** Trace only from sources you may use. NOAA's original survey sheets (the US Coast Survey "T-sheets") are US federal works; confirm the rights statement on the page you download from, and record it in `source`. Scans on David Rumsey or Stanford are CC BY-NC-SA: look at them, do not trace from them. SFEI's own georeferenced sheets: reference only. If unsure, do not trace from it.
4. **Order of work: by visible impact.** Do the areas below in order and stop when the map is good enough for you. Each area is independent.

## The loop

```bash
cd pipeline
# 1. Georeference a scan (control points = places you can find on both the sheet and a modern map)
uv run python scripts/georeference.py SCAN.tif points.csv --bbox W S E N --cell 5 --order 2 --out sheet.tif --report sheet-report.txt
# 2. Look at the reconstruction against the sheet
uv run --with pillow python scripts/render_compare.py ../viewer/public/assets/real-city --bbox W S E N --sheet sheet.tif --out compare.png
# 3. Trace in geojson.io or QGIS over the sheet; save into data/full-city/hand/*.geojson
# 4. Check the file before building
uv run python scripts/check_polygons.py data/full-city/hand/hand_bay.geojson --region regions/full-city.json
# 5. Rebuild, rebuild the overlay, compare again, then look in the viewer
uv run python -m yelamu.cli --region regions/full-city.json
uv run python scripts/build_overlay.py --region regions/full-city.json
```

`points.csv` has the header `col,row,lon,lat,name`: pixel position in the scan (origin top-left corner), the real-world position, and a note. Use 6 to 10 points spread over the whole sheet, preferring features that have not moved (hilltops, headlands, old stone landmarks, creek mouths that still exist) and avoiding the shoreline you are about to trace. The tool prints each point's error in metres and **refuses** a fit with an RMS above 25 m or too few points. If it refuses, look for the point with the biggest error; it is usually a typo or a feature that moved.

Before tracing, always look at the panel that shows the sheet blended with the current reconstruction: on **stable ground** (headlands, hills) the sheet's coastline and the modern DEM must agree to within a few cells. If they do not, fix the control points first. Tracing over a bad fit bakes the error in.

## Area 1: south-east shoreline and marshes

*Mission Bay, Islais Creek, India Basin, Hunters Point, Candlestick, Visitacion Valley.* Largest area where the map shows modern ground.

- Draw open water in `hand_bay.geojson` and tidal marsh in `hand_marsh.geojson`. Where both cover a cell, bay wins.
- One feature per coherent shape; put the sheet in `properties.source` (for example `"US Coast Survey T-sheet T-xxxx (1850s), NOAA Historical Map & Chart Collection; shoreline read at mean high water"`) and `"confidence": "inferred"`.
- Check: `check_polygons.py` reports no invalid geometry, no features outside the region, and the overlaps you expect. After a rebuild the compare image shows the dark red shoreline following the sheet's coast on both sides of the water, and the viewer's Sources panel lists the hand-drawn water.

## Area 2: Treasure Island and the Yerba Buena shoals

The island is 1930s fill. In 1769 there was a shoal north of Yerba Buena Island. Trace the shoal edge as bay only if your sheet shows deep water on both sides; leave the shallows as bay (the map has no tidal-flat class). Same files, same rules.

- Check: the island is gone in the compare image, Yerba Buena Island is still land, and nothing else moved.

## Area 3: ponds

*Lake Merced (north and south lakes), others the SFEI layer misses.* SFEI's layer ends at latitude 37.7328, so **Lake Merced is not in it**. Trace each lake into `hand_ponds.geojson` with `"level_m"` (the surface height in metres) and `"name"`. For Lake Merced the modern DEM gives about 5.6 m, which is a reasonable value: say so in `source`.

- Source example: `"Lake Merced extent from <sheet>, level from USGS 3DEP DEM (modern surface)"`; confidence `inferred`.
- SFEI pond classes already give 17 ponds. The two **Tidal coastal lagoon** polygons (near -122.404, 37.796 and -122.413, 37.804) are not included on purpose: decide with the compare image whether they are a lagoon behind a bar or an open tidal channel, then either add `"Tidal coastal lagoon"` to `pond_classes` in `regions/full-city.json` or trace them as marsh.
- Check: `ponds.json` lists the pond, the viewer shows a flat water surface at its level with no wall on the uphill side, and the compare image's blue area follows the sheet.

## Area 4: lost landforms

*Rincon Hill and the Market Street dune ridge are the two named in the design; add others only with a cited source.* Edit `data/full-city/landforms.json` (an array). Each entry needs `source` and `confidence`.

- A bump: `{"kind": "bump", "name": "...", "lon": ..., "lat": ..., "radius_m": ..., "delta_m": ..., "source": "...", "confidence": "inferred"}`.
- A ridge: `{"kind": "ridge", "name": "...", "points": [[lon, lat], ...], "half_width_m": ..., "delta_m": ..., "source": "...", "confidence": "inferred"}`. `delta_m` is the height added along the crest line and falls to zero at `half_width_m` (cosine falloff). Heights add to what the DEM already shows, so measure against the modern ground.
- Cite the height. An entry without a number from a source is `illustrative` and should stay out unless you want it as an impression.
- Check: the build prints the landforms layer; the compare image's hillshade shows the ridge where the sheet shows it; the viewer's Sources panel lists it as "Sculpted landforms".

## When you are done

Run the whole test-suite, rebuild everything, look at the real city in the viewer at the places you changed, and add one line per area to `docs/research/phase-3b-results.md` saying what source you used and what is still a guess.
