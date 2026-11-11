"""Sanity checks: known places must land in a plausible height range."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from yelamu.geo import Grid, lonlat_to_utm


@dataclass(frozen=True)
class Expectation:
    name: str
    lon: float
    lat: float
    min_m: float | None = None
    max_m: float | None = None


def load_expectations(path: Path) -> list[Expectation]:
    return [Expectation(**item) for item in json.loads(Path(path).read_text())]


def run_checks(dem: np.ndarray, grid: Grid, expectations: list[Expectation]) -> list[str]:
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
    return failures
