import pytest

from yelamu.geo import Grid, lonlat_to_utm


def test_central_meridian_maps_to_false_easting():
    # UTM zone 10N has its central meridian at 123 W, with a false easting of 500000 m.
    x, y = lonlat_to_utm(-123.0, 0.0)
    assert x == pytest.approx(500000.0, abs=0.01)
    assert y == pytest.approx(0.0, abs=0.01)


def test_grid_is_a_whole_number_of_cells():
    g = Grid.from_lonlat_bbox(-122.42, 37.755, -122.37, 37.805, cell=10)
    assert g.east - g.west == pytest.approx(g.width * 10)
    assert g.north - g.south == pytest.approx(g.height * 10)
    # ~0.05 degrees is roughly 4.4 km east-west and 5.5 km north-south.
    assert 400 < g.width < 500
    assert 500 < g.height < 600


def test_pixel_lookup():
    g = Grid(west=1000, south=2000, east=1100, north=2100, cell=10)
    assert g.pixel_of(1005, 2095) == (0, 0)  # north-west corner cell
    assert g.pixel_of(1095, 2005) == (9, 9)  # south-east corner cell
    assert g.pixel_of(5000, 5000) is None
