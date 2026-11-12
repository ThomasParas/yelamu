"""Command line entry point: build the heightmap assets for one bounding box."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

import numpy as np

from yelamu.checks import load_expectations, run_checks
from yelamu.export import Layer, write_assets
from yelamu.geo import Grid, lonlat_to_utm
from yelamu.habitat import apply_overrides, rasterize_habitats
from yelamu.region import Region, load_region
from yelamu.sources import load_dem, load_polygons
from yelamu.terrain import (
    apply_bay_shelf,
    apply_historical_water,
    apply_land_ramp,
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
    shore_slope: float = 0.30,
    habitats_path: Path | None = None,
    hand_bay_paths: Sequence[Path] = (),
    hand_marsh_paths: Sequence[Path] = (),
) -> list[str]:
    """Run the pipeline. Returns the list of failed sanity checks (empty is good).

    `habitats_path` (the SFEI habitat GeoJSON) produces the habitat raster, and also
    serves as the coverage polygons when `coverage_path` is not given. Hand-drawn water
    files (`hand_bay_paths`, `hand_marsh_paths`) may be empty; their polygons are
    added to the bay / marsh masks and count as mapped area for the gap rule.
    """
    grid = Grid.from_lonlat_bbox(*bbox, cell=cell)
    dem = load_dem(dem_path, grid, nodata=dem_nodata)

    bay = water_mask(load_polygons(bay_path) if bay_path else [], grid)
    marsh = water_mask(load_polygons(marsh_path) if marsh_path else [], grid)

    hand_bay_polys = [
        g for path in hand_bay_paths for g in load_polygons(path, allow_empty=True)
    ]
    hand_marsh_polys = [
        g for path in hand_marsh_paths for g in load_polygons(path, allow_empty=True)
    ]
    hand_bay = water_mask(hand_bay_polys, grid)
    hand_marsh = water_mask(hand_marsh_polys, grid)
    hand_used = bool(hand_bay_polys or hand_marsh_polys)
    # Where both are drawn, bay wins (apply_historical_water's usual rule).
    bay = bay | hand_bay
    marsh = marsh | hand_marsh

    # Where SFEI maps no habitat at all, the modern DEM stands in for open bay. Decide
    # this from the raw DEM, before smoothing or landform stamping change any elevation.
    gap = None
    removed = None
    coverage_src = coverage_path or habitats_path
    if coverage_src:
        # Hand-drawn polygons are mapped area too, so the gap fill never overrides them.
        coverage = water_mask(load_polygons(coverage_src), grid) | hand_bay | hand_marsh
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

    habitat = habitat_classes = None
    if habitats_path:
        habitat, habitat_classes, unknown = rasterize_habitats(
            json.loads(Path(habitats_path).read_text()), grid
        )
        if unknown:
            print("WARNING: habitat classes not in the group mapping (shown as unmapped): "
                  + ", ".join(unknown), file=sys.stderr)
        # Everything turned into bay from the modern DEM is "inferred open bay"; a hand
        # marsh under a bay cell stays bay, matching the heightmap.
        inferred = gap if removed is None or gap is None else gap | removed
        habitat = apply_overrides(habitat, inferred, hand_bay, hand_marsh & ~bay)

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
    # Fill and grading by the old shore would form a wall: cap how steeply land rises
    # from the water (shore_slope m per m; 0 disables).
    dem = apply_land_ramp(dem, bay | marsh, grid.cell, shore_slope)
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
    if hand_used:
        layers.append(
            Layer("hand_water", "hand-drawn from historical maps (user-authored)", "inferred",
                  "this project")
        )
    if landforms:
        layers.append(
            Layer("landforms", "hand-sculpted corrections", "illustrative", "this project")
        )
    processing = {
        "smooth_m": smooth_m,
        "shelf_m": shelf_m,
        "shore_slope": shore_slope,
        "shore_open_cells": shore_open_cells,
        "open_water_max_m": open_water_max_m,
        "coverage": coverage_src is not None,
    }
    write_assets(dem, grid, layers, out_dir, processing, habitat, habitat_classes)

    if checks_path:
        return run_checks(dem, grid, load_expectations(checks_path))
    return []


def _region_defaults(region: Region) -> dict:
    """argparse defaults (by dest) taken from a region; None overrides are left out."""
    defaults: dict = {
        "dem": region.dem,
        "bbox": region.bbox,
        "cell": region.cell_m,
        "out": region.out,
        "habitats": region.habitats,
        "bay": region.bay,
        "marsh": region.marsh,
        "hand_bay": region.hand_bay,
        "hand_marsh": region.hand_marsh,
        "landforms": region.landforms,
        "checks": region.checks,
    }
    for key in ("smooth_m", "shelf_m", "shore_slope", "shore_open_cells", "open_water_max_m"):
        if getattr(region, key) is not None:
            defaults[key] = getattr(region, key)
    return defaults


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse the command line. Values from --region are defaults; explicit flags win."""
    p = argparse.ArgumentParser(prog="yelamu", allow_abbrev=False)
    p.add_argument("--region", type=Path,
                   help="region JSON (see regions/); its values are the defaults, and any "
                        "flag given here overrides them")
    p.add_argument("--dem", type=Path)
    p.add_argument("--bbox", type=float, nargs=4,
                   metavar=("WEST", "SOUTH", "EAST", "NORTH"), help="lon/lat degrees")
    p.add_argument("--dem-nodata", type=float, default=None,
                   help="nodata value to use instead of the DEM's own tag")
    p.add_argument("--cell", type=float, default=10.0, help="metres per pixel")
    p.add_argument("--out", type=Path)
    p.add_argument("--bay", type=Path, help="GeoJSON of historical bay water")
    p.add_argument("--marsh", type=Path, help="GeoJSON of historical marsh")
    p.add_argument("--habitats", type=Path,
                   help="SFEI habitat GeoJSON: builds the habitat raster, and is the "
                        "coverage when --coverage is not given")
    p.add_argument("--hand-bay", type=Path, nargs="+", default=[],
                   help="GeoJSON file(s) of hand-drawn bay polygons (may be empty)")
    p.add_argument("--hand-marsh", type=Path, nargs="+", default=[],
                   help="GeoJSON file(s) of hand-drawn marsh polygons (may be empty)")
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
    p.add_argument("--shore-slope", type=float, default=0.30,
                   help="maximum land slope (metres of rise per metre) away from the "
                        "historical shoreline, so modern fill doesn't form a wall; 0 disables")
    p.add_argument("--landforms", type=Path, help="JSON list of hand-sculpted landforms")
    p.add_argument("--checks", type=Path, help="JSON list of height expectations")

    # Load the region first (a tiny pre-parse), then make its values the defaults.
    pre = argparse.ArgumentParser(add_help=False, allow_abbrev=False)
    pre.add_argument("--region", type=Path)
    region_path = pre.parse_known_args(argv)[0].region
    if region_path is not None:
        try:
            p.set_defaults(**_region_defaults(load_region(region_path)))
        except (OSError, ValueError) as exc:
            p.error(f"--region: {exc}")

    args = p.parse_args(argv)
    missing = [f"--{name}" for name in ("dem", "bbox", "out") if getattr(args, name) is None]
    if missing:
        p.error("missing " + ", ".join(missing) + " (give the flag or use --region)")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    failures = build(
        args.dem, tuple(args.bbox), args.cell, args.out,
        args.bay, args.marsh, args.landforms, args.checks, args.dem_nodata,
        args.coverage, args.open_water_max_m,
        args.smooth_m, args.shelf_m, args.shore_open_cells, args.shore_slope,
        args.habitats, args.hand_bay, args.hand_marsh,
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
