"""Provenance enforcement: hand-drawn inputs must say where they came from."""

import json

import pytest
from shapely.geometry import Point

from yelamu.export import CONFIDENCE_LEVELS
from yelamu.geo import lonlat_to_utm
from yelamu.provenance import (
    hand_source_rows,
    layer_source_summary,
    lowest_confidence,
)
from yelamu.sources import Feature, load_features, load_polygons

SQUARE = [[[-122.40, 37.77], [-122.39, 37.77], [-122.39, 37.78], [-122.40, 37.78],
           [-122.40, 37.77]]]
OTHER = [[[-122.38, 37.77], [-122.37, 37.77], [-122.37, 37.78], [-122.38, 37.78],
          [-122.38, 37.77]]]


def _write(path, features):
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    return path


def _feat(props, ring=SQUARE):
    return {"type": "Feature", "properties": props,
            "geometry": {"type": "Polygon", "coordinates": ring}}


GOOD = {"source": "US Coast Survey T-sheet 1853", "confidence": "inferred"}


def test_load_features_returns_utm_geometry_and_provenance(tmp_path):
    path = _write(tmp_path / "h.geojson", [_feat({**GOOD, "name": "Mission Bay", "x": 1})])
    (f,) = load_features(path, require_provenance=True)
    assert isinstance(f, Feature)
    assert f.source == "US Coast Survey T-sheet 1853" and f.confidence == "inferred"
    assert f.properties["name"] == "Mission Bay" and f.properties["x"] == 1
    x, y = lonlat_to_utm(-122.395, 37.775)
    assert f.geometry.contains(Point(x, y))
    assert [p.geom_type for p in f.polygons] == ["Polygon"]


def test_load_features_without_provenance_flag_does_not_require_properties(tmp_path):
    path = _write(tmp_path / "h.geojson", [_feat({}), _feat({"source": "  s  "}, OTHER)])
    feats = load_features(path)
    assert len(feats) == 2
    assert feats[0].source is None and feats[0].confidence is None
    assert feats[1].source == "s"  # stripped


@pytest.mark.parametrize("props,needle", [
    ({}, "source"),
    ({"confidence": "inferred"}, "source"),
    ({"source": "", "confidence": "inferred"}, "source"),
    ({"source": "   ", "confidence": "inferred"}, "source"),
    ({"source": 5, "confidence": "inferred"}, "source"),
    ({"source": "x" * 201, "confidence": "inferred"}, "200"),
    ({"source": "ok"}, "confidence"),
    ({"source": "ok", "confidence": "high"}, "confidence"),
    ({"source": "ok", "confidence": None}, "confidence"),
])
def test_missing_or_bad_provenance_is_an_error_naming_file_and_feature(tmp_path, props, needle):
    path = _write(tmp_path / "hand.geojson", [_feat(GOOD), _feat({**props, "name": "Foo Cove"}, OTHER)])
    with pytest.raises(ValueError) as exc:
        load_features(path, require_provenance=True)
    msg = str(exc.value)
    assert "hand.geojson" in msg and "feature 1" in msg and "Foo Cove" in msg
    assert needle in msg


def test_source_of_exactly_200_chars_is_accepted(tmp_path):
    path = _write(tmp_path / "h.geojson", [_feat({"source": "x" * 200, "confidence": "documented"})])
    assert len(load_features(path, require_provenance=True)) == 1


@pytest.mark.parametrize("level", CONFIDENCE_LEVELS)
def test_all_confidence_levels_are_accepted(tmp_path, level):
    path = _write(tmp_path / "h.geojson", [_feat({"source": "s", "confidence": level})])
    assert load_features(path, require_provenance=True)[0].confidence == level


def test_empty_file_allowed_only_on_request(tmp_path):
    path = _write(tmp_path / "e.geojson", [])
    assert load_features(path, allow_empty=True, require_provenance=True) == []
    with pytest.raises(ValueError, match="e.geojson"):
        load_features(path)


def test_features_without_polygon_geometry_are_skipped_not_provenance_errors(tmp_path):
    line = {"type": "Feature", "properties": {},
            "geometry": {"type": "LineString", "coordinates": [[-122.4, 37.7], [-122.3, 37.8]]}}
    path = _write(tmp_path / "m.geojson", [line, {"type": "Feature", "properties": {}, "geometry": None},
                                          _feat(GOOD)])
    assert len(load_features(path, require_provenance=True)) == 1


def test_multipolygon_and_invalid_polygons_are_cleaned(tmp_path):
    bowtie = [[[-122.40, 37.77], [-122.39, 37.78], [-122.39, 37.77], [-122.40, 37.78],
               [-122.40, 37.77]]]
    multi = {"type": "Feature", "properties": GOOD, "geometry": {
        "type": "MultiPolygon", "coordinates": [SQUARE, OTHER]}}
    path = _write(tmp_path / "m.geojson", [multi, _feat(GOOD, bowtie)])
    a, b = load_features(path, require_provenance=True)
    assert len(a.polygons) == 2 and a.geometry.is_valid
    assert b.geometry.is_valid and len(b.polygons) == 2


def test_load_polygons_is_unchanged_and_ignores_properties(tmp_path):
    path = _write(tmp_path / "h.geojson", [_feat({})])
    assert len(load_polygons(path)) == 1


# ------------------------------------------------------------------ summaries


def test_lowest_confidence_orders_illustrative_inferred_documented():
    assert lowest_confidence(["documented", "inferred"]) == "inferred"
    assert lowest_confidence(["documented", "illustrative", "inferred"]) == "illustrative"
    assert lowest_confidence(["documented"]) == "documented"
    with pytest.raises(ValueError):
        lowest_confidence([])


def test_layer_source_summary_lists_distinct_sorted_sources_and_truncates():
    text = layer_source_summary("hand-drawn", ["B sheet", "A sheet", "A sheet"])
    assert text == "hand-drawn from 2 sources: A sheet; B sheet"
    assert layer_source_summary("hand-drawn", ["Only"]) == "hand-drawn from 1 source: Only"
    long = layer_source_summary("hand-drawn", ["s" * 200, "t" * 200])
    assert len(long) == 300 and long.endswith("...")


def test_hand_source_rows_group_count_and_sort():
    rows = hand_source_rows("hand_water", [("B", "inferred"), ("A", "documented"), ("B", "inferred")])
    assert rows == [
        {"layer": "hand_water", "source": "A", "confidence": "documented", "count": 1},
        {"layer": "hand_water", "source": "B", "confidence": "inferred", "count": 2},
    ]
    assert hand_source_rows("x", []) == []
