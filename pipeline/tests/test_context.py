import re
from pathlib import Path

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

import json

from yelamu.context import (
    CONTEXT_FILE,
    CONTEXT_HEIGHTS_FILE,
    build_context,
    context_document,
    load_places,
    patch_meta,
)
from yelamu.export import Layer, dequantize_heights, write_assets
from yelamu.region import load_region


def _place(**over):
    base = {
        "id": "oakland", "name": "Oakland", "kind": "town",
        "lon": -122.27, "lat": 37.80, "source": "test source",
    }
    return {**base, **over}


def _places_file(tmp_path, items):
    path = tmp_path / "places.json"
    path.write_text(json.dumps(items))
    return path


def test_load_places_adds_world_coordinates(tmp_path):
    places = load_places(_places_file(tmp_path, [_place()]), RING, CITY)
    assert [p["id"] for p in places] == ["oakland"]
    p = places[0]
    assert p["x"] > HW  # east of the city map
    assert set(p) >= {"id", "name", "kind", "lon", "lat", "x", "z", "source"}


@pytest.mark.parametrize(
    "item, message",
    [
        (_place(id="Bad Id"), "id"),
        (_place(id="a" * 49), "id"),
        (_place(name="\U0001F600" * 61), "name"),
        (_place(source="\U0001F600" * 151), "source"),
        (_place(name="  "), "name"),
        (_place(name="x" * 121), "name"),
        (_place(kind="city"), "kind"),
        (_place(lon=-123.5), "outside the ring bbox"),
        (_place(lat="37.8"), "lat"),
        (_place(source=""), "source"),
    ],
)
def test_load_places_rejects_bad_items(tmp_path, item, message):
    with pytest.raises(ValueError, match=message):
        load_places(_places_file(tmp_path, [item]), RING, CITY)


def test_load_places_accepts_limit_sized_strings_and_the_island_kind(tmp_path):
    items = [
        _place(id="a" * 48, name="x" * 120, source="y" * 300),
        _place(id="isle", kind="island", name="\U0001F600" * 60),  # 120 UTF-16 units
    ]
    places = load_places(_places_file(tmp_path, items), RING, CITY)
    assert [p["kind"] for p in places] == ["town", "island"]


def test_load_places_rejects_duplicate_and_taken_ids(tmp_path):
    with pytest.raises(ValueError, match="duplicate"):
        load_places(_places_file(tmp_path, [_place(), _place()]), RING, CITY)
    with pytest.raises(ValueError, match="already used"):
        load_places(_places_file(tmp_path, [_place()]), RING, CITY, taken_ids={"oakland"})


def test_patch_meta_adds_the_file_and_one_layer_and_is_idempotent(tmp_path):
    meta = tmp_path / "meta.json"
    meta.write_text(json.dumps({"layers": [{"id": "terrain"}, {"id": "context", "source": "old"}]}))
    layer = {"id": "context", "source": "new", "confidence": "illustrative", "attribution": "a"}
    patch_meta(meta, layer)
    patch_meta(meta, layer)
    data = json.loads(meta.read_text())
    assert data["context_file"] == CONTEXT_FILE
    assert [l["id"] for l in data["layers"]] == ["terrain", "context"]
    assert data["layers"][1]["source"] == "new"


def _mini_world(tmp_path, write_dem=_write_utm_ramp, context_extra=None):
    """A tiny city (500 m cells) already built into out/, a UTM DEM (a ramp unless `write_dem` says
    otherwise), and a region file. `context_extra` adds keys to the region's context block."""
    pipeline = tmp_path / "pipeline"
    (pipeline / "data" / "raw").mkdir(parents=True)
    write_dem(pipeline / "data" / "raw" / "dem.tif")
    city = np.full((CITY.height, CITY.width), 7.0, dtype="float32")
    out = tmp_path / "out"
    write_assets(city, CITY, [Layer("terrain", "test", "inferred", "t")], out)
    (pipeline / "data" / "overlay").mkdir(parents=True)
    (pipeline / "data" / "overlay" / "p.json").write_text(json.dumps([_place()]))
    region = {
        "name": "mini", "bbox": [-122.53, 37.70, -122.33, 37.84], "cell_m": 500,
        "dem": "data/raw/dem.tif", "out": "../out",
        "context": {"bbox": list(RING), "cell_m": 2000, "places": "data/overlay/p.json",
                    **(context_extra or {})},
    }
    (pipeline / "regions").mkdir()
    path = pipeline / "regions" / "mini.json"
    path.write_text(json.dumps(region))
    return load_region(path), out


def test_build_context_writes_a_consistent_document_and_heights(tmp_path):
    region, out = _mini_world(tmp_path)
    doc = build_context(region)
    on_disk = json.loads((out / CONTEXT_FILE).read_text())
    assert on_disk == doc
    assert doc["version"] == 1 and doc["heights_format"] == "uint16-le"
    assert doc["layers"][0]["id"] == "context" and doc["layers"][0]["confidence"] == "illustrative"
    raw = np.fromfile(out / CONTEXT_HEIGHTS_FILE, dtype="<u2")
    assert raw.size == doc["cols"] * doc["rows"]
    heights = dequantize_heights(raw.reshape(doc["rows"], doc["cols"]), doc["min_m"], doc["max_m"])
    hole = doc["hole"]
    # The city's constant 7 m is copied onto the hole boundary (16-bit steps are far finer than 0.1 m).
    assert heights[hole["j0"], hole["i0"]] == pytest.approx(7.0, abs=0.1)
    assert heights[hole["j1"], hole["i1"]] == pytest.approx(7.0, abs=0.1)
    # The place got a ground height from the ring.
    assert doc["places"][0]["id"] == "oakland" and "ground_m" in doc["places"][0]
    meta = json.loads((out / "meta.json").read_text())
    assert meta["context_file"] == CONTEXT_FILE
    assert any(l["id"] == "context" for l in meta["layers"])


def test_build_context_needs_the_city_built_first(tmp_path):
    region, out = _mini_world(tmp_path)
    (out / "meta.json").unlink()
    with pytest.raises(FileNotFoundError, match="build the city first"):
        build_context(region)


def test_build_context_refuses_a_region_without_a_context_key(tmp_path):
    region, _ = _mini_world(tmp_path)
    from dataclasses import replace

    with pytest.raises(ValueError, match="no context key"):
        build_context(replace(region, context=None))


def test_context_document_rejects_a_bad_confidence():
    lat = _lattice()
    with pytest.raises(ValueError, match="confidence"):
        context_document(lat, np.zeros((lat.rows, lat.cols), dtype="float32"), 0.0, 1.0, [],
                         RING, {}, confidence="certain")


# ------------------------------------------------------------------ the order of the water steps


def _write_utm_two_level_dem(path):
    """A UTM DEM covering the ring: 20 m land, except open water (-5 m) west of easting 545,000."""
    west, north, pixel, width, height = 520_000.0, 4_210_000.0, 100.0, 800, 600
    xs = west + (np.arange(width) + 0.5) * pixel
    data = np.tile(np.where(xs < 545_000.0, -5.0, 20.0).astype("float32"), (height, 1))
    with rasterio.open(
        path, "w", driver="GTiff", height=height, width=width, count=1, dtype="float32",
        crs="EPSG:32610", transform=from_origin(west, north, pixel, pixel), nodata=-999999.0,
    ) as dst:
        dst.write(data, 1)


def test_build_context_marsh_stays_marsh_and_open_water_goes_to_the_bay_floor(tmp_path):
    """MARSH_LEVEL_M equals OPEN_WATER_M, so flatten_water must run BEFORE apply_context_water:
    run the other way round, every hand-drawn marsh vertex would be flattened to the bay floor."""
    assert MARSH_LEVEL_M == OPEN_WATER_M  # the hazard this test pins
    # One marsh polygon on dry land in the north-east of the ring, well outside the city hole.
    ring = [[-122.20, 37.86], [-122.10, 37.86], [-122.10, 37.92], [-122.20, 37.92], [-122.20, 37.86]]
    marsh = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {"source": "test marsh polygon", "confidence": "illustrative"},
            "geometry": {"type": "Polygon", "coordinates": [ring]},
        }],
    }
    region, out = _mini_world(
        tmp_path, write_dem=_write_utm_two_level_dem, context_extra={"hand_marsh": ["data/marsh.geojson"]}
    )
    (tmp_path / "pipeline" / "data" / "marsh.geojson").write_text(json.dumps(marsh))
    doc = build_context(region)
    raw = np.fromfile(out / CONTEXT_HEIGHTS_FILE, dtype="<u2")
    heights = dequantize_heights(raw.reshape(doc["rows"], doc["cols"]), doc["min_m"], doc["max_m"])

    from shapely.geometry import Point

    from yelamu.sources import load_features

    geom = load_features(region.context.hand_marsh[0], require_provenance=True)[0].geometry
    lat = _lattice()
    ec, nc = (CITY.west + CITY.east) / 2, (CITY.north + CITY.south) / 2
    inside = [
        (i, j)
        for j in range(lat.rows)
        for i in range(lat.cols)
        if geom.contains(Point(ec + lat.x(i), nc - lat.z(j)))
    ]
    assert len(inside) >= 4  # several vertices, not a single lucky one
    assert all(not (lat.i0 <= i <= lat.i1 and lat.j0 <= j <= lat.j1) for i, j in inside)  # outside the hole
    for i, j in inside:
        assert heights[j, i] == pytest.approx(MARSH_LEVEL_M, abs=0.05), (i, j)
        assert heights[j, i] > BAY_FLOOR_M + 1.0
    # Open water elsewhere (the -5 m strip in the west) is flattened to the bay floor.
    assert (heights[:, 0] == pytest.approx(BAY_FLOOR_M, abs=0.05))
    assert heights[lat.rows // 2, 1] == pytest.approx(BAY_FLOOR_M, abs=0.05)
    # Dry land outside the marsh polygon keeps its 20 m.
    assert heights[0, lat.cols - 1] == pytest.approx(20.0, abs=0.1)


def test_limits_match_the_viewer_parser():
    from yelamu import context as ctxmod

    ts = (Path(__file__).resolve().parents[2] / "viewer" / "src" / "context" / "parse.ts").read_text()
    for name in ("MAX_PLACES", "MAX_NAME_CHARS"):
        found = re.search(rf"export const {name} = (\d+);", ts)
        assert found, f"{name} not found in viewer/src/context/parse.ts"
        assert int(found.group(1)) == getattr(ctxmod, name)
