"""Historical creeks: SFEI's hand-mapped creek lines and its modelled stream channels, in the
viewer's WORLD coordinates (see overlay.py: metres from the terrain centre, x east, z south).

Two public SFEI ArcGIS layers feed it (neither states a licence; see
docs/superpowers/specs/2026-11-18-creeks-design.md):

* "San Francisco Historical Creeks": 26 hand-mapped lines for the north and centre of the city,
  with names, a "well located" flag and cited sources.
* "MYHL_HistoricStreams": stream channels computed from a historical elevation model for the
  south. Only Strahler order 3 and up are kept, merged end to end into channels.

The result is written as `creeks.json` next to `heightmap.u16`, and `meta.json` gains
`creeks_file`, `creeks_mapped`, `creeks_modelled` and two `hand_sources` rows. A city rebuild
rewrites meta.json, so run build_creeks.py again afterwards.

    uv run python scripts/build_creeks.py ../viewer/public/assets/real-city
"""

from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Sequence

import numpy as np
from shapely.geometry import LineString

from yelamu.export import CONFIDENCE_LEVELS
from yelamu.geo import Grid
from yelamu.overlay import lonlat_to_world
from yelamu.provenance import lowest_confidence

CREEKS_VERSION = 1
CREEKS_FILE = "creeks.json"

# Limits of the viewer's creeks parser. The viewer rejects the WHOLE file when one is exceeded,
# so the validator below must be at least as strict.
# keep in sync with viewer/src/creeks/parse.ts
MAX_MAPPED = 500
MAX_MODELLED = 20_000
MAX_CREEK_POINTS = 400_000
MAX_NAME_CHARS = 120
MAX_SOURCE_CHARS = 300
MAX_COORD_M = 1e6
MIN_ORDER, MAX_ORDER = 1, 8

MIN_MODELLED_ORDER = 3
SIMPLIFY_TOLERANCE_M = 3.0
# A dry run shorter than this after trimming at the bay is not worth drawing.
MIN_RUN_LENGTH_M = 30.0
# Segments of the modelled network are joined when their end points agree to this many metres.
JOIN_KEY_M = 0.1

# Habitat classes (meta.habitat_classes names) where a creek line must stop: open bay and ocean.
# Ponds, lagoons, marsh and tidal flat are NOT here: creeks run into those.
BAY_CLASS_NAMES = frozenset({
    "Open bay (inferred from modern elevation)",
    "Bay (hand-drawn)",
    "Deep ocean/bay",
    "Shallow ocean/bay",
})

XZ = tuple[float, float]


# ----------------------------------------------------------------------------- reading


def read_geojson_lines(path: Path | str) -> list[dict]:
    """[{'props': {...}, 'lines': [[(lon, lat), ...], ...]}] for a GeoJSON file of lines."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"creek file not found: {path}")
    try:
        doc = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: not valid JSON ({exc})") from exc
    if not isinstance(doc, dict) or doc.get("type") != "FeatureCollection":
        raise ValueError(f"{path}: expected a GeoJSON FeatureCollection")
    out: list[dict] = []
    for i, feature in enumerate(doc.get("features") or []):
        geometry = (feature or {}).get("geometry") or {}
        kind = geometry.get("type")
        if kind == "LineString":
            lines = [geometry["coordinates"]]
        elif kind == "MultiLineString":
            lines = geometry["coordinates"]
        else:
            raise ValueError(f"{path}: feature {i}: expected a line geometry, got {kind!r}")
        out.append({
            "props": feature.get("properties") or {},
            "lines": [[(float(c[0]), float(c[1])) for c in line] for line in lines],
        })
    return out


def project_line(grid: Grid, lonlat: Sequence[tuple[float, float]]) -> list[XZ]:
    """Longitude and latitude to viewer world metres."""
    return [lonlat_to_world(grid, lon, lat) for lon, lat in lonlat]


def mapped_confidence(props: dict) -> str:
    """SFEI's own flag: 'well located' lines are documented, every other hand-mapped line is inferred."""
    flag = str(props.get("stream_typ") or "").strip().lower()
    return "documented" if flag == "well located" else "inferred"


# ------------------------------------------------------------------ trimming, simplifying


def bay_mask(habitat: np.ndarray, classes: Sequence[dict]) -> np.ndarray:
    """Boolean (rows, cols) mask of the open bay and ocean cells of a habitat raster."""
    ids = [int(c["id"]) for c in classes if c.get("name") in BAY_CLASS_NAMES]
    return np.isin(habitat, ids)


def _length(points: Sequence[XZ]) -> float:
    return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(points, points[1:]))


def trim_to_land(
    points: Sequence[XZ],
    bay: np.ndarray,
    grid_w: int,
    grid_h: int,
    cell: float,
    *,
    min_length_m: float = MIN_RUN_LENGTH_M,
) -> list[list[XZ]]:
    """The dry runs of a polyline: pieces whose points are not in the bay mask (a point outside the
    grid counts as wet). Pieces with fewer than two points or shorter than `min_length_m` are dropped.
    The grid cell of world (x, z) is col = x / cell + (w - 1) / 2, row = z / cell + (h - 1) / 2, the
    same frame as overlay.py and the viewer's terrain mesh."""
    runs: list[list[XZ]] = []
    current: list[XZ] = []
    for x, z in points:
        col = math.floor(x / cell + (grid_w - 1) / 2 + 0.5)
        row = math.floor(z / cell + (grid_h - 1) / 2 + 0.5)
        wet = not (0 <= col < grid_w and 0 <= row < grid_h) or bool(bay[row, col])
        if wet:
            if current:
                runs.append(current)
                current = []
        else:
            current.append((x, z))
    if current:
        runs.append(current)
    return [r for r in runs if len(r) >= 2 and _length(r) >= min_length_m]


def simplify_line(points: Sequence[XZ], tolerance_m: float) -> list[XZ]:
    """Douglas-Peucker; the end points are always kept."""
    if len(points) < 3:
        return [(float(x), float(z)) for x, z in points]
    simple = LineString(points).simplify(tolerance_m, preserve_topology=False)
    return [(float(x), float(z)) for x, z in simple.coords]


# ----------------------------------------------------------------------------- chaining


def _key(p: XZ) -> tuple[int, int]:
    return (round(p[0] / JOIN_KEY_M), round(p[1] / JOIN_KEY_M))


def chain_segments(segments: Sequence[tuple[int, Sequence[XZ]]]) -> list[tuple[int, list[XZ]]]:
    """Merge segments into channels. Two segments are joined where exactly two segment ends meet
    at a point and both have the same Strahler order. A confluence (three or more ends) or a
    change of order keeps the segments separate. The input is not modified. The result is sorted
    by (order, first point), so it does not depend on the input order."""
    segs: dict[int, tuple[int, list[XZ]]] = {
        i: (order, [(float(x), float(z)) for x, z in pts]) for i, (order, pts) in enumerate(segments)
    }
    while True:
        ends: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
        for i, (_, pts) in segs.items():
            ends[_key(pts[0])].append((i, 0))
            ends[_key(pts[-1])].append((i, 1))
        touched: set[int] = set()
        merged = False
        for node in sorted(ends):
            items = ends[node]
            if len(items) != 2:
                continue
            (a, end_a), (b, end_b) = items
            if a == b or a in touched or b in touched or segs[a][0] != segs[b][0]:
                continue
            pa = list(segs[a][1])
            pb = list(segs[b][1])
            if end_a == 0:
                pa.reverse()  # make `a` finish at the node
            if end_b == 1:
                pb.reverse()  # make `b` start at the node
            segs[a] = (segs[a][0], pa + pb[1:])
            del segs[b]
            touched.update((a, b))
            merged = True
        if not merged:
            break
    return sorted(segs.values(), key=lambda s: (s[0], s[1][0], s[1][-1]))
