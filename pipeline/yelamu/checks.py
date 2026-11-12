"""Sanity checks: known places must land in a plausible height range (or water state)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from yelamu.geo import Grid, lonlat_to_utm
from yelamu.terrain import LAND_FLOOR_M, WATER_LEVEL_M


@dataclass(frozen=True)
class Expectation:
    """One check. All conditions given must hold.

    min_m / max_m: bounds on the cell height. expect_water: True means the cell is below
    the water level (height < WATER_LEVEL_M, i.e. bay or marsh as the viewer draws it);
    False means it is dry land (height >= LAND_FLOOR_M). expect_pond: True means the cell
    belongs to a freshwater pond (ponds sit at their own level, so use this, not
    expect_water, for lakes); False means it does not. A pond check needs the pond mask
    that cli.build passes; without ponds, expect_pond=True fails.
    """

    name: str
    lon: float
    lat: float
    min_m: float | None = None
    max_m: float | None = None
    expect_water: bool | None = None
    expect_pond: bool | None = None

    def __post_init__(self) -> None:
        for key in ("expect_water", "expect_pond"):
            value = getattr(self, key)
            if value is not None and not isinstance(value, bool):
                raise ValueError(f"{self.name}: {key} must be true or false, got {value!r}")


def load_expectations(path: Path) -> list[Expectation]:
    return [Expectation(**item) for item in json.loads(Path(path).read_text())]


def run_checks(
    dem: np.ndarray,
    grid: Grid,
    expectations: list[Expectation],
    pond_mask: np.ndarray | None = None,
) -> list[str]:
    """Return a list of human-readable failures (empty means all checks passed)."""
    failures = []
    for e in expectations:
        x, y = lonlat_to_utm(e.lon, e.lat)
        pixel = grid.pixel_of(x, y)
        if pixel is None:
            failures.append(f"{e.name}: point is outside the grid")
            continue
        h = float(dem[pixel])
        if e.min_m is not None and h < e.min_m:
            failures.append(f"{e.name}: {h:.1f} m is below the expected minimum {e.min_m} m")
        if e.max_m is not None and h > e.max_m:
            failures.append(f"{e.name}: {h:.1f} m is above the expected maximum {e.max_m} m")
        if e.expect_water is True and not h < WATER_LEVEL_M:
            failures.append(
                f"{e.name}: expected water but {h:.2f} m is not below the water level "
                f"{WATER_LEVEL_M} m")
        if e.expect_water is False and not h >= LAND_FLOOR_M:
            failures.append(
                f"{e.name}: expected dry land but {h:.2f} m is below the land floor "
                f"{LAND_FLOOR_M} m")
        if e.expect_pond is not None:
            in_pond = pond_mask is not None and bool(pond_mask[pixel])
            if e.expect_pond and not in_pond:
                failures.append(f"{e.name}: expected a pond cell but this is not inside any pond")
            if e.expect_pond is False and in_pond:
                failures.append(f"{e.name}: expected no pond but this cell is inside a pond")
    return failures
