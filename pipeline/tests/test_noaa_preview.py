"""yelamu.noaa_preview: the pure parts, plus a render smoke test when Pillow is present."""

import numpy as np
import pytest
from shapely.geometry import LineString, box

from yelamu.compare import LAND
from yelamu.geo import Grid
from yelamu.noaa import MEAN_HIGH_WATER, WHARF, Area, Line, Seed, utm_geom_to_lonlat
from yelamu.noaa_preview import (
    BACKGROUND_RGB, LINE_COLOURS, OTHER_LINE_RGB, RECON_LAND_RGB, RECON_WATER_RGB,
    UNSEEDED_TINTS, View, background, hatch_mask, label_point, legend_entries, line_colour,
    make_view, nice_bar_m, render, short_label, unseeded_tint)

X0, Y0 = 550_000.0, 4_180_000.0


def test_view_size_and_pixel_mapping():
    view = View(X0, Y0, X0 + 1000, Y0 + 500, 10.0)
    assert (view.width, view.height) == (100, 50)
    assert view.px(X0, Y0 + 500) == (0.0, 0.0)  # north-west corner
    assert view.px(X0 + 1000, Y0) == (100.0, 50.0)
    grid = view.grid()
    assert (grid.width, grid.height, grid.cell) == (100, 50, 10.0)


def test_make_view_from_bbox_or_boundaries():
    view = make_view((-122.42, 37.75, -122.37, 37.80), [], max_side_px=1000)
    assert max(view.width, view.height) == 1000
    assert view.east - view.west == pytest.approx(4400, rel=0.02)
    frames = [box(X0, Y0, X0 + 2000, Y0 + 1000), box(X0 + 1000, Y0 - 1000, X0 + 3000, Y0)]
    view = make_view(None, frames, max_side_px=300)
    assert (view.west, view.south, view.east, view.north) == (X0, Y0 - 1000, X0 + 3000, Y0 + 1000)
    assert (view.width, view.height) == (300, 200)
    with pytest.raises(ValueError):
        make_view((-122.37, 37.75, -122.42, 37.80), [])
    with pytest.raises(ValueError):
        make_view(None, [])


def test_short_label_drops_the_common_project_prefix():
    projects = ["CA37A02", "CA37B07", "CA37B08"]
    assert short_label("CA37B08-7", projects) == "B08-7"
    assert short_label("CA37A02-12", projects) == "A02-12"
    assert short_label("CA37A02-3", ["CA37A02"]) == "CA37A02-3"


def test_colours_and_tints():
    assert line_colour(MEAN_HIGH_WATER) == LINE_COLOURS[MEAN_HIGH_WATER]
    assert line_colour(999) == OTHER_LINE_RGB
    assert unseeded_tint("CA37A02-1") == UNSEEDED_TINTS[1]
    assert unseeded_tint(f"CA37A02-{len(UNSEEDED_TINTS) + 1}") == UNSEEDED_TINTS[1]
    kinds = [k for k, _, _ in legend_entries()]
    assert kinds[:4] == ["fill", "fill", "hatch", "outline"] and kinds[-1] == "dot"
    assert sum(k == "line" for k in kinds) == len(LINE_COLOURS)


def test_hatch_mask_is_diagonal_stripes():
    mask = hatch_mask(4, 6, step=3)
    assert mask.shape == (4, 6)
    assert mask[0, 0] and mask[0, 3] and mask[1, 2] and not mask[0, 1]
    assert mask.sum() == sum((r + c) % 3 == 0 for r in range(4) for c in range(6))


def test_background_samples_the_reconstruction():
    view = View(X0, Y0, X0 + 40, Y0 + 20, 10.0)  # 4 x 2 pixels
    assert (background(view, None, None) == BACKGROUND_RGB).all()
    grid = Grid(X0, Y0, X0 + 20, Y0 + 20, 10.0)  # covers the west half only
    codes = np.array([[LAND, 1], [1, LAND]])
    rgb = background(view, codes, grid)
    assert tuple(rgb[0, 0]) == RECON_LAND_RGB and tuple(rgb[0, 1]) == RECON_WATER_RGB
    assert tuple(rgb[1, 0]) == RECON_WATER_RGB and tuple(rgb[1, 1]) == RECON_LAND_RGB
    assert tuple(rgb[0, 3]) == BACKGROUND_RGB  # outside the grid


def test_nice_bar_and_label_point():
    assert nice_bar_m(10_000) == 2000
    assert nice_bar_m(3_000) == 500
    assert nice_bar_m(1) == 1
    ring = box(0, 0, 10, 10).difference(box(2, 2, 8, 8))
    assert ring.contains(label_point(ring))


def test_render_smoke(tmp_path):
    pytest.importorskip("PIL")
    from PIL import Image

    view = View(X0, Y0, X0 + 1000, Y0 + 1000, 5.0)
    area = lambda i, geom: Area(f"CA37A02-{i}", "CA37A02", geom, geom.area, "T-00352", 1852,
                                "mean high water line")
    areas = [area(1, box(X0, Y0, X0 + 500, Y0 + 1000)),
             area(2, box(X0 + 500, Y0, X0 + 1000, Y0 + 1000).difference(
                 box(X0 + 600, Y0 + 600, X0 + 700, Y0 + 700))),
             area(3, box(X0 + 600, Y0 + 600, X0 + 700, Y0 + 700))]
    lines = [Line(LineString([(X0 + 500, Y0), (X0 + 500, Y0 + 1000)]), "", MEAN_HIGH_WATER,
                  "T-00352", 1852, "CA37A02"),
             Line(LineString([(X0 + 600, Y0 + 100), (X0 + 700, Y0 + 100)]), "", WHARF,
                  "T-00352", 1852, "CA37A02")]
    p = utm_geom_to_lonlat(box(X0 + 700, Y0 + 200, X0 + 800, Y0 + 300).centroid)
    seeds = [Seed("bay-seed", "CA37A02", p.x, p.y, "bay", "s", "inferred")]
    out = tmp_path / "p.png"
    size = render(out, view, areas, {"CA37A02-2": "bay", "CA37A02-1": "land"}, lines,
                  [LineString([(X0 + 10, Y0 + 10), (X0 + 100, Y0 + 100)])],
                  [LineString([(X0 + 200, Y0 + 500), (X0 + 300, Y0 + 500)])], seeds, "test",
                  np.zeros((10, 10), dtype=np.uint8), Grid(X0, Y0, X0 + 100, Y0 + 100, 10.0))
    with Image.open(out) as image:
        assert image.size == size
        assert image.size[0] > view.width and image.size[1] > view.height
