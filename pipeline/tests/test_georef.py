"""Georeferencing on SYNTHETIC sheets with a known truth."""

import warnings

import numpy as np
import pytest
import rasterio
from pyproj import Transformer

from yelamu.geo import UTM_CRS, Grid
from yelamu.georef import (
    GCP,
    fit_polynomial,
    main,
    read_gcps,
    residuals_m,
    rms_m,
    warp,
    write_geotiff,
)

TO_LONLAT = Transformer.from_crs(UTM_CRS, "EPSG:4326", always_xy=True)
BBOX = (-122.42, 37.77, -122.40, 37.785)  # about 1.8 km x 1.7 km
GRID = Grid.from_lonlat_bbox(*BBOX, cell=5)
X0, Y0 = GRID.west, GRID.south
W_PX, H_PX = 420, 400  # the scan


def truth(x, y):
    """The 'surveyor's truth': ground UTM -> scan pixel (col, row), corner-origin.

    An affine map (about 0.25 px/m, rows downwards, a small rotation) plus a mild
    quadratic distortion, like a hand-drawn sheet.
    """
    u = (np.asarray(x, dtype="float64") - X0) / 1000.0
    v = (np.asarray(y, dtype="float64") - Y0) / 1000.0
    col = 30 + 220 * u + 14 * v + 9 * u * v + 5 * u * u
    row = 380 - 8 * u - 210 * v + 6 * u * v - 4 * v * v
    return col, row


def invert_truth(col, row, iterations=40):
    """Ground (x, y) for scan pixels by Newton's method (independent of georef.py)."""
    x = np.full_like(np.asarray(col, dtype="float64"), X0 + 900.0)
    y = np.full_like(x, Y0 + 800.0)
    for _ in range(iterations):
        c, r = truth(x, y)
        h = 1e-3
        cx = (truth(x + h, y)[0] - c) / h
        cy = (truth(x, y + h)[0] - c) / h
        rx = (truth(x + h, y)[1] - r) / h
        ry = (truth(x, y + h)[1] - r) / h
        det = cx * ry - cy * rx
        dx = (ry * (col - c) - cy * (row - r)) / det
        dy = (-rx * (col - c) + cx * (row - r)) / det
        x, y = x + dx, y + dy
    return x, y


def ground_field(x, y):
    return 100.0 + 0.05 * (x - X0) + 0.03 * (y - Y0)


def make_scan():
    """A float32 scan whose pixels sample a smooth ground field through the truth map."""
    cc, rr = np.meshgrid(np.arange(W_PX) + 0.5, np.arange(H_PX) + 0.5)
    x, y = invert_truth(cc, rr)
    return ground_field(x, y).astype("float32")


def make_gcps(n=14, seed=3, noise_px=0.0):
    rng = np.random.default_rng(seed)
    x = X0 + rng.uniform(100, GRID.east - X0 - 100, n)
    y = Y0 + rng.uniform(100, GRID.north - Y0 - 100, n)
    col, row = truth(x, y)
    pix = np.column_stack([col, row]) + rng.normal(0, noise_px, (n, 2))
    return pix, np.column_stack([x, y])


# --------------------------------------------------------------------- fitting


@pytest.mark.parametrize("order,n", [(1, 5), (2, 8), (3, 12)])
def test_minimum_points_is_terms_plus_two(order, n):
    pix, utm = make_gcps(n)
    fit_polynomial(pix, utm, order)  # exactly enough
    with pytest.raises(ValueError, match="add more control points"):
        fit_polynomial(pix[:-1], utm[:-1], order)


def test_bad_order_and_shapes_and_degenerate_points():
    pix, utm = make_gcps(12)
    with pytest.raises(ValueError, match="order"):
        fit_polynomial(pix, utm, 4)
    with pytest.raises(ValueError):
        fit_polynomial(pix[:, :1], utm, 1)
    line = np.column_stack([np.linspace(0, 1000, 12) + X0, np.linspace(0, 1000, 12) + Y0])
    with pytest.raises(ValueError, match="degenerate"):
        fit_polynomial(pix, line, 2)  # all on one line: order-2 terms are dependent
    with pytest.raises(ValueError, match="same ground position"):
        fit_polynomial(pix, np.tile(utm[:1], (12, 1)), 1)


@pytest.mark.parametrize("order", [2, 3])
def test_exact_polynomial_truth_is_recovered_to_numerical_precision(order):
    pix, utm = make_gcps(14)
    poly = fit_polynomial(pix, utm, order)  # truth is order 2, so order 3 contains it too
    res = residuals_m(poly, pix, utm)
    assert res.max() < 1e-6
    # And away from the control points the map agrees with the truth.
    x = X0 + np.linspace(50, 1800, 7)
    y = Y0 + np.linspace(60, 1650, 7)
    c, r = poly(x, y)
    tc, tr = truth(x, y)
    assert np.abs(c - tc).max() < 1e-6 and np.abs(r - tr).max() < 1e-6


def test_order_three_is_well_conditioned_at_utm_magnitudes():
    # Real UTM coordinates (5.5e5, 4.18e6): the cube terms would be ~1e19 unnormalised.
    rng = np.random.default_rng(1)
    x = 550000 + rng.uniform(0, 3000, 16)
    y = 4180000 + rng.uniform(0, 3000, 16)
    a, b = (x - 551500) / 1500, (y - 4181500) / 1500
    col = 100 + 300 * a + 20 * b + 8 * a * a - 5 * a * b + 3 * a ** 3 + 2 * b ** 3
    row = 200 - 15 * a - 310 * b + 4 * b * b + 6 * a * a * b - 2 * a * b * b
    pix, utm = np.column_stack([col, row]), np.column_stack([x, y])
    poly = fit_polynomial(pix, utm, 3)
    assert residuals_m(poly, pix, utm).max() < 1e-5


def test_residuals_are_ground_metres_from_the_inverted_map():
    # Pure scale: 0.5 px per metre. Offsetting every pixel by 1 px is a 2 m ground error.
    x = X0 + np.array([0, 100, 200, 0, 100, 200, 300.0])
    y = Y0 + np.array([0, 0, 0, 100, 100, 100, 50.0])
    pix = np.column_stack([0.5 * (x - X0), 0.5 * (Y0 + 400 - y)])
    utm = np.column_stack([x, y])
    poly = fit_polynomial(pix, utm, 1)
    assert residuals_m(poly, pix, utm).max() < 1e-8
    shifted = pix + [1.0, 0.0]
    assert np.allclose(residuals_m(poly, shifted, utm), 2.0, atol=1e-6)
    diag = pix + [0.3, 0.4]  # 0.5 px -> 1 m
    assert np.allclose(residuals_m(poly, diag, utm), 1.0, atol=1e-6)
    assert rms_m([3.0, 4.0]) == pytest.approx(np.sqrt(12.5))


def test_one_wild_control_point_shows_up_in_its_own_residual():
    pix, utm = make_gcps(14)
    pix = pix.copy()
    pix[4] += [150, -120]
    poly = fit_polynomial(pix, utm, 2)
    res = residuals_m(poly, pix, utm)
    assert res.argmax() == 4 and rms_m(res) > 25


# -------------------------------------------------------------------- warping


def test_warp_reproduces_the_ground_field_within_a_fraction_of_a_cell():
    pix, utm = make_gcps(14)
    poly = fit_polynomial(pix, utm, 2)
    out = warp(make_scan(), poly, GRID)
    assert out.shape == (2, GRID.height, GRID.width)  # data + alpha
    xs = GRID.west + (np.arange(GRID.width) + 0.5) * GRID.cell
    ys = GRID.north - (np.arange(GRID.height) + 0.5) * GRID.cell
    xx, yy = np.meshgrid(xs, ys)
    expected = ground_field(xx, yy)
    covered = out[1] > 0
    assert covered.mean() > 0.5
    # field gradient is ~0.058 per metre: 0.15 is under 3 m, i.e. under one 5 m cell
    assert np.abs(out[0][covered] - expected[covered]).max() < 0.15
    # Everything the scan does not cover is transparent
    col, row = truth(xx, yy)
    outside = (col < 0) | (col > W_PX) | (row < 0) | (row > H_PX)
    assert outside.any() and (out[1][outside] == 0).all()
    assert (out[1][~outside] > 0).all()


def test_warp_puts_a_known_feature_in_the_right_cell():
    scan = np.zeros((3, H_PX, W_PX), dtype="uint8")
    fx, fy = X0 + 1000.0, Y0 + 700.0
    c, r = truth(fx, fy)
    scan[:, int(r) - 2:int(r) + 3, int(c) - 2:int(c) + 3] = 255
    pix, utm = make_gcps(12)
    out = warp(scan, fit_polynomial(pix, utm, 2), GRID)
    assert out.shape == (4, GRID.height, GRID.width) and out.dtype == np.uint8
    row, col = GRID.pixel_of(fx, fy)
    hot = np.argwhere(out[0] == 255)
    assert len(hot) > 0
    centre = hot.mean(axis=0)
    assert abs(centre[0] - row) <= 1.0 and abs(centre[1] - col) <= 1.0  # within a cell


def test_warp_alpha_handling_for_two_and_four_band_scans():
    pix, utm = make_gcps(12)
    poly = fit_polynomial(pix, utm, 1)
    four = np.full((4, H_PX, W_PX), 200, dtype="uint8")
    out = warp(four, poly, GRID)
    assert out.shape[0] == 4  # already RGBA: no extra band
    assert set(np.unique(out[3])) <= {0, 200}
    two = np.full((H_PX, W_PX), 7.0, dtype="float32")
    assert warp(two, poly, GRID).shape[0] == 2
    with pytest.raises(ValueError):
        warp(np.zeros((5, 4, 4), dtype="uint8"), poly, GRID)


def test_write_geotiff_georeferencing_matches_the_grid(tmp_path):
    arr = np.zeros((4, GRID.height, GRID.width), dtype="uint8")
    arr[3] = 255
    write_geotiff(tmp_path / "o.tif", arr, GRID)
    with rasterio.open(tmp_path / "o.tif") as src:
        assert src.crs.to_string() == UTM_CRS
        assert src.transform == GRID.transform()
        assert (src.height, src.width, src.count) == (GRID.height, GRID.width, 4)
        assert src.colorinterp[3].name == "alpha"
    with pytest.raises(ValueError):
        write_geotiff(tmp_path / "bad.tif", arr[:, :-1], GRID)


# ------------------------------------------------------------------------ CSV


def _write_csv(path, pix, utm, header="col,row,lon,lat,name"):
    lon, lat = TO_LONLAT.transform(utm[:, 0], utm[:, 1])
    lines = [header] + [f"{p[0]:.3f},{p[1]:.3f},{lo:.8f},{la:.8f},gcp{i}"
                        for i, (p, lo, la) in enumerate(zip(pix, lon, lat))]
    path.write_text("\n".join(lines) + "\n")


def test_read_gcps(tmp_path):
    pix, utm = make_gcps(6)
    _write_csv(tmp_path / "g.csv", pix, utm)
    gcps = read_gcps(tmp_path / "g.csv")
    assert len(gcps) == 6 and isinstance(gcps[0], GCP) and gcps[2].name == "gcp2"
    assert gcps[0].col == pytest.approx(pix[0, 0], abs=1e-3)
    (tmp_path / "n.csv").write_text("col,row,lon,lat\n1,2,-122.4,37.7\n")  # name optional
    assert read_gcps(tmp_path / "n.csv")[0].name == ""


@pytest.mark.parametrize("text,needle", [
    ("", "empty"),
    ("col,row,lon\n1,2,3\n", "lat"),
    ("col,row,lon,lat\n1,2,x,4\n", "data row 1"),
    ("col,row,lon,lat\n1,2,37.7,-122.4\n", "swapped"),
])
def test_bad_csv_is_a_clear_error(tmp_path, text, needle):
    (tmp_path / "g.csv").write_text(text)
    with pytest.raises(ValueError, match="g.csv") as exc:
        read_gcps(tmp_path / "g.csv")
    assert needle in str(exc.value)


# ------------------------------------------------------------------ CLI end to end


def _write_scan(path, array):
    with warnings.catch_warnings():  # a plain scan has no georeferencing, by design
        warnings.simplefilter("ignore", rasterio.errors.NotGeoreferencedWarning)
        _write_scan_unchecked(path, array)


def _write_scan_unchecked(path, array):
    with rasterio.open(path, "w", driver="GTiff", height=array.shape[1], width=array.shape[2],
                       count=array.shape[0], dtype=array.dtype) as dst:
        dst.write(array)


def _cli(tmp_path, *extra, gcps=None, scan=None):
    pix, utm = gcps if gcps is not None else make_gcps(14)
    _write_csv(tmp_path / "g.csv", pix, utm)
    if scan is None:
        scan = np.zeros((3, H_PX, W_PX), dtype="uint8")
    _write_scan(tmp_path / "scan.tif", scan)
    return main([str(tmp_path / "scan.tif"), str(tmp_path / "g.csv"), "--bbox", *map(str, BBOX),
                 "--cell", "5", *extra])


def test_cli_writes_a_geotiff_with_the_feature_in_the_right_cell(tmp_path, capsys):
    scan = np.zeros((3, H_PX, W_PX), dtype="uint8")
    fx, fy = X0 + 1200.0, Y0 + 900.0
    c, r = truth(fx, fy)
    scan[0, int(r) - 3:int(r) + 4, int(c) - 3:int(c) + 4] = 255
    out, report = tmp_path / "out.tif", tmp_path / "rep.txt"
    code = _cli(tmp_path, "--order", "2", "--out", str(out), "--report", str(report), scan=scan)
    assert code == 0
    printed = capsys.readouterr().out
    assert "RMS" in printed and "gcp0" in printed and "Wrote" in printed
    assert "RMS" in report.read_text()
    with rasterio.open(out) as src:
        assert src.crs.to_string() == UTM_CRS and src.transform == GRID.transform()
        data = src.read()
    assert data.shape == (4, GRID.height, GRID.width)
    hot = np.argwhere(data[0] == 255)
    row, col = GRID.pixel_of(fx, fy)
    assert len(hot) and abs(hot.mean(axis=0)[0] - row) <= 1 and abs(hot.mean(axis=0)[1] - col) <= 1
    assert data[3].max() == 255 and data[3].min() == 0  # partly outside the scan


def test_cli_refuses_when_one_gcp_is_wildly_wrong_and_writes_nothing(tmp_path, capsys):
    pix, utm = make_gcps(14)
    pix[5] += [180, -150]
    out = tmp_path / "out.tif"
    code = _cli(tmp_path, "--out", str(out), "--max-rms-m", "25", gcps=(pix, utm))
    captured = capsys.readouterr()
    assert code == 2 and not out.exists()
    assert "REFUSED" in captured.err and "RMS" in captured.out
    # The same data passes with a lax limit, proving the limit is what refused it.
    assert _cli(tmp_path, "--out", str(out), "--max-rms-m", "1e6", gcps=(pix, utm)) == 0
    assert out.exists()


def test_cli_refuses_too_few_points(tmp_path, capsys):
    pix, utm = make_gcps(7)
    out = tmp_path / "out.tif"
    code = _cli(tmp_path, "--order", "2", "--out", str(out), gcps=(pix, utm))
    assert code == 2 and not out.exists()
    assert "add more control points" in capsys.readouterr().err


def test_cli_without_out_only_reports(tmp_path, capsys):
    assert _cli(tmp_path) == 0
    assert "RMS" in capsys.readouterr().out


def test_cli_input_errors_exit_1(tmp_path, capsys):
    (tmp_path / "g.csv").write_text("a,b\n1,2\n")
    code = main([str(tmp_path / "scan.tif"), str(tmp_path / "g.csv"), "--bbox", *map(str, BBOX)])
    assert code == 1 and "header" in capsys.readouterr().err
