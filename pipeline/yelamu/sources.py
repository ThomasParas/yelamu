"""Loaders for the raw inputs: a DEM GeoTIFF and GeoJSON polygon files."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import rasterio
import shapely
from pyproj import Transformer
from rasterio.warp import Resampling, reproject
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry

from yelamu.geo import UTM_CRS, Grid

_LONLAT_TO_UTM = Transformer.from_crs("EPSG:4326", UTM_CRS, always_xy=True)


def _to_utm(geom: BaseGeometry) -> BaseGeometry:
    def project(coords: np.ndarray) -> np.ndarray:
        x, y = _LONLAT_TO_UTM.transform(coords[:, 0], coords[:, 1])
        return np.column_stack([x, y])

    return shapely.transform(geom, project)


def load_dem(path: Path, grid: Grid) -> np.ndarray:
    """Resample a DEM (any CRS) onto the grid. Cells with no data become 0 m."""
    dst = np.full((grid.height, grid.width), np.nan, dtype="float32")
    with rasterio.open(path) as src:
        reproject(
            source=rasterio.band(src, 1),
            destination=dst,
            dst_transform=grid.transform(),
            dst_crs=UTM_CRS,
            resampling=Resampling.bilinear,
            src_nodata=src.nodata,
            dst_nodata=np.nan,
        )
    return np.nan_to_num(dst, nan=0.0).astype("float32")


def load_polygons(path: Path) -> list[BaseGeometry]:
    """Read a GeoJSON FeatureCollection in lon/lat (EPSG:4326); return UTM geometries."""
    data = json.loads(Path(path).read_text())
    features = data["features"] if data.get("type") == "FeatureCollection" else [data]
    geoms = []
    for feature in features:
        geom = shape(feature["geometry"] if "geometry" in feature else feature)
        geoms.append(_to_utm(geom))
    return geoms
