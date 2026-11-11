"""End-to-end test on synthetic data: a flat 'modern fill' DEM with a historical bay."""

import json

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import Point

from yelamu.checks import Expectation, run_checks
from yelamu.cli import main
from yelamu.export import dequantize_heights
from yelamu.geo import UTM_CRS, Grid, lonlat_to_utm
from yelamu.terrain import WATER_LEVEL_M
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
          "--bay", str(tmp_path / "bay.geojson"), "--landforms", str(tmp_path / "lf.json")])

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
