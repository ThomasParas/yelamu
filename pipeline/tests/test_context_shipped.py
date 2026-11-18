"""The committed ring assets agree with each other and with the city."""

import json
from pathlib import Path

import pytest

PIPELINE = Path(__file__).resolve().parent.parent
ASSETS = PIPELINE.parent / "viewer" / "public" / "assets" / "real-city"


def _load(name):
    return json.loads((ASSETS / name).read_text())


def test_context_files_are_present_and_consistent():
    meta = _load("meta.json")
    doc = _load("context.json")
    assert meta["context_file"] == "context.json"
    assert [l for l in meta["layers"] if l["id"] == "context"] == doc["layers"]
    assert doc["layers"][0]["confidence"] == "illustrative"
    size = (ASSETS / doc["heights_file"]).stat().st_size
    assert size == doc["cols"] * doc["rows"] * 2


def test_the_hole_is_exactly_the_city_mesh():
    meta = _load("meta.json")
    doc = _load("context.json")
    hw = (meta["width"] - 1) * meta["cell_m"] / 2
    hd = (meta["height"] - 1) * meta["cell_m"] / 2
    h = doc["hole"]
    assert doc["x0"] + h["i0"] * doc["dx"] == pytest.approx(-hw)
    assert doc["x0"] + h["i1"] * doc["dx"] == pytest.approx(hw)
    assert doc["z0"] + h["j0"] * doc["dz"] == pytest.approx(-hd)
    assert doc["z0"] + h["j1"] * doc["dz"] == pytest.approx(hd)


def test_places_are_valid_and_do_not_collide_with_overlay_ids():
    doc = _load("context.json")
    overlay = _load("overlay.json")
    taken = {p["id"] for key in ("landmarks", "hotspots") for p in overlay[key]}
    ids = [p["id"] for p in doc["places"]]
    assert len(ids) == len(set(ids)) >= 15
    assert not set(ids) & taken
    west, south, east, north = doc["bbox"]
    for p in doc["places"]:
        assert west < p["lon"] < east and south < p["lat"] < north
        assert -50 < p["ground_m"] < 900


def test_the_region_file_points_at_the_context_places():
    from yelamu.region import load_region

    region = load_region(PIPELINE / "regions" / "full-city.json")
    assert region.context is not None
    assert region.context.cell_m == 60.0
    assert region.context.places.name == "context_places.json"
