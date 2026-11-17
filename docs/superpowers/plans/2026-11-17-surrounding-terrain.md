# Surrounding Terrain (grey modern context ring) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the area around the 1769 San Francisco map (Marin, the East Bay, the peninsula down to Linda Mar) with a coarse, grey, clearly labelled modern-terrain ring, so the map no longer floats in empty sea.

**Architecture:** A new pipeline step resamples the 3DEP elevation file already on disk onto a coarse vertex lattice (about 60 m) whose grid lines pass exactly through the edges of the city mesh, flattens open water, matches the city's edge heights, and writes `context.json` plus `context.u16` next to the city data. A new viewer module (`contextModule`) loads them after the city is up, draws the ring as culled tiles with skirts, widens the camera limits, and adds about 19 modern place labels. The data format already accepts hand-drawn water polygons so the later 1850s shore stages are data-only.

**Tech Stack:** Python (uv; numpy, rasterio, shapely, pytest with `-W error`), Vite 8 / TypeScript / Three.js 0.187 / Vitest (node environment, no DOM tests; DOM and WebGL are checked in a real browser).

**Spec:** `docs/superpowers/specs/2026-11-17-surrounding-terrain-design.md`. Task 1 amends it with the decisions made while planning (listed there).

**Scope:** this plan covers the ring (the launch work). Each later 1850s stage (East Bay, peninsula bayshore, Marin) needs downloads and owner review of previews and gets its own plan.

**Working rules for every task:** test first and watch it fail; one commit per task; never edit the generated files by hand; commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; run commands from the directory named in each step.

---

## Facts the tasks rely on (read from the code on 2026-11-17)

- World coordinates: `x = E - (grid.west + grid.east) / 2`, `z = (grid.north + grid.south) / 2 - N` (UTM 10N metres, +x east, +z south, origin at the city grid centre). The city mesh joins cell centres, so it spans `(width-1) * cell` by `(height-1) * cell`: 17,700 m by 15,640 m for the real city (1771 x 1565 cells at 10 m).
- The city meta is `viewer/public/assets/real-city/meta.json`; `build_overlay.py` already patches it with `overlay_file`; the new `build_context.py` patches it the same way with `context_file`.
- `VERTICAL_EXAGGERATION = 3`, `WATER_LEVEL_M = 0.6`, `BAY_FLOOR_M = -3.0`, `MARSH_LEVEL_M = 0.5`, city `min_m = -3`. The sea floor plane sits at `(min_m - 0.5) * 3`.
- The orthographic camera uses near/far of -1e5/1e5, so the ring's tall hills need no depth change. `fitViewSize` and the default view must keep using the city only.
- Modules in `viewer/src/modules.ts` run in order, each awaited; `AppContext` is built in `main.ts`.
- CI runs `uv run pytest -q -W error` (warnings are errors) and `npx vitest run`, `npx tsc --noEmit`, `npm run build:site`.

## File structure

Pipeline:

| File | Change | Responsibility |
|---|---|---|
| `pipeline/yelamu/region.py` | modify | new optional `context` key (`ContextConfig`) |
| `pipeline/yelamu/context.py` | create | lattice, resample, water flatten, city-edge match, polygon hook, places, document, writer, orchestrator |
| `pipeline/scripts/build_context.py` | create | command line wrapper |
| `pipeline/data/overlay/context_places.json` | create | about 19 modern place labels |
| `pipeline/regions/full-city.json` | modify | the `context` block for the real city |
| `pipeline/tests/test_region.py` | modify | tests for the new key |
| `pipeline/tests/test_context.py` | create | unit and end-to-end tests |
| `pipeline/tests/test_context_shipped.py` | create | checks the committed assets agree with each other |
| `viewer/public/assets/real-city/context.json`, `context.u16`, `meta.json` | generated | the ring data |

Viewer:

| File | Change | Responsibility |
|---|---|---|
| `viewer/src/heightmap.ts` | modify | `context_file?` on `HeightmapMeta` |
| `viewer/src/context/types.ts` | create | `ContextDoc`, `ContextPlace` |
| `viewer/src/context/parse.ts` | create | strict validation, `loadContextDoc`, `loadContextHeights` |
| `viewer/src/context/colors.ts` | create | ring colour ramp |
| `viewer/src/context/geometry.ts` | create | tile plan, kept cells, tile geometry with skirts |
| `viewer/src/context/layer.ts` | create | `ContextLayer` (a group of tile meshes) |
| `viewer/src/context/limits.ts` | create | ring bounds and minimum zoom |
| `viewer/src/viewRig.ts` | modify | bounds centre offset, `getLimits`, `setLimits` |
| `viewer/src/appContext.ts` | modify | `ExtraPlace`, `extraPlaces` |
| `viewer/src/overlay/regionLabels.ts` | create | label visibility by zoom, search items for ring places |
| `viewer/src/overlay/types.ts`, `overlay/labels.ts` | modify | `"region"` landmark kind and label kind |
| `viewer/src/overlayModule.ts` | modify | show ring places as labels, search, Places list |
| `viewer/src/contextModule.ts` | create | the module |
| `viewer/src/modules.ts`, `main.ts` | modify | register the module; `extraPlaces`; bigger sea planes |
| `viewer/src/legendEntries.ts`, `ui/legend.ts`, `ui/about.ts` | modify | wording (owner gate) |
| `viewer/src/bench.ts` | modify | scenario E |

---

### Task 1: Amend the spec with the planning decisions

**Files:**
- Modify: `docs/superpowers/specs/2026-11-17-surrounding-terrain-design.md` (append a section)

- [ ] **Step 1: Append this section to the end of the spec**

```markdown

## Amendments made while planning (2026-11-17)

These refine the design above; where they differ, they win.

1. **Own file, not a meta block.** The ring is described by `context.json` and `context.u16`, discovered through a new `meta.json` key `context_file` (patched in by `scripts/build_context.py`, like `overlay_file`), and listed in `meta.layers` as the layer `context`. A city rebuild therefore never loses the ring description, and a dataset without the key simply has no ring.
2. **Vertex lattice with explicit hole indices.** `context.json` stores the lattice origin, spacings (`dx` 60 m, `dz` 59.92 m for the real city), vertex counts and the hole as integer cell indices (`i0, i1, j0, j1`), so the viewer needs no floating-point alignment test. The hole is the city mesh rectangle, 17,700 x 15,640 m.
3. **City-edge heights.** The ring's vertices on the hole boundary take the city heightmap's values (bilinear along the edge), so the two surfaces meet at the same height; skirts hide the small remaining gaps.
4. **Open water is flattened.** Ring vertices at or below 0.5 m become the bay floor (-3 m), so the ring's water shades like the city's bay.
5. **Outer skirt.** The ring is a slab: its outer edge also gets a skirt (down to the sea floor plane) so no cut edge shows daylight.
6. **Colour.** Land uses the existing "unmapped" ground colour (`GROUP_COLORS.unmapped`), up to 15 percent lighter with height; the Legend row for that colour already says "modern terrain shown for context". Water uses the water colour with the city's depth shading.
7. **Places ride the existing label, search and Places machinery** as landmarks of a new kind `region`, passed from the context module to the overlay module through `AppContext.extraPlaces`. They are labelled only at zoom 1.6 or less, and selecting one flies to zoom 1.2.
8. **Camera.** Near and far planes are already +-1e5, so no change. Pan bounds become a rectangle with a centre offset (the ring is not centred on the city), and the minimum zoom is computed from the ring's fit. The sea and sea-floor planes grow from 4x to 6x the city extent.
9. **Tiles** are 96 x 96 cells (about 63 tiles).
10. **Optional follow-ups chosen in the look-and-decide task:** a soft colour fade at the city edge, and a soft height knee for Mount Tamalpais.
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/paras/Documents/Ancient San Francisco"
git add docs/superpowers/specs/2026-11-17-surrounding-terrain-design.md
git commit -m "docs: amend the surrounding-terrain spec with the planning decisions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The `context` key in region files

**Files:**
- Modify: `pipeline/yelamu/region.py`
- Modify: `pipeline/tests/test_region.py` (append)

- [ ] **Step 1: Write the failing tests (append to `pipeline/tests/test_region.py`)**

```python
CONTEXT = {
    "bbox": [-122.6, 37.6, -122.3, 37.9],
    "cell_m": 60,
    "places": "data/overlay/context_places.json",
}


def test_context_is_optional(tmp_path):
    assert load_region(_write(tmp_path, MINIMAL)).context is None


def test_context_round_trip_resolves_paths_against_the_pipeline_dir(tmp_path):
    data = {**MINIMAL, "context": {**CONTEXT, "hand_bay": ["data/x/a.geojson"], "hand_marsh": []}}
    ctx = load_region(_write(tmp_path, data)).context
    base = tmp_path / "pipeline"
    assert ctx.bbox == (-122.6, 37.6, -122.3, 37.9)
    assert ctx.cell_m == 60.0 and isinstance(ctx.cell_m, float)
    assert ctx.places == base / "data/overlay/context_places.json"
    assert ctx.hand_bay == [base / "data/x/a.geojson"]
    assert ctx.hand_marsh == []


@pytest.mark.parametrize(
    "context, message",
    [
        ("nope", "context must be an object"),
        ({**CONTEXT, "colour": "grey"}, "unknown key(s): colour"),
        ({"cell_m": 60}, "missing required key bbox"),
        ({"bbox": CONTEXT["bbox"]}, "missing required key cell_m"),
        ({**CONTEXT, "bbox": [-122.6, 37.6, -122.3]}, "four numbers"),
        # not strictly outside the region bbox [-122.5, 37.7, -122.4, 37.8] on every side
        ({**CONTEXT, "bbox": [-122.5, 37.6, -122.3, 37.9]}, "strictly outside"),
        ({**CONTEXT, "bbox": [-122.6, 37.6, -122.3, 37.8]}, "strictly outside"),
        ({**CONTEXT, "cell_m": 5}, "at least the region cell_m"),
        ({**CONTEXT, "cell_m": True}, "at least the region cell_m"),
        ({**CONTEXT, "places": 3}, "non-empty path string"),
        ({**CONTEXT, "hand_bay": "a.geojson"}, "list of path strings"),
    ],
)
def test_context_rejects_bad_values(tmp_path, context, message):
    with pytest.raises(ValueError, match=message):
        load_region(_write(tmp_path, {**MINIMAL, "context": context}))
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd pipeline && uv run python -m pytest tests/test_region.py -q`
Expected: FAIL (`unknown key(s): context` or `Region has no attribute context`).

- [ ] **Step 3: Implement in `pipeline/yelamu/region.py`**

Change the `_KNOWN` line and add the constants and dataclass above `Region`:

```python
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
```

Add `context: ContextConfig | None = None` as the last field of `Region` (after `pond_bank_m`).

Add this function after `_is_number`:

```python
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
```

Note: `bool` is an `int`, but `_is_number` already rejects it, so `{"cell_m": true}` fails with the "at least the region cell_m" message.

In `load_region`, just before `return Region(**kwargs)` add:

```python
    if data.get("context") is not None:
        kwargs["context"] = _load_context(
            data["context"], resolve, fail, (west, south, east, north), float(cell_m)
        )
```

- [ ] **Step 4: Run to confirm pass**

Run: `cd pipeline && uv run python -m pytest tests/test_region.py -q -W error`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd "/Users/paras/Documents/Ancient San Francisco"
git add pipeline/yelamu/region.py pipeline/tests/test_region.py
git commit -m "feat(pipeline): optional context key in region files

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The ring's numbers: lattice, resample, water, city edge, polygons

**Files:**
- Create: `pipeline/yelamu/context.py` (first half)
- Create: `pipeline/tests/test_context.py`

- [ ] **Step 1: Write the failing tests (`pipeline/tests/test_context.py`)**

```python
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import box

from yelamu.context import (
    OPEN_WATER_M,
    apply_city_edge,
    apply_context_water,
    build_lattice,
    flatten_water,
    lattice_transform,
    resample_dem,
    sample_lattice,
)
from yelamu.geo import Grid
from yelamu.terrain import BAY_FLOOR_M, MARSH_LEVEL_M

CITY = Grid.from_lonlat_bbox(-122.53, 37.70, -122.33, 37.84, 500.0)  # a coarse stand-in city
RING = (-122.60, 37.58, -122.05, 37.93)
HW = (CITY.width - 1) * CITY.cell / 2
HD = (CITY.height - 1) * CITY.cell / 2


def _lattice(target=2000.0):
    return build_lattice(CITY, RING, target)


def test_hole_edges_land_exactly_on_lattice_lines():
    lat = _lattice()
    assert lat.x(lat.i0) == pytest.approx(-HW)
    assert lat.x(lat.i1) == pytest.approx(HW)
    assert lat.z(lat.j0) == pytest.approx(-HD)
    assert lat.z(lat.j1) == pytest.approx(HD)
    assert lat.i1 > lat.i0 and lat.j1 > lat.j0


def test_spacing_is_close_to_the_target_and_square_enough():
    lat = _lattice(2000.0)
    assert abs(lat.dx - 2000.0) < 300 and abs(lat.dz - 2000.0) < 300


def test_lattice_covers_the_ring_bbox():
    lat = _lattice()
    from yelamu.context import world_of_lonlat

    xs, zs = zip(*(world_of_lonlat(CITY, lon, lat_) for lon in (RING[0], RING[2]) for lat_ in (RING[1], RING[3])))
    assert lat.x(0) <= min(xs) and lat.x(lat.cols - 1) >= max(xs)
    assert lat.z(0) <= min(zs) and lat.z(lat.rows - 1) >= max(zs)


def test_ring_bbox_must_contain_the_city():
    with pytest.raises(ValueError, match="must contain the city"):
        build_lattice(CITY, (-122.50, 37.60, -122.05, 37.93), 2000.0)


def _write_utm_ramp(path):
    """A UTM DEM whose height is (E - 520000) / 100 metres: a plane rising to the east."""
    west, north, pixel, width, height = 520_000.0, 4_210_000.0, 100.0, 800, 600
    xs = west + (np.arange(width) + 0.5) * pixel
    data = np.tile(((xs - 520_000.0) / 100.0).astype("float32"), (height, 1))
    with rasterio.open(
        path, "w", driver="GTiff", height=height, width=width, count=1, dtype="float32",
        crs="EPSG:32610", transform=from_origin(west, north, pixel, pixel), nodata=-999999.0,
    ) as dst:
        dst.write(data, 1)


def test_resample_matches_a_plane(tmp_path):
    dem = tmp_path / "ramp.tif"
    _write_utm_ramp(dem)
    lat = _lattice()
    out = resample_dem(dem, CITY, lat)
    assert out.shape == (lat.rows, lat.cols)
    ec = (CITY.west + CITY.east) / 2
    for i, j in [(0, 0), (lat.cols - 1, 3), (lat.i0, lat.j0), (7, lat.rows - 1)]:
        expected = (ec + lat.x(i) - 520_000.0) / 100.0
        assert out[j, i] == pytest.approx(expected, abs=1.0)


def test_resample_refuses_missing_data(tmp_path):
    dem = tmp_path / "small.tif"
    with rasterio.open(
        dem, "w", driver="GTiff", height=10, width=10, count=1, dtype="float32",
        crs="EPSG:32610", transform=from_origin(540_000.0, 4_180_000.0, 100.0, 100.0), nodata=-999999.0,
    ) as dst:
        dst.write(np.zeros((10, 10), dtype="float32"), 1)
    with pytest.raises(ValueError, match="no elevation data"):
        resample_dem(dem, CITY, _lattice())


def test_flatten_water_sets_open_water_to_the_bay_floor():
    h = np.array([[-5.0, 0.0, OPEN_WATER_M, OPEN_WATER_M + 0.01, 12.0]], dtype="float32")
    out = flatten_water(h)
    assert out.tolist() == [[BAY_FLOOR_M, BAY_FLOOR_M, BAY_FLOOR_M, pytest.approx(OPEN_WATER_M + 0.01), 12.0]]
    assert h[0, 0] == -5.0  # the input is not modified


def test_city_edge_heights_are_copied_onto_the_hole_boundary_only():
    lat = _lattice()
    city = np.tile(np.arange(CITY.width, dtype="float64"), (CITY.height, 1))  # height = column index
    ring = np.zeros((lat.rows, lat.cols), dtype="float32")
    out = apply_city_edge(ring, lat, city, CITY.cell)
    assert out[lat.j0, lat.i0] == pytest.approx(0.0)  # west edge = column 0
    assert out[lat.j1, lat.i1] == pytest.approx(CITY.width - 1)  # east edge = last column
    assert out[lat.j0, lat.i0 + 1] > 0.0
    assert out[lat.j0 + 1, lat.i0 + 1] == 0.0  # interior untouched
    assert out[0, 0] == 0.0  # outside untouched
    assert ring.max() == 0.0  # the input is not modified


def test_water_polygons_set_bay_and_marsh_and_bay_wins():
    lat = _lattice()
    ec = (CITY.west + CITY.east) / 2
    nc = (CITY.north + CITY.south) / 2

    # Each box covers a few vertices: the marsh box columns 3..5, the bay box columns 5..7,
    # both rows 3..7 (so column 5 is covered by both).
    def utm_box(i0, i1):
        return box(
            ec + lat.x(i0) - lat.dx / 2 + 1, nc - lat.z(7) - lat.dz / 2 + 1,
            ec + lat.x(i1) + lat.dx / 2 - 1, nc - lat.z(3) + lat.dz / 2 - 1,
        )
    heights = np.full((lat.rows, lat.cols), 20.0, dtype="float32")
    out = apply_context_water(heights, CITY, lat, bay=[utm_box(5, 7)], marsh=[utm_box(3, 5)])
    assert out[5, 3] == pytest.approx(MARSH_LEVEL_M)  # marsh only
    assert out[5, 6] == pytest.approx(BAY_FLOOR_M)  # bay only
    assert out[5, 5] == pytest.approx(BAY_FLOOR_M)  # both: bay wins
    assert out[5, 9] == 20.0  # outside both
    assert heights[5, 3] == 20.0  # the input is not modified


def test_sample_lattice_is_bilinear():
    lat = _lattice()
    h = np.zeros((lat.rows, lat.cols), dtype="float64")
    h[4, 6] = 10.0
    h[4, 7] = 20.0
    assert sample_lattice(h, lat, lat.x(6), lat.z(4)) == pytest.approx(10.0)
    assert sample_lattice(h, lat, lat.x(6) + lat.dx / 2, lat.z(4)) == pytest.approx(15.0)
    # Outside the lattice clamps to the nearest edge vertex instead of failing.
    assert sample_lattice(h, lat, lat.x(0) - 1e6, lat.z(0) - 1e6) == pytest.approx(h[0, 0])


def test_lattice_transform_puts_pixel_centres_on_vertices():
    lat = _lattice()
    t = lattice_transform(CITY, lat)
    ec = (CITY.west + CITY.east) / 2
    nc = (CITY.north + CITY.south) / 2
    e, n = t * (4 + 0.5, 9 + 0.5)
    assert e == pytest.approx(ec + lat.x(4))
    assert n == pytest.approx(nc - lat.z(9))
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd pipeline && uv run python -m pytest tests/test_context.py -q`
Expected: FAIL (`ModuleNotFoundError: yelamu.context`).

- [ ] **Step 3: Implement the first half of `pipeline/yelamu/context.py`**

```python
"""The grey modern context ring around the 1769 map.

The ring is a coarse lattice of vertices (about 60 m apart) drawn by the viewer outside the
city mesh. Coordinates are the viewer's world metres (the same frame as overlay.py):

    x = E - (grid.west + grid.east) / 2        (+x is east)
    z = (grid.north + grid.south) / 2 - N      (+z is south)

The city mesh joins cell centres, so it covers x in [-hw, hw] and z in [-hd, hd] with
hw = (width - 1) * cell / 2 and hd = (height - 1) * cell / 2. The lattice is built so those
four lines are lattice lines: the "hole" (cells i0..i1-1 by j0..j1-1) is exactly the city
mesh, and ring vertices on the hole boundary take the city's own heights, so the two
surfaces meet. Spacing is slightly different east-west and north-south (60 m and 59.92 m
for the real city) because 15,640 is not a multiple of 60.

Heights are modern 3DEP, area-averaged onto the lattice; open water is flattened to the
bay floor. Optional hand-drawn bay and marsh polygons (later 1850s shore stages) are
burned in like the city does. Written as `context.json` + `context.u16`, and `meta.json`
gains `"context_file"` and a `context` layer:

    uv run python scripts/build_context.py --region regions/full-city.json
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.transform import Affine
from rasterio.warp import reproject
from shapely.geometry.base import BaseGeometry

from yelamu.export import CONFIDENCE_LEVELS, dequantize_heights, quantize_heights
from yelamu.geo import UTM_CRS, Grid, lonlat_to_utm
from yelamu.terrain import BAY_FLOOR_M, MARSH_LEVEL_M, WATER_LEVEL_M

CONTEXT_FILE = "context.json"
CONTEXT_HEIGHTS_FILE = "context.u16"
CONTEXT_VERSION = 1
# Ring vertices at or below this height (metres) are open water, like the city's rule.
OPEN_WATER_M = 0.5


@dataclass(frozen=True)
class Lattice:
    """Vertex (i, j) is at world (x0 + i * dx, z0 + j * dz); j = 0 is the north row."""

    x0: float
    z0: float
    dx: float
    dz: float
    cols: int  # vertices per row
    rows: int  # vertices per column
    i0: int  # the hole: cells i0..i1-1 by j0..j1-1 lie under the city mesh
    i1: int
    j0: int
    j1: int

    def x(self, i: float) -> float:
        return self.x0 + i * self.dx

    def z(self, j: float) -> float:
        return self.z0 + j * self.dz


def world_of_lonlat(grid: Grid, lon: float, lat: float) -> tuple[float, float]:
    """Viewer world metres of a lon/lat (same formula as overlay.lonlat_to_world)."""
    easting, northing = lonlat_to_utm(lon, lat)
    return (
        easting - (grid.west + grid.east) / 2.0,
        (grid.north + grid.south) / 2.0 - northing,
    )


def city_half_extent(grid: Grid) -> tuple[float, float]:
    """Half the city MESH extent (it joins cell centres): (hw, hd) in metres."""
    return (grid.width - 1) * grid.cell / 2.0, (grid.height - 1) * grid.cell / 2.0


def build_lattice(grid: Grid, bbox: tuple[float, float, float, float], target_m: float) -> Lattice:
    """The ring lattice for a lon/lat `bbox` around the city, spacing near `target_m`."""
    hw, hd = city_half_extent(grid)
    corners = [world_of_lonlat(grid, lon, lat) for lon in (bbox[0], bbox[2]) for lat in (bbox[1], bbox[3])]
    x_min, x_max = min(c[0] for c in corners), max(c[0] for c in corners)
    z_min, z_max = min(c[1] for c in corners), max(c[1] for c in corners)
    if not (x_min < -hw and x_max > hw and z_min < -hd and z_max > hd):
        raise ValueError(f"the ring bbox {list(bbox)} must contain the city map on every side")
    n = max(1, round(2 * hw / target_m))
    m = max(1, round(2 * hd / target_m))
    dx, dz = 2 * hw / n, 2 * hd / m
    left = math.ceil((-hw - x_min) / dx)
    right = math.ceil((x_max - hw) / dx)
    up = math.ceil((-hd - z_min) / dz)
    down = math.ceil((z_max - hd) / dz)
    return Lattice(
        x0=-hw - left * dx, z0=-hd - up * dz, dx=dx, dz=dz,
        cols=left + n + right + 1, rows=up + m + down + 1,
        i0=left, i1=left + n, j0=up, j1=up + m,
    )


def lattice_transform(grid: Grid, lat: Lattice) -> Affine:
    """Raster transform whose pixel CENTRES are the lattice vertices (pixel (r, c) = vertex (c, r))."""
    ec = (grid.west + grid.east) / 2.0
    nc = (grid.north + grid.south) / 2.0
    return Affine(lat.dx, 0.0, ec + lat.x0 - lat.dx / 2, 0.0, -lat.dz, nc - lat.z0 + lat.dz / 2)


def resample_dem(dem_path: Path, grid: Grid, lat: Lattice, nodata: float | None = None) -> np.ndarray:
    """Area-average the DEM onto the lattice. Raises ValueError if any vertex has no data."""
    dst = np.full((lat.rows, lat.cols), np.nan, dtype="float32")
    with rasterio.open(dem_path) as src:
        reproject(
            source=rasterio.band(src, 1),
            destination=dst,
            dst_transform=lattice_transform(grid, lat),
            dst_crs=UTM_CRS,
            resampling=Resampling.average,
            src_nodata=nodata if nodata is not None else src.nodata,
            dst_nodata=np.nan,
        )
    missing = int(np.isnan(dst).sum())
    if missing:
        raise ValueError(
            f"the DEM has no elevation data for {missing} of {dst.size} ring vertices; "
            "the ring bbox reaches beyond the DEM"
        )
    return dst


def flatten_water(heights: np.ndarray) -> np.ndarray:
    """Open water (at or below OPEN_WATER_M) becomes the bay floor. Returns a copy."""
    return np.where(heights <= OPEN_WATER_M, np.float32(BAY_FLOOR_M), heights).astype("float32")


def _sample_city(city: np.ndarray, cell: float, x: np.ndarray, z: np.ndarray) -> np.ndarray:
    """Bilinear city height at world (x, z); positions outside the city clamp to its edge."""
    h, w = city.shape
    col = np.clip(x / cell + (w - 1) / 2.0, 0, w - 1)
    row = np.clip(z / cell + (h - 1) / 2.0, 0, h - 1)
    c0 = np.minimum(np.floor(col).astype(int), w - 2)
    r0 = np.minimum(np.floor(row).astype(int), h - 2)
    fc, fr = col - c0, row - r0
    return (
        city[r0, c0] * (1 - fc) * (1 - fr) + city[r0, c0 + 1] * fc * (1 - fr)
        + city[r0 + 1, c0] * (1 - fc) * fr + city[r0 + 1, c0 + 1] * fc * fr
    )


def apply_city_edge(heights: np.ndarray, lat: Lattice, city: np.ndarray, cell: float) -> np.ndarray:
    """Copy the city's heights onto the ring vertices on the hole boundary. Returns a copy."""
    out = heights.copy()
    cols = np.arange(lat.i0, lat.i1 + 1)
    rows = np.arange(lat.j0, lat.j1 + 1)
    xs = lat.x0 + cols * lat.dx
    zs = lat.z0 + rows * lat.dz
    for j in (lat.j0, lat.j1):
        out[j, lat.i0 : lat.i1 + 1] = _sample_city(city, cell, xs, np.full_like(xs, lat.z(j)))
    for i in (lat.i0, lat.i1):
        out[lat.j0 : lat.j1 + 1, i] = _sample_city(city, cell, np.full_like(zs, lat.x(i)), zs)
    return out


def _burn(polygons: Sequence[BaseGeometry], grid: Grid, lat: Lattice) -> np.ndarray:
    if len(polygons) == 0:
        return np.zeros((lat.rows, lat.cols), dtype=bool)
    burned = rasterize(
        [(geom, 1) for geom in polygons],
        out_shape=(lat.rows, lat.cols),
        transform=lattice_transform(grid, lat),
        fill=0,
        dtype="uint8",
    )
    return burned.astype(bool)


def apply_context_water(
    heights: np.ndarray,
    grid: Grid,
    lat: Lattice,
    bay: Sequence[BaseGeometry] = (),
    marsh: Sequence[BaseGeometry] = (),
) -> np.ndarray:
    """Burn hand-drawn UTM polygons into the ring: marsh vertices to the marsh level, bay
    vertices to the bay floor; where both cover a vertex, bay wins. Returns a copy."""
    out = heights.copy()
    out[_burn(marsh, grid, lat)] = MARSH_LEVEL_M
    out[_burn(bay, grid, lat)] = BAY_FLOOR_M
    return out


def sample_lattice(heights: np.ndarray, lat: Lattice, x: float, z: float) -> float:
    """Bilinear ring height at world (x, z); positions outside clamp to the nearest edge."""
    col = min(max((x - lat.x0) / lat.dx, 0.0), lat.cols - 1.0)
    row = min(max((z - lat.z0) / lat.dz, 0.0), lat.rows - 1.0)
    c0 = min(int(math.floor(col)), lat.cols - 2)
    r0 = min(int(math.floor(row)), lat.rows - 2)
    fc, fr = col - c0, row - r0
    return float(
        heights[r0, c0] * (1 - fc) * (1 - fr) + heights[r0, c0 + 1] * fc * (1 - fr)
        + heights[r0 + 1, c0] * (1 - fc) * fr + heights[r0 + 1, c0 + 1] * fc * fr
    )
```

Note: the unused imports (`json`, `re`, `Path` beyond typing, `Any`, `CONFIDENCE_LEVELS`, `dequantize_heights`, `quantize_heights`, `MARSH_LEVEL_M` is used, `WATER_LEVEL_M`, constants) are used by Task 4's half of the file; Python does not mind, and Task 4 appends to this file.

- [ ] **Step 4: Run to confirm pass**

Run: `cd pipeline && uv run python -m pytest tests/test_context.py -q -W error`
Expected: all pass (13 tests).

- [ ] **Step 5: Commit**

```bash
cd "/Users/paras/Documents/Ancient San Francisco"
git add pipeline/yelamu/context.py pipeline/tests/test_context.py
git commit -m "feat(pipeline): ring lattice, resample, water flatten, city-edge match

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Places, the document, the writer and the build function

**Files:**
- Modify: `pipeline/yelamu/context.py` (append)
- Modify: `pipeline/tests/test_context.py` (append)

- [ ] **Step 1: Write the failing tests (append to `pipeline/tests/test_context.py`)**

```python
import json

from yelamu.context import (
    CONTEXT_FILE,
    CONTEXT_HEIGHTS_FILE,
    build_context,
    context_document,
    load_places,
    patch_meta,
)
from yelamu.export import Layer, dequantize_heights, write_assets
from yelamu.region import load_region


def _place(**over):
    base = {
        "id": "oakland", "name": "Oakland", "kind": "town",
        "lon": -122.27, "lat": 37.80, "source": "test source",
    }
    return {**base, **over}


def _places_file(tmp_path, items):
    path = tmp_path / "places.json"
    path.write_text(json.dumps(items))
    return path


def test_load_places_adds_world_coordinates(tmp_path):
    places = load_places(_places_file(tmp_path, [_place()]), RING, CITY)
    assert [p["id"] for p in places] == ["oakland"]
    p = places[0]
    assert p["x"] > HW  # east of the city map
    assert set(p) >= {"id", "name", "kind", "lon", "lat", "x", "z", "source"}


@pytest.mark.parametrize(
    "item, message",
    [
        (_place(id="Bad Id"), "id"),
        (_place(name="  "), "name"),
        (_place(name="x" * 121), "name"),
        (_place(kind="city"), "kind"),
        (_place(lon=-123.5), "outside the ring bbox"),
        (_place(lat="37.8"), "lat"),
        (_place(source=""), "source"),
    ],
)
def test_load_places_rejects_bad_items(tmp_path, item, message):
    with pytest.raises(ValueError, match=message):
        load_places(_places_file(tmp_path, [item]), RING, CITY)


def test_load_places_rejects_duplicate_and_taken_ids(tmp_path):
    with pytest.raises(ValueError, match="duplicate"):
        load_places(_places_file(tmp_path, [_place(), _place()]), RING, CITY)
    with pytest.raises(ValueError, match="already used"):
        load_places(_places_file(tmp_path, [_place()]), RING, CITY, taken_ids={"oakland"})


def test_patch_meta_adds_the_file_and_one_layer_and_is_idempotent(tmp_path):
    meta = tmp_path / "meta.json"
    meta.write_text(json.dumps({"layers": [{"id": "terrain"}, {"id": "context", "source": "old"}]}))
    layer = {"id": "context", "source": "new", "confidence": "illustrative", "attribution": "a"}
    patch_meta(meta, layer)
    patch_meta(meta, layer)
    data = json.loads(meta.read_text())
    assert data["context_file"] == CONTEXT_FILE
    assert [l["id"] for l in data["layers"]] == ["terrain", "context"]
    assert data["layers"][1]["source"] == "new"


def _mini_world(tmp_path):
    """A tiny city (500 m cells) already built into out/, a UTM ramp DEM, and a region file."""
    pipeline = tmp_path / "pipeline"
    (pipeline / "data" / "raw").mkdir(parents=True)
    _write_utm_ramp(pipeline / "data" / "raw" / "dem.tif")
    city = np.full((CITY.height, CITY.width), 7.0, dtype="float32")
    out = tmp_path / "out"
    write_assets(city, CITY, [Layer("terrain", "test", "inferred", "t")], out)
    (pipeline / "data" / "overlay").mkdir(parents=True)
    (pipeline / "data" / "overlay" / "p.json").write_text(json.dumps([_place()]))
    region = {
        "name": "mini", "bbox": [-122.53, 37.70, -122.33, 37.84], "cell_m": 500,
        "dem": "data/raw/dem.tif", "out": "../out",
        "context": {"bbox": list(RING), "cell_m": 2000, "places": "data/overlay/p.json"},
    }
    (pipeline / "regions").mkdir()
    path = pipeline / "regions" / "mini.json"
    path.write_text(json.dumps(region))
    return load_region(path), out


def test_build_context_writes_a_consistent_document_and_heights(tmp_path):
    region, out = _mini_world(tmp_path)
    doc = build_context(region)
    on_disk = json.loads((out / CONTEXT_FILE).read_text())
    assert on_disk == doc
    assert doc["version"] == 1 and doc["heights_format"] == "uint16-le"
    assert doc["layers"][0]["id"] == "context" and doc["layers"][0]["confidence"] == "illustrative"
    raw = np.fromfile(out / CONTEXT_HEIGHTS_FILE, dtype="<u2")
    assert raw.size == doc["cols"] * doc["rows"]
    heights = dequantize_heights(raw.reshape(doc["rows"], doc["cols"]), doc["min_m"], doc["max_m"])
    hole = doc["hole"]
    # The city's constant 7 m is copied onto the hole boundary (16-bit steps are far finer than 0.1 m).
    assert heights[hole["j0"], hole["i0"]] == pytest.approx(7.0, abs=0.1)
    assert heights[hole["j1"], hole["i1"]] == pytest.approx(7.0, abs=0.1)
    # The place got a ground height from the ring.
    assert doc["places"][0]["id"] == "oakland" and "ground_m" in doc["places"][0]
    meta = json.loads((out / "meta.json").read_text())
    assert meta["context_file"] == CONTEXT_FILE
    assert any(l["id"] == "context" for l in meta["layers"])


def test_build_context_needs_the_city_built_first(tmp_path):
    region, out = _mini_world(tmp_path)
    (out / "meta.json").unlink()
    with pytest.raises(FileNotFoundError, match="build the city first"):
        build_context(region)


def test_build_context_refuses_a_region_without_a_context_key(tmp_path):
    region, _ = _mini_world(tmp_path)
    from dataclasses import replace

    with pytest.raises(ValueError, match="no context key"):
        build_context(replace(region, context=None))


def test_context_document_rejects_a_bad_confidence():
    lat = _lattice()
    with pytest.raises(ValueError, match="confidence"):
        context_document(lat, np.zeros((lat.rows, lat.cols), dtype="float32"), 0.0, 1.0, [],
                         RING, {}, confidence="certain")
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd pipeline && uv run python -m pytest tests/test_context.py -q`
Expected: FAIL (`ImportError: cannot import name 'build_context'`).

- [ ] **Step 3: Append to `pipeline/yelamu/context.py`**

```python
# ------------------------------------------------------------------ places

PLACE_KINDS = ("town", "peak", "airport")
# keep in sync with viewer/src/context/parse.ts
MAX_PLACES = 200
MAX_NAME_CHARS = 120
MAX_SOURCE_CHARS = 300
_ID_RE = re.compile(r"[a-z0-9][a-z0-9-]*")


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def load_places(
    path: Path,
    bbox: tuple[float, float, float, float],
    grid: Grid,
    taken_ids: Sequence[str] | set[str] = (),
) -> list[dict]:
    """Read and validate the modern place labels; adds world x, z (metres, 1 decimal)."""
    path = Path(path)
    items = json.loads(path.read_text())
    if not isinstance(items, list):
        raise ValueError(f"{path}: must contain a JSON list")
    if len(items) > MAX_PLACES:
        raise ValueError(f"{path}: {len(items)} places is more than the limit of {MAX_PLACES}")
    seen: set[str] = set()
    taken = set(taken_ids)
    out: list[dict] = []
    for n, item in enumerate(items):
        label = f"{path}: place {n}"
        if not isinstance(item, dict):
            raise ValueError(f"{label}: must be an object")
        pid = item.get("id")
        if not isinstance(pid, str) or not _ID_RE.fullmatch(pid):
            raise ValueError(f"{label}: id must be lower-case letters, digits and hyphens, got {pid!r}")
        if pid in seen:
            raise ValueError(f"{label}: duplicate id {pid!r}")
        if pid in taken:
            raise ValueError(f"{label}: id {pid!r} is already used by an overlay landmark or hotspot")
        seen.add(pid)
        name = item.get("name")
        if not isinstance(name, str) or not name.strip() or len(name) > MAX_NAME_CHARS:
            raise ValueError(f"{label} ({pid}): name must be 1 to {MAX_NAME_CHARS} characters")
        if item.get("kind") not in PLACE_KINDS:
            raise ValueError(f"{label} ({pid}): kind must be one of {PLACE_KINDS}, got {item.get('kind')!r}")
        lon, lat = item.get("lon"), item.get("lat")
        if not (_is_number(lon) and _is_number(lat)):
            raise ValueError(f"{label} ({pid}): lon and lat must be numbers (lat={lat!r}, lon={lon!r})")
        west, south, east, north = bbox
        if not (west < lon < east and south < lat < north):
            raise ValueError(f"{label} ({pid}): ({lon}, {lat}) is outside the ring bbox {list(bbox)}")
        source = item.get("source")
        if not isinstance(source, str) or not source.strip() or len(source) > MAX_SOURCE_CHARS:
            raise ValueError(f"{label} ({pid}): source must be 1 to {MAX_SOURCE_CHARS} characters")
        x, z = world_of_lonlat(grid, lon, lat)
        out.append({
            "id": pid, "name": name.strip(), "kind": item["kind"],
            "lon": float(lon), "lat": float(lat), "x": round(x, 1), "z": round(z, 1),
            "source": source.strip(),
        })
    return out


# ------------------------------------------------------------------ document and files

LAYER_SOURCE = (
    "USGS 3DEP elevation data: modern terrain and shoreline, resampled to about {cell:g} m. "
    "Shown for orientation only; not a reconstruction of 1769."
)


def context_document(
    lat: Lattice,
    heights: np.ndarray,
    min_m: float,
    max_m: float,
    places: list[dict],
    bbox: tuple[float, float, float, float],
    processing: dict,
    confidence: str = "illustrative",
) -> dict:
    """The context.json content. `heights` is only used for its shape check."""
    if confidence not in CONFIDENCE_LEVELS:
        raise ValueError(f"confidence must be one of {CONFIDENCE_LEVELS}, got {confidence!r}")
    if heights.shape != (lat.rows, lat.cols):
        raise ValueError(f"heights shape {heights.shape} must be ({lat.rows}, {lat.cols})")
    return {
        "version": CONTEXT_VERSION,
        "crs": UTM_CRS,
        "heights_file": CONTEXT_HEIGHTS_FILE,
        "heights_format": "uint16-le",
        "cols": lat.cols,
        "rows": lat.rows,
        "x0": lat.x0,
        "z0": lat.z0,
        "dx": lat.dx,
        "dz": lat.dz,
        "hole": {"i0": lat.i0, "i1": lat.i1, "j0": lat.j0, "j1": lat.j1},
        "min_m": min_m,
        "max_m": max_m,
        "water_level_m": WATER_LEVEL_M,
        "bay_floor_m": BAY_FLOOR_M,
        "bbox": list(bbox),
        "layers": [{
            "id": "context",
            "source": LAYER_SOURCE.format(cell=round((lat.dx + lat.dz) / 2)),
            "confidence": confidence,
            "attribution": "USGS 3DEP; this project",
        }],
        "places": places,
        "processing": processing,
    }


def write_context(out_dir: Path, heights: np.ndarray, doc: dict) -> None:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    quantize_heights(heights, doc["min_m"], doc["max_m"]).astype("<u2").tofile(out_dir / CONTEXT_HEIGHTS_FILE)
    (out_dir / CONTEXT_FILE).write_text(json.dumps(doc, indent=1))


def patch_meta(meta_path: Path, layer: dict) -> None:
    """Add `context_file` and the context layer (replacing any older one) to meta.json."""
    meta_path = Path(meta_path)
    meta = json.loads(meta_path.read_text())
    meta["context_file"] = CONTEXT_FILE
    meta["layers"] = [l for l in meta.get("layers", []) if l.get("id") != layer["id"]] + [layer]
    meta_path.write_text(json.dumps(meta, indent=2))


def _overlay_ids(out_dir: Path) -> set[str]:
    path = Path(out_dir) / "overlay.json"
    if not path.exists():
        return set()
    overlay = json.loads(path.read_text())
    return {p["id"] for key in ("landmarks", "hotspots") for p in overlay.get(key, [])}


def build_context(region) -> dict:
    """Build the ring for `region` (needs its context key and the city already built in region.out)."""
    from yelamu.sources import load_features  # imported here: pulls in shapely/pyproj readers

    cfg = region.context
    if cfg is None:
        raise ValueError(f"region {region.name!r} has no context key")
    out = Path(region.out)
    meta_path = out / "meta.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"{meta_path} not found: build the city first (yelamu.cli --region ...)")
    meta = json.loads(meta_path.read_text())
    grid = Grid.from_lonlat_bbox(*region.bbox, cell=region.cell_m)
    if (meta["width"], meta["height"]) != (grid.width, grid.height) or not math.isclose(
        meta["west"], grid.west, abs_tol=1e-3
    ):
        raise ValueError(
            f"{meta_path} does not match the region's grid; rebuild the city, then the ring"
        )
    raw = np.fromfile(out / meta["heights_file"], dtype="<u2")
    if raw.size != grid.width * grid.height:
        raise ValueError(f"{out / meta['heights_file']} has {raw.size} values, expected {grid.width * grid.height}")
    city = dequantize_heights(raw.reshape(grid.height, grid.width), meta["min_m"], meta["max_m"])

    lat = build_lattice(grid, cfg.bbox, cfg.cell_m)
    heights = flatten_water(resample_dem(region.dem, grid, lat))
    bay = [f.geometry for p in cfg.hand_bay for f in load_features(p, allow_empty=True, require_provenance=True)]
    marsh = [f.geometry for p in cfg.hand_marsh for f in load_features(p, allow_empty=True, require_provenance=True)]
    heights = apply_context_water(heights, grid, lat, bay, marsh)
    heights = apply_city_edge(heights, lat, city.astype("float64"), grid.cell)

    places = load_places(cfg.places, cfg.bbox, grid, _overlay_ids(out)) if cfg.places else []
    for p in places:
        p["ground_m"] = round(sample_lattice(heights, lat, p["x"], p["z"]), 1)
    min_m = float(math.floor(heights.min()))
    max_m = float(math.ceil(heights.max()))
    if max_m <= min_m:
        max_m = min_m + 1.0
    processing = {
        "cell_target_m": cfg.cell_m, "dx_m": round(lat.dx, 3), "dz_m": round(lat.dz, 3),
        "resampling": "average", "open_water_max_m": OPEN_WATER_M, "bay_floor_m": BAY_FLOOR_M,
        "hand_bay_files": [Path(p).name for p in cfg.hand_bay],
        "hand_marsh_files": [Path(p).name for p in cfg.hand_marsh],
    }
    doc = context_document(lat, heights, min_m, max_m, places, cfg.bbox, processing)
    write_context(out, heights, doc)
    patch_meta(meta_path, doc["layers"][0])
    return doc
```

- [ ] **Step 4: Run to confirm pass**

Run: `cd pipeline && uv run python -m pytest tests/test_context.py -q -W error`
Expected: all pass. If a `-W error` warning appears from rasterio, fix its cause (do not relax the flag).

- [ ] **Step 5: Commit**

```bash
cd "/Users/paras/Documents/Ancient San Francisco"
git add pipeline/yelamu/context.py pipeline/tests/test_context.py
git commit -m "feat(pipeline): ring places, document, writer and build_context

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The command, the real place list, build the real ring, shipped-data test

**Files:**
- Create: `pipeline/scripts/build_context.py`
- Create: `pipeline/data/overlay/context_places.json`
- Modify: `pipeline/regions/full-city.json`
- Create: `pipeline/tests/test_context_shipped.py`
- Generated: `viewer/public/assets/real-city/{context.json,context.u16,meta.json}`

- [ ] **Step 1: Create `pipeline/scripts/build_context.py`**

```python
"""Build the grey context ring around the city map. Run after the city build and build_overlay.

    uv run python scripts/build_context.py --region regions/full-city.json
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Sequence

from yelamu.context import build_context
from yelamu.region import load_region


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region", type=Path, required=True, help="region JSON with a context key")
    args = parser.parse_args(argv)
    try:
        doc = build_context(load_region(args.region))
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    hole = doc["hole"]
    print(
        f"ring: {doc['cols']} x {doc['rows']} vertices, spacing {doc['dx']:.2f} x {doc['dz']:.2f} m, "
        f"hole cells {hole['i0']}..{hole['i1']} x {hole['j0']}..{hole['j1']}, "
        f"heights {doc['min_m']:.0f}..{doc['max_m']:.0f} m, {len(doc['places'])} places"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Add the `context` block to `pipeline/regions/full-city.json`**

Add this key after `"landforms"` / `"checks"` (before `"out"`); keep the file valid JSON:

```json
  "context": {
    "bbox": [-122.60, 37.58, -122.05, 37.93],
    "cell_m": 60,
    "places": "data/overlay/context_places.json"
  },
```

- [ ] **Step 3: Create `pipeline/data/overlay/context_places.json`**

These positions are approximate town-centre coordinates written from memory. **Step 4 verifies every one before anything is built.**

```json
[
  {"id": "oakland", "name": "Oakland", "kind": "town", "lon": -122.2711, "lat": 37.8044, "source": "Approximate town-centre position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "berkeley", "name": "Berkeley", "kind": "town", "lon": -122.2727, "lat": 37.8716, "source": "Approximate town-centre position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "emeryville", "name": "Emeryville", "kind": "town", "lon": -122.2852, "lat": 37.8313, "source": "Approximate town-centre position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "alameda", "name": "Alameda", "kind": "town", "lon": -122.2416, "lat": 37.7652, "source": "Approximate town-centre position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "san-leandro", "name": "San Leandro", "kind": "town", "lon": -122.1561, "lat": 37.7249, "source": "Approximate town-centre position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "hayward", "name": "Hayward", "kind": "town", "lon": -122.0808, "lat": 37.6688, "source": "Approximate town-centre position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "sausalito", "name": "Sausalito", "kind": "town", "lon": -122.4853, "lat": 37.8590, "source": "Approximate town-centre position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "tiburon", "name": "Tiburon", "kind": "town", "lon": -122.4575, "lat": 37.8735, "source": "Approximate town-centre position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "angel-island", "name": "Angel Island", "kind": "town", "lon": -122.4313, "lat": 37.8607, "source": "Approximate island-centre position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "mill-valley", "name": "Mill Valley", "kind": "town", "lon": -122.5450, "lat": 37.9060, "source": "Approximate town-centre position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "mount-tamalpais", "name": "Mount Tamalpais", "kind": "peak", "lon": -122.5960, "lat": 37.9230, "source": "Approximate summit position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "daly-city", "name": "Daly City", "kind": "town", "lon": -122.4702, "lat": 37.6879, "source": "Approximate town-centre position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "brisbane", "name": "Brisbane", "kind": "town", "lon": -122.3999, "lat": 37.6808, "source": "Approximate town-centre position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "south-san-francisco", "name": "South San Francisco", "kind": "town", "lon": -122.4077, "lat": 37.6547, "source": "Approximate town-centre position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "san-bruno", "name": "San Bruno", "kind": "town", "lon": -122.4111, "lat": 37.6305, "source": "Approximate town-centre position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "sfo", "name": "San Francisco International Airport", "kind": "airport", "lon": -122.3790, "lat": 37.6213, "source": "Approximate airport position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "millbrae", "name": "Millbrae", "kind": "town", "lon": -122.3872, "lat": 37.5985, "source": "Approximate town-centre position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "pacifica", "name": "Pacifica", "kind": "town", "lon": -122.4869, "lat": 37.6138, "source": "Approximate town-centre position (Wikipedia infobox / USGS GNIS); within about 500 m"},
  {"id": "linda-mar", "name": "Linda Mar", "kind": "town", "lon": -122.4948, "lat": 37.5925, "source": "Approximate neighbourhood position (Wikipedia infobox / USGS GNIS); within about 500 m"}
]
```

- [ ] **Step 4: Verify every coordinate against a public source (required, not optional)**

For each of the 19 places, open its Wikipedia page or its USGS GNIS record (use the Firecrawl search/scrape tools or WebFetch), read the published coordinates, and compare with the file. Any difference over 500 m: correct `lon`/`lat` in the file. Also confirm each name is spelled as the source spells it. Keep the `source` strings as written; they are now true. Record a one-line result per place in your task report. Check that every place lies inside the ring bbox `[-122.60, 37.58, -122.05, 37.93]` (the build refuses one that does not).

- [ ] **Step 5: Build the real ring**

Run:

```bash
cd "/Users/paras/Documents/Ancient San Francisco/pipeline"
uv run python scripts/build_context.py --region regions/full-city.json
```

Expected: one line like `ring: 808 x 650 vertices, spacing 60.00 x 59.92 m, hole cells ... heights -3..78x m, 19 places` (the counts may differ by a few). `viewer/public/assets/real-city/context.u16` is about 1.0 MB. If it prints `error: ... beyond the DEM`, the ring bbox is outside `data/raw/dem.tif` (lon -123..-122, lat 37..38): fix the bbox.

- [ ] **Step 6: Write the shipped-data test (`pipeline/tests/test_context_shipped.py`)**

```python
"""The committed ring assets agree with each other and with the city."""

import json
from pathlib import Path

import pytest

PIPELINE = Path(__file__).resolve().parent.parent
ASSETS = PIPELINE.parent / "viewer" / "public" / "assets" / "real-city"


def _load(name):
    return json.loads((ASSETS / name).read_text())


def test_context_files_are_present_and_consistent():
    meta = _load("meta.json")
    doc = _load("context.json")
    assert meta["context_file"] == "context.json"
    assert [l for l in meta["layers"] if l["id"] == "context"] == doc["layers"]
    assert doc["layers"][0]["confidence"] == "illustrative"
    size = (ASSETS / doc["heights_file"]).stat().st_size
    assert size == doc["cols"] * doc["rows"] * 2


def test_the_hole_is_exactly_the_city_mesh():
    meta = _load("meta.json")
    doc = _load("context.json")
    hw = (meta["width"] - 1) * meta["cell_m"] / 2
    hd = (meta["height"] - 1) * meta["cell_m"] / 2
    h = doc["hole"]
    assert doc["x0"] + h["i0"] * doc["dx"] == pytest.approx(-hw)
    assert doc["x0"] + h["i1"] * doc["dx"] == pytest.approx(hw)
    assert doc["z0"] + h["j0"] * doc["dz"] == pytest.approx(-hd)
    assert doc["z0"] + h["j1"] * doc["dz"] == pytest.approx(hd)


def test_places_are_valid_and_do_not_collide_with_overlay_ids():
    doc = _load("context.json")
    overlay = _load("overlay.json")
    taken = {p["id"] for key in ("landmarks", "hotspots") for p in overlay[key]}
    ids = [p["id"] for p in doc["places"]]
    assert len(ids) == len(set(ids)) >= 15
    assert not set(ids) & taken
    west, south, east, north = doc["bbox"]
    for p in doc["places"]:
        assert west < p["lon"] < east and south < p["lat"] < north
        assert -50 < p["ground_m"] < 900


def test_the_region_file_points_at_the_context_places():
    from yelamu.region import load_region

    region = load_region(PIPELINE / "regions" / "full-city.json")
    assert region.context is not None
    assert region.context.cell_m == 60.0
    assert region.context.places.name == "context_places.json"
```

- [ ] **Step 7: Run the whole pipeline suite the way CI does**

Run: `cd pipeline && uv run python -m pytest -q -W error`
Expected: all pass (the previous 617 plus the new ones; the 5 Pillow tests are skipped as before).

- [ ] **Step 8: Commit**

```bash
cd "/Users/paras/Documents/Ancient San Francisco"
git add pipeline/scripts/build_context.py pipeline/data/overlay/context_places.json pipeline/regions/full-city.json pipeline/tests/test_context_shipped.py viewer/public/assets/real-city/context.json viewer/public/assets/real-city/context.u16 viewer/public/assets/real-city/meta.json
git commit -m "feat: build the grey context ring for the real city (60 m, 19 places)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Viewer types, validation and loading

**Files:**
- Modify: `viewer/src/heightmap.ts`
- Create: `viewer/src/context/types.ts`, `viewer/src/context/parse.ts`
- Create: `viewer/src/context/parse.test.ts`

- [ ] **Step 1: Add `context_file` to `HeightmapMeta` in `viewer/src/heightmap.ts`** (after `ponds_file`)

```ts
  /** File name of the grey surrounding terrain description next to the heightmap. */
  context_file?: string;
```

- [ ] **Step 2: Create `viewer/src/context/types.ts`**

```ts
import type { LayerInfo } from "../heightmap";

/** One modern place label in the ring. x, z are world metres in the viewer frame. */
export interface ContextPlace {
  id: string;
  name: string;
  kind: string;
  lon: number;
  lat: number;
  x: number;
  z: number;
  ground_m: number;
}

/**
 * context.json: a lattice of vertices at world (x0 + i * dx, z0 + j * dz), j = 0 the north row,
 * heights in a raw little-endian uint16 file (row-major). The hole is the city mesh: cells
 * i0..i1-1 by j0..j1-1 are not drawn. Written by pipeline/yelamu/context.py.
 */
export interface ContextDoc {
  version: 1;
  heights_file: string;
  cols: number;
  rows: number;
  x0: number;
  z0: number;
  dx: number;
  dz: number;
  hole: { i0: number; i1: number; j0: number; j1: number };
  min_m: number;
  max_m: number;
  water_level_m: number;
  bay_floor_m: number;
  layers: LayerInfo[];
  places: ContextPlace[];
}
```

- [ ] **Step 3: Write the failing test `viewer/src/context/parse.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { loadContextDoc, loadContextHeights, parseContext, MAX_PLACES } from "./parse";

const valid = () => ({
  version: 1,
  heights_file: "context.u16",
  heights_format: "uint16-le",
  cols: 6,
  rows: 5,
  x0: -300,
  z0: -200,
  dx: 100,
  dz: 100,
  hole: { i0: 2, i1: 4, j0: 1, j1: 3 },
  min_m: -3,
  max_m: 97,
  water_level_m: 0.6,
  bay_floor_m: -3,
  layers: [{ id: "context", source: "s", confidence: "illustrative", attribution: "a" }],
  places: [{ id: "oakland", name: "Oakland", kind: "town", lon: -122.27, lat: 37.8, x: 10, z: 20, ground_m: 12.5, source: "x" }],
});

describe("parseContext", () => {
  it("accepts a valid document and keeps only the known fields", () => {
    const doc = parseContext({ ...valid(), extra: 1 });
    expect(doc.cols).toBe(6);
    expect(doc.hole).toEqual({ i0: 2, i1: 4, j0: 1, j1: 3 });
    expect(doc.places[0]).toEqual({ id: "oakland", name: "Oakland", kind: "town", lon: -122.27, lat: 37.8, x: 10, z: 20, ground_m: 12.5 });
    expect("extra" in doc).toBe(false);
  });

  it.each([
    ["not an object", 5],
    ["a wrong version", { ...valid(), version: 2 }],
    ["a non-finite number", { ...valid(), dx: Number.NaN }],
    ["a non-positive spacing", { ...valid(), dz: 0 }],
    ["too few vertices", { ...valid(), cols: 1 }],
    ["too many vertices", { ...valid(), cols: 4001 }],
    ["a hole outside the lattice", { ...valid(), hole: { i0: 2, i1: 7, j0: 1, j1: 3 } }],
    ["an empty hole", { ...valid(), hole: { i0: 2, i1: 2, j0: 1, j1: 3 } }],
    ["a height range that is not increasing", { ...valid(), min_m: 5, max_m: 5 }],
    ["an unsupported heights format", { ...valid(), heights_format: "float32" }],
    ["a heights file with a path", { ...valid(), heights_file: "../x.u16" }],
    ["a bad place id", { ...valid(), places: [{ ...valid().places[0], id: "Bad Id" }] }],
    ["a duplicate place id", { ...valid(), places: [valid().places[0], valid().places[0]] }],
    ["a place with no name", { ...valid(), places: [{ ...valid().places[0], name: " " }] }],
    ["a place far outside", { ...valid(), places: [{ ...valid().places[0], x: 1e9 }] }],
    ["too many places", { ...valid(), places: Array.from({ length: MAX_PLACES + 1 }, (_, i) => ({ ...valid().places[0], id: `p${i}` })) }],
  ])("rejects %s", (_name, raw) => {
    expect(() => parseContext(raw)).toThrow(/context:/);
  });
});

const fakeFetch = (routes: Record<string, { status?: number; json?: unknown; bytes?: ArrayBuffer }>) =>
  (async (url: string) => {
    const r = routes[url];
    if (!r) return { ok: false, status: 404 } as Response;
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => r.json,
      arrayBuffer: async () => r.bytes,
    } as unknown as Response;
  }) as unknown as typeof fetch;

describe("loadContextDoc", () => {
  it("returns null when the dataset has no context_file", async () => {
    expect(await loadContextDoc("/a", {}, fakeFetch({}))).toBeNull();
  });

  it("fetches and parses the document next to the heightmap", async () => {
    const f = fakeFetch({ "/a/context.json": { json: valid() } });
    const doc = await loadContextDoc("/a", { context_file: "context.json" }, f);
    expect(doc?.rows).toBe(5);
  });

  it("throws on an HTTP error, so the module can warn and carry on", async () => {
    await expect(loadContextDoc("/a", { context_file: "context.json" }, fakeFetch({}))).rejects.toThrow(/HTTP 404/);
  });

  it("refuses a context_file with a path", async () => {
    await expect(loadContextDoc("/a", { context_file: "../x.json" }, fakeFetch({}))).rejects.toThrow(/context_file/);
  });
});

describe("loadContextHeights", () => {
  it("decodes little-endian uint16 into metres over min_m..max_m", async () => {
    const doc = parseContext({ ...valid(), cols: 2, rows: 2, hole: { i0: 0, i1: 1, j0: 0, j1: 1 }, min_m: 0, max_m: 65535 });
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    [0, 1, 256, 65535].forEach((v, i) => view.setUint16(i * 2, v, true));
    const heights = await loadContextHeights("/a", doc, fakeFetch({ "/a/context.u16": { bytes: buf } }));
    expect(Array.from(heights)).toEqual([0, 1, 256, 65535]);
  });

  it("throws when the file size is wrong", async () => {
    const doc = parseContext({ ...valid(), cols: 2, rows: 2, hole: { i0: 0, i1: 1, j0: 0, j1: 1 } });
    await expect(loadContextHeights("/a", doc, fakeFetch({ "/a/context.u16": { bytes: new ArrayBuffer(6) } }))).rejects.toThrow(/expected 8 bytes/);
  });
});
```

- [ ] **Step 2b: Run to confirm failure**

Run: `cd viewer && npx vitest run src/context/parse.test.ts`
Expected: FAIL (cannot find `./parse`).

- [ ] **Step 4: Create `viewer/src/context/parse.ts`**

```ts
import { decodeHeights, type HeightmapMeta, type LayerInfo } from "../heightmap";
import { CONFIDENCES } from "../overlay/types";
import type { ContextDoc, ContextPlace } from "./types";

/**
 * Protective caps. KEEP IN SYNC with pipeline/yelamu/context.py (MAX_PLACES, MAX_NAME_CHARS):
 * the pipeline refuses to write what this parser would reject.
 */
export const MAX_PLACES = 200;
export const MAX_NAME_CHARS = 120;
export const MAX_AXIS_VERTICES = 4000;
export const MAX_VERTICES = 4_000_000;
export const MAX_COORD_M = 1e6;
const ID = /^[a-z0-9][a-z0-9-]*$/;
const FILE = /^[A-Za-z0-9._-]+$/;

function fail(what: string): never {
  throw new Error(`context: ${what}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${what} must be a finite number`);
  return v;
}

function positive(v: unknown, what: string): number {
  const n = num(v, what);
  if (!(n > 0)) fail(`${what} must be greater than 0`);
  return n;
}

function int(v: unknown, what: string): number {
  const n = num(v, what);
  if (!Number.isInteger(n)) fail(`${what} must be an integer`);
  return n;
}

function coord(v: unknown, what: string): number {
  const n = num(v, what);
  if (Math.abs(n) > MAX_COORD_M) fail(`${what} is out of range (within ±1e6 metres), got ${n}`);
  return n;
}

function str(v: unknown, what: string, max: number): string {
  if (typeof v !== "string" || v.trim() === "" || v.length > max) fail(`${what} must be 1 to ${max} characters`);
  return v.trim();
}

function parseLayers(v: unknown): LayerInfo[] {
  if (!Array.isArray(v)) fail("layers must be an array");
  return v.map((l: unknown, i) => {
    if (!isRecord(l)) fail(`layers[${i}] must be an object`);
    const confidence = l.confidence;
    if (typeof confidence !== "string" || !(CONFIDENCES as readonly string[]).includes(confidence)) {
      fail(`layers[${i}].confidence must be one of ${CONFIDENCES.join(", ")}`);
    }
    return {
      id: str(l.id, `layers[${i}].id`, 60),
      source: str(l.source, `layers[${i}].source`, 600),
      confidence: confidence as LayerInfo["confidence"],
      attribution: str(l.attribution, `layers[${i}].attribution`, 300),
    };
  });
}

function parsePlaces(v: unknown): ContextPlace[] {
  if (!Array.isArray(v)) fail("places must be an array");
  if (v.length > MAX_PLACES) fail(`places has ${v.length} entries, more than the limit of ${MAX_PLACES}`);
  const seen = new Set<string>();
  return v.map((p: unknown, i) => {
    if (!isRecord(p)) fail(`places[${i}] must be an object`);
    const id = p.id;
    if (typeof id !== "string" || !ID.test(id)) fail(`places[${i}].id must be lower-case letters, digits and hyphens`);
    if (seen.has(id)) fail(`places[${i}]: duplicate id "${id}"`);
    seen.add(id);
    return {
      id,
      name: str(p.name, `places[${i}] (${id}) name`, MAX_NAME_CHARS),
      kind: str(p.kind, `places[${i}] (${id}) kind`, 30),
      lon: num(p.lon, `places[${i}] (${id}) lon`),
      lat: num(p.lat, `places[${i}] (${id}) lat`),
      x: coord(p.x, `places[${i}] (${id}) x`),
      z: coord(p.z, `places[${i}] (${id}) z`),
      ground_m: num(p.ground_m, `places[${i}] (${id}) ground_m`),
    };
  });
}

/** Validate untrusted context.json and return a clean copy. Throws an Error starting "context:". */
export function parseContext(raw: unknown): ContextDoc {
  if (!isRecord(raw)) fail("the file must be a JSON object");
  if (raw.version !== 1) fail(`unsupported version ${JSON.stringify(raw.version)} (expected 1)`);
  if (raw.heights_format !== "uint16-le") fail(`unsupported heights_format ${JSON.stringify(raw.heights_format)}`);
  if (typeof raw.heights_file !== "string" || !FILE.test(raw.heights_file)) fail("heights_file must be a plain file name");
  const cols = int(raw.cols, "cols");
  const rows = int(raw.rows, "rows");
  if (cols < 2 || rows < 2) fail("cols and rows must be at least 2");
  if (cols > MAX_AXIS_VERTICES || rows > MAX_AXIS_VERTICES || cols * rows > MAX_VERTICES) {
    fail(`${cols} x ${rows} vertices is more than the limit`);
  }
  if (!isRecord(raw.hole)) fail("hole must be an object");
  const hole = {
    i0: int(raw.hole.i0, "hole.i0"),
    i1: int(raw.hole.i1, "hole.i1"),
    j0: int(raw.hole.j0, "hole.j0"),
    j1: int(raw.hole.j1, "hole.j1"),
  };
  if (!(0 <= hole.i0 && hole.i0 < hole.i1 && hole.i1 <= cols - 1 && 0 <= hole.j0 && hole.j0 < hole.j1 && hole.j1 <= rows - 1)) {
    fail("the hole must be a non-empty range of cells inside the lattice");
  }
  const min_m = num(raw.min_m, "min_m");
  const max_m = num(raw.max_m, "max_m");
  if (!(max_m > min_m)) fail("max_m must be greater than min_m");
  return {
    version: 1,
    heights_file: raw.heights_file,
    cols,
    rows,
    x0: coord(raw.x0, "x0"),
    z0: coord(raw.z0, "z0"),
    dx: positive(raw.dx, "dx"),
    dz: positive(raw.dz, "dz"),
    hole,
    min_m,
    max_m,
    water_level_m: num(raw.water_level_m, "water_level_m"),
    bay_floor_m: num(raw.bay_floor_m, "bay_floor_m"),
    layers: parseLayers(raw.layers),
    places: parsePlaces(raw.places),
  };
}

async function fetchChecked(url: string, fetchFn: typeof fetch): Promise<Response> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: HTTP ${res.status}`);
  return res;
}

/** The ring description, or null when the dataset has none. Throws on a fetch or validation failure. */
export async function loadContextDoc(
  baseUrl: string,
  meta: Pick<HeightmapMeta, "context_file">,
  fetchFn: typeof fetch = fetch,
): Promise<ContextDoc | null> {
  if (!meta.context_file) return null;
  if (!FILE.test(meta.context_file)) throw new Error("context: context_file must be a plain file name");
  const res = await fetchChecked(`${baseUrl}/${meta.context_file}`, fetchFn);
  return parseContext(await res.json());
}

/** Ring heights in metres, row-major, row 0 = north (the lattice layout of ContextDoc). */
export async function loadContextHeights(
  baseUrl: string,
  doc: ContextDoc,
  fetchFn: typeof fetch = fetch,
): Promise<Float32Array> {
  const url = `${baseUrl}/${doc.heights_file}`;
  const buffer = await (await fetchChecked(url, fetchFn)).arrayBuffer();
  const count = doc.cols * doc.rows;
  if (buffer.byteLength !== count * 2) {
    throw new Error(`${url}: expected ${count * 2} bytes for ${doc.cols}x${doc.rows}, got ${buffer.byteLength}`);
  }
  const view = new DataView(buffer);
  const q = new Uint16Array(count);
  for (let i = 0; i < count; i++) q[i] = view.getUint16(i * 2, true);
  return decodeHeights(q, { width: doc.cols, height: doc.rows, min_m: doc.min_m, max_m: doc.max_m });
}
```

- [ ] **Step 5: Run to confirm pass**

Run: `cd viewer && npx vitest run src/context/parse.test.ts && npx tsc --noEmit`
Expected: all pass; no type errors.

- [ ] **Step 5b: Pin the shared limits with a pipeline test (the ponds code does the same)**

Append to `pipeline/tests/test_context.py` (add `import re` and `from pathlib import Path` to its imports):

```python
def test_limits_match_the_viewer_parser():
    from yelamu import context as ctxmod

    ts = (Path(__file__).resolve().parents[2] / "viewer" / "src" / "context" / "parse.ts").read_text()
    for name in ("MAX_PLACES", "MAX_NAME_CHARS"):
        found = re.search(rf"export const {name} = (\d+);", ts)
        assert found, f"{name} not found in viewer/src/context/parse.ts"
        assert int(found.group(1)) == getattr(ctxmod, name)
```

Run: `cd pipeline && uv run python -m pytest tests/test_context.py -q -W error`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
cd "/Users/paras/Documents/Ancient San Francisco"
git add viewer/src/heightmap.ts viewer/src/context/types.ts viewer/src/context/parse.ts viewer/src/context/parse.test.ts pipeline/tests/test_context.py
git commit -m "feat(viewer): context.json types, validation and loaders

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Ring colours and tile geometry

**Files:**
- Create: `viewer/src/context/colors.ts`, `viewer/src/context/geometry.ts`, `viewer/src/context/layer.ts`
- Create: `viewer/src/context/colors.test.ts`, `viewer/src/context/geometry.test.ts`

- [ ] **Step 1: Write the failing colour test (`colors.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { GROUP_COLORS, shadeByDepth, srgbToLinear } from "../habitat";
import { LIGHTEN_MAX, LIGHTEN_TOP_M, makeRingColorAt } from "./colors";

const lin = (hex: number): [number, number, number] => [
  srgbToLinear(((hex >> 16) & 255) / 255),
  srgbToLinear(((hex >> 8) & 255) / 255),
  srgbToLinear((hex & 255) / 255),
];

describe("makeRingColorAt", () => {
  const colorAt = makeRingColorAt(0.6, 6);

  it("uses the unmapped ground colour on low land", () => {
    const base = lin(GROUP_COLORS.unmapped);
    const c = colorAt(0.6 + 0.001);
    base.forEach((v, i) => expect(c[i]).toBeCloseTo(v, 3));
  });

  it("lightens with height, up to the maximum, and never past 1", () => {
    const base = lin(GROUP_COLORS.unmapped);
    const top = colorAt(0.6 + LIGHTEN_TOP_M * 3);
    base.forEach((v, i) => expect(top[i]).toBeCloseTo(Math.min(1, v * (1 + LIGHTEN_MAX)), 5));
    for (const v of colorAt(5000)) expect(v).toBeLessThanOrEqual(1);
  });

  it("uses the water colour shaded by depth below the water level", () => {
    const water = lin(GROUP_COLORS.water);
    expect(colorAt(-3)).toEqual(shadeByDepth(water, -3, 0.6, 6));
    expect(colorAt(0.6)).toEqual(shadeByDepth(water, 0.6, 0.6, 6));
  });
});
```

- [ ] **Step 2: Write the failing geometry test (`geometry.test.ts`)**

```ts
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildTileGeometry, cellKept, planTiles } from "./geometry";
import { ContextLayer } from "./layer";
import type { ContextDoc } from "./types";

// 5 x 4 vertices = 4 x 3 cells; the hole is the 2 cells (1,1) and (2,1).
const doc: ContextDoc = {
  version: 1,
  heights_file: "context.u16",
  cols: 5,
  rows: 4,
  x0: -200,
  z0: -150,
  dx: 100,
  dz: 100,
  hole: { i0: 1, i1: 3, j0: 1, j1: 2 },
  min_m: -3,
  max_m: 50,
  water_level_m: 0.6,
  bay_floor_m: -3,
  layers: [],
  places: [],
};
const heights = Float32Array.from({ length: 20 }, (_, i) => (i % 5) + Math.floor(i / 5) * 2); // distinct, small
const whole = { i0: 0, i1: 4, j0: 0, j1: 3 };
const opts = { exaggeration: 3, floorY: -10.5, colorAt: () => [0.5, 0.5, 0.5] as [number, number, number] };

describe("planTiles", () => {
  it("covers every cell exactly once", () => {
    const tiles = planTiles(11, 8, 4); // 10 x 7 cells
    let cells = 0;
    for (const t of tiles) cells += (t.i1 - t.i0) * (t.j1 - t.j0);
    expect(cells).toBe(70);
    expect(tiles[0]).toEqual({ i0: 0, i1: 4, j0: 0, j1: 4 });
    expect(tiles.at(-1)).toEqual({ i0: 8, i1: 10, j0: 4, j1: 7 });
  });
  it("rejects bad input", () => {
    expect(() => planTiles(1, 5, 4)).toThrow();
    expect(() => planTiles(5, 5, 0)).toThrow();
  });
});

describe("cellKept", () => {
  it("drops the hole and anything outside the lattice", () => {
    expect(cellKept(doc, 0, 0)).toBe(true);
    expect(cellKept(doc, 1, 1)).toBe(false);
    expect(cellKept(doc, 2, 1)).toBe(false);
    expect(cellKept(doc, 3, 1)).toBe(true);
    expect(cellKept(doc, -1, 0)).toBe(false);
    expect(cellKept(doc, 4, 0)).toBe(false);
    expect(cellKept(doc, 0, 3)).toBe(false);
  });
});

describe("buildTileGeometry", () => {
  const geo = buildTileGeometry(doc, heights, whole, opts)!;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const index = geo.getIndex()!;
  const topIndexCount = 10 * 6; // 12 cells - 2 in the hole, 2 triangles each

  it("puts vertex heights, exaggerated, at world positions on the lattice", () => {
    expect(pos.getX(0)).toBeCloseTo(-200);
    expect(pos.getZ(0)).toBeCloseTo(-150);
    expect(pos.getY(6)).toBeCloseTo(heights[1 * 5 + 1] * 3); // vertex (1, 1)
    expect(pos.getX(6)).toBeCloseTo(-100);
    expect(pos.getZ(6)).toBeCloseTo(-50);
  });

  it("emits no top triangle inside the hole", () => {
    for (let t = 0; t < topIndexCount; t += 3) {
      const ids = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      const cx = ids.reduce((s, i) => s + pos.getX(i), 0) / 3;
      const cz = ids.reduce((s, i) => s + pos.getZ(i), 0) / 3;
      const inHole = cx > -100 && cx < 100 && cz > -50 && cz < 50;
      expect(inHole).toBe(false);
    }
  });

  it("adds 20 wall quads: 14 on the outer edge and 6 around the hole", () => {
    expect(index.count).toBe(topIndexCount + 20 * 6);
  });

  it("drops wall bottoms to the floor and colours every vertex", () => {
    let atFloor = 0;
    for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - -10.5) < 1e-6) atFloor++;
    expect(atFloor).toBe(40); // two new vertices per wall quad
    expect((geo.getAttribute("color") as THREE.BufferAttribute).count).toBe(pos.count);
  });

  const normalOf = (t: number) => {
    const p = (k: number) => new THREE.Vector3(pos.getX(index.getX(t + k)), pos.getY(index.getX(t + k)), pos.getZ(index.getX(t + k)));
    const [a, b, c] = [p(0), p(1), p(2)];
    return b.sub(a).cross(c.sub(a));
  };
  const wallTriangles = () => {
    const out: number[] = [];
    for (let t = topIndexCount; t < index.count; t += 3) out.push(t);
    return out;
  };

  it("faces the top surface up", () => {
    for (let t = 0; t < topIndexCount; t += 3) expect(normalOf(t).y).toBeGreaterThan(0);
  });

  it("faces the outer west wall west (away from the ring body)", () => {
    const west = wallTriangles().filter((t) => [0, 1, 2].every((k) => Math.abs(pos.getX(index.getX(t + k)) - -200) < 1e-6));
    expect(west.length).toBe(6); // 3 cells x 2 triangles
    for (const t of west) expect(normalOf(t).x).toBeLessThan(0);
  });

  it("faces the wall along the top of the hole south, into the hole", () => {
    // z = -50 is the hole's north edge; kept cells at row 0 stand on the north side of it.
    const walls = wallTriangles().filter(
      (t) =>
        [0, 1, 2].every((k) => Math.abs(pos.getZ(index.getX(t + k)) - -50) < 1e-6) &&
        [0, 1, 2].every((k) => pos.getX(index.getX(t + k)) >= -100 - 1e-6 && pos.getX(index.getX(t + k)) <= 100 + 1e-6),
    );
    expect(walls.length).toBe(4); // 2 cells x 2 triangles
    for (const t of walls) expect(normalOf(t).z).toBeGreaterThan(0);
  });

  it("returns null for a tile that is entirely hole", () => {
    expect(buildTileGeometry(doc, heights, { i0: 1, i1: 3, j0: 1, j1: 2 }, opts)).toBeNull();
  });

  it("refuses heights of the wrong length", () => {
    expect(() => buildTileGeometry(doc, new Float32Array(3), whole, opts)).toThrow(/20/);
  });
});

describe("ContextLayer", () => {
  it("builds one mesh per non-empty tile, frozen in world space", () => {
    const layer = new ContextLayer(doc, heights, { ...opts, tileCells: 2 });
    expect(layer.object.children.length).toBe(4); // 2 x 2 tiles; each keeps at least one cell
    const mesh = layer.object.children[0] as THREE.Mesh;
    expect(mesh.matrixAutoUpdate).toBe(false);
    expect(layer.stats().triangles).toBeGreaterThan(0);
    layer.dispose();
    expect(layer.object.children.length).toBe(0);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `cd viewer && npx vitest run src/context`
Expected: FAIL (cannot find `./colors`, `./geometry`, `./layer`).

- [ ] **Step 4: Create `viewer/src/context/colors.ts`**

```ts
import { GROUP_COLORS, shadeByDepth, srgbToLinear } from "../habitat";

/** Ground below the water surface darkens down to this depth (metres); same as the city (main.ts). */
export const MAX_SHADE_DEPTH_M = 6;
/** Land gets up to LIGHTEN_MAX lighter at this height above the water level (metres, real scale). */
export const LIGHTEN_TOP_M = 400;
export const LIGHTEN_MAX = 0.15;

function linearOf(hex: number): [number, number, number] {
  return [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
}

/**
 * Per-vertex colour for the ring from the vertex height (metres): the city's "unmapped"
 * ground colour on land (a little lighter with height), the city's water colour with its depth
 * shading below the water level. Linear RGB, like the city's vertex colours.
 */
export function makeRingColorAt(
  waterLevelM: number,
  maxDepthM: number = MAX_SHADE_DEPTH_M,
): (heightM: number) => [number, number, number] {
  const land = linearOf(GROUP_COLORS.unmapped);
  const water = linearOf(GROUP_COLORS.water);
  return (heightM) => {
    if (heightM <= waterLevelM) return shadeByDepth(water, heightM, waterLevelM, maxDepthM);
    const t = Math.min(1, Math.max(0, (heightM - waterLevelM) / LIGHTEN_TOP_M));
    const f = 1 + LIGHTEN_MAX * t;
    return [Math.min(1, land[0] * f), Math.min(1, land[1] * f), Math.min(1, land[2] * f)];
  };
}
```

- [ ] **Step 5: Create `viewer/src/context/geometry.ts`**

```ts
import * as THREE from "three";
import type { ContextDoc } from "./types";

/** Vertex index ranges, inclusive: the tile holds cells i0..i1-1 by j0..j1-1. */
export interface RingTile {
  i0: number;
  i1: number;
  j0: number;
  j1: number;
}

export interface TileOptions {
  /** Vertical exaggeration (same as the city's). */
  exaggeration: number;
  /** World y the skirts reach down to (the sea floor plane). */
  floorY: number;
  /** Vertex colour (linear RGB) from the height in metres. */
  colorAt: (heightM: number) => [number, number, number];
  /** Skirt colour is the top colour times this. Default 0.8. */
  wallShade?: number;
}

/** Split the lattice into tiles of up to tileCells x tileCells cells (so the frustum can cull them). */
export function planTiles(cols: number, rows: number, tileCells: number): RingTile[] {
  const cellsX = cols - 1;
  const cellsY = rows - 1;
  if (cellsX < 1 || cellsY < 1) throw new Error(`lattice ${cols}x${rows} is too small to tile`);
  if (!Number.isInteger(tileCells) || tileCells < 1) {
    throw new Error(`tileCells must be a positive integer, got ${tileCells}`);
  }
  const tiles: RingTile[] = [];
  for (let j0 = 0; j0 < cellsY; j0 += tileCells) {
    for (let i0 = 0; i0 < cellsX; i0 += tileCells) {
      tiles.push({ i0, i1: Math.min(i0 + tileCells, cellsX), j0, j1: Math.min(j0 + tileCells, cellsY) });
    }
  }
  return tiles;
}

/** Is cell (ci, cj) drawn? Cells outside the lattice and cells under the city mesh are not. */
export function cellKept(doc: Pick<ContextDoc, "cols" | "rows" | "hole">, ci: number, cj: number): boolean {
  if (ci < 0 || cj < 0 || ci > doc.cols - 2 || cj > doc.rows - 2) return false;
  const h = doc.hole;
  return !(ci >= h.i0 && ci < h.i1 && cj >= h.j0 && cj < h.j1);
}

/**
 * Geometry for one tile. Top surface: same triangle layout and winding as the city terrain
 * (a north-west, b south-west, c north-east, d south-east). Skirts: wherever a kept cell's
 * neighbour is not kept (the lattice's outer edge, or the hole boundary), a vertical wall
 * goes down from the cell's edge to `floorY`, wound to face away from the kept cell. Returns
 * null when the tile has no kept cell. No normals: pair it with a flat-shaded material.
 */
export function buildTileGeometry(
  doc: ContextDoc,
  heights: Float32Array,
  tile: RingTile,
  opts: TileOptions,
): THREE.BufferGeometry | null {
  const { cols, rows, x0, z0, dx, dz } = doc;
  if (heights.length !== cols * rows) {
    throw new Error(`heights has ${heights.length} samples, expected ${cols * rows}`);
  }
  const wallShade = opts.wallShade ?? 0.8;
  const nx = tile.i1 - tile.i0 + 1;
  const ny = tile.j1 - tile.j0 + 1;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const gi = tile.i0 + i;
      const gj = tile.j0 + j;
      const h = heights[gj * cols + gi];
      pos.push(x0 + gi * dx, h * opts.exaggeration, z0 + gj * dz);
      col.push(...opts.colorAt(h));
    }
  }
  const vertex = (gi: number, gj: number) => (gj - tile.j0) * nx + (gi - tile.i0);

  const bottomOf = (top: number): number => {
    const b = pos.length / 3;
    pos.push(pos[top * 3], opts.floorY, pos[top * 3 + 2]);
    col.push(col[top * 3] * wallShade, col[top * 3 + 1] * wallShade, col[top * 3 + 2] * wallShade);
    return b;
  };
  const wall = (t0: number, t1: number, ox: number, oz: number) => {
    const b0 = bottomOf(t0);
    const b1 = bottomOf(t1);
    let tri1 = [t0, b0, t1];
    let tri2 = [t1, b0, b1];
    const p = (k: number) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
    const n = p(tri1[1]).sub(p(tri1[0])).cross(p(tri1[2]).sub(p(tri1[0])));
    if (n.x * ox + n.z * oz < 0) {
      tri1 = [t0, t1, b0];
      tri2 = [t1, b1, b0];
    }
    idx.push(...tri1, ...tri2);
  };

  let kept = 0;
  const walls: Array<() => void> = []; // appended after all top triangles, so the top block is contiguous
  for (let cj = tile.j0; cj < tile.j1; cj++) {
    for (let ci = tile.i0; ci < tile.i1; ci++) {
      if (!cellKept(doc, ci, cj)) continue;
      kept++;
      const a = vertex(ci, cj);
      const b = vertex(ci, cj + 1);
      const c = vertex(ci + 1, cj);
      const d = vertex(ci + 1, cj + 1);
      idx.push(a, b, c, b, d, c);
      if (!cellKept(doc, ci - 1, cj)) walls.push(() => wall(a, b, -1, 0)); // west
      if (!cellKept(doc, ci + 1, cj)) walls.push(() => wall(c, d, 1, 0)); // east
      if (!cellKept(doc, ci, cj - 1)) walls.push(() => wall(a, c, 0, -1)); // north
      if (!cellKept(doc, ci, cj + 1)) walls.push(() => wall(b, d, 0, 1)); // south
    }
  }
  if (kept === 0) return null;
  for (const w of walls) w();

  const count = pos.length / 3;
  const indices = count < 65536 ? new Uint16Array(idx) : new Uint32Array(idx);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(pos), 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(Float32Array.from(col), 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
```

- [ ] **Step 6: Create `viewer/src/context/layer.ts`**

```ts
import * as THREE from "three";
import { buildTileGeometry, planTiles, type TileOptions } from "./geometry";
import type { ContextDoc } from "./types";

export interface ContextLayerOptions extends TileOptions {
  /** Cells per tile edge. Default 96. */
  tileCells?: number;
  /** Shared material; default a flat-shaded vertex-colour standard material like the city's. */
  material?: THREE.Material;
}

/** The grey modern ring: one static mesh per tile, in world coordinates, culled by the camera. */
export class ContextLayer {
  readonly object = new THREE.Group();
  private readonly material: THREE.Material;
  private readonly ownsMaterial: boolean;
  private triangles = 0;

  constructor(doc: ContextDoc, heights: Float32Array, options: ContextLayerOptions) {
    this.object.name = "context";
    this.ownsMaterial = !options.material;
    this.material = options.material ?? new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
    for (const tile of planTiles(doc.cols, doc.rows, options.tileCells ?? 96)) {
      const geometry = buildTileGeometry(doc, heights, tile, options);
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.name = `context-${tile.i0}-${tile.j0}`;
      mesh.matrixAutoUpdate = false; // static: positions are already in world coordinates
      mesh.updateMatrix();
      this.object.add(mesh);
      this.triangles += (geometry.getIndex()?.count ?? 0) / 3;
    }
  }

  setVisible(on: boolean): void {
    this.object.visible = on;
  }

  stats(): { tiles: number; triangles: number } {
    return { tiles: this.object.children.length, triangles: this.triangles };
  }

  dispose(): void {
    for (const child of this.object.children) (child as THREE.Mesh).geometry.dispose();
    this.object.clear();
    if (this.ownsMaterial) this.material.dispose();
    this.triangles = 0;
  }
}
```

- [ ] **Step 7: Run to confirm pass**

Run: `cd viewer && npx vitest run src/context && npx tsc --noEmit`
Expected: all pass. If a wall-winding test fails, the bug is in `wall()`; do not weaken the test.

- [ ] **Step 8: Commit**

```bash
cd "/Users/paras/Documents/Ancient San Francisco"
git add viewer/src/context
git commit -m "feat(viewer): ring colours, tile geometry with skirts, ContextLayer

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Camera limits for a bigger, off-centre map

**Files:**
- Modify: `viewer/src/viewRig.ts`
- Modify: `viewer/src/viewRig.test.ts` (append)
- Create: `viewer/src/context/limits.ts`, `viewer/src/context/limits.test.ts`

- [ ] **Step 1: Append failing tests to `viewer/src/viewRig.test.ts`**

```ts
describe("clampTarget with a centre offset", () => {
  const off = { halfWidth: 1000, halfDepth: 500, centerX: 3000, centerZ: -400 };
  it("clamps around the centre, not the origin", () => {
    expect(clampTarget(10_000, 10_000, off, 100)).toEqual([4100, 200]);
    expect(clampTarget(-10_000, -10_000, off, 100)).toEqual([1900, -1000]);
    expect(clampTarget(3000, -400, off, 100)).toEqual([3000, -400]);
  });
  it("sends non-finite input to the centre", () => {
    expect(clampTarget(Number.NaN, Number.POSITIVE_INFINITY, off, 0)).toEqual([3000, -400]);
  });
});

describe("ViewRig limits", () => {
  const make = () => {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1e5, 1e5);
    return new ViewRig(camera, { bounds: BOUNDS, margin: 0, minZoom: 0.8, maxZoom: 40, reducedMotion: () => true });
  };
  it("reports the current limits as a copy", () => {
    const rig = make();
    const limits = rig.getLimits();
    expect(limits).toEqual({ bounds: BOUNDS, minZoom: 0.8 });
    limits.bounds.halfWidth = 1;
    expect(rig.getLimits().bounds.halfWidth).toBe(1000);
  });
  it("widening lets the view go further out and further away", () => {
    const rig = make();
    rig.setState({ x: 5000, zoom: 0.3 });
    expect(rig.getState().x).toBe(1000);
    expect(rig.getState().zoom).toBe(0.8);
    rig.setLimits({ bounds: { halfWidth: 9000, halfDepth: 500, centerX: 5000 }, minZoom: 0.2 });
    rig.setState({ x: 5000, zoom: 0.3 });
    expect(rig.getState().x).toBe(5000);
    expect(rig.getState().zoom).toBe(0.3);
  });
  it("narrowing clamps the current view", () => {
    const rig = make();
    rig.setState({ x: 900, zoom: 1 });
    rig.setLimits({ bounds: { halfWidth: 100, halfDepth: 100 }, minZoom: 2 });
    expect(rig.getState().x).toBe(100);
    expect(rig.getState().zoom).toBe(2);
  });
  it("ignores a non-positive or non-finite minZoom", () => {
    const rig = make();
    rig.setLimits({ minZoom: 0 });
    rig.setLimits({ minZoom: Number.NaN });
    expect(rig.getLimits().minZoom).toBe(0.8);
  });
});
```

- [ ] **Step 2: Create `viewer/src/context/limits.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { fitViewSize } from "../camera";
import { ringBounds, ringFitViewSize, ringMinZoom, ringRect } from "./limits";
import type { ContextDoc } from "./types";

const doc = {
  cols: 11,
  rows: 6,
  x0: -1000,
  z0: -300,
  dx: 400,
  dz: 200,
} as ContextDoc;

describe("ringRect and ringBounds", () => {
  it("spans the lattice vertices", () => {
    expect(ringRect(doc)).toEqual({ minX: -1000, maxX: 3000, minZ: -300, maxZ: 700 });
  });
  it("is a centred rectangle in the MapBounds form", () => {
    expect(ringBounds(doc)).toEqual({ halfWidth: 2000, halfDepth: 500, centerX: 1000, centerZ: 200 });
  });
});

describe("ringMinZoom", () => {
  it("is the ratio of the fits times a safety factor", () => {
    expect(ringMinZoom(100, 400, 1)).toBeCloseTo(0.25);
    expect(ringMinZoom(100, 400)).toBeCloseTo(0.25 * 0.92);
  });
  it("rejects non-positive sizes", () => {
    expect(() => ringMinZoom(0, 400)).toThrow();
    expect(() => ringMinZoom(100, -1)).toThrow();
  });
});

describe("ringFitViewSize", () => {
  it("is the camera fit of the ring rectangle", () => {
    expect(ringFitViewSize(doc, 50, 1.5)).toBeCloseTo(fitViewSize(4000, 1000, 50, 1.5));
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `cd viewer && npx vitest run src/viewRig.test.ts src/context/limits.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement in `viewer/src/viewRig.ts`**

Replace the `MapBounds` interface and `clampTarget`:

```ts
export interface MapBounds {
  /** Half the map extent east-west / north-south, in metres, about the centre. */
  halfWidth: number;
  halfDepth: number;
  /** Centre of the rectangle in world metres; default 0 (the origin, the city's centre). */
  centerX?: number;
  centerZ?: number;
}

/** Keep the target inside the map rectangle expanded by `margin` metres on every side. */
export function clampTarget(
  x: number,
  z: number,
  bounds: MapBounds,
  margin: number,
): [number, number] {
  const ox = bounds.centerX ?? 0;
  const oz = bounds.centerZ ?? 0;
  const mx = bounds.halfWidth + margin;
  const mz = bounds.halfDepth + margin;
  const cx = Number.isFinite(x) ? Math.min(ox + mx, Math.max(ox - mx, x)) : ox;
  const cz = Number.isFinite(z) ? Math.min(oz + mz, Math.max(oz - mz, z)) : oz;
  return [cx, cz];
}
```

Add these methods to the `ViewRig` class, right after `getState()`:

```ts
  /** The current pan bounds (a copy) and minimum zoom. */
  getLimits(): { bounds: MapBounds; minZoom: number } {
    return { bounds: { ...this.options.bounds }, minZoom: this.options.minZoom };
  }

  /** Change the pan bounds and/or the minimum zoom, then clamp the current view to them. */
  setLimits(limits: { bounds?: MapBounds; minZoom?: number }): void {
    if (limits.bounds) this.options.bounds = { ...limits.bounds };
    if (limits.minZoom !== undefined && Number.isFinite(limits.minZoom) && limits.minZoom > 0) {
      this.options.minZoom = limits.minZoom;
    }
    this.setState({ zoom: this.zoom });
  }
```

Make the LAST line of `setLimits` `this.setState({ zoom: this.zoom });` (not `setState({})`): `setState` clamps x and z to the new bounds and the zoom to the new minimum, repositions the camera and notifies listeners in one step, and it needs a zoom to clamp the zoom. Use that line in the code above.

- [ ] **Step 5: Create `viewer/src/context/limits.ts`**

```ts
import { fitViewSize } from "../camera";
import type { MapBounds } from "../viewRig";
import type { ContextDoc } from "./types";

export interface RingRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** World rectangle spanned by the ring's vertices. */
export function ringRect(doc: Pick<ContextDoc, "cols" | "rows" | "x0" | "z0" | "dx" | "dz">): RingRect {
  return {
    minX: doc.x0,
    maxX: doc.x0 + (doc.cols - 1) * doc.dx,
    minZ: doc.z0,
    maxZ: doc.z0 + (doc.rows - 1) * doc.dz,
  };
}

/** The ring as camera pan bounds (centred on the ring, not the origin). */
export function ringBounds(doc: Pick<ContextDoc, "cols" | "rows" | "x0" | "z0" | "dx" | "dz">): MapBounds {
  const r = ringRect(doc);
  return {
    halfWidth: (r.maxX - r.minX) / 2,
    halfDepth: (r.maxZ - r.minZ) / 2,
    centerX: (r.minX + r.maxX) / 2,
    centerZ: (r.minZ + r.maxZ) / 2,
  };
}

/** The camera view height (world units at zoom 1) that fits the whole ring, like fitViewSize does for the city. */
export function ringFitViewSize(
  doc: Pick<ContextDoc, "cols" | "rows" | "x0" | "z0" | "dx" | "dz">,
  maxHeightM: number,
  aspect: number,
): number {
  const r = ringRect(doc);
  return fitViewSize(r.maxX - r.minX, r.maxZ - r.minZ, maxHeightM, aspect);
}

/**
 * Smallest zoom at which the whole ring still fits: the city's fit (zoom 1) over the ring's fit,
 * times a safety factor so the ring's edge is not flush with the window.
 */
export function ringMinZoom(cityViewSize: number, ringViewSize: number, safety = 0.92): number {
  if (!(cityViewSize > 0) || !(ringViewSize > 0)) {
    throw new Error(`view sizes must be positive, got ${cityViewSize} and ${ringViewSize}`);
  }
  return (cityViewSize / ringViewSize) * safety;
}
```

- [ ] **Step 6: Run to confirm pass**

Run: `cd viewer && npx vitest run && npx tsc --noEmit`
Expected: all pass (the existing viewRig tests still pass: the default centre is 0).

- [ ] **Step 7: Commit**

```bash
cd "/Users/paras/Documents/Ancient San Francisco"
git add viewer/src/viewRig.ts viewer/src/viewRig.test.ts viewer/src/context/limits.ts viewer/src/context/limits.test.ts
git commit -m "feat(viewer): off-centre camera bounds, setLimits, ring limits

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ring places as labels, search and Places entries

**Files:**
- Modify: `viewer/src/appContext.ts`, `viewer/src/overlay/types.ts`, `viewer/src/overlay/labels.ts`, `viewer/src/overlayModule.ts`
- Create: `viewer/src/overlay/regionLabels.ts`, `viewer/src/overlay/regionLabels.test.ts`

- [ ] **Step 1: Failing test `viewer/src/overlay/regionLabels.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import type { ExtraPlace } from "../appContext";
import {
  REGION_LABEL_MAX_ZOOM,
  REGION_PLACE_ZOOM,
  REGION_PRIORITY,
  labelKindsFor,
  regionSearchItems,
} from "./regionLabels";

describe("labelKindsFor", () => {
  const base = new Set(["landmark", "hotspot"]);
  it("adds region labels only when zoomed out and landmarks are on", () => {
    expect(labelKindsFor(base, 1, true).has("region")).toBe(true);
    expect(labelKindsFor(base, REGION_LABEL_MAX_ZOOM, true).has("region")).toBe(true);
    expect(labelKindsFor(base, REGION_LABEL_MAX_ZOOM + 0.01, true).has("region")).toBe(false);
    expect(labelKindsFor(base, 1, false).has("region")).toBe(false);
    expect(labelKindsFor(base, Number.NaN, true).has("region")).toBe(false);
  });
  it("keeps the base kinds and does not modify the base set", () => {
    const out = labelKindsFor(base, 1, true);
    expect(out.has("landmark") && out.has("hotspot")).toBe(true);
    expect(base.has("region")).toBe(false);
  });
});

describe("regionSearchItems", () => {
  const places: ExtraPlace[] = [
    { id: "oakland", name: "Oakland", kind: "town", x: 1, z: 2, lon: -122.27, lat: 37.8, groundM: 5 },
  ];
  it("maps ring places to landmark search items", () => {
    expect(regionSearchItems(places)).toEqual([{ id: "oakland", name: "Oakland", group: "landmark", kind: "town", x: 1, z: 2 }]);
  });
});

describe("constants", () => {
  it("rank ring labels above ordinary landmarks and fly in gently", () => {
    expect(REGION_PRIORITY).toBeGreaterThan(50);
    expect(REGION_PLACE_ZOOM).toBeLessThan(2);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd viewer && npx vitest run src/overlay/regionLabels.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `viewer/src/overlay/regionLabels.ts`**

```ts
import type { ExtraPlace } from "../appContext";
import type { SearchItem } from "../search";

/** Ring place labels (towns beyond the 1769 map) are drawn only at or below this camera zoom. */
export const REGION_LABEL_MAX_ZOOM = 1.6;
/** Declutter priority of a ring label: above ordinary landmarks, below hotspots. */
export const REGION_PRIORITY = 58;
/** Zoom a search result or Places entry for a ring place flies to (never zooms out). */
export const REGION_PLACE_ZOOM = 1.2;

/** The label kinds to show this frame: `base` plus "region" when zoomed out and Landmarks is on. */
export function labelKindsFor(base: ReadonlySet<string>, zoom: number, landmarksOn: boolean): ReadonlySet<string> {
  if (!landmarksOn || !(zoom <= REGION_LABEL_MAX_ZOOM)) return base;
  const out = new Set(base);
  out.add("region");
  return out;
}

export function regionSearchItems(places: readonly ExtraPlace[]): SearchItem[] {
  return places.map((p): SearchItem => ({ id: p.id, name: p.name, group: "landmark", kind: p.kind, x: p.x, z: p.z }));
}
```

- [ ] **Step 4: Add `ExtraPlace` and `extraPlaces` to `viewer/src/appContext.ts`**

Above `AppContext`:

```ts
/** A place outside the overlay (a town in the grey surrounding ring): a modern landmark label. */
export interface ExtraPlace {
  id: string;
  name: string;
  /** "town", "peak" or "airport". */
  kind: string;
  /** World metres. */
  x: number;
  z: number;
  lon: number;
  lat: number;
  /** Ground height at the place, real metres (labels sit at groundM * verticalExaggeration). */
  groundM: number;
}
```

Inside `AppContext`, after `surpriseTargets`:

```ts
  /**
   * Extra landmark-like places that modules contribute BEFORE the overlay module runs (the
   * context module adds the ring's towns). The overlay module labels, searches and lists them.
   */
  extraPlaces: ExtraPlace[];
```

- [ ] **Step 5: Add the `region` kinds**

In `viewer/src/overlay/types.ts` add `"region"` to `LANDMARK_KINDS` (after `"other"`) with this comment above the array: `// "region" is only produced by the context module (extraPlaces), never by overlay.json.` In `viewer/src/overlay/labels.ts` change `LabelItem.kind` to `"landmark" | "hotspot" | "region"` and add `region: 58,` to `LANDMARK_PRIORITY` (it is a `Record<LandmarkKind, number>`, so the compiler demands it).

- [ ] **Step 6: Edit `viewer/src/overlayModule.ts`**

1. Imports: add
```ts
import { REGION_PLACE_ZOOM, REGION_PRIORITY, labelKindsFor, regionSearchItems } from "./overlay/regionLabels";
```
2. After `const landmarks = new Map<string, Landmark>(...)` add:
```ts
  const regionIds = new Set<string>();
  for (const p of ctx.extraPlaces) {
    regionIds.add(p.id);
    landmarks.set(p.id, { id: p.id, name: p.name, kind: "region", x: p.x, z: p.z, lon: p.lon, lat: p.lat });
  }
```
3. At the end of the `items` array literal add:
```ts
    ...ctx.extraPlaces.map(
      (p): LabelItem => ({ id: p.id, text: p.name, x: p.x, z: p.z, y: p.groundM * exaggeration, kind: "region", priority: REGION_PRIORITY }),
    ),
```
4. Replace the `ctx.onFrame(() => labels.update(...visibleKinds))` line with:
```ts
  ctx.onFrame(() =>
    labels.update(ctx.camera, ctx.canvas.clientWidth, ctx.canvas.clientHeight, labelKindsFor(visibleKinds, ctx.camera.zoom, layers.has("landmarks"))),
  );
```
5. Replace `const index = buildSearchIndex(overlaySearchItems(overlay));` with:
```ts
  const searchItems = [...overlaySearchItems(overlay), ...regionSearchItems(ctx.extraPlaces)];
  const index = buildSearchIndex(searchItems);
```
6. In `choose`, replace the zoom line with:
```ts
    const base = regionIds.has(item.id) ? REGION_PLACE_ZOOM : PLACE_ZOOM[item.group];
    const zoom = Math.max(rig.getState().zoom, base);
```
7. Replace `for (const item of overlaySearchItems(overlay)) if (item.group !== "street") placeItems.set(item.id, item);` with `for (const item of searchItems) if (item.group !== "street") placeItems.set(item.id, item);`
8. In the Places panel call, make the landmarks argument:
```ts
      [
        ...overlay.landmarks.map((l) => ({ id: l.id, name: l.name, kind: l.kind })),
        ...ctx.extraPlaces.map((p) => ({ id: p.id, name: p.name, kind: p.kind })),
      ],
```

- [ ] **Step 7: `main.ts`: give the context an empty list**

In the `const ctx: AppContext = { ... }` object add `extraPlaces: [],` after `surpriseTargets,`.

- [ ] **Step 8: Run to confirm pass**

Run: `cd viewer && npx vitest run && npx tsc --noEmit`
Expected: all pass, no type errors (the compiler will point at any `AppContext` literal in a test that now lacks `extraPlaces`; add `extraPlaces: []` there).

Also run `cd pipeline && uv run python -m pytest -q -W error`. Expected: all pass (pipeline tests only mirror numeric limits from the viewer's parsers, not the landmark kinds; if one does fail on `LANDMARK_KINDS`, add `"region"` to the pipeline's `LANDMARK_KINDS` in `yelamu/overlay.py` and to the literal set in `tests/test_overlay.py`, since adding a kind only widens what is accepted).

- [ ] **Step 9: Commit**

```bash
cd "/Users/paras/Documents/Ancient San Francisco"
git add viewer/src/appContext.ts viewer/src/overlay viewer/src/overlayModule.ts viewer/src/main.ts
git commit -m "feat(viewer): ring places as zoom-dependent labels, search and Places entries

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The module, and putting the ring on the screen

**Files:**
- Create: `viewer/src/contextModule.ts`
- Modify: `viewer/src/modules.ts`, `viewer/src/main.ts`

- [ ] **Step 1: Create `viewer/src/contextModule.ts`**

```ts
import { fitViewSize } from "./camera";
import type { AppContext } from "./appContext";
import { makeRingColorAt } from "./context/colors";
import { ContextLayer } from "./context/layer";
import { ringBounds, ringFitViewSize, ringMinZoom } from "./context/limits";
import { loadContextDoc, loadContextHeights } from "./context/parse";
import type { AppModule } from "./modules";

/**
 * The grey modern ring around the 1769 map (context.json + context.u16). Runs BEFORE the overlay
 * module: it hands the ring's towns over through ctx.extraPlaces, widens the camera limits, and
 * draws the terrain once its heights have arrived (the 1 MB file is not awaited, so the city and
 * the overlay appear first). A dataset without `context_file`, or a failed load, leaves the
 * viewer exactly as it was (one console warning).
 */
export const contextModule: AppModule = async (ctx: AppContext) => {
  let doc;
  try {
    doc = await loadContextDoc(ctx.assetBase, ctx.meta);
  } catch (err) {
    console.warn("Surrounding terrain not loaded; continuing without it.", err);
    return;
  }
  if (!doc) return;

  for (const p of doc.places) {
    ctx.extraPlaces.push({ id: p.id, name: p.name, kind: p.kind, x: p.x, z: p.z, lon: p.lon, lat: p.lat, groundM: p.ground_m });
  }

  const exaggeration = ctx.verticalExaggeration;
  const original = ctx.rig.getLimits();
  const cityW = ctx.meta.width * ctx.meta.cell_m;
  const cityD = ctx.meta.height * ctx.meta.cell_m;
  const cityMaxH = (ctx.meta.max_m - ctx.meta.min_m) * exaggeration;
  const ringMaxH = (doc.max_m - doc.min_m) * exaggeration;
  const widen = () => {
    const aspect = ctx.canvas.clientWidth / Math.max(1, ctx.canvas.clientHeight);
    const minZoom = ringMinZoom(fitViewSize(cityW, cityD, cityMaxH, aspect), ringFitViewSize(doc, ringMaxH, aspect));
    ctx.rig.setLimits({ bounds: ringBounds(doc), minZoom: Math.min(original.minZoom, minZoom) });
  };
  widen();
  window.addEventListener("resize", widen);

  void (async () => {
    try {
      const heights = await loadContextHeights(ctx.assetBase, doc);
      const layer = new ContextLayer(doc, heights, {
        exaggeration,
        floorY: (ctx.meta.min_m - 0.5) * exaggeration, // the sea floor plane's height (main.ts)
        colorAt: makeRingColorAt(doc.water_level_m),
      });
      ctx.scene.add(layer.object);
      ctx.requestRender();
    } catch (err) {
      console.warn("Surrounding terrain heights not loaded; continuing without them.", err);
      window.removeEventListener("resize", widen);
      ctx.rig.setLimits(original);
    }
  })();
};
```

- [ ] **Step 2: Register it in `viewer/src/modules.ts`**

Add `import { contextModule } from "./contextModule";` and change the list to:

```ts
export const modules: AppModule[] = [infoModule, effectsModule, pondsModule, contextModule, overlayModule];
```

- [ ] **Step 3: Bigger sea planes in `viewer/src/main.ts`**

Add near the other constants: `// The sea and sea floor planes must reach past the grey ring (about 34 km east of the city centre).\nconst SEA_PLANE_FACTOR = 6;` and replace both `extent * 4` with `extent * SEA_PLANE_FACTOR`.

- [ ] **Step 4: Typecheck, unit tests, production build**

Run:

```bash
cd "/Users/paras/Documents/Ancient San Francisco/viewer"
npx tsc --noEmit && npx vitest run && npm run build:site
ls -l dist/assets/real-city
```

Expected: everything passes; `dist/assets/real-city` now also lists `context.json` and `context.u16` (the prune script keeps the whole real-city folder).

- [ ] **Step 5: Look at it in a real browser (do not skip: the viewer tests have no DOM)**

Start the dev server with the project's preview tool, or run `cd viewer && npx vite --port 5173` in the background, then open `http://localhost:5173/` (add `?debug` for the stats overlay). Check and note:
- The page loads with the same opening view as before (compare with `git stash`-free reasoning: the city fills the window as it did).
- Zoom out (scroll or the minus control): grey ground appears on all four sides; Mount Tamalpais, the Oakland hills, the peninsula to Pacifica; the Bay is the same blue as in SF.
- Pan to each edge: you stop near the ring's edge; the outer edge shows a skirt, not a hole to the background.
- Look closely at the join between the coloured city and the grey ring along the north, east and south edges and the Golden Gate: note any crack, step or colour band.
- Labels: about 19 town names appear when zoomed out and vanish when zoomed in; search "Oakland" flies there; Places panel lists the towns under Landmarks.
- Console: no errors; at most the expected warnings.
Save screenshots to `docs/research/local/ring-default.png`, `ring-zoomed-out.png`, `ring-seam-north.png`, `ring-tam-rotated.png` (the folder is gitignored).

- [ ] **Step 6: Commit**

```bash
cd "/Users/paras/Documents/Ancient San Francisco"
git add viewer/src/contextModule.ts viewer/src/modules.ts viewer/src/main.ts
git commit -m "feat(viewer): the grey surrounding terrain, loaded after the city

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Wording (an owner gate): Legend, About, Sources

**Files:**
- Modify: `viewer/src/legendEntries.ts`, `viewer/src/legendEntries.test.ts`, `viewer/src/ui/legend.ts`, `viewer/src/ui/about.ts`

The Sources panel needs no code: `build_context.py` already put the `context` layer (source, confidence `illustrative`, attribution) into `meta.layers`, and the panel lists every layer.

- [ ] **Step 1: Show the owner these exact words and wait for approval or edits**

Legend note (under the ground colours): "Beyond the area mapped for 1769, the grey-brown ground is today's terrain and coastline, shown only for orientation. It is not a reconstruction."

About, a second paragraph in "What this map is": "The grey-brown ground beyond the mapped area is today's terrain and coastline, shown only so the peninsula is not floating on its own. It is not a reconstruction: along the Bay shore it includes land that was filled in after 1769."

Sources card (already generated): "USGS 3DEP elevation data: modern terrain and shoreline, resampled to about 60 m. Shown for orientation only; not a reconstruction of 1769." Confidence: illustrative.

Do not continue until the owner has approved or replaced the text; use their final words in the steps below and in the comment `// Wording approved by the owner on <date>` placed above each string.

- [ ] **Step 2: Failing test (append to `viewer/src/legendEntries.test.ts`)**

```ts
import { CONTEXT_LEGEND_NOTE, legendNotes } from "./legendEntries";

describe("legendNotes with surrounding terrain", () => {
  it("adds the context note only when the dataset has a context_file", () => {
    expect(legendNotes({ context_file: "context.json" })).toContain(CONTEXT_LEGEND_NOTE);
    expect(legendNotes({})).not.toContain(CONTEXT_LEGEND_NOTE);
    expect(legendNotes({ context_file: "" })).not.toContain(CONTEXT_LEGEND_NOTE);
  });
  it("keeps the ponds note and orders ponds first", () => {
    const notes = legendNotes({ ponds_file: "ponds.json", context_file: "context.json" });
    expect(notes.length).toBe(2);
    expect(notes[1]).toBe(CONTEXT_LEGEND_NOTE);
  });
});
```

(If the file already imports from `./legendEntries`, merge the import instead of duplicating it.)

- [ ] **Step 3: Run to confirm failure**

Run: `cd viewer && npx vitest run src/legendEntries.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

In `viewer/src/legendEntries.ts` add (with the approved wording) and extend `legendNotes`:

```ts
// Wording approved by the owner on <date of the approval>
export const CONTEXT_LEGEND_NOTE =
  "Beyond the area mapped for 1769, the grey-brown ground is today's terrain and coastline, shown only for orientation. It is not a reconstruction.";

export function legendNotes(meta: { ponds_file?: string | null; context_file?: string | null }): string[] {
  const notes: string[] = [];
  if (typeof meta.ponds_file === "string" && meta.ponds_file !== "") notes.push(PONDS_LEGEND_NOTE);
  if (typeof meta.context_file === "string" && meta.context_file !== "") notes.push(CONTEXT_LEGEND_NOTE);
  return notes;
}
```

In `viewer/src/ui/legend.ts` change the `meta` type to `Pick<HeightmapMeta, "habitat_classes" | "overlay_file" | "ponds_file" | "context_file">` (the call `legendNotes(meta)` then works unchanged).

In `viewer/src/ui/about.ts`, inside the "What this map is" `section(...)` call add the second paragraph after the existing one (use the approved words):

```ts
      paragraph(
        "The grey-brown ground beyond the mapped area is today's terrain and coastline, shown only so the peninsula " +
          "is not floating on its own. It is not a reconstruction: along the Bay shore it includes land that was " +
          "filled in after 1769.",
      ),
```

- [ ] **Step 5: Run, then look at the panels in the browser**

Run: `cd viewer && npx vitest run && npx tsc --noEmit`
Then open the page, open **Legend**, **Sources** and **About** and confirm the new text shows and the Sources panel has a "context" card with the illustrative badge. Re-run the accessibility check used in Part B (axe-core 4.10.2 against the production build; see `docs/research/launch-results.md` and the Part B results in the launch plan) with About, Legend, Sources and Places open: expect 0 violations.

- [ ] **Step 6: Commit**

```bash
cd "/Users/paras/Documents/Ancient San Francisco"
git add viewer/src/legendEntries.ts viewer/src/legendEntries.test.ts viewer/src/ui/legend.ts viewer/src/ui/about.ts
git commit -m "feat(viewer): Legend and About words for the grey surrounding terrain (owner approved)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Phone benchmark scenario E

**Files:**
- Modify: `viewer/src/bench.ts`
- Modify: `docs/research/phone-measurement.md`

- [ ] **Step 1: Edit `viewer/src/bench.ts`**

Add an optional field to `Scenario`: `needsContext?: boolean;`. Append to `SCENARIOS`:

```ts
  { id: "E", label: "whole region (grey surround), vegetation on, water on", zoom: 0.01, vegetation: true, water: true, needsContext: true },
```

In the scenario loop, right after `out.textContent += \`Scenario ${sc.id}: ${sc.label}\n\`;` is written, skip a context scenario when the dataset has no ring, and choose the view:

```ts
        if (sc.needsContext && !ctx.meta.context_file) {
          out.textContent += "  skipped: this dataset has no surrounding terrain\n";
          continue;
        }
```

and replace the `ctx.rig.setState(...)` line with:

```ts
        const ring = ctx.rig.getLimits().bounds;
        ctx.rig.setState(
          sc.needsContext
            ? { x: ring.centerX ?? 0, z: ring.centerZ ?? 0, zoom: sc.zoom } // clamps to the minimum zoom: the whole ring
            : sc.zoom > 2
              ? { ...CLOSE_VIEW, zoom: sc.zoom }
              : { x: 0, z: 0, zoom: sc.zoom },
        );
```

Update the header comment's "(A to D)" to "(A to E)".

- [ ] **Step 2: Typecheck, test, and run the benchmark on the desktop**

Run `cd viewer && npx tsc --noEmit && npx vitest run`, then open `http://localhost:5173/?bench` (dev server), close About, click **Run the benchmark**. Expected: scenarios A to E all print PASS; E reports a triangle count of roughly 1.0 to 1.3 million. Note the E line.

- [ ] **Step 3: Document it**

In `docs/research/phone-measurement.md`, in the "Quick route" section, add one sentence: "Scenario E zooms out to the whole grey surround (about 1 million triangles); it is skipped when a dataset has no `context_file`. If E fails on a phone, set the ring's `cell_m` in `pipeline/regions/full-city.json` to 90, rerun `scripts/build_context.py`, and measure again."

- [ ] **Step 4: Commit**

```bash
cd "/Users/paras/Documents/Ancient San Francisco"
git add viewer/src/bench.ts docs/research/phone-measurement.md
git commit -m "feat(viewer): benchmark scenario E, the whole grey surround

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Look, decide, and measure on the phone (owner)

**Files:** none unless a decision below asks for a follow-up task.

- [ ] **Step 1: Agent shows the owner the screenshots from Task 10 step 5** (default, zoomed out, seam, Mount Tamalpais rotated) with the real page open, and asks three questions one at a time:
  1. **Edge:** keep the crisp edge between the coloured map and the grey ring, or add a soft fade? (If fade: do Task 14.)
  2. **Mount Tamalpais:** keep real height (766 m, exaggerated three times, so it towers over the northern view), or flatten tall terrain with a soft knee? (If flatten: do Task 15.)
  3. **Look of the Bay:** is the modern East Bay shore acceptable beside the 1850s SF shore with the legend note, for launch? (Expected yes: the stages follow.)
- [ ] **Step 2: Owner runs the benchmark on the phone** (`npm run build:site`, then `npx vite preview --host --port 4173`, phone on Tailscale at the Mac's Tailscale address, `http://<address>:4173/?bench`) and sends the screenshot. All of A to E must pass the rule (30 fps, p95 gap under 50 ms, quality not dropped). If E fails: set the ring `cell_m` to 90 in `pipeline/regions/full-city.json`, rerun `scripts/build_context.py`, re-run `pipeline` tests, rebuild, and measure again.
- [ ] **Step 3: Record** the decisions and the phone numbers in `docs/research/launch-results.md` under a new heading "Surrounding terrain (2026-11-17)", commit with message `docs: record the surrounding terrain decisions and phone results`. Stop the preview server with `kill <pid>` (find it with `lsof -nP -iTCP:4173 -sTCP:LISTEN -t`; never `pkill -f`).

---

### Task 14 (only if the owner chose a soft fade): colour fade at the city edge

**Files:**
- Create: `viewer/src/context/edgeFade.ts`, `viewer/src/context/edgeFade.test.ts`
- Modify: `viewer/src/main.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { withEdgeFade } from "./edgeFade";

const size = { width: 10, height: 8 };
const city = () => [1, 0, 0] as [number, number, number];
const ring = () => [0, 0, 1] as [number, number, number];

describe("withEdgeFade", () => {
  const fade = withEdgeFade(city, size, 4, ring);
  const at = (col: number, row: number) => fade(row * size.width + col, 5);

  it("is the ring colour on the very edge and the city colour at the fade distance and inside", () => {
    expect(at(0, 3)).toEqual([0, 0, 1]);
    expect(at(4, 3)).toEqual([1, 0, 0]);
    expect(at(5, 3)).toEqual([1, 0, 0]);
  });
  it("mixes linearly between", () => {
    const c = at(2, 3); // 2 cells in: halfway
    expect(c[0]).toBeCloseTo(0.5);
    expect(c[2]).toBeCloseTo(0.5);
  });
  it("measures the distance to the nearest of the four edges", () => {
    expect(at(9, 3)).toEqual([0, 0, 1]);
    expect(at(5, 0)).toEqual([0, 0, 1]);
    expect(at(5, 7)).toEqual([0, 0, 1]);
  });
  it("does nothing for a zero fade", () => {
    expect(withEdgeFade(city, size, 0, ring)(0, 5)).toEqual([1, 0, 0]);
  });
});
```

- [ ] **Step 2: Implement `viewer/src/context/edgeFade.ts`**

```ts
type Rgb = [number, number, number];

/**
 * Blend the city's vertex colours into the ring's colour over the outermost `fadeCells` cells, so
 * the coloured map melts into the grey surround instead of ending at a hard edge. 1 at the very
 * edge cell, 0 at `fadeCells` cells in. `cellIndex` is row * width + col, as in makeColorAt.
 */
export function withEdgeFade(
  colorAt: (cellIndex: number, heightM: number) => Rgb,
  size: { width: number; height: number },
  fadeCells: number,
  ringColorAt: (heightM: number) => Rgb,
): (cellIndex: number, heightM: number) => Rgb {
  if (!(fadeCells > 0)) return colorAt;
  return (cellIndex, heightM) => {
    const base = colorAt(cellIndex, heightM);
    const col = cellIndex % size.width;
    const row = Math.floor(cellIndex / size.width);
    const d = Math.min(col, row, size.width - 1 - col, size.height - 1 - row);
    if (d >= fadeCells) return base;
    const t = 1 - d / fadeCells;
    const ring = ringColorAt(heightM);
    return [base[0] + (ring[0] - base[0]) * t, base[1] + (ring[1] - base[1]) * t, base[2] + (ring[2] - base[2]) * t];
  };
}
```

- [ ] **Step 3: Use it in `main.ts`**

Import `withEdgeFade` and `makeRingColorAt`; where the city's `colorAt` is created pass it through only when the dataset has a ring: `const cityColorAt = meta.context_file ? withEdgeFade(colorAt, meta, EDGE_FADE_CELLS, makeRingColorAt(meta.water_level_m)) : colorAt;` with `const EDGE_FADE_CELLS = 100; // 1 km at 10 m`, and give `cityColorAt` to `TerrainChunks`. Keep the vegetation layer's inputs unchanged.

- [ ] **Step 4: Test, look, commit**

Run `cd viewer && npx vitest run && npx tsc --noEmit`, look at the north, east and south edges in the browser and tune `EDGE_FADE_CELLS` with the owner. Commit `feat(viewer): fade the city's colours into the grey surround at its edge`.

---

### Task 15 (only if the owner chose to flatten tall terrain): soft height knee

**Files:**
- Create: `viewer/src/context/knee.ts`, `viewer/src/context/knee.test.ts`
- Modify: `viewer/src/context/geometry.ts`, `viewer/src/context/layer.ts`, `viewer/src/contextModule.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { softKnee } from "./knee";

describe("softKnee", () => {
  const f = softKnee(300, 0.35);
  it("is the identity up to the knee", () => {
    expect(f(-3)).toBe(-3);
    expect(f(300)).toBe(300);
  });
  it("compresses above the knee by the ratio and stays continuous and increasing", () => {
    expect(f(400)).toBeCloseTo(300 + 100 * 0.35);
    expect(f(766)).toBeLessThan(766);
    expect(f(401)).toBeGreaterThan(f(400));
  });
  it("rejects a bad ratio", () => {
    expect(() => softKnee(300, 0)).toThrow();
    expect(() => softKnee(300, 1.5)).toThrow();
  });
});
```

- [ ] **Step 2: Implement `knee.ts`, wire it, and keep the seam exact**

```ts
/** Height compression for the ring only: identity up to `kneeM`, then `ratio` of the excess (0 < ratio <= 1). */
export function softKnee(kneeM: number, ratio: number): (heightM: number) => number {
  if (!(ratio > 0 && ratio <= 1)) throw new Error(`ratio must be in (0, 1], got ${ratio}`);
  return (h) => (h <= kneeM ? h : kneeM + (h - kneeM) * ratio);
}
```

Add an optional `heightM?: (h: number) => number` to `TileOptions`; in `buildTileGeometry` use `const hy = opts.heightM ? opts.heightM(h) : h;` for the y position only (colours still use the real `h`). In `contextModule.ts` pass `heightM: softKnee(300, 0.35)`. The city's tallest point is 279 m, below the knee, so the seam is unaffected. Add a geometry test asserting that with `heightM: (h) => h / 2` the vertex y is `h / 2 * exaggeration`. Run the tests, look at the northern view rotated, commit `feat(viewer): soft height knee for the ring's tall terrain`.

---

### Task 16: Final checks, docs, and hand-over

**Files:**
- Modify: `README.md`, `docs/superpowers/plans/2026-11-17-launch-readiness.md`, `docs/research/launch-results.md`
- Update: the memory file `yelamu-project-state.md`

- [ ] **Step 1: Full test runs the way CI does**

```bash
cd "/Users/paras/Documents/Ancient San Francisco/pipeline" && uv run python -m pytest -q -W error
cd ../viewer && npx vitest run && npx tsc --noEmit && npm run build:site && du -sh dist
```

Expected: all green; `dist` is about 12 to 13 MB (it was about 11 MB).

- [ ] **Step 2: README**

In `README.md`, in "Rebuilding the data", add after the `build_overlay.py` line: `uv run python scripts/build_context.py --region regions/full-city.json   # the grey surround (run after the city build and the overlay)`, and one sentence: "The grey surround is modern terrain (USGS 3DEP) for orientation only; see docs/superpowers/specs/2026-11-17-surrounding-terrain-design.md."

- [ ] **Step 3: Launch plan**

In `docs/superpowers/plans/2026-11-17-launch-readiness.md`, add a section "Surrounding terrain inserted before Task C3 (2026-11-17)" saying: the ring was added before launch; C3 (VoiceOver) now tests the final page; the phone result in C2 is superseded by the scenario E run recorded in `launch-results.md`; the 1850s shore stages (East Bay, peninsula bayshore, Marin) follow after launch, each with its own plan; the Wording gate for the Legend and About text was passed on the date the owner approved it.

- [ ] **Step 4: Independent review**

Ask a fresh read-only reviewer agent to review `git diff 0442277..HEAD` for correctness (seam alignment, winding, label zoom rules, the clamp maths, escaping of text, error paths) and to run the browser checks of Task 10 step 5. Fix what it finds, test first.

- [ ] **Step 5: Memory and commit**

Update `/Users/paras/.claude/projects/-Users-paras-Documents-Ancient-San-Francisco/memory/yelamu-project-state.md` with: ring built (spec, plan, files, 60 m, 19 places, owner decisions on edge and Mount Tamalpais, scenario E numbers), stages after launch, and that C3, C6, C7, C8 remain. Then:

```bash
cd "/Users/paras/Documents/Ancient San Francisco"
git add README.md docs
git commit -m "docs: surrounding terrain done; launch plan and README updated

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 6: Hand back** to the owner: the VoiceOver pass (C3) can now run on the final page; then C6 (DNS), C7, C8.

---

## Self-review (done when writing)

**Spec coverage:** visitor behaviour (opening view unchanged: Task 10 uses the city's numbers only; zoom-out and pan: Tasks 8 and 10; grey colour: Task 7; bay: planes in Task 10; labels and search: Task 9; crisp edge with optional fade: Tasks 13 and 14). Data (source, extent, 60 m, alignment, resample, output, region key, stage hook, build): Tasks 2 to 5. Viewer (module, seam, material, water, loading, camera, labels, cost, benchmark): Tasks 6 to 12. Honesty and wording gate: Task 11. Stages: out of this plan, stated in the header. Testing and verification: every task has tests first; browser checks in Tasks 10, 11, 13; phone in Task 13; a review in Task 16. Risks: seam (Tasks 7 and 10), Mount Tamalpais (Tasks 13 and 15), older phones (Tasks 12 and 13), East Bay shore (Task 13 question 3), labels (Task 5 step 4), wording gate (Task 11).

**Placeholder scan:** the only deliberate blanks are the wording approval date in Task 11 and the owner's decisions in Tasks 13 to 15, which are real decisions, not omissions. The place coordinates are written out and Task 5 step 4 makes verifying them mandatory.

**Type and name consistency:** `Lattice` fields (`x0, z0, dx, dz, cols, rows, i0, i1, j0, j1`) match the document keys and `ContextDoc` (`hole.{i0,i1,j0,j1}`); `ExtraPlace.groundM` is filled from `ground_m`; `context_file` is the same key in the pipeline patch, `HeightmapMeta`, `legendNotes`, the module and the benchmark; `REGION_*` constants and `"region"` kind are used consistently in Tasks 9 and 10; `CONTEXT_LEGEND_NOTE` is defined once.
