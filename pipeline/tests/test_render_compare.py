"""Smoke test for scripts/render_compare.py (needs Pillow, which is not a project dependency:
`uv run --with pillow pytest tests/test_render_compare.py`; skipped otherwise)."""

import importlib.util
import sys
from pathlib import Path

import numpy as np
import pytest

pytest.importorskip("PIL")

from yelamu.export import Layer, write_assets  # noqa: E402
from yelamu.geo import Grid, lonlat_to_utm  # noqa: E402

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "render_compare.py"


def _load():
    spec = importlib.util.spec_from_file_location("render_compare", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["render_compare"] = mod
    spec.loader.exec_module(mod)
    return mod


def test_script_renders_three_panels(tmp_path):
    from PIL import Image
    x, y = lonlat_to_utm(-122.47, 37.72)
    grid = Grid(west=x - 1000, south=y - 1000, east=x + 1000, north=y + 1000, cell=10)
    dem = np.full((grid.height, grid.width), 20.0, dtype="float32")
    dem[:, :60] = -3.0
    hab = np.full(dem.shape, 7, dtype=np.uint8)
    write_assets(dem, grid, [Layer("terrain", "s", "inferred", "a")], tmp_path / "assets", None, hab,
                 [{"id": 7, "name": "Beach", "group": "beach"}])
    out = tmp_path / "cmp.png"
    mod = _load()
    assert mod.main([str(tmp_path / "assets"), "--bbox", "-122.48", "37.715", "-122.46", "37.725",
                     "--scale", "2", "--out", str(out)]) == 0
    img = Image.open(out)
    assert img.width > 3 * 100 and img.height > 100
    px = np.asarray(img)
    assert (px == (139, 26, 26)).all(axis=-1).any()  # the shoreline line is drawn
    assert mod.main([str(tmp_path / "assets"), "--bbox", "-100", "10", "-99", "11",
                     "--out", str(tmp_path / "x.png")]) == 1
