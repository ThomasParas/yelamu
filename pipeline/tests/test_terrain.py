import numpy as np
import pytest

from yelamu.geo import Grid
from yelamu.terrain import apply_historical_water, fill_missing_land, stamp_landform


def test_fill_inside_bay_is_lowered_to_bay_floor():
    dem = np.full((4, 4), 5.0, dtype="float32")  # modern fill, 5 m above sea level
    bay = np.zeros((4, 4), dtype=bool)
    bay[:, :2] = True
    marsh = np.zeros((4, 4), dtype=bool)
    out = apply_historical_water(dem, bay, marsh, bay_floor=-3.0)
    assert (out[:, :2] == -3.0).all()
    assert (out[:, 2:] == 5.0).all()  # dry land is untouched


def test_marsh_is_set_to_marsh_level_and_bay_wins_overlap():
    dem = np.full((2, 2), 4.0, dtype="float32")
    bay = np.array([[True, False], [False, False]])
    marsh = np.array([[True, True], [False, False]])
    out = apply_historical_water(dem, bay, marsh, bay_floor=-3.0, marsh_level=0.5)
    assert out[0, 0] == -3.0  # overlap: bay wins
    assert out[0, 1] == 0.5  # marsh only
    assert out[1, 0] == 4.0 and out[1, 1] == 4.0


def test_dry_land_is_never_below_sea_level():
    dem = np.array([[-2.0, 3.0]], dtype="float32")
    none = np.zeros((1, 2), dtype=bool)
    out = apply_historical_water(dem, none, none)
    assert out[0, 0] == 0.0 and out[0, 1] == 3.0


def test_stamp_raises_centre_and_leaves_far_cells_alone():
    grid = Grid(west=0, south=0, east=200, north=200, cell=10)  # 20 x 20
    dem = np.zeros((20, 20), dtype="float32")
    # (105, 95) is the exact centre of the cell at row 10, col 10.
    out = stamp_landform(dem, grid, x=105, y=95, radius_m=50, delta_m=20)
    assert out[10, 10] == pytest.approx(20.0, abs=1e-4)
    assert out[0, 0] == 0.0  # well outside the radius
    assert out[10, 10] > out[10, 12] > out[10, 14] >= 0.0  # smooth falloff


def test_negative_delta_lowers_ground():
    grid = Grid(west=0, south=0, east=200, north=200, cell=10)
    dem = np.full((20, 20), 30.0, dtype="float32")
    out = stamp_landform(dem, grid, x=105, y=95, radius_m=50, delta_m=-20)
    assert out[10, 10] == pytest.approx(10.0, abs=1e-4)
    assert out[0, 0] == 30.0


def test_apply_historical_water_overwrites_nan_under_water_and_keeps_land_nan():
    dem = np.array([[np.nan, np.nan, np.nan, 4.0]], dtype="float32")
    bay = np.array([[True, False, False, False]])
    marsh = np.array([[False, True, False, False]])
    out = apply_historical_water(dem, bay, marsh, bay_floor=-3.0, marsh_level=0.5)
    assert out[0, 0] == -3.0
    assert out[0, 1] == 0.5
    assert np.isnan(out[0, 2])  # dry land with no data stays missing
    assert out[0, 3] == 4.0


def test_fill_missing_land_without_nan_is_unchanged():
    dem = np.array([[1.0, 2.0], [3.0, 4.0]], dtype="float64")
    out = fill_missing_land(dem)
    assert out.dtype == np.float32
    assert np.array_equal(out, dem.astype("float32"))


def test_fill_missing_land_fills_small_gaps_with_zero_and_copies():
    dem = np.full((10, 10), 5.0, dtype="float32")
    dem[0, 0] = np.nan  # 1 %
    out = fill_missing_land(dem)
    assert out[0, 0] == 0.0 and out[1, 1] == 5.0
    assert np.isnan(dem[0, 0])  # input not mutated


def test_fill_missing_land_rejects_large_gaps():
    dem = np.full((10, 10), 5.0, dtype="float32")
    dem[:3, :] = np.nan  # 30 %
    with pytest.raises(ValueError, match=r"30\.0%") as exc:
        fill_missing_land(dem)
    assert "--dem-nodata" in str(exc.value)
    fill_missing_land(dem, max_missing_fraction=0.5)  # a looser limit accepts it
