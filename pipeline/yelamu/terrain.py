"""Edits that turn a modern elevation model into a ~1769 one."""

from __future__ import annotations

import numpy as np

from yelamu.geo import Grid


def apply_historical_water(
    dem: np.ndarray,
    bay: np.ndarray,
    marsh: np.ndarray,
    bay_floor: float = -3.0,
    marsh_level: float = 0.5,
) -> np.ndarray:
    """Overwrite reclaimed ground with its historical water level.

    Bay wins over marsh where the masks overlap. Dry land is clamped to >= 0 m so
    survey noise can't dig phantom pits below sea level. NaN (missing data) is fine:
    under water it is overwritten, and on dry land it stays NaN for fill_missing_land.
    """
    out = dem.astype("float32", copy=True)
    land = ~(bay | marsh)
    out[land] = np.maximum(out[land], 0.0)
    out[marsh & ~bay] = marsh_level
    out[bay] = bay_floor
    return out


def fill_missing_land(dem: np.ndarray, max_missing_fraction: float = 0.02) -> np.ndarray:
    """Replace leftover NaN with 0 m, unless too much of the grid is missing.

    Call this after apply_historical_water: every remaining NaN is then dry land with
    no elevation data. A few cells (voids, tile seams) are filled with sea level; a
    large fraction means the DEM doesn't cover the area or the nodata value is wrong.
    """
    out = np.asarray(dem, dtype="float32")
    missing = np.isnan(out)
    if not missing.any():
        return out
    fraction = float(missing.mean())
    if fraction > max_missing_fraction:
        raise ValueError(
            f"{fraction:.1%} of the grid is dry land with no elevation data "
            f"(limit {max_missing_fraction:.1%}). Check that the DEM covers the bounding "
            "box and that its nodata value is right (see the --dem-nodata option)."
        )
    out = out.copy()
    out[missing] = 0.0
    return out


def stamp_landform(
    dem: np.ndarray, grid: Grid, x: float, y: float, radius_m: float, delta_m: float
) -> np.ndarray:
    """Raise (delta_m > 0) or lower (delta_m < 0) the ground around (x, y).

    The change falls off smoothly (a raised-cosine bump) to zero at radius_m, so a
    restored dune or a re-cut hill blends into the surrounding terrain.
    """
    xs = grid.west + (np.arange(grid.width) + 0.5) * grid.cell
    ys = grid.north - (np.arange(grid.height) + 0.5) * grid.cell
    xx, yy = np.meshgrid(xs, ys)
    dist = np.hypot(xx - x, yy - y)
    weight = np.where(dist < radius_m, 0.5 * (1.0 + np.cos(np.pi * dist / radius_m)), 0.0)
    return (dem + delta_m * weight).astype("float32")
