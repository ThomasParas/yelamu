import json

import numpy as np
import pytest

from yelamu.export import Layer, dequantize_heights, quantize_heights, write_assets
from yelamu.geo import Grid
from yelamu.terrain import WATER_LEVEL_M


def test_quantize_dequantize_round_trip_is_sub_millimetre_precise():
    dem = np.array([[-3.0, 0.0, 12.345], [100.0, 250.5, 281.0]], dtype="float32")
    q = quantize_heights(dem, min_m=-10.0, max_m=300.0)
    assert q.dtype == np.uint16 and q.shape == (2, 3)
    back = dequantize_heights(q, min_m=-10.0, max_m=300.0)
    assert back.dtype == np.float32
    # 310 m of range over 65535 steps is ~4.7 mm per step.
    assert np.abs(back - dem).max() < 0.005


def test_known_quantized_values():
    # The range floor maps to 0 and the ceiling to 65535.
    q = quantize_heights(np.array([[0.0, 10.0]], dtype="float32"), min_m=0.0, max_m=10.0)
    assert q.tolist() == [[0, 65535]]


def test_layer_rejects_unknown_confidence():
    with pytest.raises(ValueError):
        Layer(id="x", source="s", confidence="guess", attribution="a")


def test_write_assets_creates_raw_heights_and_meta(tmp_path):
    grid = Grid(west=500000, south=4180000, east=500040, north=4180030, cell=10)  # 4 x 3
    dem = np.arange(12, dtype="float32").reshape(3, 4) - 2.0  # -2 .. 9
    layers = [Layer("terrain", "USGS 3DEP", "inferred", "USGS")]

    meta = write_assets(dem, grid, layers, tmp_path)

    raw = tmp_path / "heightmap.u16"
    assert raw.exists()
    assert raw.stat().st_size == 4 * 3 * 2
    assert not (tmp_path / "heightmap.png").exists()
    on_disk = json.loads((tmp_path / "meta.json").read_text())
    assert on_disk == meta
    assert (meta["width"], meta["height"], meta["cell_m"]) == (4, 3, 10)
    assert (meta["min_m"], meta["max_m"]) == (-2.0, 9.0)
    assert meta["layers"][0]["confidence"] == "inferred"
    assert meta["heights_file"] == "heightmap.u16"
    assert meta["heights_format"] == "uint16-le"
    assert meta["water_level_m"] == WATER_LEVEL_M

    q = np.fromfile(raw, dtype="<u2").reshape(3, 4)
    back = dequantize_heights(q, meta["min_m"], meta["max_m"])
    assert np.abs(back - dem).max() < 0.001
    assert q[0, 0] == 0 and q[2, 3] == 65535  # row 0 is north, floor/ceiling at the ends


@pytest.mark.parametrize("bad", [np.nan, np.inf, -np.inf])
def test_write_assets_rejects_non_finite_heights(tmp_path, bad):
    grid = Grid(west=500000, south=4180000, east=500020, north=4180020, cell=10)
    dem = np.array([[1.0, bad], [2.0, 3.0]], dtype="float32")
    with pytest.raises(ValueError, match="NaN or infinite"):
        write_assets(dem, grid, [Layer("terrain", "s", "inferred", "a")], tmp_path)
    assert not (tmp_path / "heightmap.u16").exists()


# ------------------------------------------------------------ habitat raster ---

_LEGEND = [{"id": 0, "name": "Unmapped", "group": "unmapped"},
           {"id": 4, "name": "Beach", "group": "beach"}]


def test_write_assets_without_habitat_has_no_habitat_keys(tmp_path):
    grid = Grid(west=500000, south=4180000, east=500020, north=4180020, cell=10)
    meta = write_assets(np.zeros((2, 2), dtype="float32"), grid,
                        [Layer("terrain", "s", "inferred", "a")], tmp_path)
    assert "habitat_file" not in meta and "habitat_classes" not in meta
    assert not (tmp_path / "habitat.u8").exists()


def test_write_assets_round_trips_the_habitat_raster(tmp_path):
    grid = Grid(west=500000, south=4180000, east=500040, north=4180030, cell=10)  # 4 x 3
    dem = np.arange(12, dtype="float32").reshape(3, 4)
    habitat = np.arange(12, dtype=np.uint8).reshape(3, 4) * 20

    meta = write_assets(dem, grid, [Layer("terrain", "s", "inferred", "a")], tmp_path,
                        habitat=habitat, habitat_classes=_LEGEND)

    raw = tmp_path / "habitat.u8"
    assert raw.stat().st_size == 4 * 3  # width * height bytes
    assert (np.fromfile(raw, dtype=np.uint8).reshape(3, 4) == habitat).all()  # row 0 north
    assert meta["habitat_file"] == "habitat.u8"
    assert meta["habitat_classes"] == _LEGEND
    assert json.loads((tmp_path / "meta.json").read_text()) == meta


@pytest.mark.parametrize("habitat, match", [
    (np.zeros((2, 4), dtype=np.uint8), "shape"),
    (np.zeros((3, 4), dtype=np.int32), "uint8"),
    (np.zeros((3, 4), dtype=np.uint16), "uint8"),
])
def test_write_assets_rejects_bad_habitat_raster(tmp_path, habitat, match):
    grid = Grid(west=500000, south=4180000, east=500040, north=4180030, cell=10)
    with pytest.raises(ValueError, match=match):
        write_assets(np.zeros((3, 4), dtype="float32"), grid,
                     [Layer("terrain", "s", "inferred", "a")], tmp_path,
                     habitat=habitat, habitat_classes=_LEGEND)
    assert not (tmp_path / "heightmap.u16").exists()  # validated before anything is written


def test_write_assets_requires_a_legend_with_the_raster(tmp_path):
    grid = Grid(west=500000, south=4180000, east=500020, north=4180020, cell=10)
    with pytest.raises(ValueError, match="habitat_classes"):
        write_assets(np.zeros((2, 2), dtype="float32"), grid,
                     [Layer("terrain", "s", "inferred", "a")], tmp_path,
                     habitat=np.zeros((2, 2), dtype=np.uint8))
