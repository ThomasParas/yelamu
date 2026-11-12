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
