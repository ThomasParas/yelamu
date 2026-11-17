import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import box

from yelamu.context import (
    OPEN_WATER_M,
    apply_city_edge,
    apply_context_water,
    build_lattice,
    flatten_water,
    lattice_transform,
    resample_dem,
    sample_lattice,
)
from yelamu.geo import Grid
from yelamu.terrain import BAY_FLOOR_M, MARSH_LEVEL_M

CITY = Grid.from_lonlat_bbox(-122.53, 37.70, -122.33, 37.84, 500.0)  # a coarse stand-in city
RING = (-122.60, 37.58, -122.05, 37.93)
HW = (CITY.width - 1) * CITY.cell / 2
HD = (CITY.height - 1) * CITY.cell / 2


def _lattice(target=2000.0):
    return build_lattice(CITY, RING, target)


def test_hole_edges_land_exactly_on_lattice_lines():
    lat = _lattice()
    assert lat.x(lat.i0) == pytest.approx(-HW)
    assert lat.x(lat.i1) == pytest.approx(HW)
    assert lat.z(lat.j0) == pytest.approx(-HD)
    assert lat.z(lat.j1) == pytest.approx(HD)
    assert lat.i1 > lat.i0 and lat.j1 > lat.j0


def test_spacing_is_close_to_the_target_and_square_enough():
    lat = _lattice(2000.0)
    assert abs(lat.dx - 2000.0) < 300 and abs(lat.dz - 2000.0) < 300


def test_lattice_covers_the_ring_bbox():
    lat = _lattice()
    from yelamu.context import world_of_lonlat

    xs, zs = zip(*(world_of_lonlat(CITY, lon, lat_) for lon in (RING[0], RING[2]) for lat_ in (RING[1], RING[3])))
    assert lat.x(0) <= min(xs) and lat.x(lat.cols - 1) >= max(xs)
    assert lat.z(0) <= min(zs) and lat.z(lat.rows - 1) >= max(zs)


def test_ring_bbox_must_contain_the_city():
    with pytest.raises(ValueError, match="must contain the city"):
        build_lattice(CITY, (-122.50, 37.60, -122.05, 37.93), 2000.0)


def _write_utm_ramp(path):
    """A UTM DEM whose height is (E - 520000) / 100 metres: a plane rising to the east."""
    west, north, pixel, width, height = 520_000.0, 4_210_000.0, 100.0, 800, 600
    xs = west + (np.arange(width) + 0.5) * pixel
    data = np.tile(((xs - 520_000.0) / 100.0).astype("float32"), (height, 1))
    with rasterio.open(
        path, "w", driver="GTiff", height=height, width=width, count=1, dtype="float32",
        crs="EPSG:32610", transform=from_origin(west, north, pixel, pixel), nodata=-999999.0,
    ) as dst:
        dst.write(data, 1)


def test_resample_matches_a_plane(tmp_path):
    dem = tmp_path / "ramp.tif"
    _write_utm_ramp(dem)
    lat = _lattice()
    out = resample_dem(dem, CITY, lat)
    assert out.shape == (lat.rows, lat.cols)
    ec = (CITY.west + CITY.east) / 2
    for i, j in [(0, 0), (lat.cols - 1, 3), (lat.i0, lat.j0), (7, lat.rows - 1)]:
        expected = (ec + lat.x(i) - 520_000.0) / 100.0
        assert out[j, i] == pytest.approx(expected, abs=1.0)


def test_resample_refuses_missing_data(tmp_path):
    dem = tmp_path / "small.tif"
    with rasterio.open(
        dem, "w", driver="GTiff", height=10, width=10, count=1, dtype="float32",
        crs="EPSG:32610", transform=from_origin(540_000.0, 4_180_000.0, 100.0, 100.0), nodata=-999999.0,
    ) as dst:
        dst.write(np.zeros((10, 10), dtype="float32"), 1)
    with pytest.raises(ValueError, match="no elevation data"):
        resample_dem(dem, CITY, _lattice())


def test_flatten_water_sets_open_water_to_the_bay_floor():
    h = np.array([[-5.0, 0.0, OPEN_WATER_M, OPEN_WATER_M + 0.01, 12.0]], dtype="float32")
    out = flatten_water(h)
    assert out.tolist() == [[BAY_FLOOR_M, BAY_FLOOR_M, BAY_FLOOR_M, pytest.approx(OPEN_WATER_M + 0.01), 12.0]]
    assert h[0, 0] == -5.0  # the input is not modified


def test_city_edge_heights_are_copied_onto_the_hole_boundary_only():
    lat = _lattice()
    # A stand-in city whose height depends on BOTH row and column (bilinear is exact on it).
    city = np.zeros((CITY.height, CITY.width), dtype="float64")
    for r in range(CITY.height):
        for c in range(CITY.width):
            city[r, c] = r * 1000.0 + c
    ring = np.zeros((lat.rows, lat.cols), dtype="float32")
    out = apply_city_edge(ring, lat, city, CITY.cell)

    def analytic(i, j):
        col = lat.x(i) / CITY.cell + (CITY.width - 1) / 2.0
        row = lat.z(j) / CITY.cell + (CITY.height - 1) / 2.0
        return row * 1000.0 + col

    jm = (lat.j0 + lat.j1) // 2
    im = (lat.i0 + lat.i1) // 2
    assert lat.j0 < jm < lat.j1 and lat.i0 < im < lat.i1
    boundary = [
        (lat.i0, lat.j0), (lat.i1, lat.j0), (lat.i0, lat.j1), (lat.i1, lat.j1),  # corners
        (lat.i0, jm), (lat.i0, jm + 1),  # west edge, middle
        (lat.i1, jm), (lat.i1, jm + 1),  # east edge, middle
        (im, lat.j0), (im + 1, lat.j0),  # north edge, middle
        (im, lat.j1), (im + 1, lat.j1),  # south edge, middle
    ]
    for i, j in boundary:
        assert out[j, i] == pytest.approx(analytic(i, j), abs=1e-2), (i, j)
    # Sanity: the field really varies along both axes on the edges.
    assert out[jm, lat.i0] != out[jm + 1, lat.i0]  # west edge varies with z
    assert out[lat.j0, im] != out[lat.j0, im + 1]  # north edge varies with x
    assert out[lat.j0, lat.i0] == pytest.approx(0.0)  # north-west corner = city (0, 0)
    assert out[lat.j1, lat.i1] == pytest.approx((CITY.height - 1) * 1000.0 + CITY.width - 1)
    assert out[lat.j0 + 1, lat.i0 + 1] == 0.0  # interior untouched
    assert out[0, 0] == 0.0  # outside untouched
    assert ring.max() == 0.0  # the input is not modified
    # Exactly the hole boundary changed: every other vertex is still zero.
    changed = np.argwhere(out != 0.0)
    for j, i in changed:
        assert (lat.i0 <= i <= lat.i1 and lat.j0 <= j <= lat.j1) and (
            i in (lat.i0, lat.i1) or j in (lat.j0, lat.j1)
        ), (i, j)


def test_water_polygons_set_bay_and_marsh_and_bay_wins():
    lat = _lattice()
    ec = (CITY.west + CITY.east) / 2
    nc = (CITY.north + CITY.south) / 2

    # Each box covers a few vertices: the marsh box columns 3..5, the bay box columns 5..7,
    # both rows 3..7 (so column 5 is covered by both).
    def utm_box(i0, i1):
        return box(
            ec + lat.x(i0) - lat.dx / 2 + 1, nc - lat.z(7) - lat.dz / 2 + 1,
            ec + lat.x(i1) + lat.dx / 2 - 1, nc - lat.z(3) + lat.dz / 2 - 1,
        )
    heights = np.full((lat.rows, lat.cols), 20.0, dtype="float32")
    out = apply_context_water(heights, CITY, lat, bay=[utm_box(5, 7)], marsh=[utm_box(3, 5)])
    assert out[5, 3] == pytest.approx(MARSH_LEVEL_M)  # marsh only
    assert out[5, 6] == pytest.approx(BAY_FLOOR_M)  # bay only
    assert out[5, 5] == pytest.approx(BAY_FLOOR_M)  # both: bay wins
    assert out[5, 9] == 20.0  # outside both
    assert heights[5, 3] == 20.0  # the input is not modified


def test_sample_lattice_is_bilinear():
    lat = _lattice()
    h = np.zeros((lat.rows, lat.cols), dtype="float64")
    h[4, 6] = 10.0
    h[4, 7] = 20.0
    h[5, 6] = 30.0
    assert sample_lattice(h, lat, lat.x(6), lat.z(4)) == pytest.approx(10.0)
    assert sample_lattice(h, lat, lat.x(6) + lat.dx / 2, lat.z(4)) == pytest.approx(15.0)
    # Between rows: vertices (col 6, row 4) = 10 and (col 6, row 5) = 30, midpoint 20.
    assert sample_lattice(h, lat, lat.x(6), lat.z(4) + lat.dz / 2) == pytest.approx(20.0)
    # Centre of the cell with corners 10, 20, 30, 0.
    assert sample_lattice(h, lat, lat.x(6) + lat.dx / 2, lat.z(4) + lat.dz / 2) == pytest.approx(15.0)
    # Outside the lattice clamps to the nearest edge vertex instead of failing.
    assert sample_lattice(h, lat, lat.x(0) - 1e6, lat.z(0) - 1e6) == pytest.approx(h[0, 0])


def test_lattice_transform_puts_pixel_centres_on_vertices():
    lat = _lattice()
    t = lattice_transform(CITY, lat)
    ec = (CITY.west + CITY.east) / 2
    nc = (CITY.north + CITY.south) / 2
    e, n = t @ (4 + 0.5, 9 + 0.5)
    assert e == pytest.approx(ec + lat.x(4))
    assert n == pytest.approx(nc - lat.z(9))
