"""scripts/import_noaa.py on a synthetic NOAA project written with pyshp."""

import importlib.util
import json
import sys
from pathlib import Path

import pytest
import shapefile

from yelamu.handcheck import check_file
from yelamu.sources import load_features

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "import_noaa.py"
EMPTY_FC = '{"type": "FeatureCollection", "features": []}\n'
FRAME = (-122.43, 37.75, -122.36, 37.81)
REGION_BBOX = [-122.53, 37.70, -122.35, 37.84]


def _load():
    spec = importlib.util.spec_from_file_location("import_noaa", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["import_noaa"] = mod
    spec.loader.exec_module(mod)
    return mod


import_noaa = _load()


def _write_project(root: Path, name="CA37A02") -> Path:
    """A frame with a north-south shore at -122.40 and a marsh-edge loop on its west side."""
    d = root / name
    d.mkdir(parents=True)
    w, s, e, n = FRAME
    with shapefile.Writer(str(d / "projbnd"), shapeType=shapefile.POLYGON) as bnd:
        bnd.field("NAME", "C", 254)
        bnd.poly([[(w, s), (w, n), (e, n), (e, s), (w, s)]])
        bnd.record(name)
    with shapefile.Writer(str(d / "historicl1"), shapeType=shapefile.POLYLINE) as lines:
        for field in ("SOURCE_ID", "SRC_DATE", "ATTRIBUTE"):
            lines.field(field, "C", 254)
        lines.field("FEATURE", "N", 33, 0)
        lines.line([[(-122.40, 37.70), (-122.40, 37.86)]])
        lines.record("T00352", "18520101", "Natural.Mean High Water", 20)
        lines.line([[(-122.42, 37.765), (-122.41, 37.765), (-122.41, 37.775), (-122.42, 37.775),
                     (-122.42, 37.765)]])
        lines.record("T00352", "18520101", "Natural.Apparent.Marsh Or Swamp", 15)
    return root


def _write_region(path: Path) -> Path:
    path.write_text(json.dumps({"name": "test", "bbox": REGION_BBOX, "cell_m": 10,
                                "dem": "dem.tif", "out": "out"}))
    return path


def _seed(sid, lon, lat, cls, **kw):
    return {"id": sid, "project": "CA37A02", "lon": lon, "lat": lat, "class": cls,
            "source": "test", "confidence": "inferred", **kw}


def _run(tmp_path, *extra, seeds=None):
    noaa = _write_project(tmp_path / "noaa") if not (tmp_path / "noaa").exists() else tmp_path / "noaa"
    region = _write_region(tmp_path / "region.json")
    argv = ["--projects", "CA37A02", "--noaa-dir", str(noaa), "--region", str(region),
            "--out-dir", str(tmp_path / "hand"), *extra]
    if seeds is not None:
        (tmp_path / "seeds.json").write_text(json.dumps({"seeds": seeds}))
        argv += ["--seeds", str(tmp_path / "seeds.json")]
    return import_noaa.main(argv)


def test_without_seeds_only_reports(tmp_path, capsys):
    assert _run(tmp_path, "--report", str(tmp_path / "r.txt")) == 0
    out = capsys.readouterr().out
    assert "== CA37A02: 3 areas" in out
    assert "CA37A02-1 " in out and "inside point" in out and "[unseeded]" in out
    assert (tmp_path / "r.txt").read_text() == out
    assert not (tmp_path / "hand").exists()


def test_seeds_write_both_files_deterministically(tmp_path, capsys):
    seeds = [_seed("bay", -122.38, 37.78, "bay"), _seed("marsh", -122.415, 37.77, "marsh"),
             _seed("land", -122.42, 37.79, "land")]
    assert _run(tmp_path, seeds=seeds) == 0
    out = capsys.readouterr().out
    assert "bay: 1 areas" in out and "marsh: 1 areas" in out and "unseeded: 0 areas" in out
    bay, marsh = (tmp_path / "hand" / import_noaa.OUTPUT_FILES[c] for c in ("bay", "marsh"))
    first = bay.read_bytes(), marsh.read_bytes()
    assert len(load_features(bay, require_provenance=True)) == 1
    (feat,) = load_features(marsh, require_provenance=True)
    assert feat.properties["seed"] == "marsh" and feat.properties["confidence"] == "inferred"
    for path in (bay, marsh):
        assert check_file(path, tuple(REGION_BBOX)).ok
    assert _run(tmp_path, seeds=list(reversed(seeds))) == 0
    assert (bay.read_bytes(), marsh.read_bytes()) == first


def test_no_water_seeds_write_empty_files(tmp_path):
    assert _run(tmp_path, seeds=[_seed("land", -122.42, 37.79, "land")]) == 0
    for name in import_noaa.OUTPUT_FILES.values():
        path = tmp_path / "hand" / name
        assert path.read_text() == EMPTY_FC
        assert check_file(path, tuple(REGION_BBOX)).ok


@pytest.mark.parametrize("seeds, message", [
    ([_seed("x", -122.38, 37.78, "bay"), _seed("y", -122.37, 37.79, "marsh")], "says"),
    ([_seed("x", -122.41, 37.765, "bay")], "boundary between"),  # a vertex of the loop
    ([_seed("x", -122.50, 37.78, "bay")], "lies in no area"),
    ([_seed("x", -122.0, 37.78, "bay")], "outside the region bbox"),
    ([{**_seed("x", -122.38, 37.78, "bay"), "project": "CA37B08"}], "not imported"),
])
def test_seed_errors_exit_1_and_write_nothing(tmp_path, capsys, seeds, message):
    assert _run(tmp_path, seeds=seeds) == 1
    assert message in capsys.readouterr().err
    assert not (tmp_path / "hand").exists()


def test_missing_project_exits_1(tmp_path, capsys):
    _write_project(tmp_path / "noaa")
    assert import_noaa.main(["--projects", "CA37B99", "--noaa-dir", str(tmp_path / "noaa"),
                             "--region", str(_write_region(tmp_path / "region.json"))]) == 1
    assert "historicl1.shp not found" in capsys.readouterr().err


def test_line_classes_and_negative_distances(tmp_path, capsys):
    assert _run(tmp_path, "--line-classes", "20") == 0
    assert "== CA37A02: 2 areas" in capsys.readouterr().out  # no marsh-edge loop
    with pytest.raises(SystemExit):
        _run(tmp_path, "--snap-m", "-1")


def test_preview_is_written(tmp_path):
    pytest.importorskip("PIL")
    seeds = [_seed("bay", -122.38, 37.78, "bay")]
    assert _run(tmp_path, "--preview", str(tmp_path / "p.png"), "--bbox", *map(str, FRAME),
                seeds=seeds) == 0
    assert (tmp_path / "p.png").stat().st_size > 0
