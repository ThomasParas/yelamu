import json

import numpy as np
import pytest
from PIL import Image

from yelamu.export import Layer, decode_heights, encode_heights, write_assets
from yelamu.geo import Grid


def test_encode_decode_round_trip_is_sub_millimetre_precise():
    dem = np.array([[-3.0, 0.0, 12.345], [100.0, 250.5, 281.0]], dtype="float32")
    rgb = encode_heights(dem, min_m=-10.0, max_m=300.0)
    assert rgb.dtype == np.uint8 and rgb.shape == (2, 3, 3)
    back = decode_heights(rgb, min_m=-10.0, max_m=300.0)
    # 310 m of range over 65535 steps is ~4.7 mm per step.
    assert np.abs(back - dem).max() < 0.005


def test_known_byte_values():
    # The range floor maps to 0x0000 and the ceiling to 0xFFFF.
    rgb = encode_heights(np.array([[0.0, 10.0]], dtype="float32"), min_m=0.0, max_m=10.0)
    assert rgb[0, 0].tolist() == [0, 0, 0]
    assert rgb[0, 1].tolist() == [255, 255, 0]


def test_layer_rejects_unknown_confidence():
    with pytest.raises(ValueError):
        Layer(id="x", source="s", confidence="guess", attribution="a")


def test_write_assets_creates_png_and_meta(tmp_path):
    grid = Grid(west=500000, south=4180000, east=500040, north=4180030, cell=10)  # 4 x 3
    dem = np.arange(12, dtype="float32").reshape(3, 4) - 2.0  # -2 .. 9
    layers = [Layer("terrain", "USGS 3DEP", "inferred", "USGS")]

    meta = write_assets(dem, grid, layers, tmp_path)

    assert (tmp_path / "heightmap.png").exists()
    on_disk = json.loads((tmp_path / "meta.json").read_text())
    assert on_disk == meta
    assert (meta["width"], meta["height"], meta["cell_m"]) == (4, 3, 10)
    assert (meta["min_m"], meta["max_m"]) == (-2.0, 9.0)
    assert meta["layers"][0]["confidence"] == "inferred"

    img = np.asarray(Image.open(tmp_path / "heightmap.png"))
    assert img.shape == (3, 4, 3)
    back = decode_heights(img, meta["min_m"], meta["max_m"])
    assert np.abs(back - dem).max() < 0.001
