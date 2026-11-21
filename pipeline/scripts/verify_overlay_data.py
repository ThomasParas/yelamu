"""Cross-check landmarks and hotspots against the built terrain and habitat rasters.

    uv run python scripts/verify_overlay_data.py ASSET_DIR [--landmarks P] [--hotspots P]

Reads heightmap.u16, habitat.u8 and meta.json from ASSET_DIR (no writes). Rules:
  * landmark kind "hill": DEM height at the point must be >= 60 m
  * landmark kind "water" / "beach": DEM height must be <= 30 m
  * hotspot kinds marsh/lagoon/lake/bay/creek: the habitat group at the point (and the
    groups within 100 m) are reported; water/marsh/wetland (or unmapped) is expected.
Exit code 1 if a landmark rule fails or an id is shared by a landmark and a hotspot. Hotspot results are informational (printed).
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import numpy as np

from yelamu.export import dequantize_heights
from yelamu.geo import Grid, lonlat_to_utm

HILL_MIN_M = 60.0
LOW_MAX_M = 30.0
WET_GROUPS = {"water", "marsh", "mudflat", "wetland", "unmapped"}


def load_assets(asset_dir: Path):
    meta = json.loads((asset_dir / "meta.json").read_text())
    w, h = meta["width"], meta["height"]
    q = np.fromfile(asset_dir / meta["heights_file"], dtype="<u2").reshape(h, w)
    dem = dequantize_heights(q, meta["min_m"], meta["max_m"])
    habitat = np.fromfile(asset_dir / meta["habitat_file"], dtype=np.uint8).reshape(h, w)
    group_by_id = {c["id"]: c["group"] for c in meta["habitat_classes"]}
    grid = Grid(meta["west"], meta["south"], meta["east"], meta["north"], meta["cell_m"])
    return meta, grid, dem, habitat, group_by_id


def cell_of(grid: Grid, lon: float, lat: float) -> tuple[int, int] | None:
    return grid.pixel_of(*lonlat_to_utm(lon, lat))


def neighbourhood_groups(habitat, group_by_id, row, col, radius_cells=10):
    r0, r1 = max(0, row - radius_cells), row + radius_cells + 1
    c0, c1 = max(0, col - radius_cells), col + radius_cells + 1
    window = habitat[r0:r1, c0:c1]
    ids, counts = np.unique(window, return_counts=True)
    c = Counter()
    for i, n in zip(ids, counts):
        c[group_by_id.get(int(i), "unmapped")] += int(n)
    total = sum(c.values())
    return {g: round(n / total, 2) for g, n in c.most_common()}


def main(argv=None) -> int:
    root = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser()
    p.add_argument("asset_dir", type=Path)
    p.add_argument("--landmarks", type=Path, default=root / "data/overlay/landmarks.json")
    p.add_argument("--hotspots", type=Path, default=root / "data/overlay/hotspots.json")
    args = p.parse_args(argv)

    meta, grid, dem, habitat, group_by_id = load_assets(args.asset_dir)
    failures = 0

    landmarks = json.loads(args.landmarks.read_text())
    hotspots = json.loads(args.hotspots.read_text()) if args.hotspots.exists() else []
    shared = {i["id"] for i in landmarks} & {i["id"] for i in hotspots}
    for item_id in sorted(shared):
        print(f"FAIL {item_id}: id is used by both a landmark and a hotspot")
        failures += 1

    print("== landmarks (DEM height) ==")
    for item in landmarks:
        rc = cell_of(grid, item["lon"], item["lat"])
        if rc is None:
            print(f"FAIL {item['id']}: outside the grid")
            failures += 1
            continue
        height = float(dem[rc])
        status = "ok"
        if item["kind"] == "hill" and height < HILL_MIN_M:
            status = f"FAIL (hill needs >= {HILL_MIN_M:g} m)"
        elif item["kind"] in ("water", "beach") and height > LOW_MAX_M:
            status = f"FAIL ({item['kind']} needs <= {LOW_MAX_M:g} m)"
        failures += status != "ok"
        print(f"{status:8} {item['id']:26} {item['kind']:9} {height:7.1f} m  cell={rc}")

    print("== hotspots (habitat raster) ==")
    if hotspots:
        for item in hotspots:
            rc = cell_of(grid, item["lon"], item["lat"])
            if rc is None:
                print(f"FAIL {item['id']}: outside the grid")
                failures += 1
                continue
            group = group_by_id.get(int(habitat[rc]), "unmapped")
            near = neighbourhood_groups(habitat, group_by_id, *rc)
            note = "ok" if group in WET_GROUPS or item["kind"] not in (
                "marsh", "lagoon", "lake", "bay", "creek") else "CHECK"
            print(f"{note:6} {item['id']:26} {item['kind']:9} here={group:9} "
                  f"dem={float(dem[rc]):6.1f} m  within100m={near}")
    print(f"{len(landmarks)} landmarks, {len(hotspots)} hotspots")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
