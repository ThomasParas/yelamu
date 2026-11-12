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
from yelamu.geo import Grid
from yelamu.habitat import apply_overrides, rasterize_habitats
from yelamu.landforms import apply_landforms, landform_provenance, load_landforms
from yelamu.ponds import (
    DEFAULT_BANK_M,
    DEFAULT_BANK_SLOPE,
    DEFAULT_MAX_DEPTH_M,
    DEFAULT_POND_CLASSES,
    DEFAULT_SHELF_M,
    MIN_POND_CELLS,
    PONDS_FILE,
    blend_pond_banks,
    build_ponds,
    carve_ponds,
    hand_pond_specs,
    pond_layer,
    pond_mask,
    pond_provenance_rows,
    ponds_document,
    sfei_class_polygons,
    sfei_pond_specs,
    stamp_ponds_on_habitat,
)
from yelamu.provenance import hand_source_rows, layer_source_summary, lowest_confidence
from yelamu.region import Region, load_region
from yelamu.sources import load_dem, load_features, load_polygons
from yelamu.terrain import (
    apply_bay_shelf,
    apply_historical_water,
    apply_land_ramp,
    fill_missing_land,
    smooth_land,
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
    hand_pond_paths: Sequence[Path] = (),
    pond_classes: Sequence[str] = DEFAULT_POND_CLASSES,
    marsh_classes: Sequence[str] = (),
    pond_max_depth_m: float = DEFAULT_MAX_DEPTH_M,
    pond_shelf_m: float = DEFAULT_SHELF_M,
    pond_bank_slope: float = DEFAULT_BANK_SLOPE,
    pond_bank_m: float = DEFAULT_BANK_M,
) -> list[str]:
    """Run the pipeline. Returns the list of failed sanity checks (empty is good).

    `habitats_path` (the SFEI habitat GeoJSON) produces the habitat raster, and also
    serves as the coverage polygons when `coverage_path` is not given. Hand-drawn water
    files (`hand_bay_paths`, `hand_marsh_paths`) may be empty; their polygons are
    added to the bay / marsh masks and count as mapped area for the gap rule. Every
    hand-drawn feature, landform and hand pond must carry a source and a confidence
    (ValueError otherwise). Freshwater ponds come from the SFEI classes in `pond_classes`
    and from `hand_pond_paths`; they are carved last, after all other water edits.
    """
    grid = Grid.from_lonlat_bbox(*bbox, cell=cell)
    dem = load_dem(dem_path, grid, nodata=dem_nodata)
    raw_dem = dem.copy()  # the modern DEM, for gap fill and pond levels

    bay = water_mask(load_polygons(bay_path) if bay_path else [], grid)
    marsh = water_mask(load_polygons(marsh_path) if marsh_path else [], grid)

    # Hand-drawn inputs are validated up front, so a missing source fails fast.
    landforms = load_landforms(landforms_path, bbox) if landforms_path else []
    hand_bay_feats = [
        f for path in hand_bay_paths
        for f in load_features(path, allow_empty=True, require_provenance=True)
    ]
    hand_marsh_feats = [
        f for path in hand_marsh_paths
        for f in load_features(path, allow_empty=True, require_provenance=True)
    ]
    hand_pond_specs_all = []
    for path in hand_pond_paths:
        hand_pond_specs_all += hand_pond_specs(
            load_features(path, allow_empty=True, require_provenance=True), path)
    hand_bay = water_mask([f.geometry for f in hand_bay_feats], grid)
    hand_marsh = water_mask([f.geometry for f in hand_marsh_feats], grid)
    hand_water_feats = hand_bay_feats + hand_marsh_feats
    hand_used = bool(hand_water_feats)
    # Where both are drawn, bay wins (apply_historical_water's usual rule).
    bay = bay | hand_bay
    marsh = marsh | hand_marsh

    # Ponds: SFEI polygons of the pond classes plus the hand-drawn ones. Hand ponds count
    # as mapped area for the gap rule, like the other hand-drawn water.
    habitat_collection = json.loads(Path(habitats_path).read_text()) if habitats_path else None
    if habitat_collection is not None and marsh_classes:
        marsh = marsh | water_mask(sfei_class_polygons(habitat_collection, marsh_classes), grid)
    pond_specs = list(hand_pond_specs_all)
    if habitat_collection is not None:
        pond_specs += sfei_pond_specs(habitat_collection, pond_classes)
    ponds = build_ponds(pond_specs, raw_dem, grid, MIN_POND_CELLS, print)
    hand_pond_cells = pond_mask([p for p in ponds if p.origin == "hand"], (grid.height, grid.width))

    # Where SFEI maps no habitat at all, the modern DEM stands in for open bay. Decide
    # this from the raw DEM, before smoothing or landform stamping change any elevation.
    gap = None
    removed = None
    coverage_src = coverage_path or habitats_path
    if coverage_src:
        # Hand-drawn polygons are mapped area too, so the gap fill never overrides them.
        coverage = (water_mask(load_polygons(coverage_src), grid) | hand_bay | hand_marsh
                    | hand_pond_cells)
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
        habitat, habitat_classes, unknown = rasterize_habitats(habitat_collection, grid)
        if unknown:
            print("WARNING: habitat classes not in the group mapping (shown as unmapped): "
                  + ", ".join(unknown), file=sys.stderr)
        # Everything turned into bay from the modern DEM is "inferred open bay"; a hand
        # marsh under a bay cell stays bay, matching the heightmap.
        inferred = gap if removed is None or gap is None else gap | removed
        habitat = apply_overrides(habitat, inferred, hand_bay, hand_marsh & ~bay)
        habitat = stamp_ponds_on_habitat(habitat, habitat_classes, ponds)

    # Blur away the modern street grid and building pads, using land cells only.
    if smooth_m > 0:
        dem = smooth_land(dem, smooth_m / cell, valid=~(bay | marsh) & ~np.isnan(dem))

    # Landforms after smoothing, so stamps stay exact. The water edit and the clamp come
    # after the stamps so one near the shore can't raise the bay floor or dig dry land.
    dem = apply_landforms(dem, grid, landforms)

    dem = apply_historical_water(dem, bay, marsh)
    dem = fill_missing_land(dem)
    # Fill and grading by the old shore would form a wall: cap how steeply land rises
    # from the water (shore_slope m per m; 0 disables).
    dem = apply_land_ramp(dem, bay | marsh, grid.cell, shore_slope)
    # Slope the bay floor up to the shore (shelf_m <= 0 keeps it flat), so no cliff.
    dem = apply_bay_shelf(dem, bay, cell, shelf_m)
    # Ponds last: their beds are set from the polygon and level alone, so none of the
    # edits above (ramp, shelf, smoothing, landforms) can touch them.
    dem = carve_ponds(dem, ponds, cell, pond_max_depth_m, pond_shelf_m)
    # Grade the ground around the ponds (land cells only) so there is no wall or dam.
    dem = blend_pond_banks(dem, grid, ponds, ~(bay | marsh), pond_bank_slope, pond_bank_m)
    if ponds:
        n_sfei = sum(p.origin == "sfei" for p in ponds)
        print(f"Carved {len(ponds)} ponds ({n_sfei} from SFEI, {len(ponds) - n_sfei} hand-drawn), "
              f"{int(pond_mask(ponds, dem.shape).sum())} cells")

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
    hand_sources: list[dict] = []
    if hand_used:
        pairs = [(f.source, f.confidence) for f in hand_water_feats]
        layers.append(
            Layer("hand_water", layer_source_summary("hand-drawn", [p[0] for p in pairs]),
                  lowest_confidence(p[1] for p in pairs), "this project")
        )
        hand_sources += hand_source_rows("hand_water", pairs)
    if landforms:
        pairs = landform_provenance(landforms)
        layers.append(
            Layer("landforms", layer_source_summary("hand-sculpted", [p[0] for p in pairs]),
                  lowest_confidence(p[1] for p in pairs), "this project")
        )
        hand_sources += hand_source_rows("landforms", pairs)
    pond_meta_layer = pond_layer(ponds)
    if pond_meta_layer is not None:
        layers.append(pond_meta_layer)
        hand_sources += pond_provenance_rows(ponds)
    processing = {
        "smooth_m": smooth_m,
        "shelf_m": shelf_m,
        "shore_slope": shore_slope,
        "shore_open_cells": shore_open_cells,
        "open_water_max_m": open_water_max_m,
        "coverage": coverage_src is not None,
        "pond_classes": list(pond_classes),
        "marsh_classes": list(marsh_classes),
        "pond_max_depth_m": pond_max_depth_m,
        "pond_shelf_m": pond_shelf_m,
        "pond_bank_slope": pond_bank_slope,
        "pond_bank_m": pond_bank_m,
    }
    extra_meta: dict = {}
    if ponds:
        extra_meta["ponds_file"] = PONDS_FILE
    if hand_sources:
        extra_meta["hand_sources"] = sorted(
            hand_sources, key=lambda r: (r["layer"], r["source"], r["confidence"]))
    write_assets(dem, grid, layers, out_dir, processing, habitat, habitat_classes, extra_meta)

    ponds_path = Path(out_dir) / PONDS_FILE
    if ponds:
        document = ponds_document(ponds, grid, {
            "max_depth_m": pond_max_depth_m,
            "shelf_m": pond_shelf_m,
            "min_cells": MIN_POND_CELLS,
            "classes": list(pond_classes),
            "level": "level_m if given, else the median of the raw modern DEM in the polygon",
        })
        ponds_path.write_text(json.dumps(document, separators=(",", ":")))
    elif ponds_path.exists():
        ponds_path.unlink()  # a stale file from an earlier build must not outlive its meta key

    if checks_path:
        return run_checks(dem, grid, load_expectations(checks_path),
                          pond_mask(ponds, dem.shape) if ponds else None)
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
        "hand_ponds": region.hand_ponds,
        "landforms": region.landforms,
        "checks": region.checks,
    }
    if region.pond_classes is not None:
        defaults["pond_classes"] = list(region.pond_classes)
    if region.marsh_classes is not None:
        defaults["marsh_classes"] = list(region.marsh_classes)
    for key in ("smooth_m", "shelf_m", "shore_slope", "shore_open_cells", "open_water_max_m",
                "pond_max_depth_m", "pond_shelf_m", "pond_bank_slope", "pond_bank_m"):
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
    p.add_argument("--hand-ponds", type=Path, nargs="+", default=[],
                   help="GeoJSON file(s) of hand-drawn freshwater ponds (may be empty); "
                        "each feature needs properties.source and .confidence, and may have "
                        "level_m, name, id")
    p.add_argument("--pond-classes", nargs="+", default=list(DEFAULT_POND_CLASSES),
                   metavar="CLASS",
                   help="SFEI HabitatCla values that are freshwater ponds (default: the four "
                        "pond/lake/lagoon classes; 'Tidal coastal lagoon' is not included)")
    p.add_argument("--marsh-classes", nargs="+", default=[], metavar="CLASS",
                   help="SFEI HabitatCla values drawn as tidal marsh at the marsh level, in "
                        "addition to --marsh (default: none)")
    p.add_argument("--pond-max-depth-m", type=float, default=DEFAULT_MAX_DEPTH_M,
                   help="depth (m) of a pond bed below its water level (0 or more), reached over "
                        "--pond-shelf-m from the shore")
    p.add_argument("--pond-shelf-m", type=float, default=DEFAULT_SHELF_M,
                   help="distance (m, greater than 0) over which a pond bed deepens from the shore "
                        "to full depth")
    p.add_argument("--pond-bank-slope", type=float, default=DEFAULT_BANK_SLOPE,
                   help="maximum slope (m per m) of the graded bank around a pond; "
                        "0 disables the grading")
    p.add_argument("--pond-bank-m", type=float, default=DEFAULT_BANK_M,
                   help="how far (m) from a pond shore the bank grading reaches")
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
    if not args.pond_shelf_m > 0:
        p.error(f"--pond-shelf-m must be greater than 0, got {args.pond_shelf_m:g}")
    if not args.pond_max_depth_m >= 0:
        p.error(f"--pond-max-depth-m must be 0 or greater, got {args.pond_max_depth_m:g}")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    failures = build(
        args.dem, tuple(args.bbox), args.cell, args.out,
        args.bay, args.marsh, args.landforms, args.checks, args.dem_nodata,
        args.coverage, args.open_water_max_m,
        args.smooth_m, args.shelf_m, args.shore_open_cells, args.shore_slope,
        args.habitats, args.hand_bay, args.hand_marsh,
        hand_pond_paths=args.hand_ponds, pond_classes=args.pond_classes,
        marsh_classes=args.marsh_classes,
        pond_max_depth_m=args.pond_max_depth_m, pond_shelf_m=args.pond_shelf_m,
        pond_bank_slope=args.pond_bank_slope, pond_bank_m=args.pond_bank_m,
    )
    if failures:
        print("Sanity checks FAILED:", file=sys.stderr)
        for line in failures:
            print(f"  - {line}", file=sys.stderr)
        return 2
    print(f"Wrote assets to {args.out}")
    return 0


def cli_entry(argv: list[str] | None = None) -> int:
    """main() for the command line: input errors print one line instead of a traceback."""
    try:
        return main(argv)
    except (ValueError, FileNotFoundError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(cli_entry())
