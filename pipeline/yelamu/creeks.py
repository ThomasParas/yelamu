"""Historical creeks: SFEI's hand-mapped creek lines and its modelled stream channels, in the
viewer's WORLD coordinates (see overlay.py: metres from the terrain centre, x east, z south).

Two public SFEI ArcGIS layers feed it (neither states a licence; see
docs/superpowers/specs/2026-11-18-creeks-design.md):

* "San Francisco Historical Creeks": 26 hand-mapped lines for the north and centre of the city,
  with names, a "well located" flag and cited sources.
* "MYHL_HistoricStreams": stream channels computed from a historical elevation model for the
  whole city. Only Strahler order 3 and up are kept, merged end to end into channels, and pieces
  within 100 m of a hand-mapped creek are left out (the hand-mapped line draws that creek).

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
from shapely.geometry import LineString, MultiLineString
from shapely.ops import unary_union
from shapely.prepared import prep

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
# Modelled channel pieces closer than this to a hand-mapped creek are not drawn, so each creek is
# drawn once, by the hand-mapped line (owner, 2026-11-18). 0 turns the rule off.
OVERLAP_BUFFER_M = 100.0

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


# ------------------------------------------------------------------- near hand-mapped lines


def remove_near(
    runs: Sequence[Sequence[XZ]],
    mapped_lines: Sequence[Sequence[XZ]],
    buffer_m: float,
) -> list[list[XZ]]:
    """The pieces of each run that lie outside the union of `mapped_lines` buffered by `buffer_m`.
    A run that crosses the buffer comes back as several pieces, in the run's order and direction;
    a run wholly outside comes back unchanged. Pieces with fewer than two points are dropped. With
    `buffer_m` of 0 or less, or no mapped lines, every run is returned as it is. The inputs are
    not modified."""
    plain = [[(float(x), float(z)) for x, z in r] for r in runs]
    lines = [m for m in mapped_lines if len(m) >= 2]
    if buffer_m <= 0 or not lines:
        return plain
    zone = unary_union([LineString(m) for m in lines]).buffer(buffer_m)
    fast = prep(zone)
    out: list[list[XZ]] = []
    for run in plain:
        if len(run) < 2:
            continue
        line = LineString(run)
        if not fast.intersects(line):
            out.append(run)
            continue
        rest = line.difference(zone)
        if rest.is_empty:
            continue
        parts = list(rest.geoms) if isinstance(rest, MultiLineString) else [rest]
        for part in parts:
            if isinstance(part, LineString) and len(part.coords) >= 2:
                out.append([(float(c[0]), float(c[1])) for c in part.coords])
    return out


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


# --------------------------------------------------------------------- document build

MAPPED_LAYER = "creeks"
MODELLED_LAYER = "modelled_streams"
# Proposed wording for the Sources panel; the owner approves it verbatim before it ships.
MAPPED_SOURCE_NOTE = (
    "Creek lines from SFEI's 'San Francisco Historical Creeks' layer (Hidden Nature SF), mapped from "
    "19th-century maps and a historical elevation model. Approximate."
)
MODELLED_SOURCE_NOTE = (
    "Stream channels computed by SFEI from a historical elevation model ('MYHL_HistoricStreams'), "
    "Strahler order 3 and up, left out within 100 m of a hand-mapped creek. Computed, not observed."
)


def _flat(points: Sequence[XZ]) -> list[float]:
    out: list[float] = []
    for x, z in points:
        out.append(round(float(x), 1) + 0.0)
        out.append(round(float(z), 1) + 0.0)
    return out


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


def read_modelled_lines(path: Path | str) -> list[dict]:
    """[{'order': int, 'line': [(lon, lat), ...]}] from the modelled-streams GeoJSON (field StrahlerID)."""
    out: list[dict] = []
    for i, feature in enumerate(read_geojson_lines(path)):
        order = feature["props"].get("StrahlerID")
        if not isinstance(order, (int, float)) or isinstance(order, bool) or int(order) != order:
            raise ValueError(f"{path}: feature {i}: StrahlerID must be a whole number, got {order!r}")
        for line in feature["lines"]:
            out.append({"order": int(order), "line": line})
    return out


def build_creeks_document(
    grid: Grid,
    mapped: Sequence[dict],
    modelled: Sequence[dict],
    bay: np.ndarray,
    *,
    min_order: int = MIN_MODELLED_ORDER,
    tolerance_m: float = SIMPLIFY_TOLERANCE_M,
    overlap_buffer_m: float = OVERLAP_BUFFER_M,
) -> tuple[dict, dict]:
    """(creeks.json document, statistics). `mapped` is read_geojson_lines output, `modelled` is
    read_modelled_lines output, `bay` the bay/ocean mask on the city grid. Modelled pieces within
    `overlap_buffer_m` of a hand-mapped line (as drawn, after trimming and simplifying) are left
    out; 0 keeps them."""
    rows, cols = bay.shape

    def runs_for(lonlat: Sequence[tuple[float, float]]) -> list[list[XZ]]:
        return [simplify_line(run, tolerance_m)
                for run in trim_to_land(project_line(grid, lonlat), bay, cols, rows, grid.cell)]

    mapped_out: list[dict] = []
    mapped_runs: list[list[XZ]] = []
    for feature in sorted(mapped, key=lambda f: int(f["props"].get("OBJECTID", 0))):
        props = feature["props"]
        oid = int(props.get("OBJECTID", 0))
        name = str(props.get("NAME1") or "").strip() or None
        sources = _clip(str(props.get("S_Interp1") or "").strip(), MAX_SOURCE_CHARS)
        k = 0
        for lonlat in feature["lines"]:
            for run in runs_for(lonlat):
                k += 1
                mapped_runs.append(run)
                mapped_out.append({
                    "id": f"creek-{oid}" if k == 1 else f"creek-{oid}-{k}",
                    "name": name,
                    "confidence": mapped_confidence(props),
                    "sources": sources,
                    "points": _flat(run),
                })

    kept = [m for m in modelled if m["order"] >= min_order]
    segments: list[tuple[int, list[XZ]]] = []
    for m in kept:
        for run in trim_to_land(project_line(grid, m["line"]), bay, cols, rows, grid.cell, min_length_m=0.0):
            segments.append((m["order"], run))
    length_before = sum(_length(run) for _, run in segments)
    segments = [
        (order, piece)
        for order, run in segments
        for piece in remove_near([run], mapped_runs, overlap_buffer_m)
    ]
    dropped_m = round(length_before - sum(_length(run) for _, run in segments), 1) + 0.0
    channels = chain_segments(segments)
    modelled_out: list[dict] = []
    for order, pts in channels:
        simple = simplify_line(pts, tolerance_m)
        if len(simple) >= 2 and _length(simple) >= MIN_RUN_LENGTH_M:
            modelled_out.append({"order": order, "points": _flat(simple)})

    doc = {
        "version": CREEKS_VERSION,
        "mapped": mapped_out,
        "modelled": modelled_out,
        "processing": {"tolerance_m": float(tolerance_m), "min_order": int(min_order),
                       "overlap_buffer_m": float(overlap_buffer_m)},
    }
    stats = {
        "mapped": len(mapped_out),
        "modelled": len(modelled_out),
        "modelled_segments": len(kept),
        "dropped_low_order": len(modelled) - len(kept),
        "dropped_near_mapped_m": max(dropped_m, 0.0),
    }
    return doc, stats


# ------------------------------------------------------------------------- validation

_ID_OK = re.compile(r"[a-z0-9][a-z0-9-]*")


def _check_points(points: Any, where: str, budget: list[int]) -> None:
    if not isinstance(points, list) or len(points) < 4 or len(points) % 2 != 0:
        raise ValueError(f"{where}: points must be a flat [x, z, ...] list with at least 2 points")
    budget[0] += len(points) // 2
    if budget[0] > MAX_CREEK_POINTS:
        raise ValueError(f"creeks hold more than {MAX_CREEK_POINTS} points in total")
    for k, v in enumerate(points):
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
            raise ValueError(f"{where}: value {k} is not a finite number")
        if abs(v) > MAX_COORD_M:
            raise ValueError(f"{where}: value {k} is out of range (within +-1e6 metres), got {v}")


def validate_creeks_document(doc: Any) -> None:
    """Raise ValueError for anything the viewer's parser (viewer/src/creeks/parse.ts) would reject."""
    if not isinstance(doc, dict) or doc.get("version") != CREEKS_VERSION:
        raise ValueError(f"creeks: unsupported version {None if not isinstance(doc, dict) else doc.get('version')!r}")
    mapped, modelled = doc.get("mapped"), doc.get("modelled")
    if not isinstance(mapped, list) or len(mapped) > MAX_MAPPED:
        raise ValueError(f"creeks: mapped must be a list of at most {MAX_MAPPED}")
    if not isinstance(modelled, list) or len(modelled) > MAX_MODELLED:
        raise ValueError(f"creeks: modelled must be a list of at most {MAX_MODELLED}")
    budget = [0]
    seen: set[str] = set()
    for i, c in enumerate(mapped):
        where = f"mapped[{i}]"
        cid = c.get("id")
        if not isinstance(cid, str) or not _ID_OK.fullmatch(cid):
            raise ValueError(f"{where}: id {cid!r} must match [a-z0-9][a-z0-9-]*")
        if cid in seen:
            raise ValueError(f"{where}: duplicate id {cid!r}")
        seen.add(cid)
        name = c.get("name")
        if name is not None and (not isinstance(name, str) or not name.strip() or len(name) > MAX_NAME_CHARS):
            raise ValueError(f"{where} ({cid}): name must be null or 1 to {MAX_NAME_CHARS} characters")
        if c.get("confidence") not in CONFIDENCE_LEVELS:
            raise ValueError(f"{where} ({cid}): confidence {c.get('confidence')!r} is not one of {CONFIDENCE_LEVELS}")
        sources = c.get("sources")
        if not isinstance(sources, str) or len(sources) > MAX_SOURCE_CHARS:
            raise ValueError(f"{where} ({cid}): sources must be text of at most {MAX_SOURCE_CHARS} characters")
        _check_points(c.get("points"), f"{where} ({cid})", budget)
    for i, m in enumerate(modelled):
        where = f"modelled[{i}]"
        order = m.get("order")
        if isinstance(order, bool) or not isinstance(order, int) or not MIN_ORDER <= order <= MAX_ORDER:
            raise ValueError(f"{where}: order must be a whole number from {MIN_ORDER} to {MAX_ORDER}")
        _check_points(m.get("points"), where, budget)


# --------------------------------------------------------------------------- meta patch


def patch_creeks_meta(meta: dict, doc: dict | None) -> dict:
    """The meta.json dict with the creek keys set; returns a NEW dict, `meta` is untouched.

    Sets `creeks_file`, `creeks_mapped`, `creeks_modelled` and one `hand_sources` row per layer
    that has lines (so the Sources panel lists it). With `doc` None, or no lines at all, every
    creek key and row is removed. Other keys and other layers' rows are kept, in order; a creek
    row that already exists is replaced in place, a new one is appended. A city
    rebuild rewrites meta.json, so build_creeks has to be run again afterwards."""
    out = {k: v for k, v in meta.items() if not k.startswith("creeks_")}
    mapped = (doc or {}).get("mapped", [])
    modelled = (doc or {}).get("modelled", [])
    if mapped or modelled:
        out["creeks_file"] = CREEKS_FILE
        out["creeks_mapped"] = len(mapped)
        out["creeks_modelled"] = len(modelled)
    wanted: dict[str, dict] = {}
    if mapped:
        wanted[MAPPED_LAYER] = {"layer": MAPPED_LAYER, "source": MAPPED_SOURCE_NOTE,
                                "confidence": lowest_confidence(c["confidence"] for c in mapped),
                                "count": len(mapped)}
    if modelled:
        wanted[MODELLED_LAYER] = {"layer": MODELLED_LAYER, "source": MODELLED_SOURCE_NOTE,
                                  "confidence": "illustrative", "count": len(modelled)}
    # A row for a creek layer is replaced where it stands (a rerun leaves the order alone, so a
    # rebuilt meta.json does not churn); a layer with no row yet is appended after the others;
    # a layer with no lines loses its row. Rows of other layers are untouched.
    rows: list[dict] = []
    placed: set[str] = set()
    for r in meta.get("hand_sources", []):
        layer = r.get("layer")
        if layer not in (MAPPED_LAYER, MODELLED_LAYER):
            rows.append(r)
        elif layer in wanted and layer not in placed:
            rows.append(wanted[layer])
            placed.add(layer)
    rows.extend(row for layer, row in wanted.items() if layer not in placed)
    if rows:
        out["hand_sources"] = rows
    else:
        out.pop("hand_sources", None)
    return out


# ------------------------------------------------------------------------------ build


def build_creeks(
    assets: Path | str,
    mapped_path: Path | str | None,
    modelled_path: Path | str | None,
    *,
    remove: bool = False,
    min_order: int = MIN_MODELLED_ORDER,
    tolerance_m: float = SIMPLIFY_TOLERANCE_M,
    overlap_buffer_m: float = OVERLAP_BUFFER_M,
) -> dict | None:
    """Write creeks.json into `assets` (the folder with the city's meta.json and habitat raster)
    and patch meta.json. `remove=True` deletes creeks.json and every creek key instead. Nothing is
    written if an input is invalid. Re-running is idempotent. Returns the document (None on remove)."""
    assets = Path(assets)
    meta_path = assets / "meta.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"{meta_path} not found: build the terrain assets into {assets} first")
    meta = json.loads(meta_path.read_text())

    if remove:
        patched = patch_creeks_meta(meta, None)
        (assets / CREEKS_FILE).unlink(missing_ok=True)
        if patched != meta:
            meta_path.write_text(json.dumps(patched, indent=2))
        return None

    grid = Grid(meta["west"], meta["south"], meta["east"], meta["north"], float(meta["cell_m"]))
    if (grid.width, grid.height) != (meta["width"], meta["height"]):
        raise ValueError(f"{meta_path}: width and height do not match the grid built from its bounds")
    habitat = np.frombuffer((assets / meta["habitat_file"]).read_bytes(), dtype=np.uint8)
    if habitat.size != grid.width * grid.height:
        raise ValueError(f"{assets / meta['habitat_file']}: size does not match the {grid.width} x {grid.height} grid")
    bay = bay_mask(habitat.reshape(grid.height, grid.width), meta.get("habitat_classes", []))

    mapped = read_geojson_lines(mapped_path) if mapped_path is not None else []
    modelled = read_modelled_lines(modelled_path) if modelled_path is not None else []
    doc, _ = build_creeks_document(grid, mapped, modelled, bay, min_order=min_order,
                                   tolerance_m=tolerance_m, overlap_buffer_m=overlap_buffer_m)
    validate_creeks_document(doc)

    (assets / CREEKS_FILE).write_text(json.dumps(doc, separators=(",", ":")))
    patched = patch_creeks_meta(meta, doc)
    if patched != meta:
        meta_path.write_text(json.dumps(patched, indent=2))
    return doc


# --------------------------------------------------------------------------------- CLI


def main(argv: Sequence[str] | None = None) -> int:
    import argparse
    import sys

    p = argparse.ArgumentParser(
        prog="build_creeks",
        description="Build creeks.json (hand-mapped creeks and modelled streams in viewer world "
                    "coordinates) next to a city's built terrain assets.",
    )
    p.add_argument("assets", type=Path, help="viewer asset folder holding meta.json and habitat.u8")
    p.add_argument("--mapped", type=Path, help="hand-mapped creeks GeoJSON (default: data/raw/sfei-creeks/san_francisco_historical_creeks.geojson)")
    p.add_argument("--modelled", type=Path, help="modelled streams GeoJSON (default: data/raw/sfei-creeks/myhl_historic_streams_order3.geojson; skipped if absent)")
    p.add_argument("--min-order", type=int, default=MIN_MODELLED_ORDER, help="lowest Strahler order drawn (default 3)")
    p.add_argument("--tolerance", type=float, default=SIMPLIFY_TOLERANCE_M, help="line simplification in metres (default 3)")
    p.add_argument("--overlap-buffer", type=float, default=OVERLAP_BUFFER_M, help="modelled pieces within this many metres of a hand-mapped creek are left out (default 100, 0 keeps them)")
    p.add_argument("--remove", action="store_true", help="delete creeks.json and every creek key in meta.json")
    args = p.parse_args(argv)

    base = Path(__file__).resolve().parent.parent  # the pipeline directory
    raw = base / "data" / "raw" / "sfei-creeks"
    mapped = args.mapped or raw / "san_francisco_historical_creeks.geojson"
    modelled = args.modelled or raw / "myhl_historic_streams_order3.geojson"
    try:
        if args.remove:
            build_creeks(args.assets, None, None, remove=True)
            print("creeks: removed")
            return 0
        if args.mapped is not None and not args.mapped.exists():
            raise FileNotFoundError(f"mapped creeks file not found: {args.mapped}")
        if args.modelled is not None and not args.modelled.exists():
            raise FileNotFoundError(f"modelled streams file not found: {args.modelled}")
        doc = build_creeks(
            args.assets,
            mapped if mapped.exists() else None,
            modelled if modelled.exists() else None,
            min_order=args.min_order,
            tolerance_m=args.tolerance,
            overlap_buffer_m=args.overlap_buffer,
        )
    except (FileNotFoundError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    assert doc is not None
    points = sum(len(c["points"]) // 2 for c in doc["mapped"]) + sum(len(c["points"]) // 2 for c in doc["modelled"])
    print(f"creeks: {len(doc['mapped'])} hand-mapped, {len(doc['modelled'])} modelled channels, {points} points")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
