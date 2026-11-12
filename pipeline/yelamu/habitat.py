"""Habitat classes as a raster the viewer can colour the ground with.

The SFEI layer's `HabitatCla` values (about thirty) are grouped into ten coarse groups
for colouring. The raster stores one uint8 id per cell; `legend` maps ids back to names
and groups. Ids 0..4 are fixed synthetic classes; SFEI classes get ids 5.. in sorted
name order (only those present in the data).
"""

from __future__ import annotations

import numpy as np
from rasterio.features import rasterize

from yelamu.geo import Grid
from yelamu.sources import geometry_to_utm_polygons

ID_UNMAPPED = 0
ID_OPEN_BAY_INFERRED = 1
ID_HAND_BAY = 2
ID_HAND_MARSH = 3
ID_HAND_POND = 4
FIRST_SFEI_ID = 5
MAX_SFEI_CLASSES = 250  # uint8 ids 5..254 (255 stays free)

SYNTHETIC_LEGEND: list[dict] = [
    {"id": ID_UNMAPPED, "name": "Unmapped", "group": "unmapped"},
    {"id": ID_OPEN_BAY_INFERRED, "name": "Open bay (inferred from modern elevation)",
     "group": "water"},
    {"id": ID_HAND_BAY, "name": "Bay (hand-drawn)", "group": "water"},
    {"id": ID_HAND_MARSH, "name": "Marsh (hand-drawn)", "group": "marsh"},
    {"id": ID_HAND_POND, "name": "Pond (hand-drawn)", "group": "water"},
]

_GROUPS = {
    "water": ["Deep ocean/bay", "Shallow ocean/bay", "Other pond or lake",
              "Dune-dammed pond or lake", "Dune-dammed headwater lake",
              "Barrier beach-impounded freshwater lagoon"],
    "marsh": ["Tidal marsh", "Tidal slough", "Tidal flat", "Tidal coastal lagoon"],
    "wetland": ["Fen", "Wet meadow", "Willow grove", "Riparian woodland", "Dune slack",
                "Serpentine slope wetland/serpentine maritime chaparral complex"],
    "dune": ["Mobile dunes", "Stabilized dune/dune scrub/grassland"],
    "beach": ["Beach", "Sandy/Rocky Intertidal"],
    "woodland": ["Coast live oak woodland", "California Bay Woodland"],
    "grassland": ["Coastal prairie", "Coastal prairie/scrub", "Foothill grassland",
                  "Serpentine grassland"],
    "scrub": ["Coastal scrub", "Coastal bluff scrub", "Maritime chaparral",
              "Serpentine maritime chaparral"],
    "rock": ["Island"],
}
GROUP_BY_CLASS: dict[str, str] = {c: g for g, classes in _GROUPS.items() for c in classes}


def _class_name(feature: dict, field: str) -> str | None:
    value = (feature.get("properties") or {}).get(field)
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip()


def rasterize_habitats(
    collection: dict, grid: Grid, field: str = "HabitatCla"
) -> tuple[np.ndarray, list[dict], list[str]]:
    """Burn habitat classes onto the grid.

    Returns (raster, legend, unknown). `raster` is (height, width) uint8 with 0 meaning
    unmapped. `legend` lists the synthetic entries first, then every SFEI class that has
    at least one polygon, as {"id", "name", "group"}. `unknown` names classes missing
    from GROUP_BY_CLASS; they still get a legend entry, with group "unmapped".

    Features with no geometry, no polygonal part, or a missing/blank `field` are
    skipped. Classes are burned one at a time in sorted-name order, so where polygons of
    different classes overlap, the class that sorts LAST wins (deterministic, and
    independent of feature order). A cell is a class if its centre is inside a polygon.
    More than MAX_SFEI_CLASSES (250: ids 5..254 in a uint8) distinct classes raises ValueError.
    """
    by_class: dict[str, list] = {}
    for feature in collection.get("features", []):
        name = _class_name(feature, field)
        raw = feature.get("geometry")
        if name is None or not raw:
            continue
        polys = geometry_to_utm_polygons(raw)
        if polys:
            by_class.setdefault(name, []).extend(polys)

    names = sorted(by_class)
    if len(names) > MAX_SFEI_CLASSES:
        raise ValueError(
            f"{len(names)} distinct habitat classes found; at most {MAX_SFEI_CLASSES} "
            "fit in a uint8 raster"
        )

    raster = np.zeros((grid.height, grid.width), dtype=np.uint8)
    legend = [dict(entry) for entry in SYNTHETIC_LEGEND]
    unknown: list[str] = []
    for offset, name in enumerate(names):
        class_id = FIRST_SFEI_ID + offset
        group = GROUP_BY_CLASS.get(name)
        if group is None:
            unknown.append(name)
            group = "unmapped"
        legend.append({"id": class_id, "name": name, "group": group})
        rasterize(
            [(geom, class_id) for geom in by_class[name]],
            out=raster,
            transform=grid.transform(),
            dtype="uint8",
        )
    return raster, legend, unknown


def apply_overrides(
    habitat: np.ndarray,
    gap: np.ndarray | None,
    hand_bay: np.ndarray | None,
    hand_marsh: np.ndarray | None,
) -> np.ndarray:
    """A copy of `habitat` with the synthetic water classes stamped on.

    Applied in this order, so later wins: inferred open bay (`gap`), hand-drawn marsh,
    hand-drawn bay. Any mask may be None (nothing to stamp). Ponds are stamped after this
    by yelamu.ponds.stamp_ponds_on_habitat.
    """
    out = np.array(habitat, dtype=np.uint8, copy=True)
    for mask, class_id in ((gap, ID_OPEN_BAY_INFERRED), (hand_marsh, ID_HAND_MARSH),
                           (hand_bay, ID_HAND_BAY)):
        if mask is not None:
            out[np.asarray(mask, dtype=bool)] = class_id
    return out
