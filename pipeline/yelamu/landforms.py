"""Hand-sculpted landforms: validation, loading and stamping.

`landforms.json` is a list of entries, each with a `source` and a `confidence`
(the build rejects entries without them). Two kinds:

    {"kind": "bump",  "name": "...", "lon": .., "lat": .., "radius_m": .., "delta_m": ..,
     "source": "...", "confidence": "documented|inferred|illustrative"}
    {"kind": "ridge", "name": "...", "points": [[lon, lat], ...] (>= 2),
     "half_width_m": .., "delta_m": .., "source": "...", "confidence": "..."}

`kind` defaults to "bump"; `name` is optional. A bump is a raised-cosine hill/dent
(terrain.stamp_landform); a ridge is a raised-cosine band along a polyline
(terrain.stamp_ridge). Positive delta_m raises, negative lowers; stamps ADD.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Sequence

import numpy as np

from yelamu.geo import Grid, lonlat_to_utm
from yelamu.provenance import provenance_problem
from yelamu.terrain import stamp_landform, stamp_ridge

KINDS = ("bump", "ridge")
_COMMON = {"kind", "name", "source", "confidence", "delta_m"}
_KEYS = {
    "bump": _COMMON | {"lon", "lat", "radius_m"},
    "ridge": _COMMON | {"points", "half_width_m"},
}


def _num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _label(item: Any, index: int) -> str:
    name = item.get("name") if isinstance(item, dict) else None
    return f"landforms[{index}]" + (f" ({name!r})" if isinstance(name, str) and name else "")


def _validate_one(item: Any, bbox: tuple[float, float, float, float]) -> str | None:
    """The first problem with one entry (without its label), or None."""
    if not isinstance(item, dict):
        return "must be an object"
    kind = item.get("kind", "bump")
    if kind not in KINDS:
        return f"kind must be one of {', '.join(KINDS)}, got {kind!r}"
    unknown = sorted(set(item) - _KEYS[kind])
    if unknown:
        return (f"unknown key(s) for kind {kind!r}: {', '.join(unknown)} "
                f"(allowed: {', '.join(sorted(_KEYS[kind]))})")
    if "name" in item and not (isinstance(item["name"], str) and item["name"].strip()):
        return "name must be a non-blank string"
    problem = provenance_problem(item)
    if problem is not None:
        return problem.replace("properties.", "")
    if not _num(item.get("delta_m")):
        return f"delta_m must be a number, got {item.get('delta_m')!r}"
    west, south, east, north = bbox

    def in_box(lon: Any, lat: Any, what: str) -> str | None:
        if not (_num(lon) and _num(lat)):
            return f"{what} must be numbers (lon, lat)"
        if not (west <= lon <= east and south <= lat <= north):
            return (f"{what} ({lon}, {lat}) is outside the region bbox "
                    f"[{west}, {south}, {east}, {north}] (is lon/lat swapped?)")
        return None

    if kind == "bump":
        for key in ("lon", "lat", "radius_m"):
            if key not in item:
                return f"{key} is required"
        err = in_box(item["lon"], item["lat"], "lon/lat")
        if err:
            return err
        if not (_num(item["radius_m"]) and item["radius_m"] > 0):
            return f"radius_m must be a number greater than 0, got {item['radius_m']!r}"
        return None

    # ridge
    for key in ("points", "half_width_m"):
        if key not in item:
            return f"{key} is required"
    points = item["points"]
    if not isinstance(points, list) or len(points) < 2:
        return "points must be a list of at least two [lon, lat] pairs"
    for i, pt in enumerate(points):
        if not (isinstance(pt, (list, tuple)) and len(pt) == 2):
            return f"points[{i}] must be a [lon, lat] pair"
        err = in_box(pt[0], pt[1], f"points[{i}]")
        if err:
            return err
    if len({(float(p[0]), float(p[1])) for p in points}) < 2:
        return "points must not all be the same location (the ridge has no length)"
    if not (_num(item["half_width_m"]) and item["half_width_m"] > 0):
        return f"half_width_m must be a number greater than 0, got {item['half_width_m']!r}"
    return None


def validate_landforms(items: Any, bbox: tuple[float, float, float, float]) -> None:
    """Raise ValueError (naming the entry) for the first invalid landform entry."""
    if not isinstance(items, list):
        raise ValueError("landforms must be a JSON list of entries")
    for index, item in enumerate(items):
        problem = _validate_one(item, bbox)
        if problem is not None:
            raise ValueError(f"{_label(item, index)}: {problem}")


def load_landforms(path: Path, bbox: tuple[float, float, float, float]) -> list[dict]:
    """Read and validate a landforms JSON file; ValueError messages name the file."""
    path = Path(path)
    try:
        items = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: not valid JSON ({exc})") from exc
    try:
        validate_landforms(items, bbox)
    except ValueError as exc:
        raise ValueError(f"{path}: {exc}") from exc
    return items


def apply_landforms(dem: np.ndarray, grid: Grid, items: Sequence[dict]) -> np.ndarray:
    """Stamp every (validated) entry onto a copy of dem, in file order."""
    out = np.asarray(dem, dtype="float32").copy()
    for item in items:
        if item.get("kind", "bump") == "ridge":
            pts = [lonlat_to_utm(lon, lat) for lon, lat in item["points"]]
            out = stamp_ridge(out, grid, pts, item["half_width_m"], item["delta_m"])
        else:
            x, y = lonlat_to_utm(item["lon"], item["lat"])
            out = stamp_landform(out, grid, x, y, item["radius_m"], item["delta_m"])
    return out


def landform_provenance(items: Sequence[dict]) -> list[tuple[str, str]]:
    """(source, confidence) per entry, in file order."""
    return [(item["source"].strip(), item["confidence"]) for item in items]
