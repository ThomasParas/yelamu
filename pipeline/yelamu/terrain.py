"""Edits that turn a modern elevation model into a ~1769 one."""

from __future__ import annotations

import numpy as np

from yelamu.geo import Grid

# One source of truth for the vertical datum the viewer relies on. The viewer draws a
# water plane at WATER_LEVEL_M (it reads the value from meta.json), so everything is
# placed relative to it: marsh sits just BELOW the water level so it reads as shallow
# water, and dry land sits ABOVE it so it can never be drawn as water.
WATER_LEVEL_M = 0.6
MARSH_LEVEL_M = 0.5
LAND_FLOOR_M = 1.0
BAY_FLOOR_M = -3.0


def apply_historical_water(
    dem: np.ndarray,
    bay: np.ndarray,
    marsh: np.ndarray,
    bay_floor: float = BAY_FLOOR_M,
    marsh_level: float = MARSH_LEVEL_M,
) -> np.ndarray:
    """Overwrite reclaimed ground with its historical water level.

    Bay wins over marsh where the masks overlap. Dry land is clamped to >=
    LAND_FLOOR_M, which is above WATER_LEVEL_M, so survey noise can't dig phantom pits
    and dry land is never drawn as water. Marsh is set to MARSH_LEVEL_M, just below
    WATER_LEVEL_M, so it reads as shallow water. NaN (missing data) is fine:
    under water it is overwritten, and on dry land it stays NaN for fill_missing_land.
    """
    out = dem.astype("float32", copy=True)
    land = ~(bay | marsh)
    # Known simplification: real coast land between 0 and 1 m is flattened up to 1 m.
    out[land] = np.maximum(out[land], LAND_FLOOR_M)
    out[marsh & ~bay] = marsh_level
    out[bay] = bay_floor
    return out


def fill_missing_land(dem: np.ndarray, max_missing_fraction: float = 0.02) -> np.ndarray:
    """Replace leftover NaN with LAND_FLOOR_M, unless too much of the grid is missing.

    Call this after apply_historical_water: every remaining NaN is then dry land with
    no elevation data. A few cells (voids, tile seams) are filled with the land floor (just above the water plane); a
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
    out[missing] = LAND_FLOOR_M
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
