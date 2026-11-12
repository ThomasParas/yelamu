import json

import numpy as np
import pytest
import rasterio

from yelamu.compare import (
    LAND,
    MARSH,
    POND,
    WATER,
    Window,
    blend,
    classify,
    crop_window,
    draw_mask,
    hillshade,
    load_assets,
    lonlat_ticks,
    placeholder,
    read_sheet,
    render_reconstruction,
    scale_bar_pixels,
    shoreline_edges,
    window_grid,
)
from yelamu.export import Layer, write_assets
from yelamu.geo import UTM_CRS, Grid, lonlat_to_utm

META = {
    "width": 100, "height": 80, "cell_m": 10.0, "west": 550000.0, "north": 4182000.0,
    "south": 4181200.0, "east": 551000.0, "min_m": -3.0, "max_m": 200.0, "water_level_m": 0.6,
    "habitat_classes": [
        {"id": 0, "name": "Unmapped", "group": "unmapped"},
        {"id": 1, "name": "Open bay", "group": "water"},
        {"id": 5, "name": "Pond class", "group": "water"},
        {"id": 6, "name": "Tidal marsh", "group": "marsh"},
        {"id": 7, "name": "Beach", "group": "beach"},
    ],
}


def test_classify_bay_marsh_pond_and_land():
    heights = np.array([[-3.0, 0.5, 5.6, 5.6, 40.0, 0.55]], dtype="float32")
    habitat = np.array([[1, 6, 5, 7, 7, 1]], dtype=np.uint8)
    out = classify(heights, habitat, META)
    assert out.tolist() == [[WATER, MARSH, POND, LAND, LAND, WATER]]
    assert out.dtype == np.uint8 and (LAND, WATER, MARSH, POND) == (0, 1, 2, 3)


def test_classify_without_habitat_uses_heights_only():
    heights = np.array([[-3.0, 0.5, 5.6, 40.0]], dtype="float32")
    out = classify(heights, None, META)
    assert out.tolist() == [[WATER, MARSH, LAND, LAND]]  # a pond is invisible without habitat


def test_classify_marsh_group_at_bay_height_stays_bay():
    heights = np.array([[-3.0, 0.2]], dtype="float32")
    habitat = np.array([[6, 6]], dtype=np.uint8)  # tidal flat/marsh class but bay height
    assert classify(heights, habitat, META).tolist() == [[WATER, WATER]]


def test_shoreline_edges_is_a_one_pixel_line_on_the_water_side():
    water = np.zeros((7, 7), dtype=bool)
    water[2:6, 2:6] = True
    edges = shoreline_edges(water)
    assert edges.sum() == 12  # the ring of a 4x4 block
    assert not edges[3, 3] and not edges[4, 4]
    assert edges[2, 2] and edges[2, 5] and edges[5, 5]
    assert not edges[~water].any()
    # The array border is not a shoreline.
    assert not shoreline_edges(np.ones((4, 4), dtype=bool)).any()
    assert not shoreline_edges(np.zeros((4, 4), dtype=bool)).any()
    half = np.zeros((4, 6), dtype=bool)
    half[:, :3] = True
    assert shoreline_edges(half).tolist() == [[False, False, True, False, False, False]] * 4


def test_crop_window_clamps_and_rejects():
    lon0, lat0 = -122.39, 37.78
    x, y = lonlat_to_utm(lon0, lat0)
    meta = {**META, "west": x - 500, "east": x + 500, "north": y + 400, "south": y - 400}
    w = crop_window(meta, (lon0 - 0.0005, lat0 - 0.0005, lon0 + 0.0005, lat0 + 0.0005))
    assert isinstance(w, Window)
    assert 0 <= w.col0 < w.col1 <= 100 and 0 <= w.row0 < w.row1 <= 80
    assert 8 <= w.width <= 14 and 9 <= w.height <= 14  # ~ 85 m x 110 m at 10 m cells
    # centred on the grid centre
    assert abs((w.col0 + w.col1) / 2 - 50) <= 1 and abs((w.row0 + w.row1) / 2 - 40) <= 1
    # partly outside: clamped
    big = crop_window(meta, (lon0 - 0.05, lat0 - 0.05, lon0 + 0.0005, lat0 + 0.0005))
    assert big.col0 == 0 and big.row1 == 80 and big.col1 < 100
    assert big.slices() == (slice(big.row0, 80), slice(0, big.col1))
    # entirely outside
    with pytest.raises(ValueError, match="outside"):
        crop_window(meta, (lon0 + 1, lat0 + 1, lon0 + 1.1, lat0 + 1.1))
    with pytest.raises(ValueError):
        crop_window(meta, (lon0, lat0, lon0 - 1, lat0 + 1))
    # whole grid
    full = crop_window(meta, (lon0 - 0.05, lat0 - 0.05, lon0 + 0.05, lat0 + 0.05))
    assert (full.row0, full.row1, full.col0, full.col1) == (0, 80, 0, 100)


def test_window_grid_matches_the_cells():
    win = Window(10, 30, 20, 60)
    g = window_grid(META, win)
    assert (g.width, g.height) == (40, 20)
    assert g.west == 550200.0 and g.north == 4181900.0 and g.cell == 10.0
    assert g.east == 550600.0 and g.south == 4181700.0


@pytest.mark.parametrize("cell,scale,metres,expected", [
    (10, 2, 500, 100), (5, 1, 500, 100), (10, 1, 500, 50), (25, 2, 500, 40), (1000, 1, 500, 1)])
def test_scale_bar_pixels(cell, scale, metres, expected):
    assert scale_bar_pixels(cell, scale, metres) == expected


def test_hillshade_flat_and_slopes():
    flat = np.zeros((6, 6))
    assert np.allclose(hillshade(flat, 10.0), np.sin(np.radians(45)))
    # Rows run southwards. A surface rising towards the SE faces the NW sun: brighter.
    rows, cols = np.mgrid[0:8, 0:8]
    se_up = 3.0 * (rows + cols)
    nw_up = -se_up
    lit, dark = hillshade(se_up, 10.0)[4, 4], hillshade(nw_up, 10.0)[4, 4]
    assert lit > np.sin(np.radians(45)) > dark
    assert 0.0 <= dark and lit <= 1.0


def test_render_reconstruction_colours_and_shoreline():
    heights = np.full((20, 20), 30.0, dtype="float32")
    heights[:, :8] = -3.0  # bay in the west
    heights[2:5, 14:17] = 0.5  # marsh
    habitat = np.full((20, 20), 7, dtype=np.uint8)
    habitat[:, :8] = 1
    habitat[2:5, 14:17] = 6
    habitat[10:13, 12:15] = 5  # pond (at land height)
    meta = {**META, "width": 20, "height": 20}
    rgb, shore = render_reconstruction(heights, habitat, meta, scale=2)
    assert rgb.shape == (40, 40, 3) and rgb.dtype == np.uint8 and shore.shape == (40, 40)
    water, marsh, pond, land = rgb[20, 2], rgb[7, 29], rgb[22, 26], rgb[30, 30]
    assert water[2] > water[0] and water[2] > 120  # blue dominant
    assert marsh[1] > marsh[0] and marsh[2] > marsh[0] and abs(int(marsh[1]) - int(marsh[2])) < 40  # teal
    assert pond[2] > pond[0]
    assert land[0] > land[2]  # tan: red above blue
    # Shoreline: one pixel wide on the water side along x = 15 (cell 7 -> px 14..15)
    assert shore[20, 15] and not shore[20, 14] and not shore[20, 16]
    assert shore.sum() > 0 and not shore[30, 30]
    drawn = draw_mask(rgb, shore)
    assert tuple(drawn[20, 15]) == (139, 26, 26) and (drawn[30, 30] == rgb[30, 30]).all()
    assert (rgb[20, 15] == water).all()  # the unmarked render is untouched


def test_blend_is_a_half_mix_and_validates():
    a = np.full((2, 2, 3), 200, dtype=np.uint8)
    b = np.full((2, 2, 3), 100, dtype=np.uint8)
    assert (blend(a, b) == 150).all()
    assert (blend(a, b, 1.0) == 200).all()
    with pytest.raises(ValueError):
        blend(a, b[:1])
    assert placeholder(2, 3).shape == (2, 3, 3)


def test_ticks_lie_inside_and_roundtrip():
    x, y = lonlat_to_utm(-122.47, 37.725)
    grid = Grid(west=x - 3000, south=y - 3000, east=x + 3000, north=y + 3000, cell=10)
    xt, yt = lonlat_ticks(grid, scale=2)
    assert 2 <= len(xt) <= 6 and 2 <= len(yt) <= 6
    assert all(0 <= p <= grid.width * 2 for p, _ in xt)
    assert all(0 <= p <= grid.height * 2 for p, _ in yt)
    assert [p for p, _ in xt] == sorted(p for p, _ in xt)
    assert all(label.endswith("W") for _, label in xt) and all(label.endswith("N") for _, label in yt)
    assert [p for p, _ in yt] == sorted(p for p, _ in yt)  # top (north) first
    # So the labels' latitudes decrease down the list.
    lats = [float(l[:-1]) for _, l in yt]
    assert lats == sorted(lats, reverse=True)


def test_ticks_are_placed_on_the_edge_they_are_drawn_on_for_the_full_city():
    from pyproj import Transformer
    grid = Grid.from_lonlat_bbox(-122.53, 37.70, -122.33, 37.84, cell=10)
    to_lonlat = Transformer.from_crs(UTM_CRS, "EPSG:4326", always_xy=True)
    scale = 2
    xt, yt = lonlat_ticks(grid, scale=scale)
    assert len(xt) >= 2 and len(yt) >= 2
    for px, label in xt:  # longitudes sit on the BOTTOM edge (y = south)
        lon = -float(label[:-1])
        lon_at_px, _ = to_lonlat.transform(grid.west + px / scale * grid.cell, grid.south)
        metres = abs(lon_at_px - lon) * 111_320 * np.cos(np.radians(37.77))
        assert metres <= 0.5 * grid.cell, (label, metres)
    for py, label in yt:  # latitudes sit on the LEFT edge (x = west)
        lat = float(label[:-1])
        _, lat_at_py = to_lonlat.transform(grid.west, grid.north - py / scale * grid.cell)
        assert abs(lat_at_py - lat) * 111_000 <= 0.5 * grid.cell, (label, lat_at_py)


def _write_sheet(path, grid, value_rgb, crs=UTM_CRS, alpha=None, offset=(0.0, 0.0)):
    h, w = grid.height, grid.width
    data = np.zeros((4 if alpha is not None else 3, h, w), dtype="uint8")
    for i, v in enumerate(value_rgb):
        data[i] = v
    if alpha is not None:
        data[3] = alpha
    transform = rasterio.transform.from_origin(grid.west + offset[0], grid.north + offset[1],
                                               grid.cell, grid.cell)
    with rasterio.open(path, "w", driver="GTiff", height=h, width=w, count=data.shape[0],
                       dtype="uint8", crs=crs, transform=transform) as dst:
        dst.write(data)


def test_read_sheet_reprojects_onto_the_crop_grid_with_placeholder_outside(tmp_path):
    grid = Grid(west=550000, south=4181000, east=550200, north=4181200, cell=10)  # 20 x 20
    # The sheet covers only the western half of the crop (10 cells = 100 m), at the same cell size.
    sheet_grid = Grid(west=550000, south=4181000, east=550100, north=4181200, cell=10)
    _write_sheet(tmp_path / "s.tif", sheet_grid, (200, 30, 40))
    rgb = read_sheet(tmp_path / "s.tif", grid, scale=2)
    assert rgb.shape == (40, 40, 3)
    assert tuple(rgb[20, 5]) == (200, 30, 40)
    assert tuple(rgb[20, 35]) == (200, 200, 200)  # grey placeholder where the sheet is absent


def test_read_sheet_alpha_and_unreferenced(tmp_path):
    grid = Grid(west=550000, south=4181000, east=550200, north=4181200, cell=10)
    alpha = np.full((20, 20), 255, dtype="uint8")
    alpha[:, 10:] = 0
    _write_sheet(tmp_path / "a.tif", grid, (10, 20, 30), alpha=alpha)
    rgb = read_sheet(tmp_path / "a.tif", grid, scale=1)
    assert tuple(rgb[5, 2]) == (10, 20, 30) and tuple(rgb[5, 17]) == (200, 200, 200)
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with rasterio.open(tmp_path / "n.tif", "w", driver="GTiff", height=4, width=4, count=1,
                           dtype="uint8") as dst:
            dst.write(np.zeros((1, 4, 4), dtype="uint8"))
    with pytest.raises(ValueError, match="georeferenc"):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            read_sheet(tmp_path / "n.tif", grid)


def test_load_assets_round_trip(tmp_path):
    grid = Grid(west=550000, south=4181000, east=550040, north=4181030, cell=10)
    dem = np.arange(12, dtype="float32").reshape(3, 4) - 2.0
    hab = np.arange(12, dtype=np.uint8).reshape(3, 4)
    write_assets(dem, grid, [Layer("terrain", "s", "inferred", "a")], tmp_path, None, hab,
                 [{"id": 0, "name": "Unmapped", "group": "unmapped"}])
    meta, heights, habitat = load_assets(tmp_path)
    assert heights.shape == (3, 4) and np.abs(heights - dem).max() < 0.01
    assert (habitat == hab).all() and meta["width"] == 4
    write_assets(dem, grid, [Layer("terrain", "s", "inferred", "a")], tmp_path / "b")
    assert load_assets(tmp_path / "b")[2] is None
