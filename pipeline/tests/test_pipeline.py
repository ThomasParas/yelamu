"""End-to-end test on synthetic data: a flat 'modern fill' DEM with a historical bay."""

import json

import numpy as np
import rasterio
from PIL import Image
from rasterio.transform import from_origin
from shapely.geometry import Point

from yelamu.checks import Expectation, run_checks
from yelamu.cli import main
from yelamu.export import decode_heights
from yelamu.geo import UTM_CRS, Grid, lonlat_to_utm
from yelamu.sources import load_dem, load_polygons

BBOX = (-122.42, 37.755, -122.37, 37.805)


def _write_dem(path, grid: Grid, value: float) -> None:
    """A flat DEM covering the grid (plus margin), in UTM so no resampling surprises."""
    margin = 200
    width = grid.width + 2 * margin // int(grid.cell)
    height = grid.height + 2 * margin // int(grid.cell)
    transform = from_origin(grid.west - margin, grid.north + margin, grid.cell, grid.cell)
    with rasterio.open(
        path, "w", driver="GTiff", height=height, width=width, count=1,
        dtype="float32", crs=UTM_CRS, transform=transform,
    ) as dst:
        dst.write(np.full((height, width), value, dtype="float32"), 1)


def _write_bay_geojson(path, lon0, lat0, lon1, lat1) -> None:
    ring = [[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]]
    path.write_text(json.dumps({
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "properties": {},
                      "geometry": {"type": "Polygon", "coordinates": [ring]}}],
    }))


def test_load_dem_reproduces_values_on_the_grid(tmp_path):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem(tmp_path / "dem.tif", grid, 7.0)
    dem = load_dem(tmp_path / "dem.tif", grid)
    assert dem.shape == (grid.height, grid.width)
    assert np.allclose(dem, 7.0)


def test_load_polygons_reprojects_to_utm(tmp_path):
    _write_bay_geojson(tmp_path / "bay.geojson", -122.40, 37.77, -122.39, 37.78)
    (geom,) = load_polygons(tmp_path / "bay.geojson")
    x, y = lonlat_to_utm(-122.395, 37.775)
    assert geom.contains(Point(x, y))


def test_cli_end_to_end_lowers_reclaimed_land(tmp_path):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem(tmp_path / "dem.tif", grid, 5.0)  # everything is 5 m 'modern fill'
    _write_bay_geojson(tmp_path / "bay.geojson", -122.40, 37.77, -122.38, 37.79)
    out = tmp_path / "out"

    code = main([
        "--dem", str(tmp_path / "dem.tif"),
        "--bbox", *map(str, BBOX),
        "--out", str(out),
        "--bay", str(tmp_path / "bay.geojson"),
    ])

    assert code == 0
    meta = json.loads((out / "meta.json").read_text())
    assert meta["min_m"] == -3.0 and meta["max_m"] == 5.0
    heights = decode_heights(
        np.asarray(Image.open(out / "heightmap.png")), meta["min_m"], meta["max_m"]
    )
    x, y = lonlat_to_utm(-122.39, 37.78)  # inside the bay polygon
    row, col = grid.pixel_of(x, y)
    assert abs(heights[row, col] - (-3.0)) < 0.01
    x, y = lonlat_to_utm(-122.415, 37.76)  # dry land outside it
    row, col = grid.pixel_of(x, y)
    assert abs(heights[row, col] - 5.0) < 0.01


def test_run_checks_reports_failures_and_outside_points():
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    dem = np.full((grid.height, grid.width), 2.0, dtype="float32")
    failures = run_checks(dem, grid, [
        Expectation("low spot ok", -122.39, 37.78, max_m=3.0),
        Expectation("hill too low", -122.40, 37.78, min_m=60.0),
        Expectation("off the map", -100.0, 10.0, min_m=0.0),
    ])
    assert len(failures) == 2
    assert "hill too low" in failures[0]
    assert "outside the grid" in failures[1]


def test_cli_exits_2_when_a_check_fails(tmp_path):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem(tmp_path / "dem.tif", grid, 5.0)
    (tmp_path / "checks.json").write_text(json.dumps(
        [{"name": "needs a hill", "lon": -122.40, "lat": 37.78, "min_m": 60.0}]
    ))
    code = main([
        "--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX),
        "--out", str(tmp_path / "out"), "--checks", str(tmp_path / "checks.json"),
    ])
    assert code == 2
