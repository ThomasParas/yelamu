"""End-to-end test on synthetic data: a flat 'modern fill' DEM with a historical bay."""

import json
from pathlib import Path

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import Point

from yelamu.checks import Expectation, run_checks
from yelamu.cli import main, parse_args
from yelamu.export import dequantize_heights
from yelamu.geo import UTM_CRS, Grid, lonlat_to_utm
from yelamu.habitat import ID_HAND_BAY, ID_HAND_MARSH, ID_OPEN_BAY_INFERRED, ID_UNMAPPED
from yelamu.terrain import LAND_FLOOR_M, MARSH_LEVEL_M, WATER_LEVEL_M
from yelamu.sources import load_dem, load_polygons
from yelamu.water import water_mask

BBOX = (-122.42, 37.755, -122.37, 37.805)


def _read_heights(out, meta) -> np.ndarray:
    q = np.fromfile(out / "heightmap.u16", dtype="<u2").reshape(meta["height"], meta["width"])
    return dequantize_heights(q, meta["min_m"], meta["max_m"])


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
    heights = _read_heights(out, meta)
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


# ---------------------------------------------------------------- hardening ---


def _write_dem_with_block(path, grid: Grid, value: float, block_lonlat, fill: float,
                          tag_nodata: float | None) -> None:
    """Flat UTM DEM aligned to the grid, with `fill` inside a lon/lat block.

    tag_nodata is written into the GeoTIFF nodata tag (None leaves it untagged).
    """
    margin = 200
    width = grid.width + 2 * margin // int(grid.cell)
    height = grid.height + 2 * margin // int(grid.cell)
    west, north = grid.west - margin, grid.north + margin
    data = np.full((height, width), value, dtype="float32")
    lon0, lat0, lon1, lat1 = block_lonlat
    x0, y0 = lonlat_to_utm(lon0, lat0)
    x1, y1 = lonlat_to_utm(lon1, lat1)
    c0, c1 = int((x0 - west) // grid.cell), int((x1 - west) // grid.cell)
    r0, r1 = int((north - y1) // grid.cell), int((north - y0) // grid.cell)
    data[r0:r1, c0:c1] = fill
    kwargs = {} if tag_nodata is None else {"nodata": tag_nodata}
    with rasterio.open(
        path, "w", driver="GTiff", height=height, width=width, count=1,
        dtype="float32", crs=UTM_CRS, transform=from_origin(west, north, grid.cell, grid.cell),
        **kwargs,
    ) as dst:
        dst.write(data, 1)


def _pixel(grid: Grid, lon: float, lat: float) -> tuple[int, int]:
    x, y = lonlat_to_utm(lon, lat)
    return grid.pixel_of(x, y)


def test_load_dem_geographic_crs_with_tagged_nodata(tmp_path):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    step = 0.0001
    west, north = BBOX[0] - 0.01, BBOX[3] + 0.01
    width = round((BBOX[2] - BBOX[0] + 0.02) / step)
    height = round((BBOX[3] - BBOX[1] + 0.02) / step)
    data = np.full((height, width), 7.0, dtype="float32")
    # Nodata block: lon -122.40..-122.39, lat 37.77..37.78.
    c0, c1 = round((-122.40 - west) / step), round((-122.39 - west) / step)
    r0, r1 = round((north - 37.78) / step), round((north - 37.77) / step)
    data[r0:r1, c0:c1] = -9999.0
    with rasterio.open(
        tmp_path / "dem.tif", "w", driver="GTiff", height=height, width=width, count=1,
        dtype="float32", crs="EPSG:4269", nodata=-9999.0,
        transform=from_origin(west, north, step, step),
    ) as dst:
        dst.write(data, 1)

    dem = load_dem(tmp_path / "dem.tif", grid)

    assert dem.shape == (grid.height, grid.width)
    row, col = _pixel(grid, -122.395, 37.775)
    assert np.isnan(dem[row, col])
    row, col = _pixel(grid, -122.41, 37.79)
    assert dem[row, col] == pytest.approx(7.0, abs=1e-3)
    assert np.isnan(dem).sum() < 0.1 * dem.size  # only the nodata block (plus edges)


def test_load_dem_untagged_nodata_needs_override(tmp_path):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    block = (-122.40, 37.77, -122.39, 37.78)
    _write_dem_with_block(tmp_path / "dem.tif", grid, 7.0, block, -9999.0, tag_nodata=None)
    row, col = _pixel(grid, -122.395, 37.775)

    raw = load_dem(tmp_path / "dem.tif", grid)
    assert raw[row, col] == pytest.approx(-9999.0)

    masked = load_dem(tmp_path / "dem.tif", grid, nodata=-9999.0)
    assert np.isnan(masked[row, col])
    assert masked[0, 0] == pytest.approx(7.0)


def test_cli_dem_nodata_option_is_passed_through(tmp_path):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem(tmp_path / "dem.tif", grid, -9999.0)  # untagged, all 'missing'
    args = ["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX),
            "--out", str(tmp_path / "out")]
    assert main(args) == 0  # without the option the values are just (clamped) numbers
    with pytest.raises(ValueError, match="--dem-nodata"):
        main([*args, "--dem-nodata", "-9999"])


def test_dem_that_misses_the_bbox_is_an_error(tmp_path):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    far = Grid(west=grid.west + 50_000, south=grid.south, east=grid.east + 50_000,
               north=grid.north, cell=10)
    _write_dem(tmp_path / "dem.tif", far, 5.0)
    with pytest.raises(ValueError, match="no elevation data"):
        main(["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX),
              "--out", str(tmp_path / "out")])


def test_nodata_inside_the_bay_is_harmless(tmp_path):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    block = (-122.395, 37.775, -122.385, 37.785)  # well inside the bay polygon
    _write_dem_with_block(tmp_path / "dem.tif", grid, 5.0, block, -9999.0, tag_nodata=-9999.0)
    _write_bay_geojson(tmp_path / "bay.geojson", -122.40, 37.77, -122.38, 37.79)
    out = tmp_path / "out"

    code = main(["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX),
                 "--out", str(out), "--bay", str(tmp_path / "bay.geojson")])

    assert code == 0
    meta = json.loads((out / "meta.json").read_text())
    heights = _read_heights(out, meta)
    row, col = _pixel(grid, -122.39, 37.78)
    assert abs(heights[row, col] - (-3.0)) < 0.01
    assert np.isfinite(heights).all()


def _write_geojson(path, features) -> None:
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))


def _feature(geometry) -> dict:
    return {"type": "Feature", "properties": {}, "geometry": geometry}


_SQUARE = [[[-122.40, 37.77], [-122.39, 37.77], [-122.39, 37.78], [-122.40, 37.78],
            [-122.40, 37.77]]]
_LINE = [[-122.41, 37.76], [-122.37, 37.80]]


def test_load_polygons_keeps_only_polygonal_parts(tmp_path):
    _write_geojson(tmp_path / "w.geojson", [
        _feature(None),
        {"type": "Feature", "properties": {}},  # geometry key missing entirely
        _feature({"type": "LineString", "coordinates": _LINE}),
        _feature({"type": "Point", "coordinates": [-122.4, 37.77]}),
        _feature({"type": "MultiLineString", "coordinates": [_LINE]}),
        _feature({"type": "GeometryCollection", "geometries": [
            {"type": "Polygon", "coordinates": _SQUARE},
            {"type": "LineString", "coordinates": _LINE},
        ]}),
    ])
    geoms = load_polygons(tmp_path / "w.geojson")
    assert len(geoms) == 1
    assert all(g.geom_type in ("Polygon", "MultiPolygon") for g in geoms)
    x, y = lonlat_to_utm(-122.395, 37.775)
    assert geoms[0].contains(Point(x, y))


def test_load_polygons_repairs_invalid_polygons(tmp_path):
    bowtie = [[[-122.40, 37.77], [-122.39, 37.78], [-122.39, 37.77], [-122.40, 37.78],
               [-122.40, 37.77]]]
    _write_geojson(tmp_path / "w.geojson", [_feature({"type": "Polygon", "coordinates": bowtie})])
    geoms = load_polygons(tmp_path / "w.geojson")
    assert geoms and all(g.is_valid and g.geom_type == "Polygon" for g in geoms)


def test_load_polygons_with_only_lines_raises(tmp_path):
    path = tmp_path / "lines.geojson"
    _write_geojson(path, [_feature({"type": "LineString", "coordinates": _LINE}), _feature(None)])
    with pytest.raises(ValueError, match="lines.geojson") as exc:
        load_polygons(path)
    assert "polygon" in str(exc.value)


def test_layers_only_claim_water_when_water_data_was_used(tmp_path):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem(tmp_path / "dem.tif", grid, 5.0)
    base = ["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX)]

    main([*base, "--out", str(tmp_path / "dry")])
    ids = [l["id"] for l in json.loads((tmp_path / "dry" / "meta.json").read_text())["layers"]]
    assert ids == ["terrain"]

    _write_bay_geojson(tmp_path / "bay.geojson", -122.40, 37.77, -122.38, 37.79)
    main([*base, "--out", str(tmp_path / "wet"), "--bay", str(tmp_path / "bay.geojson")])
    ids = [l["id"] for l in json.loads((tmp_path / "wet" / "meta.json").read_text())["layers"]]
    assert ids == ["terrain", "water"]

    _write_bay_geojson(tmp_path / "marsh.geojson", -122.40, 37.77, -122.38, 37.79)
    main([*base, "--out", str(tmp_path / "marsh"), "--marsh", str(tmp_path / "marsh.geojson")])
    ids = [l["id"] for l in json.loads((tmp_path / "marsh" / "meta.json").read_text())["layers"]]
    assert "water" in ids


@pytest.mark.parametrize("delta_m", [25.0, -25.0])
def test_landform_near_shore_cannot_alter_water_or_dig_land(tmp_path, delta_m):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem(tmp_path / "dem.tif", grid, 5.0)
    _write_bay_geojson(tmp_path / "bay.geojson", -122.40, 37.77, -122.38, 37.79)
    # Centred on the bay's eastern shore, so it overlaps both water and land.
    (tmp_path / "lf.json").write_text(json.dumps(
        [{"lon": -122.38, "lat": 37.78, "radius_m": 600, "delta_m": delta_m}]
    ))
    out = tmp_path / "out"

    main(["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX), "--out", str(out),
          "--bay", str(tmp_path / "bay.geojson"), "--landforms", str(tmp_path / "lf.json"),
          "--smooth-m", "0", "--shelf-m", "0", "--shore-open-cells", "0"])

    meta = json.loads((out / "meta.json").read_text())
    heights = _read_heights(out, meta)
    bay = water_mask(load_polygons(tmp_path / "bay.geojson"), grid)
    assert bay.any()
    assert np.abs(heights[bay] - (-3.0)).max() < 0.01  # the bay floor is untouched
    assert heights[~bay].min() > WATER_LEVEL_M  # no dry land dug into water


# ------------------------------------------------------------- gap fill ---


def _write_split_dem(path, grid: Grid, north_value: float, south_value: float) -> None:
    """UTM DEM: northern half `north_value`, southern half `south_value`."""
    margin = 200
    width = grid.width + 2 * margin // int(grid.cell)
    height = grid.height + 2 * margin // int(grid.cell)
    data = np.full((height, width), south_value, dtype="float32")
    data[: height // 2, :] = north_value
    with rasterio.open(
        path, "w", driver="GTiff", height=height, width=width, count=1,
        dtype="float32", crs=UTM_CRS,
        transform=from_origin(grid.west - margin, grid.north + margin, grid.cell, grid.cell),
    ) as dst:
        dst.write(data, 1)


# Probe points well away from the polygon edge (lon -122.395) and the DEM split (lat ~37.78).
_COVERED_N, _COVERED_S = (-122.41, 37.79), (-122.41, 37.77)
_UNCOVERED_N, _UNCOVERED_S = (-122.38, 37.79), (-122.38, 37.77)


def _gap_args(tmp_path, out, *extra):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    # North half 0 m (modern bay), south half 10 m (modern hill); coverage = west part only.
    _write_split_dem(tmp_path / "dem.tif", grid, 0.0, 10.0)
    _write_bay_geojson(tmp_path / "cov.geojson", -122.43, 37.74, -122.395, 37.84)
    return grid, ["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX),
                  "--out", str(out), *extra]


def _layer_ids(out) -> list[str]:
    return [l["id"] for l in json.loads((out / "meta.json").read_text())["layers"]]


def test_coverage_gap_fills_unmapped_open_water(tmp_path, capsys):
    out = tmp_path / "out"
    grid, args = _gap_args(tmp_path, out, "--coverage", str(tmp_path / "cov.geojson"))

    assert main(args) == 0

    meta = json.loads((out / "meta.json").read_text())
    heights = _read_heights(out, meta)
    assert abs(heights[_pixel(grid, *_UNCOVERED_N)] - (-3.0)) < 0.01  # gap-filled bay
    assert abs(heights[_pixel(grid, *_UNCOVERED_S)] - 10.0) < 0.01  # unmapped land stays
    # Covered cells are never gap-filled: SFEI mapped them (here as no water at all).
    assert heights[_pixel(grid, *_COVERED_N)] > WATER_LEVEL_M
    assert abs(heights[_pixel(grid, *_COVERED_S)] - 10.0) < 0.01
    assert "open_water_gap_fill" in _layer_ids(out)
    assert "Gap-filled" in capsys.readouterr().out


def test_without_coverage_nothing_is_gap_filled(tmp_path):
    out = tmp_path / "out"
    grid, args = _gap_args(tmp_path, out)

    assert main(args) == 0

    heights = _read_heights(out, json.loads((out / "meta.json").read_text()))
    assert heights[_pixel(grid, *_UNCOVERED_N)] > WATER_LEVEL_M
    assert "open_water_gap_fill" not in _layer_ids(out)


def test_open_water_max_m_option_raises_the_threshold(tmp_path):
    out = tmp_path / "out"
    grid, args = _gap_args(tmp_path, out, "--coverage", str(tmp_path / "cov.geojson"),
                           "--open-water-max-m", "20")

    assert main(args) == 0

    heights = _read_heights(out, json.loads((out / "meta.json").read_text()))
    assert abs(heights[_pixel(grid, *_UNCOVERED_S)] - (-3.0)) < 0.01  # 10 m now counts
    assert heights[_pixel(grid, *_COVERED_S)] > WATER_LEVEL_M  # still never covered cells


def test_gap_fill_uses_the_raw_dem_not_the_stamped_one(tmp_path):
    out = tmp_path / "out"
    grid, args = _gap_args(tmp_path, out, "--coverage", str(tmp_path / "cov.geojson"))
    # A big raise over the unmapped bay must not hide it from the gap fill.
    (tmp_path / "lf.json").write_text(json.dumps(
        [{"lon": -122.38, "lat": 37.79, "radius_m": 400, "delta_m": 25.0}]
    ))

    assert main([*args, "--landforms", str(tmp_path / "lf.json")]) == 0

    heights = _read_heights(out, json.loads((out / "meta.json").read_text()))
    assert abs(heights[_pixel(grid, *_UNCOVERED_N)] - (-3.0)) < 0.01


def test_empty_landforms_file_adds_no_landforms_layer(tmp_path):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem(tmp_path / "dem.tif", grid, 5.0)
    base = ["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX)]

    (tmp_path / "empty.json").write_text("[]")
    main([*base, "--out", str(tmp_path / "e"), "--landforms", str(tmp_path / "empty.json")])
    assert "landforms" not in _layer_ids(tmp_path / "e")

    (tmp_path / "one.json").write_text(json.dumps(
        [{"lon": -122.39, "lat": 37.78, "radius_m": 300, "delta_m": 5.0}]
    ))
    main([*base, "--out", str(tmp_path / "n"), "--landforms", str(tmp_path / "one.json")])
    assert "landforms" in _layer_ids(tmp_path / "n")


# ------------------------------------------------ smoothing, shelf, cleanup ---

_FLAT = ["--smooth-m", "0", "--shelf-m", "0", "--shore-open-cells", "0",
         "--shore-slope", "0"]


def _bay_run(tmp_path, *extra):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem(tmp_path / "dem.tif", grid, 5.0)
    _write_bay_geojson(tmp_path / "bay.geojson", -122.40, 37.77, -122.38, 37.79)
    out = tmp_path / "out"
    code = main(["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX),
                 "--out", str(out), "--bay", str(tmp_path / "bay.geojson"), *extra])
    assert code == 0
    meta = json.loads((out / "meta.json").read_text())
    return grid, meta, _read_heights(out, meta)


def test_zero_flags_reproduce_the_flat_bay_floor(tmp_path):
    grid, meta, heights = _bay_run(tmp_path, *_FLAT)
    bay = water_mask(load_polygons(tmp_path / "bay.geojson"), grid)
    assert np.abs(heights[bay] - (-3.0)).max() < 0.01  # flat floor up to the shore
    assert np.abs(heights[~bay] - 5.0).max() < 0.01
    assert meta["processing"]["smooth_m"] == 0 and meta["processing"]["shelf_m"] == 0


def test_defaults_slope_the_bay_floor_from_the_shore(tmp_path):
    grid, meta, heights = _bay_run(tmp_path)
    # Deep inside the polygon (~1 km from any shore) the floor is the full depth.
    assert abs(heights[_pixel(grid, -122.39, 37.78)] - (-3.0)) < 0.01
    # One cell in from the western edge (lon -122.40): shallow, but below the water plane.
    x, y = lonlat_to_utm(-122.40, 37.78)
    row, col = grid.pixel_of(x + 10.0, y)
    assert heights[row, col] < WATER_LEVEL_M
    assert heights[row, col] > -1.0
    # Dry land (flat 5 m) is unchanged by smoothing.
    assert abs(heights[_pixel(grid, -122.415, 37.76)] - 5.0) < 0.01


def test_meta_records_processing_parameters(tmp_path):
    _, meta, _ = _bay_run(tmp_path, "--smooth-m", "20", "--shelf-m", "90",
                          "--shore-open-cells", "3", "--open-water-max-m", "0.25")
    assert meta["processing"] == {
        "smooth_m": 20.0, "shelf_m": 90.0, "shore_open_cells": 3,
        "open_water_max_m": 0.25, "coverage": False, "shore_slope": 0.30,
    }
    assert "layers" in meta and "water_level_m" in meta


def test_thin_unmapped_pier_is_removed_when_enabled(tmp_path):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    # A 20 m wide, 300 m long 'pier' (2 cells wide) of 5 m land in an otherwise 0 m bay.
    _write_dem_with_block(tmp_path / "dem.tif", grid, 0.0, (-122.38200, 37.780, -122.38175, 37.783),
                          5.0, tag_nodata=None)
    # SFEI covers only the west, so the pier (east) is in the unmapped region.
    _write_bay_geojson(tmp_path / "cov.geojson", -122.43, 37.74, -122.395, 37.84)
    base = ["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX),
            "--coverage", str(tmp_path / "cov.geojson")]
    probe = _pixel(grid, -122.381875, 37.7815)

    main([*base, "--out", str(tmp_path / "off"), "--shore-open-cells", "0"])
    off = _read_heights(tmp_path / "off", json.loads((tmp_path / "off" / "meta.json").read_text()))
    assert off[probe] > WATER_LEVEL_M  # the pier is land when cleanup is off

    main([*base, "--out", str(tmp_path / "on")])
    on = _read_heights(tmp_path / "on", json.loads((tmp_path / "on" / "meta.json").read_text()))
    assert on[probe] < WATER_LEVEL_M  # removed and turned into water


def test_default_shore_slope_ramps_fill_next_to_the_bay(tmp_path):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem(tmp_path / "dem.tif", grid, 8.0)  # 8 m 'fill' right up to the bay
    _write_bay_geojson(tmp_path / "bay.geojson", -122.40, 37.77, -122.38, 37.79)
    bay = water_mask(load_polygons(tmp_path / "bay.geojson"), grid)
    base = ["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX),
            "--bay", str(tmp_path / "bay.geojson"), "--smooth-m", "0"]
    # One cell east of the polygon's eastern edge, mid-latitude.
    x, y = lonlat_to_utm(-122.38, 37.78)
    row, col = grid.pixel_of(x, y)
    while bay[row, col]:
        col += 1
    probe = (row, col)

    main([*base, "--out", str(tmp_path / "ramp")])
    ramp = _read_heights(tmp_path / "ramp",
                         json.loads((tmp_path / "ramp" / "meta.json").read_text()))
    assert LAND_FLOOR_M <= ramp[probe] <= LAND_FLOOR_M + 0.30 * 10.0 + 0.05
    assert abs(ramp[_pixel(grid, -122.415, 37.76)] - 8.0) < 0.01  # far inland untouched

    main([*base, "--out", str(tmp_path / "off"), "--shore-slope", "0"])
    off = _read_heights(tmp_path / "off",
                        json.loads((tmp_path / "off" / "meta.json").read_text()))
    assert abs(off[probe] - 8.0) < 0.01  # old behaviour: a wall at the shore


_EMPTY_FC = {"type": "FeatureCollection", "features": []}


def test_load_polygons_allow_empty(tmp_path):
    path = tmp_path / "empty.geojson"
    path.write_text(json.dumps(_EMPTY_FC))
    assert load_polygons(path, allow_empty=True) == []
    with pytest.raises(ValueError, match="empty.geojson"):
        load_polygons(path)
    # Unusable content (only lines) is also empty under allow_empty.
    _write_geojson(tmp_path / "l.geojson", [_feature({"type": "LineString", "coordinates": _LINE})])
    assert load_polygons(tmp_path / "l.geojson", allow_empty=True) == []


# ------------------------------------------------------- hand-drawn water ---


def _hand_run(tmp_path, *extra, dem_value=5.0, name="out"):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem(tmp_path / "dem.tif", grid, dem_value)
    out = tmp_path / name
    code = main(["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX),
                 "--out", str(out), *_FLAT, *extra])
    assert code == 0
    meta = json.loads((out / "meta.json").read_text())
    return grid, out, meta, _read_heights(out, meta)


def test_hand_marsh_over_fill_becomes_marsh_level(tmp_path):
    _write_bay_geojson(tmp_path / "hm.geojson", -122.40, 37.77, -122.38, 37.79)
    grid, out, meta, heights = _hand_run(tmp_path, "--hand-marsh", str(tmp_path / "hm.geojson"))
    assert abs(heights[_pixel(grid, -122.39, 37.78)] - MARSH_LEVEL_M) < 0.01
    assert abs(heights[_pixel(grid, -122.415, 37.76)] - 5.0) < 0.01  # elsewhere unchanged
    assert "hand_water" in _layer_ids(out)
    layer = next(l for l in meta["layers"] if l["id"] == "hand_water")
    assert layer["confidence"] == "inferred" and layer["attribution"] == "this project"
    assert layer["source"] == "hand-drawn from historical maps (user-authored)"


def test_hand_bay_becomes_bay(tmp_path):
    _write_bay_geojson(tmp_path / "hb.geojson", -122.40, 37.77, -122.38, 37.79)
    grid, out, _, heights = _hand_run(tmp_path, "--hand-bay", str(tmp_path / "hb.geojson"))
    assert abs(heights[_pixel(grid, -122.39, 37.78)] - (-3.0)) < 0.01
    assert abs(heights[_pixel(grid, -122.415, 37.76)] - 5.0) < 0.01
    assert "hand_water" in _layer_ids(out)


def test_hand_bay_wins_over_hand_marsh_and_multiple_files_are_merged(tmp_path):
    _write_bay_geojson(tmp_path / "hb1.geojson", -122.40, 37.77, -122.39, 37.79)
    _write_bay_geojson(tmp_path / "hb2.geojson", -122.38, 37.77, -122.375, 37.79)
    _write_bay_geojson(tmp_path / "hm.geojson", -122.405, 37.77, -122.385, 37.79)
    grid, _, _, heights = _hand_run(
        tmp_path, "--hand-bay", str(tmp_path / "hb1.geojson"), str(tmp_path / "hb2.geojson"),
        "--hand-marsh", str(tmp_path / "hm.geojson"))
    assert abs(heights[_pixel(grid, -122.395, 37.78)] - (-3.0)) < 0.01  # bay + marsh: bay
    assert abs(heights[_pixel(grid, -122.387, 37.78)] - MARSH_LEVEL_M) < 0.01  # marsh only
    assert abs(heights[_pixel(grid, -122.3775, 37.78)] - (-3.0)) < 0.01  # second bay file


def test_empty_hand_files_are_accepted_and_add_nothing(tmp_path):
    for name in ("hb", "hm"):
        (tmp_path / f"{name}.geojson").write_text(json.dumps(_EMPTY_FC))
    grid, out, meta, heights = _hand_run(
        tmp_path, "--hand-bay", str(tmp_path / "hb.geojson"),
        "--hand-marsh", str(tmp_path / "hm.geojson"))
    assert "hand_water" not in _layer_ids(out)
    assert np.abs(heights - 5.0).max() < 0.01


def test_hand_polygons_stop_the_gap_rule(tmp_path):
    out = tmp_path / "out"
    grid, args = _gap_args(tmp_path, out, "--coverage", str(tmp_path / "cov.geojson"), *_FLAT)
    # A hand marsh in the unmapped (east) north half, where the modern DEM is 0 m.
    _write_bay_geojson(tmp_path / "hm.geojson", -122.385, 37.785, -122.375, 37.795)

    assert main([*args, "--hand-marsh", str(tmp_path / "hm.geojson")]) == 0

    heights = _read_heights(out, json.loads((out / "meta.json").read_text()))
    assert abs(heights[_pixel(grid, -122.38, 37.79)] - MARSH_LEVEL_M) < 0.01  # not gap bay
    # Elsewhere in the unmapped north the gap fill still makes open bay.
    assert abs(heights[_pixel(grid, -122.372, 37.79)] - (-3.0)) < 0.01
    ids = _layer_ids(out)
    assert "hand_water" in ids and "open_water_gap_fill" in ids


# ------------------------------------------------------------ habitat raster ---

def _habitat_collection(tmp_path, with_unknown=False):
    feats = [{"type": "Feature", "properties": {"HabitatCla": "Coast live oak woodland"},
              "geometry": {"type": "Polygon", "coordinates": [[
                  [-122.43, 37.74], [-122.395, 37.74], [-122.395, 37.84], [-122.43, 37.84],
                  [-122.43, 37.74]]]}}]
    if with_unknown:
        feats.append({"type": "Feature", "properties": {"HabitatCla": "Weird thing"},
                      "geometry": {"type": "Polygon", "coordinates": [[
                          [-122.42, 37.80], [-122.41, 37.80], [-122.41, 37.81],
                          [-122.42, 37.81], [-122.42, 37.80]]]}})
    path = tmp_path / "hab.geojson"
    path.write_text(json.dumps({"type": "FeatureCollection", "features": feats}))
    return path


def _habitat(out, meta) -> np.ndarray:
    return np.fromfile(out / "habitat.u8", dtype=np.uint8).reshape(meta["height"], meta["width"])


def test_habitats_flag_writes_raster_legend_and_inferred_open_bay(tmp_path, capsys):
    out = tmp_path / "out"
    grid, args = _gap_args(tmp_path, out)
    hab = _habitat_collection(tmp_path, with_unknown=True)

    assert main([*args, "--habitats", str(hab)]) == 0

    meta = json.loads((out / "meta.json").read_text())
    assert (out / "habitat.u8").stat().st_size == meta["width"] * meta["height"]
    assert meta["habitat_file"] == "habitat.u8"
    ids = {e["name"]: e["id"] for e in meta["habitat_classes"]}
    assert (ids["Coast live oak woodland"], ids["Weird thing"]) == (4, 5)  # sorted-name ids
    woodland = ids["Coast live oak woodland"]
    raster = _habitat(out, meta)
    # --habitats is the coverage too: the unmapped, low (0 m) north-east is gap-filled bay.
    assert raster[_pixel(grid, *_UNCOVERED_N)] == ID_OPEN_BAY_INFERRED
    assert raster[_pixel(grid, *_UNCOVERED_S)] == ID_UNMAPPED  # unmapped high land
    assert raster[_pixel(grid, *_COVERED_S)] == woodland
    assert raster[_pixel(grid, *_COVERED_N)] == woodland  # mapped cells are never gap bay
    heights = _read_heights(out, meta)
    assert abs(heights[_pixel(grid, *_UNCOVERED_N)] - (-3.0)) < 0.01
    assert "open_water_gap_fill" in _layer_ids(out)
    assert "Weird thing" in capsys.readouterr().err  # unknown class warned on stderr


def test_explicit_coverage_wins_over_habitats_as_coverage(tmp_path):
    out = tmp_path / "out"
    # cov.geojson covers lon < -122.395; the habitat polygon covers everything east.
    grid, args = _gap_args(tmp_path, out, "--coverage", str(tmp_path / "cov.geojson"))
    hab = tmp_path / "hab.geojson"
    _write_bay_geojson(hab, -122.395, 37.74, -122.30, 37.84)
    data = json.loads(hab.read_text())
    data["features"][0]["properties"] = {"HabitatCla": "Beach"}
    hab.write_text(json.dumps(data))

    assert main([*args, "--habitats", str(hab)]) == 0

    meta = json.loads((out / "meta.json").read_text())
    heights = _read_heights(out, meta)
    assert abs(heights[_pixel(grid, *_UNCOVERED_N)] - (-3.0)) < 0.01  # gap from --coverage
    assert _habitat(out, meta)[_pixel(grid, *_UNCOVERED_N)] == ID_OPEN_BAY_INFERRED


def test_without_habitats_no_habitat_file(tmp_path):
    out = tmp_path / "out"
    _, args = _gap_args(tmp_path, out, "--coverage", str(tmp_path / "cov.geojson"))
    assert main(args) == 0
    meta = json.loads((out / "meta.json").read_text())
    assert not (out / "habitat.u8").exists()
    assert "habitat_file" not in meta and "habitat_classes" not in meta


def test_hand_marsh_is_stamped_on_the_habitat_raster(tmp_path):
    out = tmp_path / "out"
    grid, args = _gap_args(tmp_path, out)
    hab = _habitat_collection(tmp_path)
    _write_bay_geojson(tmp_path / "hm.geojson", -122.385, 37.785, -122.375, 37.795)
    _write_bay_geojson(tmp_path / "hb.geojson", -122.385, 37.765, -122.375, 37.775)

    assert main([*args, "--habitats", str(hab), "--hand-marsh", str(tmp_path / "hm.geojson"),
                 "--hand-bay", str(tmp_path / "hb.geojson")]) == 0

    meta = json.loads((out / "meta.json").read_text())
    raster = _habitat(out, meta)
    assert raster[_pixel(grid, -122.38, 37.79)] == ID_HAND_MARSH  # not gap bay, not unmapped
    assert raster[_pixel(grid, -122.38, 37.77)] == ID_HAND_BAY
    assert raster[_pixel(grid, -122.372, 37.79)] == ID_OPEN_BAY_INFERRED  # rest of the gap


def test_thin_pier_removed_from_water_is_inferred_open_bay_in_the_raster(tmp_path):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem_with_block(tmp_path / "dem.tif", grid, 0.0, (-122.38200, 37.780, -122.38175, 37.783),
                          5.0, tag_nodata=None)
    hab = _habitat_collection(tmp_path)
    out = tmp_path / "out"
    assert main(["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX),
                 "--out", str(out), "--habitats", str(hab)]) == 0
    meta = json.loads((out / "meta.json").read_text())
    assert _habitat(out, meta)[_pixel(grid, -122.381875, 37.7815)] == ID_OPEN_BAY_INFERRED


# -------------------------------------------------------------- --region ---

def _region_setup(tmp_path, **overrides):
    """A tmp pipeline dir with a DEM, a bay and a region file; returns (region_path, grid)."""
    pipe = tmp_path / "pipeline"
    (pipe / "regions").mkdir(parents=True)
    (pipe / "data").mkdir()
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem(pipe / "data" / "dem.tif", grid, 5.0)
    _write_bay_geojson(pipe / "data" / "bay.geojson", -122.40, 37.77, -122.38, 37.79)
    region = {"name": "t", "bbox": list(BBOX), "cell_m": 10, "dem": "data/dem.tif",
              "bay": "data/bay.geojson", "out": "build/out", **overrides}
    path = pipe / "regions" / "t.json"
    path.write_text(json.dumps(region))
    return path, grid


def test_region_alone_runs_the_pipeline(tmp_path):
    path, grid = _region_setup(tmp_path)
    assert main(["--region", str(path)]) == 0
    out = tmp_path / "pipeline" / "build" / "out"
    meta = json.loads((out / "meta.json").read_text())
    assert abs(_read_heights(out, meta)[_pixel(grid, -122.39, 37.78)] - (-3.0)) < 0.01
    assert "water" in [l["id"] for l in meta["layers"]]


def test_cli_flags_override_region_values(tmp_path):
    path, _ = _region_setup(tmp_path, smooth_m=20, shelf_m=90, shore_open_cells=3)
    assert main(["--region", str(path), "--out", str(tmp_path / "o1")]) == 0
    proc = json.loads((tmp_path / "o1" / "meta.json").read_text())["processing"]
    assert proc["smooth_m"] == 20 and proc["shelf_m"] == 90 and proc["shore_open_cells"] == 3
    assert proc["shore_slope"] == 0.30  # region None/absent: CLI default

    assert main(["--region", str(path), "--out", str(tmp_path / "o2"),
                 "--smooth-m", "5", "--shore-open-cells", "0", "--cell", "20"]) == 0
    meta = json.loads((tmp_path / "o2" / "meta.json").read_text())
    assert meta["processing"]["smooth_m"] == 5 and meta["processing"]["shore_open_cells"] == 0
    assert meta["processing"]["shelf_m"] == 90  # still from the region
    assert meta["cell_m"] == 20  # CLI --cell beat the region's cell_m 10
    assert not (tmp_path / "pipeline" / "build").exists()  # --out replaced the region's out


def test_parse_args_merges_region_defaults_and_overrides(tmp_path):
    path, _ = _region_setup(tmp_path, hand_bay=["data/a.geojson"],
                            hand_marsh=["data/m.geojson"], habitats="data/h.geojson")
    base = tmp_path / "pipeline"
    a = parse_args(["--region", str(path)])
    assert a.dem == base / "data/dem.tif" and a.out == base / "build/out"
    assert tuple(a.bbox) == BBOX and a.cell == 10.0
    assert a.hand_bay == [base / "data/a.geojson"] and a.hand_marsh == [base / "data/m.geojson"]
    assert a.habitats == base / "data/h.geojson"
    assert a.smooth_m == 30.0 and a.shelf_m == 150.0  # untouched defaults

    b = parse_args(["--region", str(path), "--hand-bay", "x.geojson", "y.geojson",
                    "--bbox", "1", "2", "3", "4", "--habitats", "z.geojson"])
    assert b.hand_bay == [Path("x.geojson"), Path("y.geojson")]  # replaced, not appended
    assert b.bbox == [1.0, 2.0, 3.0, 4.0] and b.habitats == Path("z.geojson")
    assert b.hand_marsh == [base / "data/m.geojson"]
    # Form --region=FILE works too.
    assert parse_args([f"--region={path}"]).dem == base / "data/dem.tif"


def test_parse_args_without_region_is_the_old_interface(tmp_path):
    a = parse_args(["--dem", "d.tif", "--bbox", "1", "2", "3", "4", "--out", "o"])
    assert a.dem == Path("d.tif") and a.hand_bay == [] and a.hand_marsh == []
    assert a.habitats is None and a.cell == 10.0 and a.region is None


@pytest.mark.parametrize("given, missing", [
    ([], ["--dem", "--bbox", "--out"]),
    (["--dem", "d.tif", "--bbox", "1", "2", "3", "4"], ["--out"]),
    (["--dem", "d.tif", "--out", "o"], ["--bbox"]),
    (["--bbox", "1", "2", "3", "4", "--out", "o"], ["--dem"]),
])
def test_missing_required_inputs_is_a_clear_parser_error(capsys, given, missing):
    with pytest.raises(SystemExit) as exc:
        main(given)
    assert exc.value.code == 2
    err = capsys.readouterr().err
    assert "missing" in err and all(m in err for m in missing)


def test_a_broken_region_file_is_a_parser_error_naming_the_file(tmp_path, capsys):
    path, _ = _region_setup(tmp_path, nope=1)
    with pytest.raises(SystemExit) as exc:
        main(["--region", str(path)])
    assert exc.value.code == 2
    err = capsys.readouterr().err
    assert "t.json" in err and "nope" in err

    with pytest.raises(SystemExit) as exc:
        main(["--region", str(tmp_path / "absent.json")])
    assert exc.value.code == 2 and "absent.json" in capsys.readouterr().err


def test_region_checks_run_and_can_fail(tmp_path):
    pipe = tmp_path / "pipeline"
    path, _ = _region_setup(tmp_path, checks="data/checks.json")
    (pipe / "data" / "checks.json").write_text(json.dumps(
        [{"name": "needs a hill", "lon": -122.415, "lat": 37.76, "min_m": 60.0}]))
    assert main(["--region", str(path)]) == 2
