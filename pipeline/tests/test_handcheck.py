import json

import pytest

from yelamu.handcheck import check_file, format_report, main

BBOX = (-122.53, 37.70, -122.33, 37.84)
GOOD = {"source": "T-sheet 1853", "confidence": "inferred"}


def sq(lon0, lat0, lon1, lat1):
    return {"type": "Polygon", "coordinates": [[[lon0, lat0], [lon1, lat0], [lon1, lat1],
                                                 [lon0, lat1], [lon0, lat0]]]}


def feat(geom, **props):
    return {"type": "Feature", "properties": props, "geometry": geom}


def write(tmp_path, features, name="h.geojson"):
    path = tmp_path / name
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    return path


def test_clean_file_reports_counts_area_and_provenance(tmp_path):
    # 0.01 deg x 0.01 deg is about 0.88 km x 1.11 km = 98 ha
    path = write(tmp_path, [feat(sq(-122.40, 37.77, -122.39, 37.78), **GOOD),
                            feat(sq(-122.38, 37.77, -122.37, 37.78), source="Other", confidence="documented")])
    r = check_file(path, BBOX)
    assert r.ok and r.n_features == 2 and r.n_polygonal == 2
    assert 190 < r.area_ha < 205
    assert dict(r.sources) == {"T-sheet 1853": 1, "Other": 1}
    assert dict(r.confidences) == {"inferred": 1, "documented": 1}
    assert r.warnings == []
    text = format_report(r)
    assert "features: 2" in text and "ha" in text and "T-sheet 1853" in text and "OK" in text


def test_empty_file_is_fine(tmp_path):
    r = check_file(write(tmp_path, []), BBOX)
    assert r.ok and r.n_features == 0
    assert "empty" in format_report(r)


def test_missing_provenance_is_a_problem_for_every_offender(tmp_path):
    path = write(tmp_path, [feat(sq(-122.40, 37.77, -122.39, 37.78)),
                            feat(sq(-122.38, 37.77, -122.37, 37.78), name="Cove", source="x"),
                            feat(sq(-122.36, 37.77, -122.35, 37.78), **GOOD)])
    r = check_file(path, BBOX)
    assert not r.ok and len(r.problems) == 2
    assert "feature 0" in r.problems[0] and "source" in r.problems[0]
    assert "feature 1" in r.problems[1] and "Cove" in r.problems[1] and "confidence" in r.problems[1]


def test_invalid_geometry_is_reported(tmp_path):
    bowtie = {"type": "Polygon", "coordinates": [[[-122.40, 37.77], [-122.39, 37.78],
                                                  [-122.39, 37.77], [-122.40, 37.78], [-122.40, 37.77]]]}
    r = check_file(write(tmp_path, [feat(bowtie, **GOOD)]), BBOX)
    assert not r.ok and "invalid geometry" in r.problems[0]


def test_outside_bbox_entirely_fails_partly_warns(tmp_path):
    path = write(tmp_path, [feat(sq(-121.0, 37.0, -120.9, 37.1), **GOOD),
                            feat(sq(-122.36, 37.80, -122.30, 37.85), **GOOD),
                            feat(sq(-122.40, 37.77, -122.39, 37.78), **GOOD)])
    r = check_file(path, BBOX)
    assert len(r.problems) == 1 and "feature 0" in r.problems[0] and "outside" in r.problems[0]
    assert any("feature 1" in w and "partly outside" in w for w in r.warnings)
    # Without a bbox the check is skipped
    assert check_file(path, None).ok


def test_overlaps_over_half_a_hectare_warn_smaller_do_not(tmp_path):
    a = sq(-122.40, 37.77, -122.39, 37.78)
    path = write(tmp_path, [feat(a, **GOOD),
                            feat(sq(-122.395, 37.775, -122.385, 37.785), **GOOD),   # ~25 ha overlap
                            feat(sq(-122.2000, 37.77, -122.1999, 37.78), **GOOD)])
    r = check_file(path, None)
    overlaps = [w for w in r.warnings if w.startswith("overlap")]
    assert len(overlaps) == 1 and "feature 0" in overlaps[0] and "feature 1" in overlaps[0]
    tiny = write(tmp_path, [feat(a, **GOOD), feat(sq(-122.39001, 37.77, -122.38, 37.78), **GOOD)],
                 "t.geojson")  # ~0.9 m x 1.1 km = 0.1 ha
    assert [w for w in check_file(tiny, None).warnings if w.startswith("overlap")] == []


def test_unreadable_files_fail(tmp_path):
    (tmp_path / "bad.geojson").write_text("{nope")
    assert not check_file(tmp_path / "bad.geojson", BBOX).ok
    assert not check_file(tmp_path / "absent.geojson", BBOX).ok
    (tmp_path / "num.geojson").write_text("[1,2]")
    assert not check_file(tmp_path / "num.geojson", BBOX).ok


def test_non_polygon_features_are_ignored_with_a_warning(tmp_path):
    line = {"type": "LineString", "coordinates": [[-122.4, 37.7], [-122.3, 37.8]]}
    r = check_file(write(tmp_path, [feat(line, **GOOD), feat(sq(-122.40, 37.77, -122.39, 37.78), **GOOD)]), BBOX)
    assert r.ok and r.n_features == 2 and r.n_polygonal == 1
    assert any("no polygon geometry" in w for w in r.warnings)


def test_cli_exit_codes(tmp_path, capsys):
    region = tmp_path / "pipeline" / "regions"
    region.mkdir(parents=True)
    (region / "r.json").write_text(json.dumps(
        {"name": "t", "bbox": list(BBOX), "cell_m": 10, "dem": "d.tif", "out": "o"}))
    good = write(tmp_path, [feat(sq(-122.40, 37.77, -122.39, 37.78), **GOOD)], "good.geojson")
    bad = write(tmp_path, [feat(sq(-122.40, 37.77, -122.39, 37.78))], "bad.geojson")
    assert main([str(good), "--region", str(region / "r.json")]) == 0
    out = capsys.readouterr().out
    assert "good.geojson" in out and "OK" in out
    assert main([str(good), str(bad), "--region", str(region / "r.json")]) == 1
    assert "FAILED" in capsys.readouterr().out
    assert main([str(good)]) == 0  # region is optional
    assert main([str(good), "--region", str(tmp_path / "nope.json")]) == 1


def test_the_shipped_empty_hand_files_pass():
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    files = sorted((root / "data/full-city/hand").glob("*.geojson"))
    assert {f.name for f in files} == {"hand_bay.geojson", "hand_marsh.geojson", "hand_ponds.geojson"}
    assert main([*map(str, files), "--region", str(root / "regions/full-city.json")]) == 0


@pytest.mark.parametrize("props,needle", [
    ({"level_m": "high"}, "level_m"),
    ({"level_m": True}, "level_m"),
    ({"level_m": 1000.5}, "level_m"),
    ({"level_m": -100.5}, "level_m"),
    ({"level_m": float("nan")}, "level_m"),
    ({"name": "N" * 121}, "name"),
])
def test_hand_pond_level_and_name_the_viewer_would_reject_fail(tmp_path, props, needle):
    path = write(tmp_path, [feat(sq(-122.40, 37.77, -122.39, 37.78), **GOOD, **props)])
    r = check_file(path, BBOX)
    assert not r.ok and any(needle in p and "feature 0" in p for p in r.problems)
    assert main([str(path)]) == 1


def test_valid_hand_pond_level_and_name_pass(tmp_path):
    path = write(tmp_path, [
        feat(sq(-122.40, 37.77, -122.39, 37.78), **GOOD, level_m=12.5, name="Lake"),
        feat(sq(-122.38, 37.77, -122.37, 37.78), **GOOD, level_m=1000, name="N" * 120),
        feat(sq(-122.36, 37.77, -122.35, 37.78), **GOOD, level_m=-100)])
    assert check_file(path, BBOX).ok
