"""The grey modern context ring around the 1769 map.

The ring is a coarse lattice of vertices (about 60 m apart) drawn by the viewer outside the
city mesh. Coordinates are the viewer's world metres (the same frame as overlay.py):

    x = E - (grid.west + grid.east) / 2        (+x is east)
    z = (grid.north + grid.south) / 2 - N      (+z is south)

The city mesh joins cell centres, so it covers x in [-hw, hw] and z in [-hd, hd] with
hw = (width - 1) * cell / 2 and hd = (height - 1) * cell / 2. The lattice is built so those
four lines are lattice lines: the "hole" (cells i0..i1-1 by j0..j1-1) is exactly the city
mesh, and ring vertices on the hole boundary take the city's own heights, so the two
surfaces meet. Spacing is slightly different east-west and north-south (60 m and 59.92 m
for the real city) because 15,640 is not a multiple of 60.

Heights are modern 3DEP, area-averaged onto the lattice; open water is flattened to the
bay floor. Optional hand-drawn bay and marsh polygons (later 1850s shore stages) are
burned in like the city does. Written as `context.json` + `context.u16`, and `meta.json`
gains `"context_file"` and a `context` layer:

    uv run python scripts/build_context.py --region regions/full-city.json
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.transform import Affine
from rasterio.warp import reproject
from shapely.geometry.base import BaseGeometry

from yelamu.export import CONFIDENCE_LEVELS, dequantize_heights, quantize_heights
from yelamu.geo import UTM_CRS, Grid, lonlat_to_utm
from yelamu.terrain import BAY_FLOOR_M, MARSH_LEVEL_M, WATER_LEVEL_M

CONTEXT_FILE = "context.json"
CONTEXT_HEIGHTS_FILE = "context.u16"
CONTEXT_VERSION = 1
# Ring vertices at or below this height (metres) are open water, like the city's rule.
OPEN_WATER_M = 0.5


@dataclass(frozen=True)
class Lattice:
    """Vertex (i, j) is at world (x0 + i * dx, z0 + j * dz); j = 0 is the north row."""

    x0: float
    z0: float
    dx: float
    dz: float
    cols: int  # vertices per row
    rows: int  # vertices per column
    i0: int  # the hole: cells i0..i1-1 by j0..j1-1 lie under the city mesh
    i1: int
    j0: int
    j1: int

    def x(self, i: float) -> float:
        return self.x0 + i * self.dx

    def z(self, j: float) -> float:
        return self.z0 + j * self.dz


def world_of_lonlat(grid: Grid, lon: float, lat: float) -> tuple[float, float]:
    """Viewer world metres of a lon/lat (same formula as overlay.lonlat_to_world)."""
    easting, northing = lonlat_to_utm(lon, lat)
    return (
        easting - (grid.west + grid.east) / 2.0,
        (grid.north + grid.south) / 2.0 - northing,
    )


def city_half_extent(grid: Grid) -> tuple[float, float]:
    """Half the city MESH extent (it joins cell centres): (hw, hd) in metres."""
    return (grid.width - 1) * grid.cell / 2.0, (grid.height - 1) * grid.cell / 2.0


def build_lattice(grid: Grid, bbox: tuple[float, float, float, float], target_m: float) -> Lattice:
    """The ring lattice for a lon/lat `bbox` around the city, spacing near `target_m`."""
    hw, hd = city_half_extent(grid)
    corners = [world_of_lonlat(grid, lon, lat) for lon in (bbox[0], bbox[2]) for lat in (bbox[1], bbox[3])]
    x_min, x_max = min(c[0] for c in corners), max(c[0] for c in corners)
    z_min, z_max = min(c[1] for c in corners), max(c[1] for c in corners)
    if not (x_min < -hw and x_max > hw and z_min < -hd and z_max > hd):
        raise ValueError(f"the ring bbox {list(bbox)} must contain the city map on every side")
    n = max(1, round(2 * hw / target_m))
    m = max(1, round(2 * hd / target_m))
    dx, dz = 2 * hw / n, 2 * hd / m
    left = math.ceil((-hw - x_min) / dx)
    right = math.ceil((x_max - hw) / dx)
    up = math.ceil((-hd - z_min) / dz)
    down = math.ceil((z_max - hd) / dz)
    return Lattice(
        x0=-hw - left * dx, z0=-hd - up * dz, dx=dx, dz=dz,
        cols=left + n + right + 1, rows=up + m + down + 1,
        i0=left, i1=left + n, j0=up, j1=up + m,
    )


def lattice_transform(grid: Grid, lat: Lattice) -> Affine:
    """Raster transform whose pixel CENTRES are the lattice vertices (pixel (r, c) = vertex (c, r))."""
    ec = (grid.west + grid.east) / 2.0
    nc = (grid.north + grid.south) / 2.0
    return Affine(lat.dx, 0.0, ec + lat.x0 - lat.dx / 2, 0.0, -lat.dz, nc - lat.z0 + lat.dz / 2)


def resample_dem(dem_path: Path, grid: Grid, lat: Lattice, nodata: float | None = None) -> np.ndarray:
    """Area-average the DEM onto the lattice. Raises ValueError if any vertex has no data."""
    dst = np.full((lat.rows, lat.cols), np.nan, dtype="float32")
    with rasterio.open(dem_path) as src:
        reproject(
            source=rasterio.band(src, 1),
            destination=dst,
            dst_transform=lattice_transform(grid, lat),
            dst_crs=UTM_CRS,
            resampling=Resampling.average,
            src_nodata=nodata if nodata is not None else src.nodata,
            dst_nodata=np.nan,
        )
    missing = int(np.isnan(dst).sum())
    if missing:
        raise ValueError(
            f"the DEM has no elevation data for {missing} of {dst.size} ring vertices; "
            "the ring bbox reaches beyond the DEM"
        )
    return dst


def flatten_water(heights: np.ndarray) -> np.ndarray:
    """Open water (at or below OPEN_WATER_M) becomes the bay floor. Returns a copy."""
    return np.where(heights <= OPEN_WATER_M, np.float32(BAY_FLOOR_M), heights).astype("float32")


def _sample_city(city: np.ndarray, cell: float, x: np.ndarray, z: np.ndarray) -> np.ndarray:
    """Bilinear city height at world (x, z); positions outside the city clamp to its edge."""
    h, w = city.shape
    col = np.clip(x / cell + (w - 1) / 2.0, 0, w - 1)
    row = np.clip(z / cell + (h - 1) / 2.0, 0, h - 1)
    c0 = np.minimum(np.floor(col).astype(int), w - 2)
    r0 = np.minimum(np.floor(row).astype(int), h - 2)
    fc, fr = col - c0, row - r0
    return (
        city[r0, c0] * (1 - fc) * (1 - fr) + city[r0, c0 + 1] * fc * (1 - fr)
        + city[r0 + 1, c0] * (1 - fc) * fr + city[r0 + 1, c0 + 1] * fc * fr
    )


def apply_city_edge(heights: np.ndarray, lat: Lattice, city: np.ndarray, cell: float) -> np.ndarray:
    """Copy the city's heights onto the ring vertices on the hole boundary. Returns a copy."""
    out = heights.copy()
    cols = np.arange(lat.i0, lat.i1 + 1)
    rows = np.arange(lat.j0, lat.j1 + 1)
    xs = lat.x0 + cols * lat.dx
    zs = lat.z0 + rows * lat.dz
    for j in (lat.j0, lat.j1):
        out[j, lat.i0 : lat.i1 + 1] = _sample_city(city, cell, xs, np.full_like(xs, lat.z(j)))
    for i in (lat.i0, lat.i1):
        out[lat.j0 : lat.j1 + 1, i] = _sample_city(city, cell, np.full_like(zs, lat.x(i)), zs)
    return out


def _burn(polygons: Sequence[BaseGeometry], grid: Grid, lat: Lattice) -> np.ndarray:
    if len(polygons) == 0:
        return np.zeros((lat.rows, lat.cols), dtype=bool)
    burned = rasterize(
        [(geom, 1) for geom in polygons],
        out_shape=(lat.rows, lat.cols),
        transform=lattice_transform(grid, lat),
        fill=0,
        dtype="uint8",
    )
    return burned.astype(bool)


def apply_context_water(
    heights: np.ndarray,
    grid: Grid,
    lat: Lattice,
    bay: Sequence[BaseGeometry] = (),
    marsh: Sequence[BaseGeometry] = (),
) -> np.ndarray:
    """Burn hand-drawn UTM polygons into the ring: marsh vertices to the marsh level, bay
    vertices to the bay floor; where both cover a vertex, bay wins. Returns a copy."""
    out = heights.copy()
    out[_burn(marsh, grid, lat)] = MARSH_LEVEL_M
    out[_burn(bay, grid, lat)] = BAY_FLOOR_M
    return out


def sample_lattice(heights: np.ndarray, lat: Lattice, x: float, z: float) -> float:
    """Bilinear ring height at world (x, z); positions outside clamp to the nearest edge."""
    col = min(max((x - lat.x0) / lat.dx, 0.0), lat.cols - 1.0)
    row = min(max((z - lat.z0) / lat.dz, 0.0), lat.rows - 1.0)
    c0 = min(int(math.floor(col)), lat.cols - 2)
    r0 = min(int(math.floor(row)), lat.rows - 2)
    fc, fr = col - c0, row - r0
    return float(
        heights[r0, c0] * (1 - fc) * (1 - fr) + heights[r0, c0 + 1] * fc * (1 - fr)
        + heights[r0 + 1, c0] * (1 - fc) * fr + heights[r0 + 1, c0 + 1] * fc * fr
    )
