"""Command line entry point: build the heightmap assets for one bounding box."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

from yelamu.checks import load_expectations, run_checks
from yelamu.export import Layer, write_assets
from yelamu.geo import Grid, lonlat_to_utm
from yelamu.sources import load_dem, load_polygons
from yelamu.terrain import (
    apply_bay_shelf,
    apply_historical_water,
    fill_missing_land,
    smooth_land,
    stamp_landform,
)
from yelamu.water import remove_thin_unmapped_land, unmapped_open_water, water_mask


def build(
    dem_path: Path,
    bbox: tuple[float, float, float, float],
    cell: float,
    out_dir: Path,
    bay_path: Path | None = None,
    marsh_path: Path | None = None,
    landforms_path: Path | None = None,
    checks_path: Path | None = None,
    dem_nodata: float | None = None,
    coverage_path: Path | None = None,
    open_water_max_m: float = 0.5,
    smooth_m: float = 30.0,
    shelf_m: float = 150.0,
    shore_open_cells: int = 2,
) -> list[str]:
    """Run the pipeline. Returns the list of failed sanity checks (empty is good)."""
    grid = Grid.from_lonlat_bbox(*bbox, cell=cell)
    dem = load_dem(dem_path, grid, nodata=dem_nodata)

    bay = water_mask(load_polygons(bay_path) if bay_path else [], grid)
    marsh = water_mask(load_polygons(marsh_path) if marsh_path else [], grid)

    # Where SFEI maps no habitat at all, the modern DEM stands in for open bay. Decide
    # this from the raw DEM, before smoothing or landform stamping change any elevation.
    gap = None
    if coverage_path:
        coverage = water_mask(load_polygons(coverage_path), grid)
        gap = unmapped_open_water(dem, coverage, open_water_max_m)
        bay = bay | gap
        print(
            f"Gap-filled {int(gap.sum())} cells ({gap.mean():.1%}) as open bay "
            "where SFEI has no polygon"
        )
        # Modern piers and one-cell specks in that DEM-derived shoreline are not 1769.
        if shore_open_cells > 0:
            removed = remove_thin_unmapped_land(~(bay | marsh), ~coverage, shore_open_cells)
            bay = bay | removed
            print(f"Removed {int(removed.sum())} cells of thin unmapped land "
                  f"(piers/specks narrower than {2 * shore_open_cells + 1} cells)")

    # Blur away the modern street grid and building pads, using land cells only.
    if smooth_m > 0:
        dem = smooth_land(dem, smooth_m / cell, valid=~(bay | marsh) & ~np.isnan(dem))

    # Landforms after smoothing, so stamps stay exact. The water edit and the clamp come
    # after the stamps so one near the shore can't raise the bay floor or dig dry land.
    landforms = json.loads(Path(landforms_path).read_text()) if landforms_path else []
    for lf in landforms:
        x, y = lonlat_to_utm(lf["lon"], lf["lat"])
        dem = stamp_landform(dem, grid, x, y, lf["radius_m"], lf["delta_m"])

    dem = apply_historical_water(dem, bay, marsh)
    dem = fill_missing_land(dem)
    # Slope the bay floor up to the shore (shelf_m <= 0 keeps it flat), so no cliff.
    dem = apply_bay_shelf(dem, bay, cell, shelf_m)

    layers = [
        Layer("terrain", "USGS 3DEP, modified", "inferred", "USGS 3DEP; see docs/research"),
    ]
    if bay_path or marsh_path:
        layers.append(
            Layer("water", "SFEI historical ecology", "documented", "SFEI; see docs/research")
        )
    if gap is not None:
        layers.append(
            Layer("open_water_gap_fill", "modern DEM where SFEI maps no habitat", "inferred",
                  "USGS 3DEP; gap fill by this project")
        )
    if landforms:
        layers.append(
            Layer("landforms", "hand-sculpted corrections", "illustrative", "this project")
        )
    processing = {
        "smooth_m": smooth_m,
        "shelf_m": shelf_m,
        "shore_open_cells": shore_open_cells,
        "open_water_max_m": open_water_max_m,
        "coverage": coverage_path is not None,
    }
    write_assets(dem, grid, layers, out_dir, processing)

    if checks_path:
        return run_checks(dem, grid, load_expectations(checks_path))
    return []


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="yelamu")
    p.add_argument("--dem", type=Path, required=True)
    p.add_argument("--bbox", type=float, nargs=4, required=True,
                   metavar=("WEST", "SOUTH", "EAST", "NORTH"), help="lon/lat degrees")
    p.add_argument("--dem-nodata", type=float, default=None,
                   help="nodata value to use instead of the DEM's own tag")
    p.add_argument("--cell", type=float, default=10.0, help="metres per pixel")
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--bay", type=Path, help="GeoJSON of historical bay water")
    p.add_argument("--marsh", type=Path, help="GeoJSON of historical marsh")
    p.add_argument("--coverage", type=Path,
                   help="GeoJSON of ALL habitat polygons (the area SFEI mapped); where it "
                        "has none and the DEM is low, the cell is open bay")
    p.add_argument("--open-water-max-m", type=float, default=0.5,
                   help="DEM height (m) at or below which an unmapped cell is open bay")
    p.add_argument("--smooth-m", type=float, default=30.0,
                   help="Gaussian sigma (m) that blurs the modern street grid and building "
                        "pads out of the land; 0 disables")
    p.add_argument("--shelf-m", type=float, default=150.0,
                   help="distance (m) over which the bay floor slopes from the shore down "
                        "to full depth; 0 gives a flat floor")
    p.add_argument("--shore-open-cells", type=int, default=2,
                   help="radius (cells) of the opening that removes thin piers and specks "
                        "from DEM-derived shoreline; 0 disables")
    p.add_argument("--landforms", type=Path, help="JSON list of hand-sculpted landforms")
    p.add_argument("--checks", type=Path, help="JSON list of height expectations")
    args = p.parse_args(argv)

    failures = build(
        args.dem, tuple(args.bbox), args.cell, args.out,
        args.bay, args.marsh, args.landforms, args.checks, args.dem_nodata,
        args.coverage, args.open_water_max_m,
        args.smooth_m, args.shelf_m, args.shore_open_cells,
    )
    if failures:
        print("Sanity checks FAILED:", file=sys.stderr)
        for line in failures:
            print(f"  - {line}", file=sys.stderr)
        return 2
    print(f"Wrote assets to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
