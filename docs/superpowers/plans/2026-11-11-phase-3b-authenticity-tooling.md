# Yelamu Phase 3b-1 (Authenticity Tooling) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the map the means to replace modern ground and guesses with sourced reconstruction, and say where each piece came from: georeference a scanned 1850s sheet, compare it with the reconstruction, trace water into files that must carry a source and a confidence, add ridge landforms, and draw freshwater ponds (the 17 that SFEI already maps, plus any you trace) as flat water at their own level.

**Architecture:** Pipeline side: `georef.py` fits a polynomial from control points and warps a scan onto the grid (refusing loose fits); `compare.py` and `handcheck.py` render and check; `provenance.py` makes `source` and `confidence` mandatory on hand polygons and landforms; `landforms.py` adds ridges; `ponds.py` finds ponds, carves beds, blends banks and exports `ponds.json`; `cli.py` wires it together. Viewer side: a strict `ponds.json` parser, flat pond surfaces sharing the sea's animated water material, and a "Hand-drawn and sculpted" section in the Sources panel. Nothing here traces anything: the tracing is yours, guided by `docs/research/tracing-guide.md` (Task D1).

**Tech Stack:** Same as Phase 3. **No new Python or npm dependencies.** `render_compare.py` draws with Pillow, which is *not* a project dependency: run it with `uv run --with pillow`.

**Spec:** [`docs/superpowers/specs/2026-11-11-phase-3b-authenticity-design.md`](../specs/2026-11-11-phase-3b-authenticity-design.md)

**Base commit:** `1510a3e` (pipeline 310 tests, viewer 505 tests; the viewer count assumes `npm run make:city-synth` and `npm run make:overlay-synth` have been run). **Modified files are carried as unified diffs against that commit** (apply with `git apply`, from the repository root); new files are given whole. If any listed file changed since, `git apply` will say so: merge by hand.

**Skipped tests are expected:** pipeline shows `1 skipped` from Task P4 on (the Pillow smoke test, which needs `uv run --with pillow`); the viewer shows `1 skipped` in Tasks V1 to V3 (the test that parses the generated synthetic `ponds.json`) and none after Task V4 generates it.

**Out of scope (separate plans):** **3b-2**, the importer for NOAA's vector shorelines (coverage of the south-east and Treasure Island was not found, and the files have not been inspected; see the spec), the cultural layer, hosting and launch, SFEI's licence reply. This plan builds the tools; it does not add any new historical data.

> **Licensing gate (unchanged).** Everything derived from SFEI's habitat layer stays gitignored (`viewer/public/assets/real*/`, `docs/research/local/`, `pipeline/data/raw/`). The pond polygons that SFEI contributes are SFEI-derived: they end up in the gitignored `ponds.json` only. What this plan commits is code, tests and **empty** hand-drawn files; your own traced polygons and landform entries are yours and may be committed.

> **No downloads in this plan.** Georeferencing a real sheet needs a download (a NOAA scan). That is a separate step with its own approval: say which file, from where, and how big, before fetching it.

---

## Design decisions (veto points)

| # | Decision | Why |
|---|---|---|
| 1 | **Required `source` and `confidence` on every hand polygon and landform**; the build refuses without them and names the file and feature. | Honesty rule for the whole project: a reader of the Sources panel can see which parts were drawn by hand and how sure we are. |
| 2 | **Georeferencing is a polynomial fit (order 1 to 3) in UTM that reports the error in metres at every control point and refuses a fit** with RMS above 25 m (adjustable) or fewer than terms + 2 points. | A bad fit baked into a trace is invisible later. Refusing is cheaper than discovering it. |
| 3 | **Pond level comes from the feature, else the median modern ground inside the polygon.** | A flat water surface needs one number. Modern lakes and ponds are flat in the DEM, and the median ignores the odd shore cell. |
| 4 | **Pond banks are blended**: land within 200 m of a pond is clipped to `level ± 0.35 × distance`. Bay, marsh and gap-filled water are never touched. | Found in the browser on Mountain Lake: carving only inside the polygon left a 14 m wall on the uphill shore. After the blend the largest step near ponds is 3.5 m, equal to the natural maximum there. |
| 5 | **SFEI's pond classes are `documented`; hand ponds carry their own provenance.** The `Tidal coastal lagoon` class (2 polygons) is **not** in the default list. | You decide those two with the comparison tool; recorded in the tracing guide. |
| 6 | **Hand ponds get their own habitat id (4)**, so SFEI class ids shift up by one. | Hand-drawn water that is not in SFEI needs a class to draw with and to say "this is a pond". On the real city every cell keeps the same class *name*; only the integer ids moved, and the tests that pinned ids changed. |
| 7 | **Ponds are not an optional layer** and share the sea's water material. | They are part of the ground truth, not an overlay; sharing the material gives them the animation and the Water motion toggle for free. |
| 8 | **The comparison tool is a script, not part of the viewer**, and uses Pillow via `uv run --with pillow`. | A drawing aid for the tracing loop only; no new dependency for the project. |
| 9 | **Landform heights add to the modern ground** (`delta_m`), and each entry needs a cited height or stays `illustrative`. | The heights of lost landforms are the weakest source in the project; the label says so. |

## What the prototypes measured

Built and run first in a scratch copy of the repository, then replayed task by task on a fresh checkout.

| Measurement | Result |
|---|---|
| Tests | pipeline 310 to 504 (+1 skipped Pillow smoke test, run with `uv run --with pillow`: 505); viewer 505 to 572 |
| Real city build (full-city region) | 4.4 s; SFEI has 18 polygons in the four default pond classes (14 dune-dammed pond or lake, 1 headwater lake, 2 barrier-beach lagoon, 1 other); one covers a single cell and is dropped; **17 ponds, 1,755 cells**, 0.1 to 5 ha each, levels 3.45 to 94.1 m; `ponds.json` 29.8 KB |
| Heights outside ponds | **identical** to the Phase 3 build except 1,755 pond cells and 568 bank cells (550 lowered, 18 raised, largest change 13.4 m, farthest changed cell 78 m from a pond) |
| Largest height step within 100 m of a pond | 15.5 m without the bank blend, **3.5 m** with it (the unmodified ground has the same 3.5 m) |
| Browser (scratch viewer, real city) | Mountain Lake: flat surface at its level, wall gone after the blend; synthetic city: ponds, island, Sources section and Legend line as designed; no console warnings |
| Lake Merced | **not in SFEI** (its layer ends at latitude 37.7328); it needs a hand pond |
| Not exercised | georeferencing on a real 1850s sheet (no sheet downloaded); water motion off and reduced-motion on ponds; frame time with ponds on the real city on a phone |

---

## File Structure

```
pipeline/
  yelamu/georef.py                  Task P1: polynomial fit, residuals, warp, GeoTIFF
  scripts/georeference.py           Task P1: CLI (exit 2 on refusal)
  yelamu/provenance.py              Task P2: source/confidence checks and summaries
  yelamu/sources.py (modified)      Task P2: load_features with provenance
  yelamu/landforms.py               Task P3: validation, bump and ridge application
  yelamu/terrain.py (modified)      Task P3: stamp_ridge
  yelamu/compare.py, handcheck.py   Task P4: comparison panels, polygon checks
  scripts/render_compare.py, check_polygons.py   Task P4
  data/full-city/hand/hand_ponds.geojson         Task P4: empty FeatureCollection
  yelamu/ponds.py                   Task P5: ponds, carving, bank blending, ponds.json
  yelamu/habitat.py, export.py (modified)        Task P5: hand-pond class id, meta keys
  yelamu/checks.py (modified)       Task P6: expect_water, expect_pond
  yelamu/region.py, cli.py (modified), regions/full-city.json   Task P7: keys, flags, wiring
viewer/src/
  ponds/{types,parse,geometry,layer}.ts   Tasks V1, V2
  pondsModule.ts, modules.ts (modified)   Task V4
  provenanceData.ts, legendEntries.ts, ui/legend.ts, ui/provenance.ts (modified)   Task V3
  heightmap.ts (modified)                 Task V1: meta keys
viewer/scripts/make_ponds_synth.mjs       Task V4
docs/research/tracing-guide.md            Task D1
pipeline/data/full-city/hand/README.md (modified)   Task D1
docs/research/phase-3b-results.md         Task R1 (written after the real run)
```

Task order matters: P2 before P3 and P4 (they use `provenance` and `load_features`), P5 before P6 and P7, V1 before V3 (the meta types). Tests are green after every task; the `hand_ponds.geojson` file comes in P4 because a test there checks all three hand files.

## One thing that surprised the prototype

Replacing `heightmap.u16` and `habitat.u8` rewrites `meta.json` without `overlay_file`; **re-run `scripts/build_overlay.py` after every terrain build**, as before.

---

## Tasks

### Task P1: Georeferencing tool

**Files:**
- Create: `pipeline/tests/test_georef.py`
- Create: `pipeline/yelamu/georef.py`
- Create: `pipeline/scripts/georeference.py`

A scanned 1850s sheet is only useful once it lines up with the grid. `georef.py` fits a polynomial that maps ground position (UTM easting and northing) to scan pixels, reports the ground error at every control point in metres, and **refuses** a fit that is too loose or under-determined (fewer than terms + 2 points). The warp samples the scan once per output cell and writes a GeoTIFF in EPSG:32610. Everything is exercised on synthetic sheets with a known distortion, so the tests can say how close the recovered mapping is to the truth. It has **not** been run on a real sheet.

- [ ] **Step 1: Add the tests**

`pipeline/tests/test_georef.py`

```python
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
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd pipeline && uv run pytest tests/test_georef.py -q`

Expected: **FAIL** (the code under test does not exist yet, or the new assertions do not hold yet).

- [ ] **Step 3: Write the implementation**

`pipeline/yelamu/georef.py`

```python
"""Georeference a scanned map sheet from ground control points (GCPs).

    uv run python scripts/georeference.py SCAN.tif GCPS.csv --bbox W S E N --cell 5 \\
        --order 2 --max-rms-m 25 --out OUT.tif [--report report.txt]

Pixel coordinates (`col`, `row`) are continuous with the origin at the TOP-LEFT CORNER of
the top-left pixel (the first pixel's centre is (0.5, 0.5)), `row` growing downwards,
as in QGIS's georeferencer and most image viewers' sub-pixel readouts.

Method. A polynomial of order 1 (affine), 2 or 3 is fitted by least squares to the
INVERSE mapping (easting, northing) -> (col, row), because that is what resampling needs:
for every output cell we look up where to read the scan. Terms use coordinates normalised
about the GCP centroid and scaled to about +-1, which keeps order-3 fits well conditioned
at UTM magnitudes (about 5e5 and 4e6 m).

Residuals. For each GCP the fitted inverse map is inverted numerically (Newton's method,
starting at the GCP's true position) to find where the fit puts that pixel on the ground;
the residual is the distance in metres between that point and the surveyed position.
This measures the ground error of the warp actually produced, and a GCP lying far off
the others stands out in metres whatever the scan's resolution.
"""

from __future__ import annotations

import argparse
import csv
import sys
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np
import rasterio
from rasterio.enums import ColorInterp
from scipy import ndimage

from yelamu.geo import UTM_CRS, Grid, lonlat_to_utm

N_TERMS = {1: 3, 2: 6, 3: 10}
EXTRA_POINTS = 2  # at least this many GCPs beyond the number of terms


@dataclass(frozen=True)
class GCP:
    col: float
    row: float
    lon: float
    lat: float
    name: str = ""


def _terms(a: np.ndarray, b: np.ndarray, order: int) -> np.ndarray:
    cols = [np.ones_like(a), a, b]
    if order >= 2:
        cols += [a * a, a * b, b * b]
    if order >= 3:
        cols += [a ** 3, a * a * b, a * b * b, b ** 3]
    return np.stack(cols, axis=-1)


@dataclass(frozen=True, eq=False)
class PolyMap:
    """A fitted polynomial (easting, northing) -> (col, row)."""

    order: int
    coeffs: np.ndarray  # (n_terms, 2): columns give col and row
    centre: tuple[float, float]
    scale: float

    def __call__(self, x, y):
        x = np.asarray(x, dtype="float64")
        y = np.asarray(y, dtype="float64")
        a = (x - self.centre[0]) / self.scale
        b = (y - self.centre[1]) / self.scale
        out = _terms(a, b, self.order) @ self.coeffs
        return out[..., 0], out[..., 1]


def fit_polynomial(gcps_pixel, gcps_utm, order: int) -> PolyMap:
    """Least-squares fit of the inverse mapping (easting, northing) -> (col, row).

    `gcps_pixel` is (n, 2) of (col, row); `gcps_utm` is (n, 2) of (easting, northing).
    Needs at least (terms + 2) points, terms being 3, 6 or 10 for order 1, 2 or 3.
    """
    if order not in N_TERMS:
        raise ValueError(f"order must be 1, 2 or 3, got {order!r}")
    pix = np.asarray(gcps_pixel, dtype="float64")
    utm = np.asarray(gcps_utm, dtype="float64")
    if pix.ndim != 2 or pix.shape[1] != 2 or pix.shape != utm.shape:
        raise ValueError("gcps_pixel and gcps_utm must both be (n, 2) arrays of equal length")
    n, terms = len(pix), N_TERMS[order]
    if n < terms + EXTRA_POINTS:
        raise ValueError(
            f"an order-{order} fit has {terms} terms and needs at least "
            f"{terms + EXTRA_POINTS} control points (you gave {n}): add more control points "
            "or use a lower --order"
        )
    centre = utm.mean(axis=0)
    scale = float(np.abs(utm - centre).max())
    if not scale > 1e-3:  # millimetres
        raise ValueError("all control points are at the same ground position")
    design = _terms((utm[:, 0] - centre[0]) / scale, (utm[:, 1] - centre[1]) / scale, order)
    coeffs, _, rank, _ = np.linalg.lstsq(design, pix, rcond=None)
    if rank < terms:
        raise ValueError(
            f"the control points are degenerate for an order-{order} fit (rank {rank} of "
            f"{terms}; are they in a line or clustered?): spread them over the sheet or "
            "use a lower --order"
        )
    return PolyMap(order, coeffs, (float(centre[0]), float(centre[1])), scale)


def residuals_m(poly: PolyMap, gcps_pixel, gcps_utm, iterations: int = 50) -> np.ndarray:
    """Ground error in metres of each GCP under the fitted map (see the module docs).

    Non-finite (inversion failed) results come back as inf.
    """
    pix = np.asarray(gcps_pixel, dtype="float64")
    utm = np.asarray(gcps_utm, dtype="float64")
    pos = utm.copy()
    h = 1.0  # metres, for the central-difference Jacobian

    def f(p):
        c, r = poly(p[:, 0], p[:, 1])
        return np.stack([c, r], axis=-1)

    for _ in range(iterations):
        err = pix - f(pos)
        jx = (f(pos + [h, 0]) - f(pos - [h, 0])) / (2 * h)
        jy = (f(pos + [0, h]) - f(pos - [0, h])) / (2 * h)
        jac = np.stack([jx, jy], axis=-1)  # d(col,row)/d(x,y): columns are x then y
        det = jac[:, 0, 0] * jac[:, 1, 1] - jac[:, 0, 1] * jac[:, 1, 0]
        with np.errstate(divide="ignore", invalid="ignore"):
            step = np.stack([
                (jac[:, 1, 1] * err[:, 0] - jac[:, 0, 1] * err[:, 1]) / det,
                (-jac[:, 1, 0] * err[:, 0] + jac[:, 0, 0] * err[:, 1]) / det,
            ], axis=-1)
        pos = pos + step
        if np.all(np.abs(step) < 1e-9):
            break
    dist = np.hypot(pos[:, 0] - utm[:, 0], pos[:, 1] - utm[:, 1])
    dist[~np.isfinite(dist)] = np.inf
    return dist


def rms_m(residuals) -> float:
    r = np.asarray(residuals, dtype="float64")
    return float(np.sqrt(np.mean(r * r)))


# ------------------------------------------------------------------ resampling


def warp(scan: np.ndarray, poly: PolyMap, grid: Grid) -> np.ndarray:
    """Resample a scan onto the grid.

    `scan` is (bands, rows, cols) or (rows, cols), 1-4 bands. Each output cell centre is
    mapped through the fitted inverse polynomial to a scan position and read with
    bilinear interpolation (order 1; positions are clamped to the edge). Returns
    (bands', grid.height, grid.width) in the scan's dtype. Cells whose scan position lies
    outside the scan are transparent: 1 or 3 band scans gain a last alpha band (dtype max
    where covered, 0 elsewhere); 2 or 4 band scans are taken to already end in alpha,
    which is zeroed outside the scan.
    """
    arr = np.asarray(scan)
    if arr.ndim == 2:
        arr = arr[None]
    if arr.ndim != 3 or not 1 <= arr.shape[0] <= 4:
        raise ValueError(f"scan must have 1 to 4 bands, got shape {arr.shape}")
    bands, rows, cols = arr.shape
    xs = grid.west + (np.arange(grid.width) + 0.5) * grid.cell
    ys = grid.north - (np.arange(grid.height) + 0.5) * grid.cell
    xx, yy = np.meshgrid(xs, ys)
    col, row = poly(xx, yy)
    inside = (col >= 0) & (col <= cols) & (row >= 0) & (row <= rows)
    coords = np.stack([row - 0.5, col - 0.5])  # pixel centres sit at integer indices
    sampled = np.stack([
        ndimage.map_coordinates(arr[b].astype("float64"), coords, order=1, mode="nearest")
        for b in range(bands)
    ])
    if np.issubdtype(arr.dtype, np.integer):
        info = np.iinfo(arr.dtype)
        opaque = info.max
        sampled = np.clip(np.rint(sampled), info.min, info.max)
    else:
        opaque = 1.0
    sampled = sampled.astype(arr.dtype)
    if bands in (2, 4):
        sampled[-1] = np.where(inside, sampled[-1], 0)
        return sampled
    alpha = np.where(inside, opaque, 0).astype(arr.dtype)
    return np.concatenate([sampled, alpha[None]], axis=0)


def write_geotiff(path: Path, array: np.ndarray, grid: Grid) -> None:
    """Write (bands, height, width) as a GeoTIFF in EPSG:32610 on the grid.

    2 bands are written as gray + alpha, 4 as RGB + alpha (the last band is alpha).
    """
    if array.ndim != 3 or array.shape[1:] != (grid.height, grid.width):
        raise ValueError(f"array shape {array.shape} does not match the grid "
                         f"({grid.height} rows, {grid.width} cols)")
    count = array.shape[0]
    with rasterio.open(
        path, "w", driver="GTiff", height=grid.height, width=grid.width, count=count,
        dtype=array.dtype, crs=UTM_CRS, transform=grid.transform(), compress="deflate",
    ) as dst:
        dst.write(array)
        if count == 2:
            dst.colorinterp = [ColorInterp.gray, ColorInterp.alpha]
        elif count == 4:
            dst.colorinterp = [ColorInterp.red, ColorInterp.green, ColorInterp.blue,
                               ColorInterp.alpha]


def read_scan(path: Path) -> np.ndarray:
    """Read a scan (TIFF/JPEG/PNG...) as (bands, rows, cols); 1-4 bands only."""
    with warnings.catch_warnings():
        # Scans are, by definition, not georeferenced yet.
        warnings.simplefilter("ignore", rasterio.errors.NotGeoreferencedWarning)
        src = rasterio.open(path)
    with src:
        if not 1 <= src.count <= 4:
            raise ValueError(f"{path}: {src.count} bands; expected 1 to 4")
        return src.read()


# ------------------------------------------------------------------------ GCPs


def read_gcps(path: Path) -> list[GCP]:
    """Read a CSV with header `col,row,lon,lat[,name]` (extra columns ignored)."""
    path = Path(path)
    with path.open(newline="") as handle:
        lines = [ln for ln in handle if ln.strip() and not ln.lstrip().startswith("#")]
    if not lines:
        raise ValueError(f"{path}: empty file (expected a header col,row,lon,lat[,name])")
    reader = csv.DictReader(lines)
    fields = [(f or "").strip().lower() for f in (reader.fieldnames or [])]
    missing = [k for k in ("col", "row", "lon", "lat") if k not in fields]
    if missing:
        raise ValueError(f"{path}: header must contain col,row,lon,lat[,name]; "
                         f"missing {', '.join(missing)}")
    gcps: list[GCP] = []
    for n, raw in enumerate(reader, start=2):
        rec = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
        try:
            vals = [float(rec[k]) for k in ("col", "row", "lon", "lat")]
        except (ValueError, KeyError) as exc:
            raise ValueError(f"{path}: data row {n - 1}: col, row, lon and lat must be "
                             f"numbers ({exc})") from exc
        if not all(np.isfinite(vals)):
            raise ValueError(f"{path}: data row {n - 1}: values must be finite")
        if not (-180 <= vals[2] <= 180 and -90 <= vals[3] <= 90):
            raise ValueError(f"{path}: data row {n - 1}: lon/lat out of range "
                             f"({vals[2]}, {vals[3]}); are they swapped?")
        gcps.append(GCP(vals[0], vals[1], vals[2], vals[3], rec.get("name", "")))
    return gcps


def gcp_arrays(gcps: Sequence[GCP]) -> tuple[np.ndarray, np.ndarray]:
    """(pixel (n,2) of col,row; utm (n,2) of easting,northing)."""
    pix = np.array([[g.col, g.row] for g in gcps], dtype="float64").reshape(-1, 2)
    utm = np.array([lonlat_to_utm(g.lon, g.lat) for g in gcps], dtype="float64").reshape(-1, 2)
    return pix, utm


# ------------------------------------------------------------------------- CLI


def format_report(gcps: Sequence[GCP], res: np.ndarray, order: int) -> str:
    lines = [f"{'#':>3} {'name':<16} {'col':>9} {'row':>9} {'lon':>12} {'lat':>11} {'resid_m':>9}"]
    for i, (g, r) in enumerate(zip(gcps, res), start=1):
        lines.append(f"{i:>3} {g.name[:16]:<16} {g.col:>9.1f} {g.row:>9.1f} "
                     f"{g.lon:>12.6f} {g.lat:>11.6f} {r:>9.1f}")
    lines.append(f"RMS {rms_m(res):.1f} m, max {float(np.max(res)):.1f} m "
                 f"({len(gcps)} points, order {order}, {N_TERMS[order]} terms)")
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="georeference",
        description="Georeference a scanned map from ground control points; refuses a "
                    "poor fit (exit 2, no output file).")
    p.add_argument("scan", type=Path, help="scan image (GeoTIFF/TIFF/JPEG/PNG, 1-4 bands)")
    p.add_argument("gcps", type=Path, help="CSV: col,row,lon,lat[,name]; pixel origin is the "
                                           "top-left corner of the top-left pixel")
    p.add_argument("--bbox", type=float, nargs=4, required=True,
                   metavar=("WEST", "SOUTH", "EAST", "NORTH"), help="output extent, lon/lat")
    p.add_argument("--cell", type=float, default=5.0, help="output metres per pixel (default 5)")
    p.add_argument("--order", type=int, choices=(1, 2, 3), default=2,
                   help="polynomial order (default 2; needs 3 / 6 / 10 terms + 2 points)")
    p.add_argument("--max-rms-m", type=float, default=25.0,
                   help="refuse when the RMS ground residual exceeds this (default 25)")
    p.add_argument("--out", type=Path, help="output GeoTIFF (EPSG:32610); omit to only check the fit")
    p.add_argument("--report", type=Path, help="also write the control-point table here")
    args = p.parse_args(argv)
    if not args.cell > 0:
        p.error("--cell must be greater than 0")

    try:
        gcps = read_gcps(args.gcps)
        pix, utm = gcp_arrays(gcps)
        scan = read_scan(args.scan) if args.out else None
        grid = Grid.from_lonlat_bbox(*args.bbox, cell=args.cell)
    except (OSError, ValueError, rasterio.errors.RasterioError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    try:
        poly = fit_polynomial(pix, utm, args.order)
    except ValueError as exc:
        print(f"REFUSED: {exc}", file=sys.stderr)
        return 2

    res = residuals_m(poly, pix, utm)
    report = format_report(gcps, res, args.order)
    rms = rms_m(res)
    print(report)
    if args.report:
        args.report.write_text(report + "\n")
    if not rms <= args.max_rms_m:
        print(f"REFUSED: RMS {rms:.1f} m is above --max-rms-m {args.max_rms_m:g}: fix or drop "
              "the control point with the largest residual, or add more", file=sys.stderr)
        return 2
    if args.out:
        write_geotiff(args.out, warp(scan, poly, grid), grid)
        print(f"Wrote {args.out} ({grid.width} x {grid.height} cells of {grid.cell:g} m, "
              f"{UTM_CRS})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

`pipeline/scripts/georeference.py`

```python
"""Georeference a scanned map sheet from ground control points.

    uv run python scripts/georeference.py SCAN.tif GCPS.csv --bbox W S E N --cell 5 \
        --order 2 --max-rms-m 25 --out OUT.tif [--report report.txt]

A thin wrapper: the logic lives in yelamu.georef (`python -m yelamu.georef` works too).
"""

from yelamu.georef import main

if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run the whole suite**

Run: `cd pipeline && uv run pytest -q -W error`

Expected: **333 passed**, no warnings.

- [ ] **Step 5: Commit**

```bash
git add pipeline/tests/test_georef.py pipeline/yelamu/georef.py pipeline/scripts/georeference.py
git commit -m "feat(pipeline): georeference scanned sheets from control points, refusing loose fits"
```

---

### Task P2: Provenance for hand-drawn features

**Files:**
- Create: `pipeline/tests/test_provenance.py`
- Create: `pipeline/yelamu/provenance.py`
- Modify: `pipeline/yelamu/sources.py`

Honesty rule for 3b: every hand-drawn polygon says where it came from. `provenance.py` holds the checks and the summaries (source text, confidence, the lowest confidence of a group, rows for `meta.json`), and `sources.load_features` returns polygons together with their provenance, raising a `ValueError` that names the file and the feature when it is missing. `load_polygons` keeps its old behaviour. Nothing calls the new loader yet; Task P7 wires it into the build.

- [ ] **Step 1: Add the tests**

`pipeline/tests/test_provenance.py`

```python
"""Provenance enforcement: hand-drawn inputs must say where they came from."""

import json

import pytest
from shapely.geometry import Point

from yelamu.export import CONFIDENCE_LEVELS
from yelamu.geo import lonlat_to_utm
from yelamu.provenance import (
    hand_source_rows,
    layer_source_summary,
    lowest_confidence,
)
from yelamu.sources import Feature, load_features, load_polygons

SQUARE = [[[-122.40, 37.77], [-122.39, 37.77], [-122.39, 37.78], [-122.40, 37.78],
           [-122.40, 37.77]]]
OTHER = [[[-122.38, 37.77], [-122.37, 37.77], [-122.37, 37.78], [-122.38, 37.78],
          [-122.38, 37.77]]]


def _write(path, features):
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    return path


def _feat(props, ring=SQUARE):
    return {"type": "Feature", "properties": props,
            "geometry": {"type": "Polygon", "coordinates": ring}}


GOOD = {"source": "US Coast Survey T-sheet 1853", "confidence": "inferred"}


def test_load_features_returns_utm_geometry_and_provenance(tmp_path):
    path = _write(tmp_path / "h.geojson", [_feat({**GOOD, "name": "Mission Bay", "x": 1})])
    (f,) = load_features(path, require_provenance=True)
    assert isinstance(f, Feature)
    assert f.source == "US Coast Survey T-sheet 1853" and f.confidence == "inferred"
    assert f.properties["name"] == "Mission Bay" and f.properties["x"] == 1
    x, y = lonlat_to_utm(-122.395, 37.775)
    assert f.geometry.contains(Point(x, y))
    assert [p.geom_type for p in f.polygons] == ["Polygon"]


def test_load_features_without_provenance_flag_does_not_require_properties(tmp_path):
    path = _write(tmp_path / "h.geojson", [_feat({}), _feat({"source": "  s  "}, OTHER)])
    feats = load_features(path)
    assert len(feats) == 2
    assert feats[0].source is None and feats[0].confidence is None
    assert feats[1].source == "s"  # stripped


@pytest.mark.parametrize("props,needle", [
    ({}, "source"),
    ({"confidence": "inferred"}, "source"),
    ({"source": "", "confidence": "inferred"}, "source"),
    ({"source": "   ", "confidence": "inferred"}, "source"),
    ({"source": 5, "confidence": "inferred"}, "source"),
    ({"source": "x" * 201, "confidence": "inferred"}, "200"),
    ({"source": "ok"}, "confidence"),
    ({"source": "ok", "confidence": "high"}, "confidence"),
    ({"source": "ok", "confidence": None}, "confidence"),
])
def test_missing_or_bad_provenance_is_an_error_naming_file_and_feature(tmp_path, props, needle):
    path = _write(tmp_path / "hand.geojson", [_feat(GOOD), _feat({**props, "name": "Foo Cove"}, OTHER)])
    with pytest.raises(ValueError) as exc:
        load_features(path, require_provenance=True)
    msg = str(exc.value)
    assert "hand.geojson" in msg and "feature 1" in msg and "Foo Cove" in msg
    assert needle in msg


def test_source_of_exactly_200_chars_is_accepted(tmp_path):
    path = _write(tmp_path / "h.geojson", [_feat({"source": "x" * 200, "confidence": "documented"})])
    assert len(load_features(path, require_provenance=True)) == 1


@pytest.mark.parametrize("level", CONFIDENCE_LEVELS)
def test_all_confidence_levels_are_accepted(tmp_path, level):
    path = _write(tmp_path / "h.geojson", [_feat({"source": "s", "confidence": level})])
    assert load_features(path, require_provenance=True)[0].confidence == level


def test_empty_file_allowed_only_on_request(tmp_path):
    path = _write(tmp_path / "e.geojson", [])
    assert load_features(path, allow_empty=True, require_provenance=True) == []
    with pytest.raises(ValueError, match="e.geojson"):
        load_features(path)


def test_features_without_polygon_geometry_are_skipped_not_provenance_errors(tmp_path):
    line = {"type": "Feature", "properties": {},
            "geometry": {"type": "LineString", "coordinates": [[-122.4, 37.7], [-122.3, 37.8]]}}
    path = _write(tmp_path / "m.geojson", [line, {"type": "Feature", "properties": {}, "geometry": None},
                                          _feat(GOOD)])
    assert len(load_features(path, require_provenance=True)) == 1


def test_multipolygon_and_invalid_polygons_are_cleaned(tmp_path):
    bowtie = [[[-122.40, 37.77], [-122.39, 37.78], [-122.39, 37.77], [-122.40, 37.78],
               [-122.40, 37.77]]]
    multi = {"type": "Feature", "properties": GOOD, "geometry": {
        "type": "MultiPolygon", "coordinates": [SQUARE, OTHER]}}
    path = _write(tmp_path / "m.geojson", [multi, _feat(GOOD, bowtie)])
    a, b = load_features(path, require_provenance=True)
    assert len(a.polygons) == 2 and a.geometry.is_valid
    assert b.geometry.is_valid and len(b.polygons) == 2


def test_load_polygons_is_unchanged_and_ignores_properties(tmp_path):
    path = _write(tmp_path / "h.geojson", [_feat({})])
    assert len(load_polygons(path)) == 1


# ------------------------------------------------------------------ summaries


def test_lowest_confidence_orders_illustrative_inferred_documented():
    assert lowest_confidence(["documented", "inferred"]) == "inferred"
    assert lowest_confidence(["documented", "illustrative", "inferred"]) == "illustrative"
    assert lowest_confidence(["documented"]) == "documented"
    with pytest.raises(ValueError):
        lowest_confidence([])


def test_layer_source_summary_lists_distinct_sorted_sources_and_truncates():
    text = layer_source_summary("hand-drawn", ["B sheet", "A sheet", "A sheet"])
    assert text == "hand-drawn from 2 sources: A sheet; B sheet"
    assert layer_source_summary("hand-drawn", ["Only"]) == "hand-drawn from 1 source: Only"
    long = layer_source_summary("hand-drawn", ["s" * 200, "t" * 200])
    assert len(long) == 300 and long.endswith("...")


def test_hand_source_rows_group_count_and_sort():
    rows = hand_source_rows("hand_water", [("B", "inferred"), ("A", "documented"), ("B", "inferred")])
    assert rows == [
        {"layer": "hand_water", "source": "A", "confidence": "documented", "count": 1},
        {"layer": "hand_water", "source": "B", "confidence": "inferred", "count": 2},
    ]
    assert hand_source_rows("x", []) == []
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd pipeline && uv run pytest tests/test_provenance.py -q`

Expected: **FAIL** (the code under test does not exist yet, or the new assertions do not hold yet).

- [ ] **Step 3: Write the implementation**

`pipeline/yelamu/provenance.py`

```python
"""Provenance helpers: every hand-drawn input carries a source and a confidence.

The honesty rule of the project: hand-drawn polygons, landforms and ponds must say
where they came from (`source`, at most 200 characters) and how sure we are
(`confidence`, one of yelamu.export.CONFIDENCE_LEVELS). The build rejects inputs without
them, and records what was used in meta.json (`hand_sources`) and in the layers list.
"""

from __future__ import annotations

from typing import Any, Iterable

from yelamu.export import CONFIDENCE_LEVELS

MAX_SOURCE_CHARS = 200
MAX_LAYER_SOURCE_CHARS = 300
# Lowest first: the confidence of a group of things is that of its weakest member.
_RANK = {"illustrative": 0, "inferred": 1, "documented": 2}


def provenance_problem(properties: Any) -> str | None:
    """Why `properties` has no valid provenance, or None when it is fine."""
    props = properties if isinstance(properties, dict) else {}
    source = props.get("source")
    if not isinstance(source, str) or not source.strip():
        return "properties.source is missing or blank (say where this was traced from)"
    if len(source.strip()) > MAX_SOURCE_CHARS:
        return f"properties.source is longer than {MAX_SOURCE_CHARS} characters"
    confidence = props.get("confidence")
    if confidence not in CONFIDENCE_LEVELS:
        return (f"properties.confidence must be one of {', '.join(CONFIDENCE_LEVELS)}, "
                f"got {confidence!r}")
    return None


def lowest_confidence(levels: Iterable[str]) -> str:
    """The weakest of the given confidence levels (illustrative < inferred < documented)."""
    levels = list(levels)
    if not levels:
        raise ValueError("no confidence levels given")
    for level in levels:
        if level not in _RANK:
            raise ValueError(f"unknown confidence {level!r}")
    return min(levels, key=_RANK.__getitem__)


def layer_source_summary(prefix: str, sources: Iterable[str]) -> str:
    """'<prefix> from N sources: A; B' (distinct, sorted), cut to 300 characters."""
    distinct = sorted({s.strip() for s in sources})
    n = len(distinct)
    text = f"{prefix} from {n} source{'' if n == 1 else 's'}: " + "; ".join(distinct)
    if len(text) > MAX_LAYER_SOURCE_CHARS:
        text = text[: MAX_LAYER_SOURCE_CHARS - 3] + "..."
    return text


def hand_source_rows(layer: str, items: Iterable[tuple[str, str]]) -> list[dict]:
    """One {"layer","source","confidence","count"} row per distinct (source, confidence)."""
    counts: dict[tuple[str, str], int] = {}
    for source, confidence in items:
        key = (source.strip(), confidence)
        counts[key] = counts.get(key, 0) + 1
    return [
        {"layer": layer, "source": s, "confidence": c, "count": n}
        for (s, c), n in sorted(counts.items())
    ]
```

`pipeline/yelamu/sources.py` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/pipeline/yelamu/sources.py
+++ b/pipeline/yelamu/sources.py
@@ -3,7 +3,9 @@
 from __future__ import annotations
 
 import json
+from dataclasses import dataclass, field
 from pathlib import Path
+from typing import Any
 
 import numpy as np
 import rasterio
@@ -14,6 +16,7 @@
 from shapely.geometry.base import BaseGeometry
 
 from yelamu.geo import UTM_CRS, Grid
+from yelamu.provenance import provenance_problem
 
 _LONLAT_TO_UTM = Transformer.from_crs("EPSG:4326", UTM_CRS, always_xy=True)
 
@@ -87,3 +90,77 @@
     if not geoms and not allow_empty:
         raise ValueError(f"{path}: no usable polygon geometry was found")
     return geoms
+
+
+@dataclass(frozen=True)
+class Feature:
+    """One GeoJSON feature with polygonal geometry, in UTM metres, plus its provenance.
+
+    `geometry` is a valid Polygon or MultiPolygon (the union of the cleaned-up parts);
+    `polygons` lists its Polygons. `source` / `confidence` come from properties and are
+    None when the feature has none (only possible without require_provenance).
+    `properties` is the feature's full GeoJSON properties dict. `index` is the feature's
+    position (0-based) in the file.
+    """
+
+    geometry: BaseGeometry
+    source: str | None
+    confidence: str | None
+    properties: dict[str, Any] = field(default_factory=dict)
+    index: int = 0
+
+    @property
+    def polygons(self) -> list[BaseGeometry]:
+        return _polygonal_parts(self.geometry)
+
+    @property
+    def name(self) -> str | None:
+        value = self.properties.get("name")
+        return value.strip() if isinstance(value, str) and value.strip() else None
+
+
+def feature_label(path: Path | str, index: int, properties: Any) -> str:
+    """'<file>: feature <index> ('<name>')' for error messages."""
+    name = properties.get("name") if isinstance(properties, dict) else None
+    suffix = f" ({name!r})" if isinstance(name, str) and name.strip() else ""
+    return f"{path}: feature {index}{suffix}"
+
+
+def load_features(
+    path: Path, *, allow_empty: bool = False, require_provenance: bool = False
+) -> list[Feature]:
+    """Read GeoJSON in lon/lat (EPSG:4326) as UTM Features, one per usable feature.
+
+    Geometry is cleaned exactly as load_polygons does (only polygonal parts, repaired).
+    Features with no polygonal geometry are skipped. With `require_provenance` every
+    kept feature must have properties.source (a non-blank string of at most 200
+    characters) and properties.confidence (one of yelamu.export.CONFIDENCE_LEVELS); the
+    first violation raises ValueError naming the file and the feature index / name.
+    An empty result raises ValueError unless `allow_empty` is True.
+    """
+    data = json.loads(Path(path).read_text())
+    raw_features = data["features"] if data.get("type") == "FeatureCollection" else [data]
+    out: list[Feature] = []
+    for index, feature in enumerate(raw_features):
+        is_feature = feature.get("type") == "Feature"
+        raw = feature.get("geometry") if is_feature else feature
+        properties = (feature.get("properties") or {}) if is_feature else {}
+        parts = geometry_to_utm_polygons(raw)
+        if not parts:
+            continue
+        if require_provenance:
+            problem = provenance_problem(properties)
+            if problem is not None:
+                raise ValueError(f"{feature_label(path, index, properties)}: {problem}")
+        source = properties.get("source")
+        confidence = properties.get("confidence")
+        out.append(Feature(
+            geometry=shapely.unary_union(parts),
+            source=source.strip() if isinstance(source, str) and source.strip() else None,
+            confidence=confidence if isinstance(confidence, str) else None,
+            properties=dict(properties),
+            index=index,
+        ))
+    if not out and not allow_empty:
+        raise ValueError(f"{path}: no usable polygon geometry was found")
+    return out
PATCH
```

- [ ] **Step 4: Run the whole suite**

Run: `cd pipeline && uv run pytest -q -W error`

Expected: **355 passed**, no warnings.

- [ ] **Step 5: Commit**

```bash
git add pipeline/tests/test_provenance.py pipeline/yelamu/provenance.py pipeline/yelamu/sources.py
git commit -m "feat(pipeline): required source and confidence on hand-drawn features"
```

---

### Task P3: Ridge landforms with required provenance

**Files:**
- Create: `pipeline/tests/test_landforms.py`
- Create: `pipeline/yelamu/landforms.py`
- Modify: `pipeline/tests/test_terrain.py`
- Modify: `pipeline/yelamu/terrain.py`

Rincon Hill and the Market Street dune ridge are ridges, not round bumps. `stamp_ridge` raises a raised-cosine band along a polyline (full height on the line, zero at the half-width, round end caps; deltas add like `stamp_landform`). `landforms.py` validates every entry (`source` and `confidence` required, `kind` is `bump` or `ridge`, unknown keys refused, points inside the region) and applies them. Wired into the build in Task P7.

- [ ] **Step 1: Add the tests**

`pipeline/tests/test_landforms.py`

```python
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
```

`pipeline/tests/test_terrain.py` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/pipeline/tests/test_terrain.py
+++ b/pipeline/tests/test_terrain.py
@@ -305,3 +305,97 @@
     everything = np.ones((4, 4), dtype=bool)
     out = apply_land_ramp(dem, everything, 10.0, 0.15)
     assert np.array_equal(out, dem) and out is not dem
+
+
+# ------------------------------------------------------------------ stamp_ridge
+
+from yelamu.terrain import stamp_ridge  # noqa: E402
+
+
+def _ridge_grid():
+    # 41 x 21 cells of 10 m; cell centres at x = 5, 15, ..., 405 and y = 205 .. 5 (row 0 north).
+    return Grid(west=0, south=0, east=410, north=210, cell=10)
+
+
+def _xy_to_rc(x, y):
+    return int((210 - y) // 10), int(x // 10)
+
+
+def test_ridge_peak_is_full_delta_on_the_line_and_zero_outside():
+    grid = _ridge_grid()
+    dem = np.zeros((grid.height, grid.width), dtype="float32")
+    # West-east line along y = 105 (the boundary between rows 9 and 10), x 100..300.
+    out = stamp_ridge(dem, grid, [(105, 105), (305, 105)], half_width_m=40, delta_m=12)
+    assert out.dtype == np.float32
+    # Cell centres on the line (y = 105 is a centre of rows 10: y=105 -> row (210-105)//10 = 10).
+    r, c = _xy_to_rc(205, 105)
+    assert out[r, c] == pytest.approx(12.0, abs=1e-4)
+    # 20 m off the line (half of half_width): raised cosine gives 0.5.
+    assert out[r - 2, c] == pytest.approx(6.0, abs=1e-4)
+    assert out[r + 2, c] == pytest.approx(6.0, abs=1e-4)  # symmetric
+    # At and beyond half_width: exactly zero.
+    assert out[r - 4, c] == 0.0 and out[r + 4, c] == 0.0
+    assert out[r - 6, c] == 0.0
+    # Far along the line, outside the ridge's ends.
+    assert out[r, _xy_to_rc(405, 105)[1]] == 0.0
+
+
+def test_ridge_falloff_matches_raised_cosine():
+    grid = _ridge_grid()
+    dem = np.zeros((grid.height, grid.width), dtype="float32")
+    out = stamp_ridge(dem, grid, [(5, 105), (405, 105)], half_width_m=50, delta_m=10)
+    r, c = _xy_to_rc(205, 105)
+    for k in range(0, 5):
+        d = 10.0 * k
+        assert out[r + k, c] == pytest.approx(10 * 0.5 * (1 + np.cos(np.pi * d / 50)), abs=1e-4)
+
+
+def test_ridge_negative_delta_lowers_and_deltas_add_to_existing_ground():
+    grid = _ridge_grid()
+    dem = np.full((grid.height, grid.width), 20.0, dtype="float32")
+    r, c = _xy_to_rc(205, 105)
+    lowered = stamp_ridge(dem, grid, [(105, 105), (305, 105)], 40, -8)
+    assert lowered[r, c] == pytest.approx(12.0, abs=1e-4)
+    assert lowered[0, 0] == 20.0
+    # Two overlapping ridges ADD (like stamp_landform): never max'd or double-clamped.
+    twice = stamp_ridge(lowered, grid, [(105, 105), (305, 105)], 40, -8)
+    assert twice[r, c] == pytest.approx(4.0, abs=1e-4)
+    # The input is not modified.
+    assert dem[r, c] == 20.0
+
+
+def test_ridge_endpoints_have_round_caps_and_a_self_overlapping_line_is_applied_once():
+    grid = _ridge_grid()
+    dem = np.zeros((grid.height, grid.width), dtype="float32")
+    out = stamp_ridge(dem, grid, [(105, 105), (205, 105)], half_width_m=40, delta_m=10)
+    r, c_end = _xy_to_rc(205, 105)
+    assert out[r, c_end] == pytest.approx(10.0, abs=1e-4)  # on the end point
+    # 20 m beyond the end along the axis: distance 20 -> 0.5
+    assert out[r, c_end + 2] == pytest.approx(5.0, abs=1e-4)
+    assert out[r, c_end + 4] == 0.0
+    # A line that doubles back over itself must not stack: still the full delta at most.
+    back = stamp_ridge(dem, grid, [(105, 105), (205, 105), (105, 105)], 40, 10)
+    assert back.max() == pytest.approx(10.0, abs=1e-4)
+    assert np.allclose(back, out)
+
+
+def test_ridge_diagonal_is_symmetric_about_the_line():
+    grid = Grid(west=0, south=0, east=300, north=300, cell=10)
+    dem = np.zeros((30, 30), dtype="float32")
+    out = stamp_ridge(dem, grid, [(0, 0), (300, 300)], half_width_m=60, delta_m=5)
+    # North-up flipped, the array is indexed [y, x]; the line y = x makes it symmetric
+    # under swapping x and y (a mirror in the line).
+    north_up_flipped = np.flipud(out)
+    assert np.allclose(north_up_flipped, north_up_flipped.T, atol=1e-5)
+    assert out.max() <= 5.0 + 1e-5 and out.min() >= 0.0
+
+
+def test_ridge_outside_the_grid_changes_nothing_and_input_validation():
+    grid = _ridge_grid()
+    dem = np.zeros((grid.height, grid.width), dtype="float32")
+    far = stamp_ridge(dem, grid, [(5000, 5000), (6000, 5000)], 40, 9)
+    assert (far == 0).all()
+    with pytest.raises(ValueError):
+        stamp_ridge(dem, grid, [(1, 1)], 40, 9)  # needs two points
+    with pytest.raises(ValueError):
+        stamp_ridge(dem, grid, [(1, 1), (50, 50)], 0, 9)  # half-width must be > 0
PATCH
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd pipeline && uv run pytest tests/test_landforms.py tests/test_terrain.py -q`

Expected: **FAIL** (the code under test does not exist yet, or the new assertions do not hold yet).

- [ ] **Step 3: Write the implementation**

`pipeline/yelamu/landforms.py`

```python
"""Hand-sculpted landforms: validation, loading and stamping.

`landforms.json` is a list of entries, each with a `source` and a `confidence`
(the build rejects entries without them). Two kinds:

    {"kind": "bump",  "name": "...", "lon": .., "lat": .., "radius_m": .., "delta_m": ..,
     "source": "...", "confidence": "documented|inferred|illustrative"}
    {"kind": "ridge", "name": "...", "points": [[lon, lat], ...] (>= 2),
     "half_width_m": .., "delta_m": .., "source": "...", "confidence": "..."}

`kind` defaults to "bump"; `name` is optional. A bump is a raised-cosine hill/dent
(terrain.stamp_landform); a ridge is a raised-cosine band along a polyline
(terrain.stamp_ridge). Positive delta_m raises, negative lowers; stamps ADD.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Sequence

import numpy as np

from yelamu.geo import Grid, lonlat_to_utm
from yelamu.provenance import provenance_problem
from yelamu.terrain import stamp_landform, stamp_ridge

KINDS = ("bump", "ridge")
_COMMON = {"kind", "name", "source", "confidence", "delta_m"}
_KEYS = {
    "bump": _COMMON | {"lon", "lat", "radius_m"},
    "ridge": _COMMON | {"points", "half_width_m"},
}


def _num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _label(item: Any, index: int) -> str:
    name = item.get("name") if isinstance(item, dict) else None
    return f"landforms[{index}]" + (f" ({name!r})" if isinstance(name, str) and name else "")


def _validate_one(item: Any, bbox: tuple[float, float, float, float]) -> str | None:
    """The first problem with one entry (without its label), or None."""
    if not isinstance(item, dict):
        return "must be an object"
    kind = item.get("kind", "bump")
    if kind not in KINDS:
        return f"kind must be one of {', '.join(KINDS)}, got {kind!r}"
    unknown = sorted(set(item) - _KEYS[kind])
    if unknown:
        return (f"unknown key(s) for kind {kind!r}: {', '.join(unknown)} "
                f"(allowed: {', '.join(sorted(_KEYS[kind]))})")
    if "name" in item and not (isinstance(item["name"], str) and item["name"].strip()):
        return "name must be a non-blank string"
    problem = provenance_problem(item)
    if problem is not None:
        return problem.replace("properties.", "")
    if not _num(item.get("delta_m")):
        return f"delta_m must be a number, got {item.get('delta_m')!r}"
    west, south, east, north = bbox

    def in_box(lon: Any, lat: Any, what: str) -> str | None:
        if not (_num(lon) and _num(lat)):
            return f"{what} must be numbers (lon, lat)"
        if not (west <= lon <= east and south <= lat <= north):
            return (f"{what} ({lon}, {lat}) is outside the region bbox "
                    f"[{west}, {south}, {east}, {north}] (is lon/lat swapped?)")
        return None

    if kind == "bump":
        for key in ("lon", "lat", "radius_m"):
            if key not in item:
                return f"{key} is required"
        err = in_box(item["lon"], item["lat"], "lon/lat")
        if err:
            return err
        if not (_num(item["radius_m"]) and item["radius_m"] > 0):
            return f"radius_m must be a number greater than 0, got {item['radius_m']!r}"
        return None

    # ridge
    for key in ("points", "half_width_m"):
        if key not in item:
            return f"{key} is required"
    points = item["points"]
    if not isinstance(points, list) or len(points) < 2:
        return "points must be a list of at least two [lon, lat] pairs"
    for i, pt in enumerate(points):
        if not (isinstance(pt, (list, tuple)) and len(pt) == 2):
            return f"points[{i}] must be a [lon, lat] pair"
        err = in_box(pt[0], pt[1], f"points[{i}]")
        if err:
            return err
    if len({(float(p[0]), float(p[1])) for p in points}) < 2:
        return "points must not all be the same location (the ridge has no length)"
    if not (_num(item["half_width_m"]) and item["half_width_m"] > 0):
        return f"half_width_m must be a number greater than 0, got {item['half_width_m']!r}"
    return None


def validate_landforms(items: Any, bbox: tuple[float, float, float, float]) -> None:
    """Raise ValueError (naming the entry) for the first invalid landform entry."""
    if not isinstance(items, list):
        raise ValueError("landforms must be a JSON list of entries")
    for index, item in enumerate(items):
        problem = _validate_one(item, bbox)
        if problem is not None:
            raise ValueError(f"{_label(item, index)}: {problem}")


def load_landforms(path: Path, bbox: tuple[float, float, float, float]) -> list[dict]:
    """Read and validate a landforms JSON file; ValueError messages name the file."""
    path = Path(path)
    try:
        items = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: not valid JSON ({exc})") from exc
    try:
        validate_landforms(items, bbox)
    except ValueError as exc:
        raise ValueError(f"{path}: {exc}") from exc
    return items


def apply_landforms(dem: np.ndarray, grid: Grid, items: Sequence[dict]) -> np.ndarray:
    """Stamp every (validated) entry onto a copy of dem, in file order."""
    out = np.asarray(dem, dtype="float32").copy()
    for item in items:
        if item.get("kind", "bump") == "ridge":
            pts = [lonlat_to_utm(lon, lat) for lon, lat in item["points"]]
            out = stamp_ridge(out, grid, pts, item["half_width_m"], item["delta_m"])
        else:
            x, y = lonlat_to_utm(item["lon"], item["lat"])
            out = stamp_landform(out, grid, x, y, item["radius_m"], item["delta_m"])
    return out


def landform_provenance(items: Sequence[dict]) -> list[tuple[str, str]]:
    """(source, confidence) per entry, in file order."""
    return [(item["source"].strip(), item["confidence"]) for item in items]
```

`pipeline/yelamu/terrain.py` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/pipeline/yelamu/terrain.py
+++ b/pipeline/yelamu/terrain.py
@@ -2,7 +2,10 @@
 
 from __future__ import annotations
 
+from typing import Sequence
+
 import numpy as np
+import shapely
 from scipy import ndimage
 
 from yelamu.geo import Grid
@@ -78,6 +81,47 @@
     dist = np.hypot(xx - x, yy - y)
     weight = np.where(dist < radius_m, 0.5 * (1.0 + np.cos(np.pi * dist / radius_m)), 0.0)
     return (dem + delta_m * weight).astype("float32")
+
+
+def stamp_ridge(
+    dem: np.ndarray,
+    grid: Grid,
+    points: Sequence[tuple[float, float]],
+    half_width_m: float,
+    delta_m: float,
+) -> np.ndarray:
+    """Raise (delta_m > 0) or lower (delta_m < 0) the ground along a polyline.
+
+    `points` are UTM metres (easting, northing), at least two. The change is delta_m on
+    the line itself and falls off with a raised cosine of the distance to the polyline,
+    reaching exactly 0 at half_width_m (and staying 0 beyond), so a lost dune ridge
+    blends into the surrounding terrain. Distance is measured to the nearest point of
+    the whole polyline (shapely), so the ends are round caps and a line that doubles
+    back on itself is applied ONCE, not stacked. Separate stamps ADD, as with
+    stamp_landform: the delta is added to whatever is there, never max'd.
+    Only cells within half_width_m of the line's bounding box are evaluated.
+    """
+    if len(points) < 2:
+        raise ValueError("a ridge needs at least two points")
+    if not half_width_m > 0:
+        raise ValueError(f"half_width_m must be greater than 0, got {half_width_m!r}")
+    out = np.asarray(dem, dtype="float32").copy()
+    line = shapely.linestrings(np.asarray(points, dtype="float64"))
+    x0, y0, x1, y1 = line.bounds
+    # Window of cells (by centre) that can lie within half_width_m of the line.
+    col0 = max(0, int(np.floor((x0 - half_width_m - grid.west) / grid.cell - 0.5)))
+    col1 = min(grid.width, int(np.ceil((x1 + half_width_m - grid.west) / grid.cell + 0.5)))
+    row0 = max(0, int(np.floor((grid.north - y1 - half_width_m) / grid.cell - 0.5)))
+    row1 = min(grid.height, int(np.ceil((grid.north - y0 + half_width_m) / grid.cell + 0.5)))
+    if col0 >= col1 or row0 >= row1:
+        return out
+    xs = grid.west + (np.arange(col0, col1) + 0.5) * grid.cell
+    ys = grid.north - (np.arange(row0, row1) + 0.5) * grid.cell
+    xx, yy = np.meshgrid(xs, ys)
+    dist = shapely.distance(shapely.points(xx.ravel(), yy.ravel()), line).reshape(xx.shape)
+    weight = np.where(dist < half_width_m, 0.5 * (1.0 + np.cos(np.pi * dist / half_width_m)), 0.0)
+    out[row0:row1, col0:col1] = (out[row0:row1, col0:col1] + delta_m * weight).astype("float32")
+    return out
 
 
 def smooth_land(
PATCH
```

- [ ] **Step 4: Run the whole suite**

Run: `cd pipeline && uv run pytest -q -W error`

Expected: **398 passed**, no warnings.

- [ ] **Step 5: Commit**

```bash
git add pipeline/tests/test_landforms.py pipeline/yelamu/landforms.py pipeline/tests/test_terrain.py pipeline/yelamu/terrain.py
git commit -m "feat(pipeline): ridge landforms and validated landform entries"
```

---

### Task P4: Comparison renderer and polygon checker

**Files:**
- Create: `pipeline/tests/test_compare.py`
- Create: `pipeline/tests/test_handcheck.py`
- Create: `pipeline/tests/test_render_compare.py`
- Create: `pipeline/yelamu/compare.py`
- Create: `pipeline/yelamu/handcheck.py`
- Create: `pipeline/scripts/render_compare.py`
- Create: `pipeline/scripts/check_polygons.py`
- Create: `pipeline/data/full-city/hand/hand_ponds.geojson`

The tracing feedback loop. `render_compare.py` draws, for any bounding box, the georeferenced sheet, the current reconstruction (water, marsh, hillshaded land, the 1769 shoreline as a thin red line) and a 50% blend, with a 500 m scale bar and lon/lat ticks. `check_polygons.py` validates hand-drawn files before a build: feature count, validity, sources, area in hectares, features outside the region, overlaps. This task also adds the (empty) `hand_ponds.geojson` that a test checks beside the other two hand files. The pure parts (classification, shoreline edges, crop window, scale bar) are tested in Python; the drawing itself needs Pillow and runs with `uv run --with pillow` (Pillow is **not** a project dependency, and its smoke test is skipped when Pillow is absent).

- [ ] **Step 1: Add the tests**

`pipeline/tests/test_compare.py`

```python
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
```

`pipeline/tests/test_handcheck.py`

```python
import json

import pytest

from yelamu.handcheck import check_file, format_report, main

BBOX = (-122.53, 37.70, -122.33, 37.84)
GOOD = {"source": "T-sheet 1853", "confidence": "inferred"}


def sq(lon0, lat0, lon1, lat1):
    return {"type": "Polygon", "coordinates": [[[lon0, lat0], [lon1, lat0], [lon1, lat1],
                                                 [lon0, lat1], [lon0, lat0]]]}


def feat(geom, **props):
    return {"type": "Feature", "properties": props, "geometry": geom}


def write(tmp_path, features, name="h.geojson"):
    path = tmp_path / name
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    return path


def test_clean_file_reports_counts_area_and_provenance(tmp_path):
    # 0.01 deg x 0.01 deg is about 0.88 km x 1.11 km = 98 ha
    path = write(tmp_path, [feat(sq(-122.40, 37.77, -122.39, 37.78), **GOOD),
                            feat(sq(-122.38, 37.77, -122.37, 37.78), source="Other", confidence="documented")])
    r = check_file(path, BBOX)
    assert r.ok and r.n_features == 2 and r.n_polygonal == 2
    assert 190 < r.area_ha < 205
    assert dict(r.sources) == {"T-sheet 1853": 1, "Other": 1}
    assert dict(r.confidences) == {"inferred": 1, "documented": 1}
    assert r.warnings == []
    text = format_report(r)
    assert "features: 2" in text and "ha" in text and "T-sheet 1853" in text and "OK" in text


def test_empty_file_is_fine(tmp_path):
    r = check_file(write(tmp_path, []), BBOX)
    assert r.ok and r.n_features == 0
    assert "empty" in format_report(r)


def test_missing_provenance_is_a_problem_for_every_offender(tmp_path):
    path = write(tmp_path, [feat(sq(-122.40, 37.77, -122.39, 37.78)),
                            feat(sq(-122.38, 37.77, -122.37, 37.78), name="Cove", source="x"),
                            feat(sq(-122.36, 37.77, -122.35, 37.78), **GOOD)])
    r = check_file(path, BBOX)
    assert not r.ok and len(r.problems) == 2
    assert "feature 0" in r.problems[0] and "source" in r.problems[0]
    assert "feature 1" in r.problems[1] and "Cove" in r.problems[1] and "confidence" in r.problems[1]


def test_invalid_geometry_is_reported(tmp_path):
    bowtie = {"type": "Polygon", "coordinates": [[[-122.40, 37.77], [-122.39, 37.78],
                                                  [-122.39, 37.77], [-122.40, 37.78], [-122.40, 37.77]]]}
    r = check_file(write(tmp_path, [feat(bowtie, **GOOD)]), BBOX)
    assert not r.ok and "invalid geometry" in r.problems[0]


def test_outside_bbox_entirely_fails_partly_warns(tmp_path):
    path = write(tmp_path, [feat(sq(-121.0, 37.0, -120.9, 37.1), **GOOD),
                            feat(sq(-122.36, 37.80, -122.30, 37.85), **GOOD),
                            feat(sq(-122.40, 37.77, -122.39, 37.78), **GOOD)])
    r = check_file(path, BBOX)
    assert len(r.problems) == 1 and "feature 0" in r.problems[0] and "outside" in r.problems[0]
    assert any("feature 1" in w and "partly outside" in w for w in r.warnings)
    # Without a bbox the check is skipped
    assert check_file(path, None).ok


def test_overlaps_over_half_a_hectare_warn_smaller_do_not(tmp_path):
    a = sq(-122.40, 37.77, -122.39, 37.78)
    path = write(tmp_path, [feat(a, **GOOD),
                            feat(sq(-122.395, 37.775, -122.385, 37.785), **GOOD),   # ~25 ha overlap
                            feat(sq(-122.2000, 37.77, -122.1999, 37.78), **GOOD)])
    r = check_file(path, None)
    overlaps = [w for w in r.warnings if w.startswith("overlap")]
    assert len(overlaps) == 1 and "feature 0" in overlaps[0] and "feature 1" in overlaps[0]
    tiny = write(tmp_path, [feat(a, **GOOD), feat(sq(-122.39001, 37.77, -122.38, 37.78), **GOOD)],
                 "t.geojson")  # ~0.9 m x 1.1 km = 0.1 ha
    assert [w for w in check_file(tiny, None).warnings if w.startswith("overlap")] == []


def test_unreadable_files_fail(tmp_path):
    (tmp_path / "bad.geojson").write_text("{nope")
    assert not check_file(tmp_path / "bad.geojson", BBOX).ok
    assert not check_file(tmp_path / "absent.geojson", BBOX).ok
    (tmp_path / "num.geojson").write_text("[1,2]")
    assert not check_file(tmp_path / "num.geojson", BBOX).ok


def test_non_polygon_features_are_ignored_with_a_warning(tmp_path):
    line = {"type": "LineString", "coordinates": [[-122.4, 37.7], [-122.3, 37.8]]}
    r = check_file(write(tmp_path, [feat(line, **GOOD), feat(sq(-122.40, 37.77, -122.39, 37.78), **GOOD)]), BBOX)
    assert r.ok and r.n_features == 2 and r.n_polygonal == 1
    assert any("no polygon geometry" in w for w in r.warnings)


def test_cli_exit_codes(tmp_path, capsys):
    region = tmp_path / "pipeline" / "regions"
    region.mkdir(parents=True)
    (region / "r.json").write_text(json.dumps(
        {"name": "t", "bbox": list(BBOX), "cell_m": 10, "dem": "d.tif", "out": "o"}))
    good = write(tmp_path, [feat(sq(-122.40, 37.77, -122.39, 37.78), **GOOD)], "good.geojson")
    bad = write(tmp_path, [feat(sq(-122.40, 37.77, -122.39, 37.78))], "bad.geojson")
    assert main([str(good), "--region", str(region / "r.json")]) == 0
    out = capsys.readouterr().out
    assert "good.geojson" in out and "OK" in out
    assert main([str(good), str(bad), "--region", str(region / "r.json")]) == 1
    assert "FAILED" in capsys.readouterr().out
    assert main([str(good)]) == 0  # region is optional
    assert main([str(good), "--region", str(tmp_path / "nope.json")]) == 1


def test_the_shipped_empty_hand_files_pass():
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    files = sorted((root / "data/full-city/hand").glob("*.geojson"))
    assert {f.name for f in files} == {"hand_bay.geojson", "hand_marsh.geojson", "hand_ponds.geojson"}
    assert main([*map(str, files), "--region", str(root / "regions/full-city.json")]) == 0
```

`pipeline/tests/test_render_compare.py`

```python
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
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd pipeline && uv run pytest tests/test_compare.py tests/test_handcheck.py tests/test_render_compare.py -q`

Expected: **FAIL** (the code under test does not exist yet, or the new assertions do not hold yet).

- [ ] **Step 3: Write the implementation**

`pipeline/yelamu/compare.py`

```python
"""Pure helpers behind scripts/render_compare.py: compare a reconstruction to a map sheet.

Everything here is numpy/rasterio only (no Pillow), so it is unit-tested; the script adds
the text, scale bars and PNG writing.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.warp import Resampling, reproject

from yelamu.export import dequantize_heights
from yelamu.geo import UTM_CRS, Grid, lonlat_to_utm
from yelamu.terrain import MARSH_LEVEL_M, WATER_LEVEL_M

LAND, WATER, MARSH, POND = 0, 1, 2, 3
SHORELINE_RGB = (139, 26, 26)  # dark red
PLACEHOLDER_RGB = (200, 200, 200)
_WATER_RGB = (62, 112, 168)
_POND_RGB = (86, 150, 205)
_MARSH_RGB = (96, 170, 158)
_LAND_LOW_RGB = (226, 208, 160)  # tan at the shore
_LAND_HIGH_RGB = (150, 128, 84)  # darker on the hills
_UTM_TO_LONLAT = Transformer.from_crs(UTM_CRS, "EPSG:4326", always_xy=True)


# ----------------------------------------------------------------------- assets


def load_assets(asset_dir: Path) -> tuple[dict, np.ndarray, np.ndarray | None]:
    """(meta, heights in metres, habitat ids or None) from a built asset folder."""
    asset_dir = Path(asset_dir)
    meta = json.loads((asset_dir / "meta.json").read_text())
    w, h = meta["width"], meta["height"]
    q = np.fromfile(asset_dir / meta["heights_file"], dtype="<u2").reshape(h, w)
    heights = dequantize_heights(q, meta["min_m"], meta["max_m"])
    habitat = None
    if meta.get("habitat_file") and (asset_dir / meta["habitat_file"]).exists():
        habitat = np.fromfile(asset_dir / meta["habitat_file"], dtype=np.uint8).reshape(h, w)
    return meta, heights, habitat


def meta_grid(meta: dict) -> Grid:
    return Grid(meta["west"], meta["south"], meta["east"], meta["north"], meta["cell_m"])


# --------------------------------------------------------------- classification


def classify(heights: np.ndarray, habitat: np.ndarray | None, meta: dict) -> np.ndarray:
    """uint8 codes per cell: LAND 0, WATER 1 (bay), MARSH 2, POND 3.

    A cell below the water level is bay water, or marsh when it sits at the marsh level
    (within a couple of height-quantisation steps) and, if a habitat raster is given, is in
    the marsh group. A cell AT OR ABOVE the water level whose habitat group is "water" is a
    pond (ponds sit at their own level). Everything else is land. Hand-drawn and gap-filled
    areas are deliberately not told apart.
    """
    h = np.asarray(heights)
    level = float(meta.get("water_level_m", WATER_LEVEL_M))
    step = (float(meta.get("max_m", 1.0)) - float(meta.get("min_m", 0.0))) / 65535.0
    tol = max(1.5 * step, 0.005)
    below = h < level
    group = np.full(h.shape, "", dtype=object)
    if habitat is not None:
        by_id = {int(e["id"]): e["group"] for e in meta.get("habitat_classes", [])}
        lut = np.array([by_id.get(i, "") for i in range(256)], dtype=object)
        group = lut[np.asarray(habitat, dtype=np.uint8)]
    at_marsh_level = np.abs(h - MARSH_LEVEL_M) <= tol
    marsh = below & at_marsh_level & ((group == "marsh") if habitat is not None else True)
    pond = ~below & (group == "water")
    out = np.zeros(h.shape, dtype=np.uint8)
    out[below] = WATER
    out[marsh] = MARSH
    out[pond] = POND
    return out


def shoreline_edges(water_mask: np.ndarray) -> np.ndarray:
    """Water pixels that touch a non-water pixel (4-neighbourhood): a 1-pixel shoreline.

    The edge of the array is not a shoreline (it is padded with its own values).
    """
    w = np.asarray(water_mask, dtype=bool)
    p = np.pad(w, 1, mode="edge")
    land_nb = ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    return w & land_nb


# ---------------------------------------------------------------------- windows


@dataclass(frozen=True)
class Window:
    """Grid window: rows row0..row1-1 and cols col0..col1-1 (north-up, row 0 = north)."""

    row0: int
    row1: int
    col0: int
    col1: int

    @property
    def height(self) -> int:
        return self.row1 - self.row0

    @property
    def width(self) -> int:
        return self.col1 - self.col0

    def slices(self) -> tuple[slice, slice]:
        return slice(self.row0, self.row1), slice(self.col0, self.col1)


def crop_window(meta: dict, bbox: tuple[float, float, float, float]) -> Window:
    """The grid window covering a lon/lat bbox (W, S, E, N), clamped to the grid.

    Cells partly inside the bbox are included. ValueError when no cell is inside.
    """
    west, south, east, north = bbox
    if not (west < east and south < north):
        raise ValueError(f"bbox must satisfy west < east and south < north, got {bbox}")
    # The lon/lat rectangle is slightly skewed in UTM: take the extent of its whole boundary.
    t = np.linspace(0.0, 1.0, 21)
    ring = ([(west + (east - west) * u, s) for u in t for s in (south, north)]
            + [(w, south + (north - south) * u) for u in t for w in (west, east)])
    pts = [lonlat_to_utm(lon, lat) for lon, lat in ring]
    xs, ys = [c[0] for c in pts], [c[1] for c in pts]
    cell = float(meta["cell_m"])
    col0 = int(np.floor((min(xs) - meta["west"]) / cell))
    col1 = int(np.ceil((max(xs) - meta["west"]) / cell))
    row0 = int(np.floor((meta["north"] - max(ys)) / cell))
    row1 = int(np.ceil((meta["north"] - min(ys)) / cell))
    win = Window(max(row0, 0), min(row1, meta["height"]), max(col0, 0), min(col1, meta["width"]))
    if win.height <= 0 or win.width <= 0:
        raise ValueError(f"bbox {bbox} lies outside the built area "
                         f"(rows 0..{meta['height']}, cols 0..{meta['width']})")
    return win


def window_grid(meta: dict, win: Window) -> Grid:
    cell = float(meta["cell_m"])
    return Grid(
        west=meta["west"] + win.col0 * cell, south=meta["north"] - win.row1 * cell,
        east=meta["west"] + win.col1 * cell, north=meta["north"] - win.row0 * cell, cell=cell)


def scale_bar_pixels(cell_m: float, scale: int, metres: float) -> int:
    """Length in output pixels of a scale bar for `metres` (at least 1)."""
    return max(1, int(round(metres / cell_m * scale)))


# -------------------------------------------------------------------- rendering


def hillshade(heights: np.ndarray, cell_m: float, azimuth_deg: float = 315.0,
              altitude_deg: float = 45.0, z_factor: float = 2.0) -> np.ndarray:
    """Lambertian shade in 0..1 (north-up array). Flat ground is sin(altitude)."""
    h = np.asarray(heights, dtype="float64")
    if h.shape[0] < 2 or h.shape[1] < 2:
        return np.full(h.shape, np.sin(np.radians(altitude_deg)))
    dz_dx = np.gradient(h, cell_m, axis=1)  # rise per metre going east
    dz_dy = np.gradient(h, cell_m, axis=0)  # going down the rows, i.e. SOUTH (GDAL's convention)
    slope = np.arctan(z_factor * np.hypot(dz_dx, dz_dy))
    aspect = np.arctan2(dz_dy, -dz_dx)
    zenith = np.radians(90.0 - altitude_deg)
    az = np.radians(360.0 - azimuth_deg + 90.0)
    shade = np.cos(zenith) * np.cos(slope) + np.sin(zenith) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(shade, 0.0, 1.0)


def _repeat(a: np.ndarray, scale: int) -> np.ndarray:
    return np.repeat(np.repeat(a, scale, axis=0), scale, axis=1)


def render_reconstruction(
    heights: np.ndarray, habitat: np.ndarray | None, meta: dict, scale: int = 1
) -> tuple[np.ndarray, np.ndarray]:
    """(rgb uint8 (H*scale, W*scale, 3) WITHOUT a shoreline, shoreline mask at that size).

    Water (bay and ponds) blue, marsh teal, land tan darkening with height and shaded by a
    hillshade. The shoreline is the boundary between land and any water/marsh.
    """
    codes = classify(heights, habitat, meta)
    shade = hillshade(heights, float(meta["cell_m"]))
    t = np.clip(np.asarray(heights, dtype="float64") / 150.0, 0.0, 1.0)[..., None]
    land = np.asarray(_LAND_LOW_RGB) * (1 - t) + np.asarray(_LAND_HIGH_RGB) * t
    land = np.clip(land * (0.45 + 0.75 * shade[..., None]), 0, 255)
    rgb = land
    for code, colour in ((WATER, _WATER_RGB), (MARSH, _MARSH_RGB), (POND, _POND_RGB)):
        rgb = np.where((codes == code)[..., None], np.asarray(colour, dtype="float64"), rgb)
    rgb = _repeat(rgb.astype(np.uint8), scale)
    return rgb, shoreline_edges(_repeat(codes != LAND, scale))


def draw_mask(rgb: np.ndarray, mask: np.ndarray, colour=SHORELINE_RGB) -> np.ndarray:
    out = rgb.copy()
    out[mask] = colour
    return out


def blend(a: np.ndarray, b: np.ndarray, alpha: float = 0.5) -> np.ndarray:
    """alpha * a + (1 - alpha) * b as uint8."""
    if a.shape != b.shape:
        raise ValueError(f"shapes differ: {a.shape} vs {b.shape}")
    return np.rint(alpha * a.astype("float64") + (1 - alpha) * b.astype("float64")).astype(np.uint8)


def placeholder(height: int, width: int) -> np.ndarray:
    return np.full((height, width, 3), PLACEHOLDER_RGB, dtype=np.uint8)


def read_sheet(path: Path, grid: Grid, scale: int = 1) -> np.ndarray:
    """A georeferenced sheet resampled (bilinear) onto `grid` at `scale` pixels per cell.

    Returns RGB uint8 (grid.height*scale, grid.width*scale, 3); pixels the sheet does not
    cover (or that are transparent) are the grey placeholder.
    """
    from rasterio.transform import from_origin

    height, width = grid.height * scale, grid.width * scale
    dst_transform = from_origin(grid.west, grid.north, grid.cell / scale, grid.cell / scale)
    with rasterio.open(path) as src:
        if src.crs is None:
            raise ValueError(f"{path} is not georeferenced; run scripts/georeference.py on "
                             "the scan first")
        count = src.count
        data = src.read().astype("float64")
        if np.issubdtype(np.dtype(src.dtypes[0]), np.integer):
            top = np.iinfo(np.dtype(src.dtypes[0])).max
            data = data * (255.0 / top)
        else:
            lo, hi = float(np.nanmin(data)), float(np.nanmax(data))
            data = (data - lo) / (hi - lo) * 255.0 if hi > lo else np.zeros_like(data)
        has_alpha = count in (2, 4)
        colour_bands = data[: count - 1] if has_alpha else data
        covered = np.ones((src.height, src.width), dtype="float64") * 255.0
        planes = [*colour_bands, *([data[-1]] if has_alpha else [covered])]
        out = []
        for plane in planes:
            dst = np.zeros((height, width), dtype="float64")
            reproject(plane, dst, src_transform=src.transform, src_crs=src.crs,
                      dst_transform=dst_transform, dst_crs=UTM_CRS,
                      resampling=Resampling.bilinear)
            out.append(dst)
    alpha = out[-1]
    colour = out[:-1]
    if len(colour) == 1:
        colour = colour * 3
    elif len(colour) == 2:  # gray + something unexpected: use the first
        colour = [colour[0]] * 3
    rgb = np.clip(np.stack(colour[:3], axis=-1), 0, 255).astype(np.uint8)
    rgb[alpha < 128] = PLACEHOLDER_RGB
    return rgb


# ------------------------------------------------------------------------ ticks

_TICK_STEPS = (0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1)


def lonlat_ticks(grid: Grid, scale: int = 1, max_ticks: int = 5):
    """Tick positions for a panel showing `grid` at `scale` pixels per cell.

    Returns (x_ticks, y_ticks): lists of (pixel, label). x_ticks are longitudes (placed
    along the bottom edge), y_ticks latitudes (along the left edge); a tick is a multiple of
    a 'nice' degree step chosen so there are at most `max_ticks` of each.
    """
    corners = [_UTM_TO_LONLAT.transform(x, y) for x in (grid.west, grid.east)
               for y in (grid.south, grid.north)]
    lon0, lon1 = min(c[0] for c in corners), max(c[0] for c in corners)
    lat0, lat1 = min(c[1] for c in corners), max(c[1] for c in corners)
    mid_lon, mid_lat = (lon0 + lon1) / 2, (lat0 + lat1) / 2
    to_utm = Transformer.from_crs("EPSG:4326", UTM_CRS, always_xy=True)

    def step_for(span: float) -> float:
        for s in _TICK_STEPS:
            if span / s <= max_ticks:
                return s
        return _TICK_STEPS[-1]

    def values(lo: float, hi: float) -> list[float]:
        s = step_for(hi - lo)
        k0, k1 = int(np.ceil(lo / s - 1e-9)), int(np.floor(hi / s + 1e-9))
        return [round(k * s, 6) for k in range(k0, k1 + 1)]

    xt, yt = [], []
    for lon in values(lon0, lon1):
        x, _ = to_utm.transform(lon, mid_lat)
        px = (x - grid.west) / grid.cell * scale
        if 0 <= px <= grid.width * scale:
            xt.append((px, f"{abs(lon):.3f}{'W' if lon < 0 else 'E'}"))
    for lat in reversed(values(lat0, lat1)):  # top of the panel (north) first
        _, y = to_utm.transform(mid_lon, lat)
        py = (grid.north - y) / grid.cell * scale
        if 0 <= py <= grid.height * scale:
            yt.append((py, f"{abs(lat):.3f}{'S' if lat < 0 else 'N'}"))
    return xt, yt
```

`pipeline/yelamu/handcheck.py`

```python
"""Check hand-drawn polygon files before a build.

    uv run python scripts/check_polygons.py FILE... --region regions/full-city.json

For each GeoJSON file: feature count, geometry validity as drawn, provenance (sources and
confidences), total area in hectares, features outside the region's bounding box, and
pairs of features of the same file that overlap by more than 0.5 ha. Exit code 1 when any
file has an unreadable or invalid geometry, a feature without a valid source / confidence,
or a feature lying entirely outside the bbox (overlaps and partly-outside features are
only warnings).
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

import shapely
from shapely.geometry import box, shape
from shapely.validation import explain_validity

from yelamu.geo import Grid
from yelamu.provenance import provenance_problem
from yelamu.region import load_region
from yelamu.sources import feature_label, geometry_to_utm_polygons

OVERLAP_HA = 0.5


@dataclass
class FileReport:
    path: Path
    n_features: int = 0  # all features in the file
    n_polygonal: int = 0  # features with polygon geometry
    area_ha: float = 0.0
    sources: Counter = field(default_factory=Counter)
    confidences: Counter = field(default_factory=Counter)
    problems: list[str] = field(default_factory=list)  # make the check fail
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems


def _label(path: Path, index: int, props) -> str:
    return feature_label(path.name, index, props)


def check_file(
    path: Path,
    bbox: tuple[float, float, float, float] | None = None,
    overlap_ha: float = OVERLAP_HA,
) -> FileReport:
    """Inspect one file. `bbox` is the region (W, S, E N in lon/lat), or None to skip that check."""
    path = Path(path)
    report = FileReport(path)
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        report.problems.append(f"{path}: cannot read as JSON ({exc})")
        return report
    features = data.get("features") if isinstance(data, dict) and data.get("type") == "FeatureCollection" else (
        [data] if isinstance(data, dict) else None)
    if features is None:
        report.problems.append(f"{path}: not a GeoJSON FeatureCollection or Feature")
        return report
    report.n_features = len(features)

    region = None
    if bbox is not None:
        g = Grid.from_lonlat_bbox(*bbox, cell=1.0)
        region = box(g.west, g.south, g.east, g.north)

    kept: list[tuple[int, dict, object]] = []  # (index, properties, UTM geometry)
    for index, feature in enumerate(features):
        is_feature = isinstance(feature, dict) and feature.get("type") == "Feature"
        raw = feature.get("geometry") if is_feature else feature
        props = (feature.get("properties") or {}) if is_feature else {}
        label = _label(path, index, props)
        parts = geometry_to_utm_polygons(raw)
        if not parts:
            report.warnings.append(f"{label}: no polygon geometry (ignored by the build)")
            continue
        report.n_polygonal += 1
        try:
            drawn = shape(raw)
            if not drawn.is_valid:
                report.problems.append(
                    f"{label}: invalid geometry as drawn ({explain_validity(drawn)}); "
                    "the build would silently repair it")
        except Exception as exc:  # malformed coordinates
            report.problems.append(f"{label}: unreadable geometry ({exc})")
            continue
        problem = provenance_problem(props)
        if problem is not None:
            report.problems.append(f"{label}: {problem}")
        else:
            report.sources[props["source"].strip()] += 1
            report.confidences[props["confidence"]] += 1
        geom = shapely.unary_union(parts)
        report.area_ha += geom.area / 1e4
        kept.append((index, props, geom))
        if region is not None:
            if not geom.intersects(region):
                report.problems.append(f"{label}: entirely outside the region bbox")
            elif not region.contains(geom):
                report.warnings.append(f"{label}: partly outside the region bbox")

    geoms = [k[2] for k in kept]
    if len(geoms) > 1:
        tree = shapely.STRtree(geoms)
        left, right = tree.query(geoms, predicate="intersects")
        for i, j in sorted((int(a), int(b)) for a, b in zip(left, right) if a < b):
            ha = geoms[i].intersection(geoms[j]).area / 1e4
            if ha > overlap_ha:
                report.warnings.append(
                    f"overlap of {ha:.2f} ha between {_label(path, kept[i][0], kept[i][1])} "
                    f"and {_label(path, kept[j][0], kept[j][1])}")
    return report


def format_report(report: FileReport) -> str:
    lines = [f"{report.path}"]
    if report.n_features == 0 and report.ok:
        lines.append("  empty (0 features): fine, nothing is drawn yet")
    else:
        lines.append(f"  features: {report.n_features} ({report.n_polygonal} with polygons)")
        lines.append(f"  total area: {report.area_ha:.1f} ha")
        srcs = "; ".join(f"{s} x{n}" for s, n in sorted(report.sources.items())) or "(none)"
        lines.append(f"  sources: {srcs}")
        conf = ", ".join(f"{c} x{n}" for c, n in sorted(report.confidences.items())) or "(none)"
        lines.append(f"  confidences: {conf}")
    for w in report.warnings:
        lines.append(f"  WARNING: {w}")
    for p in report.problems:
        lines.append(f"  ERROR: {p}")
    lines.append("  " + ("OK" if report.ok else "FAILED"))
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="check_polygons", description=__doc__.split("\n\n")[0])
    p.add_argument("files", nargs="+", type=Path, help="GeoJSON file(s) of hand-drawn polygons")
    p.add_argument("--region", type=Path, help="region JSON; enables the outside-bbox check")
    args = p.parse_args(argv)
    bbox = None
    if args.region:
        try:
            bbox = load_region(args.region).bbox
        except (OSError, ValueError) as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
    failed = False
    for path in args.files:
        report = check_file(path, bbox)
        print(format_report(report))
        failed |= not report.ok
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
```

`pipeline/scripts/render_compare.py`

```python
"""Compare the reconstruction with a georeferenced map sheet, side by side (PNG).

Pillow is not a project dependency, so run it through uv:

    uv run --with pillow python scripts/render_compare.py ASSET_DIR --bbox W S E N \
        [--sheet GEOREF.tif] [--scale 2] --out OUT.png

Three panels: (1) the sheet reprojected onto the crop (grey when no --sheet), with
lon/lat ticks; (2) the reconstruction (water blue, marsh teal, land tan with hillshade)
with the 1769 shoreline as a 1-pixel dark red line; (3) a 50% blend of the two with the
shoreline on top. Every panel has a title and a 500 m scale bar. The pure logic lives in
yelamu.compare.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from yelamu.compare import (
    PLACEHOLDER_RGB,
    SHORELINE_RGB,
    blend,
    crop_window,
    draw_mask,
    load_assets,
    lonlat_ticks,
    placeholder,
    read_sheet,
    render_reconstruction,
    scale_bar_pixels,
    window_grid,
)

MARGIN_LEFT, MARGIN_BOTTOM, GAP, TITLE_H, HEADER_H = 64, 28, 14, 22, 26
BAR_M = 500


def _font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # old Pillow: fixed-size default font
        return ImageFont.load_default()


def draw_scale_bar(draw: ImageDraw.ImageDraw, panel_size: tuple[int, int], cell_m: float,
                   scale: int, font) -> None:
    width, height = panel_size
    length = scale_bar_pixels(cell_m, scale, BAR_M)
    x0, y0 = 10, height - 14
    draw.rectangle([x0 - 4, y0 - 16, x0 + length + 40, y0 + 8], fill=(255, 255, 255))
    draw.line([x0, y0, x0 + length, y0], fill=(0, 0, 0), width=3)
    draw.line([x0, y0 - 4, x0, y0 + 4], fill=(0, 0, 0), width=1)
    draw.line([x0 + length, y0 - 4, x0 + length, y0 + 4], fill=(0, 0, 0), width=1)
    draw.text((x0 + length + 6, y0 - 7), f"{BAR_M} m", fill=(0, 0, 0), font=font)


def compose(asset_dir: Path, bbox, sheet: Path | None, scale: int) -> Image.Image:
    meta, heights, habitat = load_assets(asset_dir)
    win = crop_window(meta, tuple(bbox))
    rows, cols = win.slices()
    h = heights[rows, cols]
    hab = habitat[rows, cols] if habitat is not None else None
    grid = window_grid(meta, win)
    recon, shore = render_reconstruction(h, hab, meta, scale)
    ph, pw = recon.shape[:2]
    sheet_rgb = read_sheet(sheet, grid, scale) if sheet else placeholder(ph, pw)
    panels = [
        ("1. Sheet" if sheet else "1. Sheet (none given)", sheet_rgb),
        ("2. Reconstruction + 1769 shoreline", draw_mask(recon, shore, SHORELINE_RGB)),
        ("3. Blend 50% + shoreline", draw_mask(blend(sheet_rgb, recon), shore, SHORELINE_RGB)),
    ]
    font, small = _font(14), _font(12)
    width = MARGIN_LEFT + 3 * pw + 2 * GAP + 10
    height = HEADER_H + TITLE_H + ph + MARGIN_BOTTOM + 6
    image = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    header = (f"{asset_dir.resolve().name}   bbox {bbox[0]} {bbox[1]} {bbox[2]} {bbox[3]}   "
              f"sheet: {sheet.name if sheet else '(none)'}   cell {meta['cell_m']:g} m x{scale}")
    draw.text((6, 5), header, fill=(0, 0, 0), font=font)
    for i, (title, rgb) in enumerate(panels):
        x0, y0 = MARGIN_LEFT + i * (pw + GAP), HEADER_H + TITLE_H
        draw.text((x0, HEADER_H + 2), title, fill=(0, 0, 0), font=font)
        panel = Image.fromarray(rgb)
        pdraw = ImageDraw.Draw(panel)
        draw_scale_bar(pdraw, (pw, ph), grid.cell, scale, small)
        image.paste(panel, (x0, y0))
        draw.rectangle([x0 - 1, y0 - 1, x0 + pw, y0 + ph], outline=(90, 90, 90))
    # lon/lat ticks on the left and bottom edges of panel 1
    xticks, yticks = lonlat_ticks(grid, scale)
    x0, y0 = MARGIN_LEFT, HEADER_H + TITLE_H
    for py, label in yticks:
        draw.line([x0 - 5, y0 + py, x0 - 1, y0 + py], fill=(0, 0, 0))
        draw.text((2, y0 + py - 7), label, fill=(0, 0, 0), font=small)
    for px, label in xticks:
        draw.line([x0 + px, y0 + ph + 1, x0 + px, y0 + ph + 5], fill=(0, 0, 0))
        draw.text((x0 + px - 22, y0 + ph + 8), label, fill=(0, 0, 0), font=small)
    return image


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="render_compare", description=__doc__.split("\n\n")[0])
    p.add_argument("asset_dir", type=Path, help="built asset folder (meta.json, heightmap.u16, ...)")
    p.add_argument("--bbox", type=float, nargs=4, required=True,
                   metavar=("WEST", "SOUTH", "EAST", "NORTH"), help="lon/lat crop")
    p.add_argument("--sheet", type=Path, help="georeferenced sheet (GeoTIFF from georeference.py)")
    p.add_argument("--scale", type=int, default=2, help="output pixels per grid cell (default 2)")
    p.add_argument("--out", type=Path, required=True, help="output PNG")
    args = p.parse_args(argv)
    if args.scale < 1:
        p.error("--scale must be at least 1")
    try:
        image = compose(args.asset_dir, args.bbox, args.sheet, args.scale)
    except (OSError, ValueError, KeyError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.out)
    print(f"wrote {args.out} ({image.width} x {image.height})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

`pipeline/scripts/check_polygons.py`

```python
"""Check hand-drawn polygon files (validity, provenance, area, bbox, overlaps).

    uv run python scripts/check_polygons.py FILE... --region regions/full-city.json

A thin wrapper: the logic lives in yelamu.handcheck. Exit code 1 on any problem.
"""

from yelamu.handcheck import main

if __name__ == "__main__":
    raise SystemExit(main())
```

`pipeline/data/full-city/hand/hand_ponds.geojson`

```json
{"type": "FeatureCollection", "features": []}
```

- [ ] **Step 4: Run the whole suite**

Run: `cd pipeline && uv run pytest -q -W error`

Expected: **426 passed, 1 skipped**, no warnings.

- [ ] **Step 5: Commit**

```bash
git add pipeline/tests/test_compare.py pipeline/tests/test_handcheck.py pipeline/tests/test_render_compare.py pipeline/yelamu/compare.py pipeline/yelamu/handcheck.py pipeline/scripts/render_compare.py pipeline/scripts/check_polygons.py pipeline/data/full-city/hand/hand_ponds.geojson
git commit -m "feat(pipeline): comparison renderer and hand-polygon checker"
```

---

### Task P5: Ponds: levels, carving, bank blending, export

**Files:**
- Create: `pipeline/tests/test_ponds.py`
- Create: `pipeline/yelamu/ponds.py`
- Modify: `pipeline/tests/test_habitat.py`
- Modify: `pipeline/tests/test_pipeline.py`
- Modify: `pipeline/yelamu/habitat.py`
- Modify: `pipeline/yelamu/export.py`

A pond is a polygon with its own water level. `ponds.py` builds ponds from SFEI habitat classes (`pond_classes`) and hand-drawn polygons, takes the level from the feature or the median modern ground inside it, carves a bed that ramps from zero depth at the shore to `max_depth_m` over `shelf_m`, and then **blends the banks**: land within `bank_m` of a pond is clipped to `level ± bank_slope × distance`, so a pond cut into a hillside gets a ramp rather than a wall and a pond on a slope gets an embankment (found in the browser on Mountain Lake: without it the carve left a 14 m wall). Bay, marsh and gap-filled water are never touched. Hand ponds get their own habitat id (`ID_HAND_POND = 4`), so SFEI class ids shift up by one; `ponds.json` (world metres, per-pond level, source, confidence) is written next to the heightmap. Wired into the build in Task P7.

- [ ] **Step 1: Add the tests**

`pipeline/tests/test_ponds.py`

```python
import json

import numpy as np
import pytest
from shapely.geometry import MultiPolygon, Polygon, box

from yelamu.geo import Grid
from yelamu.habitat import ID_HAND_POND
from yelamu.overlay import world_xz
from yelamu.ponds import (
    DEFAULT_POND_CLASSES,
    Pond,
    PondSpec,
    build_ponds,
    carve_ponds,
    hand_pond_specs,
    pond_layer,
    pond_mask,
    pond_provenance_rows,
    ponds_document,
    sfei_pond_specs,
    slugify,
    stamp_ponds_on_habitat,
)
from yelamu.sources import Feature

# 40 x 40 cells of 10 m: x 500000..500400, y 4180000..4180400 (row 0 = north).
GRID = Grid(west=500000, south=4180000, east=500400, north=4180400, cell=10)


def flat(value=5.0):
    return np.full((GRID.height, GRID.width), value, dtype="float32")


def spec(geom, *, origin="hand", name=None, class_name=None, level=None, id_hint=None,
         source="a sheet", confidence="inferred"):
    return PondSpec(geometry=geom, origin=origin, source=source, confidence=confidence,
                    class_name=class_name, name=name, id_hint=id_hint, level_m=level)


def square(x0, y0, size):  # metres relative to the grid's SW corner
    return box(500000 + x0, 4180000 + y0, 500000 + x0 + size, 4180000 + y0 + size)


def test_slugify():
    assert slugify("Lake Merced (north)") == "lake-merced-north"
    assert slugify("Dune-dammed pond or lake") == "dune-dammed-pond-or-lake"
    assert slugify("  --  ") == "pond"
    assert slugify("Café") == "caf"


def test_default_pond_classes_exclude_the_tidal_lagoon():
    assert "Tidal coastal lagoon" not in DEFAULT_POND_CLASSES
    assert set(DEFAULT_POND_CLASSES) == {
        "Dune-dammed pond or lake", "Dune-dammed headwater lake",
        "Barrier beach-impounded freshwater lagoon", "Other pond or lake"}


# ------------------------------------------------------------------ specs


def _ll_square(lon0, lat0, lon1, lat1):
    return {"type": "Polygon", "coordinates": [[[lon0, lat0], [lon1, lat0], [lon1, lat1],
                                                [lon0, lat1], [lon0, lat0]]]}


def test_sfei_pond_specs_select_classes_and_explode_multipolygons():
    multi = {"type": "MultiPolygon", "coordinates": [
        _ll_square(-122.50, 37.70, -122.49, 37.71)["coordinates"],
        _ll_square(-122.48, 37.70, -122.47, 37.71)["coordinates"]]}
    coll = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"HabitatCla": "Dune-dammed pond or lake"},
         "geometry": multi},
        {"type": "Feature", "properties": {"HabitatCla": "Beach"},
         "geometry": _ll_square(-122.5, 37.7, -122.4, 37.8)},
        {"type": "Feature", "properties": {"HabitatCla": "Tidal coastal lagoon"},
         "geometry": _ll_square(-122.5, 37.7, -122.4, 37.8)},
        {"type": "Feature", "properties": {"HabitatCla": " Other pond or lake "},
         "geometry": _ll_square(-122.46, 37.70, -122.45, 37.71)},
        {"type": "Feature", "properties": {"HabitatCla": "Other pond or lake"}, "geometry": None},
        {"type": "Feature", "properties": {}, "geometry": _ll_square(-122.5, 37.7, -122.4, 37.8)},
    ]}
    specs = sfei_pond_specs(coll, DEFAULT_POND_CLASSES)
    assert [s.class_name for s in specs] == ["Dune-dammed pond or lake"] * 2 + ["Other pond or lake"]
    for s in specs:
        assert s.origin == "sfei" and s.confidence == "documented" and s.level_m is None
        assert s.source == f"SFEI Hidden Nature SF habitat class '{s.class_name}'"
        assert s.geometry.geom_type == "Polygon" and s.geometry.is_valid
        assert s.geometry.bounds[0] > 500000  # UTM metres, not degrees
    assert sfei_pond_specs(coll, []) == []
    assert len(sfei_pond_specs(coll, ["Beach"])) == 1


def _feature(geom, **props):
    return Feature(geometry=geom, source=props.get("source", "sheet"),
                   confidence=props.get("confidence", "inferred"), properties=props, index=0)


def test_hand_pond_specs_read_level_name_and_id():
    f = _feature(square(0, 0, 100), level_m=7.5, name="Pond A", id="My Pond!", source="S",
                 confidence="documented")
    (s,) = hand_pond_specs([f], path="x.geojson")
    assert (s.level_m, s.name, s.id_hint, s.source, s.confidence, s.origin) == (
        7.5, "Pond A", "My Pond!", "S", "documented", "hand")
    multi = _feature(MultiPolygon([square(0, 0, 50), square(100, 0, 50)]))
    assert len(hand_pond_specs([multi], path="x")) == 2


@pytest.mark.parametrize("bad", ["high", float("nan"), True, None])
def test_hand_pond_bad_level_is_an_error_naming_the_file(bad):
    f = _feature(square(0, 0, 100), level_m=bad)
    if bad is None:  # absent / null means "use the DEM median"
        assert hand_pond_specs([f], path="p.geojson")[0].level_m is None
        return
    with pytest.raises(ValueError, match="p.geojson"):
        hand_pond_specs([f], path="p.geojson")


# ----------------------------------------------------------- levels, ids, drops


def test_level_is_the_median_of_the_raw_dem_ignoring_nan():
    dem = flat(5.0)
    dem[10:20, 10:20] = 9.0
    dem[10, 10:20] = np.nan  # voids are ignored
    (p,) = build_ponds([spec(square(100, 200, 100))], dem, GRID, log=lambda m: None)
    # square(100,200,100) covers cols 10..19, rows 40-20-10=10..19 (north-up) -> all 9.0
    assert p.level_m == 9.0
    assert p.mask.sum() == 100


def test_explicit_level_wins_and_is_rounded_to_a_centimetre():
    (p,) = build_ponds([spec(square(100, 100, 100), level=6.2345)], flat(), GRID,
                       log=lambda m: None)
    assert p.level_m == 6.23


def test_median_not_mean():
    dem = flat(3.0)
    dem[10:20, 10:12] = 50.0  # 20 high cells of 100
    (p,) = build_ponds([spec(square(100, 200, 100))], dem, GRID, log=lambda m: None)
    assert p.level_m == 3.0


def test_tiny_polygons_are_dropped_with_a_note():
    notes = []
    ponds = build_ponds(
        [spec(square(100, 100, 100), name="Big"),
         spec(square(300, 300, 8), name="Tiny")],  # 8 m square: 1 cell centre
        flat(), GRID, log=notes.append)
    assert [p.name for p in ponds] == ["Big"]
    assert len(notes) == 1 and "Tiny" in notes[0] and "4" in notes[0]
    # exactly 4 cells is kept
    ponds = build_ponds([spec(square(100, 100, 20))], flat(), GRID, log=lambda m: None)
    assert len(ponds) == 1 and ponds[0].mask.sum() == 4


def test_no_elevation_and_no_level_is_a_clear_error_for_hand_ponds_but_drops_sfei():
    dem = np.full((GRID.height, GRID.width), np.nan, dtype="float32")
    with pytest.raises(ValueError, match="level_m"):
        build_ponds([spec(square(100, 100, 100), name="Hand")], dem, GRID, log=lambda m: None)
    notes = []
    out = build_ponds([spec(square(100, 100, 100), origin="sfei", class_name="Other pond or lake",
                            confidence="documented")], dem, GRID, log=notes.append)
    assert out == [] and "level_m" in notes[0] or "elevation" in notes[0]


def test_ids_are_unique_deterministic_and_independent_of_input_order():
    specs = [
        spec(square(300, 100, 60), origin="sfei", class_name="Dune-dammed pond or lake"),
        spec(square(100, 100, 60), origin="sfei", class_name="Dune-dammed pond or lake"),
        spec(square(100, 300, 60), name="Lake Merced (north)"),
        spec(square(250, 300, 60), name="Lake Merced (north)"),  # duplicate name
        spec(square(100, 200, 60), id_hint="My Pond"),
        spec(square(250, 200, 60)),  # hand, no name: from provenance? -> generic id
    ]
    a = build_ponds(specs, flat(), GRID, log=lambda m: None)
    b = build_ponds(specs[::-1], flat(), GRID, log=lambda m: None)
    ids = [p.id for p in a]
    assert ids == sorted(ids) and len(set(ids)) == len(ids)
    assert ids == [p.id for p in b]
    assert "dune-dammed-pond-or-lake-1" in ids and "dune-dammed-pond-or-lake-2" in ids
    # west-to-east numbering of the class
    by_id = {p.id: p for p in a}
    assert by_id["dune-dammed-pond-or-lake-1"].geometry.bounds[0] < \
        by_id["dune-dammed-pond-or-lake-2"].geometry.bounds[0]
    assert "my-pond" in ids
    assert "lake-merced-north-1" in ids and "lake-merced-north-2" in ids
    assert "pond-1" in ids  # nameless hand pond
    # a unique name needs no suffix
    solo = build_ponds([spec(square(100, 100, 60), name="Mountain Lake")], flat(), GRID,
                       log=lambda m: None)
    assert solo[0].id == "mountain-lake"


def test_overlapping_ponds_own_disjoint_cells_hand_beats_sfei():
    sfei = spec(square(100, 100, 100), origin="sfei", class_name="Other pond or lake")
    hand = spec(square(150, 100, 100), name="Hand")
    ponds = {p.name or p.class_name: p for p in build_ponds([sfei, hand], flat(), GRID,
                                                            log=lambda m: None)}
    a, b = ponds["Other pond or lake"].mask, ponds["Hand"].mask
    assert not (a & b).any()
    assert b.sum() == 100 and a.sum() == 50


# ----------------------------------------------------------------- carving


def _one_pond(size=200, level=5.0, dem=None, **kw):
    dem = flat(8.0) if dem is None else dem
    (p,) = build_ponds([spec(square(100, 100, size), level=level)], dem, GRID, log=lambda m: None)
    return dem, p


def test_carving_profile_is_deepest_inside_and_zero_depth_at_the_shore():
    dem, p = _one_pond()
    out = carve_ponds(dem, [p], cell_m=10, max_depth_m=2.0, shelf_m=20.0)
    m = p.mask
    depth = np.where(m, 5.0 - out, 0.0)
    assert out.dtype == np.float32
    # Outside: untouched
    assert (out[~m] == dem[~m]).all()
    # Never above the water level; bounded by max depth
    assert depth[m].min() > 0 and depth[m].max() <= 2.0 + 1e-6
    # Centre is at full depth (more than shelf_m from every shore)
    r, c = np.argwhere(m).mean(axis=0).astype(int)
    assert depth[r, c] == pytest.approx(2.0, abs=1e-5)
    # Edge cell is the shallowest: half a cell (5 m) from the true shoreline
    padded = np.pad(m, 1)
    touches_land = ~(padded[:-2, 1:-1] & padded[2:, 1:-1] & padded[1:-1, :-2] & padded[1:-1, 2:])
    edge = m & touches_land
    t = 5.0 / 20.0
    expected_edge = 2.0 * t * t * (3 - 2 * t)
    assert depth[edge].max() == pytest.approx(expected_edge, abs=1e-5)
    # Monotonic ramp inwards along the middle row
    row = depth[r, m[r]]
    half = row[: len(row) // 2]
    assert (np.diff(half) >= -1e-9).all()


def test_flat_when_shelf_is_zero_and_pond_at_grid_edge_has_no_fake_shore():
    dem, p = _one_pond()
    out = carve_ponds(dem, [p], 10, 2.0, 0.0)
    assert np.allclose(out[p.mask], 3.0)
    # A pond running off the grid edge: the grid border is not a shore.
    (q,) = build_ponds([spec(box(500000 - 100, 4180000 + 100, 500000 + 100, 4180000 + 300),
                             level=5.0)], flat(8.0), GRID, log=lambda m: None)
    out = carve_ponds(flat(8.0), [q], 10, 2.0, 20.0)
    assert out[20, 0] == pytest.approx(3.0, abs=1e-5)  # on the border column, in the middle


def test_whole_grid_pond_is_full_depth():
    (p,) = build_ponds([spec(box(499000, 4179000, 501000, 4181000), level=5.0)], flat(), GRID,
                       log=lambda m: None)
    out = carve_ponds(flat(), [p], 10, 2.0, 20.0)
    assert np.allclose(out, 3.0)


def test_pond_mask_union():
    _, p = _one_pond()
    assert pond_mask([p], (GRID.height, GRID.width)).sum() == p.mask.sum()
    assert not pond_mask([], (GRID.height, GRID.width)).any()


# ----------------------------------------------------------------- JSON


def test_ponds_document_structure_world_coordinates_and_ordering():
    # A pond centred on the grid centre: world coordinates must straddle (0, 0).
    cx, cy = 500200, 4180200
    hole = Polygon([(cx - 20, cy - 20), (cx + 20, cy - 20), (cx + 20, cy + 20), (cx - 20, cy + 20)])
    big = box(cx - 100, cy - 100, cx + 100, cy + 100).difference(hole)
    (p2,) = build_ponds([spec(square(20, 20, 60), name="B pond", source="S2", confidence="illustrative",
                              level=7.04)], flat(), GRID, log=lambda m: None)
    (p1,) = build_ponds([spec(big, name="A pond", level=5.6)], flat(), GRID, log=lambda m: None)
    doc = ponds_document([p2, p1], GRID, {"max_depth_m": 2.0})
    assert doc["version"] == 1 and doc["processing"] == {"max_depth_m": 2.0}
    assert [q["id"] for q in doc["ponds"]] == ["a-pond", "b-pond"]  # sorted by id
    a = doc["ponds"][0]
    assert set(a) == {"id", "name", "level_m", "source", "confidence", "rings"}
    assert a["name"] == "A pond" and a["level_m"] == 5.6
    assert (a["source"], a["confidence"]) == ("a sheet", "inferred")
    assert len(a["rings"]) == 2  # outer + hole
    outer, inner = a["rings"]
    xs, zs = outer[0::2], outer[1::2]
    assert len(outer) % 2 == 0 and min(xs) == -100.0 and max(xs) == 100.0
    assert min(zs) == -100.0 and max(zs) == 100.0
    assert max(abs(v) for v in inner) == 20.0
    # Rings are open (first point not repeated), values rounded to 0.1.
    assert (outer[0], outer[1]) != (outer[-2], outer[-1])
    assert all(round(v, 1) == v for v in outer + inner)
    # Round trip: the cell-centre of the grid maps near (0, 0) in world metres
    x, z = world_xz(GRID, cx, cy)
    assert (x, z) == (0.0, 0.0)
    # z points south: a northern vertex has NEGATIVE z.
    assert min(zs) == -100.0
    json.dumps(doc)  # serialisable
    b = doc["ponds"][1]
    assert b["confidence"] == "illustrative" and b["level_m"] == 7.04 and b["source"] == "S2"


def test_ponds_document_is_deterministic_and_null_name():
    ponds = build_ponds([spec(square(100, 100, 60), origin="sfei", class_name="Other pond or lake")],
                        flat(), GRID, log=lambda m: None)
    a = json.dumps(ponds_document(ponds, GRID, {}), sort_keys=True)
    b = json.dumps(ponds_document(list(reversed(ponds)), GRID, {}), sort_keys=True)
    assert a == b
    assert ponds_document(ponds, GRID, {})["ponds"][0]["name"] is None


# --------------------------------------------------------- provenance, habitat


def test_provenance_rows_and_layer():
    ponds = build_ponds([
        spec(square(100, 100, 60), origin="sfei", class_name="Other pond or lake",
             source="SFEI Hidden Nature SF habitat class 'Other pond or lake'",
             confidence="documented"),
        spec(square(250, 100, 60), name="H1", source="Sheet A", confidence="inferred"),
        spec(square(250, 200, 60), name="H2", source="Sheet A", confidence="inferred"),
    ], flat(), GRID, log=lambda m: None)
    rows = pond_provenance_rows(ponds)
    assert rows == [
        {"layer": "ponds", "source": "SFEI Hidden Nature SF habitat class 'Other pond or lake'",
         "confidence": "documented", "count": 1},
        {"layer": "ponds", "source": "Sheet A", "confidence": "inferred", "count": 2},
    ]
    layer = pond_layer(ponds)
    assert layer.id == "ponds" and layer.confidence == "inferred"  # the lowest
    assert "3 freshwater ponds" in layer.source and "Sheet A" in layer.source and len(layer.source) <= 300
    assert pond_layer([]) is None


def test_stamp_ponds_on_habitat_sfei_keeps_its_class_hand_gets_the_synthetic_id():
    legend = [{"id": 0, "name": "Unmapped", "group": "unmapped"},
              {"id": 7, "name": "Other pond or lake", "group": "water"},
              {"id": 9, "name": "Beach", "group": "beach"}]
    ponds = build_ponds([
        spec(square(100, 100, 60), origin="sfei", class_name="Other pond or lake"),
        spec(square(250, 100, 60), name="Hand"),
    ], flat(), GRID, log=lambda m: None)
    habitat = np.full((GRID.height, GRID.width), 9, dtype=np.uint8)  # beach everywhere
    out = stamp_ponds_on_habitat(habitat, legend, ponds)
    assert out is not habitat and (habitat == 9).all()
    sfei = next(p for p in ponds if p.origin == "sfei")
    hand = next(p for p in ponds if p.origin == "hand")
    assert (out[sfei.mask] == 7).all() and (out[hand.mask] == ID_HAND_POND).all()
    assert (out[~(sfei.mask | hand.mask)] == 9).all()


# ------------------------------------------------------------- pond banks

from yelamu.ponds import DEFAULT_BANK_M, DEFAULT_BANK_SLOPE, blend_pond_banks  # noqa: E402

LAND_ALL = np.ones((GRID.height, GRID.width), dtype=bool)


def _pond(x0, y0, size, level):
    (p,) = build_ponds([spec(square(x0, y0, size), level=level)], flat(), GRID, log=lambda m: None)
    return p


def _carved(dem, ponds):
    return carve_ponds(dem, ponds, 10, 2.0, 20.0)


def test_defaults():
    assert DEFAULT_BANK_SLOPE == 0.35 and DEFAULT_BANK_M == 200.0


def test_a_wall_beside_a_pond_becomes_a_ramp():
    p = _pond(100, 100, 100, 5.0)  # cols 10..19, rows 20..29
    dem = _carved(flat(19.0), [p])  # 14 m of ground above the water level around it
    assert np.abs(np.diff(dem[24, 0:12])).max() > 10  # the wall exists before
    out = blend_pond_banks(dem, GRID, [p], LAND_ALL, 0.35, 200)
    # Pond cells and their bed are untouched.
    assert (out[p.mask] == dem[p.mask]).all()
    # Ramp: no step between adjacent cells (any direction) exceeds slope * cell, plus the
    # small shore-cell allowance, anywhere within 100 m of the pond.
    near = ndimage_dilate(p.mask, 10)
    for axis in (0, 1):
        step = np.abs(np.diff(out, axis=axis))
        both = np.take(near, range(1, near.shape[axis]), axis=axis) | np.take(
            near, range(0, near.shape[axis] - 1), axis=axis)
        assert step[both].max() <= 0.35 * 10 + 0.5
    # First land cell is level + slope * half a cell; the ramp then climbs 3.5 m per cell.
    assert out[24, 9] == pytest.approx(5.0 + 0.35 * 5.0, abs=1e-4)
    assert out[24, 8] == pytest.approx(5.0 + 0.35 * 15.0, abs=1e-4)
    # Far from the pond the ground is back to its original height (ramp reached 19 m).
    assert out[24, 0] == 19.0 and out[5, 5] == 19.0


def ndimage_dilate(mask, cells):
    from scipy import ndimage
    return ndimage.binary_dilation(mask, iterations=cells)


def test_a_dam_is_raised_into_an_embankment():
    p = _pond(100, 100, 100, 30.0)
    dem = _carved(flat(5.0), [p])  # a lake perched on 5 m ground
    out = blend_pond_banks(dem, GRID, [p], LAND_ALL, 0.35, 200)
    assert out[24, 9] == pytest.approx(30.0 - 0.35 * 5.0, abs=1e-4)
    assert out[24, 8] == pytest.approx(30.0 - 0.35 * 15.0, abs=1e-4)
    # ...until the embankment meets the real ground: 25 m / 0.35 = ~71 m
    assert out[24, 0] == 5.0
    assert (out[~p.mask] >= dem[~p.mask]).all()  # only ever raised here


def test_unchanged_beyond_bank_m_and_when_terrain_is_already_gentle():
    p = _pond(100, 100, 100, 5.0)
    wall = _carved(flat(100.0), [p])
    out = blend_pond_banks(wall, GRID, [p], LAND_ALL, 0.35, 50)
    from scipy import ndimage
    dist_cells = ndimage.distance_transform_edt(~p.mask)
    far = dist_cells - 0.5 > 5.0  # more than bank_m = 50 m from the shore
    assert far.any() and (out[far] == wall[far]).all()
    assert (out[(dist_cells - 0.5 <= 5.0) & ~p.mask] != wall[(dist_cells - 0.5 <= 5.0) & ~p.mask]).any()
    # Already gentler than the bank slope: nothing changes.
    gentle = _carved(flat(5.0), [p])
    assert (blend_pond_banks(gentle, GRID, [p], LAND_ALL, 0.35, 200) == gentle).all()


def test_slope_zero_disables_and_input_is_not_modified():
    p = _pond(100, 100, 100, 5.0)
    dem = _carved(flat(19.0), [p])
    before = dem.copy()
    assert (blend_pond_banks(dem, GRID, [p], LAND_ALL, 0.0, 200) == dem).all()
    assert (blend_pond_banks(dem, GRID, [], LAND_ALL, 0.35, 200) == dem).all()
    blend_pond_banks(dem, GRID, [p], LAND_ALL, 0.35, 200)
    assert (dem == before).all()


def test_non_land_cells_next_to_a_pond_are_untouched():
    p = _pond(200, 100, 100, 5.0)  # cols 20..29
    dem = _carved(flat(19.0), [p])
    land = LAND_ALL.copy()
    land[:, 10:20] = False  # a bay/marsh strip touching the pond's west shore
    dem[:, 10:20] = -3.0
    out = blend_pond_banks(dem, GRID, [p], land, 0.35, 200)
    assert (out[:, 10:20] == -3.0).all()
    assert out[24, 30] != 19.0  # land on the east side is still graded


def test_two_ponds_nearest_wins():
    a = _pond(50, 100, 50, 5.0)  # cols 5..9, rows 25..29
    b = _pond(250, 100, 50, 30.0)  # cols 25..29
    dem = _carved(flat(100.0), [a, b])
    out = blend_pond_banks(dem, GRID, [a, b], LAND_ALL, 0.35, 400)
    # Row 27, col 12 is 3 cells east of A's shore cell: d = (3 - 0.5) * 10 = 25 m, A's level.
    assert out[27, 12] == pytest.approx(5.0 + 0.35 * 25.0, abs=1e-4)
    # Col 22 is 3 cells west of B: B's level.
    assert out[27, 22] == pytest.approx(30.0 + 0.35 * 25.0, abs=1e-4)
    # A low cell nearer B than A is lifted to B's embankment, not A's.
    dem2 = _carved(flat(0.0), [a, b])
    out2 = blend_pond_banks(dem2, GRID, [a, b], LAND_ALL, 0.35, 400)
    assert out2[27, 22] == pytest.approx(30.0 - 0.35 * 25.0, abs=1e-4)
    assert out2[27, 12] == pytest.approx(0.0, abs=1e-4) or out2[27, 12] >= 5.0 - 0.35 * 25.0 - 1e-4


def test_blend_is_deterministic_and_independent_of_pond_order():
    a = _pond(50, 100, 50, 5.0)
    b = _pond(250, 100, 50, 30.0)
    rng = np.random.default_rng(0)
    dem = _carved(rng.uniform(0, 60, (GRID.height, GRID.width)).astype("float32"), [a, b])
    one = blend_pond_banks(dem, GRID, [a, b], LAND_ALL)
    two = blend_pond_banks(dem, GRID, [b, a], LAND_ALL)
    assert (one == two).all() and (one == blend_pond_banks(dem, GRID, [a, b], LAND_ALL)).all()
```

`pipeline/tests/test_pipeline.py` (modified; one assertion that the id shift in this task changes)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/pipeline/tests/test_pipeline.py
+++ b/pipeline/tests/test_pipeline.py
@@ -637,7 +637,7 @@
     assert (out / "habitat.u8").stat().st_size == meta["width"] * meta["height"]
     assert meta["habitat_file"] == "habitat.u8"
     ids = {e["name"]: e["id"] for e in meta["habitat_classes"]}
-    assert (ids["Coast live oak woodland"], ids["Weird thing"]) == (4, 5)  # sorted-name ids
+    assert (ids["Coast live oak woodland"], ids["Weird thing"]) == (5, 6)  # sorted-name ids
     woodland = ids["Coast live oak woodland"]
     raster = _habitat(out, meta)
     # --habitats is the coverage too: the unmapped, low (0 m) north-east is gap-filled bay.
PATCH
```

`pipeline/tests/test_habitat.py` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/pipeline/tests/test_habitat.py
+++ b/pipeline/tests/test_habitat.py
@@ -9,6 +9,7 @@
     GROUP_BY_CLASS,
     ID_HAND_BAY,
     ID_HAND_MARSH,
+    ID_HAND_POND,
     ID_OPEN_BAY_INFERRED,
     ID_UNMAPPED,
     apply_overrides,
@@ -87,7 +88,8 @@
 
 
 def test_synthetic_ids_are_fixed():
-    assert (ID_UNMAPPED, ID_OPEN_BAY_INFERRED, ID_HAND_BAY, ID_HAND_MARSH) == (0, 1, 2, 3)
+    assert (ID_UNMAPPED, ID_OPEN_BAY_INFERRED, ID_HAND_BAY, ID_HAND_MARSH, ID_HAND_POND) == (
+        0, 1, 2, 3, 4)
 
 
 # --------------------------------------------------------------- rasterising ---
@@ -104,14 +106,15 @@
         {"id": 1, "name": "Open bay (inferred from modern elevation)", "group": "water"},
         {"id": 2, "name": "Bay (hand-drawn)", "group": "water"},
         {"id": 3, "name": "Marsh (hand-drawn)", "group": "marsh"},
-        {"id": 4, "name": "Beach", "group": "beach"},
-        {"id": 5, "name": "Coast live oak woodland", "group": "woodland"},
-        {"id": 6, "name": "Mystery class", "group": "unmapped"},
-        {"id": 7, "name": "Tidal marsh", "group": "marsh"},
+        {"id": 4, "name": "Pond (hand-drawn)", "group": "water"},
+        {"id": 5, "name": "Beach", "group": "beach"},
+        {"id": 6, "name": "Coast live oak woodland", "group": "woodland"},
+        {"id": 7, "name": "Mystery class", "group": "unmapped"},
+        {"id": 8, "name": "Tidal marsh", "group": "marsh"},
     ]
-    assert raster[_cell(grid, -122.410, 37.78)] == 7  # marsh
-    assert raster[_cell(grid, -122.3975, 37.78)] == 5  # woodland only
-    assert raster[_cell(grid, -122.3825, 37.78)] == 6  # unknown class keeps its own id
+    assert raster[_cell(grid, -122.410, 37.78)] == 8  # marsh
+    assert raster[_cell(grid, -122.3975, 37.78)] == 6  # woodland only
+    assert raster[_cell(grid, -122.3825, 37.78)] == 7  # unknown class keeps its own id
     assert raster[_cell(grid, -122.377, 37.78)] == 0  # blank/null-class features skipped
     assert raster[_cell(grid, -122.372, 37.78)] == 0  # nothing mapped
     # Only classes with at least one usable polygon appear in the legend.
@@ -144,7 +147,7 @@
             "features": [_feat("Beach", _rect(-122.41, 37.77, -122.40, 37.78), field="Cls")]}
     raster, legend, _ = rasterize_habitats(coll, grid, field="Cls")
     assert [e["name"] for e in legend][-1] == "Beach"
-    assert raster[_cell(grid, -122.405, 37.775)] == 4
+    assert raster[_cell(grid, -122.405, 37.775)] == 5
 
 
 def test_multipolygon_and_invalid_polygon_are_handled():
@@ -169,16 +172,16 @@
     raster, legend, unknown = rasterize_habitats(
         {"type": "FeatureCollection", "features": []}, grid)
     assert not raster.any() and unknown == []
-    assert [e["id"] for e in legend] == [0, 1, 2, 3]
-
-
-def test_more_than_251_classes_is_an_error():
-    grid = _grid()
-    feats = [_feat(f"class {i:03d}", _rect(-122.41, 37.77, -122.40, 37.78)) for i in range(252)]
-    with pytest.raises(ValueError, match="251"):
+    assert [e["id"] for e in legend] == [0, 1, 2, 3, 4]
+
+
+def test_more_than_250_classes_is_an_error():
+    grid = _grid()
+    feats = [_feat(f"class {i:03d}", _rect(-122.41, 37.77, -122.40, 37.78)) for i in range(251)]
+    with pytest.raises(ValueError, match="250"):
         rasterize_habitats({"type": "FeatureCollection", "features": feats}, grid)
     ok, legend, _ = rasterize_habitats(
-        {"type": "FeatureCollection", "features": feats[:251]}, grid)
+        {"type": "FeatureCollection", "features": feats[:250]}, grid)
     assert len(legend) == 255 and ok.max() == 254
 
 
@@ -211,3 +214,4 @@
     habitat = np.zeros((2, 2), dtype=np.uint8)
     out = apply_overrides(habitat, None, None, np.array([[1, 0], [0, 0]], dtype=bool))
     assert out.tolist() == [[ID_HAND_MARSH, 0], [0, 0]]
+
PATCH
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd pipeline && uv run pytest tests/test_ponds.py tests/test_habitat.py -q`

Expected: **FAIL** (the code under test does not exist yet, or the new assertions do not hold yet).

- [ ] **Step 3: Write the implementation**

`pipeline/yelamu/ponds.py`

```python
"""Freshwater ponds and lakes: polygons with a flat water level, carved into the terrain.

A pond is one polygon plus a water level. Sources:

  * SFEI habitat polygons whose HabitatCla is in `pond_classes` (documented);
  * `hand_ponds` GeoJSON files (provenance required; optional feature properties
    `level_m` (number), `name` and `id`).

Level: the `level_m` property if given, else the MEDIAN of the RAW modern DEM inside the
polygon (a lake surface is flat; the median shrugs off shore and building outliers).
Carving: the bed inside the polygon is set to `level_m - depth`, where depth ramps with a
smoothstep from 0 at the shoreline to `max_depth_m` over `shelf_m` metres of distance
from the shore. The bed is OVERWRITTEN (not min'd with the old ground): a pond bed
is a function of its polygon and level alone. Ponds are applied last (after the water
edits, the land ramp and the bay shelf) and are not touched by the land ramp or smoothing.

`ponds.json` (next to heightmap.u16) holds the polygons in the overlay's WORLD metres.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Sequence

import numpy as np
from scipy import ndimage
from shapely.geometry import Polygon
from shapely.geometry.polygon import orient

from yelamu.export import Layer
from yelamu.geo import Grid
from yelamu.habitat import ID_HAND_POND, _class_name
from yelamu.provenance import hand_source_rows, layer_source_summary, lowest_confidence
from yelamu.sources import Feature, _polygonal_parts, geometry_to_utm_polygons
from yelamu.water import water_mask

PONDS_VERSION = 1
PONDS_FILE = "ponds.json"
DEFAULT_POND_CLASSES: tuple[str, ...] = (
    "Dune-dammed pond or lake",
    "Dune-dammed headwater lake",
    "Barrier beach-impounded freshwater lagoon",
    "Other pond or lake",
)  # 'Tidal coastal lagoon' is deliberately not here: the owner decides later
MIN_POND_CELLS = 4
DEFAULT_MAX_DEPTH_M = 2.0
DEFAULT_SHELF_M = 20.0
DEFAULT_BANK_SLOPE = 0.35
DEFAULT_BANK_M = 200.0


def slugify(text: str) -> str:
    """Lower-case ASCII slug ('Lake Merced (north)' -> 'lake-merced-north'); 'pond' if empty."""
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "pond"


@dataclass(frozen=True)
class PondSpec:
    """A pond candidate before it meets the grid."""

    geometry: Polygon  # UTM metres
    origin: str  # "sfei" or "hand"
    source: str
    confidence: str
    class_name: str | None = None  # SFEI HabitatCla
    name: str | None = None
    id_hint: str | None = None
    level_m: float | None = None


@dataclass(frozen=True, eq=False)
class Pond:
    id: str
    name: str | None
    level_m: float  # rounded to 0.01 m
    source: str
    confidence: str
    origin: str
    class_name: str | None
    geometry: Polygon
    mask: np.ndarray = field(repr=False)  # cells owned by this pond (disjoint across ponds)


# ------------------------------------------------------------------ candidates


def sfei_pond_specs(
    collection: dict, pond_classes: Iterable[str], field_name: str = "HabitatCla"
) -> list[PondSpec]:
    """Every polygon of an SFEI feature whose class is in `pond_classes` (documented)."""
    wanted = set(pond_classes)
    specs: list[PondSpec] = []
    for feature in collection.get("features", []):
        cls = _class_name(feature, field_name)
        if cls is None or cls not in wanted:
            continue
        for poly in geometry_to_utm_polygons(feature.get("geometry")):
            specs.append(PondSpec(
                geometry=poly, origin="sfei", class_name=cls, confidence="documented",
                source=f"SFEI Hidden Nature SF habitat class '{cls}'"))
    return specs


def hand_pond_specs(features: Sequence[Feature], path: Any) -> list[PondSpec]:
    """One spec per polygon of each hand-drawn feature (provenance already checked)."""
    specs: list[PondSpec] = []
    for feature in features:
        props = feature.properties
        level = props.get("level_m")
        if level is not None and (
            isinstance(level, bool) or not isinstance(level, (int, float)) or not math.isfinite(level)
        ):
            raise ValueError(
                f"{path}: feature {feature.index}: level_m must be a number (metres), "
                f"got {level!r}"
            )
        raw_id = props.get("id")
        for poly in feature.polygons:
            specs.append(PondSpec(
                geometry=poly, origin="hand", source=feature.source or "",
                confidence=feature.confidence or "illustrative",
                name=feature.name,
                id_hint=raw_id.strip() if isinstance(raw_id, str) and raw_id.strip() else None,
                level_m=None if level is None else float(level)))
    return specs


# --------------------------------------------------------------------- building


def _assign_ids(items: list[tuple[PondSpec, np.ndarray]]) -> list[str]:
    """Deterministic, unique ids for the surviving specs (same order as `items`)."""
    def base_of(spec: PondSpec) -> tuple[str, bool]:
        if spec.id_hint:
            return slugify(spec.id_hint), True
        if spec.name:
            return slugify(spec.name), True
        return slugify(spec.class_name or "pond"), False

    def position(spec: PondSpec) -> tuple[float, float]:
        c = spec.geometry.centroid
        return (round(c.x, 1), round(c.y, 1))

    groups: dict[str, list[int]] = {}
    explicit: dict[str, bool] = {}
    for i, (spec, _) in enumerate(items):
        base, is_explicit = base_of(spec)
        groups.setdefault(base, []).append(i)
        explicit[base] = explicit.get(base, True) and is_explicit

    ids: list[str | None] = [None] * len(items)
    for base, members in sorted(groups.items()):
        members.sort(key=lambda i: (position(items[i][0]), items[i][0].geometry.area))
        needs_index = len(members) > 1 or not explicit[base]
        for n, i in enumerate(members, start=1):
            ids[i] = f"{base}-{n}" if needs_index else base
    used: set[str] = set()
    for i, candidate in enumerate(ids):
        assert candidate is not None
        unique, k = candidate, 1
        while unique in used:  # a name that already looks like another pond's id
            k += 1
            unique = f"{candidate}-{k}"
        used.add(unique)
        ids[i] = unique
    return [i for i in ids if i is not None]


def build_ponds(
    specs: Sequence[PondSpec],
    raw_dem: np.ndarray,
    grid: Grid,
    min_cells: int = MIN_POND_CELLS,
    log: Callable[[str], None] = print,
) -> list[Pond]:
    """Resolve candidates against the grid: masks, levels, ids; sorted by id.

    Polygons covering fewer than `min_cells` cell centres are dropped with a note via
    `log`. The level is level_m if given, else the median of the non-NaN raw DEM under the
    polygon, rounded to 0.01 m; with neither (all NaN) a hand pond raises ValueError and an
    SFEI pond is dropped with a note. Where ponds overlap, a hand pond wins over an SFEI one and
    otherwise the pond with the earlier id owns the cell, so the masks are disjoint.
    """
    raw_dem = np.asarray(raw_dem)
    kept: list[tuple[PondSpec, np.ndarray]] = []
    for spec in specs:
        label = spec.name or spec.id_hint or spec.class_name or "pond"
        mask = water_mask([spec.geometry], grid)
        n = int(mask.sum())
        if n < min_cells:
            c = spec.geometry.centroid
            log(f"Dropped pond '{label}' near UTM ({c.x:.0f}, {c.y:.0f}): it covers {n} "
                f"cell(s), fewer than {min_cells}")
            continue
        kept.append((spec, mask))

    ids = _assign_ids(kept)
    resolved: list[tuple[str, PondSpec, np.ndarray, float]] = []
    for pid, (spec, mask) in zip(ids, kept):
        if spec.level_m is not None:
            level = spec.level_m
        else:
            values = raw_dem[mask]
            values = values[~np.isnan(values)]
            if values.size == 0:
                msg = (f"pond '{pid}' has no elevation data under it in the DEM; give the "
                       "polygon a level_m property (metres)")
                if spec.origin == "hand":
                    raise ValueError(msg)
                log(f"Dropped {msg}")
                continue
            level = float(np.median(values))
        resolved.append((pid, spec, mask, round(level, 2)))

    # Disjoint ownership of cells: hand ponds first, then by id.
    resolved.sort(key=lambda r: (r[1].origin != "hand", r[0]))
    claimed = np.zeros((grid.height, grid.width), dtype=bool)
    ponds: list[Pond] = []
    for pid, spec, mask, level in resolved:
        own = mask & ~claimed
        claimed |= own
        if not own.any():
            log(f"Dropped pond '{pid}': every cell is already owned by another pond")
            continue
        ponds.append(Pond(
            id=pid, name=spec.name, level_m=level, source=spec.source,
            confidence=spec.confidence, origin=spec.origin, class_name=spec.class_name,
            geometry=spec.geometry, mask=own))
    return sorted(ponds, key=lambda p: p.id)


# ----------------------------------------------------------------------- terrain


def pond_mask(ponds: Sequence[Pond], shape: tuple[int, int]) -> np.ndarray:
    """True on every cell owned by any pond."""
    out = np.zeros(shape, dtype=bool)
    for p in ponds:
        out |= p.mask
    return out


def carve_ponds(
    dem: np.ndarray,
    ponds: Sequence[Pond],
    cell_m: float,
    max_depth_m: float = DEFAULT_MAX_DEPTH_M,
    shelf_m: float = DEFAULT_SHELF_M,
) -> np.ndarray:
    """A copy of dem with each pond bed set to level_m - depth.

    depth = max_depth_m * smoothstep(clip(d / shelf_m, 0, 1)) where d is the distance
    (metres) from the cell centre to the shoreline, taken half a cell beyond the nearest
    non-pond cell centre, so d = 0 on the shore and a shore cell is a little under the
    surface. The edge of the GRID is not a shore (a pond running off the map keeps its
    depth). shelf_m <= 0 gives a flat bed at full depth. Cells outside every pond are
    unchanged.
    """
    out = np.asarray(dem, dtype="float32").copy()
    for p in ponds:
        m = p.mask
        if not m.any():
            continue
        if shelf_m <= 0 or m.all():
            depth = np.full(int(m.sum()), max_depth_m)
        else:
            edt = ndimage.distance_transform_edt(m)
            d = np.maximum(edt[m] - 0.5, 0.0) * cell_m
            t = np.clip(d / shelf_m, 0.0, 1.0)
            depth = max_depth_m * t * t * (3.0 - 2.0 * t)
        out[m] = (p.level_m - depth).astype("float32")
    return out


def blend_pond_banks(
    heights_m: np.ndarray,
    grid: Grid,
    ponds: Sequence[Pond],
    land_mask: np.ndarray,
    bank_slope: float = DEFAULT_BANK_SLOPE,
    bank_m: float = DEFAULT_BANK_M,
) -> np.ndarray:
    """Grade the ground around ponds so there is no wall or dam at the shore.

    Carving sets the bed from the polygon and level alone, so a pond cut into a hillside
    leaves a cliff and a pond on low ground sits on it like a dam. For every cell that is
    LAND (`land_mask`), outside every pond, and within `bank_m` metres of one, with d the
    distance in metres from the nearest pond cell (measured half a cell short, so d is ~0 on
    the shoreline) and `level` that nearest pond's level_m:

        h' = clip(h, level - bank_slope * d, level + bank_slope * d)

    which lowers a wall into a ramp of at most bank_slope metres per metre and raises low
    ground under a dam into an embankment. Ground already gentler than that is unchanged.
    Pond cells, non-land (bay / marsh / gap-filled water) cells and cells beyond bank_m are
    never touched, nor are the pond beds and level_m. bank_slope <= 0 or no ponds returns an
    unchanged copy. Call it right after carve_ponds.
    """
    out = np.asarray(heights_m, dtype="float32").copy()
    if bank_slope <= 0 or not ponds:
        return out
    union = pond_mask(ponds, out.shape)
    if not union.any() or union.all():
        return out
    level_map = np.zeros(out.shape, dtype="float64")
    for p in ponds:
        level_map[p.mask] = p.level_m
    edt, (ri, ci) = ndimage.distance_transform_edt(~union, return_indices=True)
    d = np.maximum(edt - 0.5, 0.0) * grid.cell
    zone = np.asarray(land_mask, dtype=bool) & ~union & (d <= bank_m)
    level = level_map[ri, ci]
    lo = level - bank_slope * d
    hi = level + bank_slope * d
    out[zone] = np.clip(out[zone].astype("float64"), lo[zone], hi[zone]).astype("float32")
    return out


def stamp_ponds_on_habitat(
    habitat: np.ndarray, legend: Sequence[dict], ponds: Sequence[Pond]
) -> np.ndarray:
    """A copy of the habitat raster where pond cells carry the pond's class.

    SFEI ponds get their own SFEI class id (looked up by name in `legend`); hand-drawn
    ponds get the synthetic ID_HAND_POND. Applied last, so the raster agrees with the
    terrain wherever a pond was carved.
    """
    ids = {e["name"]: e["id"] for e in legend}
    out = np.array(habitat, dtype=np.uint8, copy=True)
    for p in ponds:
        if p.origin == "hand":
            out[p.mask] = ID_HAND_POND
        else:
            if p.class_name not in ids:
                raise ValueError(f"pond '{p.id}': class {p.class_name!r} is not in the habitat legend")
            out[p.mask] = ids[p.class_name]
    return out


# -------------------------------------------------------------------- export


def _ring_flat(coords: Sequence[tuple[float, float]], grid: Grid) -> list[float]:
    cx = (grid.west + grid.east) / 2.0
    cz = (grid.north + grid.south) / 2.0
    flat: list[float] = []
    prev: tuple[float, float] | None = None
    pts = list(coords)[:-1]  # drop the closing duplicate
    for x, y in pts:
        pt = (round(x - cx, 1) + 0.0, round(cz - y, 1) + 0.0)
        if pt != prev:
            flat.extend(pt)
            prev = pt
    if len(flat) >= 4 and (flat[0], flat[1]) == (flat[-2], flat[-1]):
        del flat[-2:]
    if len(flat) < 6:
        raise ValueError("a pond ring collapsed to fewer than 3 points after rounding")
    return flat


def ponds_document(ponds: Sequence[Pond], grid: Grid, processing: dict) -> dict:
    """The ponds.json dict: rings in viewer world metres (x east, z south, origin at the
    grid centre, as overlay.json), rounded to 0.1 m, ponds sorted by id.

    Each ring is a flat [x0, z0, x1, z1, ...] list WITHOUT repeating the first point.
    rings[0] is the outer ring and any further rings are holes. In the (x, z) plane the
    outer ring is counter-clockwise (so it looks clockwise on a north-up map, z being south).
    """
    out = []
    for p in sorted(ponds, key=lambda p: p.id):
        cx = (grid.west + grid.east) / 2.0
        cz = (grid.north + grid.south) / 2.0
        world = Polygon(
            [(x - cx, cz - y) for x, y in p.geometry.exterior.coords],
            [[(x - cx, cz - y) for x, y in ring.coords] for ring in p.geometry.interiors],
        )
        world = orient(world, 1.0)
        rings = [_ring_flat([(x + cx, cz - z) for x, z in world.exterior.coords], grid)]
        for ring in world.interiors:
            rings.append(_ring_flat([(x + cx, cz - z) for x, z in ring.coords], grid))
        out.append({
            "id": p.id,
            "name": p.name,
            "level_m": p.level_m,
            "source": p.source,
            "confidence": p.confidence,
            "rings": rings,
        })
    return {"version": PONDS_VERSION, "ponds": out, "processing": processing}


def pond_provenance_rows(ponds: Sequence[Pond]) -> list[dict]:
    """meta hand_sources rows (layer "ponds"): one per distinct (source, confidence)."""
    return hand_source_rows("ponds", [(p.source, p.confidence) for p in ponds])


def pond_layer(ponds: Sequence[Pond]) -> Layer | None:
    """The meta layer for ponds (None when there are none); confidence is the lowest."""
    if not ponds:
        return None
    n = len(ponds)
    prefix = f"{n} freshwater pond{'' if n == 1 else 's'}"
    attribution = "SFEI; this project" if any(p.origin == "sfei" for p in ponds) else "this project"
    return Layer(
        "ponds",
        layer_source_summary(prefix, [p.source for p in ponds]),
        lowest_confidence([p.confidence for p in ponds]),
        attribution,
    )
```

`pipeline/yelamu/habitat.py` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/pipeline/yelamu/habitat.py
+++ b/pipeline/yelamu/habitat.py
@@ -2,7 +2,7 @@
 
 The SFEI layer's `HabitatCla` values (about thirty) are grouped into ten coarse groups
 for colouring. The raster stores one uint8 id per cell; `legend` maps ids back to names
-and groups. Ids 0..3 are fixed synthetic classes; SFEI classes get ids 4.. in sorted
+and groups. Ids 0..4 are fixed synthetic classes; SFEI classes get ids 5.. in sorted
 name order (only those present in the data).
 """
 
@@ -18,8 +18,9 @@
 ID_OPEN_BAY_INFERRED = 1
 ID_HAND_BAY = 2
 ID_HAND_MARSH = 3
-FIRST_SFEI_ID = 4
-MAX_SFEI_CLASSES = 251  # uint8 ids 4..254 (255 stays free)
+ID_HAND_POND = 4
+FIRST_SFEI_ID = 5
+MAX_SFEI_CLASSES = 250  # uint8 ids 5..254 (255 stays free)
 
 SYNTHETIC_LEGEND: list[dict] = [
     {"id": ID_UNMAPPED, "name": "Unmapped", "group": "unmapped"},
@@ -27,6 +28,7 @@
      "group": "water"},
     {"id": ID_HAND_BAY, "name": "Bay (hand-drawn)", "group": "water"},
     {"id": ID_HAND_MARSH, "name": "Marsh (hand-drawn)", "group": "marsh"},
+    {"id": ID_HAND_POND, "name": "Pond (hand-drawn)", "group": "water"},
 ]
 
 _GROUPS = {
@@ -116,7 +118,8 @@
     """A copy of `habitat` with the synthetic water classes stamped on.
 
     Applied in this order, so later wins: inferred open bay (`gap`), hand-drawn marsh,
-    hand-drawn bay. Any mask may be None (nothing to stamp).
+    hand-drawn bay. Any mask may be None (nothing to stamp). Ponds are stamped after this
+    by yelamu.ponds.stamp_ponds_on_habitat.
     """
     out = np.array(habitat, dtype=np.uint8, copy=True)
     for mask, class_id in ((gap, ID_OPEN_BAY_INFERRED), (hand_marsh, ID_HAND_MARSH),
PATCH
```

`pipeline/yelamu/export.py` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/pipeline/yelamu/export.py
+++ b/pipeline/yelamu/export.py
@@ -56,11 +56,13 @@
     processing: dict | None = None,
     habitat: np.ndarray | None = None,
     habitat_classes: list[dict] | None = None,
+    extra_meta: dict | None = None,
 ) -> dict:
     """Write heightmap.u16 and meta.json (and habitat.u8 when a habitat raster is given).
 
     `habitat` is a (height, width) uint8 class-id raster, row 0 = north, written raw;
-    `habitat_classes` is its legend, copied into meta.json.
+    `habitat_classes` is its legend, copied into meta.json. `extra_meta` keys (e.g.
+    "ponds_file", "hand_sources") are added to meta.json last.
     """
     if not np.isfinite(dem).all():
         raise ValueError(
@@ -108,5 +110,7 @@
         meta["habitat_classes"] = habitat_classes
     if processing is not None:
         meta["processing"] = processing
+    if extra_meta:
+        meta.update(extra_meta)
     (out_dir / "meta.json").write_text(json.dumps(meta, indent=2))
     return meta
PATCH
```

- [ ] **Step 4: Run the whole suite**

Run: `cd pipeline && uv run pytest -q -W error`

Expected: **457 passed, 1 skipped**, no warnings.

- [ ] **Step 5: Commit**

```bash
git add pipeline/tests/test_ponds.py pipeline/yelamu/ponds.py pipeline/tests/test_habitat.py pipeline/tests/test_pipeline.py pipeline/yelamu/habitat.py pipeline/yelamu/export.py
git commit -m "feat(pipeline): freshwater ponds with their own level, carved beds and blended banks"
```

---

### Task P6: Sanity checks for water and ponds

**Files:**
- Create: `pipeline/tests/test_checks.py`
- Modify: `pipeline/yelamu/checks.py`

`checks.json` entries may now say `expect_water` (the cell must be below the water level) and `expect_pond` (the cell must be inside a pond; a pond cell sits at its own level, so `expect_water` cannot express it).

- [ ] **Step 1: Add the tests**

`pipeline/tests/test_checks.py`

```python
import json

import numpy as np
import pytest

from yelamu.checks import Expectation, load_expectations, run_checks
from yelamu.geo import Grid, lonlat_to_utm
from yelamu.terrain import LAND_FLOOR_M, MARSH_LEVEL_M, WATER_LEVEL_M

LON, LAT = -122.40, 37.78


def _grid():
    x, y = lonlat_to_utm(LON, LAT)
    return Grid(west=x - 50, south=y - 50, east=x + 50, north=y + 50, cell=10)


def _run(height, **kw):
    grid = _grid()
    dem = np.full((grid.height, grid.width), height, dtype="float32")
    return run_checks(dem, grid, [Expectation("spot", LON, LAT, **kw)])


@pytest.mark.parametrize("h, ok", [(-3.0, True), (MARSH_LEVEL_M, True), (0.59, True),
                                   (WATER_LEVEL_M, False), (LAND_FLOOR_M, False), (40.0, False)])
def test_expect_water_true_needs_height_below_the_water_level(h, ok):
    failures = _run(h, expect_water=True)
    assert (failures == []) is ok
    if not ok:
        assert "spot" in failures[0] and "water" in failures[0]


@pytest.mark.parametrize("h, ok", [(40.0, True), (LAND_FLOOR_M, True), (0.99, False),
                                   (WATER_LEVEL_M, False), (-3.0, False)])
def test_expect_water_false_needs_dry_land(h, ok):
    failures = _run(h, expect_water=False)
    assert (failures == []) is ok


def test_expect_water_combines_with_bounds_and_none_is_ignored():
    assert _run(-3.0, expect_water=True, max_m=1.0) == []
    assert len(_run(-3.0, expect_water=True, min_m=0.0)) == 1
    assert _run(5.0) == []


def test_non_boolean_expect_water_is_rejected():
    with pytest.raises(ValueError, match="expect_water"):
        Expectation("x", 0, 0, expect_water="yes")


def test_expect_pond():
    grid = _grid()
    dem = np.full((grid.height, grid.width), 5.0, dtype="float32")
    pond = np.zeros(dem.shape, dtype=bool)
    pond[grid.pixel_of(*lonlat_to_utm(LON, LAT))] = True
    yes = [Expectation("lake", LON, LAT, expect_pond=True)]
    no = [Expectation("hill", LON, LAT, expect_pond=False)]
    assert run_checks(dem, grid, yes, pond) == []
    assert "not inside any pond" in run_checks(dem, grid, yes, np.zeros_like(pond))[0]
    assert "not inside any pond" in run_checks(dem, grid, yes)[0]  # no ponds built at all
    assert "inside a pond" in run_checks(dem, grid, no, pond)[0]
    assert run_checks(dem, grid, no) == []


def test_load_expectations_reads_the_new_keys(tmp_path):
    path = tmp_path / "c.json"
    path.write_text(json.dumps([
        {"name": "a", "lon": 1, "lat": 2, "expect_water": True},
        {"name": "b", "lon": 1, "lat": 2, "expect_pond": True, "min_m": 0}]))
    a, b = load_expectations(path)
    assert a.expect_water is True and b.expect_pond is True and b.min_m == 0
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd pipeline && uv run pytest tests/test_checks.py -q`

Expected: **FAIL** (the code under test does not exist yet, or the new assertions do not hold yet).

- [ ] **Step 3: Write the implementation**

`pipeline/yelamu/checks.py` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/pipeline/yelamu/checks.py
+++ b/pipeline/yelamu/checks.py
@@ -1,4 +1,4 @@
-"""Sanity checks: known places must land in a plausible height range."""
+"""Sanity checks: known places must land in a plausible height range (or water state)."""
 
 from __future__ import annotations
 
@@ -9,22 +9,46 @@
 import numpy as np
 
 from yelamu.geo import Grid, lonlat_to_utm
+from yelamu.terrain import LAND_FLOOR_M, WATER_LEVEL_M
 
 
 @dataclass(frozen=True)
 class Expectation:
+    """One check. All conditions given must hold.
+
+    min_m / max_m: bounds on the cell height. expect_water: True means the cell is below
+    the water level (height < WATER_LEVEL_M, i.e. bay or marsh as the viewer draws it);
+    False means it is dry land (height >= LAND_FLOOR_M). expect_pond: True means the cell
+    belongs to a freshwater pond (ponds sit at their own level, so use this, not
+    expect_water, for lakes); False means it does not. A pond check needs the pond mask
+    that cli.build passes; without ponds, expect_pond=True fails.
+    """
+
     name: str
     lon: float
     lat: float
     min_m: float | None = None
     max_m: float | None = None
+    expect_water: bool | None = None
+    expect_pond: bool | None = None
+
+    def __post_init__(self) -> None:
+        for key in ("expect_water", "expect_pond"):
+            value = getattr(self, key)
+            if value is not None and not isinstance(value, bool):
+                raise ValueError(f"{self.name}: {key} must be true or false, got {value!r}")
 
 
 def load_expectations(path: Path) -> list[Expectation]:
     return [Expectation(**item) for item in json.loads(Path(path).read_text())]
 
 
-def run_checks(dem: np.ndarray, grid: Grid, expectations: list[Expectation]) -> list[str]:
+def run_checks(
+    dem: np.ndarray,
+    grid: Grid,
+    expectations: list[Expectation],
+    pond_mask: np.ndarray | None = None,
+) -> list[str]:
     """Return a list of human-readable failures (empty means all checks passed)."""
     failures = []
     for e in expectations:
@@ -38,4 +62,18 @@
             failures.append(f"{e.name}: {h:.1f} m is below the expected minimum {e.min_m} m")
         if e.max_m is not None and h > e.max_m:
             failures.append(f"{e.name}: {h:.1f} m is above the expected maximum {e.max_m} m")
+        if e.expect_water is True and not h < WATER_LEVEL_M:
+            failures.append(
+                f"{e.name}: expected water but {h:.2f} m is not below the water level "
+                f"{WATER_LEVEL_M} m")
+        if e.expect_water is False and not h >= LAND_FLOOR_M:
+            failures.append(
+                f"{e.name}: expected dry land but {h:.2f} m is below the land floor "
+                f"{LAND_FLOOR_M} m")
+        if e.expect_pond is not None:
+            in_pond = pond_mask is not None and bool(pond_mask[pixel])
+            if e.expect_pond and not in_pond:
+                failures.append(f"{e.name}: expected a pond cell but this is not inside any pond")
+            if e.expect_pond is False and in_pond:
+                failures.append(f"{e.name}: expected no pond but this cell is inside a pond")
     return failures
PATCH
```

- [ ] **Step 4: Run the whole suite**

Run: `cd pipeline && uv run pytest -q -W error`

Expected: **472 passed, 1 skipped**, no warnings.

- [ ] **Step 5: Commit**

```bash
git add pipeline/tests/test_checks.py pipeline/yelamu/checks.py
git commit -m "feat(pipeline): water and pond expectations in the sanity checks"
```

---

### Task P7: Wire it into the build

**Files:**
- Modify: `pipeline/tests/test_region.py`
- Modify: `pipeline/tests/test_pipeline.py`
- Modify: `pipeline/yelamu/region.py`
- Modify: `pipeline/yelamu/cli.py`
- Modify: `pipeline/regions/full-city.json`

Region keys `hand_ponds`, `pond_classes`, `pond_max_depth_m`, `pond_shelf_m`, `pond_bank_slope`, `pond_bank_m` and the matching CLI flags (flags replace region values); the build now loads hand polygons with provenance required, applies landforms through `landforms.py`, builds, carves and blends ponds after the shoreline work and before export, records `ponds_file` and `hand_sources` in `meta.json`, and turns input errors into one `error:` line. `regions/full-city.json` lists the pond classes and an (empty) hand-ponds file. The `Tidal coastal lagoon` class is **deliberately not** in the default list: you decide those two polygons with the comparison tool.

- [ ] **Step 1: Add the tests**

`pipeline/tests/test_region.py` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/pipeline/tests/test_region.py
+++ b/pipeline/tests/test_region.py
@@ -36,8 +36,10 @@
     assert region.out == tmp_path / "viewer" / "out"  # '..' is collapsed
     assert region.habitats is None and region.bay is None and region.marsh is None
     assert region.landforms is None and region.checks is None
-    assert region.hand_bay == [] and region.hand_marsh == []
-    for name in ("smooth_m", "shelf_m", "shore_slope", "shore_open_cells", "open_water_max_m"):
+    assert region.hand_bay == [] and region.hand_marsh == [] and region.hand_ponds == []
+    assert region.pond_classes is None
+    for name in ("smooth_m", "shelf_m", "shore_slope", "shore_open_cells", "open_water_max_m",
+                 "pond_max_depth_m", "pond_shelf_m", "pond_bank_slope", "pond_bank_m"):
         assert getattr(region, name) is None
 
 
@@ -51,6 +53,10 @@
         "landforms": "data/lf.json", "checks": "data/ck.json",
         "smooth_m": 20, "shelf_m": 90.5, "shore_slope": 0.2, "shore_open_cells": 3,
         "open_water_max_m": 0.25,
+        "hand_ponds": ["data/hand/p1.geojson", "data/hand/p2.geojson"],
+        "pond_classes": ["Other pond or lake", " Fen "],
+        "pond_max_depth_m": 3, "pond_shelf_m": 40.5,
+        "pond_bank_slope": 0.5, "pond_bank_m": 120,
     }
     region = load_region(_write(tmp_path, data))
     base = tmp_path / "pipeline"
@@ -60,6 +66,10 @@
     assert region.landforms == base / "data/lf.json" and region.checks == base / "data/ck.json"
     assert (region.smooth_m, region.shelf_m, region.shore_slope) == (20, 90.5, 0.2)
     assert region.shore_open_cells == 3 and region.open_water_max_m == 0.25
+    assert region.hand_ponds == [base / "data/hand/p1.geojson", base / "data/hand/p2.geojson"]
+    assert region.pond_classes == ["Other pond or lake", "Fen"]  # stripped
+    assert (region.pond_max_depth_m, region.pond_shelf_m) == (3, 40.5)
+    assert (region.pond_bank_slope, region.pond_bank_m) == (0.5, 120)
 
 
 def test_absolute_paths_are_kept(tmp_path):
@@ -134,6 +144,10 @@
 @pytest.mark.parametrize("key, value", [
     ("dem", 5), ("out", ""), ("bay", 3), ("hand_bay", "a.geojson"), ("hand_marsh", [1]),
     ("smooth_m", "x"), ("shore_open_cells", 1.5), ("shelf_m", True), ("name", ""),
+    ("hand_ponds", "a.geojson"), ("hand_ponds", [1]), ("hand_ponds", [""]),
+    ("pond_classes", "Fen"), ("pond_classes", [1]), ("pond_classes", ["Fen", " "]),
+    ("pond_max_depth_m", "deep"), ("pond_shelf_m", True),
+    ("pond_bank_slope", -0.1), ("pond_bank_slope", "x"), ("pond_bank_m", -5), ("pond_bank_m", True),
 ])
 def test_bad_value_types_are_rejected_naming_key_and_file(tmp_path, key, value):
     path = _write(tmp_path, {**MINIMAL, key: value}, "v.json")
@@ -151,8 +165,14 @@
 
 def test_null_optionals_mean_unset(tmp_path):
     region = load_region(_write(tmp_path, {**MINIMAL, "bay": None, "smooth_m": None,
-                                           "hand_bay": None}))
+                                           "hand_bay": None, "hand_ponds": None,
+                                           "pond_classes": None}))
     assert region.bay is None and region.smooth_m is None and region.hand_bay == []
+    assert region.hand_ponds == [] and region.pond_classes is None
+
+
+def test_empty_pond_classes_list_is_kept_it_means_no_sfei_ponds(tmp_path):
+    assert load_region(_write(tmp_path, {**MINIMAL, "pond_classes": []})).pond_classes == []
 
 
 # --------------------------------------------------- the shipped region files ---
@@ -165,7 +185,8 @@
     assert region.dem == PIPELINE / "data" / "raw" / "dem.tif"
     for p in (region.habitats, region.bay, region.marsh):
         assert p is not None and p.exists(), p
-    for p in (region.landforms, region.checks, *region.hand_bay, *region.hand_marsh):
+    for p in (region.landforms, region.checks, *region.hand_bay, *region.hand_marsh,
+              *region.hand_ponds):
         assert p is not None and p.exists(), p
 
 
@@ -176,3 +197,14 @@
     assert region.out == PIPELINE.parent / "viewer" / "public" / "assets" / "real-city"
     assert [p.name for p in region.hand_bay] == ["hand_bay.geojson"]
     assert [p.name for p in region.hand_marsh] == ["hand_marsh.geojson"]
+    assert [p.name for p in region.hand_ponds] == ["hand_ponds.geojson"]
+    assert region.pond_classes == [
+        "Dune-dammed pond or lake", "Dune-dammed headwater lake",
+        "Barrier beach-impounded freshwater lagoon", "Other pond or lake"]
+    from yelamu.ponds import DEFAULT_POND_CLASSES
+    assert tuple(region.pond_classes) == DEFAULT_POND_CLASSES
+
+
+def test_bank_slope_zero_is_allowed(tmp_path):
+    r = load_region(_write(tmp_path, {**MINIMAL, "pond_bank_slope": 0, "pond_bank_m": 0}))
+    assert r.pond_bank_slope == 0.0 and r.pond_bank_m == 0.0
PATCH
```

`pipeline/tests/test_pipeline.py` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/pipeline/tests/test_pipeline.py
+++ b/pipeline/tests/test_pipeline.py
@@ -13,8 +13,10 @@
 from yelamu.cli import main, parse_args
 from yelamu.export import dequantize_heights
 from yelamu.geo import UTM_CRS, Grid, lonlat_to_utm
-from yelamu.habitat import ID_HAND_BAY, ID_HAND_MARSH, ID_OPEN_BAY_INFERRED, ID_UNMAPPED
+from yelamu.habitat import (
+    ID_HAND_BAY, ID_HAND_MARSH, ID_HAND_POND, ID_OPEN_BAY_INFERRED, ID_UNMAPPED)
 from yelamu.terrain import LAND_FLOOR_M, MARSH_LEVEL_M, WATER_LEVEL_M
+from yelamu.ponds import DEFAULT_POND_CLASSES
 from yelamu.sources import load_dem, load_polygons
 from yelamu.water import water_mask
 
@@ -44,6 +46,19 @@
     path.write_text(json.dumps({
         "type": "FeatureCollection",
         "features": [{"type": "Feature", "properties": {},
+                      "geometry": {"type": "Polygon", "coordinates": [ring]}}],
+    }))
+
+
+_PROV = {"source": "US Coast Survey T-sheet (test)", "confidence": "inferred"}
+
+
+def _write_hand_geojson(path, lon0, lat0, lon1, lat1, **props) -> None:
+    """A one-polygon hand-drawn file WITH provenance (props override the defaults)."""
+    ring = [[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]]
+    path.write_text(json.dumps({
+        "type": "FeatureCollection",
+        "features": [{"type": "Feature", "properties": {**_PROV, **props},
                       "geometry": {"type": "Polygon", "coordinates": [ring]}}],
     }))
 
@@ -303,7 +318,7 @@
     _write_bay_geojson(tmp_path / "bay.geojson", -122.40, 37.77, -122.38, 37.79)
     # Centred on the bay's eastern shore, so it overlaps both water and land.
     (tmp_path / "lf.json").write_text(json.dumps(
-        [{"lon": -122.38, "lat": 37.78, "radius_m": 600, "delta_m": delta_m}]
+        [{"lon": -122.38, "lat": 37.78, "radius_m": 600, "delta_m": delta_m, **_PROV}]
     ))
     out = tmp_path / "out"
 
@@ -400,7 +415,7 @@
     grid, args = _gap_args(tmp_path, out, "--coverage", str(tmp_path / "cov.geojson"))
     # A big raise over the unmapped bay must not hide it from the gap fill.
     (tmp_path / "lf.json").write_text(json.dumps(
-        [{"lon": -122.38, "lat": 37.79, "radius_m": 400, "delta_m": 25.0}]
+        [{"lon": -122.38, "lat": 37.79, "radius_m": 400, "delta_m": 25.0, **_PROV}]
     ))
 
     assert main([*args, "--landforms", str(tmp_path / "lf.json")]) == 0
@@ -419,7 +434,7 @@
     assert "landforms" not in _layer_ids(tmp_path / "e")
 
     (tmp_path / "one.json").write_text(json.dumps(
-        [{"lon": -122.39, "lat": 37.78, "radius_m": 300, "delta_m": 5.0}]
+        [{"lon": -122.39, "lat": 37.78, "radius_m": 300, "delta_m": 5.0, **_PROV}]
     ))
     main([*base, "--out", str(tmp_path / "n"), "--landforms", str(tmp_path / "one.json")])
     assert "landforms" in _layer_ids(tmp_path / "n")
@@ -470,6 +485,8 @@
     assert meta["processing"] == {
         "smooth_m": 20.0, "shelf_m": 90.0, "shore_open_cells": 3,
         "open_water_max_m": 0.25, "coverage": False, "shore_slope": 0.30,
+        "pond_classes": list(DEFAULT_POND_CLASSES), "pond_max_depth_m": 2.0,
+        "pond_shelf_m": 20.0, "pond_bank_slope": 0.35, "pond_bank_m": 200.0,
     }
     assert "layers" in meta and "water_level_m" in meta
 
@@ -549,18 +566,20 @@
 
 
 def test_hand_marsh_over_fill_becomes_marsh_level(tmp_path):
-    _write_bay_geojson(tmp_path / "hm.geojson", -122.40, 37.77, -122.38, 37.79)
+    _write_hand_geojson(tmp_path / "hm.geojson", -122.40, 37.77, -122.38, 37.79)
     grid, out, meta, heights = _hand_run(tmp_path, "--hand-marsh", str(tmp_path / "hm.geojson"))
     assert abs(heights[_pixel(grid, -122.39, 37.78)] - MARSH_LEVEL_M) < 0.01
     assert abs(heights[_pixel(grid, -122.415, 37.76)] - 5.0) < 0.01  # elsewhere unchanged
     assert "hand_water" in _layer_ids(out)
     layer = next(l for l in meta["layers"] if l["id"] == "hand_water")
     assert layer["confidence"] == "inferred" and layer["attribution"] == "this project"
-    assert layer["source"] == "hand-drawn from historical maps (user-authored)"
+    assert layer["source"] == "hand-drawn from 1 source: US Coast Survey T-sheet (test)"
+    assert meta["hand_sources"] == [{"layer": "hand_water", "source": _PROV["source"],
+                                     "confidence": "inferred", "count": 1}]
 
 
 def test_hand_bay_becomes_bay(tmp_path):
-    _write_bay_geojson(tmp_path / "hb.geojson", -122.40, 37.77, -122.38, 37.79)
+    _write_hand_geojson(tmp_path / "hb.geojson", -122.40, 37.77, -122.38, 37.79)
     grid, out, _, heights = _hand_run(tmp_path, "--hand-bay", str(tmp_path / "hb.geojson"))
     assert abs(heights[_pixel(grid, -122.39, 37.78)] - (-3.0)) < 0.01
     assert abs(heights[_pixel(grid, -122.415, 37.76)] - 5.0) < 0.01
@@ -568,9 +587,9 @@
 
 
 def test_hand_bay_wins_over_hand_marsh_and_multiple_files_are_merged(tmp_path):
-    _write_bay_geojson(tmp_path / "hb1.geojson", -122.40, 37.77, -122.39, 37.79)
-    _write_bay_geojson(tmp_path / "hb2.geojson", -122.38, 37.77, -122.375, 37.79)
-    _write_bay_geojson(tmp_path / "hm.geojson", -122.405, 37.77, -122.385, 37.79)
+    _write_hand_geojson(tmp_path / "hb1.geojson", -122.40, 37.77, -122.39, 37.79)
+    _write_hand_geojson(tmp_path / "hb2.geojson", -122.38, 37.77, -122.375, 37.79)
+    _write_hand_geojson(tmp_path / "hm.geojson", -122.405, 37.77, -122.385, 37.79)
     grid, _, _, heights = _hand_run(
         tmp_path, "--hand-bay", str(tmp_path / "hb1.geojson"), str(tmp_path / "hb2.geojson"),
         "--hand-marsh", str(tmp_path / "hm.geojson"))
@@ -593,7 +612,7 @@
     out = tmp_path / "out"
     grid, args = _gap_args(tmp_path, out, "--coverage", str(tmp_path / "cov.geojson"), *_FLAT)
     # A hand marsh in the unmapped (east) north half, where the modern DEM is 0 m.
-    _write_bay_geojson(tmp_path / "hm.geojson", -122.385, 37.785, -122.375, 37.795)
+    _write_hand_geojson(tmp_path / "hm.geojson", -122.385, 37.785, -122.375, 37.795)
 
     assert main([*args, "--hand-marsh", str(tmp_path / "hm.geojson")]) == 0
 
@@ -682,8 +701,8 @@
     out = tmp_path / "out"
     grid, args = _gap_args(tmp_path, out)
     hab = _habitat_collection(tmp_path)
-    _write_bay_geojson(tmp_path / "hm.geojson", -122.385, 37.785, -122.375, 37.795)
-    _write_bay_geojson(tmp_path / "hb.geojson", -122.385, 37.765, -122.375, 37.775)
+    _write_hand_geojson(tmp_path / "hm.geojson", -122.385, 37.785, -122.375, 37.795)
+    _write_hand_geojson(tmp_path / "hb.geojson", -122.385, 37.765, -122.375, 37.775)
 
     assert main([*args, "--habitats", str(hab), "--hand-marsh", str(tmp_path / "hm.geojson"),
                  "--hand-bay", str(tmp_path / "hb.geojson")]) == 0
@@ -808,3 +827,297 @@
     (pipe / "data" / "checks.json").write_text(json.dumps(
         [{"name": "needs a hill", "lon": -122.415, "lat": 37.76, "min_m": 60.0}]))
     assert main(["--region", str(path)]) == 2
+
+
+# ------------------------------------------------- provenance enforcement ---
+
+
+def test_hand_file_without_provenance_is_rejected_naming_file_and_feature(tmp_path):
+    _write_bay_geojson(tmp_path / "hb.geojson", -122.40, 37.77, -122.38, 37.79)  # no properties
+    with pytest.raises(ValueError, match="hb.geojson") as exc:
+        _hand_run(tmp_path, "--hand-bay", str(tmp_path / "hb.geojson"))
+    assert "feature 0" in str(exc.value) and "source" in str(exc.value)
+    assert not (tmp_path / "out" / "meta.json").exists()  # nothing written
+
+
+def test_cli_entry_turns_input_errors_into_one_line_and_exit_1(tmp_path, capsys):
+    from yelamu.cli import cli_entry
+    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
+    _write_dem(tmp_path / "dem.tif", grid, 5.0)
+    _write_bay_geojson(tmp_path / "hm.geojson", -122.40, 37.77, -122.38, 37.79)
+    code = cli_entry(["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX),
+                      "--out", str(tmp_path / "o"), "--hand-marsh", str(tmp_path / "hm.geojson")])
+    assert code == 1
+    err = capsys.readouterr().err
+    assert err.startswith("error: ") and "hm.geojson" in err and "Traceback" not in err
+
+
+def test_hand_water_layer_summarises_sources_and_takes_the_lowest_confidence(tmp_path):
+    _write_hand_geojson(tmp_path / "hb.geojson", -122.40, 37.77, -122.39, 37.79,
+                        source="Sheet B", confidence="documented")
+    _write_hand_geojson(tmp_path / "hm.geojson", -122.385, 37.77, -122.38, 37.79,
+                        source="Sheet A", confidence="illustrative")
+    _, out, meta, _ = _hand_run(tmp_path, "--hand-bay", str(tmp_path / "hb.geojson"),
+                                "--hand-marsh", str(tmp_path / "hm.geojson"))
+    layer = next(l for l in meta["layers"] if l["id"] == "hand_water")
+    assert layer["source"] == "hand-drawn from 2 sources: Sheet A; Sheet B"
+    assert layer["confidence"] == "illustrative"
+    assert meta["hand_sources"] == [
+        {"layer": "hand_water", "source": "Sheet A", "confidence": "illustrative", "count": 1},
+        {"layer": "hand_water", "source": "Sheet B", "confidence": "documented", "count": 1},
+    ]
+
+
+def test_no_hand_inputs_means_no_hand_sources_or_ponds_keys(tmp_path):
+    _, out, meta, _ = _hand_run(tmp_path)
+    assert "hand_sources" not in meta and "ponds_file" not in meta
+    assert not (out / "ponds.json").exists()
+
+
+def test_landforms_need_provenance_and_ridges_are_built(tmp_path):
+    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
+    _write_dem(tmp_path / "dem.tif", grid, 5.0)
+    base = ["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX), *_FLAT]
+    lf = tmp_path / "lf.json"
+    lf.write_text(json.dumps([{"lon": -122.39, "lat": 37.78, "radius_m": 300, "delta_m": 5.0}]))
+    with pytest.raises(ValueError, match="lf.json") as exc:
+        main([*base, "--out", str(tmp_path / "bad"), "--landforms", str(lf)])
+    assert "landforms[0]" in str(exc.value) and "source" in str(exc.value)
+
+    lf.write_text(json.dumps([
+        {"kind": "ridge", "name": "Market St ridge", "points": [[-122.40, 37.78], [-122.38, 37.78]],
+         "half_width_m": 100, "delta_m": 10.0, "source": "Ridge source", "confidence": "illustrative"},
+        {"name": "Rincon", "lon": -122.39, "lat": 37.79, "radius_m": 200, "delta_m": 3.0,
+         "source": "Bump source", "confidence": "inferred"},
+    ]))
+    out = tmp_path / "ok"
+    assert main([*base, "--out", str(out), "--landforms", str(lf)]) == 0
+    meta = json.loads((out / "meta.json").read_text())
+    heights = _read_heights(out, meta)
+    assert abs(heights[_pixel(grid, -122.39, 37.78)] - 15.0) < 0.05  # 5 + ridge 10 on the line
+    assert abs(heights[_pixel(grid, -122.39, 37.79)] - 8.0) < 0.35  # 5 + bump 3 (+ridge tail 0)
+    assert abs(heights[_pixel(grid, -122.39, 37.775)] - 5.0) < 0.5   # 556 m from the line... far
+    layer = next(l for l in meta["layers"] if l["id"] == "landforms")
+    assert layer["confidence"] == "illustrative"
+    assert layer["source"] == "hand-sculpted from 2 sources: Bump source; Ridge source"
+    assert [r["source"] for r in meta["hand_sources"]] == ["Bump source", "Ridge source"]
+    assert all(r["layer"] == "landforms" and r["count"] == 1 for r in meta["hand_sources"])
+
+
+# ---------------------------------------------------------------- ponds ---
+
+_POND_LL = (-122.40, 37.77, -122.39, 37.78)
+
+
+def _pond_habitats(tmp_path, cls="Dune-dammed pond or lake", box=_POND_LL, extra=()):
+    ring = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]], [box[0], box[1]]]
+    feats = [{"type": "Feature", "properties": {"HabitatCla": cls},
+              "geometry": {"type": "Polygon", "coordinates": [ring]}}, *extra]
+    path = tmp_path / "habitats.geojson"
+    path.write_text(json.dumps({"type": "FeatureCollection", "features": feats}))
+    return path
+
+
+def _pond_run(tmp_path, *extra, dem_value=7.0, out_name="out", habitats=True):
+    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
+    _write_dem(tmp_path / "dem.tif", grid, dem_value)
+    out = tmp_path / out_name
+    args = ["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX), "--out", str(out),
+            *_FLAT]
+    if habitats:
+        args += ["--habitats", str(_pond_habitats(tmp_path))]
+    assert main([*args, *extra]) == 0
+    meta = json.loads((out / "meta.json").read_text())
+    return grid, out, meta, _read_heights(out, meta)
+
+
+def test_sfei_pond_is_carved_exported_and_recorded(tmp_path, capsys):
+    grid, out, meta, heights = _pond_run(tmp_path)
+    assert "Carved 1 ponds (1 from SFEI, 0 hand-drawn)" in capsys.readouterr().out
+    doc = json.loads((out / "ponds.json").read_text())
+    assert meta["ponds_file"] == "ponds.json" and doc["version"] == 1
+    (pond,) = doc["ponds"]
+    assert pond["id"] == "dune-dammed-pond-or-lake-1" and pond["name"] is None
+    assert pond["level_m"] == 7.0  # median of the flat 7 m DEM
+    assert pond["confidence"] == "documented"
+    assert pond["source"] == "SFEI Hidden Nature SF habitat class 'Dune-dammed pond or lake'"
+    assert len(pond["rings"]) == 1 and len(pond["rings"][0]) >= 8
+    assert doc["processing"]["max_depth_m"] == 2.0 and doc["processing"]["shelf_m"] == 20.0
+    # World metres: the pond sits inside the grid, west of centre (x<0)? check the extent.
+    xs, zs = pond["rings"][0][0::2], pond["rings"][0][1::2]
+    half_w, half_h = grid.width * 10 / 2, grid.height * 10 / 2
+    assert -half_w < min(xs) < max(xs) < half_w and -half_h < min(zs) < max(zs) < half_h
+    # Terrain: deepest inside, untouched outside, never above the water level.
+    centre = heights[_pixel(grid, -122.395, 37.775)]
+    assert abs(centre - 5.0) < 0.01  # 7 - 2 m
+    assert abs(heights[_pixel(grid, -122.415, 37.76)] - 7.0) < 0.01
+    inside = heights[_pixel(grid, -122.3999, 37.7701)]
+    assert 6.0 < inside < 7.0  # the shore edge is shallow
+    # Habitat: the pond cells keep the SFEI class.
+    raster = _habitat(out, meta)
+    ids = {e["name"]: e["id"] for e in meta["habitat_classes"]}
+    assert raster[_pixel(grid, -122.395, 37.775)] == ids["Dune-dammed pond or lake"]
+    # Provenance: layer + hand_sources row.
+    layer = next(l for l in meta["layers"] if l["id"] == "ponds")
+    assert layer["confidence"] == "documented" and layer["attribution"] == "SFEI; this project"
+    assert meta["hand_sources"] == [{
+        "layer": "ponds", "confidence": "documented", "count": 1,
+        "source": "SFEI Hidden Nature SF habitat class 'Dune-dammed pond or lake'"}]
+    assert meta["processing"]["pond_classes"][0] == "Dune-dammed pond or lake"
+
+
+def test_pond_classes_flag_selects_classes_and_empty_means_none(tmp_path):
+    _, out, meta, _ = _pond_run(tmp_path, "--pond-classes", "Other pond or lake")
+    assert "ponds_file" not in meta and not (out / "ponds.json").exists()
+    _, out2, meta2, _ = _pond_run(tmp_path, "--pond-classes", "Dune-dammed pond or lake",
+                                  out_name="out2")
+    assert meta2["ponds_file"] == "ponds.json"
+
+
+def test_rebuild_without_ponds_removes_a_stale_ponds_file(tmp_path):
+    _, out, _, _ = _pond_run(tmp_path)
+    assert (out / "ponds.json").exists()
+    _pond_run(tmp_path, "--pond-classes", "Other pond or lake")  # same out dir
+    assert not (out / "ponds.json").exists()
+
+
+def test_hand_pond_with_level_name_and_provenance(tmp_path):
+    _write_hand_geojson(tmp_path / "hp.geojson", -122.385, 37.785, -122.378, 37.79,
+                        level_m=12.5, name="Test Pond", source="Sanborn 1887", confidence="illustrative")
+    grid, out, meta, heights = _pond_run(tmp_path, "--hand-ponds", str(tmp_path / "hp.geojson"),
+                                         habitats=True)
+    doc = json.loads((out / "ponds.json").read_text())
+    by_id = {p["id"]: p for p in doc["ponds"]}
+    assert set(by_id) == {"dune-dammed-pond-or-lake-1", "test-pond"}
+    hp = by_id["test-pond"]
+    assert hp["level_m"] == 12.5 and hp["name"] == "Test Pond"
+    assert (hp["source"], hp["confidence"]) == ("Sanborn 1887", "illustrative")
+    assert [p["id"] for p in doc["ponds"]] == sorted(by_id)
+    assert abs(heights[_pixel(grid, -122.3815, 37.7875)] - 10.5) < 0.01
+    assert _habitat(out, meta)[_pixel(grid, -122.3815, 37.7875)] == ID_HAND_POND
+    layer = next(l for l in meta["layers"] if l["id"] == "ponds")
+    assert layer["confidence"] == "illustrative"  # the lowest of documented + illustrative
+    rows = {(r["source"], r["confidence"]): r["count"] for r in meta["hand_sources"]}
+    assert rows[("Sanborn 1887", "illustrative")] == 1
+    assert all(r["layer"] == "ponds" for r in meta["hand_sources"])
+    assert [r["source"] for r in meta["hand_sources"]] == sorted(r["source"] for r in meta["hand_sources"])
+
+
+def test_hand_pond_level_defaults_to_the_median_raw_dem(tmp_path):
+    _write_hand_geojson(tmp_path / "hp.geojson", -122.385, 37.785, -122.378, 37.79)
+    grid, out, meta, heights = _pond_run(tmp_path, "--hand-ponds", str(tmp_path / "hp.geojson"),
+                                         habitats=False, dem_value=9.0)
+    (pond,) = json.loads((out / "ponds.json").read_text())["ponds"]
+    assert pond["id"] == "pond-1" and pond["level_m"] == 9.0
+    assert "habitat_file" not in meta  # no habitats given: no raster to stamp
+
+
+def test_empty_hand_ponds_file_is_accepted_and_adds_nothing(tmp_path):
+    (tmp_path / "hp.geojson").write_text(json.dumps(_EMPTY_FC))
+    _, out, meta, heights = _pond_run(tmp_path, "--hand-ponds", str(tmp_path / "hp.geojson"),
+                                      habitats=False)
+    assert "ponds_file" not in meta and "hand_sources" not in meta
+    assert np.abs(heights - 7.0).max() < 0.01
+
+
+def test_hand_ponds_without_provenance_are_rejected(tmp_path):
+    _write_bay_geojson(tmp_path / "hp.geojson", -122.385, 37.785, -122.378, 37.79)
+    with pytest.raises(ValueError, match="hp.geojson"):
+        _pond_run(tmp_path, "--hand-ponds", str(tmp_path / "hp.geojson"), habitats=False)
+    _write_hand_geojson(tmp_path / "hp2.geojson", -122.385, 37.785, -122.378, 37.79,
+                        confidence="certain")
+    with pytest.raises(ValueError, match="confidence"):
+        _pond_run(tmp_path, "--hand-ponds", str(tmp_path / "hp2.geojson"), habitats=False)
+
+
+def test_tiny_ponds_are_dropped_with_a_stdout_note(tmp_path, capsys):
+    _write_hand_geojson(tmp_path / "hp.geojson", -122.3900, 37.7900, -122.38995, 37.79005,
+                        name="Speck")
+    _, out, meta, _ = _pond_run(tmp_path, "--hand-ponds", str(tmp_path / "hp.geojson"),
+                                habitats=False)
+    assert "Dropped pond 'Speck'" in capsys.readouterr().out
+    assert "ponds_file" not in meta
+
+
+def test_pond_is_not_changed_by_smoothing_or_the_land_ramp(tmp_path):
+    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
+    _write_dem(tmp_path / "dem.tif", grid, 7.0)
+    _write_bay_geojson(tmp_path / "bay.geojson", -122.415, 37.77, -122.405, 37.78)
+    out = tmp_path / "out"
+    assert main(["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX), "--out", str(out),
+                 "--bay", str(tmp_path / "bay.geojson"),
+                 "--habitats", str(_pond_habitats(tmp_path))]) == 0  # default smoothing/ramp/shelf
+    meta = json.loads((out / "meta.json").read_text())
+    heights = _read_heights(out, meta)
+    assert abs(heights[_pixel(grid, -122.395, 37.775)] - 5.0) < 0.01
+
+
+def test_a_pond_check_in_checks_json_runs_against_the_pond_mask(tmp_path):
+    checks = tmp_path / "checks.json"
+    checks.write_text(json.dumps([
+        {"name": "the lake", "lon": -122.395, "lat": 37.775, "expect_pond": True}]))
+    _pond_run(tmp_path, "--checks", str(checks))  # passes (exit code 0 asserted inside)
+    checks.write_text(json.dumps([
+        {"name": "dry spot", "lon": -122.41, "lat": 37.76, "expect_pond": True}]))
+    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
+    assert main(["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX),
+                 "--out", str(tmp_path / "o3"), *_FLAT, "--habitats", str(tmp_path / "habitats.geojson"),
+                 "--checks", str(checks)]) == 2
+
+
+def test_pond_flags_merge_with_region_defaults(tmp_path):
+    path, _ = _region_setup(tmp_path, hand_ponds=["data/p.geojson"], pond_classes=["Other pond or lake"],
+                            pond_max_depth_m=3.0, pond_shelf_m=40)
+    base = tmp_path / "pipeline"
+    a = parse_args(["--region", str(path)])
+    assert a.hand_ponds == [base / "data/p.geojson"] and a.pond_classes == ["Other pond or lake"]
+    assert (a.pond_max_depth_m, a.pond_shelf_m) == (3.0, 40)
+    b = parse_args(["--region", str(path), "--hand-ponds", "x.geojson", "y.geojson",
+                    "--pond-classes", "Dune-dammed pond or lake", "Fen", "--pond-max-depth-m", "1.5"])
+    assert b.hand_ponds == [Path("x.geojson"), Path("y.geojson")]  # replaced, not appended
+    assert b.pond_classes == ["Dune-dammed pond or lake", "Fen"] and b.pond_max_depth_m == 1.5
+    assert b.pond_shelf_m == 40
+    plain = parse_args(["--dem", "d.tif", "--bbox", "1", "2", "3", "4", "--out", "o"])
+    assert plain.hand_ponds == [] and plain.pond_classes == list(DEFAULT_POND_CLASSES)
+    assert (plain.pond_max_depth_m, plain.pond_shelf_m) == (2.0, 20.0)
+    # a region without pond keys keeps the default class list
+    p2, _ = _region_setup(tmp_path / "x")
+    assert parse_args(["--region", str(p2)]).pond_classes == list(DEFAULT_POND_CLASSES)
+
+
+def test_pond_banks_are_graded_after_the_carve_and_flags_control_them(tmp_path):
+    # A perched pond (level 30 m) on 7 m ground; a bay strip touches its west shore.
+    _write_hand_geojson(tmp_path / "hp.geojson", -122.385, 37.785, -122.378, 37.79,
+                        level_m=30.0, name="Perched")
+    _write_bay_geojson(tmp_path / "bay.geojson", -122.390, 37.785, -122.385, 37.79)
+    hp = ["--hand-ponds", str(tmp_path / "hp.geojson"), "--bay", str(tmp_path / "bay.geojson")]
+    grid, out, meta, heights = _pond_run(tmp_path, *hp, habitats=False)
+    doc = json.loads((out / "ponds.json").read_text())
+    assert doc["ponds"][0]["level_m"] == 30.0  # the contract is unchanged by the banks
+    assert abs(heights[_pixel(grid, -122.3815, 37.7875)] - 28.0) < 0.01  # bed, untouched
+    # East of the pond: embankment = level - 0.35 * d, ramping down to the 7 m ground.
+    near = heights[_pixel(grid, -122.3775, 37.7875)]  # ~ 45 m from the shore
+    assert 10.0 < near < 30.0
+    assert abs(heights[_pixel(grid, -122.372, 37.7875)] - 7.0) < 0.01  # beyond the reach
+    # The bay strip is water: not raised.
+    assert abs(heights[_pixel(grid, -122.3875, 37.7875)] - (-3.0)) < 0.01
+    assert meta["processing"]["pond_bank_slope"] == 0.35 and meta["processing"]["pond_bank_m"] == 200.0
+
+    # Disabled: the ground next to the pond stays at 7 m.
+    _, _, meta0, h0 = _pond_run(tmp_path, *hp, "--pond-bank-slope", "0", habitats=False,
+                                out_name="nobank")
+    assert abs(h0[_pixel(grid, -122.3775, 37.7875)] - 7.0) < 0.01
+    assert meta0["processing"]["pond_bank_slope"] == 0.0
+    # A shorter reach grades less ground.
+    _, _, _, h1 = _pond_run(tmp_path, *hp, "--pond-bank-m", "20", habitats=False, out_name="short")
+    assert abs(h1[_pixel(grid, -122.3775, 37.7875)] - 7.0) < 0.01
+
+
+def test_pond_bank_flags_merge_with_region_defaults(tmp_path):
+    path, _ = _region_setup(tmp_path, pond_bank_slope=0.5, pond_bank_m=120)
+    a = parse_args(["--region", str(path)])
+    assert (a.pond_bank_slope, a.pond_bank_m) == (0.5, 120)
+    b = parse_args(["--region", str(path), "--pond-bank-slope", "0.2", "--pond-bank-m", "50"])
+    assert (b.pond_bank_slope, b.pond_bank_m) == (0.2, 50)
+    plain = parse_args(["--dem", "d.tif", "--bbox", "1", "2", "3", "4", "--out", "o"])
+    assert (plain.pond_bank_slope, plain.pond_bank_m) == (0.35, 200.0)
PATCH
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd pipeline && uv run pytest tests/test_region.py tests/test_pipeline.py -q`

Expected: **FAIL** (the code under test does not exist yet, or the new assertions do not hold yet).

- [ ] **Step 3: Write the implementation**

`pipeline/yelamu/region.py` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/pipeline/yelamu/region.py
+++ b/pipeline/yelamu/region.py
@@ -16,11 +16,14 @@
 
 _REQUIRED = ("name", "bbox", "cell_m", "dem", "out")
 _OPTIONAL_PATHS = ("habitats", "bay", "marsh", "landforms", "checks")
-_OPTIONAL_PATH_LISTS = ("hand_bay", "hand_marsh")
-_OPTIONAL_FLOATS = ("smooth_m", "shelf_m", "shore_slope", "open_water_max_m")
+_OPTIONAL_PATH_LISTS = ("hand_bay", "hand_marsh", "hand_ponds")
+_OPTIONAL_FLOATS = ("smooth_m", "shelf_m", "shore_slope", "open_water_max_m",
+                    "pond_max_depth_m", "pond_shelf_m", "pond_bank_slope", "pond_bank_m")
+_NON_NEGATIVE = ("pond_bank_slope", "pond_bank_m")
 _OPTIONAL_INTS = ("shore_open_cells",)
+_OPTIONAL_STRING_LISTS = ("pond_classes",)
 _KNOWN = (*_REQUIRED, *_OPTIONAL_PATHS, *_OPTIONAL_PATH_LISTS, *_OPTIONAL_FLOATS,
-          *_OPTIONAL_INTS)
+          *_OPTIONAL_INTS, *_OPTIONAL_STRING_LISTS)
 
 
 @dataclass(frozen=True)
@@ -35,6 +38,7 @@
     marsh: Path | None = None
     hand_bay: list[Path] = field(default_factory=list)
     hand_marsh: list[Path] = field(default_factory=list)
+    hand_ponds: list[Path] = field(default_factory=list)
     landforms: Path | None = None
     checks: Path | None = None
     # Overrides of the CLI defaults; None means "use the CLI/default value".
@@ -43,6 +47,13 @@
     shore_slope: float | None = None
     shore_open_cells: int | None = None
     open_water_max_m: float | None = None
+    # Ponds: HabitatCla values (SFEI) that are freshwater ponds; None = the built-in
+    # default list (yelamu.ponds.DEFAULT_POND_CLASSES), [] = no SFEI ponds.
+    pond_classes: list[str] | None = None
+    pond_max_depth_m: float | None = None
+    pond_shelf_m: float | None = None
+    pond_bank_slope: float | None = None  # >= 0; 0 disables bank grading
+    pond_bank_m: float | None = None  # >= 0
 
 
 def _is_number(v: Any) -> bool:
@@ -116,6 +127,8 @@
             continue
         if not _is_number(value):
             raise fail(f"{key} must be a number or null, got {value!r}")
+        if key in _NON_NEGATIVE and value < 0:
+            raise fail(f"{key} must be 0 or greater, got {value!r}")
         kwargs[key] = float(value)
     for key in _OPTIONAL_INTS:
         value = data.get(key)
@@ -124,4 +137,13 @@
         if not isinstance(value, int) or isinstance(value, bool):
             raise fail(f"{key} must be an integer or null, got {value!r}")
         kwargs[key] = value
+    for key in _OPTIONAL_STRING_LISTS:
+        value = data.get(key)
+        if value is None:
+            continue
+        if not isinstance(value, list) or not all(
+            isinstance(v, str) and v.strip() for v in value
+        ):
+            raise fail(f"{key} must be a list of non-empty strings")
+        kwargs[key] = [v.strip() for v in value]
     return Region(**kwargs)
PATCH
```

`pipeline/yelamu/cli.py` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/pipeline/yelamu/cli.py
+++ b/pipeline/yelamu/cli.py
@@ -12,17 +12,37 @@
 
 from yelamu.checks import load_expectations, run_checks
 from yelamu.export import Layer, write_assets
-from yelamu.geo import Grid, lonlat_to_utm
+from yelamu.geo import Grid
 from yelamu.habitat import apply_overrides, rasterize_habitats
+from yelamu.landforms import apply_landforms, landform_provenance, load_landforms
+from yelamu.ponds import (
+    DEFAULT_BANK_M,
+    DEFAULT_BANK_SLOPE,
+    DEFAULT_MAX_DEPTH_M,
+    DEFAULT_POND_CLASSES,
+    DEFAULT_SHELF_M,
+    MIN_POND_CELLS,
+    PONDS_FILE,
+    blend_pond_banks,
+    build_ponds,
+    carve_ponds,
+    hand_pond_specs,
+    pond_layer,
+    pond_mask,
+    pond_provenance_rows,
+    ponds_document,
+    sfei_pond_specs,
+    stamp_ponds_on_habitat,
+)
+from yelamu.provenance import hand_source_rows, layer_source_summary, lowest_confidence
 from yelamu.region import Region, load_region
-from yelamu.sources import load_dem, load_polygons
+from yelamu.sources import load_dem, load_features, load_polygons
 from yelamu.terrain import (
     apply_bay_shelf,
     apply_historical_water,
     apply_land_ramp,
     fill_missing_land,
     smooth_land,
-    stamp_landform,
 )
 from yelamu.water import remove_thin_unmapped_land, unmapped_open_water, water_mask
 
@@ -46,32 +66,60 @@
     habitats_path: Path | None = None,
     hand_bay_paths: Sequence[Path] = (),
     hand_marsh_paths: Sequence[Path] = (),
+    hand_pond_paths: Sequence[Path] = (),
+    pond_classes: Sequence[str] = DEFAULT_POND_CLASSES,
+    pond_max_depth_m: float = DEFAULT_MAX_DEPTH_M,
+    pond_shelf_m: float = DEFAULT_SHELF_M,
+    pond_bank_slope: float = DEFAULT_BANK_SLOPE,
+    pond_bank_m: float = DEFAULT_BANK_M,
 ) -> list[str]:
     """Run the pipeline. Returns the list of failed sanity checks (empty is good).
 
     `habitats_path` (the SFEI habitat GeoJSON) produces the habitat raster, and also
     serves as the coverage polygons when `coverage_path` is not given. Hand-drawn water
     files (`hand_bay_paths`, `hand_marsh_paths`) may be empty; their polygons are
-    added to the bay / marsh masks and count as mapped area for the gap rule.
+    added to the bay / marsh masks and count as mapped area for the gap rule. Every
+    hand-drawn feature, landform and hand pond must carry a source and a confidence
+    (ValueError otherwise). Freshwater ponds come from the SFEI classes in `pond_classes`
+    and from `hand_pond_paths`; they are carved last, after all other water edits.
     """
     grid = Grid.from_lonlat_bbox(*bbox, cell=cell)
     dem = load_dem(dem_path, grid, nodata=dem_nodata)
+    raw_dem = dem.copy()  # the modern DEM, for gap fill and pond levels
 
     bay = water_mask(load_polygons(bay_path) if bay_path else [], grid)
     marsh = water_mask(load_polygons(marsh_path) if marsh_path else [], grid)
 
-    hand_bay_polys = [
-        g for path in hand_bay_paths for g in load_polygons(path, allow_empty=True)
+    # Hand-drawn inputs are validated up front, so a missing source fails fast.
+    landforms = load_landforms(landforms_path, bbox) if landforms_path else []
+    hand_bay_feats = [
+        f for path in hand_bay_paths
+        for f in load_features(path, allow_empty=True, require_provenance=True)
     ]
-    hand_marsh_polys = [
-        g for path in hand_marsh_paths for g in load_polygons(path, allow_empty=True)
+    hand_marsh_feats = [
+        f for path in hand_marsh_paths
+        for f in load_features(path, allow_empty=True, require_provenance=True)
     ]
-    hand_bay = water_mask(hand_bay_polys, grid)
-    hand_marsh = water_mask(hand_marsh_polys, grid)
-    hand_used = bool(hand_bay_polys or hand_marsh_polys)
+    hand_pond_specs_all = []
+    for path in hand_pond_paths:
+        hand_pond_specs_all += hand_pond_specs(
+            load_features(path, allow_empty=True, require_provenance=True), path)
+    hand_bay = water_mask([f.geometry for f in hand_bay_feats], grid)
+    hand_marsh = water_mask([f.geometry for f in hand_marsh_feats], grid)
+    hand_water_feats = hand_bay_feats + hand_marsh_feats
+    hand_used = bool(hand_water_feats)
     # Where both are drawn, bay wins (apply_historical_water's usual rule).
     bay = bay | hand_bay
     marsh = marsh | hand_marsh
+
+    # Ponds: SFEI polygons of the pond classes plus the hand-drawn ones. Hand ponds count
+    # as mapped area for the gap rule, like the other hand-drawn water.
+    habitat_collection = json.loads(Path(habitats_path).read_text()) if habitats_path else None
+    pond_specs = list(hand_pond_specs_all)
+    if habitat_collection is not None:
+        pond_specs += sfei_pond_specs(habitat_collection, pond_classes)
+    ponds = build_ponds(pond_specs, raw_dem, grid, MIN_POND_CELLS, print)
+    hand_pond_cells = pond_mask([p for p in ponds if p.origin == "hand"], (grid.height, grid.width))
 
     # Where SFEI maps no habitat at all, the modern DEM stands in for open bay. Decide
     # this from the raw DEM, before smoothing or landform stamping change any elevation.
@@ -80,7 +128,8 @@
     coverage_src = coverage_path or habitats_path
     if coverage_src:
         # Hand-drawn polygons are mapped area too, so the gap fill never overrides them.
-        coverage = water_mask(load_polygons(coverage_src), grid) | hand_bay | hand_marsh
+        coverage = (water_mask(load_polygons(coverage_src), grid) | hand_bay | hand_marsh
+                    | hand_pond_cells)
         gap = unmapped_open_water(dem, coverage, open_water_max_m)
         bay = bay | gap
         print(
@@ -96,9 +145,7 @@
 
     habitat = habitat_classes = None
     if habitats_path:
-        habitat, habitat_classes, unknown = rasterize_habitats(
-            json.loads(Path(habitats_path).read_text()), grid
-        )
+        habitat, habitat_classes, unknown = rasterize_habitats(habitat_collection, grid)
         if unknown:
             print("WARNING: habitat classes not in the group mapping (shown as unmapped): "
                   + ", ".join(unknown), file=sys.stderr)
@@ -106,6 +153,7 @@
         # marsh under a bay cell stays bay, matching the heightmap.
         inferred = gap if removed is None or gap is None else gap | removed
         habitat = apply_overrides(habitat, inferred, hand_bay, hand_marsh & ~bay)
+        habitat = stamp_ponds_on_habitat(habitat, habitat_classes, ponds)
 
     # Blur away the modern street grid and building pads, using land cells only.
     if smooth_m > 0:
@@ -113,10 +161,7 @@
 
     # Landforms after smoothing, so stamps stay exact. The water edit and the clamp come
     # after the stamps so one near the shore can't raise the bay floor or dig dry land.
-    landforms = json.loads(Path(landforms_path).read_text()) if landforms_path else []
-    for lf in landforms:
-        x, y = lonlat_to_utm(lf["lon"], lf["lat"])
-        dem = stamp_landform(dem, grid, x, y, lf["radius_m"], lf["delta_m"])
+    dem = apply_landforms(dem, grid, landforms)
 
     dem = apply_historical_water(dem, bay, marsh)
     dem = fill_missing_land(dem)
@@ -125,6 +170,15 @@
     dem = apply_land_ramp(dem, bay | marsh, grid.cell, shore_slope)
     # Slope the bay floor up to the shore (shelf_m <= 0 keeps it flat), so no cliff.
     dem = apply_bay_shelf(dem, bay, cell, shelf_m)
+    # Ponds last: their beds are set from the polygon and level alone, so none of the
+    # edits above (ramp, shelf, smoothing, landforms) can touch them.
+    dem = carve_ponds(dem, ponds, cell, pond_max_depth_m, pond_shelf_m)
+    # Grade the ground around the ponds (land cells only) so there is no wall or dam.
+    dem = blend_pond_banks(dem, grid, ponds, ~(bay | marsh), pond_bank_slope, pond_bank_m)
+    if ponds:
+        n_sfei = sum(p.origin == "sfei" for p in ponds)
+        print(f"Carved {len(ponds)} ponds ({n_sfei} from SFEI, {len(ponds) - n_sfei} hand-drawn), "
+              f"{int(pond_mask(ponds, dem.shape).sum())} cells")
 
     layers = [
         Layer("terrain", "USGS 3DEP, modified", "inferred", "USGS 3DEP; see docs/research"),
@@ -138,15 +192,25 @@
             Layer("open_water_gap_fill", "modern DEM where SFEI maps no habitat", "inferred",
                   "USGS 3DEP; gap fill by this project")
         )
+    hand_sources: list[dict] = []
     if hand_used:
+        pairs = [(f.source, f.confidence) for f in hand_water_feats]
         layers.append(
-            Layer("hand_water", "hand-drawn from historical maps (user-authored)", "inferred",
-                  "this project")
-        )
+            Layer("hand_water", layer_source_summary("hand-drawn", [p[0] for p in pairs]),
+                  lowest_confidence(p[1] for p in pairs), "this project")
+        )
+        hand_sources += hand_source_rows("hand_water", pairs)
     if landforms:
+        pairs = landform_provenance(landforms)
         layers.append(
-            Layer("landforms", "hand-sculpted corrections", "illustrative", "this project")
-        )
+            Layer("landforms", layer_source_summary("hand-sculpted", [p[0] for p in pairs]),
+                  lowest_confidence(p[1] for p in pairs), "this project")
+        )
+        hand_sources += hand_source_rows("landforms", pairs)
+    pond_meta_layer = pond_layer(ponds)
+    if pond_meta_layer is not None:
+        layers.append(pond_meta_layer)
+        hand_sources += pond_provenance_rows(ponds)
     processing = {
         "smooth_m": smooth_m,
         "shelf_m": shelf_m,
@@ -154,11 +218,36 @@
         "shore_open_cells": shore_open_cells,
         "open_water_max_m": open_water_max_m,
         "coverage": coverage_src is not None,
+        "pond_classes": list(pond_classes),
+        "pond_max_depth_m": pond_max_depth_m,
+        "pond_shelf_m": pond_shelf_m,
+        "pond_bank_slope": pond_bank_slope,
+        "pond_bank_m": pond_bank_m,
     }
-    write_assets(dem, grid, layers, out_dir, processing, habitat, habitat_classes)
+    extra_meta: dict = {}
+    if ponds:
+        extra_meta["ponds_file"] = PONDS_FILE
+    if hand_sources:
+        extra_meta["hand_sources"] = sorted(
+            hand_sources, key=lambda r: (r["layer"], r["source"], r["confidence"]))
+    write_assets(dem, grid, layers, out_dir, processing, habitat, habitat_classes, extra_meta)
+
+    ponds_path = Path(out_dir) / PONDS_FILE
+    if ponds:
+        document = ponds_document(ponds, grid, {
+            "max_depth_m": pond_max_depth_m,
+            "shelf_m": pond_shelf_m,
+            "min_cells": MIN_POND_CELLS,
+            "classes": list(pond_classes),
+            "level": "level_m if given, else the median of the raw modern DEM in the polygon",
+        })
+        ponds_path.write_text(json.dumps(document, separators=(",", ":")))
+    elif ponds_path.exists():
+        ponds_path.unlink()  # a stale file from an earlier build must not outlive its meta key
 
     if checks_path:
-        return run_checks(dem, grid, load_expectations(checks_path))
+        return run_checks(dem, grid, load_expectations(checks_path),
+                          pond_mask(ponds, dem.shape) if ponds else None)
     return []
 
 
@@ -174,10 +263,14 @@
         "marsh": region.marsh,
         "hand_bay": region.hand_bay,
         "hand_marsh": region.hand_marsh,
+        "hand_ponds": region.hand_ponds,
         "landforms": region.landforms,
         "checks": region.checks,
     }
-    for key in ("smooth_m", "shelf_m", "shore_slope", "shore_open_cells", "open_water_max_m"):
+    if region.pond_classes is not None:
+        defaults["pond_classes"] = list(region.pond_classes)
+    for key in ("smooth_m", "shelf_m", "shore_slope", "shore_open_cells", "open_water_max_m",
+                "pond_max_depth_m", "pond_shelf_m", "pond_bank_slope", "pond_bank_m"):
         if getattr(region, key) is not None:
             defaults[key] = getattr(region, key)
     return defaults
@@ -205,6 +298,24 @@
                    help="GeoJSON file(s) of hand-drawn bay polygons (may be empty)")
     p.add_argument("--hand-marsh", type=Path, nargs="+", default=[],
                    help="GeoJSON file(s) of hand-drawn marsh polygons (may be empty)")
+    p.add_argument("--hand-ponds", type=Path, nargs="+", default=[],
+                   help="GeoJSON file(s) of hand-drawn freshwater ponds (may be empty); "
+                        "each feature needs properties.source and .confidence, and may have "
+                        "level_m, name, id")
+    p.add_argument("--pond-classes", nargs="+", default=list(DEFAULT_POND_CLASSES),
+                   metavar="CLASS",
+                   help="SFEI HabitatCla values that are freshwater ponds (default: the four "
+                        "pond/lake/lagoon classes; 'Tidal coastal lagoon' is not included)")
+    p.add_argument("--pond-max-depth-m", type=float, default=DEFAULT_MAX_DEPTH_M,
+                   help="depth (m) of a pond bed below its water level, reached over "
+                        "--pond-shelf-m from the shore")
+    p.add_argument("--pond-shelf-m", type=float, default=DEFAULT_SHELF_M,
+                   help="distance (m) over which a pond bed deepens from the shore to full depth")
+    p.add_argument("--pond-bank-slope", type=float, default=DEFAULT_BANK_SLOPE,
+                   help="maximum slope (m per m) of the graded bank around a pond; "
+                        "0 disables the grading")
+    p.add_argument("--pond-bank-m", type=float, default=DEFAULT_BANK_M,
+                   help="how far (m) from a pond shore the bank grading reaches")
     p.add_argument("--coverage", type=Path,
                    help="GeoJSON of ALL habitat polygons (the area SFEI mapped); where it "
                         "has none and the DEM is low, the cell is open bay")
@@ -251,6 +362,9 @@
         args.coverage, args.open_water_max_m,
         args.smooth_m, args.shelf_m, args.shore_open_cells, args.shore_slope,
         args.habitats, args.hand_bay, args.hand_marsh,
+        hand_pond_paths=args.hand_ponds, pond_classes=args.pond_classes,
+        pond_max_depth_m=args.pond_max_depth_m, pond_shelf_m=args.pond_shelf_m,
+        pond_bank_slope=args.pond_bank_slope, pond_bank_m=args.pond_bank_m,
     )
     if failures:
         print("Sanity checks FAILED:", file=sys.stderr)
@@ -261,5 +375,14 @@
     return 0
 
 
+def cli_entry(argv: list[str] | None = None) -> int:
+    """main() for the command line: input errors print one line instead of a traceback."""
+    try:
+        return main(argv)
+    except (ValueError, FileNotFoundError) as exc:
+        print(f"error: {exc}", file=sys.stderr)
+        return 1
+
+
 if __name__ == "__main__":
-    raise SystemExit(main())
+    raise SystemExit(cli_entry())
PATCH
```

`pipeline/regions/full-city.json` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/pipeline/regions/full-city.json
+++ b/pipeline/regions/full-city.json
@@ -8,6 +8,13 @@
   "marsh": "data/raw/marsh.geojson",
   "hand_bay": ["data/full-city/hand/hand_bay.geojson"],
   "hand_marsh": ["data/full-city/hand/hand_marsh.geojson"],
+  "hand_ponds": ["data/full-city/hand/hand_ponds.geojson"],
+  "pond_classes": [
+    "Dune-dammed pond or lake",
+    "Dune-dammed headwater lake",
+    "Barrier beach-impounded freshwater lagoon",
+    "Other pond or lake"
+  ],
   "landforms": "data/full-city/landforms.json",
   "checks": "data/full-city/checks.json",
   "out": "../viewer/public/assets/real-city"
PATCH
```

- [ ] **Step 4: Run the whole suite**

Run: `cd pipeline && uv run pytest -q -W error`

Expected: **504 passed, 1 skipped**, no warnings.

- [ ] **Step 5: Commit**

```bash
git add pipeline/tests/test_region.py pipeline/tests/test_pipeline.py pipeline/yelamu/region.py pipeline/yelamu/cli.py pipeline/regions/full-city.json
git commit -m "feat(pipeline): wire provenance, landforms and ponds into the build"
```

---

### Task V1: Pond data: types and strict parser

**Files:**
- Create: `viewer/src/ponds/parse.test.ts`
- Create: `viewer/src/ponds/types.ts`
- Create: `viewer/src/ponds/parse.ts`
- Modify: `viewer/src/nodeTestShims.d.ts`
- Modify: `viewer/src/heightmap.ts`

The viewer's contract with `ponds.json` (world metres like `overlay.json`; the first ring is the outer ring, later rings are holes). `parsePonds` validates everything it reads (ids, levels, rings, caps) and names the offending pond in the error, as the overlay parser does. `loadPonds` returns `null` when `meta.ponds_file` is absent and refuses file names with slashes or `..`. `heightmap.ts` gains the optional `ponds_file` and `hand_sources` meta keys.

- [ ] **Step 1: Add the tests**

`viewer/src/ponds/parse.test.ts`

```ts
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_COORD_M, MAX_PONDS, MAX_POND_POINTS, loadPonds, parsePonds } from "./parse";

const SQUARE = [0, 0, 10, 0, 10, 10, 0, 10];
const pond = (over: Record<string, unknown> = {}) => ({
  id: "lake-merced-north",
  name: "Lake Merced (north)",
  level_m: 5.6,
  source: "Hand-drawn from the 1869 coast survey",
  confidence: "inferred",
  rings: [SQUARE],
  ...over,
});
const doc = (over: Record<string, unknown> = {}) => ({
  version: 1,
  ponds: [pond()],
  processing: { carve_depth_m: 1.5 },
  ...over,
});

describe("parsePonds: valid input", () => {
  it("accepts a complete document and returns a clean copy", () => {
    const raw = doc({ extra: "ignored" });
    (raw.ponds[0] as Record<string, unknown>).junk = 1;
    const p = parsePonds(raw);
    expect(p.version).toBe(1);
    expect(p.ponds).toEqual([pond()]);
    expect(p).not.toHaveProperty("extra");
    expect(p).not.toHaveProperty("processing");
    expect(p.ponds[0]).not.toHaveProperty("junk");
    expect(p.ponds[0].rings[0]).not.toBe((raw.ponds[0] as { rings: number[][] }).rings[0]);
  });

  it("accepts an empty list, a null name, holes, and every confidence", () => {
    expect(parsePonds(doc({ ponds: [] })).ponds).toEqual([]);
    expect(parsePonds(doc({ ponds: [pond({ name: null })] })).ponds[0].name).toBeNull();
    const holes = parsePonds(doc({ ponds: [pond({ rings: [[0, 0, 100, 0, 100, 100, 0, 100], [40, 40, 60, 40, 60, 60]] })] }));
    expect(holes.ponds[0].rings).toHaveLength(2);
    for (const confidence of ["documented", "inferred", "illustrative"]) {
      parsePonds(doc({ ponds: [pond({ confidence })] }));
    }
  });

  it("accepts boundary values: level limits, 3-point rings, long names, coordinate limits", () => {
    parsePonds(doc({ ponds: [pond({ level_m: -100 }), pond({ id: "b", level_m: 1000 })] }));
    parsePonds(doc({ ponds: [pond({ name: "x".repeat(120), source: "s".repeat(300) })] }));
    parsePonds(doc({ ponds: [pond({ rings: [[-MAX_COORD_M, -MAX_COORD_M, MAX_COORD_M, 0, 0, MAX_COORD_M]] })] }));
    parsePonds(doc({ ponds: [pond({ id: "0", level_m: 0 }), pond({ id: "a-1-b" })] }));
  });

  it("turns a whitespace-only name into null", () => {
    expect(parsePonds(doc({ ponds: [pond({ name: "   " })] })).ponds[0].name).toBeNull();
  });

  it("keeps closed rings as given (the geometry step handles the repeated point)", () => {
    const closed = [0, 0, 10, 0, 10, 10, 0, 0];
    expect(parsePonds(doc({ ponds: [pond({ rings: [closed] })] })).ponds[0].rings[0]).toEqual(closed);
  });
});

describe("parsePonds: top level", () => {
  it("rejects non-objects", () => {
    for (const bad of [null, undefined, 5, "x", [], true]) {
      expect(() => parsePonds(bad)).toThrow(/JSON object/);
    }
  });

  it("rejects a wrong or missing version", () => {
    expect(() => parsePonds(doc({ version: 2 }))).toThrow(/version 2/);
    expect(() => parsePonds(doc({ version: "1" }))).toThrow(/version "1"/);
    const { version: _v, ...rest } = doc();
    void _v;
    expect(() => parsePonds(rest)).toThrow(/version/);
  });

  it("rejects a missing or non-array ponds list", () => {
    expect(() => parsePonds(doc({ ponds: {} }))).toThrow(/ponds: must be an array/);
    expect(() => parsePonds(doc({ ponds: undefined }))).toThrow(/ponds: must be an array/);
    expect(() => parsePonds(doc({ ponds: "no" }))).toThrow(/ponds: must be an array/);
  });

  it("caps the number of ponds", () => {
    const many = Array.from({ length: MAX_PONDS + 1 }, (_, i) => pond({ id: `p${i}` }));
    expect(() => parsePonds(doc({ ponds: many }))).toThrow(/more than the limit of 2000/);
    parsePonds(doc({ ponds: many.slice(0, MAX_PONDS) }));
  });
});

describe("parsePonds: ids", () => {
  it("names the index and rejects non-objects", () => {
    expect(() => parsePonds(doc({ ponds: [pond(), 5] }))).toThrow(/ponds\[1\]: must be an object/);
    expect(() => parsePonds(doc({ ponds: [null] }))).toThrow(/ponds\[0\]: must be an object/);
  });

  it("rejects malformed ids", () => {
    for (const id of ["", "Upper", "-lead", "has space", "under_score", "a/b", "é", 5, null, undefined]) {
      expect(() => parsePonds(doc({ ponds: [pond({ id })] }))).toThrow(/ponds\[0\]: id .* must match/);
    }
  });

  it("rejects duplicate ids, naming both indices", () => {
    expect(() => parsePonds(doc({ ponds: [pond(), pond({ id: "other" }), pond()] }))).toThrow(
      /ponds\[2\] \(lake-merced-north\): duplicate id "lake-merced-north" \(already used by ponds\[0\]\)/,
    );
  });
});

describe("parsePonds: fields", () => {
  const bad = (over: Record<string, unknown>) => () => parsePonds(doc({ ponds: [pond(), pond({ id: "second", ...over })] }));

  it("names index and id in every field error", () => {
    expect(bad({ level_m: "high" })).toThrow(/ponds\[1\] \(second\): level_m must be a finite number/);
  });

  it("validates the name", () => {
    expect(bad({ name: 5 })).toThrow(/name must be a string or null/);
    expect(bad({ name: undefined })).toThrow(/name must be a string or null/);
    expect(bad({ name: "x".repeat(121) })).toThrow(/name is longer than 120/);
  });

  it("validates level_m", () => {
    for (const level_m of [NaN, Infinity, -Infinity, null, undefined, "1"]) {
      expect(bad({ level_m })).toThrow(/level_m must be a finite number/);
    }
    expect(bad({ level_m: -100.01 })).toThrow(/level_m must be within -100..1000/);
    expect(bad({ level_m: 1000.5 })).toThrow(/level_m must be within -100..1000/);
  });

  it("validates the source", () => {
    expect(bad({ source: "" })).toThrow(/source must not be blank/);
    expect(bad({ source: "   " })).toThrow(/source must not be blank/);
    expect(bad({ source: 5 })).toThrow(/source must not be blank/);
    expect(bad({ source: "s".repeat(301) })).toThrow(/source is longer than 300/);
  });

  it("validates the confidence", () => {
    expect(bad({ confidence: "certain" })).toThrow(/confidence "certain" is not one of/);
    expect(bad({ confidence: undefined })).toThrow(/confidence undefined is not one of/);
  });
});

describe("parsePonds: rings", () => {
  const withRings = (rings: unknown) => () => parsePonds(doc({ ponds: [pond({ rings })] }));

  it("needs a non-empty array of rings", () => {
    expect(withRings([])).toThrow(/ponds\[0\] \(lake-merced-north\): rings must be a non-empty array/);
    expect(withRings("x")).toThrow(/rings must be a non-empty array/);
    expect(withRings(undefined)).toThrow(/rings must be a non-empty array/);
  });

  it("rejects rings that are not flat arrays, odd, or shorter than three points", () => {
    expect(withRings([5])).toThrow(/ring 0: must be a flat array of numbers/);
    expect(withRings([[[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]])).toThrow(/ring 0: value 0 is not a finite number/);
    expect(withRings([[0, 0, 1, 1, 2, 2, 3]])).toThrow(/odd number of values \(7\)/);
    expect(withRings([[0, 0, 1, 1]])).toThrow(/needs at least 3 points, has 2/);
    expect(withRings([[]])).toThrow(/needs at least 3 points, has 0/);
    expect(withRings([SQUARE, [0, 0, 1, 1]])).toThrow(/ring 1: needs at least 3 points/);
  });

  it("rejects non-finite and out-of-range coordinates", () => {
    expect(withRings([[0, 0, 1, 1, 2, NaN]])).toThrow(/value 5 is not a finite number/);
    expect(withRings([[0, 0, 1, 1, Infinity, 2]])).toThrow(/value 4 is not a finite number/);
    expect(withRings([[0, 0, 1, 1, 2, "3"]])).toThrow(/value 5 is not a finite number/);
    expect(withRings([[0, 0, 1, 1, 2, null]])).toThrow(/value 5 is not a finite number/);
    expect(withRings([[0, 0, 1, 1, 2, MAX_COORD_M + 1]])).toThrow(/value 5 is out of range/);
    expect(withRings([[0, 0, 1, 1, -MAX_COORD_M - 1, 2]])).toThrow(/value 4 is out of range/);
  });

  it("caps the total number of ring points across all ponds", () => {
    const ring = (points: number) => Array.from({ length: points * 2 }, (_, i) => i % 7);
    const big = MAX_POND_POINTS / 2;
    parsePonds(doc({ ponds: [pond({ rings: [ring(big)] }), pond({ id: "b", rings: [ring(big)] })] }));
    expect(() =>
      parsePonds(doc({ ponds: [pond({ rings: [ring(big)] }), pond({ id: "b", rings: [ring(big), ring(3)] })] })),
    ).toThrow(/ponds\[1\] \(b\): ponds hold more than 400000 ring points/);
  });
});

describe("loadPonds", () => {
  const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });

  it("returns null when the dataset has no ponds_file (and does not fetch)", async () => {
    let called = false;
    const f = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };
    expect(await loadPonds("/assets/x", {}, f)).toBeNull();
    expect(await loadPonds("/assets/x", { ponds_file: "" }, f)).toBeNull();
    expect(called).toBe(false);
  });

  it("fetches base/file and parses it", async () => {
    let seen = "";
    const p = await loadPonds("/assets/x", { ponds_file: "ponds.json" }, async (u) => {
      seen = u;
      return { ok: true, status: 200, json: async () => doc() };
    });
    expect(seen).toBe("/assets/x/ponds.json");
    expect(p?.ponds[0].id).toBe("lake-merced-north");
  });

  it("reports the URL and status of a failed request", async () => {
    await expect(
      loadPonds("/a", { ponds_file: "ponds.json" }, async () => ({ ok: false, status: 404, json: async () => ({}) })),
    ).rejects.toThrow("failed to fetch /a/ponds.json: HTTP 404");
  });

  it("propagates a network failure", async () => {
    await expect(
      loadPonds("/a", { ponds_file: "ponds.json" }, async () => {
        throw new TypeError("network down");
      }),
    ).rejects.toThrow("network down");
  });

  it("reports the URL for invalid JSON and for invalid content", async () => {
    await expect(
      loadPonds("/a", { ponds_file: "ponds.json" }, async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      })),
    ).rejects.toThrow(/\/a\/ponds\.json: not valid JSON/);
    await expect(loadPonds("/a", { ponds_file: "ponds.json" }, ok({ version: 9 }))).rejects.toThrow(
      /\/a\/ponds\.json: ponds: unsupported version 9/,
    );
  });

  it("refuses file names that could leave the dataset folder", async () => {
    for (const f of ["../x.json", "a/b.json", "/etc/passwd", "..", "a..b", "a\\b.json", "https://evil.example/x.json"]) {
      await expect(loadPonds("/a", { ponds_file: f }, ok(doc()))).rejects.toThrow(/unsupported ponds_file/);
    }
  });
});

// The synthetic dataset is generated (npm run make:city-synth && npm run make:ponds-synth),
// so this only runs where it has been generated.
const synthUrl = new URL("../../public/assets/city-synth/ponds.json", import.meta.url);
describe.skipIf(!existsSync(synthUrl))("generated synthetic ponds.json", () => {
  it("parses with the strict validator", () => {
    const p = parsePonds(JSON.parse(readFileSync(synthUrl, "utf8")));
    expect(p.ponds.length).toBeGreaterThanOrEqual(2);
    expect(p.ponds.some((x) => x.rings.length > 1)).toBe(true);
    for (const x of p.ponds) expect(x.confidence).toBe("illustrative");
  });
});
```

`viewer/src/nodeTestShims.d.ts` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/viewer/src/nodeTestShims.d.ts
+++ b/viewer/src/nodeTestShims.d.ts
@@ -1,4 +1,5 @@
-// Tests run in Node but the project has no @types/node; declare the one call they use.
+// Tests run in Node but the project has no @types/node; declare the calls they use.
 declare module "node:fs" {
   export function readFileSync(path: URL, encoding: "utf8"): string;
+  export function existsSync(path: URL): boolean;
 }
PATCH
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd viewer && npx vitest run src/ponds`

Expected: **FAIL** (the code under test does not exist yet, or the new assertions do not hold yet).

- [ ] **Step 3: Write the implementation**

`viewer/src/ponds/types.ts`

```ts
import type { Confidence } from "../heightmap";

/**
 * One freshwater pond or lagoon: a flat water surface at its own level, drawn over a bed
 * the pipeline carved below `level_m`.
 *
 * Coordinates are world metres in the viewer frame, like overlay.json and terrainMesh.ts:
 * +x east, +z south, origin at the grid centre. `rings[0]` is the outer boundary, any
 * further rings are holes (islands). Each ring is a flat [x0, z0, x1, z1, ...] list, open
 * or closed (a repeated first point is tolerated), either winding.
 */
export interface Pond {
  id: string;
  /** Visitor-facing name, or null for an unnamed pond. */
  name: string | null;
  /** Water surface height in real metres above the datum (the viewer applies the exaggeration). */
  level_m: number;
  source: string;
  confidence: Confidence;
  rings: number[][];
}

export interface Ponds {
  version: 1;
  ponds: Pond[];
}
```

`viewer/src/ponds/parse.ts`

```ts
import type { HeightmapMeta } from "../heightmap";
import { CONFIDENCES } from "../overlay/types";
import type { Pond, Ponds } from "./types";

/** Protective caps: a hostile or broken file must not be able to exhaust memory. */
export const MAX_PONDS = 2000;
export const MAX_POND_POINTS = 400_000;
export const MAX_NAME_CHARS = 120;
export const MAX_SOURCE_CHARS = 300;
/** World coordinates (metres from the terrain centre) must stay within this. */
export const MAX_COORD_M = 1e6;
/** Water levels in real metres; anything outside is a pipeline mistake, not a lake. */
export const MIN_LEVEL_M = -100;
export const MAX_LEVEL_M = 1000;

const ID = /^[a-z0-9][a-z0-9-]*$/;

function fail(where: string, what: string): never {
  throw new Error(`ponds: ${where}: ${what}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseRings(v: unknown, label: string, budget: { points: number }): number[][] {
  if (!Array.isArray(v) || v.length === 0) fail(label, "rings must be a non-empty array");
  return v.map((ring: unknown, j: number) => {
    const rw = `${label} ring ${j}`;
    if (!Array.isArray(ring)) fail(rw, "must be a flat array of numbers");
    if (ring.length % 2 !== 0) fail(rw, `has an odd number of values (${ring.length})`);
    if (ring.length < 6) fail(rw, `needs at least 3 points, has ${ring.length / 2}`);
    budget.points += ring.length / 2;
    if (budget.points > MAX_POND_POINTS) {
      fail(label, `ponds hold more than ${MAX_POND_POINTS} ring points in total`);
    }
    const out = new Array<number>(ring.length);
    for (let k = 0; k < ring.length; k++) {
      const n: unknown = ring[k];
      if (typeof n !== "number" || !Number.isFinite(n)) fail(rw, `value ${k} is not a finite number`);
      if (Math.abs(n) > MAX_COORD_M) {
        fail(rw, `value ${k} is out of range (must be within ±1e6 metres), got ${n}`);
      }
      out[k] = n;
    }
    return out;
  });
}

/**
 * Validate untrusted ponds JSON and return a clean copy (only the known fields; the
 * pipeline's `processing` block and anything else is dropped). A name that is only
 * whitespace becomes null. Throws an Error naming the pond index and id.
 */
export function parsePonds(raw: unknown): Ponds {
  if (!isRecord(raw)) throw new Error("ponds: the file must be a JSON object");
  if (raw.version !== 1) {
    throw new Error(`ponds: unsupported version ${JSON.stringify(raw.version)} (expected 1)`);
  }
  const list = raw.ponds;
  if (!Array.isArray(list)) fail("ponds", "must be an array");
  if (list.length > MAX_PONDS) fail("ponds", `has ${list.length} entries, more than the limit of ${MAX_PONDS}`);

  const seen = new Map<string, number>();
  const budget = { points: 0 };
  const ponds = list.map((p: unknown, i: number): Pond => {
    const where = `ponds[${i}]`;
    if (!isRecord(p)) fail(where, "must be an object");
    if (typeof p.id !== "string" || !ID.test(p.id)) {
      fail(where, `id ${JSON.stringify(p.id)} must match ${ID.source}`);
    }
    const id = p.id;
    const label = `${where} (${id})`;
    const first = seen.get(id);
    if (first !== undefined) fail(label, `duplicate id "${id}" (already used by ponds[${first}])`);
    seen.set(id, i);

    let name: string | null;
    if (p.name === null) name = null;
    else if (typeof p.name === "string") {
      if (p.name.length > MAX_NAME_CHARS) fail(label, `name is longer than ${MAX_NAME_CHARS} characters`);
      name = p.name.trim() === "" ? null : p.name;
    } else fail(label, "name must be a string or null");

    const level = p.level_m;
    if (typeof level !== "number" || !Number.isFinite(level)) fail(label, "level_m must be a finite number");
    if (level < MIN_LEVEL_M || level > MAX_LEVEL_M) {
      fail(label, `level_m must be within ${MIN_LEVEL_M}..${MAX_LEVEL_M} metres, got ${level}`);
    }

    if (typeof p.source !== "string" || p.source.trim() === "") fail(label, "source must not be blank");
    if (p.source.length > MAX_SOURCE_CHARS) fail(label, `source is longer than ${MAX_SOURCE_CHARS} characters`);

    const confidence = p.confidence;
    if (typeof confidence !== "string" || !(CONFIDENCES as readonly string[]).includes(confidence)) {
      fail(label, `confidence ${JSON.stringify(confidence)} is not one of ${CONFIDENCES.join(", ")}`);
    }

    return {
      id,
      name,
      level_m: level,
      source: p.source,
      confidence: confidence as Pond["confidence"],
      rings: parseRings(p.rings, label, budget),
    };
  });
  return { version: 1, ponds };
}

type FetchLike = (url: string) => Promise<Pick<Response, "ok" | "status" | "json">>;

/**
 * Fetch and validate the ponds file named by `meta.ponds_file` next to the heightmap.
 * Resolves null when the dataset has none. Rejects with the URL (and HTTP status) on a
 * failed request, or with the parser's message on bad content.
 */
export async function loadPonds(
  baseUrl: string,
  meta: Pick<HeightmapMeta, "ponds_file">,
  fetchImpl: FetchLike = (u) => fetch(u),
): Promise<Ponds | null> {
  const file = meta.ponds_file;
  if (file === undefined || file === null || file === "") return null;
  if (typeof file !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(file) || file.includes("..")) {
    throw new Error(`ponds: unsupported ponds_file ${JSON.stringify(file)}`);
  }
  const url = `${baseUrl}/${file}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: HTTP ${res.status}`);
  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new Error(`${url}: not valid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  try {
    return parsePonds(json);
  } catch (err) {
    throw new Error(`${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

`viewer/src/heightmap.ts` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/viewer/src/heightmap.ts
+++ b/viewer/src/heightmap.ts
@@ -7,6 +7,16 @@
   source: string;
   confidence: Confidence;
   attribution: string;
+}
+
+/** One row of `meta.hand_sources`: hand-drawn or sculpted features and where they come from. */
+export interface HandSource {
+  /** Pipeline layer: "hand_water", "landforms" or "ponds" (others are shown humanised). */
+  layer: string;
+  source: string;
+  confidence: Confidence;
+  /** How many polygons / landforms / ponds the layer contributed. */
+  count: number;
 }
 
 export interface HeightmapMeta {
@@ -24,6 +34,10 @@
   habitat_classes?: HabitatClass[];
   /** File name of the overlay (streets, landmarks, hotspots) next to the heightmap. */
   overlay_file?: string;
+  /** File name of the freshwater ponds (flat water surfaces) next to the heightmap. */
+  ponds_file?: string;
+  /** Hand-drawn and sculpted provenance, shown on the Sources panel (see handSourceRows). */
+  hand_sources?: HandSource[];
   /** Pipeline parameters, shown on the Sources panel (see provenanceData.ts). */
   processing?: Record<string, unknown>;
 }
PATCH
```

- [ ] **Step 4: Run the whole suite, the typecheck**

Run: `cd viewer && npx vitest run && npx tsc --noEmit`

Expected: **Tests  532 passed | 1 skipped (533)** (vitest), no type errors.

- [ ] **Step 5: Commit**

```bash
git add viewer/src/ponds/parse.test.ts viewer/src/ponds/types.ts viewer/src/ponds/parse.ts viewer/src/nodeTestShims.d.ts viewer/src/heightmap.ts
git commit -m "feat(viewer): validated pond data"
```

---

### Task V2: Pond surfaces: geometry and layer

**Files:**
- Create: `viewer/src/ponds/geometry.test.ts`
- Create: `viewer/src/ponds/layer.test.ts`
- Create: `viewer/src/ponds/geometry.ts`
- Create: `viewer/src/ponds/layer.ts`

`buildPondGeometry` triangulates a pond's rings into a flat surface at `(level_m + 0.05) × exaggeration` with `THREE.ShapeGeometry` (holes from the later rings). Shape points are `(x, -z)` and the result is rotated by `-π/2` about X so north stays north; the tests pin the orientation, the area of a square with a hole, and degenerate rings. `PondsLayer` makes one mesh per pond that shares the caller's water material (so ponds animate with the sea and follow the Water motion toggle) and disposes only its geometries.

- [ ] **Step 1: Add the tests**

`viewer/src/ponds/geometry.test.ts`

```ts
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { POND_SURFACE_LIFT_M, buildPondGeometry, ringArea } from "./geometry";
import type { Pond } from "./types";

/** `rings` is a list of rings, or a single flat ring as a shorthand. */
const pond = (rings: number[][] | number[], over: Partial<Pond> = {}): Pond => ({
  id: "test-pond",
  name: null,
  level_m: 5,
  source: "test",
  confidence: "illustrative",
  rings: (typeof rings[0] === "number" ? [rings] : rings) as number[][],
  ...over,
});
const square = (x0: number, z0: number, x1: number, z1: number) => [x0, z0, x1, z0, x1, z1, x0, z1];

function positions(g: THREE.BufferGeometry) {
  const p = g.getAttribute("position");
  return Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)] as const);
}
function triangles(g: THREE.BufferGeometry) {
  const idx = g.getIndex()!;
  const p = g.getAttribute("position");
  const out: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [];
  for (let i = 0; i < idx.count; i += 3) {
    out.push([0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, idx.getX(i + k))) as [THREE.Vector3, THREE.Vector3, THREE.Vector3]);
  }
  return out;
}
/** Area in the x/z plane; the triangle normals must also face up (+y). */
function areaXZ(g: THREE.BufferGeometry) {
  return triangles(g).reduce((sum, [a, b, c]) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    return sum + n.y / 2; // signed: positive when the face points up
  }, 0);
}

describe("ringArea", () => {
  it("is signed shoelace area in the x/z plane, ignoring a repeated closing point", () => {
    expect(ringArea(square(0, 0, 10, 10))).toBe(100);
    expect(ringArea([0, 0, 0, 10, 10, 10, 10, 0])).toBe(-100);
    expect(ringArea([...square(0, 0, 10, 10), 0, 0])).toBe(100);
    expect(ringArea([0, 0, 5, 5, 10, 10])).toBe(0);
  });

  it("stays accurate far from the origin", () => {
    expect(ringArea(square(900000, 900000, 900010, 900010))).toBeCloseTo(100, 6);
  });
});

describe("buildPondGeometry", () => {
  it("makes a square from two triangles on a flat surface at (level + lift) * exaggeration", () => {
    const g = buildPondGeometry(pond(square(10, 20, 30, 50), { level_m: 5.6 }), 3)!;
    expect(g.getIndex()!.count / 3).toBe(2);
    const y = Math.fround((5.6 + POND_SURFACE_LIFT_M) * 3);
    for (const [, vy] of positions(g)) expect(vy).toBe(y);
    expect(POND_SURFACE_LIFT_M).toBe(0.05);
  });

  it("keeps vertices within the ring bounds in world x/z", () => {
    const ring = [100, -50, 220, -10, 260, 80, 150, 140, 90, 60];
    const g = buildPondGeometry(pond([ring]), 3)!;
    for (const [x, , z] of positions(g)) {
      expect(x).toBeGreaterThanOrEqual(90);
      expect(x).toBeLessThanOrEqual(260);
      expect(z).toBeGreaterThanOrEqual(-50);
      expect(z).toBeLessThanOrEqual(140);
    }
    // Every ring point is a vertex at its own (x, z).
    const have = new Set(positions(g).map(([x, , z]) => `${x},${z}`));
    for (let i = 0; i < ring.length; i += 2) expect(have.has(`${ring[i]},${ring[i + 1]}`)).toBe(true);
  });

  it("does not mirror north and south: a pond at negative z (north) has vertices at negative z", () => {
    const north = buildPondGeometry(pond(square(0, -300, 100, -200)), 1)!;
    for (const [, , z] of positions(north)) expect(z).toBeLessThan(0);
    const south = buildPondGeometry(pond(square(0, 200, 100, 300)), 1)!;
    for (const [, , z] of positions(south)) expect(z).toBeGreaterThan(0);
    // East stays east too.
    const east = buildPondGeometry(pond(square(200, 0, 300, 100)), 1)!;
    for (const [x] of positions(east)) expect(x).toBeGreaterThan(0);
  });

  it("faces up whichever way the ring winds, with +y normals", () => {
    const ccw = square(0, 0, 40, 40);
    const cw = [0, 0, 0, 40, 40, 40, 40, 0];
    for (const ring of [ccw, cw]) {
      const g = buildPondGeometry(pond([ring]), 3)!;
      expect(areaXZ(g)).toBeCloseTo(1600, 3);
      const n = g.getAttribute("normal");
      for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeCloseTo(1, 6);
    }
  });

  it("triangulates a square with a square hole to outer minus hole", () => {
    const g = buildPondGeometry(pond([square(0, 0, 100, 100), square(40, 40, 60, 60)]), 3)!;
    expect(areaXZ(g)).toBeCloseTo(100 * 100 - 20 * 20, 3);
    // No triangle centre falls inside the hole.
    for (const [a, b, c] of triangles(g)) {
      const cx = (a.x + b.x + c.x) / 3;
      const cz = (a.z + b.z + c.z) / 3;
      expect(cx > 40 && cx < 60 && cz > 40 && cz < 60).toBe(false);
    }
  });

  it("handles holes wound either way and a closed outer ring", () => {
    const outerClosed = [...square(0, 0, 100, 100), 0, 0];
    const holeCw = [40, 40, 40, 60, 60, 60, 60, 40];
    const g = buildPondGeometry(pond([outerClosed, holeCw]), 1)!;
    expect(areaXZ(g)).toBeCloseTo(9600, 3);
  });

  it("supports several holes", () => {
    const g = buildPondGeometry(pond([square(0, 0, 100, 100), square(10, 10, 20, 20), square(60, 60, 80, 80)]), 1)!;
    expect(areaXZ(g)).toBeCloseTo(10000 - 100 - 400, 3);
  });

  it("scales only y with the exaggeration", () => {
    const a = buildPondGeometry(pond(square(0, 0, 10, 10), { level_m: 2 }), 1)!;
    const b = buildPondGeometry(pond(square(0, 0, 10, 10), { level_m: 2 }), 4)!;
    expect(positions(a)[0][1]).toBeCloseTo(2.05, 5);
    expect(positions(b)[0][1]).toBeCloseTo(8.2, 5);
    expect(positions(a).map(([x, , z]) => [x, z])).toEqual(positions(b).map(([x, , z]) => [x, z]));
  });

  it("handles negative levels", () => {
    const g = buildPondGeometry(pond(square(0, 0, 10, 10), { level_m: -2 }), 3)!;
    expect(positions(g)[0][1]).toBeCloseTo((-2 + POND_SURFACE_LIFT_M) * 3, 5);
  });

  it("has a bounding sphere, positions and normals but no uv", () => {
    const g = buildPondGeometry(pond(square(0, 0, 10, 10)), 3)!;
    expect(g.boundingSphere).not.toBeNull();
    expect(g.getAttribute("position")).toBeDefined();
    expect(g.getAttribute("normal")).toBeDefined();
    expect(g.getAttribute("uv")).toBeUndefined();
  });
});

describe("buildPondGeometry: degenerate input", () => {
  it("returns null and reports when the outer ring has zero area", () => {
    const msgs: string[] = [];
    const collinear = [0, 0, 5, 5, 10, 10];
    expect(buildPondGeometry(pond([collinear]), 3, (m) => msgs.push(m))).toBeNull();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatch(/test-pond.*outer ring/);
    // Three identical points, and a closed 3-point ring that collapses to a line.
    expect(buildPondGeometry(pond([[1, 1, 1, 1, 1, 1]]), 3)).toBeNull();
    expect(buildPondGeometry(pond([[0, 0, 10, 10, 0, 0]]), 3)).toBeNull();
  });

  it("does not throw without a report callback", () => {
    expect(() => buildPondGeometry(pond([[0, 0, 5, 5, 10, 10]]), 3)).not.toThrow();
  });

  it("skips only the degenerate hole and keeps the pond", () => {
    const msgs: string[] = [];
    const g = buildPondGeometry(pond([square(0, 0, 100, 100), [50, 50, 60, 60, 70, 70], square(10, 10, 20, 20)]), 1, (m) =>
      msgs.push(m),
    )!;
    expect(g).not.toBeNull();
    expect(areaXZ(g)).toBeCloseTo(10000 - 100, 3);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatch(/hole 1/);
  });

  it("returns null when there are no rings at all", () => {
    expect(buildPondGeometry(pond([]), 3)).toBeNull();
  });

  it("rejects a non-finite exaggeration", () => {
    expect(() => buildPondGeometry(pond([square(0, 0, 1, 1)]), NaN)).toThrow(/exaggeration/);
  });
});
```

`viewer/src/ponds/layer.test.ts`

```ts
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { POND_RENDER_ORDER, PondsLayer } from "./layer";
import type { Pond, Ponds } from "./types";

const square = (x0: number, z0: number, x1: number, z1: number) => [x0, z0, x1, z0, x1, z1, x0, z1];
const pond = (id: string, rings: number[][], level_m = 5): Pond => ({
  id,
  name: null,
  level_m,
  source: "test",
  confidence: "illustrative",
  rings,
});
const ponds = (...list: Pond[]): Ponds => ({ version: 1, ponds: list });
const material = () => new THREE.MeshStandardMaterial({ transparent: true });
const meshes = (layer: PondsLayer) => layer.object.children as THREE.Mesh[];

describe("PondsLayer", () => {
  it("creates one mesh per valid pond, sharing the given material", () => {
    const m = material();
    const layer = new PondsLayer(
      ponds(pond("a", [square(0, 0, 10, 10)]), pond("b", [square(100, 100, 200, 200), square(120, 120, 140, 140)])),
      m,
      3,
    );
    expect(meshes(layer)).toHaveLength(2);
    expect(meshes(layer).map((x) => x.userData.pondId)).toEqual(["a", "b"]);
    expect(meshes(layer).map((x) => x.name)).toEqual(["pond-a", "pond-b"]);
    for (const x of meshes(layer)) {
      expect(x.material).toBe(m);
      expect(x.renderOrder).toBe(POND_RENDER_ORDER);
      expect(x.frustumCulled).toBe(true);
      expect(x.position.toArray()).toEqual([0, 0, 0]);
    }
    expect(POND_RENDER_ORDER).toBeGreaterThan(0);
    expect(layer.stats().ponds).toBe(2);
    expect(layer.skipped()).toEqual([]);
  });

  it("counts triangles: 2 for a square, more with a hole", () => {
    const one = new PondsLayer(ponds(pond("a", [square(0, 0, 10, 10)])), material(), 3);
    expect(one.stats()).toEqual({ ponds: 1, triangles: 2 });
    const holed = new PondsLayer(ponds(pond("a", [square(0, 0, 100, 100), square(40, 40, 60, 60)])), material(), 3);
    expect(holed.stats().triangles).toBeGreaterThan(2);
    const both = new PondsLayer(
      ponds(pond("a", [square(0, 0, 10, 10)]), pond("b", [square(0, 0, 100, 100), square(40, 40, 60, 60)])),
      material(),
      3,
    );
    expect(both.stats().triangles).toBe(2 + holed.stats().triangles);
  });

  it("puts the surface at the level times the exaggeration plus the lift", () => {
    const layer = new PondsLayer(ponds(pond("a", [square(0, 0, 10, 10)], 7)), material(), 3);
    const pos = meshes(layer)[0].geometry.getAttribute("position");
    expect(pos.getY(0)).toBeCloseTo((7 + 0.05) * 3, 4);
  });

  it("skips ponds whose outline has no area, reports them, and keeps the rest", () => {
    const msgs: string[] = [];
    const layer = new PondsLayer(
      ponds(pond("flat", [[0, 0, 5, 5, 10, 10]]), pond("ok", [square(0, 0, 10, 10)])),
      material(),
      3,
      (m) => msgs.push(m),
    );
    expect(meshes(layer).map((x) => x.userData.pondId)).toEqual(["ok"]);
    expect(layer.skipped()).toEqual(["flat"]);
    expect(layer.stats().ponds).toBe(1);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("flat");
  });

  it("copes with an empty list", () => {
    const layer = new PondsLayer(ponds(), material(), 3);
    expect(layer.stats()).toEqual({ ponds: 0, triangles: 0 });
    layer.dispose();
  });

  it("toggles visibility on the group", () => {
    const layer = new PondsLayer(ponds(pond("a", [square(0, 0, 10, 10)])), material(), 3);
    expect(layer.object.visible).toBe(true);
    layer.setVisible(false);
    expect(layer.object.visible).toBe(false);
    layer.setVisible(true);
    expect(layer.object.visible).toBe(true);
  });

  it("disposes the geometries but not the shared material", () => {
    const m = material();
    let materialDisposed = false;
    m.addEventListener("dispose", () => (materialDisposed = true));
    const layer = new PondsLayer(ponds(pond("a", [square(0, 0, 10, 10)]), pond("b", [square(20, 20, 30, 30)])), m, 3);
    const geos = meshes(layer).map((x) => x.geometry);
    let disposed = 0;
    for (const g of geos) g.addEventListener("dispose", () => disposed++);
    layer.dispose();
    expect(disposed).toBe(2);
    expect(materialDisposed).toBe(false);
    expect(layer.object.children).toHaveLength(0);
    expect(layer.stats()).toEqual({ ponds: 0, triangles: 0 });
  });

  it("can be added to a scene and found by pond id", () => {
    const scene = new THREE.Scene();
    const layer = new PondsLayer(ponds(pond("a", [square(0, 0, 10, 10)])), material(), 3);
    scene.add(layer.object);
    expect(scene.getObjectByName("pond-a")?.userData.pondId).toBe("a");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd viewer && npx vitest run src/ponds/geometry.test.ts src/ponds/layer.test.ts`

Expected: **FAIL** (the code under test does not exist yet, or the new assertions do not hold yet).

- [ ] **Step 3: Write the implementation**

`viewer/src/ponds/geometry.ts`

```ts
import * as THREE from "three";
import type { Pond } from "./types";

/**
 * Metres the water surface floats above `level_m`. The pipeline carves the bed below the
 * level, so this only has to beat depth-buffer precision where the bed meets the surface at
 * the shore (a sliver of terrain at exactly the water level would otherwise flicker).
 */
export const POND_SURFACE_LIFT_M = 0.05;
/** Rings enclosing less than this (square metres) are treated as degenerate and skipped. */
export const MIN_RING_AREA_M2 = 1e-6;

/**
 * Signed area of a flat [x0, z0, x1, z1, ...] ring in the x/z plane (shoelace formula,
 * relative to the first point so far-from-origin coordinates do not lose precision).
 * A repeated closing point adds nothing. The sign only tells the winding; callers that
 * care about size use the absolute value.
 */
export function ringArea(ring: readonly number[]): number {
  const n = ring.length / 2;
  if (n < 3) return 0;
  const ox = ring[0];
  const oz = ring[1];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[2 * i] - ox;
    const az = ring[2 * i + 1] - oz;
    const bx = ring[2 * j] - ox;
    const bz = ring[2 * j + 1] - oz;
    sum += ax * bz - bx * az;
  }
  return sum / 2;
}

const isDegenerate = (ring: readonly number[] | undefined) =>
  !ring || ring.length < 6 || Math.abs(ringArea(ring)) < MIN_RING_AREA_M2;

/**
 * Shape points for a ring. ShapeGeometry lays the shape in the x/y plane, and the
 * rotation below (rotateX(-90 degrees)) sends shape y to world -z, so z is negated here
 * to land on the right world z (+z south). Without the negation the pond would be mirrored
 * north to south.
 */
function shapePoints(ring: readonly number[]): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i + 1 < ring.length; i += 2) pts.push(new THREE.Vector2(ring[i], -ring[i + 1]));
  return pts;
}

/**
 * Flat triangulated water surface for one pond at y = (level_m + POND_SURFACE_LIFT_M) *
 * exaggeration, in world coordinates (the mesh needs no transform). Triangulated with
 * three's earcut: rings[0] is the outline, rings[1..] are holes; winding does not matter.
 * Positions and normals only (+y); no uv.
 *
 * A hole with no area is skipped. Returns null when the outer ring has no area or nothing
 * could be triangulated. Both are reported through `report` (when given) instead of thrown, so one bad
 * pond cannot take the rest down.
 */
export function buildPondGeometry(
  pond: Pond,
  exaggeration: number,
  report?: (message: string) => void,
): THREE.BufferGeometry | null {
  if (!Number.isFinite(exaggeration)) throw new Error(`pond geometry: exaggeration must be finite, got ${exaggeration}`);
  const outer = pond.rings[0];
  if (isDegenerate(outer)) {
    report?.(`pond "${pond.id}": outer ring is degenerate (no area); pond skipped`);
    return null;
  }
  const shape = new THREE.Shape(shapePoints(outer));
  for (let j = 1; j < pond.rings.length; j++) {
    const hole = pond.rings[j];
    if (isDegenerate(hole)) {
      report?.(`pond "${pond.id}": hole ${j} is degenerate (no area); hole skipped`);
      continue;
    }
    shape.holes.push(new THREE.Path(shapePoints(hole)));
  }
  const geometry = new THREE.ShapeGeometry(shape);
  if (!geometry.getIndex() || geometry.getIndex()!.count === 0) {
    geometry.dispose();
    report?.(`pond "${pond.id}": triangulation produced no triangles; pond skipped`);
    return null;
  }
  geometry.rotateX(-Math.PI / 2); // shape (x, -z, 0) -> world (x, 0, z); normal +z -> +y
  geometry.translate(0, (pond.level_m + POND_SURFACE_LIFT_M) * exaggeration, 0);
  geometry.deleteAttribute("uv"); // unused by the water shader
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}
```

`viewer/src/ponds/layer.ts`

```ts
import * as THREE from "three";
import { buildPondGeometry } from "./geometry";
import type { Ponds } from "./types";

/**
 * Pond surfaces draw after the sea plane (renderOrder 0) and the opaque terrain, both of
 * which they sit above. All ponds share one material, so they also share one program.
 */
export const POND_RENDER_ORDER = 1;

/**
 * Freshwater ponds as flat water surfaces: one mesh per pond, positioned in world
 * coordinates (the meshes carry no transform). The material is shared and owned by the
 * caller, normally the sea's animated water material, so ponds ripple with the sea and
 * follow the Water motion toggle without any wiring of their own.
 */
export class PondsLayer {
  readonly object = new THREE.Group();
  private readonly skippedIds: string[] = [];
  private triangles = 0;

  /**
   * @param report told about each pond (or hole) that could not be drawn
   */
  constructor(
    ponds: Ponds,
    material: THREE.Material,
    exaggeration: number,
    report?: (message: string) => void,
  ) {
    this.object.name = "ponds";
    for (const pond of ponds.ponds) {
      const geometry = buildPondGeometry(pond, exaggeration, report);
      if (!geometry) {
        this.skippedIds.push(pond.id);
        continue;
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `pond-${pond.id}`;
      mesh.userData.pondId = pond.id;
      mesh.renderOrder = POND_RENDER_ORDER;
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false; // static: positions are already in world coordinates
      mesh.updateMatrix();
      this.object.add(mesh);
      this.triangles += (geometry.getIndex()?.count ?? 0) / 3;
    }
  }

  setVisible(on: boolean): void {
    this.object.visible = on;
  }

  /** Ponds drawn and their triangle count (for the debug overlay). */
  stats(): { ponds: number; triangles: number } {
    return { ponds: this.object.children.length, triangles: this.triangles };
  }

  /** Ids of ponds that were left out because their outline had no area. */
  skipped(): readonly string[] {
    return this.skippedIds;
  }

  /** Free the geometries. The material is shared and stays with its owner. */
  dispose(): void {
    for (const child of this.object.children) (child as THREE.Mesh).geometry.dispose();
    this.object.clear();
    this.triangles = 0;
  }
}
```

- [ ] **Step 4: Run the whole suite, the typecheck**

Run: `cd viewer && npx vitest run && npx tsc --noEmit`

Expected: **Tests  557 passed | 1 skipped (558)** (vitest), no type errors.

- [ ] **Step 5: Commit**

```bash
git add viewer/src/ponds/geometry.test.ts viewer/src/ponds/layer.test.ts viewer/src/ponds/geometry.ts viewer/src/ponds/layer.ts
git commit -m "feat(viewer): flat pond surfaces at their own level"
```

---

### Task V3: Sources panel and legend: hand-drawn provenance

**Files:**
- Modify: `viewer/src/provenanceData.test.ts`
- Modify: `viewer/src/legendEntries.test.ts`
- Modify: `viewer/src/provenanceData.ts`
- Modify: `viewer/src/legendEntries.ts`
- Modify: `viewer/src/ui/legend.ts`
- Modify: `viewer/src/ui/provenance.ts`

`handSourceRows` turns `meta.hand_sources` into cards (label, source, confidence badge, count) and the Sources panel renders a 'Hand-drawn and sculpted' section when there are any; the Legend gains one line when ponds exist. Text only goes in through `textContent`.

- [ ] **Step 1: Add the tests**

`viewer/src/provenanceData.test.ts` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/viewer/src/provenanceData.test.ts
+++ b/viewer/src/provenanceData.test.ts
@@ -1,5 +1,6 @@
 import { describe, expect, it } from "vitest";
-import { OVERLAY_NOTE, VEGETATION_NOTE, formatValue, processingEntries } from "./provenanceData";
+import type { HandSource } from "./heightmap";
+import { HAND_SOURCES_NOTE, OVERLAY_NOTE, VEGETATION_NOTE, formatValue, handSourceRows, processingEntries } from "./provenanceData";
 
 describe("formatValue", () => {
   it("formats scalars", () => {
@@ -82,3 +83,108 @@
     );
   });
 });
+
+describe("handSourceRows", () => {
+  const hs = (over: Record<string, unknown> = {}) =>
+    ({ layer: "hand_water", source: "Coast Survey", confidence: "inferred", count: 3, ...over }) as HandSource;
+
+  it("labels the known layers and words the count", () => {
+    const rows = handSourceRows([
+      hs(),
+      hs({ layer: "landforms", source: "Sculpted", count: 2 }),
+      hs({ layer: "ponds", source: "Pond file", count: 1, confidence: "documented" }),
+    ]);
+    expect(rows).toEqual([
+      { layer: "hand_water", label: "Hand-drawn water", source: "Coast Survey", confidence: "inferred", countText: "3 polygons" },
+      { layer: "landforms", label: "Sculpted landforms", source: "Sculpted", confidence: "inferred", countText: "2 landforms" },
+      { layer: "ponds", label: "Ponds", source: "Pond file", confidence: "documented", countText: "1 pond" },
+    ]);
+  });
+
+  it("uses singular and plural correctly, including zero", () => {
+    expect(handSourceRows([hs({ count: 1 })])[0].countText).toBe("1 polygon");
+    expect(handSourceRows([hs({ count: 0 })])[0].countText).toBe("0 polygons");
+    expect(handSourceRows([hs({ layer: "landforms", count: 1 })])[0].countText).toBe("1 landform");
+    expect(handSourceRows([hs({ layer: "ponds", count: 5 })])[0].countText).toBe("5 ponds");
+  });
+
+  it("sorts known layers in a fixed order, then others by id, then by source", () => {
+    const rows = handSourceRows([
+      hs({ layer: "zeta_layer", source: "a" }),
+      hs({ layer: "ponds", source: "b" }),
+      hs({ layer: "hand_water", source: "z source" }),
+      hs({ layer: "alpha_layer", source: "a" }),
+      hs({ layer: "hand_water", source: "a source" }),
+      hs({ layer: "landforms", source: "m" }),
+    ]);
+    expect(rows.map((r) => `${r.layer}:${r.source}`)).toEqual([
+      "hand_water:a source",
+      "hand_water:z source",
+      "landforms:m",
+      "ponds:b",
+      "alpha_layer:a",
+      "zeta_layer:a",
+    ]);
+  });
+
+  it("humanises unknown layer ids and counts them as items", () => {
+    const rows = handSourceRows([hs({ layer: "wind_gaps", count: 2 }), hs({ layer: "constructor", count: 1 })]);
+    expect(rows.map((r) => r.label)).toEqual(["Constructor", "Wind gaps"]);
+    expect(rows[1].countText).toBe("2 items");
+    expect(rows[0].countText).toBe("1 item");
+  });
+
+  it("tolerates junk input", () => {
+    for (const bad of [undefined, null, "x", 5, {}, true]) {
+      expect(handSourceRows(bad as unknown as HandSource[])).toEqual([]);
+    }
+    expect(handSourceRows([])).toEqual([]);
+    const rows = handSourceRows([
+      null,
+      5,
+      "str",
+      [],
+      {},
+      { layer: "" },
+      { layer: "   " },
+      { layer: 7 },
+      hs(),
+    ] as unknown as HandSource[]);
+    expect(rows).toHaveLength(1);
+  });
+
+  it("fills in missing fields without throwing", () => {
+    const rows = handSourceRows([
+      { layer: "ponds" },
+      { layer: "ponds", source: "   ", confidence: 5, count: "3" },
+      { layer: "ponds", source: "x", count: -1 },
+      { layer: "ponds", source: "y", count: 1.5 },
+      { layer: "ponds", source: "z", count: NaN },
+    ] as unknown as HandSource[]);
+    expect(rows).toHaveLength(5);
+    for (const r of rows) {
+      expect(r.countText).toBe("");
+      expect(r.confidence).toBe("");
+    }
+    expect(rows.find((r) => r.source === "Source not recorded")).toBeDefined();
+  });
+
+  it("clips very long text", () => {
+    const row = handSourceRows([hs({ source: "s".repeat(1000), layer: "q".repeat(500) })])[0];
+    expect(row.source.length).toBe(200);
+    expect(row.label.length).toBeLessThanOrEqual(60);
+  });
+
+  it("does not modify its input", () => {
+    const input = [hs({ layer: "ponds" }), hs()];
+    const copy = JSON.stringify(input);
+    handSourceRows(input);
+    expect(JSON.stringify(input)).toBe(copy);
+  });
+});
+
+describe("HAND_SOURCES_NOTE", () => {
+  it("is plain text", () => {
+    expect(HAND_SOURCES_NOTE).toMatch(/^Features drawn or sculpted by hand/);
+  });
+});
PATCH
```

`viewer/src/legendEntries.test.ts` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/viewer/src/legendEntries.test.ts
+++ b/viewer/src/legendEntries.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from "vitest";
 import { GROUP_COLORS } from "./habitat";
-import { GROUP_LABELS, hexToCss, legendEntries } from "./legendEntries";
+import { GROUP_LABELS, PONDS_LEGEND_NOTE, hexToCss, legendEntries, legendNotes } from "./legendEntries";
 
 describe("hexToCss", () => {
   it("pads to six digits", () => {
@@ -36,3 +36,13 @@
     expect(GROUP_LABELS.map(([g]) => g).sort()).toEqual(Object.keys(GROUP_COLORS).sort());
   });
 });
+
+describe("legendNotes", () => {
+  it("adds the ponds line only when the dataset has a ponds file", () => {
+    expect(PONDS_LEGEND_NOTE).toBe("Ponds and lagoons sit at their own water level.");
+    expect(legendNotes({ ponds_file: "ponds.json" })).toEqual([PONDS_LEGEND_NOTE]);
+    expect(legendNotes({})).toEqual([]);
+    expect(legendNotes({ ponds_file: "" })).toEqual([]);
+    expect(legendNotes({ ponds_file: null })).toEqual([]);
+  });
+});
PATCH
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd viewer && npx vitest run src/provenanceData.test.ts src/legendEntries.test.ts`

Expected: **FAIL** (the code under test does not exist yet, or the new assertions do not hold yet).

- [ ] **Step 3: Write the implementation**

`viewer/src/provenanceData.ts` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/viewer/src/provenanceData.ts
+++ b/viewer/src/provenanceData.ts
@@ -1,4 +1,5 @@
 /** Pure helpers for the Sources panel: human labels for the pipeline parameters. */
+import type { HandSource } from "./heightmap";
 
 export interface ProcessingEntry {
   key: string;
@@ -81,3 +82,73 @@
 /** Shown on the Sources panel (and echoed in the Legend) whenever vegetation shapes can appear. */
 export const VEGETATION_NOTE =
   "Vegetation shapes (trees, shrubs, reeds) are illustrative: they show the kind of plants, not individual plants.";
+
+/** Shown above the hand-drawn and sculpted rows on the Sources panel. */
+export const HAND_SOURCES_NOTE =
+  "Features drawn or sculpted by hand for this map. Each row names its source and how sure we are.";
+
+export interface HandSourceRow {
+  /** The pipeline's layer id, e.g. "hand_water". */
+  layer: string;
+  /** Human label for the layer, e.g. "Hand-drawn water". */
+  label: string;
+  source: string;
+  /** As given in the data; look it up with confidenceInfo (an unknown value is shown as-is). */
+  confidence: string;
+  /** "3 polygons", "1 landform"; empty when the count is missing or not a whole number. */
+  countText: string;
+}
+
+/** Known layers, in display order: label, and the singular / plural noun for the count. */
+const HAND_LAYERS: ReadonlyArray<readonly [string, { label: string; one: string; many: string }]> = [
+  ["hand_water", { label: "Hand-drawn water", one: "polygon", many: "polygons" }],
+  ["landforms", { label: "Sculpted landforms", one: "landform", many: "landforms" }],
+  ["ponds", { label: "Ponds", one: "pond", many: "ponds" }],
+];
+const MAX_LAYER_CHARS = 60;
+
+const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
+
+function clip(text: string, max: number): string {
+  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
+}
+
+/**
+ * Rows for `meta.hand_sources`: one per entry, with a human layer label, the source text, the
+ * confidence and a count such as "3 polygons". Known layers come first in a fixed order, other
+ * layers after them alphabetically by id (shown with a humanised id); within a layer rows
+ * are sorted by source. Tolerant of junk: a non-array gives [], entries that are not objects or
+ * have no layer id are dropped, a missing source reads "Source not recorded".
+ */
+export function handSourceRows(items: readonly HandSource[] | undefined): HandSourceRow[] {
+  if (!Array.isArray(items)) return [];
+  const known = new Map(HAND_LAYERS.map(([id, info], i) => [id, { info, order: i }] as const));
+  const rows: Array<HandSourceRow & { order: number }> = [];
+  for (const raw of items as unknown[]) {
+    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
+    const item = raw as Record<string, unknown>;
+    if (typeof item.layer !== "string" || item.layer.trim() === "") continue;
+    const layer = item.layer;
+    const entry = known.get(layer);
+    const count = item.count;
+    const noun = entry?.info ?? { one: "item", many: "items" };
+    const countText =
+      typeof count === "number" && Number.isSafeInteger(count) && count >= 0
+        ? `${count} ${count === 1 ? noun.one : noun.many}`
+        : "";
+    const source = typeof item.source === "string" && item.source.trim() !== "" ? item.source : "Source not recorded";
+    rows.push({
+      layer,
+      label: entry ? entry.info.label : clip(humanize(layer), MAX_LAYER_CHARS),
+      source: clip(source, MAX_VALUE_CHARS),
+      confidence: typeof item.confidence === "string" ? item.confidence : "",
+      countText,
+      order: entry ? entry.order : HAND_LAYERS.length,
+    });
+  }
+  rows.sort((a, b) => a.order - b.order || cmp(a.layer, b.layer) || cmp(a.source, b.source));
+  return rows.map(({ order: _order, ...row }) => {
+    void _order;
+    return row;
+  });
+}
PATCH
```

`viewer/src/legendEntries.ts` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/viewer/src/legendEntries.ts
+++ b/viewer/src/legendEntries.ts
@@ -40,3 +40,13 @@
     color: hexToCss(GROUP_COLORS[group]),
   }));
 }
+
+/** Legend line for datasets that draw ponds (those with `ponds_file`). Plain text, no colour of its own. */
+export const PONDS_LEGEND_NOTE = "Ponds and lagoons sit at their own water level.";
+
+/** Extra plain-text lines the Legend shows beneath the ground colours, depending on the dataset. */
+export function legendNotes(meta: { ponds_file?: string | null }): string[] {
+  const notes: string[] = [];
+  if (typeof meta.ponds_file === "string" && meta.ponds_file !== "") notes.push(PONDS_LEGEND_NOTE);
+  return notes;
+}
PATCH
```

`viewer/src/ui/legend.ts` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/viewer/src/ui/legend.ts
+++ b/viewer/src/ui/legend.ts
@@ -1,12 +1,12 @@
 /** Legend panel: what the ground colours and map symbols mean. */
 import type { HeightmapMeta } from "../heightmap";
-import { legendEntries } from "../legendEntries";
+import { legendEntries, legendNotes } from "../legendEntries";
 import { VEGETATION_NOTE } from "../provenanceData";
 import type { Shell } from "./shell";
 
 export function createLegend(
   shell: Shell,
-  meta: Pick<HeightmapMeta, "habitat_classes" | "overlay_file">,
+  meta: Pick<HeightmapMeta, "habitat_classes" | "overlay_file" | "ponds_file">,
   options: { vegetation?: boolean } = {},
 ) {
   const panel = shell.addPanel("legend", "Legend");
@@ -35,6 +35,13 @@
     none.className = "panel__note";
     none.textContent = "This dataset has no ground classes.";
     parts.splice(1, 1, none);
+  }
+
+  for (const text of legendNotes(meta)) {
+    const note = document.createElement("p");
+    note.className = "panel__note";
+    note.textContent = text;
+    parts.push(note);
   }
 
   if (meta.overlay_file) {
PATCH
```

`viewer/src/ui/provenance.ts` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/viewer/src/ui/provenance.ts
+++ b/viewer/src/ui/provenance.ts
@@ -1,7 +1,7 @@
 /** Sources panel: where each data layer comes from and how sure we are. */
 import { confidenceInfo } from "../confidence";
 import type { HeightmapMeta } from "../heightmap";
-import { OVERLAY_NOTE, VEGETATION_NOTE, processingEntries } from "../provenanceData";
+import { HAND_SOURCES_NOTE, OVERLAY_NOTE, VEGETATION_NOTE, handSourceRows, processingEntries } from "../provenanceData";
 import { confidenceBadge } from "./hotspotPanel";
 import type { Shell } from "./shell";
 
@@ -14,7 +14,7 @@
 
 export function createProvenance(
   shell: Shell,
-  meta: Pick<HeightmapMeta, "layers" | "processing" | "overlay_file">,
+  meta: Pick<HeightmapMeta, "layers" | "processing" | "overlay_file" | "hand_sources">,
   options: { vegetation?: boolean } = {},
 ) {
   const panel = shell.addPanel("provenance", "Sources");
@@ -46,6 +46,32 @@
     parts.push(card);
   }
 
+  const handRows = handSourceRows(meta.hand_sources);
+  if (handRows.length > 0) {
+    parts.push(el("h3", "panel__subtitle", "Hand-drawn and sculpted"));
+    parts.push(el("p", "panel__note", HAND_SOURCES_NOTE));
+    for (const row of handRows) {
+      const card = el("section", "prov");
+      card.appendChild(el("h4", "prov__title", row.label));
+      const dl = el("dl", "prov__list");
+      const info = confidenceInfo(row.confidence);
+      const confidenceDd = el("dd");
+      confidenceDd.append(confidenceBadge(row.confidence), el("span", "hotspot__meaning", info.meaning));
+      const rows: Array<[string, Node | string]> = [
+        ["Source", row.source],
+        ["Confidence", confidenceDd],
+      ];
+      if (row.countText) rows.push(["Features", row.countText]);
+      for (const [term, value] of rows) {
+        dl.appendChild(el("dt", undefined, term));
+        if (typeof value === "string") dl.appendChild(el("dd", undefined, value));
+        else dl.appendChild(value);
+      }
+      card.appendChild(dl);
+      parts.push(card);
+    }
+  }
+
   const entries = processingEntries(meta.processing);
   if (entries.length > 0) {
     parts.push(el("h3", "panel__subtitle", "Processing"));
PATCH
```

- [ ] **Step 4: Run the whole suite, the typecheck**

Run: `cd viewer && npx vitest run && npx tsc --noEmit`

Expected: **Tests  567 passed | 1 skipped (568)** (vitest), no type errors.

- [ ] **Step 5: Commit**

```bash
git add viewer/src/provenanceData.test.ts viewer/src/legendEntries.test.ts viewer/src/provenanceData.ts viewer/src/legendEntries.ts viewer/src/ui/legend.ts viewer/src/ui/provenance.ts
git commit -m "feat(viewer): hand-drawn and sculpted sources in the Sources panel, ponds line in the legend"
```

---

### Task V4: Ponds module and synthetic pond data

**Files:**
- Create: `viewer/src/pondsModule.test.ts`
- Create: `viewer/src/pondsModule.ts`
- Create: `viewer/scripts/make_ponds_synth.mjs`
- Modify: `viewer/src/modules.ts`
- Modify: `viewer/package.json`

The module loads `ponds.json` when the meta names it (a failure is one `console.warn`, not a broken viewer), adds the layer to the scene with the app's own water material, and is not tied to the layer toggles. `make_ponds_synth.mjs` writes two synthetic ponds (one with an island) into `city-synth`, carving the synthetic heightmap the way the pipeline does so the shoreline can be inspected. It is idempotent, and **re-running `make:city-synth` removes the ponds, so run `make:ponds-synth` after it**.

- [ ] **Step 1: Add the tests**

`viewer/src/pondsModule.test.ts`

```ts
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { mountPonds, pondMaterial } from "./pondsModule";
import type { Ponds } from "./ponds/types";
import { WATER_COLOR, WATER_OPACITY, createWaterMaterial } from "./water/waterMaterial";

const square = (x0: number, z0: number, x1: number, z1: number) => [x0, z0, x1, z0, x1, z1, x0, z1];
const ponds = (...rings: number[][][]): Ponds => ({
  version: 1,
  ponds: rings.map((r, i) => ({ id: `p${i}`, name: null, level_m: 4, source: "t", confidence: "illustrative", rings: r })),
});

describe("pondMaterial", () => {
  it("uses the sea's water material when there is one", () => {
    const water = createWaterMaterial();
    expect(pondMaterial({ water })).toBe(water.material);
  });

  it("falls back to a plain translucent water-coloured material", () => {
    const m = pondMaterial({}) as THREE.MeshStandardMaterial;
    expect(m).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(m.transparent).toBe(true);
    expect(m.opacity).toBe(WATER_OPACITY);
    expect(m.color.getHex()).toBe(WATER_COLOR);
  });
});

describe("mountPonds", () => {
  it("adds the layer to the scene with the sea material, applies the exaggeration, and asks for a render", () => {
    const scene = new THREE.Scene();
    const water = createWaterMaterial();
    let renders = 0;
    const layer = mountPonds(
      { scene, water, verticalExaggeration: 3, requestRender: () => void renders++ },
      ponds([square(0, 0, 10, 10)], [square(50, 50, 80, 80)]),
    );
    expect(scene.children).toContain(layer.object);
    expect(renders).toBe(1);
    const meshes = layer.object.children as THREE.Mesh[];
    expect(meshes).toHaveLength(2);
    for (const m of meshes) expect(m.material).toBe(water.material);
    expect(meshes[0].geometry.getAttribute("position").getY(0)).toBeCloseTo((4 + 0.05) * 3, 4);
  });

  it("reports ponds that could not be drawn and still mounts the others", () => {
    const scene = new THREE.Scene();
    const msgs: string[] = [];
    const layer = mountPonds(
      { scene, verticalExaggeration: 3, requestRender: () => {} },
      ponds([[0, 0, 1, 1, 2, 2]], [square(0, 0, 10, 10)]),
      (m) => msgs.push(m),
    );
    expect(layer.stats().ponds).toBe(1);
    expect(msgs).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd viewer && npx vitest run src/pondsModule.test.ts`

Expected: **FAIL** (the code under test does not exist yet, or the new assertions do not hold yet).

- [ ] **Step 3: Write the implementation**

`viewer/src/pondsModule.ts`

```ts
import * as THREE from "three";
import type { AppContext } from "./appContext";
import type { AppModule } from "./modules";
import { PondsLayer } from "./ponds/layer";
import { loadPonds } from "./ponds/parse";
import type { Ponds } from "./ponds/types";
import { WATER_COLOR, WATER_OPACITY } from "./water/waterMaterial";

/** What mountPonds needs from the app (a subset of AppContext; `water` may be absent). */
export type PondsHost = Pick<AppContext, "scene" | "verticalExaggeration" | "requestRender"> &
  Partial<Pick<AppContext, "water">>;

/**
 * The material the ponds are drawn with: the sea's own (so ponds share its animated ripples,
 * glint and the Water motion toggle), or, when the host has none, a plain translucent
 * material in the same colour and opacity.
 */
export function pondMaterial(host: Partial<Pick<AppContext, "water">>): THREE.Material {
  return (
    host.water?.material ??
    new THREE.MeshStandardMaterial({ color: WATER_COLOR, transparent: true, opacity: WATER_OPACITY })
  );
}

/** Build the ponds layer and add it to the scene. Ponds are not an optional layer: always visible. */
export function mountPonds(host: PondsHost, ponds: Ponds, report?: (message: string) => void): PondsLayer {
  const layer = new PondsLayer(ponds, pondMaterial(host), host.verticalExaggeration, report);
  host.scene.add(layer.object);
  host.requestRender();
  return layer;
}

/**
 * Freshwater ponds and lagoons from the dataset's ponds.json: flat water surfaces at their
 * own level, drawn with the sea's water material. A dataset without `ponds_file`, or a failed
 * load, leaves the viewer exactly as it was (one console warning). Independent of the layer
 * toggles and the URL hash.
 */
export const pondsModule: AppModule = async (ctx: AppContext) => {
  if (!ctx.meta.ponds_file) return;
  let ponds: Ponds | null;
  try {
    ponds = await loadPonds(ctx.assetBase, ctx.meta);
  } catch (err) {
    console.warn("Ponds not loaded; continuing without them.", err);
    return;
  }
  if (!ponds || ponds.ponds.length === 0) return;
  const problems: string[] = [];
  mountPonds(ctx, ponds, (m) => problems.push(m));
  if (problems.length > 0) console.warn("Some ponds were not fully drawn:", problems);
};
```

`viewer/scripts/make_ponds_synth.mjs`

```javascript
// Synthetic freshwater ponds for exercising the viewer's pond layer (no real data).
// Reads public/assets/city-synth/{meta.json, heightmap.u16} (run make:city-synth first), then:
//   - writes ponds.json with TWO ponds over gentle land (the second has an island), and
//   - carves a bed under each pond in heightmap.u16 (cells inside the outline drop to 1.5 m
//     below the water level, island cells rise to 0.8 m above it), as the real pipeline does,
//   - sets meta.ponds_file and meta.hand_sources (hand_water, landforms and ponds rows).
// Idempotent: sites are chosen from terrain outside the ponds, which the carving never
// touches, and carving is a min()/max() against fixed targets, so a second run changes nothing.
// Everything here is fake: never copy it into a real dataset.
// Usage: node scripts/make_ponds_synth.mjs   then open  /?data=city-synth
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "city-synth");
const metaPath = join(dir, "meta.json");
const meta = JSON.parse(readFileSync(metaPath, "utf8"));
const heightsPath = join(dir, meta.heights_file);
const buf = readFileSync(heightsPath);
const { width: W, height: H, cell_m: CELL, min_m: MIN, max_m: MAX, water_level_m: WATER } = meta;
if (buf.length !== W * H * 2) throw new Error(`unexpected heightmap size ${buf.length}`);

const BED_DEPTH_M = 1.5; // how far below the water level the carved bed lies
const ISLAND_RISE_M = 0.8; // island cells are at least this far above the water level
const round1 = (n) => Math.round(n * 10) / 10;

const decode = (q) => MIN + (q / 65535) * (MAX - MIN);
const encode = (h) => Math.max(0, Math.min(65535, Math.round(((h - MIN) / (MAX - MIN)) * 65535)));
const cellOf = (x, z) => [
  Math.min(W - 1, Math.max(0, Math.round(x / CELL + (W - 1) / 2))),
  Math.min(H - 1, Math.max(0, Math.round(z / CELL + (H - 1) / 2))),
];
const heightAt = (x, z) => {
  const [c, r] = cellOf(x, z);
  return decode(buf.readUInt16LE((r * W + c) * 2));
};
const halfW = ((W - 1) * CELL) / 2;
const halfH = ((H - 1) * CELL) / 2;

// A wobbly closed outline: radii (rx, rz) rotated by `rot`, `n` points, `wobble` fractional bumps.
function outline(cx, cz, rx, rz, rot, n, wobble, phase) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    const k = 1 + wobble * Math.sin(3 * t + phase) + (wobble / 2) * Math.sin(5 * t + 2 * phase);
    const ex = rx * k * Math.cos(t);
    const ez = rz * k * Math.sin(t);
    pts.push(
      round1(cx + ex * Math.cos(rot) - ez * Math.sin(rot)),
      round1(cz + ex * Math.sin(rot) + ez * Math.cos(rot)),
    );
  }
  return pts;
}

function inside(ring, x, z) {
  let c = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[2 * i];
    const zi = ring[2 * i + 1];
    const xj = ring[2 * j];
    const zj = ring[2 * j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// Candidate sites: gentle land, judged by a band of terrain just outside the pond's reach
// (radius `reach` + 20..60 m), so the choice does not depend on what carving did inside.
function sampleBand(cx, cz, reach) {
  const hs = [];
  for (const r of [reach + 20, reach + 40, reach + 60]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 2 * Math.PI;
      hs.push(heightAt(cx + r * Math.cos(a), cz + r * Math.sin(a)));
    }
  }
  return hs;
}
function findSites(reach, maxRange, maxLevel) {
  const out = [];
  for (let z = -halfH + 600; z < halfH - 600; z += 100) {
    for (let x = -halfW + 600; x < halfW - 600; x += 100) {
      const hs = sampleBand(x, z, reach);
      const lo = Math.min(...hs);
      const hi = Math.max(...hs);
      if (lo > WATER + 3 && lo <= maxLevel && hi - lo <= maxRange) out.push({ x, z, level: round1(lo), d: Math.hypot(x, z) });
    }
  }
  return out.sort((a, b) => a.d - b.d);
}
function pickSites() {
  // Prefer ground below the high hills and close to the map centre, then relax.
  for (const maxLevel of [90, 400]) {
    for (const maxRange of [3, 5, 8]) {
      const sites = findSites(160, maxRange, maxLevel);
      if (sites.length === 0) continue;
      const a = sites[0];
      const b = sites.find((s) => Math.hypot(s.x - a.x, s.z - a.z) >= 1000);
      if (b) return [a, b];
    }
  }
  throw new Error("no gentle land found for two synthetic ponds");
}

const [siteA, siteB] = pickSites();

const ponds = [
  {
    id: "synthetic-pond-a",
    name: "Synthetic test pond A",
    level_m: siteA.level,
    source: "synthetic test data",
    confidence: "illustrative",
    rings: [outline(siteA.x, siteA.z, 130, 80, 0.45, 28, 0.08, 0.7)],
  },
  {
    id: "synthetic-pond-b",
    name: "Synthetic test pond B",
    level_m: siteB.level,
    source: "synthetic test data",
    confidence: "illustrative",
    rings: [
      outline(siteB.x, siteB.z, 140, 120, -0.3, 32, 0.07, 1.9),
      outline(siteB.x + 10, siteB.z - 5, 40, 32, 0.2, 10, 0.1, 0.3), // the island
    ],
  },
];

// Carve the beds.
let changed = 0;
for (const p of ponds) {
  const [outer, ...holes] = p.rings;
  const xs = outer.filter((_, i) => i % 2 === 0);
  const zs = outer.filter((_, i) => i % 2 === 1);
  const [c0, r0] = cellOf(Math.min(...xs) - CELL, Math.min(...zs) - CELL);
  const [c1, r1] = cellOf(Math.max(...xs) + CELL, Math.max(...zs) + CELL);
  const bed = p.level_m - BED_DEPTH_M;
  const island = p.level_m + ISLAND_RISE_M;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const x = (c - (W - 1) / 2) * CELL;
      const z = (r - (H - 1) / 2) * CELL;
      if (!inside(outer, x, z)) continue;
      const off = (r * W + c) * 2;
      const h = decode(buf.readUInt16LE(off));
      const inHole = holes.some((ring) => inside(ring, x, z));
      const q = encode(inHole ? Math.max(h, island) : Math.min(h, bed));
      if (q !== buf.readUInt16LE(off)) {
        buf.writeUInt16LE(q, off);
        changed++;
      }
    }
  }
}
writeFileSync(heightsPath, buf);
writeFileSync(
  join(dir, "ponds.json"),
  JSON.stringify({ version: 1, ponds, processing: { synthetic: true, bed_depth_m: BED_DEPTH_M } }),
);

const handSources = [
  { layer: "hand_water", source: "synthetic test data", confidence: "illustrative", count: 3 },
  { layer: "landforms", source: "synthetic test data", confidence: "illustrative", count: 1 },
  { layer: "ponds", source: "synthetic test data", confidence: "illustrative", count: ponds.length },
];
if (meta.ponds_file !== "ponds.json" || JSON.stringify(meta.hand_sources) !== JSON.stringify(handSources)) {
  meta.ponds_file = "ponds.json";
  meta.hand_sources = handSources;
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
}
console.log(
  `ponds.json: ${ponds.map((p) => `${p.id} at (${p.rings[0][0]}, ${p.rings[0][1]}) level ${p.level_m} m`).join("; ")}; ` +
    `${changed} heightmap cells carved`,
);
```

`viewer/src/modules.ts` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/viewer/src/modules.ts
+++ b/viewer/src/modules.ts
@@ -2,6 +2,7 @@
 import { effectsModule } from "./effectsModule";
 import { infoModule } from "./infoModule";
 import { overlayModule } from "./overlayModule";
+import { pondsModule } from "./pondsModule";
 
 /** A feature module (overlay, search, hotspots, vegetation, ...) plugged into the app. */
 export type AppModule = (ctx: AppContext) => void | Promise<void>;
@@ -10,7 +11,7 @@
  * Registered modules run in order after the core view is up. Add a module by importing
  * it here and appending it; a module that throws is logged and does not stop the rest.
  */
-export const modules: AppModule[] = [infoModule, effectsModule, overlayModule];
+export const modules: AppModule[] = [infoModule, effectsModule, pondsModule, overlayModule];
 
 export async function initModules(ctx: AppContext): Promise<void> {
   for (const init of modules) {
PATCH
```

`viewer/package.json` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/viewer/package.json
+++ b/viewer/package.json
@@ -8,7 +8,8 @@
     "build": "tsc --noEmit && vite build",
     "make:city-synth": "node scripts/make_city_synth.mjs",
     "test": "vitest run",
-    "make:overlay-synth": "node scripts/make_overlay_synth.mjs"
+    "make:overlay-synth": "node scripts/make_overlay_synth.mjs",
+    "make:ponds-synth": "node scripts/make_ponds_synth.mjs"
   },
   "dependencies": {
     "three": "^0.187.0"
PATCH
```

- [ ] **Step 4: Generate the synthetic ponds**

Run: `cd viewer && npm run make:ponds-synth` twice.

Expected: the first run writes `public/assets/city-synth/ponds.json` and carves the synthetic heightmap; the second reports no change. (`make:city-synth` regenerates the dataset **without** ponds: run `make:ponds-synth` after it.)

- [ ] **Step 5: Run the whole suite, the typecheck and the build**

Run: `cd viewer && npx vitest run && npx tsc --noEmit`, then `cd viewer && npm run build`

Expected: **Tests  572 passed (572)** (vitest), no type errors, build succeeds (the 500 kB chunk warning is old).

- [ ] **Step 6: Commit**

```bash
git add viewer/src/pondsModule.test.ts viewer/src/pondsModule.ts viewer/scripts/make_ponds_synth.mjs viewer/src/modules.ts viewer/package.json
git commit -m "feat(viewer): ponds module and synthetic pond data"
```

---

### Task D1: Tracing guide and hand-polygon README

**Files:**
- Create: `docs/research/tracing-guide.md`
- Modify: `pipeline/data/full-city/hand/README.md`

The written workflow for the person doing the tracing, area by area in order of visible impact, with a check for each; and the README next to the hand-drawn files now states the provenance rule.

- [ ] **Step 1: Add the files**

`docs/research/tracing-guide.md`

````markdown
# Tracing guide (Phase 3b)

How to add hand-drawn water, ponds and lost landforms to the Yelamu map, with the comparison tool. Written for the owner. Every step has a check so you know when to stop.

## The rules

1. **Everything hand-drawn carries `source` and `confidence`.** The build refuses a polygon or landform without them. Write the source so a stranger could find it again: sheet name, year, the archive, and how you read the feature ("shoreline = edge of the marsh hatching").
2. **Confidence words.** `documented`: a source states the feature (a text, or a vector dataset). `inferred`: you read it off a historical map or reasoned from several sources. `illustrative`: drawn to give an impression. Anything you trace from an 1850s sheet is `inferred` at best.
3. **Licences.** Trace only from sources you may use. NOAA's original survey sheets (the US Coast Survey "T-sheets") are US federal works; confirm the rights statement on the page you download from, and record it in `source`. Scans on David Rumsey or Stanford are CC BY-NC-SA: look at them, do not trace from them. SFEI's own georeferenced sheets: reference only. If unsure, do not trace from it.
4. **Order of work: by visible impact.** Do the areas below in order and stop when the map is good enough for you. Each area is independent.

## The loop

```bash
cd pipeline
# 1. Georeference a scan (control points = places you can find on both the sheet and a modern map)
uv run python scripts/georeference.py SCAN.tif points.csv --bbox W S E N --cell 5 --order 2 --out sheet.tif --report sheet-report.txt
# 2. Look at the reconstruction against the sheet
uv run --with pillow python scripts/render_compare.py ../viewer/public/assets/real-city --bbox W S E N --sheet sheet.tif --out compare.png
# 3. Trace in geojson.io or QGIS over the sheet; save into data/full-city/hand/*.geojson
# 4. Check the file before building
uv run python scripts/check_polygons.py data/full-city/hand/hand_bay.geojson --region regions/full-city.json
# 5. Rebuild, rebuild the overlay, compare again, then look in the viewer
uv run python -m yelamu.cli --region regions/full-city.json
uv run python scripts/build_overlay.py --region regions/full-city.json
```

`points.csv` has the header `col,row,lon,lat,name`: pixel position in the scan (origin top-left corner), the real-world position, and a note. Use 6 to 10 points spread over the whole sheet, preferring features that have not moved (hilltops, headlands, old stone landmarks, creek mouths that still exist) and avoiding the shoreline you are about to trace. The tool prints each point's error in metres and **refuses** a fit with an RMS above 25 m or too few points. If it refuses, look for the point with the biggest error; it is usually a typo or a feature that moved.

Before tracing, always look at the panel that shows the sheet blended with the current reconstruction: on **stable ground** (headlands, hills) the sheet's coastline and the modern DEM must agree to within a few cells. If they do not, fix the control points first. Tracing over a bad fit bakes the error in.

## Area 1: south-east shoreline and marshes

*Mission Bay, Islais Creek, India Basin, Hunters Point, Candlestick, Visitacion Valley.* Largest area where the map shows modern ground.

- Draw open water in `hand_bay.geojson` and tidal marsh in `hand_marsh.geojson`. Where both cover a cell, bay wins.
- One feature per coherent shape; put the sheet in `properties.source` (for example `"US Coast Survey T-sheet T-xxxx (1850s), NOAA Historical Map & Chart Collection; shoreline read at mean high water"`) and `"confidence": "inferred"`.
- Check: `check_polygons.py` reports no invalid geometry, no features outside the region, and the overlaps you expect. After a rebuild the compare image shows the dark red shoreline following the sheet's coast on both sides of the water, and the viewer's Sources panel lists the hand-drawn water.

## Area 2: Treasure Island and the Yerba Buena shoals

The island is 1930s fill. In 1769 there was a shoal north of Yerba Buena Island. Trace the shoal edge as bay only if your sheet shows deep water on both sides; leave the shallows as bay (the map has no tidal-flat class). Same files, same rules.

- Check: the island is gone in the compare image, Yerba Buena Island is still land, and nothing else moved.

## Area 3: ponds

*Lake Merced (north and south lakes), others the SFEI layer misses.* SFEI's layer ends at latitude 37.7328, so **Lake Merced is not in it**. Trace each lake into `hand_ponds.geojson` with `"level_m"` (the surface height in metres) and `"name"`. For Lake Merced the modern DEM gives about 5.6 m, which is a reasonable value: say so in `source`.

- Source example: `"Lake Merced extent from <sheet>, level from USGS 3DEP DEM (modern surface)"`; confidence `inferred`.
- SFEI pond classes already give 17 ponds. The two **Tidal coastal lagoon** polygons (near -122.404, 37.796 and -122.413, 37.804) are not included on purpose: decide with the compare image whether they are a lagoon behind a bar or an open tidal channel, then either add `"Tidal coastal lagoon"` to `pond_classes` in `regions/full-city.json` or trace them as marsh.
- Check: `ponds.json` lists the pond, the viewer shows a flat water surface at its level with no wall on the uphill side, and the compare image's blue area follows the sheet.

## Area 4: lost landforms

*Rincon Hill and the Market Street dune ridge are the two named in the design; add others only with a cited source.* Edit `data/full-city/landforms.json` (an array). Each entry needs `source` and `confidence`.

- A bump: `{"kind": "bump", "name": "...", "lon": ..., "lat": ..., "radius_m": ..., "delta_m": ..., "source": "...", "confidence": "inferred"}`.
- A ridge: `{"kind": "ridge", "name": "...", "points": [[lon, lat], ...], "half_width_m": ..., "delta_m": ..., "source": "...", "confidence": "inferred"}`. `delta_m` is the height added along the crest line and falls to zero at `half_width_m` (cosine falloff). Heights add to what the DEM already shows, so measure against the modern ground.
- Cite the height. An entry without a number from a source is `illustrative` and should stay out unless you want it as an impression.
- Check: the build prints the landforms layer; the compare image's hillshade shows the ridge where the sheet shows it; the viewer's Sources panel lists it as "Sculpted landforms".

## When you are done

Run the whole test-suite, rebuild everything, look at the real city in the viewer at the places you changed, and add one line per area to `docs/research/phase-3b-results.md` saying what source you used and what is still a guess.
````

`pipeline/data/full-city/hand/README.md` (modified; apply with `git apply`)

```bash
git apply --whitespace=nowarn <<'PATCH'
--- a/pipeline/data/full-city/hand/README.md
+++ b/pipeline/data/full-city/hand/README.md
@@ -1,13 +1,22 @@
-# Hand-drawn water polygons
+# Hand-drawn water and ponds
 
-`hand_bay.geojson` and `hand_marsh.geojson` hold water you trace yourself where the SFEI
-layer has no data (mainly the south-east of the city). Both start as empty
-FeatureCollections and are read by `regions/full-city.json`.
+`hand_bay.geojson` (open bay), `hand_marsh.geojson` (tidal marsh) and `hand_ponds.geojson`
+(freshwater ponds) hold water you trace yourself where the SFEI layer has no data (mainly the
+south-east of the city and Lake Merced). All three start as empty FeatureCollections and are
+read by `regions/full-city.json`. The full workflow, area by area, is in
+`docs/research/tracing-guide.md`.
 
-- Format: GeoJSON `Polygon` or `MultiPolygon` features in lon/lat (EPSG:4326). Draw them
-  in geojson.io or QGIS, tracing the 1850s US Coast Survey sheets, and save over the file.
+- Format: GeoJSON `Polygon` or `MultiPolygon` features in lon/lat (EPSG:4326). Draw them in
+  geojson.io or QGIS and save over the file.
+- **Every feature needs `properties.source` and `properties.confidence`.** The build refuses
+  a feature without them. `source` is non-blank text of at most 200 characters naming the sheet
+  or text and how you read it; `confidence` is `documented`, `inferred` or `illustrative`
+  (a feature traced from a historical map is `inferred` at best).
 - `hand_bay` is open bay, `hand_marsh` is tidal marsh. Where both cover a cell, bay wins.
-- Hand-drawn polygons count as mapped, so the modern-elevation gap fill never overrides
-  them. They show up in the output as the `hand_water` layer, tagged `inferred`.
+- `hand_ponds` features may also carry `level_m` (the water surface height in metres; the
+  default is the median modern ground height inside the polygon), `name` and `id`.
+- Hand-drawn polygons count as mapped, so the modern-elevation gap fill never overrides them.
+  They appear in the output as the `hand_water` layer (and `ponds`), and in the viewer's
+  Sources panel under "Hand-drawn and sculpted".
 - Only trace from sources you may use. Never copy data from a source whose terms forbid it.
-- More files can be listed under `hand_bay` / `hand_marsh` in the region file.
+- Check a file before building: `uv run python scripts/check_polygons.py FILE --region regions/full-city.json`.
PATCH
```

- [ ] **Step 2: Check the empty hand files**

Run: `cd pipeline && uv run python scripts/check_polygons.py data/full-city/hand/hand_bay.geojson data/full-city/hand/hand_marsh.geojson data/full-city/hand/hand_ponds.geojson --region regions/full-city.json`

Expected: exit 0, each file reported with 0 features.

- [ ] **Step 3: Commit**

```bash
git add docs/research/tracing-guide.md pipeline/data/full-city/hand/README.md
git commit -m "docs: tracing guide and provenance rules for hand-drawn data"
```

---

### Task V5: Check it on the real city, in a real browser (no commit)

This is the part no test covers: WebGL, the real data and your eyes. Use the Browser pane or a normal browser. Measure frame time in short windows right after a user action (the Browser pane throttles itself to about one frame per second after a fraction of a second of scripted activity).

- [ ] **Step 1: Rebuild the real city and look at the numbers**

```bash
cp viewer/public/assets/real-city/heightmap.u16 /tmp/heightmap-before.u16   # Phase 3 build, for the comparison below
cd pipeline
uv run python -m yelamu.cli --region regions/full-city.json
uv run python scripts/build_overlay.py --region regions/full-city.json
uv run python scripts/verify_overlay_data.py ../viewer/public/assets/real-city
```

Expected (the prototype's numbers; your build should match): the build prints `Dropped pond 'Dune-dammed pond or lake' near UTM (550088, 4180314): it covers 1 cell(s), fewer than 4` and `Carved 17 ponds (17 from SFEI, 0 hand-drawn), 1755 cells`, the four sanity checks pass, `ponds.json` is about 30 KB, and `meta.json` has `ponds_file` and four `hand_sources` rows (all layer `ponds`, confidence `documented`, counts 2, 1, 13, 1). The overlay and its cross-check pass as before.

- [ ] **Step 2: Confirm nothing moved except ponds and their banks**

```bash
cd pipeline && uv run python - <<'PY'
import numpy as np
a = np.fromfile("/tmp/heightmap-before.u16", dtype="<u2").astype(int)
b = np.fromfile("../viewer/public/assets/real-city/heightmap.u16", dtype="<u2").astype(int)
d = np.nonzero(a != b)[0]
print("cells that differ:", len(d), "of", a.size)
PY
```

Expected: `cells that differ: 2323 of 2771615` (1,755 pond cells plus 568 bank cells; the grid is 1771 x 1565). If the number is far larger, something other than ponds changed: stop and find out what.

- [ ] **Step 3: Look at Mountain Lake and the other ponds**

```bash
cd viewer && npx vite --port 5199
```

Open `http://localhost:5199/?data=real-city&debug`, search or fly to Mountain Lake (Presidio, about -122.471, 37.789) and zoom in. Check: a flat translucent surface at its own level; **no vertical wall on the uphill shore** (a ramp is expected, with visible terracing at the 10 m cell size); no flicker at the shoreline while rotating (Q and E) and zooming in and out across the LOD switch; the water animation moves on ponds as on the bay, and stops when "Water motion" is off; there are 17 pond meshes (`window.__yelamu.scene.traverse` and count `userData.pondId`). Look at one more: the Crissy Field lagoon, at about -122.4685, 37.806.

- [ ] **Step 4: Sources, Legend, console**

Sources should show the section "Hand-drawn and sculpted" with the SFEI pond classes (confidence Documented, count text, a badge with its meaning). Legend should end with "Ponds and lagoons sit at their own water level." No console warnings. Temporarily move `viewer/public/assets/real-city/ponds.json` away and reload: exactly one console warning, the map still works, no pond surfaces; put the file back.

- [ ] **Step 5: Frame time**

With vegetation, animated water and ponds on, zoom 7, take one screenshot (a real user action), then read the debug overlay's fps and frame-gap p90 over about 1.2 s. Expected: about the Phase 3 figure (median 8.3 ms, display-limited). Record the number; if it is more than about 20% worse, look at pond triangle counts in `stats()` first.

- [ ] **Step 6: The comparison tool on real output**

```bash
cd pipeline
mkdir -p ../docs/research/local
uv run --with pillow python scripts/render_compare.py ../viewer/public/assets/real-city --bbox -122.485 37.780 -122.457 37.795 --out ../docs/research/local/compare-mountain-lake.png
```

Expected: three panels (grey sheet placeholder, reconstruction with Mountain Lake and two small ponds in blue with a dark red shoreline, 50% blend), a 500 m scale bar, lon/lat ticks. (`docs/research/local/` is gitignored.)

### Task R1: Record the results and update the project notes

**Files:**
- Create: `docs/research/phase-3b-results.md`

- [ ] **Step 1: Write the results note** in the style of `docs/research/phase-3-results.md`: the numbers you saw in Task V5 against the prototype's (the "What the prototypes measured" table above), a checklist of the browser checks with pass/fail, what was **not** exercised (georeferencing on a real sheet; reduced motion; phone), and what still needs a person (below).

- [ ] **Step 2: Commit**

```bash
git add docs/research/phase-3b-results.md
git commit -m "docs: Phase 3b results"
```

---

## What still needs a person (after this plan)

1. **Download a real sheet and try the loop.** The tools are tested on synthetic sheets only. Pick a NOAA T-sheet covering the south-east, say which file, from where and how big it is, and get your approval before downloading; then follow `docs/research/tracing-guide.md`. Confirm the rights statement on the download page (see the guide).
2. **Trace Lake Merced.** SFEI's layer does not reach it. One polygon in `hand_ponds.geojson` with `level_m` about 5.6 and a source gives the south of the city its biggest missing pond. Then add a sanity check for it (`expect_pond`) in `data/full-city/checks.json`.
3. **Decide the two `Tidal coastal lagoon` polygons** (near -122.404, 37.796 and -122.413, 37.804): add the class to `pond_classes` in `regions/full-city.json`, or trace them as marsh.
4. **Rincon Hill and the Market Street dune ridge** need a cited height before they go into `landforms.json`.
5. **3b-2:** find the NOAA shoreline files for the south-east and Treasure Island (interactive discovery with the Shoreline Data Explorer), inspect them, then write the importer.
6. The Phase 3 open items still stand: About and hotspot review, phone measurement, assistive-technology pass, SFEI's reply, hosting.

## Spec coverage

| Spec item | Where |
|---|---|
| A. `georeference` with residuals, refusing loose fits | Task P1 |
| A. `render_compare` (sheet, reconstruction, blend, scale bar, ticks) | Task P4 (checked on real output in V5 Step 6) |
| A. `check_polygons` | Task P4 |
| B. Required `source` and `confidence` on hand polygons and landforms | Tasks P2, P3, P7 |
| B. Ridge landform shape | Task P3 |
| B. Sources panel lists hand-drawn and landform sources | Tasks P7 (`hand_sources` in meta), V3 |
| C. Ponds with their own level, carved, `ponds.json`, viewer surface | Tasks P5, P7, V1, V2, V4 |
| C. SFEI classes configurable; `Tidal coastal lagoon` decided by you | Tasks P5, P7; "What still needs a person" 3 |
| D. Tracing guide | Task D1 |
| 3b-2 NOAA importer | Out of scope here; "What still needs a person" 5 |
| Honest limits (synthetic-only georeferencing) | Spec section 6, "What the prototypes measured", "What still needs a person" 1 |
