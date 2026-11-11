import numpy as np
from shapely.geometry import box

from yelamu.geo import Grid
from yelamu.water import water_mask

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
