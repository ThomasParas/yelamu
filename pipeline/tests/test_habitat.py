import json
from pathlib import Path

import numpy as np
import pytest

from yelamu.geo import Grid, lonlat_to_utm
from yelamu.habitat import (
    GROUP_BY_CLASS,
    ID_HAND_BAY,
    ID_HAND_MARSH,
    ID_HAND_POND,
    ID_OPEN_BAY_INFERRED,
    ID_UNMAPPED,
    apply_overrides,
    rasterize_habitats,
)

BBOX = (-122.42, 37.755, -122.37, 37.805)
RAW = Path(__file__).resolve().parent.parent / "data" / "raw" / "sf_habitats.geojson"

GROUPS = {"unmapped", "water", "marsh", "dune", "beach", "woodland", "grassland", "scrub",
          "wetland", "rock"}


def _grid() -> Grid:
    return Grid.from_lonlat_bbox(*BBOX, cell=10)


def _rect(lon0, lat0, lon1, lat1) -> dict:
    ring = [[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]]
    return {"type": "Polygon", "coordinates": [ring]}


def _feat(cls, geometry, field="HabitatCla") -> dict:
    return {"type": "Feature", "properties": {field: cls}, "geometry": geometry}


def _cell(grid: Grid, lon: float, lat: float) -> tuple[int, int]:
    x, y = lonlat_to_utm(lon, lat)
    return grid.pixel_of(x, y)


# Three disjoint blocks (west to east) plus an unknown class, and an overlap strip.
COLLECTION = {"type": "FeatureCollection", "features": [
    _feat("Tidal marsh", _rect(-122.415, 37.77, -122.405, 37.79)),
    _feat("Coast live oak woodland", _rect(-122.400, 37.77, -122.390, 37.79)),
    _feat("Mystery class", _rect(-122.385, 37.77, -122.380, 37.79)),
    _feat("Beach", _rect(-122.395, 37.77, -122.389, 37.79)),  # overlaps the woodland
    {"type": "Feature", "properties": {"HabitatCla": "Fen"}, "geometry": None},
    _feat("", _rect(-122.378, 37.77, -122.376, 37.79)),  # blank class: skipped
    _feat(None, _rect(-122.378, 37.77, -122.376, 37.79)),  # null class: skipped
    {"type": "Feature", "properties": {}, "geometry": _rect(-122.378, 37.77, -122.376, 37.79)},
    {"type": "Feature", "properties": None, "geometry": _rect(-122.378, 37.77, -122.376, 37.79)},
    _feat("Dune slack", {"type": "LineString", "coordinates": [[-122.41, 37.76], [-122.4, 37.78]]}),
]}


# ------------------------------------------------------------------ mapping ---


def test_group_mapping_is_the_agreed_one():
    expected = {
        "water": ["Deep ocean/bay", "Shallow ocean/bay", "Other pond or lake",
                  "Dune-dammed pond or lake", "Dune-dammed headwater lake",
                  "Barrier beach-impounded freshwater lagoon"],
        "marsh": ["Tidal marsh", "Tidal slough", "Tidal flat", "Tidal coastal lagoon"],
        "wetland": ["Fen", "Wet meadow", "Willow grove", "Riparian woodland", "Dune slack",
                    "Serpentine slope wetland/serpentine maritime chaparral complex"],
        "dune": ["Mobile dunes", "Stabilized dune/dune scrub/grassland"],
        "beach": ["Beach", "Sandy/Rocky Intertidal"],
        "woodland": ["Coast live oak woodland", "California Bay Woodland"],
        "grassland": ["Coastal prairie", "Coastal prairie/scrub", "Foothill grassland",
                      "Serpentine grassland"],
        "scrub": ["Coastal scrub", "Coastal bluff scrub", "Maritime chaparral",
                  "Serpentine maritime chaparral"],
        "rock": ["Island"],
    }
    assert {c: g for g, cs in expected.items() for c in cs} == GROUP_BY_CLASS
    assert set(GROUP_BY_CLASS.values()) <= GROUPS


@pytest.mark.skipif(not RAW.exists(), reason="raw SFEI data not available")
def test_every_class_in_the_real_sfei_layer_is_mapped():
    data = json.loads(RAW.read_text())
    classes = {f["properties"]["HabitatCla"] for f in data["features"]}
    assert classes - set(GROUP_BY_CLASS) == set()


def test_synthetic_ids_are_fixed():
    assert (ID_UNMAPPED, ID_OPEN_BAY_INFERRED, ID_HAND_BAY, ID_HAND_MARSH, ID_HAND_POND) == (
        0, 1, 2, 3, 4)


# --------------------------------------------------------------- rasterising ---


def test_rasterize_values_legend_and_unknown():
    grid = _grid()
    raster, legend, unknown = rasterize_habitats(COLLECTION, grid)

    assert raster.dtype == np.uint8 and raster.shape == (grid.height, grid.width)
    assert unknown == ["Mystery class"]
    assert legend == [
        {"id": 0, "name": "Unmapped", "group": "unmapped"},
        {"id": 1, "name": "Open bay (inferred from modern elevation)", "group": "water"},
        {"id": 2, "name": "Bay (hand-drawn)", "group": "water"},
        {"id": 3, "name": "Marsh (hand-drawn)", "group": "marsh"},
        {"id": 4, "name": "Pond (hand-drawn)", "group": "water"},
        {"id": 5, "name": "Beach", "group": "beach"},
        {"id": 6, "name": "Coast live oak woodland", "group": "woodland"},
        {"id": 7, "name": "Mystery class", "group": "unmapped"},
        {"id": 8, "name": "Tidal marsh", "group": "marsh"},
    ]
    assert raster[_cell(grid, -122.410, 37.78)] == 8  # marsh
    assert raster[_cell(grid, -122.3975, 37.78)] == 6  # woodland only
    assert raster[_cell(grid, -122.3825, 37.78)] == 7  # unknown class keeps its own id
    assert raster[_cell(grid, -122.377, 37.78)] == 0  # blank/null-class features skipped
    assert raster[_cell(grid, -122.372, 37.78)] == 0  # nothing mapped
    # Only classes with at least one usable polygon appear in the legend.
    assert "Fen" not in {e["name"] for e in legend}  # null geometry
    assert "Dune slack" not in {e["name"] for e in legend}  # no polygon parts


def test_overlap_is_won_by_the_later_class_in_sorted_name_order():
    grid = _grid()
    raster, legend, _ = rasterize_habitats(COLLECTION, grid)
    ids = {e["name"]: e["id"] for e in legend}
    # "Coast live oak woodland" sorts after "Beach", so it wins the overlap strip.
    assert raster[_cell(grid, -122.392, 37.78)] == ids["Coast live oak woodland"]
    assert raster[_cell(grid, -122.3935, 37.78)] == ids["Coast live oak woodland"]
    # Beach-only part: the beach polygon covers -122.395..-122.389, woodland -122.400..-122.390
    assert raster[_cell(grid, -122.3895, 37.78)] == ids["Beach"]


def test_feature_order_does_not_matter():
    grid = _grid()
    flipped = {"type": "FeatureCollection", "features": COLLECTION["features"][::-1]}
    a, legend_a, _ = rasterize_habitats(COLLECTION, grid)
    b, legend_b, _ = rasterize_habitats(flipped, grid)
    assert (a == b).all() and legend_a == legend_b


def test_custom_field_name():
    grid = _grid()
    coll = {"type": "FeatureCollection",
            "features": [_feat("Beach", _rect(-122.41, 37.77, -122.40, 37.78), field="Cls")]}
    raster, legend, _ = rasterize_habitats(coll, grid, field="Cls")
    assert [e["name"] for e in legend][-1] == "Beach"
    assert raster[_cell(grid, -122.405, 37.775)] == 5


def test_multipolygon_and_invalid_polygon_are_handled():
    grid = _grid()
    bowtie = {"type": "Polygon", "coordinates": [[[-122.41, 37.77], [-122.40, 37.78],
                                                  [-122.40, 37.77], [-122.41, 37.78],
                                                  [-122.41, 37.77]]]}
    multi = {"type": "MultiPolygon", "coordinates": [
        _rect(-122.39, 37.77, -122.38, 37.78)["coordinates"],
        _rect(-122.38, 37.79, -122.37, 37.80)["coordinates"]]}
    coll = {"type": "FeatureCollection",
            "features": [_feat("Fen", bowtie), _feat("Beach", multi)]}
    raster, legend, unknown = rasterize_habitats(coll, grid)
    assert unknown == []
    ids = {e["name"]: e["id"] for e in legend}
    assert raster[_cell(grid, -122.385, 37.775)] == ids["Beach"]
    assert raster[_cell(grid, -122.375, 37.795)] == ids["Beach"]


def test_empty_collection_gives_all_unmapped_and_synthetic_legend_only():
    grid = _grid()
    raster, legend, unknown = rasterize_habitats(
        {"type": "FeatureCollection", "features": []}, grid)
    assert not raster.any() and unknown == []
    assert [e["id"] for e in legend] == [0, 1, 2, 3, 4]


def test_more_than_250_classes_is_an_error():
    grid = _grid()
    feats = [_feat(f"class {i:03d}", _rect(-122.41, 37.77, -122.40, 37.78)) for i in range(251)]
    with pytest.raises(ValueError, match="250"):
        rasterize_habitats({"type": "FeatureCollection", "features": feats}, grid)
    ok, legend, _ = rasterize_habitats(
        {"type": "FeatureCollection", "features": feats[:250]}, grid)
    assert len(legend) == 255 and ok.max() == 254


# ----------------------------------------------------------------- overrides ---


def test_apply_overrides_precedence_and_purity():
    habitat = np.full((2, 6), 9, dtype=np.uint8)
    gap = np.array([[1, 1, 1, 0, 0, 0], [0, 0, 0, 0, 0, 0]], dtype=bool)
    hand_marsh = np.array([[0, 1, 1, 1, 0, 0], [0, 0, 0, 0, 0, 0]], dtype=bool)
    hand_bay = np.array([[0, 0, 1, 1, 1, 0], [0, 0, 0, 0, 0, 0]], dtype=bool)
    before = habitat.copy()

    out = apply_overrides(habitat, gap, hand_bay, hand_marsh)

    assert out is not habitat and (habitat == before).all()
    assert out.dtype == np.uint8
    assert out[0].tolist() == [
        ID_OPEN_BAY_INFERRED,  # gap only
        ID_HAND_MARSH,  # gap + marsh: hand-drawn beats the gap fill
        ID_HAND_BAY,  # gap + marsh + bay: bay beats everything
        ID_HAND_BAY,  # marsh + bay
        ID_HAND_BAY,  # bay only
        9,  # untouched
    ]
    assert (out[1] == 9).all()


def test_apply_overrides_accepts_none_masks():
    habitat = np.zeros((2, 2), dtype=np.uint8)
    out = apply_overrides(habitat, None, None, np.array([[1, 0], [0, 0]], dtype=bool))
    assert out.tolist() == [[ID_HAND_MARSH, 0], [0, 0]]

