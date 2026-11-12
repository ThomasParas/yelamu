"""Draw Treasure Island's 1936-37 fill as open bay (it was a shoal in 1769).

    uv run python scripts/trace_treasure_island.py --region regions/full-city.json \\
        --out data/full-city/hand/hand_bay.geojson

Treasure Island is man-made (US Navy BRAC PMO: built 1936 to 1937 of sediment dredged from the
bay, on the shoals of Yerba Buena Island). Its extent is the land of the modern USGS DEM north
of the neck that joins it to Yerba Buena Island. Yerba Buena Island itself is natural and is
left alone. The feature REPLACES any earlier `treasure-island-fill` feature in --out and keeps
the file's other features. No 1850s sheet covers the shoal (see docs/research/phase-3b2-results.md).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import shapely
from pyproj import Transformer
from rasterio import features
from rasterio.transform import from_origin
from scipy import ndimage
from shapely.geometry import shape

from yelamu.cli import load_dem
from yelamu.geo import Grid
from yelamu.region import load_region

PIPELINE = Path(__file__).resolve().parent.parent
FEATURE_ID = "treasure-island-fill"
BOX = (-122.385, 37.8153, -122.350, 37.835)  # lon/lat: south edge is the neck to Yerba Buena Island
MIN_LAND_M = 1.0
SOURCE = ("US Navy BRAC PMO: Treasure Island is 1936-37 fill on the Yerba Buena shoals; extent is the "
          "modern 3DEP DEM land north of lat 37.8153; drawn as bay, shoal depth not mapped")


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
    e0, n0 = to_utm.transform(BOX[0], BOX[1])
    e1, n1 = to_utm.transform(BOX[2], BOX[3])
    box = np.zeros(dem.shape, dtype=bool)
    box[int((grid.north - n1) / grid.cell):int((grid.north - n0) / grid.cell),
        int((e0 - grid.west) / grid.cell):int((e1 - grid.west) / grid.cell)] = True
    land = box & (dem > MIN_LAND_M)
    land = ndimage.binary_closing(land, iterations=1) & box  # fill pin-holes (buildings, ramps)
    labels, count = ndimage.label(land)
    if count == 0:
        raise SystemExit("no land found in the Treasure Island box")
    sizes = ndimage.sum(land, labels, range(1, count + 1))
    mask = labels == (int(np.argmax(sizes)) + 1)
    ha = mask.sum() * grid.cell ** 2 / 1e4
    transform = from_origin(grid.west, grid.north, grid.cell, grid.cell)
    shapes = [shape(g) for g, v in features.shapes(mask.astype("uint8"), mask=mask,
                                                   transform=transform) if v == 1]
    geom = max(shapes, key=lambda g: g.area)
    geom = shapely.transform(geom, lambda c: np.column_stack(to_ll.transform(c[:, 0], c[:, 1])))
    geom = geom.simplify(0.00004, preserve_topology=True)
    ring = [[round(x, 6), round(y, 6)] for x, y in geom.exterior.coords]
    feature = {"type": "Feature", "properties": {
        "id": FEATURE_ID, "name": "Treasure Island (1936-37 fill, drawn as shoal)",
        "source": SOURCE, "confidence": "inferred"},
        "geometry": {"type": "Polygon", "coordinates": [ring]}}

    existing = json.loads(args.out.read_text()) if args.out.exists() else {
        "type": "FeatureCollection", "features": []}
    kept = [f for f in existing["features"] if f.get("properties", {}).get("id") != FEATURE_ID]
    existing["features"] = kept + [feature]
    args.out.write_text(json.dumps(existing, indent=1) + "\n")
    print(f"Treasure Island fill: {ha:.1f} ha, {len(ring)} vertices -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
