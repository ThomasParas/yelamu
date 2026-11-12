import json

import numpy as np
import pytest

from yelamu.geo import Grid, lonlat_to_utm
from yelamu.landforms import apply_landforms, landform_provenance, load_landforms, validate_landforms

BBOX = (-122.53, 37.70, -122.33, 37.84)
PROV = {"source": "Sanborn 1887 sheet 12", "confidence": "inferred"}


def bump(**kw):
    return {"name": "Rincon", "lon": -122.39, "lat": 37.78, "radius_m": 300, "delta_m": 20,
            **PROV, **kw}


def ridge(**kw):
    return {"kind": "ridge", "name": "Market St ridge",
            "points": [[-122.41, 37.78], [-122.40, 37.785]], "half_width_m": 80, "delta_m": 6,
            **PROV, **kw}


def test_valid_entries_pass_and_kind_defaults_to_bump():
    validate_landforms([bump(), bump(kind="bump", name="b"), ridge()], BBOX)
    validate_landforms([], BBOX)


def test_name_is_optional():
    item = bump()
    del item["name"]
    validate_landforms([item], BBOX)


@pytest.mark.parametrize("bad,needle", [
    (lambda: "nope", "must be an object"),
    (lambda: bump(kind="hill"), "kind"),
    (lambda: {k: v for k, v in bump().items() if k != "source"}, "source"),
    (lambda: bump(source=" "), "source"),
    (lambda: bump(source="x" * 201), "source"),
    (lambda: {k: v for k, v in bump().items() if k != "confidence"}, "confidence"),
    (lambda: bump(confidence="sure"), "confidence"),
    (lambda: bump(lon=-122.0), "lon"),
    (lambda: bump(lat=38.5), "lat"),
    (lambda: bump(lon="x"), "lon"),
    (lambda: bump(radius_m=0), "radius_m"),
    (lambda: bump(radius_m=-5), "radius_m"),
    (lambda: bump(delta_m="a"), "delta_m"),
    (lambda: bump(delta_m=float("nan")), "delta_m"),
    (lambda: bump(delta_m=True), "delta_m"),
    (lambda: {k: v for k, v in bump().items() if k != "radius_m"}, "radius_m"),
    (lambda: bump(half_width_m=10), "half_width_m"),  # ridge key on a bump
    (lambda: bump(nmae="typo"), "nmae"),
    (lambda: bump(name=5), "name"),
    (lambda: ridge(points=[[-122.41, 37.78]]), "points"),
    (lambda: ridge(points="abc"), "points"),
    (lambda: ridge(points=[[-122.41, 37.78], [-122.40]]), "points"),
    (lambda: ridge(points=[[-122.41, 37.78], [-121.0, 37.78]]), "points"),
    (lambda: ridge(points=[[-122.41, 37.78], [-122.41, 37.78]]), "points"),
    (lambda: ridge(half_width_m=0), "half_width_m"),
    (lambda: ridge(half_width_m=-1), "half_width_m"),
    (lambda: ridge(delta_m=None), "delta_m"),
    (lambda: {k: v for k, v in ridge().items() if k != "points"}, "points"),
    (lambda: ridge(lon=-122.4), "lon"),  # bump key on a ridge
    (lambda: ridge(source=""), "source"),
])
def test_invalid_entries_raise_with_the_entry_named(bad, needle):
    items = [bump(name="First OK"), bad()]
    with pytest.raises(ValueError) as exc:
        validate_landforms(items, BBOX)
    assert "landforms[1]" in str(exc.value) and needle in str(exc.value)


def test_error_names_the_entry_by_name_when_it_has_one():
    with pytest.raises(ValueError, match=r"landforms\[0\] \('Rincon'\)"):
        validate_landforms([bump(radius_m=0)], BBOX)


def test_must_be_a_list():
    with pytest.raises(ValueError, match="list"):
        validate_landforms({"a": 1}, BBOX)


def test_load_landforms_names_the_file(tmp_path):
    path = tmp_path / "lf.json"
    path.write_text(json.dumps([bump(source="")]))
    with pytest.raises(ValueError, match="lf.json"):
        load_landforms(path, BBOX)
    path.write_text("{oops")
    with pytest.raises(ValueError, match="lf.json"):
        load_landforms(path, BBOX)
    path.write_text(json.dumps([bump(), ridge()]))
    assert len(load_landforms(path, BBOX)) == 2


def test_apply_landforms_stamps_bumps_and_ridges_and_they_add():
    x, y = lonlat_to_utm(-122.39, 37.78)
    grid = Grid(west=x - 1000, south=y - 1000, east=x + 1000, north=y + 1000, cell=10)
    dem = np.zeros((grid.height, grid.width), dtype="float32")
    items = [bump(radius_m=200, delta_m=10),
             ridge(points=[[-122.39, 37.78], [-122.389, 37.78]], half_width_m=100, delta_m=4)]
    out = apply_landforms(dem, grid, items)
    r, c = grid.pixel_of(x, y)
    # Near the shared centre both stamps contribute: 10 (bump) + ~4 (ridge) -- they add.
    assert 13.0 < out[r, c] <= 14.0 + 1e-3
    assert out[0, 0] == 0.0
    assert (dem == 0).all()  # input untouched


def test_landform_provenance_pairs():
    assert landform_provenance([bump(), ridge(source="B", confidence="illustrative")]) == [
        ("Sanborn 1887 sheet 12", "inferred"), ("B", "illustrative")]
