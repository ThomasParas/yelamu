"""Trace lakes that the SFEI layer lacks from the flat lake surface in the modern DEM.

    uv run python scripts/trace_flat_lakes.py --region regions/full-city.json \\
        --out data/full-city/hand/hand_ponds.geojson

Lake Merced (the north, east and south lakes) is not in SFEI. Lidar DEMs show a lake as an
exactly flat plateau, so this finds the connected cells within a band around the lake level
inside a search box, and writes one pond feature per lake. The outline is the MODERN lake
(the 1769 outline is not known to this project), so every feature is `inferred`.
The source text says so. Nothing is downloaded: the DEM is `dem` of the region file.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from rasterio import features
from rasterio.transform import from_origin
from scipy import ndimage
from shapely.geometry import shape
import shapely
from pyproj import Transformer

from yelamu.cli import load_dem
from yelamu.geo import Grid
from yelamu.region import load_region

PIPELINE = Path(__file__).resolve().parent.parent
LEVEL_M = 5.6
BAND_M = 0.1
SEARCH_BOX = (-122.512, 37.700, -122.470, 37.740)  # lon/lat around Lake Merced
MIN_HA = 9.0  # smaller flat patches (the 6 ha impoundment) are not traced
# Centre of each lake as found in the DEM (lon, lat) -> (id, name)
LAKES = [
    ((-122.4976, 37.7275), ("lake-merced-north", "Lake Merced (north lake)")),
    ((-122.4893, 37.7275), ("lake-merced-east", "Lake Merced (east lake)")),
    ((-122.4940, 37.7190), ("lake-merced-south", "Lake Merced (south lake)")),
]
SOURCE = ("Extent: flat 5.55 to 5.70 m lake surface of the USGS 3DEP DEM (modern lake; 1769 outline "
          "not known); level 5.6 m from the same DEM")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--region", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    region = load_region(args.region if args.region.is_absolute() else PIPELINE / args.region)
    grid = Grid.from_lonlat_bbox(*region.bbox, cell=region.cell_m)
    dem = load_dem(region.dem, grid, nodata=None)

    to_utm = Transformer.from_crs(4326, 32610, always_xy=True)
    to_ll = Transformer.from_crs(32610, 4326, always_xy=True)
    e0, n0 = to_utm.transform(SEARCH_BOX[0], SEARCH_BOX[1])
    e1, n1 = to_utm.transform(SEARCH_BOX[2], SEARCH_BOX[3])
    box = np.zeros(dem.shape, dtype=bool)
    box[int((grid.north - n1) / grid.cell):int((grid.north - n0) / grid.cell),
        int((e0 - grid.west) / grid.cell):int((e1 - grid.west) / grid.cell)] = True
    flat = box & (np.abs(dem - LEVEL_M) <= BAND_M)
    labels, count = ndimage.label(flat)
    transform = from_origin(grid.west, grid.north, grid.cell, grid.cell)

    out = []
    for (lon, lat), (lake_id, name) in LAKES:
        e, n = to_utm.transform(lon, lat)
        label = labels[int((grid.north - n) / grid.cell), int((e - grid.west) / grid.cell)]
        if label == 0:
            raise SystemExit(f"{name}: no flat lake surface at {lon}, {lat}")
        mask = labels == label
        ha = mask.sum() * grid.cell ** 2 / 1e4
        if ha < MIN_HA:
            raise SystemExit(f"{name}: only {ha:.1f} ha of flat surface")
        shapes = [shape(g) for g, v in features.shapes(mask.astype("uint8"), mask=mask,
                                                       transform=transform) if v == 1]
        geom = max(shapes, key=lambda g: g.area)
        geom = shapely.transform(geom, lambda c: np.column_stack(to_ll.transform(c[:, 0], c[:, 1])))
        geom = geom.simplify(0.00004, preserve_topology=True)
        coords = [[round(x, 6), round(y, 6)] for x, y in geom.exterior.coords]
        out.append({"type": "Feature", "properties": {
            "id": lake_id, "name": name, "level_m": LEVEL_M, "source": SOURCE,
            "confidence": "inferred"},
            "geometry": {"type": "Polygon", "coordinates": [coords]}})
        print(f"{name}: {ha:.1f} ha, {len(coords)} vertices")
    args.out.write_text(json.dumps({"type": "FeatureCollection", "features": out}, indent=1) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
