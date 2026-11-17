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
_OPTIONAL_PATH_LISTS = ("hand_bay", "hand_marsh", "hand_ponds")
_OPTIONAL_FLOATS = ("smooth_m", "shelf_m", "shore_slope", "open_water_max_m",
                    "pond_max_depth_m", "pond_shelf_m", "pond_bank_slope", "pond_bank_m")
_NON_NEGATIVE = ("pond_bank_slope", "pond_bank_m", "pond_max_depth_m")
_POSITIVE = ("pond_shelf_m",)
_OPTIONAL_INTS = ("shore_open_cells",)
_OPTIONAL_STRING_LISTS = ("pond_classes", "marsh_classes")
_CONTEXT_KEYS = ("bbox", "cell_m", "places", "hand_bay", "hand_marsh")
_KNOWN = (*_REQUIRED, *_OPTIONAL_PATHS, *_OPTIONAL_PATH_LISTS, *_OPTIONAL_FLOATS,
          *_OPTIONAL_INTS, *_OPTIONAL_STRING_LISTS, "context")


@dataclass(frozen=True)
class ContextConfig:
    """The grey surrounding ring (see yelamu/context.py): where it reaches and how coarse it is."""

    bbox: tuple[float, float, float, float]  # west, south, east, north (lon/lat)
    cell_m: float
    places: Path | None = None  # JSON list of modern place labels
    # Hand-drawn water for later 1850s shore stages; same files and rules as the city's.
    hand_bay: list[Path] = field(default_factory=list)
    hand_marsh: list[Path] = field(default_factory=list)


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
    hand_ponds: list[Path] = field(default_factory=list)
    landforms: Path | None = None
    checks: Path | None = None
    # Overrides of the CLI defaults; None means "use the CLI/default value".
    smooth_m: float | None = None
    shelf_m: float | None = None
    shore_slope: float | None = None
    shore_open_cells: int | None = None
    open_water_max_m: float | None = None
    # Ponds: HabitatCla values (SFEI) that are freshwater ponds; None = the built-in
    # default list (yelamu.ponds.DEFAULT_POND_CLASSES), [] = no SFEI ponds.
    pond_classes: list[str] | None = None
    # SFEI HabitatCla values drawn as tidal marsh (marsh level) in addition to the marsh file;
    # None or [] = none.
    marsh_classes: list[str] | None = None
    pond_max_depth_m: float | None = None  # >= 0; 0 gives a bed at the water level
    pond_shelf_m: float | None = None  # > 0
    pond_bank_slope: float | None = None  # >= 0; 0 disables bank grading
    pond_bank_m: float | None = None  # >= 0
    context: ContextConfig | None = None


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _load_context(raw: Any, resolve, fail, city_bbox, city_cell_m: float) -> ContextConfig:
    if not isinstance(raw, dict):
        raise fail("context must be an object")
    unknown = sorted(set(raw) - set(_CONTEXT_KEYS))
    if unknown:
        raise fail(
            f"context: unknown key(s): {', '.join(unknown)} (known keys: {', '.join(_CONTEXT_KEYS)})"
        )
    for key in ("bbox", "cell_m"):
        if key not in raw:
            raise fail(f"context: missing required key {key}")
    bbox = raw["bbox"]
    if not isinstance(bbox, list) or len(bbox) != 4 or not all(_is_number(v) for v in bbox):
        raise fail("context.bbox must be a list of four numbers [west, south, east, north]")
    west, south, east, north = (float(v) for v in bbox)
    if not (-180 <= west and east <= 180 and -90 <= south and north <= 90):
        raise fail(f"context.bbox must lie within lon -180..180 and lat -90..90, got {bbox}")
    cw, cs, ce, cn = city_bbox
    if not (west < cw and south < cs and east > ce and north > cn):
        raise fail(
            f"context.bbox {list(bbox)} must lie strictly outside the region bbox "
            f"{list(city_bbox)} on every side"
        )
    cell = raw["cell_m"]
    if not _is_number(cell) or cell < city_cell_m:
        raise fail(f"context.cell_m must be a number of at least the region cell_m ({city_cell_m:g}), got {cell!r}")
    kwargs: dict[str, Any] = {"bbox": (west, south, east, north), "cell_m": float(cell)}
    if raw.get("places") is not None:
        kwargs["places"] = resolve("context.places", raw["places"])
    for key in ("hand_bay", "hand_marsh"):
        value = raw.get(key)
        if value is None:
            continue
        if not isinstance(value, list):
            raise fail(f"context.{key} must be a list of path strings")
        kwargs[key] = [resolve(f"context.{key}", v) for v in value]
    return ContextConfig(**kwargs)


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
        if key in _NON_NEGATIVE and value < 0:
            raise fail(f"{key} must be 0 or greater, got {value!r}")
        if key in _POSITIVE and not value > 0:
            raise fail(f"{key} must be greater than 0, got {value!r}")
        kwargs[key] = float(value)
    for key in _OPTIONAL_INTS:
        value = data.get(key)
        if value is None:
            continue
        if not isinstance(value, int) or isinstance(value, bool):
            raise fail(f"{key} must be an integer or null, got {value!r}")
        kwargs[key] = value
    for key in _OPTIONAL_STRING_LISTS:
        value = data.get(key)
        if value is None:
            continue
        if not isinstance(value, list) or not all(
            isinstance(v, str) and v.strip() for v in value
        ):
            raise fail(f"{key} must be a list of non-empty strings")
        kwargs[key] = [v.strip() for v in value]
    if data.get("context") is not None:
        kwargs["context"] = _load_context(
            data["context"], resolve, fail, (west, south, east, north), float(cell_m)
        )
    return Region(**kwargs)
