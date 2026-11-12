import json
from pathlib import Path

import pytest

from yelamu.region import Region, load_region

PIPELINE = Path(__file__).resolve().parent.parent

MINIMAL = {
    "name": "t",
    "bbox": [-122.5, 37.7, -122.4, 37.8],
    "cell_m": 10,
    "dem": "data/raw/dem.tif",
    "out": "../viewer/out",
}


def _write(tmp_path, data, name="r.json") -> Path:
    """Write a region file at <tmp>/pipeline/regions/<name> and return its path."""
    folder = tmp_path / "pipeline" / "regions"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / name
    path.write_text(data if isinstance(data, str) else json.dumps(data))
    return path


def test_minimal_region_applies_defaults_and_resolves_paths_against_pipeline_dir(tmp_path):
    region = load_region(_write(tmp_path, MINIMAL))
    base = tmp_path / "pipeline"
    assert isinstance(region, Region)
    assert region.name == "t"
    assert region.bbox == (-122.5, 37.7, -122.4, 37.8)
    assert region.cell_m == 10.0 and isinstance(region.cell_m, float)
    assert region.dem == base / "data/raw/dem.tif"  # not relative to regions/
    assert region.out == tmp_path / "viewer" / "out"  # '..' is collapsed
    assert region.habitats is None and region.bay is None and region.marsh is None
    assert region.landforms is None and region.checks is None
    assert region.hand_bay == [] and region.hand_marsh == [] and region.hand_ponds == []
    assert region.pond_classes is None
    for name in ("smooth_m", "shelf_m", "shore_slope", "shore_open_cells", "open_water_max_m",
                 "pond_max_depth_m", "pond_shelf_m", "pond_bank_slope", "pond_bank_m"):
        assert getattr(region, name) is None


def test_full_region_round_trip(tmp_path):
    data = {
        **MINIMAL,
        "habitats": "data/raw/h.geojson", "bay": "data/raw/b.geojson",
        "marsh": "data/raw/m.geojson",
        "hand_bay": ["data/hand/a.geojson", "data/hand/b.geojson"],
        "hand_marsh": ["data/hand/c.geojson"],
        "landforms": "data/lf.json", "checks": "data/ck.json",
        "smooth_m": 20, "shelf_m": 90.5, "shore_slope": 0.2, "shore_open_cells": 3,
        "open_water_max_m": 0.25,
        "hand_ponds": ["data/hand/p1.geojson", "data/hand/p2.geojson"],
        "pond_classes": ["Other pond or lake", " Fen "],
        "pond_max_depth_m": 3, "pond_shelf_m": 40.5,
        "pond_bank_slope": 0.5, "pond_bank_m": 120,
    }
    region = load_region(_write(tmp_path, data))
    base = tmp_path / "pipeline"
    assert region.habitats == base / "data/raw/h.geojson"
    assert region.hand_bay == [base / "data/hand/a.geojson", base / "data/hand/b.geojson"]
    assert region.hand_marsh == [base / "data/hand/c.geojson"]
    assert region.landforms == base / "data/lf.json" and region.checks == base / "data/ck.json"
    assert (region.smooth_m, region.shelf_m, region.shore_slope) == (20, 90.5, 0.2)
    assert region.shore_open_cells == 3 and region.open_water_max_m == 0.25
    assert region.hand_ponds == [base / "data/hand/p1.geojson", base / "data/hand/p2.geojson"]
    assert region.pond_classes == ["Other pond or lake", "Fen"]  # stripped
    assert (region.pond_max_depth_m, region.pond_shelf_m) == (3, 40.5)
    assert (region.pond_bank_slope, region.pond_bank_m) == (0.5, 120)


def test_absolute_paths_are_kept(tmp_path):
    region = load_region(_write(tmp_path, {**MINIMAL, "dem": "/abs/dem.tif"}))
    assert region.dem == Path("/abs/dem.tif")


def test_relative_region_path_is_resolved_before_deriving_the_base(tmp_path, monkeypatch):
    """Running from inside regions/ (`--region x.json`) must still find the pipeline dir."""
    _write(tmp_path, {**MINIMAL, "habitats": "data/raw/h.geojson"}, "x.json")
    base = (tmp_path / "pipeline").resolve()
    monkeypatch.chdir(base / "regions")
    region = load_region(Path("x.json"))
    assert region.dem.is_absolute() and region.out.is_absolute()
    assert region.dem == base / "data/raw/dem.tif"
    assert region.habitats == base / "data/raw/h.geojson"
    assert region.out == base.parent / "viewer" / "out"


def test_region_is_frozen(tmp_path):
    region = load_region(_write(tmp_path, MINIMAL))
    with pytest.raises(Exception):
        region.name = "other"  # type: ignore[misc]


@pytest.mark.parametrize("key", ["name", "bbox", "cell_m", "dem", "out"])
def test_missing_required_key_names_key_and_file(tmp_path, key):
    data = {k: v for k, v in MINIMAL.items() if k != key}
    path = _write(tmp_path, data, "broken.json")
    with pytest.raises(ValueError, match="broken.json") as exc:
        load_region(path)
    assert key in str(exc.value)


def test_unknown_keys_are_rejected_and_named(tmp_path):
    path = _write(tmp_path, {**MINIMAL, "hand_baay": [], "colour": "x"}, "typo.json")
    with pytest.raises(ValueError, match="typo.json") as exc:
        load_region(path)
    assert "hand_baay" in str(exc.value) and "colour" in str(exc.value)


@pytest.mark.parametrize("bbox", [
    [-122.4, 37.7, -122.5, 37.8],  # west > east
    [-122.5, 37.8, -122.4, 37.7],  # south > north
    [-122.5, 37.7, -122.5, 37.8],  # west == east
    [-122.5, 37.7, -122.4, 37.7],  # south == north
    [-181.0, 37.7, -122.4, 37.8],  # lon out of range
    [-122.5, -91.0, -122.4, 37.8],  # lat out of range
    [-122.5, 37.7, -122.4, 91.0],
    [-122.5, 37.7, 181.0, 37.8],
    [-122.5, 37.7, -122.4],  # wrong length
    "nope",
    [-122.5, 37.7, -122.4, "x"],
    [-122.5, 37.7, -122.4, True],  # bool is not a number
    [-122.5, 37.7, -122.4, float("nan")],
])
def test_bad_bbox_is_rejected(tmp_path, bbox):
    path = _write(tmp_path, {**MINIMAL, "bbox": bbox}, "bb.json")
    with pytest.raises(ValueError, match="bb.json") as exc:
        load_region(path)
    assert "bbox" in str(exc.value)


@pytest.mark.parametrize("cell", [0, -5, "ten", None, True])
def test_bad_cell_m_is_rejected(tmp_path, cell):
    path = _write(tmp_path, {**MINIMAL, "cell_m": cell}, "c.json")
    with pytest.raises(ValueError, match="c.json") as exc:
        load_region(path)
    assert "cell_m" in str(exc.value)


@pytest.mark.parametrize("key, value", [
    ("dem", 5), ("out", ""), ("bay", 3), ("hand_bay", "a.geojson"), ("hand_marsh", [1]),
    ("smooth_m", "x"), ("shore_open_cells", 1.5), ("shelf_m", True), ("name", ""),
    ("hand_ponds", "a.geojson"), ("hand_ponds", [1]), ("hand_ponds", [""]),
    ("pond_classes", "Fen"), ("pond_classes", [1]), ("pond_classes", ["Fen", " "]),
    ("pond_max_depth_m", "deep"), ("pond_shelf_m", True),
    ("pond_bank_slope", -0.1), ("pond_bank_slope", "x"), ("pond_bank_m", -5), ("pond_bank_m", True),
])
def test_bad_value_types_are_rejected_naming_key_and_file(tmp_path, key, value):
    path = _write(tmp_path, {**MINIMAL, key: value}, "v.json")
    with pytest.raises(ValueError, match="v.json") as exc:
        load_region(path)
    assert key in str(exc.value)


def test_invalid_json_and_non_object_name_the_file(tmp_path):
    with pytest.raises(ValueError, match="bad.json"):
        load_region(_write(tmp_path, "{not json", "bad.json"))
    with pytest.raises(ValueError, match="list.json"):
        load_region(_write(tmp_path, "[1, 2]", "list.json"))


def test_null_optionals_mean_unset(tmp_path):
    region = load_region(_write(tmp_path, {**MINIMAL, "bay": None, "smooth_m": None,
                                           "hand_bay": None, "hand_ponds": None,
                                           "pond_classes": None}))
    assert region.bay is None and region.smooth_m is None and region.hand_bay == []
    assert region.hand_ponds == [] and region.pond_classes is None


def test_empty_pond_classes_list_is_kept_it_means_no_sfei_ponds(tmp_path):
    assert load_region(_write(tmp_path, {**MINIMAL, "pond_classes": []})).pond_classes == []


# --------------------------------------------------- the shipped region files ---


@pytest.mark.parametrize("name", ["slice", "full-city"])
def test_shipped_regions_load(name):
    region = load_region(PIPELINE / "regions" / f"{name}.json")
    assert region.name == name
    assert region.dem == PIPELINE / "data" / "raw" / "dem.tif"
    for p in (region.habitats, region.bay, region.marsh):
        assert p is not None and p.exists(), p
    for p in (region.landforms, region.checks, *region.hand_bay, *region.hand_marsh,
              *region.hand_ponds):
        assert p is not None and p.exists(), p


def test_full_city_region_values():
    region = load_region(PIPELINE / "regions" / "full-city.json")
    assert region.bbox == (-122.53, 37.70, -122.33, 37.84)
    assert region.cell_m == 10.0
    assert region.out == PIPELINE.parent / "viewer" / "public" / "assets" / "real-city"
    assert [p.name for p in region.hand_bay] == ["hand_bay.geojson"]
    assert [p.name for p in region.hand_marsh] == ["hand_marsh.geojson"]
    assert [p.name for p in region.hand_ponds] == ["hand_ponds.geojson"]
    assert region.pond_classes == [
        "Dune-dammed pond or lake", "Dune-dammed headwater lake",
        "Barrier beach-impounded freshwater lagoon", "Other pond or lake"]
    from yelamu.ponds import DEFAULT_POND_CLASSES
    assert tuple(region.pond_classes) == DEFAULT_POND_CLASSES


def test_bank_slope_zero_is_allowed(tmp_path):
    r = load_region(_write(tmp_path, {**MINIMAL, "pond_bank_slope": 0, "pond_bank_m": 0}))
    assert r.pond_bank_slope == 0.0 and r.pond_bank_m == 0.0
