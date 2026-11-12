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


def load_dem(path: Path, grid: Grid, nodata: float | None = None) -> np.ndarray:
    """Resample a DEM (any CRS) onto the grid.

    Cells with no data come back as NaN; they are NOT filled here. Over open water a
    bare-earth DEM is often nodata, which is fine because the historical-water edit
    overwrites those cells. `nodata` overrides the file's own nodata tag (use it when
    the tag is missing or wrong, e.g. an untagged -9999).
    """
    dst = np.full((grid.height, grid.width), np.nan, dtype="float32")
    with rasterio.open(path) as src:
        reproject(
            source=rasterio.band(src, 1),
            destination=dst,
            dst_transform=grid.transform(),
            dst_crs=UTM_CRS,
            resampling=Resampling.bilinear,
            src_nodata=nodata if nodata is not None else src.nodata,
            dst_nodata=np.nan,
        )
    return dst


def _polygonal_parts(geom: BaseGeometry | None) -> list[BaseGeometry]:
    """Every Polygon inside geom (exploding Multi* and collections); all else dropped."""
    if geom is None or geom.is_empty:
        return []
    if geom.geom_type == "Polygon":
        return [geom]
    if hasattr(geom, "geoms"):  # MultiPolygon, GeometryCollection, other Multi*
        return [p for part in geom.geoms for p in _polygonal_parts(part)]
    return []  # Point, LineString, LinearRing


def geometry_to_utm_polygons(raw: dict | None) -> list[BaseGeometry]:
    """GeoJSON geometry (lon/lat) -> repaired UTM Polygons; non-polygonal parts dropped."""
    if not raw:
        return []
    polygons: list[BaseGeometry] = []
    for part in _polygonal_parts(shape(raw)):
        for poly in _polygonal_parts(shapely.make_valid(part)):
            polygons.append(_to_utm(poly))
    return polygons


def load_polygons(path: Path, allow_empty: bool = False) -> list[BaseGeometry]:
    """Read GeoJSON in lon/lat (EPSG:4326); return valid UTM polygons.

    Features with no geometry are skipped. Only polygonal parts are kept: points and
    lines (also inside collections) are dropped so they can never reach the water mask.
    Raises ValueError if no polygon geometry is found at all, unless `allow_empty` is
    True, in which case [] is returned (for optional, initially empty files).
    """
    data = json.loads(Path(path).read_text())
    features = data["features"] if data.get("type") == "FeatureCollection" else [data]
    geoms: list[BaseGeometry] = []
    for feature in features:
        raw = feature.get("geometry") if feature.get("type") == "Feature" else feature
        geoms.extend(geometry_to_utm_polygons(raw))
    if not geoms and not allow_empty:
        raise ValueError(f"{path}: no usable polygon geometry was found")
    return geoms
