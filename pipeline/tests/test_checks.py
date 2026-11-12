import json

import numpy as np
import pytest

from yelamu.checks import Expectation, load_expectations, run_checks
from yelamu.geo import Grid, lonlat_to_utm
from yelamu.terrain import LAND_FLOOR_M, MARSH_LEVEL_M, WATER_LEVEL_M

LON, LAT = -122.40, 37.78


def _grid():
    x, y = lonlat_to_utm(LON, LAT)
    return Grid(west=x - 50, south=y - 50, east=x + 50, north=y + 50, cell=10)


def _run(height, **kw):
    grid = _grid()
    dem = np.full((grid.height, grid.width), height, dtype="float32")
    return run_checks(dem, grid, [Expectation("spot", LON, LAT, **kw)])


@pytest.mark.parametrize("h, ok", [(-3.0, True), (MARSH_LEVEL_M, True), (0.59, True),
                                   (WATER_LEVEL_M, False), (LAND_FLOOR_M, False), (40.0, False)])
def test_expect_water_true_needs_height_below_the_water_level(h, ok):
    failures = _run(h, expect_water=True)
    assert (failures == []) is ok
    if not ok:
        assert "spot" in failures[0] and "water" in failures[0]


@pytest.mark.parametrize("h, ok", [(40.0, True), (LAND_FLOOR_M, True), (0.99, False),
                                   (WATER_LEVEL_M, False), (-3.0, False)])
def test_expect_water_false_needs_dry_land(h, ok):
    failures = _run(h, expect_water=False)
    assert (failures == []) is ok


def test_expect_water_combines_with_bounds_and_none_is_ignored():
    assert _run(-3.0, expect_water=True, max_m=1.0) == []
    assert len(_run(-3.0, expect_water=True, min_m=0.0)) == 1
    assert _run(5.0) == []


def test_non_boolean_expect_water_is_rejected():
    with pytest.raises(ValueError, match="expect_water"):
        Expectation("x", 0, 0, expect_water="yes")


def test_expect_pond():
    grid = _grid()
    dem = np.full((grid.height, grid.width), 5.0, dtype="float32")
    pond = np.zeros(dem.shape, dtype=bool)
    pond[grid.pixel_of(*lonlat_to_utm(LON, LAT))] = True
    yes = [Expectation("lake", LON, LAT, expect_pond=True)]
    no = [Expectation("hill", LON, LAT, expect_pond=False)]
    assert run_checks(dem, grid, yes, pond) == []
    assert "not inside any pond" in run_checks(dem, grid, yes, np.zeros_like(pond))[0]
    assert "not inside any pond" in run_checks(dem, grid, yes)[0]  # no ponds built at all
    assert "inside a pond" in run_checks(dem, grid, no, pond)[0]
    assert run_checks(dem, grid, no) == []


def test_load_expectations_reads_the_new_keys(tmp_path):
    path = tmp_path / "c.json"
    path.write_text(json.dumps([
        {"name": "a", "lon": 1, "lat": 2, "expect_water": True},
        {"name": "b", "lon": 1, "lat": 2, "expect_pond": True, "min_m": 0}]))
    a, b = load_expectations(path)
    assert a.expect_water is True and b.expect_pond is True and b.min_m == 0
