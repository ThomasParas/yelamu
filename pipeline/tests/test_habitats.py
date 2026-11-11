import json

import pytest

from yelamu.habitats import main, split_features


def _feature(habitat):
    return {"type": "Feature", "properties": {"HabitatCla": habitat},
            "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]}}


COLLECTION = {"type": "FeatureCollection", "features": [
    _feature("Deep ocean/bay"), _feature("Tidal flat"), _feature("Tidal marsh"),
    _feature("Coast live oak woodland"),
    {"type": "Feature", "properties": None, "geometry": None},
]}


def test_split_features_routes_by_class_and_ignores_the_rest():
    bay, marsh = split_features(
        COLLECTION, "HabitatCla", ["Deep ocean/bay", "Tidal flat"], ["Tidal marsh"]
    )
    assert [f["properties"]["HabitatCla"] for f in bay] == ["Deep ocean/bay", "Tidal flat"]
    assert [f["properties"]["HabitatCla"] for f in marsh] == ["Tidal marsh"]


def test_class_listed_in_both_goes_to_bay():
    bay, marsh = split_features(COLLECTION, "HabitatCla", ["Tidal marsh"], ["Tidal marsh"])
    assert len(bay) == 1 and marsh == []


def test_cli_writes_both_files(tmp_path):
    src = tmp_path / "in.geojson"
    src.write_text(json.dumps(COLLECTION))
    code = main([str(src), "--field", "HabitatCla", "--bay", "Deep ocean/bay",
                 "--marsh", "Tidal marsh", "--out", str(tmp_path / "out")])
    assert code == 0
    assert len(json.loads((tmp_path / "out" / "bay.geojson").read_text())["features"]) == 1
    assert len(json.loads((tmp_path / "out" / "marsh.geojson").read_text())["features"]) == 1


def test_cli_fails_loudly_when_nothing_matches(tmp_path):
    src = tmp_path / "in.geojson"
    src.write_text(json.dumps(COLLECTION))
    with pytest.raises(SystemExit, match="No features matched"):
        main([str(src), "--field", "HabitatCla", "--bay", "Nope", "--marsh", "Nada",
              "--out", str(tmp_path / "out")])
