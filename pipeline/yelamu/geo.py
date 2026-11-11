"""Coordinate handling: one local metric grid (UTM zone 10N) for the whole pipeline."""

from __future__ import annotations

import math
from dataclasses import dataclass

from pyproj import Transformer
from rasterio.transform import Affine, from_origin

UTM_CRS = "EPSG:32610"
_TO_UTM = Transformer.from_crs("EPSG:4326", UTM_CRS, always_xy=True)


def lonlat_to_utm(lon: float, lat: float) -> tuple[float, float]:
    x, y = _TO_UTM.transform(lon, lat)
    return x, y


@dataclass(frozen=True)
class Grid:
    """A north-up raster grid in UTM metres. Row 0 is the northern edge."""

    west: float
    south: float
    east: float
    north: float
    cell: float

    @property
    def width(self) -> int:
        return round((self.east - self.west) / self.cell)

    @property
    def height(self) -> int:
        return round((self.north - self.south) / self.cell)

    def transform(self) -> Affine:
        return from_origin(self.west, self.north, self.cell, self.cell)

    @classmethod
    def from_lonlat_bbox(
        cls, west: float, south: float, east: float, north: float, cell: float
    ) -> "Grid":
        corners = [
            lonlat_to_utm(west, south),
            lonlat_to_utm(west, north),
            lonlat_to_utm(east, south),
            lonlat_to_utm(east, north),
        ]
        xs = [c[0] for c in corners]
        ys = [c[1] for c in corners]
        x0, y1 = min(xs), max(ys)
        # Snap the far edges outwards so the grid is a whole number of cells.
        x1 = x0 + math.ceil((max(xs) - x0) / cell) * cell
        y0 = y1 - math.ceil((y1 - min(ys)) / cell) * cell
        return cls(west=x0, south=y0, east=x1, north=y1, cell=cell)

    def pixel_of(self, x: float, y: float) -> tuple[int, int] | None:
        """(row, col) of the cell containing UTM point (x, y), or None if outside."""
        col = math.floor((x - self.west) / self.cell)
        row = math.floor((self.north - y) / self.cell)
        if 0 <= row < self.height and 0 <= col < self.width:
            return row, col
        return None
