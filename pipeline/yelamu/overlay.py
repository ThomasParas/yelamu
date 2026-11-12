"""The orientation overlay: modern streets, landmarks and documented landscape hotspots.

Everything is converted here into the viewer's WORLD coordinates so the viewer needs no
map-projection code. World coordinates are metres with the origin at the centre of the
terrain grid:

    x = E - (west + east) / 2        (+x is east)
    z = (north + south) / 2 - N      (+z is south)

where E, N are UTM zone 10N (EPSG:32610) coordinates and west/east/south/north are the
edges of the `Grid`. This is exactly the vertex position the viewer's terrain mesh uses
for a cell centre: x = (col - (width-1)/2) * cell, z = (row - (height-1)/2) * cell.

The result is written as `overlay.json` next to `heightmap.u16` / `meta.json`, and
`meta.json` gains `"overlay_file": "overlay.json"`.

    uv run python scripts/build_overlay.py --region regions/full-city.json
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any, Iterable, Sequence
from urllib.parse import urlparse

import numpy as np
import shapefile
from pyproj import Transformer
from shapely.geometry import LineString, box

from yelamu.export import CONFIDENCE_LEVELS
from yelamu.geo import Grid, lonlat_to_utm
from yelamu.region import load_region

OVERLAY_VERSION = 1
OVERLAY_FILE = "overlay.json"

STREET_KINDS = ("primary", "secondary", "local")
# TIGER/Line feature class codes: S1100 primary road, S1200 secondary road, S1400 local
# neighbourhood road. Ramps (S1630), service roads, alleys, trails, walkways, ... are dropped.
_MTFCC_KIND = {"S1100": "primary", "S1200": "secondary", "S1400": "local"}

LANDMARK_KINDS = ("park", "bridge", "hill", "building", "neighborhood", "beach", "water",
                  "fort", "other")
HOTSPOT_KINDS = ("creek", "lagoon", "marsh", "dune", "hill", "shoreline", "bay", "lake",
                 "valley", "other")
DESCRIPTION_MIN, DESCRIPTION_MAX = 20, 400

_ID_RE = re.compile(r"[a-z0-9][a-z0-9-]*")

# TIGER/Line coordinates are NAD83 geographic. NAD83 and WGS84 differ by about a metre in
# this area, far below the 6 m street-simplification tolerance, so EPSG:4326 is used.
_LONLAT_TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32610", always_xy=True)


# ------------------------------------------------------------------ world coordinates


def world_xz(grid: Grid, easting: float, northing: float) -> tuple[float, float]:
    """UTM 10N (easting, northing) -> viewer world metres (x east, z south, origin = centre)."""
    return (easting - (grid.west + grid.east) / 2.0, (grid.north + grid.south) / 2.0 - northing)


def lonlat_to_world(grid: Grid, lon: float, lat: float) -> tuple[float, float]:
    easting, northing = lonlat_to_utm(lon, lat)
    return world_xz(grid, easting, northing)


def _r1(value: float) -> float:
    """Round to 0.1 m (and turn -0.0 into 0.0 so the JSON stays clean)."""
    return round(float(value), 1) + 0.0


# --------------------------------------------------------------------------- streets


def kind_for_mtfcc(code: str | None) -> str | None:
    """'primary' / 'secondary' / 'local' for S1100 / S1200 / S1400, otherwise None (dropped)."""
    if not isinstance(code, str):
        return None
    return _MTFCC_KIND.get(code.strip())


def read_tiger_roads(path: Path | str) -> list[dict]:
    """Read a TIGER/Line roads shapefile into [{name, kind, coords}].

    `coords` is a list of polylines, each a list of (lon, lat); a feature with several
    parts gives several polylines. Features whose MTFCC is not a kept street class, or
    that have no FULLNAME, are skipped. File order is preserved.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"TIGER roads shapefile not found: {path}")
    roads: list[dict] = []
    with shapefile.Reader(str(path)) as reader:
        for shape_record in reader.iterShapeRecords():
            record = shape_record.record.as_dict()
            kind = kind_for_mtfcc(record.get("MTFCC"))
            name = record.get("FULLNAME")
            if kind is None or not isinstance(name, str) or not name.strip():
                continue
            shape = shape_record.shape
            points = shape.points
            starts = list(shape.parts) + [len(points)]
            parts = [
                [(float(x), float(y)) for x, y in points[a:b]]
                for a, b in zip(starts[:-1], starts[1:])
            ]
            parts = [p for p in parts if len(p) >= 2]
            if parts:
                roads.append({"name": name.strip(), "kind": kind, "coords": parts})
    return roads


def build_streets(
    roads: Iterable[dict],
    grid: Grid,
    tolerance_m: float = 6.0,
    kinds: Sequence[str] = STREET_KINDS,
) -> list[dict]:
    """Roads -> [{name, kind, lines}] in world metres, simplified, merged and rounded.

    Each polyline is projected, simplified (Douglas-Peucker, `tolerance_m`), and kept only
    if it intersects the grid (it is not cut at the edge). Polylines of the same
    (name, kind) are merged into one entry whose `lines` are flat [x0, z0, x1, z1, ...]
    lists rounded to 0.1 m; lines with fewer than two distinct points are dropped. The
    result is sorted by (kind order, name) and each entry's lines are sorted, so it does
    not depend on the input order.
    """
    wanted = set(kinds)
    half_w = (grid.east - grid.west) / 2.0
    half_h = (grid.north - grid.south) / 2.0
    bounds = box(-half_w, -half_h, half_w, half_h)
    centre_e = (grid.west + grid.east) / 2.0
    centre_n = (grid.north + grid.south) / 2.0

    merged: dict[tuple[str, str], list[list[float]]] = {}
    for road in roads:
        kind, name = road["kind"], road["name"]
        if kind not in wanted:
            continue
        for part in road["coords"]:
            arr = np.asarray(part, dtype=float).reshape(-1, 2)
            if len(arr) < 2:
                continue
            easting, northing = _LONLAT_TO_UTM.transform(arr[:, 0], arr[:, 1])
            xs = np.asarray(easting) - centre_e
            zs = centre_n - np.asarray(northing)
            geom = LineString(np.column_stack([xs, zs]))
            if tolerance_m > 0:
                geom = geom.simplify(tolerance_m, preserve_topology=False)
            if geom.is_empty or not geom.intersects(bounds):
                continue
            flat: list[float] = []
            for x, z in geom.coords:
                x, z = _r1(x), _r1(z)
                if len(flat) >= 2 and flat[-2] == x and flat[-1] == z:
                    continue  # consecutive duplicate after rounding
                flat.extend((x, z))
            if len(flat) >= 4:
                merged.setdefault((kind, name), []).append(flat)

    order = {k: i for i, k in enumerate(STREET_KINDS)}
    return [
        {"name": name, "kind": kind, "lines": sorted(lines)}
        for (kind, name), lines in sorted(merged.items(), key=lambda kv: (order[kv[0][0]], kv[0][1]))
    ]


def _polyline_length(flat: Sequence[float]) -> float:
    """Length in metres of a flat [x0, z0, x1, z1, ...] polyline (world coordinates)."""
    return math.fsum(
        math.hypot(flat[i + 2] - flat[i], flat[i + 3] - flat[i + 1])
        for i in range(0, len(flat) - 3, 2)
    )


def promote_long_streets(streets: list[dict], min_length_m: float = 6000.0) -> list[dict]:
    """Promote long 'local' streets to 'secondary'; returns a NEW list.

    TIGER classes most San Francisco arterials as S1400 ('local'), so they would get no
    visual hierarchy. A local street whose total polyline length (metres, summed over all
    its lines and over every local entry of the same name) is >= `min_length_m` becomes
    'secondary'; everything else is unchanged. `min_length_m` <= 0 disables the promotion
    (an equal copy is returned, order untouched). If a promoted street shares its name with
    an existing secondary entry the two are merged (lines sorted). The result keeps the
    module's deterministic order: kind order (primary, secondary, local), then name.
    """
    copies = [{"name": s["name"], "kind": s["kind"], "lines": [list(ln) for ln in s["lines"]]}
              for s in streets]
    if not min_length_m > 0:
        return copies
    totals: dict[str, list[float]] = {}
    for s in copies:
        if s["kind"] == "local":
            totals.setdefault(s["name"], []).extend(_polyline_length(ln) for ln in s["lines"])
    long_names = {n for n, parts in totals.items() if math.fsum(parts) >= min_length_m}
    for s in copies:
        if s["kind"] == "local" and s["name"] in long_names:
            s["kind"] = "secondary"
    merged: dict[tuple[str, str], dict] = {}
    for s in copies:
        key = (s["kind"], s["name"])
        if key in merged:
            merged[key]["lines"] = sorted(merged[key]["lines"] + s["lines"])
        else:
            merged[key] = s
    order = {k: i for i, k in enumerate(STREET_KINDS)}
    return sorted(merged.values(), key=lambda s: (order[s["kind"]], s["name"]))


# ----------------------------------------------------------- landmarks and hotspots


def _label(item: Any, index: int) -> str:
    if isinstance(item, dict) and isinstance(item.get("id"), str) and item["id"].strip():
        return item["id"]
    return f"item #{index}"


def _nonblank(item: dict, key: str, label: str) -> str:
    if key not in item:
        raise ValueError(f"{label}: missing field {key!r}")
    value = item[key]
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label}: {key!r} must be a non-blank string, got {value!r}")
    return value


def _validate_common(
    items: Any, bbox: tuple[float, float, float, float], kinds: Sequence[str], what: str
) -> None:
    if not isinstance(items, list):
        raise ValueError(f"{what} must be a JSON list of objects, got {type(items).__name__}")
    west, south, east, north = bbox
    seen: set[str] = set()
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise ValueError(f"{what} item #{index}: must be an object, got {item!r}")
        label = _label(item, index)
        item_id = _nonblank(item, "id", label)
        if not _ID_RE.fullmatch(item_id):
            raise ValueError(f"{label}: 'id' must match ^[a-z0-9][a-z0-9-]*$, got {item_id!r}")
        if item_id in seen:
            raise ValueError(f"{label}: duplicate id {item_id!r}")
        seen.add(item_id)
        _nonblank(item, "name", label)
        kind = _nonblank(item, "kind", label)
        if kind not in kinds:
            raise ValueError(f"{label}: kind {kind!r} is not one of {', '.join(kinds)}")
        for key in ("lon", "lat"):
            if key not in item:
                raise ValueError(f"{label}: missing field {key!r}")
            v = item[key]
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
                raise ValueError(f"{label}: {key!r} must be a finite number, got {v!r}")
        lon, lat = item["lon"], item["lat"]
        if not (west <= lon <= east and south <= lat <= north):
            raise ValueError(
                f"{label}: lon/lat ({lon}, {lat}) is outside the region bbox {list(bbox)}"
            )


def validate_landmarks(items: Any, bbox: tuple[float, float, float, float]) -> None:
    """Raise ValueError (naming the item id) if any landmark is malformed."""
    _validate_common(items, bbox, LANDMARK_KINDS, "landmarks")


def validate_hotspots(items: Any, bbox: tuple[float, float, float, float]) -> None:
    """Raise ValueError (naming the item id) if any hotspot is malformed."""
    _validate_common(items, bbox, HOTSPOT_KINDS, "hotspots")
    for index, item in enumerate(items):
        label = _label(item, index)
        description = item.get("description")
        if not isinstance(description, str) or not (
            DESCRIPTION_MIN <= len(description.strip()) <= DESCRIPTION_MAX
        ):
            raise ValueError(
                f"{label}: 'description' must be a string of {DESCRIPTION_MIN}.."
                f"{DESCRIPTION_MAX} characters"
            )
        sources = item.get("sources")
        if not isinstance(sources, list) or not sources:
            raise ValueError(f"{label}: 'sources' must be a non-empty list of {{title, url}}")
        for source in sources:
            if not isinstance(source, dict):
                raise ValueError(f"{label}: each of 'sources' must be an object, got {source!r}")
            title, url = source.get("title"), source.get("url")
            if not isinstance(title, str) or not title.strip():
                raise ValueError(f"{label}: every source in 'sources' needs a non-blank title")
            parsed = urlparse(url) if isinstance(url, str) else None
            if parsed is None or parsed.scheme not in ("http", "https") or not parsed.netloc:
                raise ValueError(
                    f"{label}: source url in 'sources' must be an http(s) URL, got {url!r}"
                )
        confidence = item.get("confidence")
        if confidence not in CONFIDENCE_LEVELS:
            raise ValueError(
                f"{label}: 'confidence' must be one of {', '.join(CONFIDENCE_LEVELS)}, "
                f"got {confidence!r}"
            )


def _place(grid: Grid, item: dict, extra: Sequence[str]) -> dict:
    x, z = lonlat_to_world(grid, item["lon"], item["lat"])
    out = {
        "id": item["id"], "name": item["name"].strip(), "kind": item["kind"],
        "x": _r1(x), "z": _r1(z), "lon": float(item["lon"]), "lat": float(item["lat"]),
    }
    for key in extra:
        value = item[key]
        out[key] = value.strip() if isinstance(value, str) else value
    return out


# --------------------------------------------------------------------------- build


def _check_meta_matches_grid(meta: dict, grid: Grid, path: Path) -> None:
    for key, expected in (("west", grid.west), ("south", grid.south), ("east", grid.east),
                          ("north", grid.north)):
        if key in meta and abs(float(meta[key]) - expected) > 0.01:
            raise ValueError(
                f"{path}: meta {key}={meta[key]} does not match the grid built from the "
                f"region ({expected}); the overlay would not line up with this heightmap"
            )
    for key, expected in (("width", grid.width), ("height", grid.height)):
        if key in meta and meta[key] != expected:
            raise ValueError(
                f"{path}: meta {key}={meta[key]} does not match the region grid ({expected})"
            )


def _load_json_list(path: Path, what: str) -> Any:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"{what} file not found: {path}")
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: not valid JSON ({exc})") from exc


def build_overlay(
    *,
    bbox: tuple[float, float, float, float],
    cell: float,
    out_dir: Path | str,
    tiger_path: Path | str,
    landmarks_path: Path | str,
    hotspots_path: Path | str,
    tolerance_m: float = 6.0,
    promote_m: float = 6000.0,
) -> dict:
    """Build overlay.json into `out_dir` and register it in that folder's meta.json.

    `out_dir` must already hold the terrain build's meta.json (FileNotFoundError
    otherwise) and it must describe the same grid as `bbox`/`cell` (ValueError
    otherwise). Local streets at least `promote_m` metres long in total are promoted to
    'secondary' (0 disables; see promote_long_streets). Nothing is written if any input is
    invalid. Re-running is idempotent. Returns the overlay dict.
    """
    out_dir = Path(out_dir)
    meta_path = out_dir / "meta.json"
    if not meta_path.exists():
        raise FileNotFoundError(
            f"{meta_path} not found: build the terrain assets into {out_dir} first "
            "(yelamu.cli), or pass --out pointing at the folder that holds meta.json"
        )
    meta = json.loads(meta_path.read_text())
    grid = Grid.from_lonlat_bbox(*bbox, cell=cell)
    _check_meta_matches_grid(meta, grid, meta_path)

    landmarks = _load_json_list(Path(landmarks_path), "landmarks")
    hotspots = _load_json_list(Path(hotspots_path), "hotspots")
    validate_landmarks(landmarks, bbox)
    validate_hotspots(hotspots, bbox)

    overlay = {
        "version": OVERLAY_VERSION,
        "streets": promote_long_streets(
            build_streets(read_tiger_roads(tiger_path), grid, tolerance_m=tolerance_m),
            promote_m,
        ),
        "landmarks": [_place(grid, i, ()) for i in sorted(landmarks, key=lambda i: i["id"])],
        "hotspots": [
            _place(grid, i, ("description", "sources", "confidence"))
            for i in sorted(hotspots, key=lambda i: i["id"])
        ],
    }
    for hotspot in overlay["hotspots"]:
        hotspot["sources"] = [
            {"title": s["title"].strip(), "url": s["url"].strip()} for s in hotspot["sources"]
        ]
    overlay["processing"] = {"tolerance_m": float(tolerance_m), "promote_m": float(promote_m)}

    (out_dir / OVERLAY_FILE).write_text(json.dumps(overlay, separators=(",", ":")))
    if meta.get("overlay_file") != OVERLAY_FILE:
        meta["overlay_file"] = OVERLAY_FILE
        meta_path.write_text(json.dumps(meta, indent=2))
    return overlay


# ----------------------------------------------------------------------------- CLI


def main(argv: Sequence[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="build_overlay",
        description="Build overlay.json (streets, landmarks, hotspots in viewer world "
                    "coordinates) next to a region's built terrain assets.",
    )
    p.add_argument("--region", type=Path, required=True, help="region JSON, e.g. regions/full-city.json")
    p.add_argument("--tiger", type=Path, help="TIGER/Line roads .shp (default: data/raw/tiger/extracted/tl_2024_06075_roads.shp)")
    p.add_argument("--landmarks", type=Path, help="landmarks JSON (default: data/overlay/landmarks.json)")
    p.add_argument("--hotspots", type=Path, help="hotspots JSON (default: data/overlay/hotspots.json)")
    p.add_argument("--out", type=Path, help="asset folder holding meta.json (default: the region's out)")
    p.add_argument("--tolerance", type=float, default=6.0, help="street simplification tolerance in metres (default 6)")
    p.add_argument("--promote-m", type=float, default=6000.0, help="promote local streets with at least this total length in metres to secondary (default 6000, 0 disables)")
    args = p.parse_args(argv)

    try:
        region = load_region(args.region)
        base = args.region.resolve().parent.parent  # the pipeline directory
        overlay = build_overlay(
            bbox=region.bbox,
            cell=region.cell_m,
            out_dir=args.out or region.out,
            tiger_path=args.tiger or base / "data/raw/tiger/extracted/tl_2024_06075_roads.shp",
            landmarks_path=args.landmarks or base / "data/overlay/landmarks.json",
            hotspots_path=args.hotspots or base / "data/overlay/hotspots.json",
            tolerance_m=args.tolerance,
            promote_m=args.promote_m,
        )
    except (FileNotFoundError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    streets = overlay["streets"]
    per_kind = {k: sum(1 for s in streets if s["kind"] == k) for k in STREET_KINDS}
    lines = sum(len(s["lines"]) for s in streets)
    points = sum(len(ln) // 2 for s in streets for ln in s["lines"])
    print(
        f"overlay: {len(streets)} streets ({per_kind}), {lines} polylines, {points} points; "
        f"{len(overlay['landmarks'])} landmarks, {len(overlay['hotspots'])} hotspots"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
