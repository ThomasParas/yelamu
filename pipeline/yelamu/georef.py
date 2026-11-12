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

Refusals. A fit is refused (ValueError; the CLI exits 2) when the control points cannot
pin the map down, since a polynomial through them then looks fine (small residuals) but is
wild away from them:

  * the convex hull of the points is thin: hull area / (largest distance between two
    points)^2 is below MIN_HULL_RATIO (2%). A square gives 0.5, a legitimate 1:10 strip
    about 0.09, points within a few metres of a line a few thousandths. (The ratio uses the
    diameter squared, not the axis-aligned bounding box, so a diagonal line is caught too.)
  * the normalised design matrix (terms in about +-1) has a singular-value ratio above
    MAX_CONDITION[order] (100, 500, 2000 for orders 1, 2, 3). Random well-spread sets, at the
    minimum number of points (the worst case), measure at most 27 / 115 / 810 over 300 draws;
    points within 3 m of a 4 km line measure 1e3 / 2e6; a 1:10 strip at order 3 measures 2e4.

The requested output extent is checked against the control points too (see
`extrapolation_problem`): beyond the hull's bounding box grown by EXTRAPOLATION_MARGIN
(50% of its width / height on each side) the CLI refuses orders 2 and 3, whose error grows
fast outside the points, and only warns at order 1.

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
from scipy.spatial.distance import pdist
from shapely.geometry import MultiPoint

from yelamu.geo import UTM_CRS, Grid, lonlat_to_utm

N_TERMS = {1: 3, 2: 6, 3: 10}
EXTRA_POINTS = 2  # at least this many GCPs beyond the number of terms
MIN_HULL_RATIO = 0.02  # hull area / diameter^2; see the module docs
MAX_CONDITION = {1: 100.0, 2: 500.0, 3: 2000.0}  # singular-value ratio, normalised design matrix
EXTRAPOLATION_MARGIN = 0.5  # of the hull bbox's width / height, on each side


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
    hull = MultiPoint(utm).convex_hull
    diameter = float(pdist(np.asarray(hull.exterior.coords if hull.geom_type == "Polygon"
                                      else hull.coords)).max())
    ratio = hull.area / diameter ** 2
    if ratio < MIN_HULL_RATIO:
        raise ValueError(
            f"the control points are degenerate: they lie nearly in a line (their hull covers "
            f"{ratio:.2%} of a square the size of their spread; at least {MIN_HULL_RATIO:.0%} "
            "is needed). Spread them over the sheet, in both directions"
        )
    design = _terms((utm[:, 0] - centre[0]) / scale, (utm[:, 1] - centre[1]) / scale, order)
    coeffs, _, rank, sing = np.linalg.lstsq(design, pix, rcond=None)
    if rank < terms:
        raise ValueError(
            f"the control points are degenerate for an order-{order} fit (rank {rank} of "
            f"{terms}; are they in a line or clustered?): spread them over the sheet or "
            "use a lower --order"
        )
    condition = float(sing[0] / sing[-1])
    if condition > MAX_CONDITION[order]:
        raise ValueError(
            f"the control points are degenerate for an order-{order} fit (condition number "
            f"{condition:.0f}, limit {MAX_CONDITION[order]:.0f}: too clustered or too close to a "
            "line for this many terms): spread them over the sheet or use a lower --order"
        )
    return PolyMap(order, coeffs, (float(centre[0]), float(centre[1])), scale)


def extrapolation_problem(gcps_utm, grid: Grid, order: int) -> str | None:
    """Why the output extent reaches too far beyond the control points, or None.

    The limit is the bounding box of the control points grown by EXTRAPOLATION_MARGIN of its
    width / height on every side. The message is the same for every order; the caller
    refuses for orders 2 and 3 and only warns for order 1 (see the module docs).
    """
    utm = np.asarray(gcps_utm, dtype="float64")
    (x0, y0), (x1, y1) = utm.min(axis=0), utm.max(axis=0)
    mx, my = EXTRAPOLATION_MARGIN * (x1 - x0), EXTRAPOLATION_MARGIN * (y1 - y0)
    if (grid.west >= x0 - mx and grid.east <= x1 + mx
            and grid.south >= y0 - my and grid.north <= y1 + my):
        return None
    return (f"the output extent ({grid.east - grid.west:.0f} x {grid.north - grid.south:.0f} m) "
            f"extends beyond the control points by more than {EXTRAPOLATION_MARGIN:.0%} of their "
            f"spread ({x1 - x0:.0f} x {y1 - y0:.0f} m): a polynomial of order {order} is "
            "unreliable out there. Add control points near the edges of the output area or "
            "shrink --bbox" + (" (order 1 is only warned about)" if order == 1 else ""))


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
    if not rms <= args.max_rms_m:
        print(f"REFUSED: RMS {rms:.1f} m is above --max-rms-m {args.max_rms_m:g}: fix or drop "
              "the control point with the largest residual, or add more", file=sys.stderr)
        return 2
    reach = extrapolation_problem(utm, grid, args.order)
    if reach is not None:
        if args.order >= 2:
            print(f"REFUSED: {reach}", file=sys.stderr)
            return 2
        print(f"WARNING: {reach}", file=sys.stderr)
    if args.report:  # only for a fit that was accepted
        args.report.write_text(report + "\n")
    if args.out:
        write_geotiff(args.out, warp(scan, poly, grid), grid)
        print(f"Wrote {args.out} ({grid.width} x {grid.height} cells of {grid.cell:g} m, "
              f"{UTM_CRS})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
