"""Loaders for the raw inputs: a DEM GeoTIFF and GeoJSON polygon files."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
import shapely
from pyproj import Transformer
from rasterio.warp import Resampling, reproject
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry

from yelamu.geo import UTM_CRS, Grid
from yelamu.provenance import provenance_problem

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


@dataclass(frozen=True)
class Feature:
    """One GeoJSON feature with polygonal geometry, in UTM metres, plus its provenance.

    `geometry` is a valid Polygon or MultiPolygon (the union of the cleaned-up parts);
    `polygons` lists its Polygons. `source` / `confidence` come from properties and are
    None when the feature has none (only possible without require_provenance).
    `properties` is the feature's full GeoJSON properties dict. `index` is the feature's
    position (0-based) in the file.
    """

    geometry: BaseGeometry
    source: str | None
    confidence: str | None
    properties: dict[str, Any] = field(default_factory=dict)
    index: int = 0

    @property
    def polygons(self) -> list[BaseGeometry]:
        return _polygonal_parts(self.geometry)

    @property
    def name(self) -> str | None:
        value = self.properties.get("name")
        return value.strip() if isinstance(value, str) and value.strip() else None


def feature_label(path: Path | str, index: int, properties: Any) -> str:
    """'<file>: feature <index> ('<name>')' for error messages."""
    name = properties.get("name") if isinstance(properties, dict) else None
    suffix = f" ({name!r})" if isinstance(name, str) and name.strip() else ""
    return f"{path}: feature {index}{suffix}"


def load_features(
    path: Path, *, allow_empty: bool = False, require_provenance: bool = False
) -> list[Feature]:
    """Read GeoJSON in lon/lat (EPSG:4326) as UTM Features, one per usable feature.

    Geometry is cleaned exactly as load_polygons does (only polygonal parts, repaired).
    Features with no polygonal geometry are skipped. With `require_provenance` every
    kept feature must have properties.source (a non-blank string of at most 200
    characters) and properties.confidence (one of yelamu.export.CONFIDENCE_LEVELS); the
    first violation raises ValueError naming the file and the feature index / name.
    An empty result raises ValueError unless `allow_empty` is True.
    """
    data = json.loads(Path(path).read_text())
    raw_features = data["features"] if data.get("type") == "FeatureCollection" else [data]
    out: list[Feature] = []
    for index, feature in enumerate(raw_features):
        is_feature = feature.get("type") == "Feature"
        raw = feature.get("geometry") if is_feature else feature
        properties = (feature.get("properties") or {}) if is_feature else {}
        parts = geometry_to_utm_polygons(raw)
        if not parts:
            continue
        if require_provenance:
            problem = provenance_problem(properties)
            if problem is not None:
                raise ValueError(f"{feature_label(path, index, properties)}: {problem}")
        source = properties.get("source")
        confidence = properties.get("confidence")
        out.append(Feature(
            geometry=shapely.unary_union(parts),
            source=source.strip() if isinstance(source, str) and source.strip() else None,
            confidence=confidence if isinstance(confidence, str) else None,
            properties=dict(properties),
            index=index,
        ))
    if not out and not allow_empty:
        raise ValueError(f"{path}: no usable polygon geometry was found")
    return out
