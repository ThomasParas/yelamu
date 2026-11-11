"""Turn historical water polygons (UTM metres) into a boolean mask on the grid."""

from __future__ import annotations

from typing import Sequence

import numpy as np
from rasterio.features import rasterize
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
