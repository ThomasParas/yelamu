# Yelamu 3D Map — Phase 0 + 1 (Research Spike and Vertical Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the riskiest assumption in the spec: that a "de-developed" ~1769 terrain can be built from modern elevation data plus historical shoreline data and shown in a live isometric 3D viewer. Scope is one small test area (Yerba Buena Cove to Mission Bay), not the whole city.

**Architecture:** An offline Python pipeline (`pipeline/`) turns a modern DEM and historical water polygons into a heightmap PNG plus `meta.json`. A static Vite + TypeScript + Three.js viewer (`viewer/`) loads those two files and renders them with a locked isometric camera. The two halves share only the asset format, defined in Task 5.

**Tech Stack:** Python 3.11+ (`uv`, numpy, pyproj, rasterio, shapely, Pillow, pytest); Node 20+ (Vite, TypeScript, Three.js, Vitest).

**Spec:** [`docs/superpowers/specs/2026-11-11-yelamu-3d-map-design.md`](../specs/2026-11-11-yelamu-3d-map-design.md) (Section 8, build order steps 0 and 1)

**Out of scope for this plan** (later plans): full-city terrain, habitat splat-map and vegetation, modern overlay, search, hotspots, the provenance UI panel, and the cultural layer.

> **Read Addendum A (end of this file) first.** Code review after Tasks 6 and 11 changed the asset format (raw `uint16` instead of a packed PNG), added NaN/nodata handling, and fixed viewer bugs. Where Tasks 5, 8 and 11 below differ from Addendum A, the addendum wins. Task 12 was revised after the research spike.

**How this plan was verified:** all code in Tasks 2-11 was run before being written here. The Python suite (20 tests) and TypeScript suite (14 tests) pass, `tsc` typechecks cleanly, `vite build` succeeds, and the viewer was loaded in a browser against synthetic assets (pan and zoom work, no console errors). Tasks 1 and 12 depend on real external data that has not been downloaded, so they are research and judgment tasks, not copy-and-run ones.

---

## File Structure

```
.gitignore
README.md
docs/research/
  2026-data-sources.md          # Task 1: findings
  slice.env                     # Task 1: shell vars consumed by Task 12
  aro-outreach-draft.md         # Task 1: draft only, NOT sent
pipeline/
  pyproject.toml
  yelamu/
    geo.py                      # UTM grid + coordinate helpers
    water.py                    # polygons -> boolean mask
    terrain.py                  # apply historical water, stamp landforms
    export.py                   # heightmap PNG + meta.json; Layer provenance
    sources.py                  # load DEM / GeoJSON onto the grid
    checks.py                   # known-point sanity checks
    cli.py                      # `python -m yelamu.cli` entry point
  scripts/make_demo_assets.py   # synthetic landscape for viewer development
  tests/                        # one test file per module
  data/raw/                     # gitignored downloads
  data/slice/                   # committed small config: landforms.json, checks.json
viewer/
  package.json, tsconfig.json, index.html
  src/heightmap.ts              # decode heights from PNG bytes
  src/terrainMesh.ts            # heights -> THREE.BufferGeometry
  src/camera.ts                 # isometric camera math (pure functions)
  src/controls.ts               # pointer/wheel handlers (DOM)
  src/main.ts                   # scene assembly
  public/assets/slice/          # heightmap.png + meta.json (pipeline output)
```

Responsibilities are split so the pure logic (geo, water, terrain, export, heightmap, terrainMesh, camera) is unit-tested, and the DOM-touching files (`controls.ts`, `main.ts`) stay thin and are checked by eye in Task 11.

---

### Task 0: Repository setup

> **Needs the user's explicit OK before running.** `git init` creates a repo in the user's project folder.

**Files:**
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Initialize git**

Run: `cd "/Users/paras/Documents/Ancient San Francisco" && git init`
Expected: `Initialized empty Git repository in .../Ancient San Francisco/.git/`

- [ ] **Step 2: Write `.gitignore`**

```gitignore
.DS_Store
__pycache__/
*.pyc
pipeline/.venv/
pipeline/data/raw/
viewer/node_modules/
viewer/dist/
```

- [ ] **Step 3: Write `README.md`**

```markdown
# Yelamu

An interactive 3D map of the San Francisco peninsula as it was around 1769, the
homeland of the Yelamu and the wider Ramaytush Ohlone community.

- Design: `docs/superpowers/specs/`
- Plans: `docs/superpowers/plans/`
- `pipeline/`: offline Python data pipeline (terrain reconstruction)
- `viewer/`: Vite + Three.js viewer
```

- [ ] **Step 4: Commit (including the existing spec and this plan)**

```bash
git add .gitignore README.md docs
git commit -m "chore: initialize repo with design spec and plan"
```

---

### Task 1: Research spike (data sources, licenses, outreach draft)

**Why first:** the spec lists unresolved questions (Section 9). Every later task assumes the answers. A wrong answer here, for example a license that forbids redistribution, changes what we can publish.

**Files:**
- Create: `docs/research/2026-data-sources.md`
- Create: `docs/research/slice.env`
- Create: `docs/research/aro-outreach-draft.md`

This task produces documents, not code. Each step has a concrete acceptance check.

- [ ] **Step 1: Find the elevation source**

Find a USGS 3DEP bare-earth DEM (1/3 arc-second or finer; lidar-derived 1 m or 3 m is better) covering this bounding box, in lon/lat degrees: **west -122.42, south 37.755, east -122.37, north 37.805**. Start at <https://apps.nationalmap.gov/downloader/> (The National Map). Record in `docs/research/2026-data-sources.md`: dataset name, resolution, download URL, CRS, file format, size, and license/terms.

Acceptance: the note contains a URL a person can click to download a GeoTIFF covering the box, and states its CRS.

- [ ] **Step 2: Find the historical water and habitat data**

Read these in order and record what each actually contains:
1. <https://www.sfei.org/data/historical-ecology-gis-data-compilation> (main download page; the search result listed it as GPL with a required citation format)
2. <https://filelib.wildlife.ca.gov/Public/BDB/GIS/BIOS/metadata/DS3201.html> (Historical Habitat Ecology, ds3201) and `DS3202` (Historical Channels)
3. <https://www.sfei.org/projects/mapping-yelamu-s-historical-landscape> (SFEI / Association of Ramaytush Ohlone / Exploratorium project)

For the SFEI layer(s) that cover San Francisco, record: file format, CRS, the attribute field that classifies habitat type, and the exact field values that mean **open bay / tidal flat** versus **tidal marsh**. Record the license and required citation text verbatim.

Acceptance: the note names the exact file to download, the classification field, and two value lists (bay values, marsh values). If SFEI does not cover the San Francisco peninsula at usable detail, write that down plainly. It changes the plan (see Step 6).

- [ ] **Step 3: Check the 1850s Coast Survey sheets**

Search for the 1850s US Coast Survey topographic sheets of the San Francisco peninsula (candidates: NOAA historical map and chart collection, David Rumsey Map Collection, SFEI's own historical-ecology source lists). Record: which sheets cover the test box, scan resolution, whether a georeferenced version exists, and usage terms.

Acceptance: the note says "available and georeferenced", "available but needs georeferencing", or "not found", with links. This is used for hand-sculpting in Task 12, so "needs georeferencing" is acceptable; just say so.

- [ ] **Step 4: Check the Yelamu village-site material**

From the SFEI project page and the Association's site (<https://ramaytush.org/about.html>), record what is published, what is described as in progress, and any stated terms of use. Do not copy site coordinates into the repo.

Acceptance: a short paragraph on what is already public and what is not.

- [ ] **Step 5: Write the outreach draft (do NOT send)**

Create `docs/research/aro-outreach-draft.md`: a short, respectful first message to the Association of Ramaytush Ohlone (contact route from their site). It should say who the user is, what is being built (a landscape-first 3D map of Yelamu), that the cultural layer is optional and will not be built without their input, what is being asked (a conversation; whether and how they'd like to be involved; anything they would want left out), and an offer to share early work. Leave the sign-off for the user.

Acceptance: under 250 words, no claims about the Association's position, and a header line `DRAFT — not sent`.

- [ ] **Step 6: Write `docs/research/slice.env` and decide**

Task 12 reads this file. Create it with these exact variable names, filling each value from Steps 1-2:

```bash
# Consumed by Task 12. Every value comes from docs/research/2026-data-sources.md.
export DEM_URL=""            # Step 1: direct download URL for the DEM GeoTIFF
export SFEI_URL=""           # Step 2: direct download URL for the SFEI layer
export SFEI_LAYER=""         # layer name inside the download (shapefile/gdb layer)
export HABITAT_FIELD=""      # Step 2: attribute field that holds habitat type
export BAY_VALUES=""         # Step 2: SQL list, e.g. 'Open Bay','Tidal Flat'
export MARSH_VALUES=""       # Step 2: SQL list of tidal marsh values
```

Then add a **Decision** section to `2026-data-sources.md`: one of
- **Go**: sources found and licenses allow public redistribution of derived assets with attribution.
- **Go with changes**: say exactly what changes (for example "SFEI layer is coarse; use shoreline only, treat marsh as inferred").
- **Stop**: say why.

Acceptance: no variable in `slice.env` is empty unless the Decision explains why. **If the Decision is Stop, halt here and report to the user. Do not start Task 2.**

- [ ] **Step 7: Commit**

```bash
git add docs/research
git commit -m "docs: research spike on data sources, licenses, and outreach draft"
```

---

### Task 2: Pipeline scaffold and coordinate grid

**Files:**
- Create: `pipeline/pyproject.toml`
- Create: `pipeline/yelamu/__init__.py` (empty)
- Create: `pipeline/yelamu/geo.py`
- Test: `pipeline/tests/test_geo.py`

- [ ] **Step 1: Create `pipeline/pyproject.toml`**

```toml
[project]
name = "yelamu-pipeline"
version = "0.1.0"
description = "Offline data pipeline that reconstructs the ~1769 Yelamu landscape"
requires-python = ">=3.11"
dependencies = [
  "numpy>=1.26",
  "pyproj>=3.6",
  "rasterio>=1.3",
  "shapely>=2.0",
  "Pillow>=10",
]

[dependency-groups]
dev = ["pytest>=8"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["yelamu"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 2: Create the empty package and install**

```bash
mkdir -p pipeline/yelamu pipeline/tests pipeline/scripts
touch pipeline/yelamu/__init__.py
cd pipeline && uv sync
```
Expected: `uv` creates `.venv` and installs numpy, pyproj, rasterio, shapely, Pillow, pytest.

- [ ] **Step 3: Write the failing test `pipeline/tests/test_geo.py`**

```python
import pytest

from yelamu.geo import Grid, lonlat_to_utm


def test_central_meridian_maps_to_false_easting():
    # UTM zone 10N has its central meridian at 123 W, with a false easting of 500000 m.
    x, y = lonlat_to_utm(-123.0, 0.0)
    assert x == pytest.approx(500000.0, abs=0.01)
    assert y == pytest.approx(0.0, abs=0.01)


def test_grid_is_a_whole_number_of_cells():
    g = Grid.from_lonlat_bbox(-122.42, 37.755, -122.37, 37.805, cell=10)
    assert g.east - g.west == pytest.approx(g.width * 10)
    assert g.north - g.south == pytest.approx(g.height * 10)
    # ~0.05 degrees is roughly 4.4 km east-west and 5.5 km north-south.
    assert 400 < g.width < 500
    assert 500 < g.height < 600


def test_pixel_lookup():
    g = Grid(west=1000, south=2000, east=1100, north=2100, cell=10)
    assert g.pixel_of(1005, 2095) == (0, 0)  # north-west corner cell
    assert g.pixel_of(1095, 2005) == (9, 9)  # south-east corner cell
    assert g.pixel_of(5000, 5000) is None
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd pipeline && uv run pytest tests/test_geo.py -v`
Expected: FAIL / ERROR with `ModuleNotFoundError: No module named 'yelamu.geo'`

- [ ] **Step 5: Implement `pipeline/yelamu/geo.py`**

```python
"""Coordinate handling: one local metric grid (UTM zone 10N) for the whole pipeline."""

from __future__ import annotations

import math
from dataclasses import dataclass

from pyproj import Transformer
from rasterio.transform import Affine, from_origin

UTM_CRS = "EPSG:32610"
_TO_UTM = Transformer.from_crs("EPSG:4326", UTM_CRS, always_xy=True)


def lonlat_to_utm(lon: float, lat: float) -> tuple[float, float]:
    x, y = _TO_UTM.transform(lon, lat)
    return x, y


@dataclass(frozen=True)
class Grid:
    """A north-up raster grid in UTM metres. Row 0 is the northern edge."""

    west: float
    south: float
    east: float
    north: float
    cell: float

    @property
    def width(self) -> int:
        return round((self.east - self.west) / self.cell)

    @property
    def height(self) -> int:
        return round((self.north - self.south) / self.cell)

    def transform(self) -> Affine:
        return from_origin(self.west, self.north, self.cell, self.cell)

    @classmethod
    def from_lonlat_bbox(
        cls, west: float, south: float, east: float, north: float, cell: float
    ) -> "Grid":
        corners = [
            lonlat_to_utm(west, south),
            lonlat_to_utm(west, north),
            lonlat_to_utm(east, south),
            lonlat_to_utm(east, north),
        ]
        xs = [c[0] for c in corners]
        ys = [c[1] for c in corners]
        x0, y1 = min(xs), max(ys)
        # Snap the far edges outwards so the grid is a whole number of cells.
        x1 = x0 + math.ceil((max(xs) - x0) / cell) * cell
        y0 = y1 - math.ceil((y1 - min(ys)) / cell) * cell
        return cls(west=x0, south=y0, east=x1, north=y1, cell=cell)

    def pixel_of(self, x: float, y: float) -> tuple[int, int] | None:
        """(row, col) of the cell containing UTM point (x, y), or None if outside."""
        col = math.floor((x - self.west) / self.cell)
        row = math.floor((self.north - y) / self.cell)
        if 0 <= row < self.height and 0 <= col < self.width:
            return row, col
        return None
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd pipeline && uv run pytest tests/test_geo.py -v`
Expected: 3 passed

- [ ] **Step 7: Commit**

```bash
git add pipeline/pyproject.toml pipeline/uv.lock pipeline/yelamu pipeline/tests
git commit -m "feat(pipeline): scaffold project and UTM grid"
```

---

### Task 3: Water mask

**Files:**
- Create: `pipeline/yelamu/water.py`
- Test: `pipeline/tests/test_water.py`

- [ ] **Step 1: Write the failing test `pipeline/tests/test_water.py`**

```python
import numpy as np
from shapely.geometry import box

from yelamu.geo import Grid
from yelamu.water import water_mask

GRID = Grid(west=0, south=0, east=100, north=100, cell=10)  # 10 x 10 cells


def test_polygon_over_west_half_masks_west_half():
    mask = water_mask([box(0, 0, 50, 100)], GRID)
    assert mask.shape == (10, 10)
    assert mask[:, :5].all()
    assert not mask[:, 5:].any()


def test_no_polygons_gives_empty_mask():
    mask = water_mask([], GRID)
    assert mask.shape == (10, 10)
    assert not mask.any()


def test_north_is_row_zero():
    # A polygon over the northern 20 m must light up the first two rows.
    mask = water_mask([box(0, 80, 100, 100)], GRID)
    assert mask[:2].all()
    assert not mask[2:].any()
    assert np.count_nonzero(mask) == 20
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd pipeline && uv run pytest tests/test_water.py -v`
Expected: ERROR `No module named 'yelamu.water'`

- [ ] **Step 3: Implement `pipeline/yelamu/water.py`**

```python
"""Turn historical water polygons (UTM metres) into a boolean mask on the grid."""

from __future__ import annotations

from typing import Sequence

import numpy as np
from rasterio.features import rasterize
from shapely.geometry.base import BaseGeometry

from yelamu.geo import Grid


def water_mask(polygons: Sequence[BaseGeometry], grid: Grid) -> np.ndarray:
    """True where a cell centre falls inside any polygon. Shape is (height, width)."""
    if len(polygons) == 0:
        return np.zeros((grid.height, grid.width), dtype=bool)
    burned = rasterize(
        [(geom, 1) for geom in polygons],
        out_shape=(grid.height, grid.width),
        transform=grid.transform(),
        fill=0,
        dtype="uint8",
    )
    return burned.astype(bool)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd pipeline && uv run pytest tests/test_water.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add pipeline/yelamu/water.py pipeline/tests/test_water.py
git commit -m "feat(pipeline): rasterize historical water polygons to a mask"
```

---

### Task 4: Terrain edits (de-developing the DEM)

**Files:**
- Create: `pipeline/yelamu/terrain.py`
- Test: `pipeline/tests/test_terrain.py`

- [ ] **Step 1: Write the failing test `pipeline/tests/test_terrain.py`**

```python
import numpy as np
import pytest

from yelamu.geo import Grid
from yelamu.terrain import apply_historical_water, stamp_landform


def test_fill_inside_bay_is_lowered_to_bay_floor():
    dem = np.full((4, 4), 5.0, dtype="float32")  # modern fill, 5 m above sea level
    bay = np.zeros((4, 4), dtype=bool)
    bay[:, :2] = True
    marsh = np.zeros((4, 4), dtype=bool)
    out = apply_historical_water(dem, bay, marsh, bay_floor=-3.0)
    assert (out[:, :2] == -3.0).all()
    assert (out[:, 2:] == 5.0).all()  # dry land is untouched


def test_marsh_is_set_to_marsh_level_and_bay_wins_overlap():
    dem = np.full((2, 2), 4.0, dtype="float32")
    bay = np.array([[True, False], [False, False]])
    marsh = np.array([[True, True], [False, False]])
    out = apply_historical_water(dem, bay, marsh, bay_floor=-3.0, marsh_level=0.5)
    assert out[0, 0] == -3.0  # overlap: bay wins
    assert out[0, 1] == 0.5  # marsh only
    assert out[1, 0] == 4.0 and out[1, 1] == 4.0


def test_dry_land_is_never_below_sea_level():
    dem = np.array([[-2.0, 3.0]], dtype="float32")
    none = np.zeros((1, 2), dtype=bool)
    out = apply_historical_water(dem, none, none)
    assert out[0, 0] == 0.0 and out[0, 1] == 3.0


def test_stamp_raises_centre_and_leaves_far_cells_alone():
    grid = Grid(west=0, south=0, east=200, north=200, cell=10)  # 20 x 20
    dem = np.zeros((20, 20), dtype="float32")
    # (105, 95) is the exact centre of the cell at row 10, col 10.
    out = stamp_landform(dem, grid, x=105, y=95, radius_m=50, delta_m=20)
    assert out[10, 10] == pytest.approx(20.0, abs=1e-4)
    assert out[0, 0] == 0.0  # well outside the radius
    assert out[10, 10] > out[10, 12] > out[10, 14] >= 0.0  # smooth falloff


def test_negative_delta_lowers_ground():
    grid = Grid(west=0, south=0, east=200, north=200, cell=10)
    dem = np.full((20, 20), 30.0, dtype="float32")
    out = stamp_landform(dem, grid, x=105, y=95, radius_m=50, delta_m=-20)
    assert out[10, 10] == pytest.approx(10.0, abs=1e-4)
    assert out[0, 0] == 30.0
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd pipeline && uv run pytest tests/test_terrain.py -v`
Expected: ERROR `No module named 'yelamu.terrain'`

- [ ] **Step 3: Implement `pipeline/yelamu/terrain.py`**

```python
"""Edits that turn a modern elevation model into a ~1769 one."""

from __future__ import annotations

import numpy as np

from yelamu.geo import Grid


def apply_historical_water(
    dem: np.ndarray,
    bay: np.ndarray,
    marsh: np.ndarray,
    bay_floor: float = -3.0,
    marsh_level: float = 0.5,
) -> np.ndarray:
    """Overwrite reclaimed ground with its historical water level.

    Bay wins over marsh where the masks overlap. Dry land is clamped to >= 0 m so
    survey noise can't dig phantom pits below sea level.
    """
    out = dem.astype("float32", copy=True)
    land = ~(bay | marsh)
    out[land] = np.maximum(out[land], 0.0)
    out[marsh & ~bay] = marsh_level
    out[bay] = bay_floor
    return out


def stamp_landform(
    dem: np.ndarray, grid: Grid, x: float, y: float, radius_m: float, delta_m: float
) -> np.ndarray:
    """Raise (delta_m > 0) or lower (delta_m < 0) the ground around (x, y).

    The change falls off smoothly (a raised-cosine bump) to zero at radius_m, so a
    restored dune or a re-cut hill blends into the surrounding terrain.
    """
    xs = grid.west + (np.arange(grid.width) + 0.5) * grid.cell
    ys = grid.north - (np.arange(grid.height) + 0.5) * grid.cell
    xx, yy = np.meshgrid(xs, ys)
    dist = np.hypot(xx - x, yy - y)
    weight = np.where(dist < radius_m, 0.5 * (1.0 + np.cos(np.pi * dist / radius_m)), 0.0)
    return (dem + delta_m * weight).astype("float32")
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd pipeline && uv run pytest tests/test_terrain.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add pipeline/yelamu/terrain.py pipeline/tests/test_terrain.py
git commit -m "feat(pipeline): historical-water and landform terrain edits"
```

---

### Task 5: Asset export (the contract with the viewer)

This task defines the file format both halves depend on. **Heights are packed into an 8-bit RGB PNG** (R = high byte, G = low byte of a 16-bit value) rather than a 16-bit PNG. Browsers read PNG pixels through `<canvas>`, which reduces 16-bit images to 8 bits and would flatten the terrain into 256 height steps.

**Files:**
- Create: `pipeline/yelamu/export.py`
- Test: `pipeline/tests/test_export.py`

- [ ] **Step 1: Write the failing test `pipeline/tests/test_export.py`**

```python
import json

import numpy as np
import pytest
from PIL import Image

from yelamu.export import Layer, decode_heights, encode_heights, write_assets
from yelamu.geo import Grid


def test_encode_decode_round_trip_is_sub_millimetre_precise():
    dem = np.array([[-3.0, 0.0, 12.345], [100.0, 250.5, 281.0]], dtype="float32")
    rgb = encode_heights(dem, min_m=-10.0, max_m=300.0)
    assert rgb.dtype == np.uint8 and rgb.shape == (2, 3, 3)
    back = decode_heights(rgb, min_m=-10.0, max_m=300.0)
    # 310 m of range over 65535 steps is ~4.7 mm per step.
    assert np.abs(back - dem).max() < 0.005


def test_known_byte_values():
    # The range floor maps to 0x0000 and the ceiling to 0xFFFF.
    rgb = encode_heights(np.array([[0.0, 10.0]], dtype="float32"), min_m=0.0, max_m=10.0)
    assert rgb[0, 0].tolist() == [0, 0, 0]
    assert rgb[0, 1].tolist() == [255, 255, 0]


def test_layer_rejects_unknown_confidence():
    with pytest.raises(ValueError):
        Layer(id="x", source="s", confidence="guess", attribution="a")


def test_write_assets_creates_png_and_meta(tmp_path):
    grid = Grid(west=500000, south=4180000, east=500040, north=4180030, cell=10)  # 4 x 3
    dem = np.arange(12, dtype="float32").reshape(3, 4) - 2.0  # -2 .. 9
    layers = [Layer("terrain", "USGS 3DEP", "inferred", "USGS")]

    meta = write_assets(dem, grid, layers, tmp_path)

    assert (tmp_path / "heightmap.png").exists()
    on_disk = json.loads((tmp_path / "meta.json").read_text())
    assert on_disk == meta
    assert (meta["width"], meta["height"], meta["cell_m"]) == (4, 3, 10)
    assert (meta["min_m"], meta["max_m"]) == (-2.0, 9.0)
    assert meta["layers"][0]["confidence"] == "inferred"

    img = np.asarray(Image.open(tmp_path / "heightmap.png"))
    assert img.shape == (3, 4, 3)
    back = decode_heights(img, meta["min_m"], meta["max_m"])
    assert np.abs(back - dem).max() < 0.001
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd pipeline && uv run pytest tests/test_export.py -v`
Expected: ERROR `No module named 'yelamu.export'`

- [ ] **Step 3: Implement `pipeline/yelamu/export.py`**

```python
"""Write the static assets the viewer loads: heightmap PNG + meta.json.

Heights are packed into an ordinary 8-bit RGB PNG (R = high byte, G = low byte of a
16-bit value). Browsers decode 16-bit PNGs down to 8 bits through <canvas>, which
would silently flatten the terrain into 256 height steps; two 8-bit channels survive.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from yelamu.geo import UTM_CRS, Grid

CONFIDENCE_LEVELS = ("documented", "inferred", "illustrative")


@dataclass(frozen=True)
class Layer:
    id: str
    source: str
    confidence: str
    attribution: str

    def __post_init__(self) -> None:
        if self.confidence not in CONFIDENCE_LEVELS:
            raise ValueError(
                f"confidence must be one of {CONFIDENCE_LEVELS}, got {self.confidence!r}"
            )


def encode_heights(dem: np.ndarray, min_m: float, max_m: float) -> np.ndarray:
    """Pack metres into an (H, W, 3) uint8 array: R = high byte, G = low byte."""
    span = max_m - min_m
    unit = np.clip((dem - min_m) / span, 0.0, 1.0)
    q = np.rint(unit * 65535.0).astype(np.uint32)
    rgb = np.zeros((*dem.shape, 3), dtype=np.uint8)
    rgb[..., 0] = (q >> 8).astype(np.uint8)
    rgb[..., 1] = (q & 0xFF).astype(np.uint8)
    return rgb


def decode_heights(rgb: np.ndarray, min_m: float, max_m: float) -> np.ndarray:
    q = rgb[..., 0].astype(np.uint32) * 256 + rgb[..., 1].astype(np.uint32)
    return (min_m + q.astype(np.float64) / 65535.0 * (max_m - min_m)).astype("float32")


def write_assets(dem: np.ndarray, grid: Grid, layers: list[Layer], out_dir: Path) -> dict:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    min_m = float(math.floor(dem.min()))
    max_m = float(math.ceil(dem.max()))
    if max_m <= min_m:
        max_m = min_m + 1.0

    Image.fromarray(encode_heights(dem, min_m, max_m), mode="RGB").save(
        out_dir / "heightmap.png"
    )
    meta = {
        "width": grid.width,
        "height": grid.height,
        "cell_m": grid.cell,
        "min_m": min_m,
        "max_m": max_m,
        "crs": UTM_CRS,
        "west": grid.west,
        "south": grid.south,
        "east": grid.east,
        "north": grid.north,
        "layers": [asdict(layer) for layer in layers],
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd pipeline && uv run pytest tests/test_export.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add pipeline/yelamu/export.py pipeline/tests/test_export.py
git commit -m "feat(pipeline): export heightmap PNG and meta.json with layer provenance"
```

---

### Task 6: Loaders, sanity checks, and the CLI

**Files:**
- Create: `pipeline/yelamu/sources.py`
- Create: `pipeline/yelamu/checks.py`
- Create: `pipeline/yelamu/cli.py`
- Test: `pipeline/tests/test_pipeline.py`

- [ ] **Step 1: Write the failing test `pipeline/tests/test_pipeline.py`**

```python
"""End-to-end test on synthetic data: a flat 'modern fill' DEM with a historical bay."""

import json

import numpy as np
import rasterio
from PIL import Image
from rasterio.transform import from_origin
from shapely.geometry import Point

from yelamu.checks import Expectation, run_checks
from yelamu.cli import main
from yelamu.export import decode_heights
from yelamu.geo import UTM_CRS, Grid, lonlat_to_utm
from yelamu.sources import load_dem, load_polygons

BBOX = (-122.42, 37.755, -122.37, 37.805)


def _write_dem(path, grid: Grid, value: float) -> None:
    """A flat DEM covering the grid (plus margin), in UTM so no resampling surprises."""
    margin = 200
    width = grid.width + 2 * margin // int(grid.cell)
    height = grid.height + 2 * margin // int(grid.cell)
    transform = from_origin(grid.west - margin, grid.north + margin, grid.cell, grid.cell)
    with rasterio.open(
        path, "w", driver="GTiff", height=height, width=width, count=1,
        dtype="float32", crs=UTM_CRS, transform=transform,
    ) as dst:
        dst.write(np.full((height, width), value, dtype="float32"), 1)


def _write_bay_geojson(path, lon0, lat0, lon1, lat1) -> None:
    ring = [[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]]
    path.write_text(json.dumps({
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "properties": {},
                      "geometry": {"type": "Polygon", "coordinates": [ring]}}],
    }))


def test_load_dem_reproduces_values_on_the_grid(tmp_path):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem(tmp_path / "dem.tif", grid, 7.0)
    dem = load_dem(tmp_path / "dem.tif", grid)
    assert dem.shape == (grid.height, grid.width)
    assert np.allclose(dem, 7.0)


def test_load_polygons_reprojects_to_utm(tmp_path):
    _write_bay_geojson(tmp_path / "bay.geojson", -122.40, 37.77, -122.39, 37.78)
    (geom,) = load_polygons(tmp_path / "bay.geojson")
    x, y = lonlat_to_utm(-122.395, 37.775)
    assert geom.contains(Point(x, y))


def test_cli_end_to_end_lowers_reclaimed_land(tmp_path):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem(tmp_path / "dem.tif", grid, 5.0)  # everything is 5 m 'modern fill'
    _write_bay_geojson(tmp_path / "bay.geojson", -122.40, 37.77, -122.38, 37.79)
    out = tmp_path / "out"

    code = main([
        "--dem", str(tmp_path / "dem.tif"),
        "--bbox", *map(str, BBOX),
        "--out", str(out),
        "--bay", str(tmp_path / "bay.geojson"),
    ])

    assert code == 0
    meta = json.loads((out / "meta.json").read_text())
    assert meta["min_m"] == -3.0 and meta["max_m"] == 5.0
    heights = decode_heights(
        np.asarray(Image.open(out / "heightmap.png")), meta["min_m"], meta["max_m"]
    )
    x, y = lonlat_to_utm(-122.39, 37.78)  # inside the bay polygon
    row, col = grid.pixel_of(x, y)
    assert abs(heights[row, col] - (-3.0)) < 0.01
    x, y = lonlat_to_utm(-122.415, 37.76)  # dry land outside it
    row, col = grid.pixel_of(x, y)
    assert abs(heights[row, col] - 5.0) < 0.01


def test_run_checks_reports_failures_and_outside_points():
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    dem = np.full((grid.height, grid.width), 2.0, dtype="float32")
    failures = run_checks(dem, grid, [
        Expectation("low spot ok", -122.39, 37.78, max_m=3.0),
        Expectation("hill too low", -122.40, 37.78, min_m=60.0),
        Expectation("off the map", -100.0, 10.0, min_m=0.0),
    ])
    assert len(failures) == 2
    assert "hill too low" in failures[0]
    assert "outside the grid" in failures[1]


def test_cli_exits_2_when_a_check_fails(tmp_path):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem(tmp_path / "dem.tif", grid, 5.0)
    (tmp_path / "checks.json").write_text(json.dumps(
        [{"name": "needs a hill", "lon": -122.40, "lat": 37.78, "min_m": 60.0}]
    ))
    code = main([
        "--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX),
        "--out", str(tmp_path / "out"), "--checks", str(tmp_path / "checks.json"),
    ])
    assert code == 2
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd pipeline && uv run pytest tests/test_pipeline.py -v`
Expected: ERROR `No module named 'yelamu.checks'` (or `sources`)

- [ ] **Step 3: Implement `pipeline/yelamu/sources.py`**

```python
"""Loaders for the raw inputs: a DEM GeoTIFF and GeoJSON polygon files."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import rasterio
import shapely
from pyproj import Transformer
from rasterio.warp import Resampling, reproject
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry

from yelamu.geo import UTM_CRS, Grid

_LONLAT_TO_UTM = Transformer.from_crs("EPSG:4326", UTM_CRS, always_xy=True)


def _to_utm(geom: BaseGeometry) -> BaseGeometry:
    def project(coords: np.ndarray) -> np.ndarray:
        x, y = _LONLAT_TO_UTM.transform(coords[:, 0], coords[:, 1])
        return np.column_stack([x, y])

    return shapely.transform(geom, project)


def load_dem(path: Path, grid: Grid) -> np.ndarray:
    """Resample a DEM (any CRS) onto the grid. Cells with no data become 0 m."""
    dst = np.full((grid.height, grid.width), np.nan, dtype="float32")
    with rasterio.open(path) as src:
        reproject(
            source=rasterio.band(src, 1),
            destination=dst,
            dst_transform=grid.transform(),
            dst_crs=UTM_CRS,
            resampling=Resampling.bilinear,
            src_nodata=src.nodata,
            dst_nodata=np.nan,
        )
    return np.nan_to_num(dst, nan=0.0).astype("float32")


def load_polygons(path: Path) -> list[BaseGeometry]:
    """Read a GeoJSON FeatureCollection in lon/lat (EPSG:4326); return UTM geometries."""
    data = json.loads(Path(path).read_text())
    features = data["features"] if data.get("type") == "FeatureCollection" else [data]
    geoms = []
    for feature in features:
        geom = shape(feature["geometry"] if "geometry" in feature else feature)
        geoms.append(_to_utm(geom))
    return geoms
```

- [ ] **Step 4: Implement `pipeline/yelamu/checks.py`**

```python
"""Sanity checks: known places must land in a plausible height range."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from yelamu.geo import Grid, lonlat_to_utm


@dataclass(frozen=True)
class Expectation:
    name: str
    lon: float
    lat: float
    min_m: float | None = None
    max_m: float | None = None


def load_expectations(path: Path) -> list[Expectation]:
    return [Expectation(**item) for item in json.loads(Path(path).read_text())]


def run_checks(dem: np.ndarray, grid: Grid, expectations: list[Expectation]) -> list[str]:
    """Return a list of human-readable failures (empty means all checks passed)."""
    failures = []
    for e in expectations:
        x, y = lonlat_to_utm(e.lon, e.lat)
        pixel = grid.pixel_of(x, y)
        if pixel is None:
            failures.append(f"{e.name}: point is outside the grid")
            continue
        h = float(dem[pixel])
        if e.min_m is not None and h < e.min_m:
            failures.append(f"{e.name}: {h:.1f} m is below the expected minimum {e.min_m} m")
        if e.max_m is not None and h > e.max_m:
            failures.append(f"{e.name}: {h:.1f} m is above the expected maximum {e.max_m} m")
    return failures
```

- [ ] **Step 5: Implement `pipeline/yelamu/cli.py`**

```python
"""Command line entry point: build the heightmap assets for one bounding box."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from yelamu.checks import load_expectations, run_checks
from yelamu.export import Layer, write_assets
from yelamu.geo import Grid, lonlat_to_utm
from yelamu.sources import load_dem, load_polygons
from yelamu.terrain import apply_historical_water, stamp_landform
from yelamu.water import water_mask


def build(
    dem_path: Path,
    bbox: tuple[float, float, float, float],
    cell: float,
    out_dir: Path,
    bay_path: Path | None = None,
    marsh_path: Path | None = None,
    landforms_path: Path | None = None,
    checks_path: Path | None = None,
) -> list[str]:
    """Run the pipeline. Returns the list of failed sanity checks (empty is good)."""
    grid = Grid.from_lonlat_bbox(*bbox, cell=cell)
    dem = load_dem(dem_path, grid)

    bay = water_mask(load_polygons(bay_path) if bay_path else [], grid)
    marsh = water_mask(load_polygons(marsh_path) if marsh_path else [], grid)
    dem = apply_historical_water(dem, bay, marsh)

    if landforms_path:
        for lf in json.loads(Path(landforms_path).read_text()):
            x, y = lonlat_to_utm(lf["lon"], lf["lat"])
            dem = stamp_landform(dem, grid, x, y, lf["radius_m"], lf["delta_m"])

    layers = [
        Layer("terrain", "USGS 3DEP, modified", "inferred", "USGS 3DEP; see docs/research"),
        Layer("water", "SFEI historical ecology", "documented", "SFEI; see docs/research"),
    ]
    if landforms_path:
        layers.append(
            Layer("landforms", "hand-sculpted corrections", "illustrative", "this project")
        )
    write_assets(dem, grid, layers, out_dir)

    if checks_path:
        return run_checks(dem, grid, load_expectations(checks_path))
    return []


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="yelamu")
    p.add_argument("--dem", type=Path, required=True)
    p.add_argument("--bbox", type=float, nargs=4, required=True,
                   metavar=("WEST", "SOUTH", "EAST", "NORTH"), help="lon/lat degrees")
    p.add_argument("--cell", type=float, default=10.0, help="metres per pixel")
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--bay", type=Path, help="GeoJSON of historical bay water")
    p.add_argument("--marsh", type=Path, help="GeoJSON of historical marsh")
    p.add_argument("--landforms", type=Path, help="JSON list of hand-sculpted landforms")
    p.add_argument("--checks", type=Path, help="JSON list of height expectations")
    args = p.parse_args(argv)

    failures = build(
        args.dem, tuple(args.bbox), args.cell, args.out,
        args.bay, args.marsh, args.landforms, args.checks,
    )
    if failures:
        print("Sanity checks FAILED:", file=sys.stderr)
        for line in failures:
            print(f"  - {line}", file=sys.stderr)
        return 2
    print(f"Wrote assets to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 6: Run the whole Python suite**

Run: `cd pipeline && uv run pytest -v`
Expected: 20 passed, no warnings

- [ ] **Step 7: Commit**

```bash
git add pipeline/yelamu pipeline/tests
git commit -m "feat(pipeline): DEM/GeoJSON loaders, sanity checks, and build CLI"
```

---

### Task 7: Viewer scaffold

**Files:**
- Create: `viewer/package.json`
- Create: `viewer/tsconfig.json`
- Create: `viewer/index.html`

- [ ] **Step 1: Create `viewer/package.json`**

```json
{
  "name": "yelamu-viewer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd viewer
npm install three
npm install -D typescript vite vitest @types/three
```
Expected: `found 0 vulnerabilities` after each. npm writes the resolved versions into `package.json`.

- [ ] **Step 3: Create `viewer/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `viewer/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Yelamu</title>
    <style>
      html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; }
      #scene { width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
      #status {
        position: fixed; left: 12px; bottom: 12px; padding: 6px 10px;
        background: rgba(255, 255, 255, 0.85); border-radius: 6px; font-size: 13px;
      }
    </style>
  </head>
  <body>
    <canvas id="scene"></canvas>
    <div id="status">Loading...</div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Commit**

```bash
git add viewer/package.json viewer/package-lock.json viewer/tsconfig.json viewer/index.html
git commit -m "chore(viewer): scaffold Vite + TypeScript + Three.js"
```

---

### Task 8: Heightmap decoding

**Files:**
- Create: `viewer/src/heightmap.ts`
- Test: `viewer/src/heightmap.test.ts`

- [ ] **Step 1: Write the failing test `viewer/src/heightmap.test.ts`**

The byte fixture in the second test was produced by the Python encoder (`encode_heights([12.345, -3.0, 281.0], -10, 300)`), so this test also guards the cross-language contract.

```ts
import { describe, expect, it } from "vitest";
import { decodeHeights } from "./heightmap";

describe("decodeHeights", () => {
  it("maps the range floor and ceiling to min_m and max_m", () => {
    const rgba = [0, 0, 0, 255, 255, 255, 0, 255];
    const out = decodeHeights(rgba, { width: 2, height: 1, min_m: 0, max_m: 10 });
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(10, 5);
  });

  it("agrees with the Python encoder (pipeline/yelamu/export.py)", () => {
    // Bytes produced by encode_heights([12.345, -3.0, 281.0], -10, 300).
    const rgba = [18, 116, 0, 255, 5, 200, 0, 255, 240, 78, 0, 255];
    const out = decodeHeights(rgba, { width: 3, height: 1, min_m: -10, max_m: 300 });
    expect(out[0]).toBeCloseTo(12.3459, 3);
    expect(out[1]).toBeCloseTo(-2.9992, 3);
    expect(out[2]).toBeCloseTo(280.9984, 3);
  });

  it("rejects a pixel buffer of the wrong size", () => {
    expect(() =>
      decodeHeights([0, 0, 0, 255], { width: 2, height: 2, min_m: 0, max_m: 1 }),
    ).toThrow(/expected 16 bytes/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd viewer && npm test`
Expected: FAIL: cannot resolve `./heightmap`

- [ ] **Step 3: Implement `viewer/src/heightmap.ts`**

```ts
export type Confidence = "documented" | "inferred" | "illustrative";

export interface LayerInfo {
  id: string;
  source: string;
  confidence: Confidence;
  attribution: string;
}

export interface HeightmapMeta {
  width: number;
  height: number;
  cell_m: number;
  min_m: number;
  max_m: number;
  layers: LayerInfo[];
}

/**
 * Decode heights (metres) from RGBA pixel bytes. The pipeline packs a 16-bit height
 * into R (high byte) and G (low byte); see pipeline/yelamu/export.py.
 */
export function decodeHeights(
  rgba: ArrayLike<number>,
  meta: Pick<HeightmapMeta, "width" | "height" | "min_m" | "max_m">,
): Float32Array {
  const count = meta.width * meta.height;
  if (rgba.length !== count * 4) {
    throw new Error(`expected ${count * 4} bytes for ${meta.width}x${meta.height}, got ${rgba.length}`);
  }
  const span = meta.max_m - meta.min_m;
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const q = rgba[i * 4] * 256 + rgba[i * 4 + 1];
    out[i] = meta.min_m + (q / 65535) * span;
  }
  return out;
}

export async function loadHeightmap(
  baseUrl: string,
): Promise<{ meta: HeightmapMeta; heights: Float32Array }> {
  const meta: HeightmapMeta = await (await fetch(`${baseUrl}/meta.json`)).json();
  const blob = await (await fetch(`${baseUrl}/heightmap.png`)).blob();
  // 'none' matters: any colour management or alpha premultiplication would change
  // the bytes, and the bytes ARE the data.
  const bitmap = await createImageBitmap(blob, {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { meta, heights: decodeHeights(data, meta) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd viewer && npm test`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add viewer/src/heightmap.ts viewer/src/heightmap.test.ts
git commit -m "feat(viewer): decode packed heightmap bytes"
```

---

### Task 9: Terrain mesh

**Files:**
- Create: `viewer/src/terrainMesh.ts`
- Test: `viewer/src/terrainMesh.test.ts`

- [ ] **Step 1: Write the failing test `viewer/src/terrainMesh.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { buildTerrainGeometry } from "./terrainMesh";

const size = { width: 3, height: 3, cell_m: 10 };
// Row 0 is the NORTH edge. Heights 0..8 make every vertex identifiable.
const heights = Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8]);

describe("buildTerrainGeometry", () => {
  const geo = buildTerrainGeometry(heights, size);
  const pos = geo.getAttribute("position");

  it("puts each height on the matching vertex", () => {
    for (let i = 0; i < 9; i++) expect(pos.getY(i)).toBeCloseTo(i);
  });

  it("is centred on the origin and spans (n-1) cells", () => {
    expect(pos.getX(0)).toBeCloseTo(-10); // west edge
    expect(pos.getX(2)).toBeCloseTo(10); // east edge
  });

  it("puts row 0 (north) at negative Z", () => {
    expect(pos.getZ(0)).toBeCloseTo(-10); // north-west corner
    expect(pos.getZ(6)).toBeCloseTo(10); // south-west corner
  });

  it("applies vertical exaggeration", () => {
    const tall = buildTerrainGeometry(heights, size, 3);
    expect(tall.getAttribute("position").getY(8)).toBeCloseTo(24);
  });

  it("rejects mismatched sizes", () => {
    expect(() => buildTerrainGeometry(new Float32Array(4), size)).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd viewer && npm test`
Expected: FAIL: cannot resolve `./terrainMesh`

- [ ] **Step 3: Implement `viewer/src/terrainMesh.ts`**

```ts
import * as THREE from "three";

export interface GridSize {
  width: number;
  height: number;
  cell_m: number;
}

/**
 * Build a terrain mesh centred on the origin. +X is east, +Y is up, and north is -Z
 * (so a camera placed to the south looks "up" the map). Vertex i matches pixel i of
 * the heightmap: row-major, row 0 = northern edge.
 */
export function buildTerrainGeometry(
  heights: Float32Array,
  size: GridSize,
  exaggeration = 1,
): THREE.BufferGeometry {
  const { width, height, cell_m } = size;
  if (heights.length !== width * height) {
    throw new Error(`heights has ${heights.length} samples, expected ${width * height}`);
  }
  // Vertices sit at cell centres, so the mesh spans (n - 1) cells per axis.
  const geometry = new THREE.PlaneGeometry(
    (width - 1) * cell_m,
    (height - 1) * cell_m,
    width - 1,
    height - 1,
  );
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    position.setY(i, heights[i] * exaggeration);
  }
  geometry.computeVertexNormals();
  return geometry;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd viewer && npm test`
Expected: 8 passed (3 heightmap + 5 terrainMesh)

- [ ] **Step 5: Commit**

```bash
git add viewer/src/terrainMesh.ts viewer/src/terrainMesh.test.ts
git commit -m "feat(viewer): build terrain geometry from heights"
```

---

### Task 10: Isometric camera math

**Files:**
- Create: `viewer/src/camera.ts`
- Test: `viewer/src/camera.test.ts`

- [ ] **Step 1: Write the failing test `viewer/src/camera.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { ISO_ELEVATION, isoOffset, panDelta } from "./camera";

describe("isoOffset", () => {
  it("has the requested length", () => {
    expect(isoOffset(100, Math.PI / 4, ISO_ELEVATION).length()).toBeCloseTo(100);
  });

  it("looks down at the isometric angle", () => {
    const v = isoOffset(1, Math.PI / 4, ISO_ELEVATION);
    expect(Math.asin(v.y)).toBeCloseTo(35.264 * (Math.PI / 180), 3);
  });

  it("azimuth 0 puts the camera due south of the target", () => {
    const v = isoOffset(10, 0, Math.PI / 4);
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeGreaterThan(0); // +Z is south
  });
});

describe("panDelta", () => {
  it("dragging right moves the target west so the map follows the cursor", () => {
    const d = panDelta(10, 0, 1, 0, Math.PI / 2);
    expect(d.x).toBeCloseTo(-10);
    expect(d.z).toBeCloseTo(0);
  });

  it("dragging down moves the target north (top-down view)", () => {
    const d = panDelta(0, 10, 1, 0, Math.PI / 2);
    expect(d.x).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(-10);
  });

  it("compensates for foreshortening at the isometric angle", () => {
    const flat = panDelta(0, 10, 1, 0, Math.PI / 2).length();
    const iso = panDelta(0, 10, 1, 0, ISO_ELEVATION).length();
    expect(iso / flat).toBeCloseTo(1 / Math.sin(ISO_ELEVATION), 5);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd viewer && npm test`
Expected: FAIL: cannot resolve `./camera`

- [ ] **Step 3: Implement `viewer/src/camera.ts`**

```ts
import * as THREE from "three";

/** True isometric: 45 degrees round, looking down at atan(1/sqrt(2)) (about 35.26 deg). */
export const ISO_AZIMUTH = Math.PI / 4;
export const ISO_ELEVATION = Math.atan(1 / Math.SQRT2);

/** Camera offset from its target. Azimuth 0 puts the camera due south of the target. */
export function isoOffset(distance: number, azimuth: number, elevation: number): THREE.Vector3 {
  return new THREE.Vector3(
    distance * Math.cos(elevation) * Math.sin(azimuth),
    distance * Math.sin(elevation),
    distance * Math.cos(elevation) * Math.cos(azimuth),
  );
}

/**
 * How far the camera target moves on the ground for a mouse drag of (dx, dy) pixels,
 * so the terrain appears to follow the cursor.
 */
export function panDelta(
  dx: number,
  dy: number,
  unitsPerPixel: number,
  azimuth: number,
  elevation: number,
): THREE.Vector3 {
  const right = new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth));
  const forward = new THREE.Vector3(-Math.sin(azimuth), 0, -Math.cos(azimuth));
  // A ground distance d along `forward` shows up on screen as d * sin(elevation).
  const forwardScale = 1 / Math.sin(elevation);
  return right
    .multiplyScalar(-dx * unitsPerPixel)
    .add(forward.multiplyScalar(dy * unitsPerPixel * forwardScale));
}

export function createIsoCamera(viewSize: number, aspect: number): THREE.OrthographicCamera {
  const half = viewSize / 2;
  // Huge near/far: an orthographic camera does not care, and the terrain is tall.
  return new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, -1e5, 1e5);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd viewer && npm test`
Expected: 14 passed (3 heightmap + 5 terrainMesh + 6 camera)

- [ ] **Step 5: Commit**

```bash
git add viewer/src/camera.ts viewer/src/camera.test.ts
git commit -m "feat(viewer): isometric camera and pan math"
```

---

### Task 11: Controls, scene assembly, and visual check on synthetic data

`controls.ts` and `main.ts` touch the DOM and WebGL, so they are verified by running the app, not by unit tests. A synthetic landscape lets us verify the viewer before any real data exists.

**Files:**
- Create: `viewer/src/controls.ts`
- Create: `viewer/src/main.ts`
- Create: `pipeline/scripts/make_demo_assets.py`
- Create (generated): `viewer/public/assets/slice/heightmap.png`, `viewer/public/assets/slice/meta.json`

- [ ] **Step 1: Create `viewer/src/controls.ts`**

```ts
import * as THREE from "three";
import { ISO_AZIMUTH, ISO_ELEVATION, isoOffset, panDelta } from "./camera";

const CAMERA_DISTANCE = 20000;

/** Drag to pan, wheel / pinch to zoom. Keeps the isometric angle fixed. */
export function attachControls(
  canvas: HTMLCanvasElement,
  camera: THREE.OrthographicCamera,
  onChange: () => void,
): { target: THREE.Vector3; place: () => void } {
  const target = new THREE.Vector3();
  const offset = isoOffset(CAMERA_DISTANCE, ISO_AZIMUTH, ISO_ELEVATION);

  const place = () => {
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    onChange();
  };

  const unitsPerPixel = () => (camera.top - camera.bottom) / camera.zoom / canvas.clientHeight;

  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart = 0;
  let zoomStart = 1;

  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      pinchStart = pinchDistance();
      zoomStart = camera.zoom;
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, next);
    if (pointers.size === 1) {
      target.add(
        panDelta(next.x - prev.x, next.y - prev.y, unitsPerPixel(), ISO_AZIMUTH, ISO_ELEVATION),
      );
    } else if (pointers.size === 2 && pinchStart > 0) {
      camera.zoom = THREE.MathUtils.clamp((zoomStart * pinchDistance()) / pinchStart, 0.3, 40);
    }
    place();
  });

  const release = (e: PointerEvent) => pointers.delete(e.pointerId);
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * Math.exp(-e.deltaY * 0.0015), 0.3, 40);
      place();
    },
    { passive: false },
  );

  return { target, place };
}
```

- [ ] **Step 2: Create `viewer/src/main.ts`**

```ts
import * as THREE from "three";
import { createIsoCamera } from "./camera";
import { attachControls } from "./controls";
import { loadHeightmap } from "./heightmap";
import { buildTerrainGeometry } from "./terrainMesh";

// Real hills are gentle at this scale; a diorama needs them exaggerated to read.
const VERTICAL_EXAGGERATION = 3;
// Slightly above sea level so the 0.5 m marsh reads as shallow water, not dry land.
const WATER_LEVEL = 0.6;
const ASSET_BASE = `${import.meta.env.BASE_URL}assets/slice`;

async function start() {
  const canvas = document.getElementById("scene") as HTMLCanvasElement;
  const status = document.getElementById("status")!;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe6e9);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f6a, 0.7));
  const sun = new THREE.DirectionalLight(0xfff3d6, 2.6);
  sun.position.set(-1, 1.2, 0.6);
  scene.add(sun);

  const { meta, heights } = await loadHeightmap(ASSET_BASE);

  const terrain = new THREE.Mesh(
    buildTerrainGeometry(heights, meta, VERTICAL_EXAGGERATION),
    new THREE.MeshStandardMaterial({ color: 0xa89f78, flatShading: true }),
  );
  scene.add(terrain);

  const extent = Math.max(meta.width, meta.height) * meta.cell_m;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(extent * 4, extent * 4).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3f7fa6, transparent: true, opacity: 0.8 }),
  );
  water.position.y = WATER_LEVEL * VERTICAL_EXAGGERATION;
  scene.add(water);

  const camera = createIsoCamera(extent * 0.9, canvas.clientWidth / canvas.clientHeight);
  const render = () => renderer.render(scene, camera);
  const controls = attachControls(canvas, camera, render);

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const half = (camera.top - camera.bottom) / 2;
    camera.left = -half * aspect;
    camera.right = half * aspect;
    controls.place();
  };
  window.addEventListener("resize", resize);
  resize();

  status.textContent = `${meta.width}x${meta.height} cells at ${meta.cell_m} m. Drag to pan, scroll to zoom.`;
}

start().catch((err) => {
  console.error(err);
  document.getElementById("status")!.textContent = `Failed to load: ${err.message}`;
});
```

- [ ] **Step 3: Create `pipeline/scripts/make_demo_assets.py`**

```python
"""Write a synthetic landscape (a hill beside a bay) so the viewer can be built and
checked before any real data is available.

Run from the pipeline directory:
    uv run python scripts/make_demo_assets.py ../viewer/public/assets/slice
"""

import sys
from pathlib import Path

import numpy as np

from yelamu.export import Layer, write_assets
from yelamu.geo import Grid
from yelamu.terrain import apply_historical_water

grid = Grid(west=550000, south=4180000, east=553000, north=4183000, cell=10)  # 300 x 300
ys, xs = np.mgrid[0 : grid.height, 0 : grid.width] / 300.0  # 0..1, row 0 = north

hill = 90.0 * np.exp(-(((xs - 0.3) ** 2 + (ys - 0.35) ** 2) / 0.02))
ridge = 40.0 * np.exp(-(((xs - 0.35) ** 2 + (ys - 0.8) ** 2) / 0.03))
dem = (hill + ridge + 4.0).astype("float32")  # everything starts as modern-style land

bay = xs > 0.62  # the east is bay
marsh = (xs > 0.55) & (xs <= 0.62) & (ys > 0.4)
dem = apply_historical_water(dem, bay, marsh)

out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("demo-assets")
layers = [Layer("terrain", "synthetic demo", "illustrative", "generated by make_demo_assets.py")]
write_assets(dem, grid, layers, out)
print(f"Wrote demo assets to {out}")
```

- [ ] **Step 4: Generate the demo assets**

```bash
mkdir -p viewer/public/assets/slice
cd pipeline && uv run python scripts/make_demo_assets.py ../viewer/public/assets/slice
```
Expected: `Wrote demo assets to ../viewer/public/assets/slice`

- [ ] **Step 5: Typecheck, test, and build**

Run: `cd viewer && npm test && npm run build`
Expected: 14 tests pass; `tsc` prints nothing; `vite build` ends with `✓ built in ...ms`. (A "chunks are larger than 500 kB" warning is expected: that is Three.js itself, and is fine at this stage.)

- [ ] **Step 6: Look at it**

Run: `cd viewer && npx vite --port 5199 --strictPort` and open <http://localhost:5199/>.

Check each of these:
- A tan landmass with visible hill shading on the west, and blue water along the east and south edges.
- The view is a fixed isometric angle, with the bay at the lower right.
- Dragging moves the terrain with the cursor (drag right: the map moves right).
- Scroll zooms in and out smoothly.
- The browser console shows no errors.
- The status box (bottom left) reads `300x300 cells at 10 m. Drag to pan, scroll to zoom.`

If a check fails, fix the cause before continuing. Stop the dev server with Ctrl-C.

- [ ] **Step 7: Commit**

```bash
git add viewer/src/controls.ts viewer/src/main.ts pipeline/scripts viewer/public/assets/slice
git commit -m "feat(viewer): isometric scene with pan/zoom, verified on synthetic terrain"
```

---

### Task 12: Real-data slice (Yerba Buena Cove / Mission Bay) and go/no-go

This task needs the outputs of Task 1 and depends on judgment. Its purpose is to answer the question the spec flagged as the highest risk: does de-developing the DEM give a believable result?

**Files:**
- Create: `pipeline/data/slice/checks.json`
- Create: `pipeline/data/slice/landforms.json`
- Create: `docs/research/slice-results.md`
- Create: `pipeline/yelamu/habitats.py` and `pipeline/tests/test_habitats.py` (Step 3)
- Modify (generated): `viewer/public/assets/slice/heightmap.u16`, `meta.json` (see Addendum A: the heightmap is now a raw uint16 file)

> **Revised after Task 1.** The research found that the SFEI layer downloads directly as GeoJSON in EPSG:4326, so **GDAL is not needed** and the original `ogr2ogr` steps are replaced by a small tested splitter (Step 3). **Licensing gate:** the habitat layer has no stated license. Processing it locally is fine, but **do not publish or push anything derived from it** (the generated heightmap included) until SFEI confirms terms in writing. See the Decision in `docs/research/2026-data-sources.md`.

- [ ] **Step 1: Ask the user to approve the downloads (do not skip)**

Say exactly what will be fetched and wait for a clear yes:
- USGS 3DEP DEM tile `USGS_13_n38w123.tif`, about 223 MB (222,936,410 bytes), from `prd-tnm.s3.amazonaws.com` (public domain; credit "U.S. Geological Survey").
- SFEI "San Francisco Historical Habitats" GeoJSON, about 3.9 MB, from `services1.arcgis.com` (no stated license; see the gate above).

Do not download the Rumsey/Stanford Coast Survey scan (about 139 MB, CC BY-NC-SA). It is used only as a private reference, viewed in a browser, never fetched into the repo.

- [ ] **Step 2: Download the inputs**

```bash
cd pipeline && mkdir -p data/raw data/slice
source ../docs/research/slice.env
curl -L -o data/raw/dem.tif "$DEM_URL"
curl -L -o data/raw/sf_habitats.geojson "$SFEI_URL"
```
Expected: `data/raw/dem.tif` is 222936410 bytes (`ls -l`), and `python3 -c "import json; print(len(json.load(open('data/raw/sf_habitats.geojson'))['features']))"` prints `450`. `data/raw/` is gitignored.

- [ ] **Step 3: Split the habitat layer into bay and marsh polygons**

Write the failing test `pipeline/tests/test_habitats.py`:

```python
import json

import pytest

from yelamu.habitats import main, split_features


def _feature(habitat):
    return {"type": "Feature", "properties": {"HabitatCla": habitat},
            "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]}}


COLLECTION = {"type": "FeatureCollection", "features": [
    _feature("Deep ocean/bay"), _feature("Tidal flat"), _feature("Tidal marsh"),
    _feature("Coast live oak woodland"),
    {"type": "Feature", "properties": None, "geometry": None},
]}


def test_split_features_routes_by_class_and_ignores_the_rest():
    bay, marsh = split_features(
        COLLECTION, "HabitatCla", ["Deep ocean/bay", "Tidal flat"], ["Tidal marsh"]
    )
    assert [f["properties"]["HabitatCla"] for f in bay] == ["Deep ocean/bay", "Tidal flat"]
    assert [f["properties"]["HabitatCla"] for f in marsh] == ["Tidal marsh"]


def test_class_listed_in_both_goes_to_bay():
    bay, marsh = split_features(COLLECTION, "HabitatCla", ["Tidal marsh"], ["Tidal marsh"])
    assert len(bay) == 1 and marsh == []


def test_cli_writes_both_files(tmp_path):
    src = tmp_path / "in.geojson"
    src.write_text(json.dumps(COLLECTION))
    code = main([str(src), "--field", "HabitatCla", "--bay", "Deep ocean/bay",
                 "--marsh", "Tidal marsh", "--out", str(tmp_path / "out")])
    assert code == 0
    assert len(json.loads((tmp_path / "out" / "bay.geojson").read_text())["features"]) == 1
    assert len(json.loads((tmp_path / "out" / "marsh.geojson").read_text())["features"]) == 1


def test_cli_fails_loudly_when_nothing_matches(tmp_path):
    src = tmp_path / "in.geojson"
    src.write_text(json.dumps(COLLECTION))
    with pytest.raises(SystemExit, match="No features matched"):
        main([str(src), "--field", "HabitatCla", "--bay", "Nope", "--marsh", "Nada",
              "--out", str(tmp_path / "out")])
```

Run: `cd pipeline && uv run pytest tests/test_habitats.py -v` — Expected: ERROR `No module named 'yelamu.habitats'`.

Implement `pipeline/yelamu/habitats.py`:

```python
"""Split SFEI's habitat GeoJSON into bay and marsh polygon files for the pipeline.

    uv run python -m yelamu.habitats data/raw/sf_habitats.geojson \
        --field HabitatCla \
        --bay "Deep ocean/bay" "Shallow ocean/bay" "Tidal flat" \
        --marsh "Tidal marsh" "Tidal slough" \
        --out data/raw
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def split_features(
    collection: dict, field: str, bay: list[str], marsh: list[str]
) -> tuple[list[dict], list[dict]]:
    """Return (bay_features, marsh_features). A class listed in both goes to bay."""
    bay_features, marsh_features = [], []
    for feature in collection["features"]:
        habitat = (feature.get("properties") or {}).get(field)
        if habitat in bay:
            bay_features.append(feature)
        elif habitat in marsh:
            marsh_features.append(feature)
    return bay_features, marsh_features


def _write(path: Path, features: list[dict]) -> None:
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="habitats")
    p.add_argument("source", type=Path, help="GeoJSON FeatureCollection (EPSG:4326)")
    p.add_argument("--field", required=True, help="attribute holding the habitat class")
    p.add_argument("--bay", nargs="+", required=True, help="class values that are open bay")
    p.add_argument("--marsh", nargs="+", required=True, help="class values that are marsh")
    p.add_argument("--out", type=Path, required=True, help="directory for bay/marsh files")
    args = p.parse_args(argv)

    collection = json.loads(args.source.read_text())
    bay, marsh = split_features(collection, args.field, args.bay, args.marsh)
    if not bay and not marsh:
        raise SystemExit(
            f"No features matched field {args.field!r} with the given values; "
            "check the spelling against the data."
        )
    args.out.mkdir(parents=True, exist_ok=True)
    _write(args.out / "bay.geojson", bay)
    _write(args.out / "marsh.geojson", marsh)
    print(f"bay: {len(bay)} polygons, marsh: {len(marsh)} polygons -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Run the tests: `cd pipeline && uv run pytest tests/test_habitats.py -v` — Expected: 4 passed.

Then run it on the real data. The values below come from the research note (verified against the live service); this layer has no per-polygon certainty fields.

```bash
cd pipeline && uv run python -m yelamu.habitats data/raw/sf_habitats.geojson \
  --field HabitatCla \
  --bay "Deep ocean/bay" "Shallow ocean/bay" "Tidal flat" \
  --marsh "Tidal marsh" "Tidal slough" \
  --out data/raw
```
Expected: `bay: N polygons, marsh: M polygons`, both above 0 (the research counted 29 polygons across these five classes in the test box; the layer-wide total will be higher).

**Decision for you to make, with the user:** `Tidal coastal lagoon` (2 polygons in the test box) is deliberately in neither list, so it stays dry land. Look at it in Step 7 and decide whether it should be water. If so, add it to `--marsh` (or `--bay`) and re-run, and record why in `docs/research/slice-results.md`.

Commit the splitter (the generated `data/raw` files are gitignored):

```bash
git add pipeline/yelamu/habitats.py pipeline/tests/test_habitats.py
git commit -m "feat(pipeline): split SFEI habitat GeoJSON into bay and marsh polygons"
```

- [ ] **Step 4: Write `pipeline/data/slice/checks.json`**

Known-place sanity checks. The bay and marsh points should be water or near sea level in 1769; Telegraph Hill's summit was not graded away.

```json
[
  {"name": "Coit Tower (Telegraph Hill summit)", "lon": -122.4058, "lat": 37.8024, "min_m": 60},
  {"name": "Chase Center (former Mission Bay tidal flat)", "lon": -122.3875, "lat": 37.7680, "max_m": 1.0},
  {"name": "Ferry Building (Yerba Buena Cove)", "lon": -122.3935, "lat": 37.7955, "max_m": 1.0}
]
```

If a check fails after Step 6, investigate the data (wrong layer, wrong polygons, wrong CRS) before editing an expectation.

- [ ] **Step 5: Start with an empty landforms file**

Write `pipeline/data/slice/landforms.json`:

```json
[]
```
Landform corrections are added in Step 8 only after comparing the first result with the 1850s sheets.

- [ ] **Step 6: Run the pipeline**

```bash
cd pipeline && uv run python -m yelamu.cli \
  --dem data/raw/dem.tif \
  --bbox -122.42 37.755 -122.37 37.805 \
  --cell 10 \
  --bay data/raw/bay.geojson --marsh data/raw/marsh.geojson \
  --landforms data/slice/landforms.json --checks data/slice/checks.json \
  --out ../viewer/public/assets/slice
```
Expected: `Wrote assets to ../viewer/public/assets/slice` and exit code 0. Exit code 2 prints which sanity checks failed; see Step 4.

- [ ] **Step 7: View it**

Run: `cd viewer && npm run dev` and open the printed URL.

Compare the render against the historical picture: Yerba Buena Cove should be open water reaching in toward today's Montgomery Street area; Mission Bay and the Financial District waterfront should be water or low marsh, not flat dry fill; Telegraph Hill should stand clear of the water.

- [ ] **Step 8: Hand-sculpt what's missing (optional, only if Step 7 shows it)**

If a known-lost hill (for example Rincon Hill) is plainly missing, add an entry using the 1850s sheets from Task 1 to choose the centre and height. Format:

```json
[
  {"name": "Rincon Hill (restored)", "lon": <lon>, "lat": <lat>, "radius_m": <metres>, "delta_m": <metres>}
]
```
Every number must come from the historical sheets and be written into `docs/research/slice-results.md` with its source. Re-run Step 6 and Step 7. Such entries are tagged `illustrative` in `meta.json` automatically.

- [ ] **Step 9: Write `docs/research/slice-results.md` and record the decision**

Include: a screenshot of the viewer; the list of sanity checks and their results; what the render got right and wrong against the historical picture; every hand-sculpted landform and its source; and a **Decision**:
- **Go to Phase 2** (full-city terrain): the slice is believable and the remaining gaps are known and fixable.
- **Go with changes**: say what must change in the spec first.
- **Stop or rethink**: say why.

- [ ] **Step 10: Commit**

```bash
git add pipeline/data/slice docs/research/slice-results.md viewer/public/assets/slice
git commit -m "feat: real-data vertical slice for Yerba Buena Cove and Mission Bay"
```

---

## Addendum A: Changes made during execution (supersedes the tasks above where they differ)

Execution used one implementer subagent per task. Reviews were done per phase (pipeline, viewer) by a read-only reviewer on a stronger model. Both reviews found the code byte-identical to this plan but found gaps *in the plan itself*, fixed as follows.

**A1. Pipeline hardening** (commit `7425364`, after the pipeline review). `load_dem` keeps NaN for missing data and takes a `nodata` override (`--dem-nodata`). Missing data is expected over open water (a lidar DEM has no data there) and is harmless because the water edit overwrites it; `fill_missing_land` raises only if more than 2% of cells are still missing after the water edit (this catches a DEM that doesn't cover the box). `load_polygons` skips null geometries, keeps only polygonal parts (a line is never burned into the water mask), applies `make_valid`, and raises if nothing usable remains. Order of operations is now: load DEM, stamp landforms, apply water, fill missing land. The `water` provenance layer is written only when a bay or marsh file was supplied. `write_assets` rejects NaN/inf. 38 tests.

**A2. Asset contract: raw `uint16`, not PNG** (supersedes Tasks 5, 8, 11; reason: privacy-hardened browsers, such as Brave, Safari and Firefox with fingerprinting resistance, can add noise to canvas pixel readback, which would silently jitter the terrain). The pipeline writes `heightmap.u16` (little-endian, row-major, row 0 = north) and `meta.json`, which gains `heights_file`, `heights_format` (`"uint16-le"`) and `water_level_m`. `encode_heights`/`decode_heights` became `quantize_heights`/`dequantize_heights`. Pillow was removed. The viewer fetches the file as an `ArrayBuffer`, checks its length and format, and reads it with an explicit little-endian `DataView`. No canvas is involved.

**A3. One source of truth for water.** `terrain.py` defines `WATER_LEVEL_M = 0.6`, `MARSH_LEVEL_M = 0.5` (just below water, so marsh reads as shallow water), `LAND_FLOOR_M = 1.0` and `BAY_FLOOR_M = -3.0`. Dry land is clamped to at least `LAND_FLOOR_M`, and filled data voids use it too, so land can never render as water. The viewer reads `water_level_m` from `meta.json`. **Known simplification:** real coastal land between 0 and 1 m is flattened to 1 m.

**A4. Viewer fixes.** `fitViewSize` (in `camera.ts`, tested) frames the whole map for any aspect ratio, including portrait windows, and is reapplied on resize. Fetches check `res.ok`. Pinch zoom re-bases when the pointer count changes. A non-primary mouse button or a lost `pointerup` no longer leaves panning stuck.

**A5. Known gaps carried forward** (not fixed in this plan):
- The spec's "constrained" camera (no panning far off the map) is not implemented.
- Heights are relative to NAVD88 (elevation data) but the water level is a flat 0.6 m; the real tidal datum offset was not modelled.
- The habitat layer has no per-polygon certainty, so `documented`/`inferred` tags are assigned by us.
- Task 12 still needs the user's approval for the downloads, and the SFEI license must be confirmed before anything derived is published.

**A6. Environment note.** This machine has a stray `/Users/paras/node_modules/fsevents` (v1.2.13) that Node finds before the project's own copy, which crashes `vite` with `fsevents.watch is not a function`. Workaround used (changes nothing in the repo): `cd viewer && npm install --no-save --ignore-scripts fsevents`. Do not run a plain `npm install`/`npm ci` afterwards without repeating it, because npm prunes the extra package. A cleaner fix is for the user to remove the stray `~/node_modules`.

**A7. Changes made while running Task 12** (commits `604c777`, `1fa934d`, `84e07f6`). The splitter in Task 12, Step 3 shipped as written. The first real run exposed that SFEI's layer maps only part of the city, so the open bay east of its extent rendered as flat land. The pipeline gained `--coverage` (GeoJSON of all habitat polygons) and `--open-water-max-m` (default 0.5): where no SFEI polygon exists and the raw modern DEM is at or below the threshold, the cell is open bay, tagged `open_water_gap_fill` / `inferred`. The empty-landforms provenance bug was fixed in the same change. **The Step 6 command now needs `--coverage data/raw/sf_habitats.geojson`.** Output goes to `viewer/public/assets/real/` (gitignored, because the data derives from an SFEI layer with no stated license), and the viewer loads it with `?data=real`; the committed synthetic demo stays the default. Results and the go/no-go are in `docs/research/slice-results.md`.

---

## Self-Review

**1. Spec coverage** (spec Section 8, steps 0 and 1, plus the parts of Sections 5, 6, 10 they touch):

| Spec requirement | Task |
|---|---|
| Step 0: dataset availability, licenses, attribution | Task 1, Steps 1-3 |
| Step 0: georeferencing of 1850s sheets | Task 1, Step 3 |
| Step 0: outreach draft | Task 1, Step 5 |
| Open question: reuse terms for SFEI/ARO village data | Task 1, Step 4 |
| 5.2.1 extent and projection | Task 2 |
| 5.2.2 water mask, lower reclaimed fill | Tasks 3, 4 |
| 5.2.3 restore lost landforms (hand-curated) | Task 4 (`stamp_landform`), Task 12, Step 8 |
| 5.3 heightmap + metadata with source/confidence | Task 5 |
| 5.4 every layer carries source and confidence | Task 5 (`Layer` validates it), Task 6 (CLI emits it) |
| 6 terrain mesh, water, orthographic isometric camera, pan/zoom | Tasks 9, 10, 11 |
| 10 pipeline sanity checks against known points | Task 6 (`checks.py`), Task 12, Step 4 |
| 10 viewer tests | Tasks 8, 9, 10 |
| Step 1: vertical slice of Yerba Buena Cove / Mission Bay | Task 12 |

**Deliberately not covered here** (later plans): habitat splat-map, LOD chunks, vegetation, modern overlay, search, hotspots, provenance UI, screenshot-regression and frame-rate tests, accessibility, cultural layer, hosting. The provenance data exists in `meta.json` from Task 5, but nothing in the viewer displays it yet.

**2. Placeholder scan:** no TBD/TODO in code. Three places genuinely depend on outside facts, and each says so:
- Task 1 produces research findings and `slice.env` values.
- Task 12, Step 3 contains `<file>`, the name of a file inside an archive not yet downloaded.
- Task 12, Step 8 contains `<lon>`, `<metres>` and the like, to be taken from the historical sheets. That step is optional and sources every number.

**3. Type and name consistency:** `Grid`, `Layer`, `encode_heights`/`decode_heights`, `write_assets`, `apply_historical_water`, `stamp_landform`, `water_mask`, `load_dem`, `load_polygons`, `run_checks`/`Expectation` are used identically across tasks. The packed-PNG format (R = high byte, G = low byte, range from `meta.json`) is implemented in `export.py` and `heightmap.ts`, and a test fixture pins the two together. Asset path `viewer/public/assets/slice` is the same in Tasks 11 and 12 and in `main.ts`.
