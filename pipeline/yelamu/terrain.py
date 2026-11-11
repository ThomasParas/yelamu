"""Edits that turn a modern elevation model into a ~1769 one."""

from __future__ import annotations

import numpy as np
from scipy import ndimage

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


def smooth_land(
    dem: np.ndarray, sigma_cells: float, valid: np.ndarray | None = None
) -> np.ndarray:
    """Gaussian low-pass of the land surface that ignores water and missing data.

    The lidar DEM carries the modern city (street grid, building pads) that did not
    exist in 1769; a gentle blur erases features a few cells wide while keeping the
    hills. It is a normalized convolution: out = G(dem * valid) / G(valid), so only
    `valid` cells contribute and a very low water value cannot pull the shore down.
    `valid` defaults to the non-NaN cells (NaN is always excluded). Cells outside
    `valid` keep their ORIGINAL value, so water and NaN cells are untouched. A
    sigma_cells <= 0 returns an unchanged float32 copy.
    """
    out = np.asarray(dem, dtype="float32").copy()
    if sigma_cells <= 0:
        return out
    ok = ~np.isnan(out)
    if valid is not None:
        ok &= np.asarray(valid, dtype=bool)
    if not ok.any():
        return out
    data = np.where(ok, out, 0.0).astype("float64")
    weight = ok.astype("float64")
    num = ndimage.gaussian_filter(data, sigma_cells, mode="nearest")
    den = ndimage.gaussian_filter(weight, sigma_cells, mode="nearest")
    good = ok & (den > 1e-6)
    smoothed = num[good] / den[good]
    # A weighted mean can't leave the input range; clip away rounding so a constant
    # field stays exactly constant.
    smoothed = np.clip(smoothed, out[ok].min(), out[ok].max())
    out[good] = smoothed.astype("float32")
    return out


def apply_bay_shelf(
    dem: np.ndarray, bay: np.ndarray, cell_m: float, shelf_m: float = 150.0
) -> np.ndarray:
    """Give the bay a sloping floor instead of a flat one with a wall at the shore.

    Depth ramps from the water surface (WATER_LEVEL_M) at the shoreline down to
    BAY_FLOOR_M over `shelf_m` metres, following a smoothstep of the distance to the
    nearest non-bay cell, so there is no vertical wall where dry land meets the bay.
    Non-bay cells are unchanged. shelf_m <= 0 (or a grid with no non-bay cell) gives
    a flat BAY_FLOOR_M. Call it after apply_historical_water.
    """
    out = np.asarray(dem, dtype="float32").copy()
    bay = np.asarray(bay, dtype=bool)
    if not bay.any():
        return out
    if shelf_m <= 0 or bay.all():
        out[bay] = BAY_FLOOR_M
        return out
    dist_m = ndimage.distance_transform_edt(bay) * cell_m
    t = np.clip(dist_m[bay] / shelf_m, 0.0, 1.0)
    s = t * t * (3.0 - 2.0 * t)
    out[bay] = (WATER_LEVEL_M + (BAY_FLOOR_M - WATER_LEVEL_M) * s).astype("float32")
    return out


def apply_land_ramp(
    dem: np.ndarray, water: np.ndarray, cell_m: float, slope_cap: float
) -> np.ndarray:
    """Limit how steeply dry land may rise away from the historical shoreline.

    Modern fill and grading near the 1769 shoreline sit several metres above the
    water, so without this the land would drop straight into the water as a wall.
    Land is therefore limited to rise at most `slope_cap` metres per metre from the
    nearest water cell: height <= LAND_FLOOR_M + slope_cap * distance. Real steep
    bluffs further inland are untouched, because the cap grows past their height.
    `water` is a bool mask of bay | marsh cells; water cells and NaN are unchanged and
    land is only ever lowered, never raised. slope_cap <= 0 (disabled), a grid with
    no water cell (nothing to measure from) or an all-water grid gives an unchanged
    float32 copy. Call it after apply_historical_water and fill_missing_land.
    """
    out = np.asarray(dem, dtype="float32").copy()
    water = np.asarray(water, dtype=bool)
    if slope_cap <= 0 or not water.any() or water.all():
        return out
    dist_m = ndimage.distance_transform_edt(~water) * cell_m
    cap = (LAND_FLOOR_M + slope_cap * dist_m).astype("float32")
    land = ~water
    # np.minimum propagates NaN, so missing data stays missing.
    out[land] = np.minimum(out[land], cap[land])
    return out
