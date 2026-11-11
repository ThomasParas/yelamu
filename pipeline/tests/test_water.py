import numpy as np
from shapely.geometry import box

from yelamu.geo import Grid
from yelamu.water import remove_thin_unmapped_land, unmapped_open_water, water_mask

GRID = Grid(west=0, south=0, east=100, north=100, cell=10)  # 10 x 10 cells


def test_polygon_over_west_half_masks_west_half():
    mask = water_mask([box(0, 0, 50, 100)], GRID)
    assert mask.shape == (10, 10)
    assert mask[:, :5].all()
    assert not mask[:, 5:].any()


def test_no_polygons_gives_empty_mask():
    mask = water_mask([], GRID)
    assert mask.shape == (10, 10)
    assert not mask.any()


def test_north_is_row_zero():
    # A polygon over the northern 20 m must light up the first two rows.
    mask = water_mask([box(0, 80, 100, 100)], GRID)
    assert mask[:2].all()
    assert not mask[2:].any()
    assert np.count_nonzero(mask) == 20


# ------------------------------------------------------- unmapped_open_water ---


def _cells(*values):
    return np.array([values], dtype="float32")


def test_unmapped_open_water_covered_cell_is_never_flagged():
    covered = np.array([[True]])
    assert not unmapped_open_water(_cells(0.0), covered)[0, 0]


def test_unmapped_open_water_flags_uncovered_low_cell():
    assert unmapped_open_water(_cells(0.0), np.array([[False]]))[0, 0]


def test_unmapped_open_water_leaves_uncovered_high_cell_as_land():
    assert not unmapped_open_water(_cells(10.0), np.array([[False]]))[0, 0]


def test_unmapped_open_water_flags_uncovered_nan():
    assert unmapped_open_water(_cells(np.nan), np.array([[False]]))[0, 0]


def test_unmapped_open_water_covered_nan_is_not_flagged():
    assert not unmapped_open_water(_cells(np.nan), np.array([[True]]))[0, 0]


def test_unmapped_open_water_respects_threshold():
    dem = _cells(-1.0, 0.5, 0.6, 2.0)
    none_covered = np.zeros((1, 4), dtype=bool)
    assert unmapped_open_water(dem, none_covered).tolist() == [[True, True, False, False]]
    assert unmapped_open_water(dem, none_covered, max_m=2.0).tolist() == [
        [True, True, True, True]
    ]
    assert unmapped_open_water(dem, none_covered, max_m=-2.0).tolist() == [
        [False, False, False, False]
    ]


# ------------------------------------------------- remove_thin_unmapped_land ---


def _land_with_pier():
    """30 x 30: a big landmass (rows 15-29) and a 2-cell-wide pier going north."""
    land = np.zeros((30, 30), dtype=bool)
    land[15:, :] = True
    land[5:15, 10:12] = True  # the pier, rows 5-14, cols 10-11
    return land


def test_thin_pier_in_unmapped_region_is_removed_but_landmass_is_not():
    land = _land_with_pier()
    unmapped = np.ones_like(land)
    removed = remove_thin_unmapped_land(land, unmapped, 2)
    assert removed[5:14, 10:12].all()
    assert not removed[15:, :].any()  # the big landmass survives


def test_thin_pier_in_covered_region_is_not_returned():
    land = _land_with_pier()
    unmapped = np.ones_like(land)
    unmapped[:15, :] = False  # SFEI mapped the pier's area
    assert not remove_thin_unmapped_land(land, unmapped, 2).any()


def test_single_cell_speck_is_removed():
    land = np.zeros((20, 20), dtype=bool)
    land[10, 10] = True
    removed = remove_thin_unmapped_land(land, np.ones_like(land), 2)
    assert removed[10, 10] and removed.sum() == 1


def test_radius_zero_removes_nothing():
    land = _land_with_pier()
    removed = remove_thin_unmapped_land(land, np.ones_like(land), 0)
    assert removed.dtype == bool and not removed.any()


def test_large_land_straddling_covered_boundary_is_not_eroded():
    land = np.zeros((40, 40), dtype=bool)
    land[10:30, 10:30] = True
    unmapped = np.zeros_like(land)
    unmapped[:, 20:] = True  # boundary runs through the middle of the land
    removed = remove_thin_unmapped_land(land, unmapped, 2)
    # Only the rounded outer corners (which a disk opening always trims) may go; the
    # boundary itself, mid-way along the land, is left alone.
    assert not removed[:, 16:24].any()
    assert removed.sum() <= 6


def test_large_land_touching_the_grid_edge_is_not_eroded():
    land = np.zeros((30, 30), dtype=bool)
    land[:, :15] = True  # land runs right off the west, north and south edges
    assert not remove_thin_unmapped_land(land, np.ones_like(land), 2).any()
