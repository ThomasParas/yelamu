import numpy as np
from shapely.geometry import box

from yelamu.geo import Grid
from yelamu.water import unmapped_open_water, water_mask

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
