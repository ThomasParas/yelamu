"""yelamu.noaa on synthetic linework (UTM metres near San Francisco)."""

import json
import random

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import LineString, Point, box

from yelamu.cli import main
from yelamu.export import dequantize_heights
from yelamu.geo import UTM_CRS, Grid, lonlat_to_utm
from yelamu.noaa import (
    MAN_MADE, MARSH_EDGE, MEAN_HIGH_WATER, USER_ADDED, WHARF, Area, Line, Seed, area_ordinal,
    areas_to_features, classify, close_linework, cross_project_overlaps, land_conflicts,
    feature_collection_text, load_seed_file, load_seeds, lonlat_geom_to_utm, normalise_sheet,
    select_lines, source_text, survey_year, utm_geom_to_lonlat)
from yelamu.provenance import MAX_SOURCE_CHARS
from yelamu.sources import load_features

X0, Y0 = 550_000.0, 4_180_000.0  # UTM 10N, inside San Francisco
FRAME = box(X0, Y0, X0 + 3000, Y0 + 3000)
EMPTY_FC = '{"type": "FeatureCollection", "features": []}\n'


def _line(coords, feature=MEAN_HIGH_WATER, sheet="T-00352", year=1852, project="CA37A02"):
    return Line(LineString([(X0 + x, Y0 + y) for x, y in coords]), "", feature, sheet, year,
                project)


def _lake(x, y, size, **kw):
    return _line([(x, y), (x + size, y), (x + size, y + size), (x, y + size), (x, y)], **kw)


def _ll(x, y):
    """lon, lat of a local point."""
    p = utm_geom_to_lonlat(Point(X0 + x, Y0 + y))
    return p.x, p.y


def _seed(sid, x, y, cls, project="CA37A02", confidence="inferred"):
    return Seed(sid, project, *_ll(x, y), cls, "test seed", confidence)


def _close(lines, **kw):
    kw.setdefault("project", "CA37A02")
    return close_linework(lines, FRAME, **kw)


# ----------------------------------------------------------------- attributes ---


def test_sheet_and_year_parsing():
    assert normalise_sheet("T00352") == "T-00352"
    assert normalise_sheet("t-00460_1") == "T-00460"
    assert survey_year("18570101") == 1857
    with pytest.raises(ValueError):
        normalise_sheet("H1234")
    with pytest.raises(ValueError):
        survey_year("1857/01/01")


def test_select_lines_by_feature_code():
    lines = [_lake(100, 100, 100), _lake(500, 500, 100, feature=WHARF)]
    assert select_lines(lines, {MEAN_HIGH_WATER}) == lines[:1]
    assert select_lines(lines) == lines  # default: all classes


# -------------------------------------------------------------------- closing ---


def test_closed_lake_is_one_face():
    closure = _close([_lake(1000, 1000, 200)])
    lake = [a for a in closure.areas if a.area_m2 == pytest.approx(40_000)]
    assert len(lake) == 1 and len(closure.areas) == 2  # the lake and the rest of the frame
    assert lake[0].sheet == "T-00352" and lake[0].year == 1852
    assert lake[0].line_kind == "mean high water line"
    assert closure.unclosed == [] and closure.free_ends_after == 0


def test_doubled_lines_3m_apart_make_one_face_and_slivers_at_snap_0():
    lines = [_lake(1000, 1000, 200), _lake(1003, 1000, 200, sheet="T-00321")]
    snapped = _close(lines, min_area_m2=0)
    assert len(snapped.areas) == 2  # lake + surroundings; the 3 m strips are dropped
    assert snapped.dropped_slivers == 2
    lake = min(snapped.areas, key=lambda a: a.area_m2)
    assert lake.area_m2 == pytest.approx(197 * 200)
    raw = _close(lines, snap_m=0, min_area_m2=0)  # snap 0 disables the width filter
    assert sorted(round(a.area_m2) for a in raw.areas)[:3] == [600, 600, 197 * 200]
    assert raw.dropped_slivers == 0


def test_a_6m_gap_closes_at_snap_8_but_not_at_snap_3():
    # a U-shaped shore and a second line that stops 6 m short of the U's open end
    lines = [_line([(1000, 1000), (1200, 1000), (1200, 1200), (1000, 1200)]),
             _line([(1000, 1200), (1000, 1006)], sheet="T-00321")]
    no_joins = dict(join_ends_m=0, frame_reach_m=0, closure_reach_m=0)
    closed = _close(lines, snap_m=8, **no_joins)
    assert any(a.area_m2 == pytest.approx(40_000, rel=1e-3) for a in closed.areas)
    assert closed.free_ends_after == 0 and closed.unclosed == [] and closed.connectors
    open_ = _close(lines, snap_m=3, **no_joins)
    assert len(open_.areas) == 1  # only the frame face
    assert open_.unclosed_m == pytest.approx(600 + 194, abs=0.1)
    # end joins (default 100 m) close the same gap whatever the snap
    assert len(_close(lines, snap_m=3).areas) == 2


def test_bay_closed_only_by_the_frame():
    # a shore crossing the whole project, then one stopping 50 m short of the frame both ends
    crossing = _close([_line([(1000, -100), (1100, 1500), (1000, 3100)])])
    assert len(crossing.areas) == 2
    short = _close([_line([(1000, 50), (1100, 1500), (1000, 2950)])])
    assert len(short.areas) == 2 and len(short.connectors) == 2
    assert sum(a.area_m2 for a in short.areas) == pytest.approx(FRAME.area, rel=1e-6)
    left = min(short.areas, key=lambda a: a.geometry.centroid.x)
    assert left.id == "CA37A02-1"
    no_frame = _close([_line([(1000, 50), (1100, 1500), (1000, 2950)])], frame_reach_m=0)
    assert len(no_frame.areas) == 1 and no_frame.unclosed


def test_user_added_closure_lines_reach_the_frame_from_further_away():
    shore = _line([(1000, 1000), (1100, 1500), (1000, 2000)])
    closers = [_line([(1000, 1000), (1000, 1000 - 900)], feature=USER_ADDED),
               _line([(1000, 2000), (1000, 2000 + 900)], feature=USER_ADDED)]
    assert len(_close([shore, *closers]).areas) == 2  # 100 m to the frame: within 600
    far = [_line([(1000, 1000), (1000, 700)], feature=USER_ADDED),
           _line([(1000, 2000), (1000, 2300)], feature=USER_ADDED)]  # 700 m short
    assert len(_close([shore, *far]).areas) == 2  # user-added ends reach 2500 m
    assert len(_close([shore, *far], closure_reach_m=0).areas) == 1


def test_dangling_creek_is_reported_not_polygonised():
    shore = _line([(1000, -100), (1000, 3100)])
    creek = _line([(1000, 1500), (1400, 1500)], feature=MARSH_EDGE)  # ends 1.6 km from frame
    closure = _close([shore, creek])
    assert len(closure.areas) == 2
    assert [round(g.length) for g in closure.unclosed] == [400]
    assert closure.free_ends_after == 1


def test_small_faces_are_dropped_as_slivers():
    closure = _close([_lake(1000, 1000, 30), _lake(2000, 2000, 100)])
    assert sorted(round(a.area_m2) for a in closure.areas)[:1] == [10_000]
    assert closure.dropped_slivers == 1
    kept = _close([_lake(1000, 1000, 30)], min_area_m2=500)
    assert any(a.area_m2 == pytest.approx(900) for a in kept.areas)


def test_excluded_classes_are_ignored_and_used_when_requested():
    lines = [_line([(1000, -100), (1000, 3100)]),
             _line([(1000, 1400), (1300, 1400), (1300, 1600), (1000, 1600)], feature=WHARF)]
    with_wharf = _close(select_lines(lines))
    assert len(with_wharf.areas) == 3  # the wharf encloses a pier-shaped face
    without = _close(select_lines(lines, {MEAN_HIGH_WATER, MAN_MADE}))
    assert len(without.areas) == 2 and without.unclosed == []


def test_ids_are_deterministic_and_independent_of_input_order():
    lines = [_line([(1000, -100), (1000, 3100)]), _lake(1500, 500, 300), _lake(2000, 2000, 250),
             _line([(2500, -100), (2500, 3100)], sheet="T-00321", year=1851)]
    first = _close(lines)
    for seed in range(3):
        shuffled = lines[:]
        random.Random(seed).shuffle(shuffled)
        again = _close(shuffled)
        assert [(a.id, a.sheet) for a in again.areas] == [(a.id, a.sheet) for a in first.areas]
        assert all(a.geometry.equals(b.geometry) for a, b in zip(again.areas, first.areas))
    xs = [a.geometry.centroid.x for a in first.areas]
    assert xs == sorted(xs)
    assert [a.id for a in first.areas] == [f"CA37A02-{i}" for i in range(1, 6)]
    assert sorted(["CA37A02-10", "CA37A02-9"], key=area_ordinal) == ["CA37A02-9", "CA37A02-10"]


def test_owner_closure_lines_split_an_area():
    shore = _line([(1000, -100), (1000, 3100)])
    split = _close([shore], extra_lines=[LineString([(X0 + 1000, Y0 + 1500), (X0 + 3100, Y0 + 1500)])])
    assert len(split.areas) == 3
    assert all(a.sheet == "T-00352" for a in split.areas)


def test_negative_distances_are_refused():
    with pytest.raises(ValueError):
        _close([], snap_m=-1)


# --------------------------------------------------------------------- seeds ---


def _split_areas():
    """Two areas: west (CA37A02-1) and east (CA37A02-2) of a shore at x = 1000."""
    return _close([_line([(1000, -100), (1000, 3100)])]).areas


def test_classify_seeds():
    areas = _split_areas()
    result = classify(areas, [_seed("east-bay", 2000, 1500, "bay"),
                              _seed("east-bay-2", 2500, 500, "bay", confidence="illustrative")])
    (item,) = result.classified
    assert item.area.id == "CA37A02-2" and item.cls == "bay"
    assert item.confidence == "illustrative"  # the lowest of inferred and the seeds
    assert [s.id for s in item.seeds] == ["east-bay", "east-bay-2"]
    assert [a.id for a in result.unseeded] == ["CA37A02-1"]


def test_classify_conflicting_seeds_name_both():
    with pytest.raises(ValueError, match="'a'.*bay.*'b'.*marsh"):
        classify(_split_areas(), [_seed("a", 2000, 1500, "bay"), _seed("b", 2500, 500, "marsh")])


def test_classify_seed_errors():
    areas = _split_areas()
    with pytest.raises(ValueError, match="lies in no area"):
        classify(areas, [_seed("out", 4000, 1500, "bay")])
    with pytest.raises(ValueError, match="boundary between CA37A02-1 and CA37A02-2"):
        classify(areas, [_seed("edge", 1000, 1500, "bay")])
    with pytest.raises(ValueError, match="CA37B08 was not imported"):
        classify(areas, [_seed("other", 2000, 1500, "bay", project="CA37B08")])


def test_seeds_only_class_their_own_project():
    a02 = _split_areas()
    b08 = close_linework([_line([(1200, -100), (1200, 3100)], project="CA37B08")], FRAME,
                         project="CA37B08").areas
    result = classify(a02 + b08, [_seed("b08-east", 2000, 1500, "bay", project="CA37B08")])
    assert [c.area.id for c in result.classified] == ["CA37B08-2"]
    assert len(result.unseeded) == 3


def _seed_file(tmp_path, seeds, closures=None, **extra):
    data = {"seeds": seeds, **extra}
    if closures is not None:
        data["closures"] = closures
    path = tmp_path / "seeds.json"
    path.write_text(json.dumps(data))
    return path


_GOOD = {"id": "a02-bay", "project": "CA37A02", "lon": -122.37, "lat": 37.76, "class": "bay",
         "source": "NOAA T-00352 (1852)", "confidence": "inferred"}
_BBOX = (-122.53, 37.70, -122.35, 37.84)


def test_load_seed_file(tmp_path):
    closure = {"id": "gate", "project": "CA37A02", "coordinates": [[-122.47, 37.81], [-122.47, 37.82]],
               "source": "owner closure", "note": "check"}
    path = _seed_file(tmp_path, [{**_GOOD, "note": "UNCERTAIN"}], [closure], note="file note")
    loaded = load_seed_file(path, _BBOX)
    assert loaded.seeds == [Seed("a02-bay", "CA37A02", -122.37, 37.76, "bay",
                                 "NOAA T-00352 (1852)", "inferred", "UNCERTAIN")]
    assert loaded.closures[0].coordinates == ((-122.47, 37.81), (-122.47, 37.82))
    assert loaded.closures_for("CA37A02") == loaded.closures and loaded.closures_for("X1") == []
    assert loaded.closures[0].utm().length == pytest.approx(1110, rel=0.01)
    assert load_seeds(path, _BBOX) == loaded.seeds


@pytest.mark.parametrize("change, message", [
    ({"class": "pond"}, "class must be one of"),
    ({"confidence": "sure"}, "confidence must be one of"),
    ({"lon": -121.0}, "outside the region bbox"),
    ({"lat": float("nan")}, "finite numbers"),
    ({"id": "Bad Id"}, "id must be"),
    ({"project": "ca37"}, "project must be"),
    ({"source": "x" * (MAX_SOURCE_CHARS + 1)}, "more than 200"),
    ({"colour": "blue"}, "unknown key"),
])
def test_load_seed_file_refuses_bad_seeds(tmp_path, change, message):
    with pytest.raises(ValueError, match=message):
        load_seed_file(_seed_file(tmp_path, [{**_GOOD, **change}]), _BBOX)


def test_load_seed_file_refuses_bad_files(tmp_path):
    with pytest.raises(ValueError, match="used twice"):
        load_seed_file(_seed_file(tmp_path, [_GOOD, _GOOD]))
    with pytest.raises(ValueError, match="missing key"):
        load_seed_file(_seed_file(tmp_path, [{k: v for k, v in _GOOD.items() if k != "lat"}]))
    with pytest.raises(ValueError, match="2 or more"):
        load_seed_file(_seed_file(tmp_path, [], [{"id": "c", "project": "CA37A02",
                                                  "coordinates": [[-122.4, 37.8]],
                                                  "source": "s"}]))
    with pytest.raises(ValueError, match="unknown key"):
        load_seed_file(_seed_file(tmp_path, [], extra=1))
    (tmp_path / "list.json").write_text("[]")
    with pytest.raises(ValueError, match="'seeds' list"):
        load_seed_file(tmp_path / "list.json")


# -------------------------------------------------------------------- output ---


def _area(**kw):
    base = dict(id="CA37A02-7", project="CA37A02", geometry=box(X0, Y0, X0 + 100, Y0 + 100),
                area_m2=10_000.0, sheet="T-00352", year=1852, line_kind="mean high water line")
    return Area(**{**base, **kw})


def test_source_text_names_the_survey_and_the_seed():
    text = source_text(_area(), "a02-open-bay")
    assert text == ("NOAA Shoreline Data Rescue Project, CA37A02, sheet T-00352 (1852), "
                    "mean high water line; area classed by seed a02-open-bay")


def test_source_text_is_shortened_but_keeps_the_seed_id():
    seed = "s" * 64
    text = source_text(_area(), seed)
    assert len(text) <= MAX_SOURCE_CHARS and text.startswith("NOAA Shoreline")
    short = source_text(_area(), seed, max_chars=130)
    assert short.startswith("NOAA SDRP, CA37A02") and short.endswith(seed)
    cut = source_text(_area(), seed, max_chars=110)
    assert len(cut) == 110 and "..." in cut and cut.endswith(f"seed {seed}")
    with pytest.raises(ValueError, match="too long"):
        source_text(_area(), seed, max_chars=90)


def _classified_split():
    return classify(_split_areas(), [_seed("east-bay", 2000, 1500, "bay"),
                                     _seed("west-land", 500, 1500, "land")]).classified


def test_geojson_is_deterministic_and_has_provenance(tmp_path):
    features = areas_to_features(_classified_split())
    assert features["marsh"] == [] and len(features["bay"]) == 1  # land is not written
    props = features["bay"][0]["properties"]
    assert props == {"source": source_text(_split_areas()[1], "east-bay"),
                     "confidence": "inferred", "area_id": "CA37A02-2", "area_m2": 6_000_000,
                     "seed": "east-bay"}
    text = feature_collection_text(features["bay"])
    assert text == feature_collection_text(areas_to_features(_classified_split())["bay"])
    path = tmp_path / "bay.geojson"
    path.write_text(text)
    (feat,) = load_features(path, require_provenance=True)
    assert feat.geometry.area == pytest.approx(6_000_000, rel=1e-4)
    assert feature_collection_text([]) == EMPTY_FC
    path.write_text(EMPTY_FC)
    assert load_features(path, allow_empty=True, require_provenance=True) == []


def test_cross_project_overlaps():
    b08 = close_linework([_line([(1200, -100), (1200, 3100)], project="CA37B08")], FRAME,
                         project="CA37B08").areas
    result = classify(_split_areas() + b08, [_seed("a", 2000, 1500, "bay"),
                                             _seed("b", 2000, 1500, "bay", project="CA37B08")])
    ((a, b, m2),) = cross_project_overlaps(result.classified)
    assert (a, b) == ("CA37A02-2", "CA37B08-2") and m2 == pytest.approx(1800 * 3000)


def test_land_conflicts_report_water_over_another_projects_land():
    b08 = close_linework([_line([(1200, -100), (1200, 3100)], project="CA37B08")], FRAME,
                         project="CA37B08").areas
    a02 = _split_areas()
    # A02 west (x < 1000) is land; B08's west area (x < 1200) is water and covers all of it.
    result = classify(a02 + b08, [_seed("w", 2500, 1500, "bay"),
                                  _seed("land", 500, 1500, "land"),
                                  _seed("b", 1000, 1500, "bay", project="CA37B08")])
    ((water, land, m2),) = land_conflicts(result.classified)
    assert (water, land) == ("CA37B08-1", "CA37A02-1") and m2 > 0
    # same project, or no land seed: nothing to report
    assert land_conflicts(classify(a02, [_seed("w", 2500, 1500, "bay"),
                                         _seed("land", 500, 1500, "land")]).classified) == []


def test_an_area_without_a_survey_sheet_cannot_carry_a_source():
    area = close_linework([], FRAME, project="CA37A02").areas[0]
    with pytest.raises(ValueError, match="no survey sheet"):
        source_text(area, "s")


# ------------------------------------------------------- build round trip ---

BBOX = (-122.42, 37.755, -122.37, 37.805)
_FLAT = ["--smooth-m", "0", "--shelf-m", "0", "--shore-open-cells", "0", "--shore-slope", "0"]


def _write_dem(path, grid: Grid, value: float) -> None:
    margin = 200
    width = grid.width + 2 * margin // int(grid.cell)
    height = grid.height + 2 * margin // int(grid.cell)
    with rasterio.open(path, "w", driver="GTiff", height=height, width=width, count=1,
                       dtype="float32", crs=UTM_CRS,
                       transform=from_origin(grid.west - margin, grid.north + margin,
                                             grid.cell, grid.cell)) as dst:
        dst.write(np.full((height, width), value, dtype="float32"), 1)


def test_imported_bay_and_marsh_go_through_the_build(tmp_path):
    frame = lonlat_geom_to_utm(box(-122.43, 37.75, -122.36, 37.81).segmentize(0.001))
    shore = lonlat_geom_to_utm(LineString([(-122.40, 37.70), (-122.40, 37.86)]))
    marsh = lonlat_geom_to_utm(LineString([(-122.43, 37.765), (-122.41, 37.765),
                                           (-122.41, 37.775), (-122.43, 37.775)]))
    lines = [Line(shore, "", MEAN_HIGH_WATER, "T-00352", 1852, "CA37A02"),
             Line(marsh, "", MARSH_EDGE, "T-00352", 1852, "CA37A02")]
    areas = close_linework(lines, frame, project="CA37A02").areas
    seeds = [Seed("bay", "CA37A02", -122.38, 37.78, "bay", "t", "inferred"),
             Seed("marsh", "CA37A02", -122.415, 37.77, "marsh", "t", "inferred"),
             Seed("land", "CA37A02", -122.41, 37.79, "land", "t", "inferred")]
    features = areas_to_features(classify(areas, seeds).classified)
    for cls in ("bay", "marsh"):
        (tmp_path / f"{cls}.geojson").write_text(feature_collection_text(features[cls]))
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem(tmp_path / "dem.tif", grid, 5.0)
    out = tmp_path / "out"
    assert main(["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX), "--out", str(out),
                 *_FLAT, "--hand-bay", str(tmp_path / "bay.geojson"),
                 "--hand-marsh", str(tmp_path / "marsh.geojson")]) == 0
    meta = json.loads((out / "meta.json").read_text())
    q = np.fromfile(out / "heightmap.u16", dtype="<u2").reshape(meta["height"], meta["width"])
    heights = dequantize_heights(q, meta["min_m"], meta["max_m"])

    def at(lon, lat):
        return heights[grid.pixel_of(*lonlat_to_utm(lon, lat))]

    assert at(-122.38, 37.78) == pytest.approx(-3.0, abs=0.01)  # bay
    assert at(-122.41, 37.79) == pytest.approx(5.0, abs=0.01)  # land: unchanged
    assert at(-122.415, 37.77) < 1.0  # marsh: lowered to marsh level
    sources = {s["source"] for s in meta["hand_sources"]}
    assert any(s.endswith("seed bay") for s in sources)
    assert any(s.endswith("seed marsh") for s in sources)
