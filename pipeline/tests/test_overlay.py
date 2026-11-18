import json
import math
from pathlib import Path

import pytest
import shapefile

from yelamu.geo import Grid, lonlat_to_utm
from yelamu.overlay import (
    HOTSPOT_KINDS,
    LANDMARK_KINDS,
    build_overlay,
    build_streets,
    kind_for_mtfcc,
    lonlat_to_world,
    promote_long_streets,
    read_tiger_roads,
    validate_hotspots,
    validate_landmarks,
    validate_streets,
    validate_unique_ids,
    validate_villages,
    world_xz,
)

BBOX = (-122.45, 37.75, -122.40, 37.80)
CELL = 10.0
LAT = 37.775  # inside BBOX
LON0 = -122.43


@pytest.fixture(scope="module")
def grid() -> Grid:
    return Grid.from_lonlat_bbox(*BBOX, cell=CELL)


# --------------------------------------------------------------------- world coordinates


def test_world_xz_matches_the_viewer_vertex_formula(grid):
    # viewer/src/terrainMesh.ts: x = (sx - (width-1)/2) * cell, z = (sy - (height-1)/2) * cell
    # for the cell-centre indices sx (column) and sy (row, 0 = north).
    for sx, sy in [(0, 0), (grid.width - 1, grid.height - 1), (7, 3), (grid.width // 2, 11)]:
        easting = grid.west + (sx + 0.5) * grid.cell
        northing = grid.north - (sy + 0.5) * grid.cell
        x, z = world_xz(grid, easting, northing)
        assert x == pytest.approx((sx - (grid.width - 1) / 2) * grid.cell, abs=1e-6)
        assert z == pytest.approx((sy - (grid.height - 1) / 2) * grid.cell, abs=1e-6)


def test_centre_of_the_grid_is_the_origin(grid):
    centre_e = (grid.west + grid.east) / 2
    centre_n = (grid.north + grid.south) / 2
    x, z = world_xz(grid, centre_e, centre_n)
    assert (x, z) == (pytest.approx(0.0, abs=1e-9), pytest.approx(0.0, abs=1e-9))


def test_east_is_plus_x_and_south_is_plus_z(grid):
    x0, z0 = world_xz(grid, grid.west + 100, grid.south + 100)
    x1, z1 = world_xz(grid, grid.west + 200, grid.south + 50)
    assert x1 - x0 == pytest.approx(100)  # further east -> larger x
    assert z1 - z0 == pytest.approx(50)  # further south -> larger z


def test_lonlat_to_world_agrees_with_utm_route(grid):
    lon, lat = -122.42, 37.77
    e, n = lonlat_to_utm(lon, lat)
    assert lonlat_to_world(grid, lon, lat) == pytest.approx(world_xz(grid, e, n))
    # The bbox corners land on the grid edges (the grid snaps outwards, so inside it).
    x, z = lonlat_to_world(grid, BBOX[0], BBOX[3])
    half_w, half_h = grid.width * grid.cell / 2, grid.height * grid.cell / 2
    assert -half_w - 1 <= x <= half_w and -half_h <= z <= half_h


# --------------------------------------------------------------------------- MTFCC kinds


@pytest.mark.parametrize(
    "code,kind",
    [("S1100", "primary"), ("S1200", "secondary"), ("S1400", "local"),
     ("S1630", None), ("S1500", None), ("S1710", None), ("S1730", None),
     ("S1740", None), ("S1750", None), ("S1780", None), ("S1820", None),
     ("", None), (None, None), ("junk", None)],
)
def test_kind_for_mtfcc(code, kind):
    assert kind_for_mtfcc(code) == kind


# ----------------------------------------------------------------------- TIGER reading


def write_roads(path: Path, rows: list[tuple[str | None, str, list[list[tuple[float, float]]]]]):
    """rows: (FULLNAME, MTFCC, parts); each part is a list of (lon, lat)."""
    w = shapefile.Writer(str(path), shapeType=shapefile.POLYLINE)
    w.field("LINEARID", "C", 22)
    w.field("FULLNAME", "C", 100)
    w.field("RTTYP", "C", 1)
    w.field("MTFCC", "C", 5)
    for i, (name, mtfcc, parts) in enumerate(rows):
        w.line(parts)
        w.record(str(i), name, "M", mtfcc)
    w.close()


def line(lon_a, lon_b, lat=LAT, n=2):
    """A west-east line of n points at constant latitude."""
    return [(lon_a + (lon_b - lon_a) * i / (n - 1), lat) for i in range(n)]


@pytest.fixture
def tiger(tmp_path) -> Path:
    path = tmp_path / "roads"
    write_roads(path, [
        ("Market St", "S1100", [line(LON0, LON0 + 0.01, n=3)]),          # collinear mid point
        ("Valencia St", "S1200", [line(LON0, LON0 + 0.004, lat=LAT + 0.004)]),
        ("Elm St", "S1400", [line(LON0, LON0 + 0.003, lat=LAT - 0.004)]),
        ("Elm St", "S1400", [line(LON0 + 0.004, LON0 + 0.007, lat=LAT - 0.004)]),  # same name
        ("Alley Way", "S1400", [line(LON0, LON0 + 0.003, lat=LAT - 0.006)]),
        ("", "S1400", [line(LON0, LON0 + 0.003, lat=LAT - 0.007)]),       # no name
        ("Hwy 1 On Rmp", "S1630", [line(LON0, LON0 + 0.003, lat=LAT - 0.009)]),  # ramp
        ("Service Rd", "S1740", [line(LON0, LON0 + 0.003, lat=LAT - 0.010)]),    # dropped kind
        ("Far Away Rd", "S1400", [line(-121.0, -120.99, lat=36.0)]),     # outside the grid
        ("Two Part Ave", "S1200", [line(LON0, LON0 + 0.002, lat=LAT + 0.001),
                                   line(LON0 + 0.003, LON0 + 0.005, lat=LAT + 0.001)]),
        ("Edge Rd", "S1400", [[(BBOX[2] - 0.0005, LAT), (BBOX[2] + 0.02, LAT)]]),  # crosses east edge
    ])
    return path.with_suffix(".shp")


def test_read_tiger_roads_filters_kinds_and_names(tiger):
    roads = read_tiger_roads(tiger)
    names = [r["name"] for r in roads]
    assert "Alley Way" in names  # S1400 local is kept
    assert not any(n in names for n in ("Hwy 1 On Rmp", "Service Rd"))  # dropped MTFCC
    assert all(r["name"] and r["name"].strip() == r["name"] for r in roads)  # no empty names
    by_name = {r["name"]: r for r in roads if r["name"] != "Elm St"}
    assert by_name["Market St"]["kind"] == "primary"
    assert by_name["Valencia St"]["kind"] == "secondary"
    assert by_name["Alley Way"]["kind"] == "local"
    # coords are lon/lat polylines
    market = by_name["Market St"]["coords"]
    assert len(market) == 1 and len(market[0]) == 3
    lon, lat = market[0][0]
    assert (lon, lat) == pytest.approx((LON0, LAT))


def test_read_tiger_roads_keeps_every_part_of_a_multipart_feature(tiger):
    roads = {r["name"]: r for r in read_tiger_roads(tiger)}
    assert len(roads["Two Part Ave"]["coords"]) == 2


def test_read_tiger_roads_missing_file_has_clear_message(tmp_path):
    with pytest.raises(FileNotFoundError, match="roads"):
        read_tiger_roads(tmp_path / "roads.shp")


# ----------------------------------------------------------------------- build_streets


def test_build_streets_kinds_names_and_order(tiger, grid):
    streets = build_streets(read_tiger_roads(tiger), grid)
    assert [(s["kind"], s["name"]) for s in streets] == [
        ("primary", "Market St"),
        ("secondary", "Two Part Ave"),
        ("secondary", "Valencia St"),
        ("local", "Alley Way"),
        ("local", "Edge Rd"),
        ("local", "Elm St"),
    ]
    for s in streets:
        assert set(s) == {"name", "kind", "lines"}
        for ln in s["lines"]:
            assert len(ln) % 2 == 0 and len(ln) >= 4


def test_build_streets_merges_same_name_and_kind(tiger, grid):
    streets = {(s["name"], s["kind"]): s for s in build_streets(read_tiger_roads(tiger), grid)}
    assert len(streets[("Elm St", "local")]["lines"]) == 2  # two features -> one entry
    assert len(streets[("Two Part Ave", "secondary")]["lines"]) == 2  # two parts -> two lines


def test_build_streets_simplifies_collinear_points(tiger, grid):
    streets = {s["name"]: s for s in build_streets(read_tiger_roads(tiger), grid)}
    (market,) = streets["Market St"]["lines"]
    assert len(market) == 4  # the collinear middle vertex was removed: 2 points = 4 numbers
    unsimplified = build_streets(read_tiger_roads(tiger), grid, tolerance_m=0.0)
    (m0,) = [s for s in unsimplified if s["name"] == "Market St"][0]["lines"]
    assert len(m0) == 6


def test_build_streets_clips_lines_wholly_outside_but_keeps_crossing_ones(tiger, grid):
    names = {s["name"] for s in build_streets(read_tiger_roads(tiger), grid)}
    assert "Far Away Rd" not in names
    streets = {s["name"]: s for s in build_streets(read_tiger_roads(tiger), grid)}
    (edge,) = streets["Edge Rd"]["lines"]
    # Geometry is not cut: the far end is still beyond the east edge of the grid.
    assert max(edge[0::2]) > grid.width * grid.cell / 2


def test_build_streets_world_coordinates_and_rounding(tiger, grid):
    streets = {s["name"]: s for s in build_streets(read_tiger_roads(tiger), grid)}
    (ln,) = streets["Valencia St"]["lines"]
    x0, z0 = lonlat_to_world(grid, LON0, LAT + 0.004)
    assert (ln[0], ln[1]) == pytest.approx((x0, z0), abs=0.06)
    for v in ln:
        assert round(v, 1) == v  # rounded to 0.1 m
    assert math.isclose(ln[2] - ln[0], 0.004 * 111320 * math.cos(math.radians(LAT)), rel_tol=0.01)


def test_build_streets_kinds_filter(tiger, grid):
    streets = build_streets(read_tiger_roads(tiger), grid, kinds=("primary",))
    assert {s["kind"] for s in streets} == {"primary"}


def test_build_streets_drops_degenerate_lines(grid):
    roads = [
        {"name": "Dot St", "kind": "local", "coords": [[(LON0, LAT), (LON0, LAT)]]},
        {"name": "Tiny St", "kind": "local", "coords": [[(LON0, LAT), (LON0 + 1e-7, LAT)]]},
        {"name": "Short St", "kind": "local", "coords": [[(LON0, LAT)]]},
        {"name": "Good St", "kind": "local", "coords": [[(LON0, LAT), (LON0 + 0.002, LAT)]]},
    ]
    names = [s["name"] for s in build_streets(roads, grid)]
    assert names == ["Good St"]


def test_build_streets_is_deterministic_and_input_order_independent(tiger, grid):
    roads = read_tiger_roads(tiger)
    a = build_streets(roads, grid)
    b = build_streets(list(reversed(roads)), grid)
    assert a == b
    assert json.dumps(a) == json.dumps(build_streets(roads, grid))


# ------------------------------------------------------------------ promote_long_streets


def st(name, kind, *lines):
    return {"name": name, "kind": kind, "lines": [list(map(float, ln)) for ln in lines]}


def hline(length, z=0.0, x0=0.0):
    """A flat polyline running `length` metres east, with a mid vertex."""
    return [x0, z, x0 + length / 2, z, x0 + length, z]


def kinds_by_name(streets):
    return {s["name"]: s["kind"] for s in streets}


def test_promote_threshold_boundary_is_inclusive():
    streets = [st("Exact", "local", hline(6000)), st("Under", "local", hline(5999.9)),
               st("Over", "local", hline(6000.1))]
    assert kinds_by_name(promote_long_streets(streets)) == {
        "Exact": "secondary", "Under": "local", "Over": "secondary"}


def test_promote_sums_all_lines_of_a_street():
    streets = [st("Split", "local", hline(2000), hline(2000, z=50), hline(2000, z=100)),
               st("Short", "local", hline(2000), hline(2000, z=50))]
    assert kinds_by_name(promote_long_streets(streets)) == {"Split": "secondary", "Short": "local"}


def test_promote_measures_diagonal_polylines_in_metres():
    # 3-4-5 triangles: two segments of 5 km each -> 10 km
    streets = [st("Diag", "local", [0, 0, 3000, 4000, 6000, 8000])]
    assert kinds_by_name(promote_long_streets(streets, min_length_m=9999)) == {"Diag": "secondary"}
    assert kinds_by_name(promote_long_streets(streets, min_length_m=10001)) == {"Diag": "local"}


def test_promote_leaves_primary_and_secondary_alone():
    streets = [st("Huge Primary", "primary", hline(50000)), st("Tiny Primary", "primary", hline(10)),
               st("Sec", "secondary", hline(10)), st("Long Sec", "secondary", hline(50000))]
    out = promote_long_streets(streets)
    assert kinds_by_name(out) == {"Huge Primary": "primary", "Tiny Primary": "primary",
                                  "Sec": "secondary", "Long Sec": "secondary"}


def test_promote_returns_new_list_without_mutating_input():
    streets = [st("Long", "local", hline(7000))]
    before = json.dumps(streets)
    out = promote_long_streets(streets)
    assert json.dumps(streets) == before and streets[0]["kind"] == "local"
    assert out is not streets and out[0] is not streets[0]
    assert out[0]["lines"] == streets[0]["lines"] and set(out[0]) == {"name", "kind", "lines"}
    out[0]["lines"][0][0] = 99.0  # the copy does not alias the input's lines
    assert streets[0]["lines"][0][0] == 0.0


def test_promote_ordering_after_promotion():
    streets = [
        st("Zed Local", "local", hline(10)), st("Alpha Local", "local", hline(7000)),
        st("Mid Sec", "secondary", hline(10)), st("Aaa Sec", "secondary", hline(10)),
        st("Beta Local", "local", hline(6500)), st("Prime", "primary", hline(10)),
    ]
    out = promote_long_streets(streets)
    assert [(s["kind"], s["name"]) for s in out] == [
        ("primary", "Prime"),
        ("secondary", "Aaa Sec"), ("secondary", "Alpha Local"), ("secondary", "Beta Local"),
        ("secondary", "Mid Sec"),
        ("local", "Zed Local"),
    ]


def test_promote_sums_duplicate_local_entries_and_merges_into_existing_secondary():
    streets = [st("Same", "local", hline(3000)), st("Same", "local", hline(3000, z=9)),
               st("Mixed", "secondary", hline(10, z=5)), st("Mixed", "local", hline(7000))]
    out = promote_long_streets(streets)
    assert [(s["kind"], s["name"], len(s["lines"])) for s in out] == [
        ("secondary", "Mixed", 2), ("secondary", "Same", 2)]
    assert out[0]["lines"] == sorted(out[0]["lines"])


@pytest.mark.parametrize("disabled", [0, 0.0, -1.0])
def test_promote_disabled_returns_an_equal_copy(disabled):
    streets = [st("Long", "local", hline(90000)), st("P", "primary", hline(1))]
    out = promote_long_streets(streets, min_length_m=disabled)
    assert out == streets and out is not streets and out[0] is not streets[0]


def test_promote_empty_and_is_deterministic():
    assert promote_long_streets([]) == []
    streets = [st("B", "local", hline(7000)), st("A", "local", hline(8000)), st("C", "local", hline(1))]
    a = promote_long_streets(streets)
    b = promote_long_streets(list(reversed(streets)))
    assert a == b
    assert json.dumps(a) == json.dumps(promote_long_streets(streets))


# ------------------------------------------------------------------------- validation


def lm(**over):
    item = {"id": "ferry-building", "name": "Ferry Building", "kind": "building",
            "lon": -122.42, "lat": 37.77}
    item.update(over)
    return item


def hs(**over):
    item = {
        "id": "yerba-buena-cove", "name": "Yerba Buena Cove", "kind": "bay",
        "lon": -122.42, "lat": 37.77,
        "description": "A sheltered tidal cove on the northeast shore of the peninsula.",
        "sources": [{"title": "Hidden Nature SF", "url": "https://hidden-nature.org/x"}],
        "confidence": "documented",
    }
    item.update(over)
    return item


def test_valid_items_pass():
    validate_landmarks([lm(), lm(id="coit-tower", name="Coit Tower")], BBOX)
    validate_hotspots([hs(), hs(id="other")], BBOX)


def test_kind_vocabularies():
    assert set(LANDMARK_KINDS) == {"park", "bridge", "hill", "building", "neighborhood",
                                   "beach", "water", "fort", "other"}
    assert set(HOTSPOT_KINDS) == {"creek", "lagoon", "marsh", "dune", "hill", "shoreline",
                                  "bay", "lake", "valley", "other"}


@pytest.mark.parametrize("validate,make", [(validate_landmarks, lm), (validate_hotspots, hs)])
class TestCommonRules:
    def test_missing_field(self, validate, make):
        for key in ("id", "name", "kind", "lon", "lat"):
            item = make(id="the-id")
            del item[key]
            with pytest.raises(ValueError, match=key):
                validate([item], BBOX)

    def test_blank_fields(self, validate, make):
        with pytest.raises(ValueError, match="the-id"):
            validate([make(id="the-id", name="   ")], BBOX)
        with pytest.raises(ValueError, match="id"):
            validate([make(id="")], BBOX)

    def test_bad_kind_names_item(self, validate, make):
        with pytest.raises(ValueError, match="the-id.*kind"):
            validate([make(id="the-id", kind="spaceport")], BBOX)

    def test_duplicate_id(self, validate, make):
        with pytest.raises(ValueError, match="dup-id.*duplicate|duplicate.*dup-id"):
            validate([make(id="dup-id"), make(id="dup-id")], BBOX)

    @pytest.mark.parametrize("lon,lat", [(-122.5, 37.77), (-122.35, 37.77),
                                         (-122.42, 37.7), (-122.42, 37.9)])
    def test_outside_bbox(self, validate, make, lon, lat):
        with pytest.raises(ValueError, match="the-id.*(bbox|outside)"):
            validate([make(id="the-id", lon=lon, lat=lat)], BBOX)

    @pytest.mark.parametrize("bad_id", ["Upper", "has space", "-leading", "under_score", "é"])
    def test_id_pattern(self, validate, make, bad_id):
        with pytest.raises(ValueError, match="id"):
            validate([make(id=bad_id)], BBOX)

    @pytest.mark.parametrize("bad", ["-122.4", None, True, float("nan")])
    def test_non_numeric_coordinates(self, validate, make, bad):
        with pytest.raises(ValueError, match="the-id"):
            validate([make(id="the-id", lon=bad)], BBOX)

    def test_not_an_object_or_list(self, validate, make):
        with pytest.raises(ValueError):
            validate(["nope"], BBOX)
        with pytest.raises(ValueError):
            validate({"id": "x"}, BBOX)


def test_hotspot_description_length():
    with pytest.raises(ValueError, match="the-id.*description"):
        validate_hotspots([hs(id="the-id", description="too short")], BBOX)
    with pytest.raises(ValueError, match="the-id.*description"):
        validate_hotspots([hs(id="the-id", description="x" * 401)], BBOX)
    validate_hotspots([hs(description="x" * 20)], BBOX)
    validate_hotspots([hs(description="x" * 400)], BBOX)
    with pytest.raises(ValueError, match="the-id.*description"):
        validate_hotspots([hs(id="the-id", description=None)], BBOX)


@pytest.mark.parametrize("sources", [
    [], None, "https://x.org", [{"title": "T"}], [{"url": "https://x.org"}],
    [{"title": " ", "url": "https://x.org"}], [{"title": "T", "url": "ftp://x.org"}],
    [{"title": "T", "url": "x.org/page"}], [{"title": "T", "url": "https://"}],
    ["https://x.org"],
])
def test_hotspot_bad_sources(sources):
    with pytest.raises(ValueError, match="the-id.*sources"):
        validate_hotspots([hs(id="the-id", sources=sources)], BBOX)


def test_hotspot_accepts_http_and_multiple_sources():
    validate_hotspots([hs(sources=[{"title": "A", "url": "http://a.org"},
                                   {"title": "B", "url": "https://b.org/c?d=1"}])], BBOX)


def test_hotspot_confidence():
    with pytest.raises(ValueError, match="the-id.*confidence"):
        validate_hotspots([hs(id="the-id", confidence="certain")], BBOX)
    for c in ("documented", "inferred", "illustrative"):
        validate_hotspots([hs(confidence=c)], BBOX)


def test_hotspot_kind_vocabulary_is_hotspot_specific():
    with pytest.raises(ValueError, match="kind"):
        validate_hotspots([hs(kind="building")], BBOX)  # a landmark kind
    with pytest.raises(ValueError, match="kind"):
        validate_landmarks([lm(kind="creek")], BBOX)


# ------------------------------------------- limits mirrored from viewer/src/overlay/parse.ts


@pytest.mark.parametrize("validate,make", [(validate_landmarks, lm), (validate_hotspots, hs)])
class TestViewerParserLimits:
    def test_name_length_limit(self, validate, make):
        validate([make(name="x" * 120)], BBOX)
        with pytest.raises(ValueError, match="the-id.*name"):
            validate([make(id="the-id", name="x" * 121)], BBOX)

    def test_name_length_counts_utf16_units_like_javascript(self, validate, make):
        # U+1F332 is one Python character but two UTF-16 units (JS string length).
        validate([make(name="\U0001F332" * 60)], BBOX)
        with pytest.raises(ValueError, match="the-id.*name"):
            validate([make(id="the-id", name="\U0001F332" * 61)], BBOX)

    def test_per_section_count_limit(self, validate, make):
        def many(n):
            return [make(id=f"p{i}") for i in range(n)]

        validate(many(5000), BBOX)
        with pytest.raises(ValueError, match="5001.*5000|5000.*5001"):
            validate(many(5001), BBOX)

    def test_non_finite_coordinates_rejected(self, validate, make):
        for bad in (float("inf"), float("-inf")):
            with pytest.raises(ValueError, match="the-id"):
                validate([make(id="the-id", lat=bad)], BBOX)


def test_hotspot_description_length_counts_utf16_units():
    validate_hotspots([hs(description="\U0001F332" * 200)], BBOX)  # 400 units
    with pytest.raises(ValueError, match="the-id.*description"):
        validate_hotspots([hs(id="the-id", description="\U0001F332" * 201)], BBOX)  # 402 units


def test_hotspot_source_count_limit():
    one = {"title": "T", "url": "https://x.org/a"}
    validate_hotspots([hs(sources=[one] * 20)], BBOX)
    with pytest.raises(ValueError, match="the-id.*sources.*20|the-id.*20.*sources"):
        validate_hotspots([hs(id="the-id", sources=[one] * 21)], BBOX)


@pytest.mark.parametrize("url", [
    "https://", "http://", "https:///path", "https://exa mple.org", "https://x.org/a b",
    "https://x.org:99999/", "https://x.org:abc/", "http://[::1", "https://user@/x",
    "https://x.org\n/", "javascript:alert(1)", "//x.org/a", "https:x", "   ",
])
def test_hotspot_source_url_must_be_parseable_like_new_url(url):
    with pytest.raises(ValueError, match="the-id.*sources"):
        validate_hotspots([hs(id="the-id", sources=[{"title": "T", "url": url}])], BBOX)


@pytest.mark.parametrize("url", [
    "https://x.org", "http://x.org/a?b=1#c", "https://x.org:8080/p", "http://[::1]:3000/",
    "https://sub.example.co.uk/a%20b", "  https://x.org/trimmed  ",
])
def test_hotspot_source_url_accepts_what_new_url_accepts(url):
    validate_hotspots([hs(sources=[{"title": "T", "url": url}])], BBOX)


def _street(name="Market St", lines=None, kind="primary"):
    return {"name": name, "kind": kind, "lines": lines if lines is not None else [[0.0, 0.0, 1.0, 1.0]]}


def test_validate_streets_accepts_good_output():
    validate_streets([_street(), _street(name="A St", kind="local")])
    validate_streets([])


def test_validate_streets_limits():
    validate_streets([_street(name=f"s{i}") for i in range(6000)])
    with pytest.raises(ValueError, match="6001.*6000|6000.*6001"):
        validate_streets([_street(name=f"s{i}") for i in range(6001)])
    # 400_000 points in total is the viewer's cap
    validate_streets([_street(lines=[[0.0, 0.0] * 400_000])])
    with pytest.raises(ValueError, match="400000"):
        validate_streets([_street(lines=[[0.0, 0.0] * 400_001])])
    validate_streets([_street(name="x" * 120)])
    with pytest.raises(ValueError, match="street #0.*name"):
        validate_streets([_street(name="x" * 121)])


@pytest.mark.parametrize("bad", [
    _street(kind="alley"), _street(name=" "), _street(lines=[[0.0, 0.0, 1.0]]),
    _street(lines=[[0.0, 0.0]]), _street(lines=[[0.0, 0.0, float("nan"), 1.0]]),
    _street(lines="x"),
])
def test_validate_streets_rejects_malformed(bad):
    with pytest.raises(ValueError, match="street #0"):
        validate_streets([bad])


# ------------------------------------------------------ ids unique across both kinds


def test_validate_unique_ids_passes_for_distinct_ids():
    validate_unique_ids([lm(id="a"), lm(id="b")], [hs(id="c"), hs(id="d")])
    validate_unique_ids([], [])


def test_validate_unique_ids_rejects_an_id_used_by_both_kinds():
    with pytest.raises(ValueError, match="id 'shared' is used by both a landmark and a hotspot"):
        validate_unique_ids([lm(id="a"), lm(id="shared")], [hs(id="shared")])


def test_build_overlay_rejects_shared_ids_and_writes_nothing(tmp_path, grid):
    kwargs, meta = write_inputs(tmp_path, grid)
    kwargs["landmarks_path"].write_text(json.dumps([lm(id="shared", name="A")]))
    kwargs["hotspots_path"].write_text(json.dumps([hs(id="shared")]))
    before = (kwargs["out_dir"] / "meta.json").read_text()
    with pytest.raises(ValueError, match="shared.*both a landmark and a hotspot"):
        build_overlay(**kwargs)
    assert not (kwargs["out_dir"] / "overlay.json").exists()
    assert (kwargs["out_dir"] / "meta.json").read_text() == before


def test_build_overlay_with_distinct_ids_succeeds(tmp_path, grid):
    kwargs, _ = write_inputs(tmp_path, grid)
    kwargs["landmarks_path"].write_text(json.dumps([lm(id="one", name="A")]))
    kwargs["hotspots_path"].write_text(json.dumps([hs(id="two")]))
    build_overlay(**kwargs)
    assert (kwargs["out_dir"] / "overlay.json").exists()


# --------------------------------------------------------------------- build_overlay e2e


def write_inputs(tmp_path: Path, grid: Grid, with_meta: bool = True):
    tiger = tmp_path / "tiger" / "roads"
    tiger.parent.mkdir()
    write_roads(tiger, [
        ("B St", "S1200", [line(LON0, LON0 + 0.004)]),
        ("A St", "S1100", [line(LON0, LON0 + 0.004, lat=LAT + 0.002)]),
    ])
    landmarks = tmp_path / "landmarks.json"
    landmarks.write_text(json.dumps([lm(id="z-place", name="Z"), lm(id="a-place", name="A")]))
    hotspots = tmp_path / "hotspots.json"
    hotspots.write_text(json.dumps([hs()]))
    out = tmp_path / "out"
    out.mkdir()
    meta = {"width": grid.width, "height": grid.height, "cell_m": grid.cell,
            "west": grid.west, "south": grid.south, "east": grid.east, "north": grid.north,
            "heights_file": "heightmap.u16", "layers": [{"id": "terrain"}]}
    if with_meta:
        (out / "meta.json").write_text(json.dumps(meta, indent=2))
    return dict(bbox=BBOX, cell=CELL, out_dir=out, tiger_path=tiger.with_suffix(".shp"),
                landmarks_path=landmarks, hotspots_path=hotspots), meta


def test_build_overlay_writes_file_and_updates_meta(tmp_path, grid):
    kwargs, meta = write_inputs(tmp_path, grid)
    overlay = build_overlay(**kwargs)

    out = kwargs["out_dir"]
    text = (out / "overlay.json").read_text()
    assert ": " not in text and ", " not in text  # compact separators
    assert json.loads(text) == overlay
    assert list(overlay) == ["version", "streets", "landmarks", "hotspots", "villages",
                             "processing"]
    assert overlay["villages"] == []  # no villages file given: older datasets still build
    assert overlay["processing"] == {"tolerance_m": 6.0, "promote_m": 6000.0}
    assert overlay["version"] == 1
    assert [(s["kind"], s["name"]) for s in overlay["streets"]] == [
        ("primary", "A St"), ("secondary", "B St")]
    assert [m["id"] for m in overlay["landmarks"]] == ["a-place", "z-place"]  # sorted by id
    m = overlay["landmarks"][0]
    assert set(m) == {"id", "name", "kind", "x", "z", "lon", "lat"}
    x, z = lonlat_to_world(grid, m["lon"], m["lat"])
    assert (m["x"], m["z"]) == (round(x, 1), round(z, 1))
    h = overlay["hotspots"][0]
    assert set(h) == {"id", "name", "kind", "x", "z", "lon", "lat", "description",
                      "sources", "confidence"}
    assert h["sources"] == [{"title": "Hidden Nature SF", "url": "https://hidden-nature.org/x"}]

    new_meta = json.loads((out / "meta.json").read_text())
    assert new_meta.pop("overlay_file") == "overlay.json"
    assert new_meta == meta  # every other key untouched (no villages: no village meta either)


def write_long_road_inputs(tmp_path, grid):
    kwargs, meta = write_inputs(tmp_path, grid)
    tiger = tmp_path / "tiger2" / "roads"
    tiger.parent.mkdir()
    # 0.04 deg of longitude at lat 37.775 is about 3.5 km; two such features share a name.
    write_roads(tiger, [
        ("Long Blvd", "S1400", [line(LON0 - 0.02, LON0 + 0.02, lat=LAT - 0.001)]),
        ("Long Blvd", "S1400", [line(LON0 - 0.02, LON0 + 0.02, lat=LAT - 0.002)]),
        ("Short St", "S1400", [line(LON0, LON0 + 0.004, lat=LAT + 0.001)]),
        ("A St", "S1100", [line(LON0, LON0 + 0.004, lat=LAT + 0.002)]),
    ])
    kwargs["tiger_path"] = tiger.with_suffix(".shp")
    return kwargs


def test_build_overlay_promotes_long_local_roads_and_records_processing(tmp_path, grid):
    kwargs = write_long_road_inputs(tmp_path, grid)
    overlay = build_overlay(**kwargs, promote_m=5000.0)
    assert [(s["kind"], s["name"]) for s in overlay["streets"]] == [
        ("primary", "A St"), ("secondary", "Long Blvd"), ("local", "Short St")]
    assert len(overlay["streets"][1]["lines"]) == 2
    assert overlay["processing"] == {"tolerance_m": 6.0, "promote_m": 5000.0}
    assert list(overlay)[-1] == "processing"
    assert json.loads((kwargs["out_dir"] / "overlay.json").read_text()) == overlay


def test_build_overlay_promote_default_and_disabled(tmp_path, grid):
    kwargs = write_long_road_inputs(tmp_path, grid)
    default = build_overlay(**kwargs)  # 6000 m: ~7 km of Long Blvd is promoted
    assert {s["name"]: s["kind"] for s in default["streets"]}["Long Blvd"] == "secondary"
    assert default["processing"]["promote_m"] == 6000.0
    off = build_overlay(**kwargs, promote_m=0)
    assert {s["name"]: s["kind"] for s in off["streets"]}["Long Blvd"] == "local"
    assert off["processing"] == {"tolerance_m": 6.0, "promote_m": 0.0}
    tol = build_overlay(**kwargs, tolerance_m=2.5, promote_m=0)
    assert tol["processing"] == {"tolerance_m": 2.5, "promote_m": 0.0}


def test_build_overlay_is_idempotent(tmp_path, grid):
    kwargs, _ = write_inputs(tmp_path, grid)
    build_overlay(**kwargs)
    first = ((kwargs["out_dir"] / "overlay.json").read_bytes(),
             (kwargs["out_dir"] / "meta.json").read_bytes())
    build_overlay(**kwargs)
    second = ((kwargs["out_dir"] / "overlay.json").read_bytes(),
              (kwargs["out_dir"] / "meta.json").read_bytes())
    assert first == second


def test_build_overlay_missing_meta_is_a_clear_error(tmp_path, grid):
    kwargs, _ = write_inputs(tmp_path, grid, with_meta=False)
    with pytest.raises(FileNotFoundError, match="meta.json"):
        build_overlay(**kwargs)
    assert not (kwargs["out_dir"] / "overlay.json").exists()  # nothing half-written


def test_build_overlay_rejects_meta_from_a_different_grid(tmp_path, grid):
    kwargs, meta = write_inputs(tmp_path, grid)
    meta["west"] += 500.0
    (kwargs["out_dir"] / "meta.json").write_text(json.dumps(meta))
    with pytest.raises(ValueError, match="west"):
        build_overlay(**kwargs)
    assert not (kwargs["out_dir"] / "overlay.json").exists()


def test_build_overlay_propagates_validation_errors(tmp_path, grid):
    kwargs, _ = write_inputs(tmp_path, grid)
    kwargs["landmarks_path"].write_text(json.dumps([lm(id="bad-one", kind="nope")]))
    with pytest.raises(ValueError, match="bad-one"):
        build_overlay(**kwargs)


def test_data_files_in_the_repo_are_valid():
    """The curated landmark/hotspot files must pass validation against the real region."""
    from yelamu.region import load_region

    root = Path(__file__).resolve().parent.parent
    region = load_region(root / "regions" / "full-city.json")
    landmarks = json.loads((root / "data/overlay/landmarks.json").read_text())
    hotspots = json.loads((root / "data/overlay/hotspots.json").read_text())
    validate_landmarks(landmarks, region.bbox)
    validate_hotspots(hotspots, region.bbox)
    validate_unique_ids(landmarks, hotspots)
    assert len(landmarks) == 37
    assert 8 <= len(hotspots) <= 20  # ten curated hotspots plus the seven named creeks


# ----------------------------------------------------------------------------- villages


VILLAGES_SOURCE_NOTE = (
    "General locations from SFEI's Hidden Nature SF story map 'Yelamu: the Native Peoples of "
    "San Francisco' (2026), after Milliken (1983, 1995) and the NPS (2009). Approximate."
)
CARD_TEXT = (
    "General location of a Yelamu village site {place}, around the time of Spanish contact. "
    "Approximate: villages were places and the people who lived there, and they moved "
    "seasonally and over time. Source: SFEI Hidden Nature SF, after Milliken (1983, 1995) "
    "and the National Park Service (2009)."
)
SHIPPED_VILLAGES = {
    "village-sitlintac": ("Sitlintac", -122.4152, 37.7714, "along Mission Creek"),
    "village-chutchui": ("Chutchui", -122.4235, 37.7619, "along Mission Creek"),
    "village-amuctac": ("Amuctac", -122.4016, 37.7238, "around Visitacion Valley"),
    "village-tubsinte": ("Tubsinte", -122.4148, 37.7109, "around Visitacion Valley"),
    "village-petlenuc": ("Petlenuc", -122.4552, 37.7978, "in the Presidio near Crissy Field"),
}


def vg(**over):
    item = {
        "id": "village-test", "name": "Testville", "lon": -122.42, "lat": 37.77, "radius_m": 530,
        "description": "General location of a village site, approximate.",
        "sources": [{"title": "SFEI Hidden Nature SF", "url": "https://storymaps.arcgis.com/x"}],
        "confidence": "inferred",
    }
    item.update(over)
    return item


def test_valid_villages_pass():
    validate_villages([vg(), vg(id="village-two", name="Two")], BBOX)
    validate_villages([], BBOX)


@pytest.mark.parametrize("key", ["id", "name", "lon", "lat", "radius_m", "description",
                                 "sources", "confidence"])
def test_village_missing_field(key):
    item = vg()
    del item[key]
    with pytest.raises(ValueError, match="village-test|item #0"):
        validate_villages([item], BBOX)


@pytest.mark.parametrize("description", [None, "", "   ", "too short", "x" * 401, 12])
def test_village_description_rules(description):
    with pytest.raises(ValueError, match="village-test.*description"):
        validate_villages([vg(description=description)], BBOX)
    validate_villages([vg(description="x" * 20)], BBOX)
    validate_villages([vg(description="x" * 400)], BBOX)


@pytest.mark.parametrize("sources", [None, [], "https://a.org", [{"title": "T"}],
                                     [{"title": "", "url": "https://a.org"}],
                                     [{"title": "T", "url": "ftp://a.org"}]])
def test_village_needs_valid_sources(sources):
    with pytest.raises(ValueError, match="village-test.*sources"):
        validate_villages([vg(sources=sources)], BBOX)


@pytest.mark.parametrize("confidence", [None, "certain", "Inferred", ""])
def test_village_confidence_rules(confidence):
    with pytest.raises(ValueError, match="village-test.*confidence"):
        validate_villages([vg(confidence=confidence)], BBOX)
    for ok in ("documented", "inferred", "illustrative"):
        validate_villages([vg(confidence=ok)], BBOX)


@pytest.mark.parametrize("radius", [99.9, 0, -5, 2000.1, 5000, "530", None, True, float("nan"),
                                    float("inf")])
def test_village_radius_must_be_100_to_2000(radius):
    with pytest.raises(ValueError, match="village-test.*radius_m"):
        validate_villages([vg(radius_m=radius)], BBOX)
    for ok in (100, 530, 2000, 1999.5):
        validate_villages([vg(radius_m=ok)], BBOX)


@pytest.mark.parametrize("lon,lat", [(-122.5, 37.77), (-122.42, 37.9), (-122.0, 37.0)])
def test_village_position_outside_bbox(lon, lat):
    with pytest.raises(ValueError, match="village-test.*outside the region bbox"):
        validate_villages([vg(lon=lon, lat=lat)], BBOX)


def test_village_id_name_and_duplicates():
    with pytest.raises(ValueError, match="duplicate"):
        validate_villages([vg(), vg()], BBOX)
    with pytest.raises(ValueError, match="id"):
        validate_villages([vg(id="Bad Id")], BBOX)
    with pytest.raises(ValueError, match="name"):
        validate_villages([vg(name="x" * 121)], BBOX)
    with pytest.raises(ValueError, match="list"):
        validate_villages({"id": "x"}, BBOX)


def test_validate_unique_ids_covers_villages():
    validate_unique_ids([lm(id="a")], [hs(id="b")], [vg(id="c")])
    with pytest.raises(ValueError, match="'shared'.*a landmark and a village"):
        validate_unique_ids([lm(id="shared")], [], [vg(id="shared")])
    with pytest.raises(ValueError, match="'shared'.*a hotspot and a village"):
        validate_unique_ids([], [hs(id="shared")], [vg(id="shared")])


def test_build_overlay_rejects_a_village_id_shared_with_a_hotspot_and_writes_nothing(tmp_path, grid):
    kwargs, _ = write_inputs(tmp_path, grid)
    villages = tmp_path / "villages.json"
    villages.write_text(json.dumps([vg(id="yerba-buena-cove")]))  # the id hs() uses
    before = (kwargs["out_dir"] / "meta.json").read_text()
    with pytest.raises(ValueError, match="yerba-buena-cove"):
        build_overlay(**kwargs, villages_path=villages)
    assert not (kwargs["out_dir"] / "overlay.json").exists()
    assert (kwargs["out_dir"] / "meta.json").read_text() == before


def test_build_overlay_propagates_village_validation_errors(tmp_path, grid):
    kwargs, _ = write_inputs(tmp_path, grid)
    villages = tmp_path / "villages.json"
    villages.write_text(json.dumps([vg(radius_m=5000)]))
    with pytest.raises(ValueError, match="village-test"):
        build_overlay(**kwargs, villages_path=villages)
    assert not (kwargs["out_dir"] / "overlay.json").exists()


def write_villages(tmp_path: Path) -> Path:
    villages = tmp_path / "villages.json"
    villages.write_text(json.dumps([
        vg(id="village-z", name=" Zed ", lon=-122.41, lat=37.78, description="  " + "d" * 30 + " "),
        vg(id="village-a", name="Aye", sources=[{"title": " T ", "url": " https://a.org/x "}]),
    ]))
    return villages


def test_build_overlay_emits_villages_like_hotspots_plus_radius(tmp_path, grid):
    kwargs, _ = write_inputs(tmp_path, grid)
    overlay = build_overlay(**kwargs, villages_path=write_villages(tmp_path))
    assert [v["id"] for v in overlay["villages"]] == ["village-a", "village-z"]  # sorted by id
    a, z = overlay["villages"]
    assert list(a) == ["id", "name", "x", "z", "lon", "lat", "radius_m", "description",
                       "sources", "confidence"]
    assert "kind" not in a
    x, zz = lonlat_to_world(grid, a["lon"], a["lat"])
    assert (a["x"], a["z"]) == (round(x, 1), round(zz, 1))
    assert a["radius_m"] == 530
    assert a["confidence"] == "inferred"
    assert a["sources"] == [{"title": "T", "url": "https://a.org/x"}]  # stripped
    assert z["name"] == "Zed" and z["description"] == "d" * 30  # stripped
    assert json.loads((kwargs["out_dir"] / "overlay.json").read_text()) == overlay


def test_missing_villages_file_gives_an_empty_list(tmp_path, grid):
    kwargs, _ = write_inputs(tmp_path, grid)
    overlay = build_overlay(**kwargs, villages_path=tmp_path / "nope.json")
    assert overlay["villages"] == []
    assert build_overlay(**kwargs)["villages"] == []


def test_meta_patch_sets_count_and_one_hand_sources_row(tmp_path, grid):
    kwargs, meta = write_inputs(tmp_path, grid)
    build_overlay(**kwargs, villages_path=write_villages(tmp_path))
    new_meta = json.loads((kwargs["out_dir"] / "meta.json").read_text())
    assert new_meta["overlay_file"] == "overlay.json"
    assert new_meta["overlay_villages"] == 2
    assert new_meta["hand_sources"] == [{
        "layer": "villages", "source": VILLAGES_SOURCE_NOTE, "confidence": "inferred", "count": 2,
    }]
    others = {k: v for k, v in new_meta.items()
              if k not in ("overlay_file", "overlay_villages", "hand_sources")}
    assert others == meta


def test_meta_patch_is_idempotent_and_keeps_every_other_key(tmp_path, grid):
    kwargs, meta = write_inputs(tmp_path, grid)
    other_rows = [
        {"layer": "hand_water", "source": "NOAA", "confidence": "inferred", "count": 1},
        {"layer": "ponds", "source": "DEM", "confidence": "inferred", "count": 3},
    ]
    meta.update({"context_file": "context.json", "shade": {"file": "shade.u8"},
                 "hand_sources": list(other_rows),
                 "layers": [{"id": "terrain"}, {"id": "context"}]})
    (kwargs["out_dir"] / "meta.json").write_text(json.dumps(meta, indent=2))
    villages = write_villages(tmp_path)

    build_overlay(**kwargs, villages_path=villages)
    first = (kwargs["out_dir"] / "meta.json").read_bytes()
    build_overlay(**kwargs, villages_path=villages)
    assert (kwargs["out_dir"] / "meta.json").read_bytes() == first  # idempotent

    new_meta = json.loads(first)
    assert new_meta["context_file"] == "context.json"
    assert new_meta["shade"] == {"file": "shade.u8"}
    assert new_meta["layers"] == [{"id": "terrain"}, {"id": "context"}]
    assert new_meta["hand_sources"][:2] == other_rows  # other layers' rows untouched, in order
    assert [r["layer"] for r in new_meta["hand_sources"]].count("villages") == 1
    assert len(new_meta["hand_sources"]) == 3


def test_meta_patch_replaces_a_stale_village_row_and_count(tmp_path, grid):
    kwargs, meta = write_inputs(tmp_path, grid)
    meta["overlay_villages"] = 9
    meta["hand_sources"] = [{"layer": "villages", "source": "old", "confidence": "documented",
                             "count": 9}]
    (kwargs["out_dir"] / "meta.json").write_text(json.dumps(meta, indent=2))
    build_overlay(**kwargs, villages_path=write_villages(tmp_path))
    new_meta = json.loads((kwargs["out_dir"] / "meta.json").read_text())
    assert new_meta["overlay_villages"] == 2
    assert [r["source"] for r in new_meta["hand_sources"]] == [VILLAGES_SOURCE_NOTE]
    assert new_meta["hand_sources"][0]["count"] == 2


def test_removing_the_villages_file_removes_every_trace_from_meta(tmp_path, grid):
    kwargs, meta = write_inputs(tmp_path, grid)
    other = {"layer": "ponds", "source": "DEM", "confidence": "inferred", "count": 3}
    meta["hand_sources"] = [other]
    (kwargs["out_dir"] / "meta.json").write_text(json.dumps(meta, indent=2))
    villages = write_villages(tmp_path)
    build_overlay(**kwargs, villages_path=villages)
    build_overlay(**kwargs, villages_path=tmp_path / "gone.json")
    new_meta = json.loads((kwargs["out_dir"] / "meta.json").read_text())
    assert "overlay_villages" not in new_meta
    assert new_meta["hand_sources"] == [other]


def test_removing_villages_drops_hand_sources_when_it_was_the_only_row(tmp_path, grid):
    kwargs, _ = write_inputs(tmp_path, grid)
    build_overlay(**kwargs, villages_path=write_villages(tmp_path))
    build_overlay(**kwargs)
    new_meta = json.loads((kwargs["out_dir"] / "meta.json").read_text())
    assert "hand_sources" not in new_meta and "overlay_villages" not in new_meta


def test_shipped_village_data_is_valid_and_uses_the_approved_wording():
    from yelamu.region import load_region

    root = Path(__file__).resolve().parent.parent
    region = load_region(root / "regions" / "full-city.json")
    villages = json.loads((root / "data/overlay/villages.json").read_text())
    landmarks = json.loads((root / "data/overlay/landmarks.json").read_text())
    hotspots = json.loads((root / "data/overlay/hotspots.json").read_text())
    validate_villages(villages, region.bbox)
    validate_unique_ids(landmarks, hotspots, villages)
    assert sorted(v["id"] for v in villages) == sorted(SHIPPED_VILLAGES)
    for v in villages:
        name, lon, lat, place = SHIPPED_VILLAGES[v["id"]]
        assert (v["name"], v["lon"], v["lat"]) == (name, lon, lat)
        assert v["radius_m"] == 530
        assert v["confidence"] == "inferred"
        assert v["description"] == CARD_TEXT.format(place=place)
        assert [s["url"] for s in v["sources"]] == [
            "https://storymaps.arcgis.com/stories/56b1d134920d46c6ac2462c1344eeb3f",
            "https://digitalcommons.csumb.edu/hornbeck_ind_1/6/",
        ]


def test_shipped_overlay_has_the_five_villages_and_unique_ids():
    root = Path(__file__).resolve().parent.parent
    assets = root.parent / "viewer/public/assets/real-city"
    overlay = json.loads((assets / "overlay.json").read_text())
    meta = json.loads((assets / "meta.json").read_text())
    villages = overlay["villages"]
    assert sorted(v["id"] for v in villages) == sorted(SHIPPED_VILLAGES)
    half_w, half_h = meta["width"] * meta["cell_m"] / 2, meta["height"] * meta["cell_m"] / 2
    for v in villages:
        assert v["radius_m"] == 530
        assert "kind" not in v
        assert -half_w <= v["x"] <= half_w and -half_h <= v["z"] <= half_h  # inside the city
        assert v["description"] == CARD_TEXT.format(place=SHIPPED_VILLAGES[v["id"]][3])
        assert v["confidence"] == "inferred"
    ids = [p["id"] for key in ("landmarks", "hotspots", "villages") for p in overlay[key]]
    assert len(ids) == len(set(ids))  # unique across the three lists
    assert meta["overlay_villages"] == 5
    rows = [r for r in meta["hand_sources"] if r["layer"] == "villages"]
    assert rows == [{"layer": "villages", "source": VILLAGES_SOURCE_NOTE,
                     "confidence": "inferred", "count": 5}]


# ------------------------------------------------------------------------ named creeks


CREEK_SFEI_ITEM = {
    "title": "SFEI, San Francisco Historical Creeks (Hidden Nature SF)",
    "url": "https://www.arcgis.com/home/item.html?id=b09c42756dd84305a919bccf46b0e88b",
}
CREEK_STORY_MAP = {
    "title": "Yelamu: the Native Peoples of San Francisco (SFEI Hidden Nature SF story map)",
    "url": "https://storymaps.arcgis.com/stories/56b1d134920d46c6ac2462c1344eeb3f",
}
CREEK_CARD_TEXT = (
    "{name}, a historical creek as mapped by SFEI's Hidden Nature SF, after {sources}. "
    "The line is approximate: creeks moved, and later streets and sewers buried or removed "
    "many of them."
)
# id: (name, cited sources, confidence, links)
SHIPPED_CREEKS = {
    "creek-arroyo-dolores": ("Arroyo Dolores", "Hoadley 1855; Goddard 1869", "documented",
                             [CREEK_SFEI_ITEM]),
    "creek-old-arroyo-dolores": ("Old Arroyo Dolores", "Hoadley 1855; Horner 1854; Seep City",
                                 "inferred", [CREEK_SFEI_ITEM]),
    "creek-chutchui": ("Chutchui Creek", "Hoadley 1855; Horner 1854; Goddard 1869; Seep City",
                       "inferred", [CREEK_SFEI_ITEM, CREEK_STORY_MAP]),
    "creek-petlenuc": ("Petlenuc Creek", "Hall 1870; Wheeler 1870", "documented",
                       [CREEK_SFEI_ITEM, CREEK_STORY_MAP]),
    "creek-ojo-de-agua-de-figueroa": ("Ojo de Agua de Figueroa",
                                      "USDC 1854; Sanchez 1854; Seep City", "inferred",
                                      [CREEK_SFEI_ITEM]),
    "creek-el-polin": ("El Polin", "Hall 1870; Wheeler 1870", "inferred", [CREEK_SFEI_ITEM]),
    "creek-coyote-gulch": ("Coyote Gulch", "Seep City; Warner 1847", "inferred",
                           [CREEK_SFEI_ITEM]),
}


def test_shipped_hotspots_hold_the_seven_named_creek_cards():
    from yelamu.region import load_region

    root = Path(__file__).resolve().parent.parent
    region = load_region(root / "regions" / "full-city.json")
    hotspots = {h["id"]: h for h in json.loads((root / "data/overlay/hotspots.json").read_text())}
    west, south, east, north = region.bbox
    for hid, (name, sources, confidence, links) in SHIPPED_CREEKS.items():
        assert hid in hotspots, hid
        h = hotspots[hid]
        assert h["name"] == name
        assert h["kind"] == "creek"
        assert 20 <= len(h["description"]) <= 400
        assert h["description"] == CREEK_CARD_TEXT.format(name=name, sources=sources)
        assert h["confidence"] == confidence
        assert h["sources"] == links
        assert all(s["url"].startswith(("http://", "https://")) for s in h["sources"])
        assert west <= h["lon"] <= east and south <= h["lat"] <= north
    assert "lobos-creek" in hotspots  # already had a card: not duplicated


def test_shipped_overlay_carries_the_seven_named_creek_cards():
    root = Path(__file__).resolve().parent.parent
    assets = root.parent / "viewer/public/assets/real-city"
    overlay = json.loads((assets / "overlay.json").read_text())
    meta = json.loads((assets / "meta.json").read_text())
    hotspots = {h["id"]: h for h in overlay["hotspots"]}
    half_w, half_h = meta["width"] * meta["cell_m"] / 2, meta["height"] * meta["cell_m"] / 2
    for hid, (name, sources, confidence, links) in SHIPPED_CREEKS.items():
        h = hotspots[hid]
        assert h["kind"] == "creek" and h["name"] == name and h["confidence"] == confidence
        assert h["description"] == CREEK_CARD_TEXT.format(name=name, sources=sources)
        assert h["sources"] == links
        assert -half_w <= h["x"] <= half_w and -half_h <= h["z"] <= half_h


# ------------------------------------------------------------------------------- CLI


def test_cli_main_builds_and_reports_errors(tmp_path, grid, capsys):
    from yelamu.overlay import main

    kwargs, _ = write_inputs(tmp_path, grid)
    (tmp_path / "regions").mkdir()
    region = tmp_path / "regions" / "r.json"
    region.write_text(json.dumps({"name": "t", "bbox": list(BBOX), "cell_m": CELL,
                                  "dem": "data/raw/dem.tif", "out": "elsewhere"}))
    argv = ["--region", str(region), "--tiger", str(kwargs["tiger_path"]),
            "--landmarks", str(kwargs["landmarks_path"]),
            "--hotspots", str(kwargs["hotspots_path"]), "--out", str(kwargs["out_dir"])]
    assert main(argv) == 0
    assert "2 streets" in capsys.readouterr().out
    assert json.loads((kwargs["out_dir"] / "overlay.json").read_text())["processing"]["promote_m"] == 6000.0
    assert main(argv + ["--promote-m", "0"]) == 0
    capsys.readouterr()
    assert json.loads((kwargs["out_dir"] / "overlay.json").read_text())["processing"]["promote_m"] == 0.0
    assert main(argv + ["--promote-m", "1500.5"]) == 0
    capsys.readouterr()
    assert json.loads((kwargs["out_dir"] / "overlay.json").read_text())["processing"]["promote_m"] == 1500.5
    assert json.loads((kwargs["out_dir"] / "meta.json").read_text())["overlay_file"] == "overlay.json"

    # --villages adds the village sites; an explicit file that is missing is an error.
    villages = write_villages(tmp_path)
    assert main(argv + ["--villages", str(villages)]) == 0
    assert "2 villages" in capsys.readouterr().out
    assert json.loads((kwargs["out_dir"] / "meta.json").read_text())["overlay_villages"] == 2
    assert main(argv + ["--villages", str(tmp_path / "missing.json")]) == 1
    assert "villages file not found" in capsys.readouterr().err

    # Without --out the region's own `out` ("elsewhere", no meta.json) is used -> clear error.
    assert main(argv[:-2]) == 1
    assert "meta.json" in capsys.readouterr().err


# ------------------------------------------------- villages: confidence, no-op meta, bad files


def write_villages_with(tmp_path: Path, *confidences: str) -> Path:
    path = tmp_path / "villages.json"
    path.write_text(json.dumps([
        vg(id=f"village-{i}", name=f"V{i}", confidence=c) for i, c in enumerate(confidences)
    ]))
    return path


def village_rows(out_dir: Path) -> list[dict]:
    meta = json.loads((out_dir / "meta.json").read_text())
    return [r for r in meta["hand_sources"] if r["layer"] == "villages"]


@pytest.mark.parametrize("levels, expected", [
    (("documented", "inferred"), "inferred"),
    (("inferred", "documented"), "inferred"),  # input order does not matter
    (("documented", "documented"), "documented"),
    (("inferred", "inferred"), "inferred"),
    (("documented", "illustrative", "inferred"), "illustrative"),
])
def test_villages_hand_sources_row_takes_the_lowest_confidence(tmp_path, grid, levels, expected):
    kwargs, _ = write_inputs(tmp_path, grid)
    build_overlay(**kwargs, villages_path=write_villages_with(tmp_path, *levels))
    rows = village_rows(kwargs["out_dir"])
    assert len(rows) == 1  # one row for the layer, however the villages differ
    assert rows[0]["confidence"] == expected
    assert rows[0]["count"] == len(levels)


def test_noop_rebuild_leaves_meta_json_byte_identical(tmp_path, grid):
    kwargs, _ = write_inputs(tmp_path, grid)
    villages = write_villages_with(tmp_path, "inferred", "inferred")
    meta_path = kwargs["out_dir"] / "meta.json"
    build_overlay(**kwargs, villages_path=villages)
    before = meta_path.read_bytes()
    build_overlay(**kwargs, villages_path=villages)
    assert meta_path.read_bytes() == before


def test_noop_rebuild_does_not_rewrite_an_already_patched_meta_in_another_layout(tmp_path, grid):
    # The patch is a no-op, so meta.json must not be touched at all, even if it was written
    # compactly (a rewrite would re-indent it and change the bytes).
    kwargs, _ = write_inputs(tmp_path, grid)
    villages = write_villages_with(tmp_path, "inferred")
    meta_path = kwargs["out_dir"] / "meta.json"
    build_overlay(**kwargs, villages_path=villages)
    compact = json.dumps(json.loads(meta_path.read_text()), separators=(",", ":")).encode()
    meta_path.write_bytes(compact)
    build_overlay(**kwargs, villages_path=villages)
    assert meta_path.read_bytes() == compact


def test_patch_overlay_meta_twice_is_a_fixed_point_and_never_mutates_its_input():
    from yelamu.overlay import patch_overlay_meta

    meta = {"width": 1, "hand_sources": [{"layer": "ponds", "source": "s", "confidence": "inferred",
                                          "count": 1}]}
    snapshot = json.dumps(meta, sort_keys=True)
    villages = [vg(), vg(id="village-two", name="Two")]
    once = patch_overlay_meta(meta, villages)
    assert json.dumps(meta, sort_keys=True) == snapshot
    twice = patch_overlay_meta(once, villages)
    assert json.dumps(twice) == json.dumps(once)  # same keys, same order, same bytes


def test_an_empty_villages_file_is_a_clear_error_and_writes_nothing(tmp_path, grid):
    kwargs, _ = write_inputs(tmp_path, grid)
    meta_path = kwargs["out_dir"] / "meta.json"
    meta_before = meta_path.read_bytes()
    villages = tmp_path / "villages.json"
    villages.write_bytes(b"")
    assert villages.stat().st_size == 0
    with pytest.raises(ValueError, match=r"villages\.json.*not valid JSON"):
        build_overlay(**kwargs, villages_path=villages)
    assert not (kwargs["out_dir"] / "overlay.json").exists()
    assert meta_path.read_bytes() == meta_before


def test_villages_file_that_is_not_a_list_is_rejected(tmp_path, grid):
    kwargs, _ = write_inputs(tmp_path, grid)
    for body in ("{}", "null", '"x"', "5"):
        villages = tmp_path / "villages.json"
        villages.write_text(body)
        with pytest.raises(ValueError):
            build_overlay(**kwargs, villages_path=villages)
    assert not (kwargs["out_dir"] / "overlay.json").exists()


def test_village_description_length_counts_utf16_units_like_the_viewer():
    star = "\U0001F332"  # one code point, two UTF-16 units
    validate_villages([vg(description=star * 200)], BBOX)  # exactly 400 units
    validate_villages([vg(description=star * 199 + "x" * 2)], BBOX)  # 400 units, mixed
    with pytest.raises(ValueError, match="the-id.*description"):
        validate_villages([vg(id="the-id", description=star * 200 + "x")], BBOX)  # 401 units
    with pytest.raises(ValueError, match="the-id.*description"):
        validate_villages([vg(id="the-id", description=star * 201)], BBOX)  # 402 units, 201 code points


def test_village_description_minimum_counts_utf16_units_too():
    star = "\U0001F332"
    validate_villages([vg(description=star * 10)], BBOX)  # 20 units, only 10 code points
    with pytest.raises(ValueError, match="description"):
        validate_villages([vg(description=star * 9 + "x")], BBOX)  # 19 units
