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
    apply_land_ramp,
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


# --------------------------------------------------------- apply_land_ramp ---


def _plateau(width=120, plateau=12.0):
    """Bay in the first 10 columns, a flat `plateau` m of land east of it (3 rows)."""
    dem = np.full((3, width), plateau, dtype="float32")
    water = np.zeros((3, width), dtype=bool)
    water[:, :10] = True
    dem[water] = -3.0
    return dem, water


def test_land_ramp_caps_height_by_distance_from_water():
    dem, water = _plateau()
    out = apply_land_ramp(dem, water, cell_m=10.0, slope_cap=0.15)
    assert out.dtype == np.float32
    dist = (np.arange(dem.shape[1]) - 9) * 10.0  # metres from the last water column
    row = out[1]
    land = ~water[1]
    assert (row[land] <= LAND_FLOOR_M + 0.15 * dist[land] + 1e-4).all()
    # Rises monotonically with distance until it meets the plateau.
    on_ramp = land & (row < 12.0 - 1e-6)
    assert on_ramp.sum() > 3
    assert (np.diff(row[land]) >= -1e-6).all()
    assert row[10] == pytest.approx(LAND_FLOOR_M + 0.15 * 10.0, abs=1e-4)


def test_land_ramp_leaves_far_inland_cells_untouched():
    dem, water = _plateau()
    out = apply_land_ramp(dem, water, cell_m=10.0, slope_cap=0.15)
    reach_m = (12.0 - LAND_FLOOR_M) / 0.15  # ~73 m
    dist = (np.arange(dem.shape[1]) - 9) * 10.0
    far = (dist > reach_m) & ~water[1]
    assert far.any()
    assert (out[:, far] == 12.0).all()


def test_land_ramp_never_raises_a_low_land_cell():
    dem, water = _plateau()
    dem[:, 10:14] = 1.0  # already below the cap at 10 m (2.5 m)
    out = apply_land_ramp(dem, water, cell_m=10.0, slope_cap=0.15)
    assert (out[:, 10:14] == 1.0).all()


def test_land_ramp_water_cells_are_unchanged():
    dem, water = _plateau()
    out = apply_land_ramp(dem, water, cell_m=10.0, slope_cap=0.15)
    assert np.array_equal(out[water], dem[water])


def test_land_ramp_treats_marsh_as_water_when_mask_includes_it():
    dem = np.full((3, 40), 12.0, dtype="float32")
    bay = np.zeros((3, 40), dtype=bool)
    marsh = np.zeros((3, 40), dtype=bool)
    marsh[:, :5] = True
    dem[marsh] = 0.5
    out = apply_land_ramp(dem, bay | marsh, cell_m=10.0, slope_cap=0.15)
    assert out[1, 5] == pytest.approx(LAND_FLOOR_M + 0.15 * 10.0, abs=1e-4)
    assert (out[:, :5] == 0.5).all()


def test_land_ramp_preserves_nan():
    dem, water = _plateau()
    dem[1, 20] = np.nan
    out = apply_land_ramp(dem, water, cell_m=10.0, slope_cap=0.15)
    assert np.isnan(out[1, 20])
    assert int(np.isnan(out).sum()) == 1


@pytest.mark.parametrize("slope_cap", [0.0, -1.0])
def test_land_ramp_disabled_returns_unchanged_copy(slope_cap):
    dem, water = _plateau()
    out = apply_land_ramp(dem, water, cell_m=10.0, slope_cap=slope_cap)
    assert out.dtype == np.float32
    assert np.array_equal(out, dem) and out is not dem


def test_land_ramp_edge_cases_no_water_and_all_water():
    dem = np.full((4, 4), 9.0, dtype="float32")
    none = np.zeros((4, 4), dtype=bool)
    out = apply_land_ramp(dem, none, 10.0, 0.15)
    assert np.array_equal(out, dem) and out is not dem
    everything = np.ones((4, 4), dtype=bool)
    out = apply_land_ramp(dem, everything, 10.0, 0.15)
    assert np.array_equal(out, dem) and out is not dem


# ------------------------------------------------------------------ stamp_ridge

from yelamu.terrain import stamp_ridge  # noqa: E402


def _ridge_grid():
    # 41 x 21 cells of 10 m; cell centres at x = 5, 15, ..., 405 and y = 205 .. 5 (row 0 north).
    return Grid(west=0, south=0, east=410, north=210, cell=10)


def _xy_to_rc(x, y):
    return int((210 - y) // 10), int(x // 10)


def test_ridge_peak_is_full_delta_on_the_line_and_zero_outside():
    grid = _ridge_grid()
    dem = np.zeros((grid.height, grid.width), dtype="float32")
    # West-east line along y = 105 (the boundary between rows 9 and 10), x 100..300.
    out = stamp_ridge(dem, grid, [(105, 105), (305, 105)], half_width_m=40, delta_m=12)
    assert out.dtype == np.float32
    # Cell centres on the line (y = 105 is a centre of rows 10: y=105 -> row (210-105)//10 = 10).
    r, c = _xy_to_rc(205, 105)
    assert out[r, c] == pytest.approx(12.0, abs=1e-4)
    # 20 m off the line (half of half_width): raised cosine gives 0.5.
    assert out[r - 2, c] == pytest.approx(6.0, abs=1e-4)
    assert out[r + 2, c] == pytest.approx(6.0, abs=1e-4)  # symmetric
    # At and beyond half_width: exactly zero.
    assert out[r - 4, c] == 0.0 and out[r + 4, c] == 0.0
    assert out[r - 6, c] == 0.0
    # Far along the line, outside the ridge's ends.
    assert out[r, _xy_to_rc(405, 105)[1]] == 0.0


def test_ridge_falloff_matches_raised_cosine():
    grid = _ridge_grid()
    dem = np.zeros((grid.height, grid.width), dtype="float32")
    out = stamp_ridge(dem, grid, [(5, 105), (405, 105)], half_width_m=50, delta_m=10)
    r, c = _xy_to_rc(205, 105)
    for k in range(0, 5):
        d = 10.0 * k
        assert out[r + k, c] == pytest.approx(10 * 0.5 * (1 + np.cos(np.pi * d / 50)), abs=1e-4)


def test_ridge_negative_delta_lowers_and_deltas_add_to_existing_ground():
    grid = _ridge_grid()
    dem = np.full((grid.height, grid.width), 20.0, dtype="float32")
    r, c = _xy_to_rc(205, 105)
    lowered = stamp_ridge(dem, grid, [(105, 105), (305, 105)], 40, -8)
    assert lowered[r, c] == pytest.approx(12.0, abs=1e-4)
    assert lowered[0, 0] == 20.0
    # Two overlapping ridges ADD (like stamp_landform): never max'd or double-clamped.
    twice = stamp_ridge(lowered, grid, [(105, 105), (305, 105)], 40, -8)
    assert twice[r, c] == pytest.approx(4.0, abs=1e-4)
    # The input is not modified.
    assert dem[r, c] == 20.0


def test_ridge_endpoints_have_round_caps_and_a_self_overlapping_line_is_applied_once():
    grid = _ridge_grid()
    dem = np.zeros((grid.height, grid.width), dtype="float32")
    out = stamp_ridge(dem, grid, [(105, 105), (205, 105)], half_width_m=40, delta_m=10)
    r, c_end = _xy_to_rc(205, 105)
    assert out[r, c_end] == pytest.approx(10.0, abs=1e-4)  # on the end point
    # 20 m beyond the end along the axis: distance 20 -> 0.5
    assert out[r, c_end + 2] == pytest.approx(5.0, abs=1e-4)
    assert out[r, c_end + 4] == 0.0
    # A line that doubles back over itself must not stack: still the full delta at most.
    back = stamp_ridge(dem, grid, [(105, 105), (205, 105), (105, 105)], 40, 10)
    assert back.max() == pytest.approx(10.0, abs=1e-4)
    assert np.allclose(back, out)


def test_ridge_diagonal_is_symmetric_about_the_line():
    grid = Grid(west=0, south=0, east=300, north=300, cell=10)
    dem = np.zeros((30, 30), dtype="float32")
    out = stamp_ridge(dem, grid, [(0, 0), (300, 300)], half_width_m=60, delta_m=5)
    # North-up flipped, the array is indexed [y, x]; the line y = x makes it symmetric
    # under swapping x and y (a mirror in the line).
    north_up_flipped = np.flipud(out)
    assert np.allclose(north_up_flipped, north_up_flipped.T, atol=1e-5)
    assert out.max() <= 5.0 + 1e-5 and out.min() >= 0.0


def test_ridge_outside_the_grid_changes_nothing_and_input_validation():
    grid = _ridge_grid()
    dem = np.zeros((grid.height, grid.width), dtype="float32")
    far = stamp_ridge(dem, grid, [(5000, 5000), (6000, 5000)], 40, 9)
    assert (far == 0).all()
    with pytest.raises(ValueError):
        stamp_ridge(dem, grid, [(1, 1)], 40, 9)  # needs two points
    with pytest.raises(ValueError):
        stamp_ridge(dem, grid, [(1, 1), (50, 50)], 0, 9)  # half-width must be > 0
