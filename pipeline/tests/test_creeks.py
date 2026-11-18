import json
import math

import numpy as np
import pytest

from yelamu.geo import Grid
from yelamu.creeks import (
    BAY_CLASS_NAMES,
    bay_mask,
    chain_segments,
    mapped_confidence,
    project_line,
    read_geojson_lines,
    simplify_line,
    trim_to_land,
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
