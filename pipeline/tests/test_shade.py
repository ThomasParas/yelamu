import json

import numpy as np
import pytest

from yelamu.export import quantize_heights
from yelamu.shade import SHADE_FILE, ShadeParams, build_shade, coarse_grid, compute_shade, to_u8

CELL = 10.0


def hill(n=81, peak=60.0, radius=12.0):
    """A round hill in the middle of flat ground (heights in metres, n x n samples)."""
    y, x = np.mgrid[0:n, 0:n]
    r = np.hypot(x - n // 2, y - n // 2)
    return np.where(r < radius, peak * (1 - r / radius), 0.0)


def test_coarse_grid_keeps_the_last_row_and_column():
    h = np.arange(7 * 10, dtype=float).reshape(7, 10)
    c = coarse_grid(h, 4)
    assert c.shape == (3, 4)  # rows 0, 4, 6; cols 0, 4, 8, 9
    assert c[-1, -1] == h[-1, -1]
    assert c[1, 2] == h[4, 8]


def test_flat_ground_is_unshaded():
    s = compute_shade(np.full((40, 50), 12.0), CELL)
    assert s.shape == (21, 26)  # rows 0, 2 .. 38 and the last row 39
    assert np.allclose(s, 1.0)


def test_a_hill_shadows_the_side_away_from_the_sun():
    # Sun low in the west (toward -x): the shadow falls east (+x) of the hill.
    p = ShadeParams(stride=1, sun=(-1.0, 0.4, 0.0), ao_strength=0.0)
    s = compute_shade(hill(), CELL, p)
    mid = 40
    west_foot, east_foot = s[mid, mid - 14], s[mid, mid + 14]
    assert west_foot == pytest.approx(1.0)
    assert east_foot < 0.7
    assert s.min() >= 1 - p.shadow_strength - 1e-9


def test_overhead_sun_casts_no_shadow():
    p = ShadeParams(stride=1, sun=(0.0, 1.0, 0.0), ao_strength=0.0)
    assert np.allclose(compute_shade(hill(), CELL, p), 1.0)


def test_a_pit_is_occluded_and_a_summit_is_not():
    p = ShadeParams(stride=1, shadow_strength=0.0)
    pit = compute_shade(-hill(), CELL, p)
    top = compute_shade(hill(), CELL, p)
    assert pit[40, 40] < 0.6
    assert top[40, 40] == pytest.approx(1.0)


def test_exaggeration_deepens_the_shading():
    flat = ShadeParams(stride=1, exaggeration=1.0, shadow_strength=0.0)
    tall = ShadeParams(stride=1, exaggeration=3.0, shadow_strength=0.0)
    assert compute_shade(-hill(), CELL, tall)[40, 40] < compute_shade(-hill(), CELL, flat)[40, 40]


def test_rejects_degenerate_grids():
    with pytest.raises(ValueError):
        compute_shade(np.zeros((1, 5)), CELL)


def test_to_u8_rounds_and_clips():
    assert to_u8(np.array([0.0, 0.5, 1.0, 1.2, -0.1])).tolist() == [0, 128, 255, 255, 0]


def test_build_shade_writes_the_grid_and_records_it_in_meta(tmp_path):
    h = hill(41, peak=50.0, radius=8.0)
    quantize_heights(h, 0.0, 50.0).astype("<u2").tofile(tmp_path / "heightmap.u16")
    meta = {"width": 41, "height": 41, "cell_m": CELL, "min_m": 0.0, "max_m": 50.0,
            "heights_file": "heightmap.u16", "layers": []}
    (tmp_path / "meta.json").write_text(json.dumps(meta))
    doc = build_shade(tmp_path, ShadeParams(stride=2))
    out = json.loads((tmp_path / "meta.json").read_text())
    assert out["shade"]["file"] == SHADE_FILE
    assert (out["shade"]["cols"], out["shade"]["rows"], out["shade"]["stride"]) == (21, 21, 2)
    assert out["shade"]["exaggeration"] == 3.0
    assert out["layers"] == []  # a rendering aid, not a data layer
    data = np.fromfile(tmp_path / SHADE_FILE, dtype=np.uint8)
    assert data.size == 21 * 21
    assert data.min() < 255 and doc["min"] < 1.0


def test_build_shade_needs_a_built_city(tmp_path):
    with pytest.raises(FileNotFoundError):
        build_shade(tmp_path)
