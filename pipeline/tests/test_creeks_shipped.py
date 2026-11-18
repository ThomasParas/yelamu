"""The committed creek assets agree with each other and with the city."""

import json
from pathlib import Path

import pytest

from yelamu.creeks import CREEKS_FILE, validate_creeks_document

PIPELINE = Path(__file__).resolve().parent.parent
ASSETS = PIPELINE.parent / "viewer" / "public" / "assets" / "real-city"


def _load(name):
    return json.loads((ASSETS / name).read_text())


def test_creeks_file_is_valid_and_matches_meta():
    doc = _load(CREEKS_FILE)
    meta = _load("meta.json")
    validate_creeks_document(doc)
    assert meta["creeks_file"] == CREEKS_FILE
    assert meta["creeks_mapped"] == len(doc["mapped"])
    assert meta["creeks_modelled"] == len(doc["modelled"])
    rows = {r["layer"]: r for r in meta["hand_sources"]}
    assert rows["creeks"]["count"] == len(doc["mapped"])
    if doc["modelled"]:
        assert rows["modelled_streams"]["count"] == len(doc["modelled"])


def test_every_line_is_inside_the_city_rectangle():
    doc = _load(CREEKS_FILE)
    meta = _load("meta.json")
    half_x = (meta["width"] - 1) * meta["cell_m"] / 2
    half_z = (meta["height"] - 1) * meta["cell_m"] / 2
    for c in doc["mapped"] + doc["modelled"]:
        pts = c["points"]
        assert all(abs(x) <= half_x for x in pts[0::2])
        assert all(abs(z) <= half_z for z in pts[1::2])


def test_the_named_hand_mapped_creeks_are_present():
    names = {c["name"] for c in _load(CREEKS_FILE)["mapped"] if c["name"]}
    assert {"Lobos Creek", "Arroyo Dolores", "Chutchui Creek", "Petlenuc Creek"} <= names


def test_creek_ids_do_not_collide_with_overlay_ids():
    ids = {c["id"] for c in _load(CREEKS_FILE)["mapped"]}
    overlay = _load("overlay.json")
    taken = {p["id"] for key in ("landmarks", "hotspots", "villages") for p in overlay[key]}
    assert not ids & taken


def test_every_data_layer_the_meta_names_is_present():
    meta = _load("meta.json")
    assert (ASSETS / meta["creeks_file"]).exists()
