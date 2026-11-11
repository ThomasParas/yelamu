import numpy as np
import pytest

from yelamu.geo import Grid
from yelamu.terrain import (
    BAY_FLOOR_M,
    LAND_FLOOR_M,
    MARSH_LEVEL_M,
    WATER_LEVEL_M,
    apply_bay_shelf,
    apply_historical_water,
    fill_missing_land,
    smooth_land,
    stamp_landform,
)


def test_level_constants_keep_land_above_water_and_marsh_below_it():
    assert LAND_FLOOR_M > WATER_LEVEL_M > MARSH_LEVEL_M > BAY_FLOOR_M



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


def test_dry_land_is_never_below_the_land_floor():
    dem = np.array([[-2.0, 0.5, 3.0]], dtype="float32")
    none = np.zeros((1, 3), dtype=bool)
    out = apply_historical_water(dem, none, none)
    assert out[0, 0] == LAND_FLOOR_M and out[0, 1] == LAND_FLOOR_M and out[0, 2] == 3.0
    assert (out > WATER_LEVEL_M).all()  # dry land can never render as water


def test_defaults_use_the_shared_constants():
    dem = np.full((1, 3), 4.0, dtype="float32")
    bay = np.array([[True, False, False]])
    marsh = np.array([[False, True, False]])
    out = apply_historical_water(dem, bay, marsh)
    assert out[0, 0] == BAY_FLOOR_M and out[0, 1] == MARSH_LEVEL_M and out[0, 2] == 4.0


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


def test_fill_missing_land_fills_small_gaps_with_land_floor_and_copies():
    dem = np.full((10, 10), 5.0, dtype="float32")
    dem[0, 0] = np.nan  # 1 %
    out = fill_missing_land(dem)
    assert out[0, 0] == LAND_FLOOR_M and out[1, 1] == 5.0
    assert np.isnan(dem[0, 0])  # input not mutated


def test_fill_missing_land_rejects_large_gaps():
    dem = np.full((10, 10), 5.0, dtype="float32")
    dem[:3, :] = np.nan  # 30 %
    with pytest.raises(ValueError, match=r"30\.0%") as exc:
        fill_missing_land(dem)
    assert "--dem-nodata" in str(exc.value)
    fill_missing_land(dem, max_missing_fraction=0.5)  # a looser limit accepts it


# ------------------------------------------------------------- smooth_land ---


def test_smooth_land_removes_a_narrow_trench_but_keeps_a_broad_hill():
    plain = np.full((100, 100), 10.0, dtype="float32")
    plain[:, 20] = 5.0  # a one-cell-wide, 5 m deep 'street'
    out = smooth_land(plain, 3.0)
    assert 10.0 - out[50, 20] < 0.2 * 5.0  # trench lost most (>80%) of its depth

    hill = np.zeros((100, 100), dtype="float32")
    hill[30:70, 30:70] = 20.0  # a 40-cell-wide hill
    out = smooth_land(hill, 3.0)
    assert out[50, 50] > 0.95 * 20.0


def test_smooth_land_constant_field_stays_constant():
    dem = np.full((30, 30), 7.25, dtype="float32")
    out = smooth_land(dem, 4.0)
    assert out.dtype == np.float32
    assert np.abs(out - 7.25).max() <= np.finfo("float32").eps * 8


def test_smooth_land_sigma_zero_is_a_copy():
    dem = np.random.default_rng(0).uniform(0, 10, (12, 12)).astype("float32")
    out = smooth_land(dem, 0.0)
    assert out.dtype == np.float32
    assert np.array_equal(out, dem) and out is not dem
    assert np.array_equal(smooth_land(dem, -1.0), dem)


def test_smooth_land_nan_stays_nan_and_does_not_leak():
    rng = np.random.default_rng(1)
    dem = rng.uniform(0, 10, (20, 20)).astype("float32")
    dem[5:8, 5:8] = np.nan
    out = smooth_land(dem, 2.0)
    assert np.isnan(out[5:8, 5:8]).all()
    assert np.isfinite(out[~np.isnan(dem)]).all()
    # Same result as explicitly declaring the NaN cells invalid.
    explicit = smooth_land(np.where(np.isnan(dem), 0.0, dem).astype("float32"), 2.0,
                           valid=~np.isnan(dem))
    ok = ~np.isnan(dem)
    assert np.allclose(out[ok], explicit[ok], atol=1e-5)


def test_smooth_land_cells_outside_valid_are_untouched_and_do_not_contaminate():
    dem = np.full((20, 20), 10.0, dtype="float32")
    dem[:, 10:] = -50.0  # 'water' with a very low value
    valid = np.zeros((20, 20), dtype=bool)
    valid[:, :10] = True
    out = smooth_land(dem, 3.0, valid=valid)
    assert np.array_equal(out[~valid], dem[~valid])  # bit-identical
    assert np.abs(out[valid] - 10.0).max() < 1e-5  # nothing pulled down near the shore


# --------------------------------------------------------- apply_bay_shelf ---


def _shore_strip(width=60):
    """Land in the first 5 columns, bay everywhere else (3 rows)."""
    dem = np.full((3, width), 4.0, dtype="float32")
    bay = np.ones((3, width), dtype=bool)
    bay[:, :5] = False
    return dem, bay


def test_bay_shelf_deepens_monotonically_away_from_shore():
    dem, bay = _shore_strip()
    out = apply_bay_shelf(dem, bay, cell_m=10.0, shelf_m=150.0)
    row = out[1, 5:]
    assert (np.diff(row) <= 1e-6).all()
    assert row[0] > row[-1]


def test_bay_shelf_first_cell_is_near_the_water_surface():
    dem, bay = _shore_strip()
    out = apply_bay_shelf(dem, bay, cell_m=10.0, shelf_m=150.0)
    assert abs(out[1, 5] - WATER_LEVEL_M) < 0.5
    assert out[1, 5] < WATER_LEVEL_M  # but still below the plane, so it is drawn as water


def test_bay_shelf_reaches_the_floor_beyond_shelf_distance():
    dem, bay = _shore_strip(width=60)
    out = apply_bay_shelf(dem, bay, cell_m=10.0, shelf_m=150.0)
    # Last land cell is col 4; col 19 is 15 cells = 150 m from it.
    assert (out[:, 19:] == BAY_FLOOR_M).all()
    assert out[1, 18] > BAY_FLOOR_M


def test_bay_shelf_leaves_non_bay_cells_untouched():
    dem, bay = _shore_strip()
    out = apply_bay_shelf(dem, bay, cell_m=10.0)
    assert out.dtype == np.float32
    assert np.array_equal(out[~bay], dem[~bay])


def test_bay_shelf_edge_cases():
    dem = np.full((4, 4), 3.0, dtype="float32")
    all_bay = np.ones((4, 4), dtype=bool)
    assert (apply_bay_shelf(dem, all_bay, 10.0) == BAY_FLOOR_M).all()

    none = np.zeros((4, 4), dtype=bool)
    out = apply_bay_shelf(dem, none, 10.0)
    assert np.array_equal(out, dem) and out is not dem

    dem2, bay2 = _shore_strip()
    flat = apply_bay_shelf(dem2, bay2, 10.0, shelf_m=0.0)
    assert (flat[bay2] == BAY_FLOOR_M).all()
    assert np.array_equal(flat[~bay2], dem2[~bay2])
