"""Import NOAA Shoreline Data Rescue vectors (1850s T-sheets) as seeded water and marsh areas.

NOAA's project zips hold polylines only (`historicl1`) and a project boundary (`projbnd`),
NAD83 lon/lat. This module turns them into closed candidate areas and, with seed points the
owner confirms, into hand-water GeoJSON features with provenance:

1. `read_project` reads one unpacked project folder (lines and boundary, in UTM metres).
2. `close_linework` closes the selected lines into areas (see its docstring). Lines that
   still bound no area are reported, never guessed.
3. `load_seed_file` / `classify` give an area the class (bay, marsh, land) of the seed points
   inside it. Areas without a seed are reported and left out.
4. `areas_to_features` / `feature_collection_text` write the bay and marsh areas as GeoJSON in
   lon/lat with `source`, `confidence`, `area_id`, `area_m2` and `seed` properties.

Areas are closed per project: a seed classes the area of ITS project only, so overlapping
projects never merge into one area. Their output polygons may overlap (the build unions
the hand files); `cross_project_overlaps` reports by how much.
"""

from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Sequence

import numpy as np
import shapefile
import shapely
from pyproj import Transformer
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, mapping
from shapely.geometry.base import BaseGeometry
from shapely.geometry.polygon import orient
from shapely.ops import nearest_points

from yelamu.export import CONFIDENCE_LEVELS
from yelamu.geo import UTM_CRS
from yelamu.provenance import MAX_SOURCE_CHARS, lowest_confidence

# NOAA's coordinates are NAD83 geographic. As in yelamu.overlay (TIGER/Line): "NAD83 and WGS84
# differ by about a metre in this area", far below the 10 m grid and the accuracy of an 1850s
# survey (NOAA: HOR_ACC 0, not determined), so EPSG:4326 is used.
_LONLAT_TO_UTM = Transformer.from_crs("EPSG:4326", UTM_CRS, always_xy=True)
_UTM_TO_LONLAT = Transformer.from_crs(UTM_CRS, "EPSG:4326", always_xy=True)

# NOAA FEATURE codes in historicl1 (their ATTRIBUTE text in the comment).
MEAN_HIGH_WATER = 20  # Natural.Mean High Water
MARSH_EDGE = 15  # Natural.Apparent.Marsh Or Swamp
MAN_MADE = 1  # Man-made
WHARF = 12  # Man-made.Wharf Or Quay
ALONGSHORE = 57  # Undetermined Alongshore Feature
ALONGSHORE_BOUNDARY = 28  # Shoreline/Alongshore Feature Boundary
APPROXIMATE = 26  # Undetermined.Approximate
USER_ADDED = 205  # User Added Line (closures drawn by NOAA's digitisers)

FEATURE_NAMES = {
    MEAN_HIGH_WATER: "mean high water line",
    MARSH_EDGE: "marsh edge line",
    MAN_MADE: "man-made shoreline",
    WHARF: "wharf line",
    ALONGSHORE: "alongshore feature line",
    ALONGSHORE_BOUNDARY: "shoreline/alongshore boundary",
    APPROXIMATE: "approximate shoreline",
    USER_ADDED: "digitiser closure line",
}

# Which lines close areas by default: ALL eight classes. Line classes only decide where areas
# are split; the owner's seeds decide what an area is, and land is never written. Measured on
# the four SF projects (snap 8 m, default reaches), the spec's first choice (mean high water,
# marsh edge, user-added, alongshore boundary; man-made, wharf, undetermined alongshore and
# approximate excluded) leaves free ends 28 / 2 / 28 / 10 -> 11 / 0 / 6 / 6 and 80.8 / 0 /
# 13.7 / 58.7 km of linework bounding nothing in CA37A02 / CA37B02B / CA37B07 / CA37B08:
# - Undetermined.Approximate (26) pieces sit IN the shore chain (both ends on mean high water
#   in A02 and B02B): the stretches the surveyor drew as approximate. Without them the
#   1852 shore has gaps and the bay leaks into the land.
# - By 1853 and 1857 the Yerba Buena Cove shore WAS the man-made bulkhead and wharf front
#   (1, 12, 57). Without them B07 and B08 do not separate bay from land at all (one face
#   holds both). With them every project closes (0 / 0.2 / 0 / 0 km unclosed). The wharves
#   only add pier-shaped faces and slivers (dropped) on the water side; the bay face then
#   ends at the 1853/1857 waterfront, which is water already in the SFEI-based build.
DEFAULT_LINE_CLASSES: frozenset[int] = frozenset(FEATURE_NAMES)

# End-to-line gap closing distance and minimum sliver width. Measured on the four SF projects
# with the committed seeds (defaults otherwise): snap 0, 2, 5 and 8 m all give 71 areas and
# the same 21,058 ha bay / 129 ha marsh; unclosed linework 0.51 / 0.51 / 0.43 / 0.42 km. At
# 12 m the open north end of CA37B07's shore snaps 11 m sideways onto a neighbouring line
# instead of reaching the frame, B07 land and water become one face and 18.9 km of shore
# bounds nothing (20 m: the same). 8 m is below one 10 m grid cell.
DEFAULT_SNAP_M = 8.0
# Faces smaller than this (0.2 ha, 20 cells of the 10 m grid) are slivers or creek-bank loops.
DEFAULT_MIN_AREA_M2 = 2000.0
# A shore that stops short of the project boundary is closed straight to it when the gap is at
# most this long and the closing line crosses nothing. NOAA's own closure lines (User Added
# Line) aim at the sheet edge, so their ends may reach further (A02's closure south of
# Candlestick stops 2.35 km short, B08's off Hunters Point 1.9 km).
DEFAULT_FRAME_REACH_M = 600.0
DEFAULT_CLOSURE_REACH_M = 2500.0
# Two free line ends at most this far apart are joined by a straight line when it crosses
# nothing: two sheets' shores that do not quite meet (74 m at Point Lobos in A02), the two
# banks of a creek where the survey stopped (35 m at the head of Mission Creek in B08).
DEFAULT_JOIN_ENDS_M = 100.0

SEED_CLASSES = ("bay", "marsh", "land")
EXPORTED_CLASSES = ("bay", "marsh")
MAX_CONFIDENCE = "inferred"  # 1850s survey positions are never better than inferred
SEED_TOLERANCE_M = 0.01  # a seed this close to an area counts as inside it
COORD_DECIMALS = 7
OUTPUT_SIMPLIFY_M = 0.5  # vertex thinning of written polygons, far below one grid cell
MAX_SEED_ID_CHARS = 64
SOURCE_PREFIX = "NOAA Shoreline Data Rescue Project"
SHORT_SOURCE_PREFIX = "NOAA SDRP"

_OVERSHOOT_M = 0.01  # connectors cross their target slightly, so noding splits it there
_STUB_M = 0.1  # overshoot stubs are shorter than this: ignored as ends, never reported
_SEED_ID_RE = re.compile(r"[a-z0-9][a-z0-9-]*")
_PROJECT_RE = re.compile(r"[A-Z][A-Z0-9]{1,15}")
_SHEET_RE = re.compile(r"([A-Z])-?(\d{5})")
_ID_RE = re.compile(r"(.+)-(\d+)")
_FILE_KEYS = frozenset({"seeds", "closures", "note"})
_SEED_KEYS = frozenset({"id", "project", "lon", "lat", "class", "source", "confidence", "note"})
_SEED_REQUIRED = ("id", "project", "lon", "lat", "class", "source", "confidence")
_CLOSURE_KEYS = frozenset({"id", "project", "coordinates", "source", "note"})
_CLOSURE_REQUIRED = ("id", "project", "coordinates", "source")


# --------------------------------------------------------------------------- reading


@dataclass(frozen=True)
class Line:
    """One NOAA polyline (one part of a shapefile record), in UTM metres."""

    geometry: LineString
    attribute: str
    feature: int
    sheet: str  # normalised, e.g. 'T-00352'
    year: int
    project: str


@dataclass(frozen=True)
class Project:
    name: str
    boundary: Polygon  # UTM metres
    lines: tuple[Line, ...]


def normalise_sheet(source_id: str) -> str:
    """'T00352' -> 'T-00352'; parts of split sheets lose their suffix ('T00460_1' -> 'T-00460')."""
    m = _SHEET_RE.match(str(source_id).strip().upper())
    if not m:
        raise ValueError(f"unrecognised NOAA SOURCE_ID {source_id!r} (expected e.g. 'T00352')")
    return f"{m.group(1)}-{m.group(2)}"


def survey_year(src_date: str) -> int:
    """'18520101' -> 1852."""
    text = str(src_date).strip()
    if not re.fullmatch(r"\d{4}(\d{2}(\d{2})?)?", text):
        raise ValueError(f"unrecognised NOAA SRC_DATE {src_date!r} (expected YYYYMMDD)")
    return int(text[:4])


def _transform(geom: BaseGeometry, transformer: Transformer) -> BaseGeometry:
    def project(coords: np.ndarray) -> np.ndarray:
        x, y = transformer.transform(coords[:, 0], coords[:, 1])
        return np.column_stack([x, y])

    return shapely.transform(geom, project)


def lonlat_geom_to_utm(geom: BaseGeometry) -> BaseGeometry:
    return _transform(geom, _LONLAT_TO_UTM)


def utm_geom_to_lonlat(geom: BaseGeometry) -> BaseGeometry:
    return _transform(geom, _UTM_TO_LONLAT)


def _shape_parts(shape) -> list[list[tuple[float, float]]]:
    bounds = [*shape.parts, len(shape.points)]
    return [[tuple(p) for p in shape.points[a:b]] for a, b in zip(bounds, bounds[1:])]


def read_project(directory: Path) -> Project:
    """Read `<dir>/historicl1` (lines) and `<dir>/projbnd` (boundary) of one NOAA project.

    The project name is the boundary's NAME field (the folder name when it is blank). The
    boundary is densified (0.001 degree) before projecting, so its edges follow the lon/lat
    rectangle. Multi-part line records become one Line per part. Raises ValueError for missing
    files or unreadable attributes.
    """
    directory = Path(directory)
    for stem in ("historicl1", "projbnd"):
        if not (directory / f"{stem}.shp").exists():
            raise ValueError(f"{directory}: {stem}.shp not found (unpack the NOAA project zip)")
    with shapefile.Reader(str(directory / "projbnd")) as reader:
        rings = [ring for s in reader.shapes() for ring in _shape_parts(s) if len(ring) >= 4]
        names = [str(r.as_dict().get("NAME") or "").strip() for r in reader.records()]
    if not rings:
        raise ValueError(f"{directory}: projbnd has no polygon")
    name = names[0] if names and names[0] else directory.name
    if not _PROJECT_RE.fullmatch(name):
        raise ValueError(f"{directory}: project name {name!r} is not like 'CA37B08'")
    lonlat = shapely.unary_union([Polygon(r).buffer(0) for r in rings])
    if lonlat.geom_type != "Polygon":
        lonlat = lonlat.convex_hull  # several parts: their hull is the frame
    boundary = lonlat_geom_to_utm(shapely.segmentize(lonlat, 0.001))

    lines: list[Line] = []
    with shapefile.Reader(str(directory / "historicl1")) as reader:
        for index, (shape, record) in enumerate(zip(reader.shapes(), reader.records())):
            rec = record.as_dict()
            try:
                feature = int(rec["FEATURE"])
                sheet = normalise_sheet(rec["SOURCE_ID"])
                year = survey_year(rec["SRC_DATE"])
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError(f"{directory}/historicl1: record {index}: {exc}") from exc
            for part in _shape_parts(shape):
                if len(part) < 2:
                    continue
                geom = lonlat_geom_to_utm(LineString(part))
                if geom.length > 0:
                    lines.append(Line(geom, str(rec.get("ATTRIBUTE") or "").strip(), feature,
                                      sheet, year, name))
    return Project(name, boundary, tuple(lines))


def select_lines(lines: Iterable[Line], classes: Iterable[int] = DEFAULT_LINE_CLASSES
                 ) -> list[Line]:
    """The lines whose FEATURE code is in `classes`."""
    wanted = frozenset(classes)
    return [line for line in lines if line.feature in wanted]


# --------------------------------------------------------------------------- closing


@dataclass(frozen=True)
class Area:
    """A closed candidate area (UTM polygon) of one project."""

    id: str  # '<PROJECT>-<ordinal>', ordinals by ascending centroid x then y
    project: str
    geometry: Polygon
    area_m2: float
    sheet: str  # the sheet contributing most boundary length
    year: int
    line_kind: str  # FEATURE_NAMES of the class contributing most boundary length


@dataclass(frozen=True)
class Closure:
    """Result of close_linework: the areas plus what did not close."""

    areas: list[Area]
    unclosed: list[LineString] = field(default_factory=list)  # linework bounding no area
    connectors: list[LineString] = field(default_factory=list)  # closing lines added
    free_ends_before: int = 0  # free line ends of the noded lines, before any closing
    free_ends_after: int = 0  # free line ends left in the final linework
    dropped_slivers: int = 0  # faces below min_area_m2 or narrower than snap_m

    @property
    def unclosed_m(self) -> float:
        return float(sum(g.length for g in self.unclosed))


def _line_key(line: Line) -> tuple:
    return (line.sheet, line.feature, shapely.normalize(line.geometry).wkb)


def _linear_parts(geom: BaseGeometry | None) -> list[LineString]:
    if geom is None or geom.is_empty:
        return []
    if geom.geom_type == "LineString":
        return [geom]
    if geom.geom_type == "LinearRing":
        return [LineString(geom.coords)]
    return [p for g in getattr(geom, "geoms", []) for p in _linear_parts(g)]


def _polygons(geom: BaseGeometry | None) -> list[Polygon]:
    if geom is None or geom.is_empty:
        return []
    if geom.geom_type == "Polygon":
        return [geom]
    return [p for g in getattr(geom, "geoms", []) for p in _polygons(g)]


def _node(geoms: Sequence[BaseGeometry]) -> list[LineString]:
    """The edges of the noded linework (intersections become vertices, duplicates merge)."""
    return _linear_parts(shapely.union_all(list(geoms))) if geoms else []


def _free_ends(edges: Sequence[LineString]) -> list[tuple[tuple[float, float], int]]:
    """(point, edge index) of every edge end no other edge end shares (degree 1), sorted.

    The far ends of connector overshoot stubs (edges shorter than _STUB_M) are not reported;
    the stubs still count towards the degree of the point they hang from.
    """
    count: dict[tuple[float, float], int] = defaultdict(int)
    owner: dict[tuple[float, float], int] = {}
    for i, edge in enumerate(edges):
        if edge.is_ring:
            continue
        for end in (edge.coords[0], edge.coords[-1]):
            count[end] += 1
            owner[end] = i
    return sorted((p, owner[p]) for p, n in count.items()
                  if n == 1 and edges[owner[p]].length >= _STUB_M)


def _connector(p: Point, q: Point, edge: LineString) -> LineString:
    """Segment p -> q extended by _OVERSHOOT_M beyond q. A nearest point is not exactly on its
    line in floating point; crossing the line makes noding split it there.

    When q is closer than _OVERSHOOT_M (an end drawn onto a line or the frame that stops a
    hair short of it) the direction p -> q is numerical noise, so the end's own `edge` is
    continued straight on by 2 x _OVERSHOOT_M instead.
    """
    dx, dy = q.x - p.x, q.y - p.y
    d = math.hypot(dx, dy)
    if d >= _OVERSHOOT_M:
        k = 1.0 + _OVERSHOOT_M / d
        return LineString([p, (p.x + k * dx, p.y + k * dy)])
    coords = edge.coords
    prev = coords[1] if Point(coords[0]).equals(p) else coords[-2]
    ex, ey = p.x - prev[0], p.y - prev[1]
    k = 2 * _OVERSHOOT_M / math.hypot(ex, ey)
    return LineString([p, (p.x + k * ex, p.y + k * ey)])


def _crosses_only_at(seg: LineString, edges: list[LineString], tree: shapely.STRtree,
                     allowed: set[int], ends: Sequence[Point]) -> bool:
    """True when seg touches the edges only at `ends`, and only edges in `allowed`."""
    for j in (int(j) for j in tree.query(seg, predicate="intersects")):
        if j not in allowed:
            return False
        meet = edges[j].intersection(seg)
        parts = getattr(meet, "geoms", [meet])
        if not all(any(part.distance(e) < 2 * _OVERSHOOT_M for e in ends) for part in parts):
            return False
    return True


def _end_joins(edges: list[LineString], join_m: float) -> list[LineString]:
    """Join pairs of free ends at most join_m apart (nearest pairs first, each end once) by a
    straight line that crosses nothing."""
    ends = _free_ends(edges)
    points = [Point(p) for p, _ in ends]
    pairs = sorted(
        (points[a].distance(points[b]), a, b)
        for a in range(len(ends)) for b in range(a + 1, len(ends))
        if 0 < points[a].distance(points[b]) <= join_m)
    if not pairs:
        return []
    tree = shapely.STRtree(edges)
    used: set[int] = set()
    out = []
    for _, a, b in pairs:
        if a in used or b in used:
            continue
        seg = LineString([points[a], points[b]])
        if _crosses_only_at(seg, edges, tree, {ends[a][1], ends[b][1]}, [points[a], points[b]]):
            out.append(seg)
            used |= {a, b}
    return out


def _gap_connectors(edges: list[LineString], snap_m: float) -> list[LineString]:
    """From each free end, a straight connector to the nearest OTHER edge within snap_m.

    An end whose only nearby linework is its own edge (a hook) is left alone.
    """
    tree = shapely.STRtree(edges)
    out = []
    for (x, y), own in _free_ends(edges):
        p = Point(x, y)
        best = None
        for j in sorted(int(j) for j in tree.query(p, predicate="dwithin", distance=snap_m)):
            d = edges[j].distance(p)
            if j != own and d > 0 and (best is None or d < best[0]):
                best = (d, j)
        if best is not None:
            out.append(_connector(p, nearest_points(p, edges[best[1]])[1], edges[own]))
    return out


def _frame_connectors(edges: list[LineString], frame: LineString, reach_m: float,
                      long_ends: frozenset[tuple[float, float]], long_reach_m: float
                      ) -> list[LineString]:
    """From each free end within reach_m of the frame (long_reach_m for the points in
    long_ends), a straight line to the nearest frame point, kept when it crosses nothing."""
    tree = shapely.STRtree(edges)
    inside = Polygon(frame.coords)
    out = []
    for (x, y), own in _free_ends(edges):
        p = Point(x, y)
        if not inside.contains(p):  # a line clipped just outside the frame: crosses it already
            continue
        d = frame.distance(p)
        reach = max(reach_m, long_reach_m) if (x, y) in long_ends else reach_m
        if d == 0 or d > reach:
            continue
        seg = _connector(p, nearest_points(p, frame)[1], edges[own])
        if seg.intersects(frame) and _crosses_only_at(seg, edges, tree, {own}, [p]):
            out.append(seg)
    return out


def close_linework(
    lines: Sequence[Line],
    boundary: Polygon,
    snap_m: float = DEFAULT_SNAP_M,
    min_area_m2: float = DEFAULT_MIN_AREA_M2,
    *,
    project: str | None = None,
    frame_reach_m: float = DEFAULT_FRAME_REACH_M,
    closure_reach_m: float = DEFAULT_CLOSURE_REACH_M,
    join_ends_m: float = DEFAULT_JOIN_ENDS_M,
    extra_lines: Sequence[LineString] = (),
) -> Closure:
    """Close `lines` (already selected, UTM) inside `boundary` into areas. Deterministic.

    1. Clip the lines to the boundary and node them (intersections become vertices, exact
       duplicates merge).
    2. End joins: two free line ends at most `join_ends_m` apart are joined by a straight
       line that crosses nothing (nearest pairs first).
    3. Gap closing: every remaining free end gets a straight connector to the nearest other
       line within `snap_m` (digitising gaps; a sheet's line stopping short of the next).
    4. Frame closing: a free end within `frame_reach_m` of the boundary gets a straight line
       to the nearest boundary point when it crosses nothing (a shore drawn to just short of
       the sheet edge); the free end of a NOAA closure line (USER_ADDED) may be up to
       `closure_reach_m` away.
    5. The boundary ring is added as a frame and the linework is polygonised.
    6. Faces below `min_area_m2`, or with a mean width (2 x area / perimeter) under `snap_m`,
       are slivers and are dropped: the strip between the doubled lines of two overlapping
       sheets, a creek narrower than the snap. Their neighbours keep their own faces, so a
       sliver leaves a gap a few metres wide.

    `extra_lines` (UTM) are closure lines drawn by the owner (see load_seed_file): noded with
    the NOAA lines, never counted for an area's sheet. Any distance of 0 disables its step;
    snap_m 0 also disables the width filter (so doubled lines then leave their slivers).

    Open lines that bound no area (a creek drawn as a single line, a shore that stops short of
    everything) are returned in Closure.unclosed. Ids are '<project>-<n>' with n counted by
    ascending centroid x, then y; the result does not depend on the order of `lines`.
    """
    if min(snap_m, min_area_m2, frame_reach_m, closure_reach_m, join_ends_m) < 0:
        raise ValueError("snap_m, min_area_m2 and the reach / join distances must be 0 or more")
    name = project or (lines[0].project if lines else "AREA")
    frame = LineString(boundary.exterior.coords)
    # Clip slightly outside the frame: a line leaving the project then crosses the frame, and
    # noding splits both there (an end computed exactly ON the frame would not be noded).
    clip_zone = boundary.buffer(5 * _OVERSHOOT_M)
    clipped: list[tuple[Line, LineString]] = [
        (line, part) for line in sorted(lines, key=_line_key)
        for part in _linear_parts(line.geometry.intersection(clip_zone)) if part.length > 0
    ]
    owner_parts = [p for g in extra_lines for p in _linear_parts(g.intersection(clip_zone))]
    edges = _node([g for _, g in clipped] + owner_parts)
    def inside_ends(es: Sequence[LineString]) -> int:  # ends past the frame are harmless
        return sum(boundary.contains(Point(pt)) for pt, _ in _free_ends(es))

    ends_before = inside_ends(edges)

    connectors: list[LineString] = []
    if join_ends_m > 0 and edges:
        joins = _end_joins(edges, join_ends_m)
        connectors += joins
        edges = _node([*edges, *joins]) if joins else edges
    if snap_m > 0 and edges:
        gaps = _gap_connectors(edges, snap_m)
        connectors += gaps
        edges = _node([*edges, *gaps]) if gaps else edges
    if (frame_reach_m > 0 or closure_reach_m > 0) and edges:
        user_ends = frozenset(c for line, g in clipped if line.feature == USER_ADDED
                              for c in (g.coords[0], g.coords[-1]))
        connectors += _frame_connectors(edges, frame, frame_reach_m, user_ends, closure_reach_m)

    network = shapely.union_all([*edges, *connectors, frame])
    polys, cuts, dangles, invalid = shapely.polygonize_full([network])
    final_edges = _linear_parts(network)
    unclosed = sorted((g for part in (cuts, dangles, invalid) for g in _linear_parts(part)
                       if g.length >= _STUB_M), key=lambda g: g.wkb)

    faces = [p for p in _polygons(polys) if boundary.contains(p.representative_point())]
    kept = [p for p in faces
            if p.area >= min_area_m2 and (snap_m == 0 or 2 * p.area / p.length >= snap_m)]
    kept.sort(key=lambda p: (round(p.centroid.x, 3), round(p.centroid.y, 3), round(p.area, 3)))
    attribution = _attribute(kept, clipped, snap_m)
    areas = [Area(f"{name}-{i}", name, p, round(float(p.area), 1), *attr)
             for i, (p, attr) in enumerate(zip(kept, attribution), start=1)]
    return Closure(areas, unclosed, sorted(connectors, key=lambda g: g.wkb), ends_before,
                   inside_ends(final_edges), len(faces) - len(kept))


def _attribute(faces: list[Polygon], clipped: list[tuple[Line, LineString]], snap_m: float
               ) -> list[tuple[str, int, str]]:
    """(sheet, year, line kind) per face: the sheet and the line class with most boundary
    length within snap_m + 1 m. Ties go to the first sheet id / lowest code. A face bounded
    by the frame and connectors alone takes the first line's sheet."""
    if not clipped:
        return [("", 0, "") for _ in faces]
    zones = [g.buffer(snap_m + 1.0, cap_style="flat") for _, g in clipped]
    tree = shapely.STRtree(zones)
    out = []
    for face in faces:
        ring = face.boundary
        by_sheet: dict[tuple[str, int], float] = defaultdict(float)
        by_kind: dict[int, float] = defaultdict(float)
        for j in sorted(int(j) for j in tree.query(ring, predicate="intersects")):
            length = ring.intersection(zones[j]).length
            line = clipped[j][0]
            by_sheet[(line.sheet, line.year)] += length
            by_kind[line.feature] += length
        if not by_sheet:
            line = clipped[0][0]
            out.append((line.sheet, line.year, FEATURE_NAMES.get(line.feature, "shoreline")))
            continue
        best = max(by_sheet.values())
        sheet, year = min(k for k, v in by_sheet.items() if v == best)
        top = max(by_kind.values())
        kind = min(k for k, v in by_kind.items() if v == top)
        out.append((sheet, year, FEATURE_NAMES.get(kind, "shoreline")))
    return out


def area_ordinal(area_id: str) -> tuple[str, int]:
    """'CA37B08-12' -> ('CA37B08', 12), for sorting ids naturally."""
    m = _ID_RE.fullmatch(area_id)
    return (m.group(1), int(m.group(2))) if m else (area_id, 0)


# --------------------------------------------------------------------------- seeds


@dataclass(frozen=True)
class Seed:
    id: str
    project: str
    lon: float
    lat: float
    cls: str  # bay | marsh | land
    source: str
    confidence: str
    note: str | None = None


@dataclass(frozen=True)
class OwnerClosure:
    """A closure line drawn by the owner where NOAA's linework does not separate two places."""

    id: str
    project: str
    coordinates: tuple[tuple[float, float], ...]  # lon/lat
    source: str
    note: str | None = None

    def utm(self) -> LineString:
        return lonlat_geom_to_utm(LineString(self.coordinates))


@dataclass(frozen=True)
class SeedFile:
    seeds: list[Seed]
    closures: list[OwnerClosure]

    def closures_for(self, project: str) -> list[OwnerClosure]:
        return [c for c in self.closures if c.project == project]


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _check_text(item: dict, key: str, fail, max_chars: int = MAX_SOURCE_CHARS) -> str:
    value = item.get(key)
    if not isinstance(value, str) or not value.strip():
        raise fail(f"{key} must be non-blank text")
    if len(value.strip()) > max_chars:
        raise fail(f"{key} is {len(value.strip())} characters, more than {max_chars}")
    return value.strip()


def _check_common(item: Any, kind: str, index: int, keys: frozenset[str],
                  required: Sequence[str], path: Path, seen: set[str]):
    """Shared checks of a seed / closure entry. Returns (fail, id, project, note)."""
    label = f"{path}: {kind} {index}"
    if isinstance(item, dict) and isinstance(item.get("id"), str):
        label += f" ({item['id']!r})"

    def fail(msg: str) -> ValueError:
        return ValueError(f"{label}: {msg}")

    if not isinstance(item, dict):
        raise fail("must be a JSON object")
    unknown = sorted(set(item) - keys)
    if unknown:
        raise fail(f"unknown key(s): {', '.join(unknown)} (known: {', '.join(sorted(keys))})")
    missing = [k for k in required if k not in item]
    if missing:
        raise fail(f"missing key(s): {', '.join(missing)}")
    sid = item["id"]
    if (not isinstance(sid, str) or len(sid) > MAX_SEED_ID_CHARS
            or not _SEED_ID_RE.fullmatch(sid)):
        raise fail(f"id must be lower-case letters, digits and '-' (at most "
                   f"{MAX_SEED_ID_CHARS} characters), got {sid!r}")
    if sid in seen:
        raise fail(f"id {sid!r} is used twice")
    seen.add(sid)
    project = item["project"]
    if not isinstance(project, str) or not _PROJECT_RE.fullmatch(project):
        raise fail(f"project must be a NOAA project name like 'CA37B08', got {project!r}")
    note = _check_text(item, "note", fail, 500) if "note" in item else None
    return fail, sid, project, note


def _in_bbox(lon: float, lat: float, bbox: tuple[float, float, float, float] | None) -> bool:
    return bbox is None or (bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3])


def load_seed_file(path: Path, bbox: tuple[float, float, float, float] | None = None
                   ) -> SeedFile:
    """Read and strictly validate a seeds file (see data/full-city/hand/README.md).

    {"seeds": [...], "closures": [...] (optional), "note": "..." (optional)}. A seed is
    {id, project, lon, lat, class, source, confidence, note?}; a closure is
    {id, project, coordinates: [[lon, lat], ...] (2 or more points), source, note?}. Ids are
    unique across the file and slug-like; points must lie inside `bbox` (W, S, E, N) when it
    is given; class is bay, marsh or land; source is non-blank text of at most 200
    characters; confidence one of yelamu.export.CONFIDENCE_LEVELS. Unknown keys are refused.
    Raises ValueError naming the file and the entry.
    """
    path = Path(path)
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: not valid JSON ({exc})") from exc
    if not isinstance(data, dict) or not isinstance(data.get("seeds"), list):
        raise ValueError(f"{path}: must be a JSON object with a 'seeds' list")
    unknown = sorted(set(data) - _FILE_KEYS)
    if unknown:
        raise ValueError(f"{path}: unknown key(s): {', '.join(unknown)} "
                         f"(known: {', '.join(sorted(_FILE_KEYS))})")
    closures_raw = data.get("closures", [])
    if not isinstance(closures_raw, list):
        raise ValueError(f"{path}: 'closures' must be a list")
    seen: set[str] = set()
    seeds = []
    for index, item in enumerate(data["seeds"]):
        fail, sid, project, note = _check_common(
            item, "seed", index, _SEED_KEYS, _SEED_REQUIRED, path, seen)
        lon, lat = item["lon"], item["lat"]
        if not (_is_number(lon) and _is_number(lat)):
            raise fail(f"lon and lat must be finite numbers, got {lon!r}, {lat!r}")
        if not _in_bbox(lon, lat, bbox):
            raise fail(f"({lon}, {lat}) lies outside the region bbox {list(bbox)}")
        cls = item["class"]
        if cls not in SEED_CLASSES:
            raise fail(f"class must be one of {', '.join(SEED_CLASSES)}, got {cls!r}")
        source = _check_text(item, "source", fail)
        confidence = item["confidence"]
        if confidence not in CONFIDENCE_LEVELS:
            raise fail(f"confidence must be one of {', '.join(CONFIDENCE_LEVELS)}, "
                       f"got {confidence!r}")
        seeds.append(Seed(sid, project, float(lon), float(lat), cls, source, confidence, note))
    closures = []
    for index, item in enumerate(closures_raw):
        fail, cid, project, note = _check_common(
            item, "closure", index, _CLOSURE_KEYS, _CLOSURE_REQUIRED, path, seen)
        coords = item["coordinates"]
        if (not isinstance(coords, list) or len(coords) < 2 or not all(
                isinstance(c, list) and len(c) == 2 and all(_is_number(v) for v in c)
                for c in coords)):
            raise fail("coordinates must be a list of 2 or more [lon, lat] pairs of numbers")
        if not all(_in_bbox(c[0], c[1], bbox) for c in coords):
            raise fail(f"a point lies outside the region bbox {list(bbox)}")
        if LineString(coords).length == 0:
            raise fail("coordinates must not all be the same point")
        source = _check_text(item, "source", fail)
        closures.append(OwnerClosure(cid, project, tuple((float(a), float(b)) for a, b in coords),
                                     source, note))
    return SeedFile(seeds, closures)


def load_seeds(path: Path, bbox: tuple[float, float, float, float] | None = None) -> list[Seed]:
    """The seeds of a seeds file (load_seed_file validates the whole file)."""
    return load_seed_file(path, bbox).seeds


@dataclass(frozen=True)
class Classified:
    area: Area
    cls: str
    seeds: tuple[Seed, ...]  # sorted by id; seeds[0] names the area in its source text
    confidence: str  # MAX_CONFIDENCE or lower if a seed says so


@dataclass(frozen=True)
class Classification:
    classified: list[Classified]
    unseeded: list[Area]


def classify(areas: Sequence[Area], seeds: Sequence[Seed]) -> Classification:
    """Give each area the class of the seeds inside it (seeds class areas of their project).

    A seed counts as inside an area when it is within SEED_TOLERANCE_M of it (prepared
    geometry). Errors (ValueError naming the seed or seeds): a seed whose project has no
    areas; a seed in no area of its project; a seed on the boundary of two areas; two seeds
    of different classes in one area. Areas without a seed are returned in `unseeded`.
    Confidence: MAX_CONFIDENCE ('inferred'), or lower if a seed says so ('illustrative').
    """
    by_project: dict[str, list[Area]] = defaultdict(list)
    for area in areas:
        by_project[area.project].append(area)
    for group in by_project.values():
        shapely.prepare([a.geometry for a in group])
    hits: dict[str, list[Seed]] = defaultdict(list)
    for seed in sorted(seeds, key=lambda s: s.id):
        group = by_project.get(seed.project)
        if not group:
            raise ValueError(f"seed {seed.id!r}: project {seed.project} was not imported "
                             f"(imported: {', '.join(sorted(by_project)) or 'none'})")
        point = lonlat_geom_to_utm(Point(seed.lon, seed.lat))
        inside = [a for a in group
                  if shapely.dwithin(a.geometry, point, SEED_TOLERANCE_M)]
        if not inside:
            raise ValueError(
                f"seed {seed.id!r} ({seed.lon}, {seed.lat}) lies in no area of {seed.project} "
                "(outside the project, in a sliver dropped as too small or narrow, or on "
                "linework); move it")
        if len(inside) > 1:
            raise ValueError(f"seed {seed.id!r} lies on the boundary between "
                             f"{' and '.join(a.id for a in inside)}; move it inside one")
        hits[inside[0].id].append(seed)
    classified, unseeded = [], []
    for area in sorted(areas, key=lambda a: area_ordinal(a.id)):
        found = hits.get(area.id)
        if not found:
            unseeded.append(area)
            continue
        classes = sorted({s.cls for s in found})
        if len(classes) > 1:
            a = next(s for s in found if s.cls == classes[0])
            b = next(s for s in found if s.cls == classes[1])
            raise ValueError(f"area {area.id}: seed {a.id!r} says {a.cls} but seed {b.id!r} "
                             f"says {b.cls}")
        confidence = lowest_confidence([MAX_CONFIDENCE, *(s.confidence for s in found)])
        classified.append(Classified(area, classes[0], tuple(found), confidence))
    return Classification(classified, unseeded)


# --------------------------------------------------------------------------- output


def source_text(area: Area, seed_id: str, max_chars: int = MAX_SOURCE_CHARS) -> str:
    """The provenance text of an area classed by `seed_id`, at most `max_chars` characters.

    "NOAA Shoreline Data Rescue Project, <project>, sheet <T-xxxxx> (<year>), <line kind>;
    area classed by seed <seed id>". When too long the leading text is shortened (first the
    project name, then cut with '...'); the seed id is never cut.
    """
    tail = f"; area classed by seed {seed_id}"
    for prefix in (SOURCE_PREFIX, SHORT_SOURCE_PREFIX):
        head = f"{prefix}, {area.project}, sheet {area.sheet} ({area.year}), {area.line_kind}"
        if len(head) + len(tail) <= max_chars:
            return head + tail
    room = max_chars - len(tail) - 3
    if room < len(SHORT_SOURCE_PREFIX):
        raise ValueError(f"seed id {seed_id!r} is too long for a {max_chars}-character source")
    return head[:room] + "..." + tail


def _round_ring(coords) -> list[list[float]]:
    out: list[list[float]] = []
    for x, y in coords:
        p = [round(float(x), COORD_DECIMALS), round(float(y), COORD_DECIMALS)]
        if not out or p != out[-1]:
            out.append(p)
    return out


def _lonlat_polygons(geom: Polygon) -> list[Polygon]:
    """UTM polygon -> lon/lat polygons, thinned, rounded and valid, exterior counter-clockwise."""
    simple = geom.simplify(OUTPUT_SIMPLIFY_M, preserve_topology=True)
    ll = utm_geom_to_lonlat(simple)
    rounded = Polygon(_round_ring(ll.exterior.coords),
                      [_round_ring(r.coords) for r in ll.interiors])
    parts = [rounded] if rounded.is_valid else _polygons(shapely.make_valid(rounded))
    out = []
    for part in parts:
        part = orient(part, 1.0)
        fixed = Polygon(_round_ring(part.exterior.coords),
                        [_round_ring(r.coords) for r in part.interiors])
        if fixed.is_valid and not fixed.is_empty:
            out.append(fixed)
    return out


def area_feature(item: Classified) -> dict:
    """One GeoJSON Feature (lon/lat) for a classified area."""
    polys = _lonlat_polygons(item.area.geometry)
    if not polys:
        raise ValueError(f"area {item.area.id}: no valid polygon left after rounding")
    geom = polys[0] if len(polys) == 1 else MultiPolygon(polys)
    seed = item.seeds[0].id
    return {
        "type": "Feature",
        "properties": {
            "source": source_text(item.area, seed),
            "confidence": item.confidence,
            "area_id": item.area.id,
            "area_m2": round(item.area.area_m2),
            "seed": seed,
        },
        "geometry": mapping(geom),
    }


def areas_to_features(classified: Sequence[Classified]) -> dict[str, list[dict]]:
    """{'bay': [...], 'marsh': [...]}: GeoJSON Features of the bay and marsh areas, sorted by
    project then ordinal. Land areas are not written (land is the default)."""
    out: dict[str, list[dict]] = {cls: [] for cls in EXPORTED_CLASSES}
    for item in sorted(classified, key=lambda c: area_ordinal(c.area.id)):
        if item.cls in out:
            out[item.cls].append(area_feature(item))
    return out


def feature_collection_text(features: Sequence[dict]) -> str:
    """Deterministic GeoJSON text: one feature per line; an empty collection is the same
    one-line text as the committed empty hand files."""
    if not features:
        return '{"type": "FeatureCollection", "features": []}\n'
    lines = [json.dumps(f, separators=(",", ":"), ensure_ascii=False) for f in features]
    return '{"type": "FeatureCollection", "features": [\n' + ",\n".join(lines) + "\n]}\n"


def cross_project_overlaps(classified: Sequence[Classified]) -> list[tuple[str, str, float]]:
    """(area id, area id, overlap m2) for written (bay / marsh) areas of DIFFERENT projects
    that overlap, sorted. Overlaps are allowed: the build unions the hand files."""
    items = sorted((c for c in classified if c.cls in EXPORTED_CLASSES),
                   key=lambda c: area_ordinal(c.area.id))
    geoms = [c.area.geometry for c in items]
    if len(geoms) < 2:
        return []
    tree = shapely.STRtree(geoms)
    left, right = tree.query(geoms, predicate="intersects")
    out = []
    for i, j in sorted({(int(a), int(b)) for a, b in zip(left, right) if a < b}):
        if items[i].area.project == items[j].area.project:
            continue
        m2 = geoms[i].intersection(geoms[j]).area
        if m2 > 0:
            out.append((items[i].area.id, items[j].area.id, round(m2, 1)))
    return out


def area_row(area: Area) -> str:
    """'<id>  <ha> ha  centroid <lon>, <lat>  sheet <T-xxxxx> (<year>)  <line kind>'."""
    c = utm_geom_to_lonlat(area.geometry.centroid)
    p = utm_geom_to_lonlat(area.geometry.representative_point())
    return (f"{area.id:<14} {area.area_m2 / 1e4:10.2f} ha  centroid {c.x:.5f}, {c.y:.5f}  "
            f"inside point {p.x:.5f}, {p.y:.5f}  sheet {area.sheet} ({area.year})  "
            f"{area.line_kind}")
