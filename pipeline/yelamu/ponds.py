"""Freshwater ponds and lakes: polygons with a flat water level, carved into the terrain.

A pond is one polygon plus a water level. Sources:

  * SFEI habitat polygons whose HabitatCla is in `pond_classes` (documented);
  * `hand_ponds` GeoJSON files (provenance required; optional feature properties
    `level_m` (number), `name` and `id`).

Level: the `level_m` property if given, else the MEDIAN of the RAW modern DEM inside the
polygon (a lake surface is flat; the median shrugs off shore and building outliers).
Carving: the bed inside the polygon is set to `level_m - depth`, where depth ramps with a
smoothstep from 0 at the shoreline to `max_depth_m` over `shelf_m` metres of distance
from the shore. The bed is OVERWRITTEN (not min'd with the old ground): a pond bed
is a function of its polygon and level alone. Ponds are applied last (after the water
edits, the land ramp and the bay shelf) and are not touched by the land ramp or smoothing.

`ponds.json` (next to heightmap.u16) holds the polygons in the overlay's WORLD metres.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field, replace
from typing import Any, Callable, Iterable, Sequence

import numpy as np
from scipy import ndimage
from shapely.geometry import Polygon, box
from shapely.geometry.base import BaseGeometry
from shapely.geometry.polygon import orient

from yelamu.export import Layer
from yelamu.geo import Grid
from yelamu.habitat import ID_HAND_POND, _class_name
from yelamu.provenance import hand_source_rows, layer_source_summary, lowest_confidence
from yelamu.sources import Feature, _polygonal_parts, geometry_to_utm_polygons
from yelamu.water import water_mask

PONDS_VERSION = 1
PONDS_FILE = "ponds.json"
DEFAULT_POND_CLASSES: tuple[str, ...] = (
    "Dune-dammed pond or lake",
    "Dune-dammed headwater lake",
    "Barrier beach-impounded freshwater lagoon",
    "Other pond or lake",
)  # 'Tidal coastal lagoon' is deliberately not here: the owner decides later
MIN_POND_CELLS = 4
DEFAULT_MAX_DEPTH_M = 2.0
DEFAULT_SHELF_M = 20.0
DEFAULT_BANK_SLOPE = 0.35
DEFAULT_BANK_M = 200.0


def slugify(text: str) -> str:
    """Lower-case ASCII slug ('Lake Merced (north)' -> 'lake-merced-north'); 'pond' if empty."""
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "pond"


@dataclass(frozen=True)
class PondSpec:
    """A pond candidate before it meets the grid."""

    geometry: Polygon  # UTM metres
    origin: str  # "sfei" or "hand"
    source: str
    confidence: str
    class_name: str | None = None  # SFEI HabitatCla
    name: str | None = None
    id_hint: str | None = None
    level_m: float | None = None


@dataclass(frozen=True, eq=False)
class Pond:
    id: str
    name: str | None
    level_m: float  # rounded to 0.01 m
    source: str
    confidence: str
    origin: str
    class_name: str | None
    geometry: Polygon
    mask: np.ndarray = field(repr=False)  # cells owned by this pond (disjoint across ponds)


# ------------------------------------------------------------------ candidates


def sfei_pond_specs(
    collection: dict, pond_classes: Iterable[str], field_name: str = "HabitatCla"
) -> list[PondSpec]:
    """Every polygon of an SFEI feature whose class is in `pond_classes` (documented)."""
    wanted = set(pond_classes)
    specs: list[PondSpec] = []
    for feature in collection.get("features", []):
        cls = _class_name(feature, field_name)
        if cls is None or cls not in wanted:
            continue
        for poly in geometry_to_utm_polygons(feature.get("geometry")):
            specs.append(PondSpec(
                geometry=poly, origin="sfei", class_name=cls, confidence="documented",
                source=f"SFEI Hidden Nature SF habitat class '{cls}'"))
    return specs


def hand_pond_specs(features: Sequence[Feature], path: Any) -> list[PondSpec]:
    """One spec per polygon of each hand-drawn feature (provenance already checked)."""
    specs: list[PondSpec] = []
    for feature in features:
        props = feature.properties
        level = props.get("level_m")
        if level is not None and (
            isinstance(level, bool) or not isinstance(level, (int, float)) or not math.isfinite(level)
        ):
            raise ValueError(
                f"{path}: feature {feature.index}: level_m must be a number (metres), "
                f"got {level!r}"
            )
        raw_id = props.get("id")
        for poly in feature.polygons:
            specs.append(PondSpec(
                geometry=poly, origin="hand", source=feature.source or "",
                confidence=feature.confidence or "illustrative",
                name=feature.name,
                id_hint=raw_id.strip() if isinstance(raw_id, str) and raw_id.strip() else None,
                level_m=None if level is None else float(level)))
    return specs


# --------------------------------------------------------------------- building


def _assign_ids(items: list[tuple[PondSpec, np.ndarray]]) -> list[str]:
    """Deterministic, unique ids for the surviving specs (same order as `items`)."""
    def base_of(spec: PondSpec) -> tuple[str, bool]:
        if spec.id_hint:
            return slugify(spec.id_hint), True
        if spec.name:
            return slugify(spec.name), True
        return slugify(spec.class_name or "pond"), False

    def position(spec: PondSpec) -> tuple[float, float]:
        c = spec.geometry.centroid
        return (round(c.x, 1), round(c.y, 1))

    groups: dict[str, list[int]] = {}
    explicit: dict[str, bool] = {}
    for i, (spec, _) in enumerate(items):
        base, is_explicit = base_of(spec)
        groups.setdefault(base, []).append(i)
        explicit[base] = explicit.get(base, True) and is_explicit

    ids: list[str | None] = [None] * len(items)
    for base, members in sorted(groups.items()):
        members.sort(key=lambda i: (position(items[i][0]), items[i][0].geometry.area))
        needs_index = len(members) > 1 or not explicit[base]
        for n, i in enumerate(members, start=1):
            ids[i] = f"{base}-{n}" if needs_index else base
    used: set[str] = set()
    for i, candidate in enumerate(ids):
        assert candidate is not None
        unique, k = candidate, 1
        while unique in used:  # a name that already looks like another pond's id
            k += 1
            unique = f"{candidate}-{k}"
        used.add(unique)
        ids[i] = unique
    return [i for i in ids if i is not None]


def build_ponds(
    specs: Sequence[PondSpec],
    raw_dem: np.ndarray,
    grid: Grid,
    min_cells: int = MIN_POND_CELLS,
    log: Callable[[str], None] = print,
) -> list[Pond]:
    """Resolve candidates against the grid: masks, levels, ids; sorted by id.

    Polygons are first clipped to the grid box (a piece the clip separates is a pond of its
    own). Polygons covering fewer than `min_cells` cell centres are dropped with a note via
    `log`. The level is level_m if given, else the median of the non-NaN raw DEM under the
    polygon, rounded to 0.01 m; with neither (all NaN) a hand pond raises ValueError and an
    SFEI pond is dropped with a note. Where ponds overlap, a hand pond wins over an SFEI one
    and otherwise the pond with the earlier id wins: the loser's geometry has the winners'
    geometry subtracted (it may gain a hole or split into several ponds, ids suffixed -2, -3),
    and a remainder that is empty or under `min_cells` cells is dropped. So every pond's
    `geometry` and `mask` describe the same area, and no area belongs to two ponds.
    """
    raw_dem = np.asarray(raw_dem)
    # Everything a pond can be is on the grid: clip first (a polygon running off the map
    # becomes the part that is on it; pieces the clip separates become ponds of their own).
    gbox = box(grid.west, grid.south, grid.east, grid.north)
    clipped: list[PondSpec] = []
    for spec in specs:
        geom = spec.geometry
        parts = [geom] if gbox.contains(geom) else _polygonal_parts(geom.intersection(gbox))
        clipped += [replace(spec, geometry=part) for part in parts]

    kept: list[tuple[PondSpec, np.ndarray]] = []
    for spec in clipped:
        label = spec.name or spec.id_hint or spec.class_name or "pond"
        mask = water_mask([spec.geometry], grid)
        n = int(mask.sum())
        if n < min_cells:
            c = spec.geometry.centroid
            log(f"Dropped pond '{label}' near UTM ({c.x:.0f}, {c.y:.0f}): it covers {n} "
                f"cell(s), fewer than {min_cells}")
            continue
        kept.append((spec, mask))

    ids = _assign_ids(kept)
    resolved: list[tuple[str, PondSpec, np.ndarray, float]] = []
    for pid, (spec, mask) in zip(ids, kept):
        if spec.level_m is not None:
            level = spec.level_m
        else:
            values = raw_dem[mask]
            values = values[~np.isnan(values)]
            if values.size == 0:
                msg = (f"pond '{pid}' has no elevation data under it in the DEM; give the "
                       "polygon a level_m property (metres)")
                if spec.origin == "hand":
                    raise ValueError(msg)
                log(f"Dropped {msg}")
                continue
            level = float(np.median(values))
        resolved.append((pid, spec, mask, round(level, 2)))

    # One surface per cell: hand ponds first, then by id. A pond keeps only the part of its
    # polygon that no earlier pond covers (that part is what is exported AND what is carved,
    # so the rings and the cells agree); a pond the others split becomes one pond per piece.
    resolved.sort(key=lambda r: (r[1].origin != "hand", r[0]))
    used_ids = {r[0] for r in resolved}
    claimed = np.zeros((grid.height, grid.width), dtype=bool)
    claimed_geom: BaseGeometry | None = None
    ponds: list[Pond] = []
    for pid, spec, _mask, level in resolved:
        geom = spec.geometry if claimed_geom is None else spec.geometry.difference(claimed_geom)
        pieces: list[tuple[Polygon, np.ndarray]] = []
        for part in _polygonal_parts(geom):
            own = water_mask([part], grid) & ~claimed
            n = int(own.sum())
            if n == 0:
                continue
            if n < min_cells:
                c = part.centroid
                log(f"Dropped a piece of pond '{pid}' near UTM ({c.x:.0f}, {c.y:.0f}): "
                    f"only {n} cell(s) are left after the ponds that rank above it, fewer "
                    f"than {min_cells}")
                continue
            claimed |= own
            pieces.append((part, own))
        if not pieces:
            log(f"Dropped pond '{pid}': every cell is already owned by another pond")
            continue
        pieces.sort(key=lambda t: (round(t[0].centroid.x, 1), round(t[0].centroid.y, 1), t[0].area))
        for k, (part, own) in enumerate(pieces):
            piece_id = pid
            if k > 0:
                n = k + 1
                while f"{pid}-{n}" in used_ids:
                    n += 1
                piece_id = f"{pid}-{n}"
                used_ids.add(piece_id)
            claimed_geom = part if claimed_geom is None else claimed_geom.union(part)
            ponds.append(Pond(
                id=piece_id, name=spec.name, level_m=level, source=spec.source,
                confidence=spec.confidence, origin=spec.origin, class_name=spec.class_name,
                geometry=part, mask=own))
    return sorted(ponds, key=lambda p: p.id)


# ----------------------------------------------------------------------- terrain


def pond_mask(ponds: Sequence[Pond], shape: tuple[int, int]) -> np.ndarray:
    """True on every cell owned by any pond."""
    out = np.zeros(shape, dtype=bool)
    for p in ponds:
        out |= p.mask
    return out


def carve_ponds(
    dem: np.ndarray,
    ponds: Sequence[Pond],
    cell_m: float,
    max_depth_m: float = DEFAULT_MAX_DEPTH_M,
    shelf_m: float = DEFAULT_SHELF_M,
) -> np.ndarray:
    """A copy of dem with each pond bed set to level_m - depth.

    depth = max_depth_m * smoothstep(clip(d / shelf_m, 0, 1)) where d is the distance
    (metres) from the cell centre to the shoreline, taken half a cell beyond the nearest
    non-pond cell centre, so d = 0 on the shore and a shore cell is a little under the
    surface. The edge of the GRID is not a shore (a pond running off the map keeps its
    depth). shelf_m <= 0 gives a flat bed at full depth. Cells outside every pond are
    unchanged.
    """
    out = np.asarray(dem, dtype="float32").copy()
    for p in ponds:
        m = p.mask
        if not m.any():
            continue
        if shelf_m <= 0 or m.all():
            depth = np.full(int(m.sum()), max_depth_m)
        else:
            edt = ndimage.distance_transform_edt(m)
            d = np.maximum(edt[m] - 0.5, 0.0) * cell_m
            t = np.clip(d / shelf_m, 0.0, 1.0)
            depth = max_depth_m * t * t * (3.0 - 2.0 * t)
        out[m] = (p.level_m - depth).astype("float32")
    return out


def blend_pond_banks(
    heights_m: np.ndarray,
    grid: Grid,
    ponds: Sequence[Pond],
    land_mask: np.ndarray,
    bank_slope: float = DEFAULT_BANK_SLOPE,
    bank_m: float = DEFAULT_BANK_M,
) -> np.ndarray:
    """Grade the ground around ponds so there is no wall or dam at the shore.

    Carving sets the bed from the polygon and level alone, so a pond cut into a hillside
    leaves a cliff and a pond on low ground sits on it like a dam. For every cell that is
    LAND (`land_mask`), outside every pond, and within `bank_m` metres of one, with d the
    distance in metres from the nearest pond cell (measured half a cell short, so d is ~0 on
    the shoreline) and `level` that nearest pond's level_m:

        h' = clip(h, level - bank_slope * d, level + bank_slope * d)

    which lowers a wall into a ramp of at most bank_slope metres per metre and raises low
    ground under a dam into an embankment. Ground already gentler than that is unchanged.
    Pond cells, non-land (bay / marsh / gap-filled water) cells and cells beyond bank_m are
    never touched, nor are the pond beds and level_m. bank_slope <= 0 or no ponds returns an
    unchanged copy. Call it right after carve_ponds.
    """
    out = np.asarray(heights_m, dtype="float32").copy()
    if bank_slope <= 0 or not ponds:
        return out
    union = pond_mask(ponds, out.shape)
    if not union.any() or union.all():
        return out
    level_map = np.zeros(out.shape, dtype="float64")
    for p in ponds:
        level_map[p.mask] = p.level_m
    edt, (ri, ci) = ndimage.distance_transform_edt(~union, return_indices=True)
    d = np.maximum(edt - 0.5, 0.0) * grid.cell
    zone = np.asarray(land_mask, dtype=bool) & ~union & (d <= bank_m)
    level = level_map[ri, ci]
    lo = level - bank_slope * d
    hi = level + bank_slope * d
    out[zone] = np.clip(out[zone].astype("float64"), lo[zone], hi[zone]).astype("float32")
    return out


def stamp_ponds_on_habitat(
    habitat: np.ndarray, legend: Sequence[dict], ponds: Sequence[Pond]
) -> np.ndarray:
    """A copy of the habitat raster where pond cells carry the pond's class.

    SFEI ponds get their own SFEI class id (looked up by name in `legend`); hand-drawn
    ponds get the synthetic ID_HAND_POND. Applied last, so the raster agrees with the
    terrain wherever a pond was carved.
    """
    ids = {e["name"]: e["id"] for e in legend}
    out = np.array(habitat, dtype=np.uint8, copy=True)
    for p in ponds:
        if p.origin == "hand":
            out[p.mask] = ID_HAND_POND
        else:
            if p.class_name not in ids:
                raise ValueError(f"pond '{p.id}': class {p.class_name!r} is not in the habitat legend")
            out[p.mask] = ids[p.class_name]
    return out


# -------------------------------------------------------------------- export


def _ring_flat(coords: Sequence[tuple[float, float]], grid: Grid) -> list[float]:
    cx = (grid.west + grid.east) / 2.0
    cz = (grid.north + grid.south) / 2.0
    flat: list[float] = []
    prev: tuple[float, float] | None = None
    pts = list(coords)[:-1]  # drop the closing duplicate
    for x, y in pts:
        pt = (round(x - cx, 1) + 0.0, round(cz - y, 1) + 0.0)
        if pt != prev:
            flat.extend(pt)
            prev = pt
    if len(flat) >= 4 and (flat[0], flat[1]) == (flat[-2], flat[-1]):
        del flat[-2:]
    if len(flat) < 6:
        raise ValueError("a pond ring collapsed to fewer than 3 points after rounding")
    return flat


def ponds_document(ponds: Sequence[Pond], grid: Grid, processing: dict) -> dict:
    """The ponds.json dict: rings in viewer world metres (x east, z south, origin at the
    grid centre, as overlay.json), rounded to 0.1 m, ponds sorted by id.

    Each ring is a flat [x0, z0, x1, z1, ...] list WITHOUT repeating the first point.
    rings[0] is the outer ring and any further rings are holes. In the (x, z) plane the
    outer ring is counter-clockwise (so it looks clockwise on a north-up map, z being south).
    """
    out = []
    for p in sorted(ponds, key=lambda p: p.id):
        cx = (grid.west + grid.east) / 2.0
        cz = (grid.north + grid.south) / 2.0
        world = Polygon(
            [(x - cx, cz - y) for x, y in p.geometry.exterior.coords],
            [[(x - cx, cz - y) for x, y in ring.coords] for ring in p.geometry.interiors],
        )
        world = orient(world, 1.0)
        rings = [_ring_flat([(x + cx, cz - z) for x, z in world.exterior.coords], grid)]
        for ring in world.interiors:
            rings.append(_ring_flat([(x + cx, cz - z) for x, z in ring.coords], grid))
        out.append({
            "id": p.id,
            "name": p.name,
            "level_m": p.level_m,
            "source": p.source,
            "confidence": p.confidence,
            "rings": rings,
        })
    return {"version": PONDS_VERSION, "ponds": out, "processing": processing}


def pond_provenance_rows(ponds: Sequence[Pond]) -> list[dict]:
    """meta hand_sources rows (layer "ponds"): one per distinct (source, confidence)."""
    return hand_source_rows("ponds", [(p.source, p.confidence) for p in ponds])


def pond_layer(ponds: Sequence[Pond]) -> Layer | None:
    """The meta layer for ponds (None when there are none); confidence is the lowest."""
    if not ponds:
        return None
    n = len(ponds)
    prefix = f"{n} freshwater pond{'' if n == 1 else 's'}"
    attribution = "SFEI; this project" if any(p.origin == "sfei" for p in ponds) else "this project"
    return Layer(
        "ponds",
        layer_source_summary(prefix, [p.source for p in ponds]),
        lowest_confidence([p.confidence for p in ponds]),
        attribution,
    )
