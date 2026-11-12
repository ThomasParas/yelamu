"""A region: everything needed to build one area, read from a reproducible JSON file.

Region files live in `<pipeline>/regions/`. Relative paths inside one are resolved
against the pipeline directory (the parent of `regions/`), so the same file works from
any working directory.
"""

from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

_REQUIRED = ("name", "bbox", "cell_m", "dem", "out")
_OPTIONAL_PATHS = ("habitats", "bay", "marsh", "landforms", "checks")
_OPTIONAL_PATH_LISTS = ("hand_bay", "hand_marsh")
_OPTIONAL_FLOATS = ("smooth_m", "shelf_m", "shore_slope", "open_water_max_m")
_OPTIONAL_INTS = ("shore_open_cells",)
_KNOWN = (*_REQUIRED, *_OPTIONAL_PATHS, *_OPTIONAL_PATH_LISTS, *_OPTIONAL_FLOATS,
          *_OPTIONAL_INTS)


@dataclass(frozen=True)
class Region:
    name: str
    bbox: tuple[float, float, float, float]  # west, south, east, north (lon/lat)
    cell_m: float
    dem: Path
    out: Path
    habitats: Path | None = None
    bay: Path | None = None
    marsh: Path | None = None
    hand_bay: list[Path] = field(default_factory=list)
    hand_marsh: list[Path] = field(default_factory=list)
    landforms: Path | None = None
    checks: Path | None = None
    # Overrides of the CLI defaults; None means "use the CLI/default value".
    smooth_m: float | None = None
    shelf_m: float | None = None
    shore_slope: float | None = None
    shore_open_cells: int | None = None
    open_water_max_m: float | None = None


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def load_region(path: Path) -> Region:
    """Read and validate a region JSON file. Raises ValueError naming the file."""
    path = Path(path)
    base = path.resolve().parent.parent  # the pipeline directory (resolved: cwd may be regions/)

    def fail(msg: str) -> ValueError:
        return ValueError(f"{path}: {msg}")

    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise fail(f"not valid JSON ({exc})") from exc
    if not isinstance(data, dict):
        raise fail("must contain a JSON object")

    unknown = sorted(set(data) - set(_KNOWN))
    if unknown:
        raise fail(f"unknown key(s): {', '.join(unknown)} (known keys: {', '.join(_KNOWN)})")
    missing = [k for k in _REQUIRED if k not in data]
    if missing:
        raise fail(f"missing required key(s): {', '.join(missing)}")

    def resolve(key: str, value: Any) -> Path:
        if not isinstance(value, str) or not value.strip():
            raise fail(f"{key} must be a non-empty path string")
        return Path(os.path.normpath(base / value))

    name = data["name"]
    if not isinstance(name, str) or not name.strip():
        raise fail("name must be a non-empty string")

    bbox = data["bbox"]
    if not isinstance(bbox, list) or len(bbox) != 4 or not all(_is_number(v) for v in bbox):
        raise fail("bbox must be a list of four numbers [west, south, east, north]")
    west, south, east, north = (float(v) for v in bbox)
    if not (west < east and south < north):
        raise fail(f"bbox must satisfy west < east and south < north, got {bbox}")
    if not (-180 <= west and east <= 180 and -90 <= south and north <= 90):
        raise fail(f"bbox must lie within lon -180..180 and lat -90..90, got {bbox}")

    cell_m = data["cell_m"]
    if not _is_number(cell_m) or cell_m <= 0:
        raise fail(f"cell_m must be a number greater than 0, got {cell_m!r}")

    kwargs: dict[str, Any] = {
        "name": name,
        "bbox": (west, south, east, north),
        "cell_m": float(cell_m),
        "dem": resolve("dem", data["dem"]),
        "out": resolve("out", data["out"]),
    }
    for key in _OPTIONAL_PATHS:
        if data.get(key) is not None:
            kwargs[key] = resolve(key, data[key])
    for key in _OPTIONAL_PATH_LISTS:
        value = data.get(key)
        if value is None:
            continue
        if not isinstance(value, list):
            raise fail(f"{key} must be a list of path strings")
        kwargs[key] = [resolve(key, v) for v in value]
    for key in _OPTIONAL_FLOATS:
        value = data.get(key)
        if value is None:
            continue
        if not _is_number(value):
            raise fail(f"{key} must be a number or null, got {value!r}")
        kwargs[key] = float(value)
    for key in _OPTIONAL_INTS:
        value = data.get(key)
        if value is None:
            continue
        if not isinstance(value, int) or isinstance(value, bool):
            raise fail(f"{key} must be an integer or null, got {value!r}")
        kwargs[key] = value
    return Region(**kwargs)
