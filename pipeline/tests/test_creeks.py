import json
import math

import numpy as np
import pytest

from yelamu.geo import Grid
from yelamu.creeks import (
    BAY_CLASS_NAMES,
    CREEKS_FILE,
    MAX_CREEK_POINTS,
    MAX_MAPPED,
    MAX_MODELLED,
    MAX_NAME_CHARS,
    MAX_SOURCE_CHARS,
    bay_mask,
    build_creeks,
    build_creeks_document,
    chain_segments,
    mapped_confidence,
    patch_creeks_meta,
    project_line,
    read_geojson_lines,
    simplify_line,
    trim_to_land,
    validate_creeks_document,
)

BBOX = (-122.45, 37.75, -122.40, 37.80)
CELL = 10.0


@pytest.fixture(scope="module")
def grid() -> Grid:
    return Grid.from_lonlat_bbox(*BBOX, cell=CELL)


def test_project_line_uses_the_overlay_world_frame(grid):
    from yelamu.overlay import lonlat_to_world

    out = project_line(grid, [(-122.43, 37.77), (-122.42, 37.78)])
    assert out[0] == pytest.approx(lonlat_to_world(grid, -122.43, 37.77))
    assert out[1] == pytest.approx(lonlat_to_world(grid, -122.42, 37.78))


def test_read_geojson_lines_accepts_lines_and_multilines(tmp_path):
    doc = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {"OBJECTID": 1},
             "geometry": {"type": "LineString", "coordinates": [[-122.43, 37.77], [-122.42, 37.78]]}},
            {"type": "Feature", "properties": {"OBJECTID": 2},
             "geometry": {"type": "MultiLineString",
                          "coordinates": [[[-122.43, 37.77], [-122.42, 37.78]],
                                          [[-122.41, 37.77, 5.0], [-122.40, 37.78, 5.0]]]}},
        ],
    }
    p = tmp_path / "c.geojson"
    p.write_text(json.dumps(doc))
    feats = read_geojson_lines(p)
    assert [len(f["lines"]) for f in feats] == [1, 2]
    assert feats[1]["lines"][1] == [(-122.41, 37.77), (-122.40, 37.78)]
    assert feats[0]["props"]["OBJECTID"] == 1


def test_read_geojson_lines_rejects_other_geometry(tmp_path):
    doc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {}, "geometry": {"type": "Point", "coordinates": [0, 0]}}]}
    p = tmp_path / "c.geojson"
    p.write_text(json.dumps(doc))
    with pytest.raises(ValueError, match="feature 0.*line"):
        read_geojson_lines(p)


def test_mapped_confidence_follows_sfei_well_located():
    assert mapped_confidence({"stream_typ": "well located"}) == "documented"
    assert mapped_confidence({"stream_typ": " Well Located "}) == "documented"
    assert mapped_confidence({"stream_typ": '"Sometimes dry" (Presidio)'}) == "inferred"
    assert mapped_confidence({"stream_typ": None}) == "inferred"
    assert mapped_confidence({}) == "inferred"


def test_simplify_keeps_the_ends_and_drops_collinear_points():
    pts = [(0.0, 0.0), (10.0, 0.01), (20.0, 0.0), (30.0, 0.0)]
    out = simplify_line(pts, 3.0)
    assert out[0] == (0.0, 0.0) and out[-1] == (30.0, 0.0)
    assert len(out) == 2
    assert simplify_line([(0.0, 0.0), (5.0, 5.0)], 3.0) == [(0.0, 0.0), (5.0, 5.0)]


def test_bay_mask_marks_only_the_bay_and_ocean_classes():
    classes = [
        {"id": 0, "group": "unmapped", "name": "Unmapped"},
        {"id": 1, "group": "water", "name": "Open bay (inferred from modern elevation)"},
        {"id": 4, "group": "water", "name": "Pond (hand-drawn)"},
        {"id": 13, "group": "water", "name": "Deep ocean/bay"},
        {"id": 32, "group": "marsh", "name": "Tidal marsh"},
    ]
    habitat = np.array([[0, 1, 4], [13, 32, 0]], dtype=np.uint8)
    assert bay_mask(habitat, classes).tolist() == [[False, True, False], [True, False, False]]
    assert "Bay (hand-drawn)" in BAY_CLASS_NAMES


def _mask(rows=20, cols=20):
    return np.zeros((rows, cols), dtype=bool)


def test_trim_keeps_dry_runs_and_cuts_at_the_bay():
    # 20 x 20 grid, cell 10 m: world x = (col - 9.5) * 10. The right third is bay.
    bay = _mask()
    bay[:, 14:] = True
    line = [(-85.0 + 10 * i, 0.0) for i in range(20)]  # col 0 .. 19 along row ~9/10
    runs = trim_to_land(line, bay, 20, 20, 10.0, min_length_m=0.0)
    assert len(runs) == 1
    assert runs[0][0] == line[0]
    assert all(x < 45.0 for x, _ in runs[0])  # nothing at or beyond col 14 (x = 45)


def test_trim_splits_a_line_that_crosses_a_bay_inlet_and_drops_short_pieces():
    bay = _mask()
    bay[:, 9:11] = True  # a two-column inlet in the middle
    line = [(-95.0 + 10 * i, 0.0) for i in range(20)]
    assert len(trim_to_land(line, bay, 20, 20, 10.0, min_length_m=0.0)) == 2
    assert trim_to_land(line, bay, 20, 20, 10.0, min_length_m=500.0) == []


def test_trim_treats_points_outside_the_grid_as_wet():
    bay = _mask()
    line = [(-500.0, 0.0), (-400.0, 0.0), (0.0, 0.0), (10.0, 0.0), (900.0, 0.0)]
    runs = trim_to_land(line, bay, 20, 20, 10.0, min_length_m=0.0)
    assert runs == [[(0.0, 0.0), (10.0, 0.0)]]


def test_chain_merges_segments_of_one_order_that_meet_end_to_end():
    segs = [
        (3, [(0.0, 0.0), (10.0, 0.0)]),
        (3, [(10.0, 0.0), (20.0, 5.0)]),
        (3, [(30.0, 0.0), (20.0, 5.0)]),  # reversed direction on purpose
    ]
    out = chain_segments(segs)
    assert len(out) == 1
    order, pts = out[0]
    assert order == 3 and len(pts) == 4
    ends = {pts[0], pts[-1]}
    assert ends == {(0.0, 0.0), (30.0, 0.0)}


def test_chain_does_not_merge_across_a_confluence_or_across_orders():
    # three segments meet at (10, 0): a confluence stays as separate channels
    y = [(3, [(0.0, 0.0), (10.0, 0.0)]), (3, [(0.0, 10.0), (10.0, 0.0)]), (4, [(10.0, 0.0), (20.0, 0.0)])]
    assert len(chain_segments(y)) == 3
    # two segments meet end to end but have different orders
    two = [(3, [(0.0, 0.0), (10.0, 0.0)]), (4, [(10.0, 0.0), (20.0, 0.0)])]
    assert len(chain_segments(two)) == 2


def test_chain_is_deterministic_and_does_not_change_its_input():
    segs = [(3, [(i * 10.0, 0.0), (i * 10.0 + 10.0, 0.0)]) for i in range(8)]
    before = json.dumps(segs)
    a = chain_segments(segs)
    b = chain_segments(list(reversed(segs)))
    assert json.dumps(segs) == before
    assert len(a) == len(b) == 1
    assert sorted([a[0][1][0], a[0][1][-1]]) == sorted([b[0][1][0], b[0][1][-1]])
    assert len(a[0][1]) == 9


def test_chain_ignores_a_loop_of_one_segment():
    seg = [(3, [(0.0, 0.0), (10.0, 0.0), (0.0, 0.0)])]
    assert len(chain_segments(seg)) == 1


# --------------------------------------------------------------- document build and validation
# A 100 x 100 world: grid built from a lon/lat box small enough to hold a few creeks.


def _feature(oid, coords, **props):
    return {"props": {"OBJECTID": oid, **props}, "lines": [coords]}


def _dry(grid):
    return np.zeros((grid.height, grid.width), dtype=bool)


def _lonlat_line(grid, x0, z0, x1, z1):
    """A lon/lat line whose projected ends are the world points (x0, z0) and (x1, z1)."""
    from pyproj import Transformer

    back = Transformer.from_crs("EPSG:32610", "EPSG:4326", always_xy=True)
    out = []
    for x, z in ((x0, z0), (x1, z1)):
        e = x + (grid.west + grid.east) / 2
        n = (grid.north + grid.south) / 2 - z
        out.append(tuple(back.transform(e, n)))
    return out


def test_document_has_mapped_and_modelled_in_viewer_frame(grid):
    mapped = [
        _feature(9, _lonlat_line(grid, -300, 0, 300, 0), NAME1="Chutchui Creek", stream_typ="well located",
                 S_Interp1="Hoadley 1855; Goddard 1869"),
        _feature(3, _lonlat_line(grid, -300, 100, 300, 100), NAME1="  ", stream_typ="", S_Interp1=None),
    ]
    modelled = [
        {"order": 4, "line": _lonlat_line(grid, -200, 500, 0, 500)},
        {"order": 4, "line": _lonlat_line(grid, 0, 500, 200, 500)},
        {"order": 2, "line": _lonlat_line(grid, -200, 600, 200, 600)},
    ]
    doc, stats = build_creeks_document(grid, mapped, modelled, _dry(grid), min_order=3, tolerance_m=3.0)
    assert doc["version"] == 1
    assert [c["id"] for c in doc["mapped"]] == ["creek-3", "creek-9"]  # sorted by OBJECTID
    chutchui = doc["mapped"][1]
    assert chutchui["name"] == "Chutchui Creek" and chutchui["confidence"] == "documented"
    assert chutchui["sources"] == "Hoadley 1855; Goddard 1869"
    assert chutchui["points"][0] == pytest.approx(-300.0, abs=0.2)
    assert doc["mapped"][0]["name"] is None and doc["mapped"][0]["confidence"] == "inferred"
    assert doc["mapped"][0]["sources"] == ""
    # order 2 dropped; the two order-4 pieces are one channel
    assert [m["order"] for m in doc["modelled"]] == [4]
    assert len(doc["modelled"][0]["points"]) == 4  # simplified to the two ends
    assert stats == {"mapped": 2, "modelled": 1, "modelled_segments": 2, "dropped_low_order": 1}
    validate_creeks_document(doc)


def test_points_are_rounded_to_a_tenth_of_a_metre(grid):
    mapped = [_feature(1, _lonlat_line(grid, -300.123456, 0.987654, 300.0, 0.0))]
    doc, _ = build_creeks_document(grid, mapped, [], _dry(grid))
    assert all(round(v, 1) == v for v in doc["mapped"][0]["points"])


def _dense_lonlat_line(grid, x0, z0, x1, z1, step=20.0):
    """Like _lonlat_line but with a vertex about every `step` metres (trimming looks at vertices)."""
    n = max(2, int(math.hypot(x1 - x0, z1 - z0) / step) + 1)
    pts = [_lonlat_line(grid, x0 + (x1 - x0) * i / (n - 1), z0 + (z1 - z0) * i / (n - 1),
                        x0 + (x1 - x0) * i / (n - 1), z0 + (z1 - z0) * i / (n - 1))[0] for i in range(n)]
    return pts


def test_lines_are_trimmed_at_the_bay(grid):
    bay = _dry(grid)
    # everything east of the grid centre is bay
    bay[:, grid.width // 2:] = True
    mapped = [_feature(1, _dense_lonlat_line(grid, -400, 0, 400, 0))]
    doc, _ = build_creeks_document(grid, mapped, [], bay)
    pts = doc["mapped"][0]["points"]
    assert pts[0] == pytest.approx(-400.0, abs=0.2)
    assert pts[-2] < 25.0  # the line ends at the shore (x about 0), not at x = 400


def test_a_mapped_line_entirely_in_the_bay_is_dropped_and_counted(grid):
    bay = np.ones((grid.height, grid.width), dtype=bool)
    mapped = [_feature(1, _lonlat_line(grid, -400, 0, 400, 0))]
    doc, stats = build_creeks_document(grid, mapped, [], bay)
    assert doc["mapped"] == [] and stats["mapped"] == 0


def test_validate_rejects_what_the_viewer_would_reject():
    good = {"version": 1, "mapped": [{"id": "creek-1", "name": None, "confidence": "inferred",
                                      "sources": "", "points": [0.0, 0.0, 10.0, 0.0]}],
            "modelled": [{"order": 3, "points": [0.0, 0.0, 10.0, 0.0]}]}
    validate_creeks_document(good)

    def bad(mutate, match):
        doc = json.loads(json.dumps(good))
        mutate(doc)
        with pytest.raises(ValueError, match=match):
            validate_creeks_document(doc)

    bad(lambda d: d.update(version=2), "version")
    bad(lambda d: d["mapped"][0].update(id="Creek 1"), "id")
    bad(lambda d: d["mapped"].append(dict(d["mapped"][0])), "duplicate")
    bad(lambda d: d["mapped"][0].update(confidence="certain"), "confidence")
    bad(lambda d: d["mapped"][0].update(name="N" * (MAX_NAME_CHARS + 1)), "name")
    bad(lambda d: d["mapped"][0].update(sources="s" * (MAX_SOURCE_CHARS + 1)), "sources")
    bad(lambda d: d["mapped"][0].update(points=[0.0, 0.0, 1.0]), "points")
    bad(lambda d: d["mapped"][0].update(points=[0.0, 0.0]), "points")
    bad(lambda d: d["mapped"][0].update(points=[0.0, 0.0, float("nan"), 1.0]), "finite")
    bad(lambda d: d["mapped"][0].update(points=[0.0, 0.0, 2e6, 1.0]), "range")
    bad(lambda d: d["modelled"][0].update(order=0), "order")
    bad(lambda d: d["modelled"][0].update(order=9), "order")
    bad(lambda d: d.update(mapped=[dict(good["mapped"][0], id=f"c{i}") for i in range(MAX_MAPPED + 1)]), "mapped")
    bad(lambda d: d.update(modelled=[good["modelled"][0]] * (MAX_MODELLED + 1)), "modelled")
    assert MAX_CREEK_POINTS == 400_000


def test_meta_patch_sets_file_counts_and_two_rows_and_keeps_everything_else():
    doc = {"mapped": [{"confidence": "documented"}, {"confidence": "inferred"}],
           "modelled": [{"order": 3}, {"order": 5}, {"order": 4}]}
    meta = {"width": 5, "hand_sources": [{"layer": "ponds", "source": "x", "confidence": "inferred", "count": 3}],
            "overlay_villages": 5}
    out = patch_creeks_meta(meta, doc)
    assert meta == {"width": 5, "hand_sources": [{"layer": "ponds", "source": "x", "confidence": "inferred", "count": 3}],
                    "overlay_villages": 5}  # input untouched
    assert out["creeks_file"] == CREEKS_FILE and out["creeks_mapped"] == 2 and out["creeks_modelled"] == 3
    assert out["overlay_villages"] == 5 and out["width"] == 5
    rows = {r["layer"]: r for r in out["hand_sources"]}
    assert set(rows) == {"ponds", "creeks", "modelled_streams"}
    assert rows["creeks"]["count"] == 2 and rows["creeks"]["confidence"] == "inferred"
    assert rows["modelled_streams"]["count"] == 3 and rows["modelled_streams"]["confidence"] == "illustrative"
    assert patch_creeks_meta(out, doc) == out  # idempotent


def test_meta_patch_with_nothing_removes_every_trace():
    doc = {"mapped": [{"confidence": "inferred"}], "modelled": []}
    with_creeks = patch_creeks_meta({"width": 5}, doc)
    assert "creeks_mapped" in with_creeks
    assert with_creeks["creeks_modelled"] == 0
    gone = patch_creeks_meta(with_creeks, None)
    assert gone == {"width": 5}
    only_modelled = patch_creeks_meta({}, {"mapped": [], "modelled": [{"order": 3}]})
    assert [r["layer"] for r in only_modelled["hand_sources"]] == ["modelled_streams"]


def _write_assets(tmp_path, grid, classes=None):
    meta = {"width": grid.width, "height": grid.height, "cell_m": grid.cell,
            "west": grid.west, "south": grid.south, "east": grid.east, "north": grid.north,
            "habitat_file": "habitat.u8",
            "habitat_classes": classes or [{"id": 0, "group": "unmapped", "name": "Unmapped"}]}
    (tmp_path / "meta.json").write_text(json.dumps(meta))
    (tmp_path / "habitat.u8").write_bytes(bytes(grid.width * grid.height))
    return meta


def _geojson(path, features):
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))


def _gj_line(coords, **props):
    return {"type": "Feature", "properties": props, "geometry": {"type": "LineString", "coordinates": coords}}


def test_build_creeks_writes_the_file_and_patches_meta(tmp_path, grid):
    _write_assets(tmp_path, grid)
    mapped_path = tmp_path / "mapped.geojson"
    _geojson(mapped_path, [_gj_line([list(c) for c in _lonlat_line(grid, -300, 0, 300, 0)],
                                    OBJECTID=7, NAME1="Test Creek", stream_typ="well located")])
    modelled_path = tmp_path / "modelled.geojson"
    _geojson(modelled_path, [_gj_line([list(c) for c in _lonlat_line(grid, -200, 400, 200, 400)],
                                      StrahlerID=4)])
    doc = build_creeks(tmp_path, mapped_path, modelled_path)
    written = json.loads((tmp_path / CREEKS_FILE).read_text())
    assert written == doc and doc["mapped"][0]["id"] == "creek-7"
    meta = json.loads((tmp_path / "meta.json").read_text())
    assert meta["creeks_mapped"] == 1 and meta["creeks_modelled"] == 1 and meta["creeks_file"] == CREEKS_FILE
    # re-running is a no-op
    before = (tmp_path / "meta.json").read_text(), (tmp_path / CREEKS_FILE).read_text()
    build_creeks(tmp_path, mapped_path, modelled_path)
    assert ((tmp_path / "meta.json").read_text(), (tmp_path / CREEKS_FILE).read_text()) == before


def test_build_creeks_remove_deletes_the_file_and_the_meta_entries(tmp_path, grid):
    _write_assets(tmp_path, grid)
    mapped_path = tmp_path / "mapped.geojson"
    _geojson(mapped_path, [_gj_line([list(c) for c in _lonlat_line(grid, -300, 0, 300, 0)], OBJECTID=7)])
    build_creeks(tmp_path, mapped_path, None)
    assert (tmp_path / CREEKS_FILE).exists()
    build_creeks(tmp_path, None, None, remove=True)
    assert not (tmp_path / CREEKS_FILE).exists()
    meta = json.loads((tmp_path / "meta.json").read_text())
    assert not any(k.startswith("creeks_") for k in meta) and "hand_sources" not in meta


def test_build_creeks_without_modelled_input_has_no_modelled_row(tmp_path, grid):
    _write_assets(tmp_path, grid)
    mapped_path = tmp_path / "mapped.geojson"
    _geojson(mapped_path, [_gj_line([list(c) for c in _lonlat_line(grid, -300, 0, 300, 0)], OBJECTID=7)])
    build_creeks(tmp_path, mapped_path, None)
    meta = json.loads((tmp_path / "meta.json").read_text())
    assert [r["layer"] for r in meta["hand_sources"]] == ["creeks"] and meta["creeks_modelled"] == 0


def test_build_creeks_reports_a_missing_meta_clearly(tmp_path, grid):
    with pytest.raises(FileNotFoundError, match="meta.json"):
        build_creeks(tmp_path, tmp_path / "x.geojson", None)
