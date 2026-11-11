"""Turn historical water polygons (UTM metres) into a boolean mask on the grid."""

from __future__ import annotations

from typing import Sequence

import numpy as np
from rasterio.features import rasterize
from scipy import ndimage
from shapely.geometry.base import BaseGeometry

from yelamu.geo import Grid


def water_mask(polygons: Sequence[BaseGeometry], grid: Grid) -> np.ndarray:
    """True where a cell centre falls inside any polygon. Shape is (height, width)."""
    if len(polygons) == 0:
        return np.zeros((grid.height, grid.width), dtype=bool)
    burned = rasterize(
        [(geom, 1) for geom in polygons],
        out_shape=(grid.height, grid.width),
        transform=grid.transform(),
        fill=0,
        dtype="uint8",
    )
    return burned.astype(bool)


def unmapped_open_water(
    raw_dem: np.ndarray, coverage: np.ndarray, max_m: float = 0.5
) -> np.ndarray:
    """True where SFEI mapped nothing AND the modern DEM says open water.

    `coverage` is True wherever any SFEI habitat polygon (of any class) exists, i.e.
    wherever the historical-ecology map has an opinion. Where it has none, nothing
    marks open bay as water, so the modern DEM stands in: an unmapped cell whose raw
    elevation is <= `max_m` metres, or NaN (bare-earth DEMs are nodata over water), is
    taken to be open bay. Unmapped land (e.g. a hill) is high and stays land, and
    covered cells are never touched, so SFEI's own mapping always wins.

    Pass the RAW DEM (before any landform stamping) so that hand edits cannot hide or
    create gap-filled water. Provenance: this is inferred from the modern DEM, not
    documented by SFEI.
    """
    raw = np.asarray(raw_dem)
    return ~np.asarray(coverage, dtype=bool) & (np.isnan(raw) | (raw <= max_m))


def _disk(radius: int) -> np.ndarray:
    y, x = np.ogrid[-radius : radius + 1, -radius : radius + 1]
    return x * x + y * y <= radius * radius


def remove_thin_unmapped_land(
    land: np.ndarray, unmapped: np.ndarray, radius_cells: int
) -> np.ndarray:
    """Cells of thin land to turn into water, only where SFEI mapped nothing.

    Where the shoreline came from the modern DEM (areas the SFEI layer doesn't map),
    modern piers a few cells wide and one-cell specks show up as land. A morphological
    opening with a disk of `radius_cells` drops anything narrower than the disk; the
    returned mask is those dropped cells that are also `unmapped`, so SFEI-mapped
    coast is never touched. Pass the FULL land mask (not just unmapped land) so large
    landmasses are not eroded at the mapped/unmapped boundary. The mask is edge-padded
    first so land running off the grid is not eroded at the grid border.
    radius_cells <= 0 returns an all-False mask.
    """
    land = np.asarray(land, dtype=bool)
    if radius_cells <= 0:
        return np.zeros_like(land)
    r = int(radius_cells)
    padded = np.pad(land, r, mode="edge")
    opened = ndimage.binary_opening(padded, structure=_disk(r))[r:-r, r:-r]
    return land & ~opened & np.asarray(unmapped, dtype=bool)
