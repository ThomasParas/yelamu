"""Command line entry point: build the heightmap assets for one bounding box."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from yelamu.checks import load_expectations, run_checks
from yelamu.export import Layer, write_assets
from yelamu.geo import Grid, lonlat_to_utm
from yelamu.sources import load_dem, load_polygons
from yelamu.terrain import apply_historical_water, fill_missing_land, stamp_landform
from yelamu.water import water_mask


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
) -> list[str]:
    """Run the pipeline. Returns the list of failed sanity checks (empty is good)."""
    grid = Grid.from_lonlat_bbox(*bbox, cell=cell)
    dem = load_dem(dem_path, grid, nodata=dem_nodata)

    # Landforms first, so a stamp near the shore can't raise the bay floor or dig
    # dry land below sea level: the water edit and the clamp come last.
    if landforms_path:
        for lf in json.loads(Path(landforms_path).read_text()):
            x, y = lonlat_to_utm(lf["lon"], lf["lat"])
            dem = stamp_landform(dem, grid, x, y, lf["radius_m"], lf["delta_m"])

    bay = water_mask(load_polygons(bay_path) if bay_path else [], grid)
    marsh = water_mask(load_polygons(marsh_path) if marsh_path else [], grid)
    dem = apply_historical_water(dem, bay, marsh)
    dem = fill_missing_land(dem)

    layers = [
        Layer("terrain", "USGS 3DEP, modified", "inferred", "USGS 3DEP; see docs/research"),
    ]
    if bay_path or marsh_path:
        layers.append(
            Layer("water", "SFEI historical ecology", "documented", "SFEI; see docs/research")
        )
    if landforms_path:
        layers.append(
            Layer("landforms", "hand-sculpted corrections", "illustrative", "this project")
        )
    write_assets(dem, grid, layers, out_dir)

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
    p.add_argument("--landforms", type=Path, help="JSON list of hand-sculpted landforms")
    p.add_argument("--checks", type=Path, help="JSON list of height expectations")
    args = p.parse_args(argv)

    failures = build(
        args.dem, tuple(args.bbox), args.cell, args.out,
        args.bay, args.marsh, args.landforms, args.checks, args.dem_nodata,
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
