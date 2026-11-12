# Yelamu Phase 2 (Full City: Terrain, Water, Habitat Shading) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the proven Yerba Buena / Mission Bay slice to the **whole city**: one reproducible pipeline run builds the ~1769 terrain and a habitat raster for all of San Francisco, and the viewer renders it at interactive frame rates with ground colour by habitat.

**Architecture:** The pipeline gains a region config (so the full-city run is one command), hand-drawn water polygons (for the south-east, where SFEI has no map), and a `habitat.u8` class raster alongside `heightmap.u16`. The viewer splits the grid into 128-cell chunks with two levels of detail chosen globally from camera zoom (so LOD seams never meet), builds full-resolution chunks lazily for what is on screen, and colours vertices from the habitat raster.

**Tech Stack:** Same as Phase 0+1: Python 3.11+ (`uv`, numpy, scipy, pyproj, rasterio, shapely); Node 20+ (Vite, TypeScript, Three.js, Vitest). **No new dependencies.**

**Spec:** [`docs/superpowers/specs/2026-11-11-yelamu-3d-map-design.md`](../specs/2026-11-11-yelamu-3d-map-design.md), Section 8 step 2 (full-city terrain, water, habitat shading), plus Section 5.3 (habitat splat-map) and Section 6 (LOD chunks).

**Base commit:** `979ab96`. Tasks 1, 2, 4, 6, 8 and 10 below replace whole files with the versions that were tested at that commit; if those files changed since, merge by hand instead of replacing.

**Out of scope (later plans):** vegetation instancing, the modern-street overlay, search, hotspots and the provenance panel, the constrained camera, animated water, carving freshwater ponds into the terrain, the cultural layer, hosting.

> **Licensing gate (unchanged).** The habitat data comes from an SFEI layer with **no stated license**. Everything generated from it (`viewer/public/assets/real*/`, `docs/research/local/`, `pipeline/data/raw/`) stays gitignored. Do not publish or push derived data until SFEI confirms terms in writing. The synthetic dataset in Task 10 contains no SFEI data and is safe to share.

---

## Design decisions (veto points)

| # | Decision | Why |
|---|---|---|
| 1 | **A region config file** (`pipeline/regions/*.json`) plus `--region`; CLI flags override it. | The full-city command is too long to type reliably, and a file is reproducible and reviewable. Typos in keys are rejected. |
| 2 | **No tiled assets.** One `heightmap.u16` and one `habitat.u8` for the whole city. | The prototype measured 2.6 MB (heights) + 47 KB (habitat) gzipped, against the spec's 10 MB budget. Tiling would add complexity for nothing. |
| 3 | **Chunked CPU meshes, two global LODs, flat shading, vertex colours.** LOD1 (every 4th sample) for the zoomed-out view, built up front for all 182 chunks; LOD0 (full resolution) built lazily for chunks in view and cached (LRU). | Reuses the tested geometry code and keeps the flat-shaded look. One LOD at a time means no cracks between LODs. No shaders to debug. |
| 4 | **Habitat colour is chosen in the viewer; the grouping is chosen in the pipeline.** 31 SFEI classes map to 10 groups (`unmapped, water, marsh, dune, beach, woodland, grassland, scrub, wetland, rock`). | The viewer can change the palette without re-running the pipeline, and the pipeline owns the ecology. |
| 5 | **Unmapped land is shown in a neutral grey, never guessed.** The south-east gets real data only through hand-drawn polygons (Task 3 creates the mechanism and the empty files). | An honest map beats a plausible-looking invented one. |
| 6 | **Water stays a translucent plane**, plus a matching sea-floor plane under it so the data edge is invisible. Animated water is deferred. | Cheap and good enough; the spec's animated shader is Phase 3 polish. |
| 7 | **Freshwater ponds and lagoons are colour only** (blue ground at land height), not carved. | The pipeline carves only `bay` and `marsh`. Ponds need their own water levels; that is a separate piece of work. |
| 8 | **Vertical exaggeration stays 3** (one constant in `main.ts`). | A taste decision; the real city's hills (280 m over 17 km) look dramatic at 3. Tune it in Task 11. |

## What the prototypes measured

Everything in this plan was built and run first in a scratch copy of the repo (pipeline: 166 tests; viewer: 88 tests), then exercised on real data in a real browser.

| Measurement | Result |
|---|---|
| Full-city grid (bbox -122.53..-122.33, 37.70..37.84, 10 m) | 1771 x 1565 cells (2.77 M); heights -3..279 m |
| Pipeline run | 2.2 s wall, 472 MB peak memory |
| `heightmap.u16` / `habitat.u8` | 5.54 MB (2.57 MB gzipped) / 2.77 MB (47 KB gzipped) |
| Cells by group | water 49.8%, unmapped 31.5%, dune 11.5%, grassland 2.1%, woodland 1.9%, marsh 1.2%, scrub 1.1%, wetland 0.5%, beach 0.3% |
| Gap-filled open bay (no SFEI polygon, modern DEM at or below 0.5 m) | 43.4% of cells; 628 cells of thin modern land removed |
| Viewer, whole city zoomed out (coarse LOD) | 343 k triangles, 183 draw calls, 114 to 120 fps |
| Viewer, worst case just above the LOD switch (1600x900) | 2.29 M triangles, 74 chunks, about 115 fps while panning, at most 1.7 ms CPU per frame |
| Viewer, real data zoomed in | 1.34 M triangles, 41 chunks, 120 fps |

Measured on a recent Apple desktop with a 120 Hz display. **Phones and low-end GPUs were not measured**; Task 11 explains the one knob to turn if they are too slow.

---

## File Structure

```
pipeline/
  regions/slice.json, full-city.json      Task 3: region configs
  data/full-city/                         Task 3: landforms.json, checks.json, hand/*
  yelamu/region.py                        Task 3: Region + load_region
  yelamu/habitat.py                       Task 2: class groups, raster, overrides
  yelamu/sources.py                       Task 1: allow_empty + shared geometry cleanup (modified)
  yelamu/export.py                        Task 2: writes habitat.u8 + legend (modified)
  yelamu/cli.py                           Task 4: --region, --habitats, --hand-bay/--hand-marsh (modified)
  scripts/render_classes.py               Task 5: classification map helper
  tests/test_habitat.py, test_region.py   Tasks 2, 3
viewer/
  src/habitat.ts                          Task 6: palette, depth shading, colour function
  src/heightmap.ts                        Task 6: loadHabitat (modified)
  src/chunks.ts, lru.ts                   Task 7: chunk planning, LOD choice, LRU cache
  src/terrainMesh.ts                      Task 8: buildChunkGeometry (modified)
  src/terrainChunks.ts                    Task 9: the LOD manager
  src/main.ts                             Task 10: wiring, debug overlay, sea floor (modified)
  scripts/make_city_synth.mjs             Task 10: synthetic whole-city data
docs/research/full-city-results.md        Task 11
```

---

### Task 0: Preflight

- [ ] **Step 1: Confirm the base**

Run: `cd "/Users/paras/Documents/Ancient San Francisco" && git status --short && git log --oneline | head -3`
Expected: a clean tree (or only the files you know about) and `979ab96` at or near the top.

- [ ] **Step 2: Confirm the real data is present (from Task 12 of the previous plan)**

Run: `ls -l pipeline/data/raw/dem.tif pipeline/data/raw/sf_habitats.geojson pipeline/data/raw/bay.geojson pipeline/data/raw/marsh.geojson`
Expected: all four exist (`dem.tif` is 222,936,410 bytes). If not, redo Steps 2 and 3 of Task 12 in `2026-11-11-yelamu-phase-0-1-vertical-slice.md`. The DEM tile covers lat 37..38 and lon -123..-122, so it already contains the whole city.

- [ ] **Step 3: Confirm the baseline tests**

Run: `cd pipeline && uv run pytest -q -W error` then `cd ../viewer && npm test`
Expected: pipeline 85 passed; viewer 18 passed.

- [ ] **Step 4: Confirm the viewer's local `fsevents`**

Run: `ls viewer/node_modules/fsevents`
Expected: the directory exists. If not: `cd viewer && npm install --no-save --ignore-scripts fsevents` (see Addendum A6 of the previous plan). Never run a plain `npm install` or `npm ci` in `viewer/` afterwards without repeating it.

---

# Part A: Pipeline

### Task 1: Polygon loader: allow empty files, share the geometry cleanup

Hand-drawn water files start empty, and the habitat raster needs the same polygon cleanup as the water loader.

**Files:**
- Modify: `pipeline/yelamu/sources.py`
- Modify (append): `pipeline/tests/test_pipeline.py`

- [ ] **Step 1: Append the failing test**

Append to the end of `pipeline/tests/test_pipeline.py` (it relies on helpers `_write_geojson`, `_feature` and `_LINE` that already exist there):

```python
_EMPTY_FC = {"type": "FeatureCollection", "features": []}


def test_load_polygons_allow_empty(tmp_path):
    path = tmp_path / "empty.geojson"
    path.write_text(json.dumps(_EMPTY_FC))
    assert load_polygons(path, allow_empty=True) == []
    with pytest.raises(ValueError, match="empty.geojson"):
        load_polygons(path)
    # Unusable content (only lines) is also empty under allow_empty.
    _write_geojson(tmp_path / "l.geojson", [_feature({"type": "LineString", "coordinates": _LINE})])
    assert load_polygons(tmp_path / "l.geojson", allow_empty=True) == []
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd pipeline && uv run pytest tests/test_pipeline.py -k allow_empty -v`
Expected: FAIL with `TypeError: load_polygons() got an unexpected keyword argument 'allow_empty'`

- [ ] **Step 3: Replace `pipeline/yelamu/sources.py`**

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


def load_dem(path: Path, grid: Grid, nodata: float | None = None) -> np.ndarray:
    """Resample a DEM (any CRS) onto the grid.

    Cells with no data come back as NaN; they are NOT filled here. Over open water a
    bare-earth DEM is often nodata, which is fine because the historical-water edit
    overwrites those cells. `nodata` overrides the file's own nodata tag (use it when
    the tag is missing or wrong, e.g. an untagged -9999).
    """
    dst = np.full((grid.height, grid.width), np.nan, dtype="float32")
    with rasterio.open(path) as src:
        reproject(
            source=rasterio.band(src, 1),
            destination=dst,
            dst_transform=grid.transform(),
            dst_crs=UTM_CRS,
            resampling=Resampling.bilinear,
            src_nodata=nodata if nodata is not None else src.nodata,
            dst_nodata=np.nan,
        )
    return dst


def _polygonal_parts(geom: BaseGeometry | None) -> list[BaseGeometry]:
    """Every Polygon inside geom (exploding Multi* and collections); all else dropped."""
    if geom is None or geom.is_empty:
        return []
    if geom.geom_type == "Polygon":
        return [geom]
    if hasattr(geom, "geoms"):  # MultiPolygon, GeometryCollection, other Multi*
        return [p for part in geom.geoms for p in _polygonal_parts(part)]
    return []  # Point, LineString, LinearRing


def geometry_to_utm_polygons(raw: dict | None) -> list[BaseGeometry]:
    """GeoJSON geometry (lon/lat) -> repaired UTM Polygons; non-polygonal parts dropped."""
    if not raw:
        return []
    polygons: list[BaseGeometry] = []
    for part in _polygonal_parts(shape(raw)):
        for poly in _polygonal_parts(shapely.make_valid(part)):
            polygons.append(_to_utm(poly))
    return polygons


def load_polygons(path: Path, allow_empty: bool = False) -> list[BaseGeometry]:
    """Read GeoJSON in lon/lat (EPSG:4326); return valid UTM polygons.

    Features with no geometry are skipped. Only polygonal parts are kept: points and
    lines (also inside collections) are dropped so they can never reach the water mask.
    Raises ValueError if no polygon geometry is found at all, unless `allow_empty` is
    True, in which case [] is returned (for optional, initially empty files).
    """
    data = json.loads(Path(path).read_text())
    features = data["features"] if data.get("type") == "FeatureCollection" else [data]
    geoms: list[BaseGeometry] = []
    for feature in features:
        raw = feature.get("geometry") if feature.get("type") == "Feature" else feature
        geoms.extend(geometry_to_utm_polygons(raw))
    if not geoms and not allow_empty:
        raise ValueError(f"{path}: no usable polygon geometry was found")
    return geoms
```

- [ ] **Step 4: Run the whole file to verify nothing regressed**

Run: `cd pipeline && uv run pytest tests/test_pipeline.py -q -W error`
Expected: all pass, no warnings.

- [ ] **Step 5: Commit**

```bash
git add pipeline/yelamu/sources.py pipeline/tests/test_pipeline.py
git commit -m "feat(pipeline): allow empty polygon files; share polygon cleanup"
```

---

### Task 2: Habitat raster

Turns the SFEI habitat polygons into a one-byte-per-cell class raster with a legend (class id, name, group), and writes it next to the heightmap.

**Files:**
- Create: `pipeline/yelamu/habitat.py`, `pipeline/tests/test_habitat.py`
- Modify: `pipeline/yelamu/export.py`
- Modify (append): `pipeline/tests/test_export.py`

- [ ] **Step 1: Write the failing tests**

Create `pipeline/tests/test_habitat.py`:

```python
import json
from pathlib import Path

import numpy as np
import pytest

from yelamu.geo import Grid, lonlat_to_utm
from yelamu.habitat import (
    GROUP_BY_CLASS,
    ID_HAND_BAY,
    ID_HAND_MARSH,
    ID_OPEN_BAY_INFERRED,
    ID_UNMAPPED,
    apply_overrides,
    rasterize_habitats,
)

BBOX = (-122.42, 37.755, -122.37, 37.805)
RAW = Path(__file__).resolve().parent.parent / "data" / "raw" / "sf_habitats.geojson"

GROUPS = {"unmapped", "water", "marsh", "dune", "beach", "woodland", "grassland", "scrub",
          "wetland", "rock"}


def _grid() -> Grid:
    return Grid.from_lonlat_bbox(*BBOX, cell=10)


def _rect(lon0, lat0, lon1, lat1) -> dict:
    ring = [[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]]
    return {"type": "Polygon", "coordinates": [ring]}


def _feat(cls, geometry, field="HabitatCla") -> dict:
    return {"type": "Feature", "properties": {field: cls}, "geometry": geometry}


def _cell(grid: Grid, lon: float, lat: float) -> tuple[int, int]:
    x, y = lonlat_to_utm(lon, lat)
    return grid.pixel_of(x, y)


# Three disjoint blocks (west to east) plus an unknown class, and an overlap strip.
COLLECTION = {"type": "FeatureCollection", "features": [
    _feat("Tidal marsh", _rect(-122.415, 37.77, -122.405, 37.79)),
    _feat("Coast live oak woodland", _rect(-122.400, 37.77, -122.390, 37.79)),
    _feat("Mystery class", _rect(-122.385, 37.77, -122.380, 37.79)),
    _feat("Beach", _rect(-122.395, 37.77, -122.389, 37.79)),  # overlaps the woodland
    {"type": "Feature", "properties": {"HabitatCla": "Fen"}, "geometry": None},
    _feat("", _rect(-122.378, 37.77, -122.376, 37.79)),  # blank class: skipped
    _feat(None, _rect(-122.378, 37.77, -122.376, 37.79)),  # null class: skipped
    {"type": "Feature", "properties": {}, "geometry": _rect(-122.378, 37.77, -122.376, 37.79)},
    {"type": "Feature", "properties": None, "geometry": _rect(-122.378, 37.77, -122.376, 37.79)},
    _feat("Dune slack", {"type": "LineString", "coordinates": [[-122.41, 37.76], [-122.4, 37.78]]}),
]}


# ------------------------------------------------------------------ mapping ---


def test_group_mapping_is_the_agreed_one():
    expected = {
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
    assert {c: g for g, cs in expected.items() for c in cs} == GROUP_BY_CLASS
    assert set(GROUP_BY_CLASS.values()) <= GROUPS


@pytest.mark.skipif(not RAW.exists(), reason="raw SFEI data not available")
def test_every_class_in_the_real_sfei_layer_is_mapped():
    data = json.loads(RAW.read_text())
    classes = {f["properties"]["HabitatCla"] for f in data["features"]}
    assert classes - set(GROUP_BY_CLASS) == set()


def test_synthetic_ids_are_fixed():
    assert (ID_UNMAPPED, ID_OPEN_BAY_INFERRED, ID_HAND_BAY, ID_HAND_MARSH) == (0, 1, 2, 3)


# --------------------------------------------------------------- rasterising ---


def test_rasterize_values_legend_and_unknown():
    grid = _grid()
    raster, legend, unknown = rasterize_habitats(COLLECTION, grid)

    assert raster.dtype == np.uint8 and raster.shape == (grid.height, grid.width)
    assert unknown == ["Mystery class"]
    assert legend == [
        {"id": 0, "name": "Unmapped", "group": "unmapped"},
        {"id": 1, "name": "Open bay (inferred from modern elevation)", "group": "water"},
        {"id": 2, "name": "Bay (hand-drawn)", "group": "water"},
        {"id": 3, "name": "Marsh (hand-drawn)", "group": "marsh"},
        {"id": 4, "name": "Beach", "group": "beach"},
        {"id": 5, "name": "Coast live oak woodland", "group": "woodland"},
        {"id": 6, "name": "Mystery class", "group": "unmapped"},
        {"id": 7, "name": "Tidal marsh", "group": "marsh"},
    ]
    assert raster[_cell(grid, -122.410, 37.78)] == 7  # marsh
    assert raster[_cell(grid, -122.3975, 37.78)] == 5  # woodland only
    assert raster[_cell(grid, -122.3825, 37.78)] == 6  # unknown class keeps its own id
    assert raster[_cell(grid, -122.377, 37.78)] == 0  # blank/null-class features skipped
    assert raster[_cell(grid, -122.372, 37.78)] == 0  # nothing mapped
    # Only classes with at least one usable polygon appear in the legend.
    assert "Fen" not in {e["name"] for e in legend}  # null geometry
    assert "Dune slack" not in {e["name"] for e in legend}  # no polygon parts


def test_overlap_is_won_by_the_later_class_in_sorted_name_order():
    grid = _grid()
    raster, legend, _ = rasterize_habitats(COLLECTION, grid)
    ids = {e["name"]: e["id"] for e in legend}
    # "Coast live oak woodland" sorts after "Beach", so it wins the overlap strip.
    assert raster[_cell(grid, -122.392, 37.78)] == ids["Coast live oak woodland"]
    assert raster[_cell(grid, -122.3935, 37.78)] == ids["Coast live oak woodland"]
    # Beach-only part: the beach polygon covers -122.395..-122.389, woodland -122.400..-122.390
    assert raster[_cell(grid, -122.3895, 37.78)] == ids["Beach"]


def test_feature_order_does_not_matter():
    grid = _grid()
    flipped = {"type": "FeatureCollection", "features": COLLECTION["features"][::-1]}
    a, legend_a, _ = rasterize_habitats(COLLECTION, grid)
    b, legend_b, _ = rasterize_habitats(flipped, grid)
    assert (a == b).all() and legend_a == legend_b


def test_custom_field_name():
    grid = _grid()
    coll = {"type": "FeatureCollection",
            "features": [_feat("Beach", _rect(-122.41, 37.77, -122.40, 37.78), field="Cls")]}
    raster, legend, _ = rasterize_habitats(coll, grid, field="Cls")
    assert [e["name"] for e in legend][-1] == "Beach"
    assert raster[_cell(grid, -122.405, 37.775)] == 4


def test_multipolygon_and_invalid_polygon_are_handled():
    grid = _grid()
    bowtie = {"type": "Polygon", "coordinates": [[[-122.41, 37.77], [-122.40, 37.78],
                                                  [-122.40, 37.77], [-122.41, 37.78],
                                                  [-122.41, 37.77]]]}
    multi = {"type": "MultiPolygon", "coordinates": [
        _rect(-122.39, 37.77, -122.38, 37.78)["coordinates"],
        _rect(-122.38, 37.79, -122.37, 37.80)["coordinates"]]}
    coll = {"type": "FeatureCollection",
            "features": [_feat("Fen", bowtie), _feat("Beach", multi)]}
    raster, legend, unknown = rasterize_habitats(coll, grid)
    assert unknown == []
    ids = {e["name"]: e["id"] for e in legend}
    assert raster[_cell(grid, -122.385, 37.775)] == ids["Beach"]
    assert raster[_cell(grid, -122.375, 37.795)] == ids["Beach"]


def test_empty_collection_gives_all_unmapped_and_synthetic_legend_only():
    grid = _grid()
    raster, legend, unknown = rasterize_habitats(
        {"type": "FeatureCollection", "features": []}, grid)
    assert not raster.any() and unknown == []
    assert [e["id"] for e in legend] == [0, 1, 2, 3]


def test_more_than_251_classes_is_an_error():
    grid = _grid()
    feats = [_feat(f"class {i:03d}", _rect(-122.41, 37.77, -122.40, 37.78)) for i in range(252)]
    with pytest.raises(ValueError, match="251"):
        rasterize_habitats({"type": "FeatureCollection", "features": feats}, grid)
    ok, legend, _ = rasterize_habitats(
        {"type": "FeatureCollection", "features": feats[:251]}, grid)
    assert len(legend) == 255 and ok.max() == 254


# ----------------------------------------------------------------- overrides ---


def test_apply_overrides_precedence_and_purity():
    habitat = np.full((2, 6), 9, dtype=np.uint8)
    gap = np.array([[1, 1, 1, 0, 0, 0], [0, 0, 0, 0, 0, 0]], dtype=bool)
    hand_marsh = np.array([[0, 1, 1, 1, 0, 0], [0, 0, 0, 0, 0, 0]], dtype=bool)
    hand_bay = np.array([[0, 0, 1, 1, 1, 0], [0, 0, 0, 0, 0, 0]], dtype=bool)
    before = habitat.copy()

    out = apply_overrides(habitat, gap, hand_bay, hand_marsh)

    assert out is not habitat and (habitat == before).all()
    assert out.dtype == np.uint8
    assert out[0].tolist() == [
        ID_OPEN_BAY_INFERRED,  # gap only
        ID_HAND_MARSH,  # gap + marsh: hand-drawn beats the gap fill
        ID_HAND_BAY,  # gap + marsh + bay: bay beats everything
        ID_HAND_BAY,  # marsh + bay
        ID_HAND_BAY,  # bay only
        9,  # untouched
    ]
    assert (out[1] == 9).all()


def test_apply_overrides_accepts_none_masks():
    habitat = np.zeros((2, 2), dtype=np.uint8)
    out = apply_overrides(habitat, None, None, np.array([[1, 0], [0, 0]], dtype=bool))
    assert out.tolist() == [[ID_HAND_MARSH, 0], [0, 0]]
```

Append to the end of `pipeline/tests/test_export.py`:

```python


# ------------------------------------------------------------ habitat raster ---

_LEGEND = [{"id": 0, "name": "Unmapped", "group": "unmapped"},
           {"id": 4, "name": "Beach", "group": "beach"}]


def test_write_assets_without_habitat_has_no_habitat_keys(tmp_path):
    grid = Grid(west=500000, south=4180000, east=500020, north=4180020, cell=10)
    meta = write_assets(np.zeros((2, 2), dtype="float32"), grid,
                        [Layer("terrain", "s", "inferred", "a")], tmp_path)
    assert "habitat_file" not in meta and "habitat_classes" not in meta
    assert not (tmp_path / "habitat.u8").exists()


def test_write_assets_round_trips_the_habitat_raster(tmp_path):
    grid = Grid(west=500000, south=4180000, east=500040, north=4180030, cell=10)  # 4 x 3
    dem = np.arange(12, dtype="float32").reshape(3, 4)
    habitat = np.arange(12, dtype=np.uint8).reshape(3, 4) * 20

    meta = write_assets(dem, grid, [Layer("terrain", "s", "inferred", "a")], tmp_path,
                        habitat=habitat, habitat_classes=_LEGEND)

    raw = tmp_path / "habitat.u8"
    assert raw.stat().st_size == 4 * 3  # width * height bytes
    assert (np.fromfile(raw, dtype=np.uint8).reshape(3, 4) == habitat).all()  # row 0 north
    assert meta["habitat_file"] == "habitat.u8"
    assert meta["habitat_classes"] == _LEGEND
    assert json.loads((tmp_path / "meta.json").read_text()) == meta


@pytest.mark.parametrize("habitat, match", [
    (np.zeros((2, 4), dtype=np.uint8), "shape"),
    (np.zeros((3, 4), dtype=np.int32), "uint8"),
    (np.zeros((3, 4), dtype=np.uint16), "uint8"),
])
def test_write_assets_rejects_bad_habitat_raster(tmp_path, habitat, match):
    grid = Grid(west=500000, south=4180000, east=500040, north=4180030, cell=10)
    with pytest.raises(ValueError, match=match):
        write_assets(np.zeros((3, 4), dtype="float32"), grid,
                     [Layer("terrain", "s", "inferred", "a")], tmp_path,
                     habitat=habitat, habitat_classes=_LEGEND)
    assert not (tmp_path / "heightmap.u16").exists()  # validated before anything is written


def test_write_assets_requires_a_legend_with_the_raster(tmp_path):
    grid = Grid(west=500000, south=4180000, east=500020, north=4180020, cell=10)
    with pytest.raises(ValueError, match="habitat_classes"):
        write_assets(np.zeros((2, 2), dtype="float32"), grid,
                     [Layer("terrain", "s", "inferred", "a")], tmp_path,
                     habitat=np.zeros((2, 2), dtype=np.uint8))
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_habitat.py tests/test_export.py -q`
Expected: collection error `ModuleNotFoundError: No module named 'yelamu.habitat'`, and the new export tests fail.

- [ ] **Step 3: Create `pipeline/yelamu/habitat.py`**

```python
"""Habitat classes as a raster the viewer can colour the ground with.

The SFEI layer's `HabitatCla` values (about thirty) are grouped into ten coarse groups
for colouring. The raster stores one uint8 id per cell; `legend` maps ids back to names
and groups. Ids 0..3 are fixed synthetic classes; SFEI classes get ids 4.. in sorted
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
FIRST_SFEI_ID = 4
MAX_SFEI_CLASSES = 251  # uint8 ids 4..254 (255 stays free)

SYNTHETIC_LEGEND: list[dict] = [
    {"id": ID_UNMAPPED, "name": "Unmapped", "group": "unmapped"},
    {"id": ID_OPEN_BAY_INFERRED, "name": "Open bay (inferred from modern elevation)",
     "group": "water"},
    {"id": ID_HAND_BAY, "name": "Bay (hand-drawn)", "group": "water"},
    {"id": ID_HAND_MARSH, "name": "Marsh (hand-drawn)", "group": "marsh"},
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
    More than 251 distinct classes raises ValueError (ids must fit in uint8).
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
    hand-drawn bay. Any mask may be None (nothing to stamp).
    """
    out = np.array(habitat, dtype=np.uint8, copy=True)
    for mask, class_id in ((gap, ID_OPEN_BAY_INFERRED), (hand_marsh, ID_HAND_MARSH),
                           (hand_bay, ID_HAND_BAY)):
        if mask is not None:
            out[np.asarray(mask, dtype=bool)] = class_id
    return out
```

- [ ] **Step 4: Replace `pipeline/yelamu/export.py`**

```python
"""Write the static assets the viewer loads: a raw heightmap + meta.json.

Heights are quantized to 16 bits and written as a raw little-endian uint16 file
(row-major, row 0 = north), not as an image. Reading PNG pixels back through a browser
<canvas> can be silently altered by privacy features that randomize canvas reads
(Brave, Safari, Firefox resistFingerprinting), which would corrupt the terrain. A raw
binary file never touches a canvas, so the bytes the viewer sees are the bytes we wrote.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from yelamu.geo import UTM_CRS, Grid
from yelamu.terrain import WATER_LEVEL_M

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


def quantize_heights(dem: np.ndarray, min_m: float, max_m: float) -> np.ndarray:
    """Map metres onto 0..65535 across [min_m, max_m]; returns an (H, W) uint16 array."""
    span = max_m - min_m
    unit = np.clip((dem - min_m) / span, 0.0, 1.0)
    return np.rint(unit * 65535.0).astype(np.uint16)


def dequantize_heights(q: np.ndarray, min_m: float, max_m: float) -> np.ndarray:
    """Inverse of quantize_heights; returns float32 metres."""
    return (min_m + q.astype(np.float64) / 65535.0 * (max_m - min_m)).astype("float32")


def write_assets(
    dem: np.ndarray,
    grid: Grid,
    layers: list[Layer],
    out_dir: Path,
    processing: dict | None = None,
    habitat: np.ndarray | None = None,
    habitat_classes: list[dict] | None = None,
) -> dict:
    """Write heightmap.u16 and meta.json (and habitat.u8 when a habitat raster is given).

    `habitat` is a (height, width) uint8 class-id raster, row 0 = north, written raw;
    `habitat_classes` is its legend, copied into meta.json.
    """
    if not np.isfinite(dem).all():
        raise ValueError(
            "dem contains NaN or infinite values; fill or mask missing data before "
            "writing assets (see fill_missing_land)"
        )
    if habitat is not None:
        if habitat.dtype != np.uint8:
            raise ValueError(f"habitat must be a uint8 array, got {habitat.dtype}")
        if habitat.shape != dem.shape:
            raise ValueError(
                f"habitat shape {habitat.shape} must equal the dem shape {dem.shape}"
            )
        if habitat_classes is None:
            raise ValueError("habitat_classes (the legend) is required with a habitat raster")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    min_m = float(math.floor(dem.min()))
    max_m = float(math.ceil(dem.max()))
    if max_m <= min_m:
        max_m = min_m + 1.0

    q = quantize_heights(dem, min_m, max_m)
    q.astype("<u2").tofile(out_dir / "heightmap.u16")
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
        "heights_file": "heightmap.u16",
        "heights_format": "uint16-le",
        "water_level_m": WATER_LEVEL_M,
        "layers": [asdict(layer) for layer in layers],
    }
    if habitat is not None:
        np.ascontiguousarray(habitat).tofile(out_dir / "habitat.u8")
        meta["habitat_file"] = "habitat.u8"
        meta["habitat_classes"] = habitat_classes
    if processing is not None:
        meta["processing"] = processing
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd pipeline && uv run pytest tests/test_habitat.py tests/test_export.py -q -W error`
Expected: 25 passed (12 habitat + 13 export), no warnings.

- [ ] **Step 6: Commit**

```bash
git add pipeline/yelamu/habitat.py pipeline/yelamu/export.py pipeline/tests/test_habitat.py pipeline/tests/test_export.py
git commit -m "feat(pipeline): habitat class raster with legend and group mapping"
```

---

### Task 3: Region configs and the full-city inputs

**Files:**
- Create: `pipeline/yelamu/region.py`, `pipeline/tests/test_region.py`
- Create: `pipeline/regions/slice.json`, `pipeline/regions/full-city.json`
- Create: `pipeline/data/full-city/landforms.json`, `checks.json`, `hand/hand_bay.geojson`, `hand/hand_marsh.geojson`, `hand/README.md`

- [ ] **Step 1: Write the failing test `pipeline/tests/test_region.py`**

```python
import json
from pathlib import Path

import pytest

from yelamu.region import Region, load_region

PIPELINE = Path(__file__).resolve().parent.parent

MINIMAL = {
    "name": "t",
    "bbox": [-122.5, 37.7, -122.4, 37.8],
    "cell_m": 10,
    "dem": "data/raw/dem.tif",
    "out": "../viewer/out",
}


def _write(tmp_path, data, name="r.json") -> Path:
    """Write a region file at <tmp>/pipeline/regions/<name> and return its path."""
    folder = tmp_path / "pipeline" / "regions"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / name
    path.write_text(data if isinstance(data, str) else json.dumps(data))
    return path


def test_minimal_region_applies_defaults_and_resolves_paths_against_pipeline_dir(tmp_path):
    region = load_region(_write(tmp_path, MINIMAL))
    base = tmp_path / "pipeline"
    assert isinstance(region, Region)
    assert region.name == "t"
    assert region.bbox == (-122.5, 37.7, -122.4, 37.8)
    assert region.cell_m == 10.0 and isinstance(region.cell_m, float)
    assert region.dem == base / "data/raw/dem.tif"  # not relative to regions/
    assert region.out == tmp_path / "viewer" / "out"  # '..' is collapsed
    assert region.habitats is None and region.bay is None and region.marsh is None
    assert region.landforms is None and region.checks is None
    assert region.hand_bay == [] and region.hand_marsh == []
    for name in ("smooth_m", "shelf_m", "shore_slope", "shore_open_cells", "open_water_max_m"):
        assert getattr(region, name) is None


def test_full_region_round_trip(tmp_path):
    data = {
        **MINIMAL,
        "habitats": "data/raw/h.geojson", "bay": "data/raw/b.geojson",
        "marsh": "data/raw/m.geojson",
        "hand_bay": ["data/hand/a.geojson", "data/hand/b.geojson"],
        "hand_marsh": ["data/hand/c.geojson"],
        "landforms": "data/lf.json", "checks": "data/ck.json",
        "smooth_m": 20, "shelf_m": 90.5, "shore_slope": 0.2, "shore_open_cells": 3,
        "open_water_max_m": 0.25,
    }
    region = load_region(_write(tmp_path, data))
    base = tmp_path / "pipeline"
    assert region.habitats == base / "data/raw/h.geojson"
    assert region.hand_bay == [base / "data/hand/a.geojson", base / "data/hand/b.geojson"]
    assert region.hand_marsh == [base / "data/hand/c.geojson"]
    assert region.landforms == base / "data/lf.json" and region.checks == base / "data/ck.json"
    assert (region.smooth_m, region.shelf_m, region.shore_slope) == (20, 90.5, 0.2)
    assert region.shore_open_cells == 3 and region.open_water_max_m == 0.25


def test_absolute_paths_are_kept(tmp_path):
    region = load_region(_write(tmp_path, {**MINIMAL, "dem": "/abs/dem.tif"}))
    assert region.dem == Path("/abs/dem.tif")


def test_region_is_frozen(tmp_path):
    region = load_region(_write(tmp_path, MINIMAL))
    with pytest.raises(Exception):
        region.name = "other"  # type: ignore[misc]


@pytest.mark.parametrize("key", ["name", "bbox", "cell_m", "dem", "out"])
def test_missing_required_key_names_key_and_file(tmp_path, key):
    data = {k: v for k, v in MINIMAL.items() if k != key}
    path = _write(tmp_path, data, "broken.json")
    with pytest.raises(ValueError, match="broken.json") as exc:
        load_region(path)
    assert key in str(exc.value)


def test_unknown_keys_are_rejected_and_named(tmp_path):
    path = _write(tmp_path, {**MINIMAL, "hand_baay": [], "colour": "x"}, "typo.json")
    with pytest.raises(ValueError, match="typo.json") as exc:
        load_region(path)
    assert "hand_baay" in str(exc.value) and "colour" in str(exc.value)


@pytest.mark.parametrize("bbox", [
    [-122.4, 37.7, -122.5, 37.8],  # west > east
    [-122.5, 37.8, -122.4, 37.7],  # south > north
    [-122.5, 37.7, -122.5, 37.8],  # west == east
    [-122.5, 37.7, -122.4, 37.7],  # south == north
    [-181.0, 37.7, -122.4, 37.8],  # lon out of range
    [-122.5, -91.0, -122.4, 37.8],  # lat out of range
    [-122.5, 37.7, -122.4, 91.0],
    [-122.5, 37.7, 181.0, 37.8],
    [-122.5, 37.7, -122.4],  # wrong length
    "nope",
    [-122.5, 37.7, -122.4, "x"],
    [-122.5, 37.7, -122.4, True],  # bool is not a number
    [-122.5, 37.7, -122.4, float("nan")],
])
def test_bad_bbox_is_rejected(tmp_path, bbox):
    path = _write(tmp_path, {**MINIMAL, "bbox": bbox}, "bb.json")
    with pytest.raises(ValueError, match="bb.json") as exc:
        load_region(path)
    assert "bbox" in str(exc.value)


@pytest.mark.parametrize("cell", [0, -5, "ten", None, True])
def test_bad_cell_m_is_rejected(tmp_path, cell):
    path = _write(tmp_path, {**MINIMAL, "cell_m": cell}, "c.json")
    with pytest.raises(ValueError, match="c.json") as exc:
        load_region(path)
    assert "cell_m" in str(exc.value)


@pytest.mark.parametrize("key, value", [
    ("dem", 5), ("out", ""), ("bay", 3), ("hand_bay", "a.geojson"), ("hand_marsh", [1]),
    ("smooth_m", "x"), ("shore_open_cells", 1.5), ("shelf_m", True), ("name", ""),
])
def test_bad_value_types_are_rejected_naming_key_and_file(tmp_path, key, value):
    path = _write(tmp_path, {**MINIMAL, key: value}, "v.json")
    with pytest.raises(ValueError, match="v.json") as exc:
        load_region(path)
    assert key in str(exc.value)


def test_invalid_json_and_non_object_name_the_file(tmp_path):
    with pytest.raises(ValueError, match="bad.json"):
        load_region(_write(tmp_path, "{not json", "bad.json"))
    with pytest.raises(ValueError, match="list.json"):
        load_region(_write(tmp_path, "[1, 2]", "list.json"))


def test_null_optionals_mean_unset(tmp_path):
    region = load_region(_write(tmp_path, {**MINIMAL, "bay": None, "smooth_m": None,
                                           "hand_bay": None}))
    assert region.bay is None and region.smooth_m is None and region.hand_bay == []


# --------------------------------------------------- the shipped region files ---


@pytest.mark.parametrize("name", ["slice", "full-city"])
def test_shipped_regions_load(name):
    region = load_region(PIPELINE / "regions" / f"{name}.json")
    assert region.name == name
    assert region.dem == PIPELINE / "data" / "raw" / "dem.tif"
    for p in (region.habitats, region.bay, region.marsh):
        assert p is not None and p.exists(), p
    for p in (region.landforms, region.checks, *region.hand_bay, *region.hand_marsh):
        assert p is not None and p.exists(), p


def test_full_city_region_values():
    region = load_region(PIPELINE / "regions" / "full-city.json")
    assert region.bbox == (-122.53, 37.70, -122.33, 37.84)
    assert region.cell_m == 10.0
    assert region.out == PIPELINE.parent / "viewer" / "public" / "assets" / "real-city"
    assert [p.name for p in region.hand_bay] == ["hand_bay.geojson"]
    assert [p.name for p in region.hand_marsh] == ["hand_marsh.geojson"]
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd pipeline && uv run pytest tests/test_region.py -q`
Expected: ERROR `No module named 'yelamu.region'`

- [ ] **Step 3: Create `pipeline/yelamu/region.py`**

```python
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
_OPTIONAL_PATH_LISTS = ("hand_bay", "hand_marsh")
_OPTIONAL_FLOATS = ("smooth_m", "shelf_m", "shore_slope", "open_water_max_m")
_OPTIONAL_INTS = ("shore_open_cells",)
_KNOWN = (*_REQUIRED, *_OPTIONAL_PATHS, *_OPTIONAL_PATH_LISTS, *_OPTIONAL_FLOATS,
          *_OPTIONAL_INTS)


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
    landforms: Path | None = None
    checks: Path | None = None
    # Overrides of the CLI defaults; None means "use the CLI/default value".
    smooth_m: float | None = None
    shelf_m: float | None = None
    shore_slope: float | None = None
    shore_open_cells: int | None = None
    open_water_max_m: float | None = None


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def load_region(path: Path) -> Region:
    """Read and validate a region JSON file. Raises ValueError naming the file."""
    path = Path(path)
    base = path.parent.parent  # the pipeline directory

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
        kwargs[key] = float(value)
    for key in _OPTIONAL_INTS:
        value = data.get(key)
        if value is None:
            continue
        if not isinstance(value, int) or isinstance(value, bool):
            raise fail(f"{key} must be an integer or null, got {value!r}")
        kwargs[key] = value
    return Region(**kwargs)
```

- [ ] **Step 4: Create the region configs**

`pipeline/regions/slice.json` (the existing test box, now reproducible from one file):

```json
{
  "name": "slice",
  "bbox": [-122.42, 37.755, -122.37, 37.805],
  "cell_m": 10,
  "dem": "data/raw/dem.tif",
  "habitats": "data/raw/sf_habitats.geojson",
  "bay": "data/raw/bay.geojson",
  "marsh": "data/raw/marsh.geojson",
  "landforms": "data/slice/landforms.json",
  "checks": "data/slice/checks.json",
  "out": "../viewer/public/assets/real"
}
```

`pipeline/regions/full-city.json`:

```json
{
  "name": "full-city",
  "bbox": [-122.53, 37.70, -122.33, 37.84],
  "cell_m": 10,
  "dem": "data/raw/dem.tif",
  "habitats": "data/raw/sf_habitats.geojson",
  "bay": "data/raw/bay.geojson",
  "marsh": "data/raw/marsh.geojson",
  "hand_bay": ["data/full-city/hand/hand_bay.geojson"],
  "hand_marsh": ["data/full-city/hand/hand_marsh.geojson"],
  "landforms": "data/full-city/landforms.json",
  "checks": "data/full-city/checks.json",
  "out": "../viewer/public/assets/real-city"
}
```

- [ ] **Step 5: Create the full-city data files**

`pipeline/data/full-city/landforms.json` (hand-sculpted landforms; empty until sourced from the 1850s sheets):

```json
[]
```

`pipeline/data/full-city/checks.json` (known places; the first two catch an over-flattened terrain, the last two a flooded or dry-land error):

```json
[
  {"name": "Twin Peaks summit", "lon": -122.4477, "lat": 37.7544, "min_m": 200},
  {"name": "Mount Davidson summit", "lon": -122.4547, "lat": 37.7386, "min_m": 200},
  {"name": "Pacific Ocean off Ocean Beach", "lon": -122.5200, "lat": 37.7600, "max_m": 1.0},
  {"name": "Ferry Building (Yerba Buena Cove)", "lon": -122.3935, "lat": 37.7955, "max_m": 1.0}
]
```

`pipeline/data/full-city/hand/hand_bay.geojson` and `hand_marsh.geojson` (identical, empty for now):

```json
{"type": "FeatureCollection", "features": []}
```

`pipeline/data/full-city/hand/README.md`:

```markdown
# Hand-drawn water polygons

`hand_bay.geojson` and `hand_marsh.geojson` hold water you trace yourself where the SFEI
layer has no data (mainly the south-east of the city). Both start as empty
FeatureCollections and are read by `regions/full-city.json`.

- Format: GeoJSON `Polygon` or `MultiPolygon` features in lon/lat (EPSG:4326). Draw them
  in geojson.io or QGIS, tracing the 1850s US Coast Survey sheets, and save over the file.
- `hand_bay` is open bay, `hand_marsh` is tidal marsh. Where both cover a cell, bay wins.
- Hand-drawn polygons count as mapped, so the modern-elevation gap fill never overrides
  them. They show up in the output as the `hand_water` layer, tagged `inferred`.
- Only trace from sources you may use. Never copy data from a source whose terms forbid it.
- More files can be listed under `hand_bay` / `hand_marsh` in the region file.
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd pipeline && uv run pytest tests/test_region.py -q -W error`
Expected: 42 passed, no warnings.

- [ ] **Step 7: Commit**

```bash
git add pipeline/yelamu/region.py pipeline/tests/test_region.py pipeline/regions pipeline/data/full-city
git commit -m "feat(pipeline): region configs and full-city inputs"
```

---

### Task 4: Wire it all into the CLI

`--region FILE` supplies defaults (CLI flags override them); `--habitats` builds the raster and doubles as the coverage polygons; `--hand-bay` / `--hand-marsh` add hand-drawn water.

**Files:**
- Modify: `pipeline/yelamu/cli.py`
- Modify: `pipeline/tests/test_pipeline.py`

- [ ] **Step 1: Update the tests**

In `pipeline/tests/test_pipeline.py`, replace the import block at the top (everything above `BBOX = ...`) with:

```python
"""End-to-end test on synthetic data: a flat 'modern fill' DEM with a historical bay."""

import json
from pathlib import Path

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import Point

from yelamu.checks import Expectation, run_checks
from yelamu.cli import main, parse_args
from yelamu.export import dequantize_heights
from yelamu.geo import UTM_CRS, Grid, lonlat_to_utm
from yelamu.habitat import ID_HAND_BAY, ID_HAND_MARSH, ID_OPEN_BAY_INFERRED, ID_UNMAPPED
from yelamu.terrain import LAND_FLOOR_M, MARSH_LEVEL_M, WATER_LEVEL_M
from yelamu.sources import load_dem, load_polygons
from yelamu.water import water_mask
```

Then append to the end of the file (the `_EMPTY_FC` constant and `test_load_polygons_allow_empty` were added in Task 1, so they are not repeated):

```python
# ------------------------------------------------------- hand-drawn water ---


def _hand_run(tmp_path, *extra, dem_value=5.0, name="out"):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem(tmp_path / "dem.tif", grid, dem_value)
    out = tmp_path / name
    code = main(["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX),
                 "--out", str(out), *_FLAT, *extra])
    assert code == 0
    meta = json.loads((out / "meta.json").read_text())
    return grid, out, meta, _read_heights(out, meta)


def test_hand_marsh_over_fill_becomes_marsh_level(tmp_path):
    _write_bay_geojson(tmp_path / "hm.geojson", -122.40, 37.77, -122.38, 37.79)
    grid, out, meta, heights = _hand_run(tmp_path, "--hand-marsh", str(tmp_path / "hm.geojson"))
    assert abs(heights[_pixel(grid, -122.39, 37.78)] - MARSH_LEVEL_M) < 0.01
    assert abs(heights[_pixel(grid, -122.415, 37.76)] - 5.0) < 0.01  # elsewhere unchanged
    assert "hand_water" in _layer_ids(out)
    layer = next(l for l in meta["layers"] if l["id"] == "hand_water")
    assert layer["confidence"] == "inferred" and layer["attribution"] == "this project"
    assert layer["source"] == "hand-drawn from historical maps (user-authored)"


def test_hand_bay_becomes_bay(tmp_path):
    _write_bay_geojson(tmp_path / "hb.geojson", -122.40, 37.77, -122.38, 37.79)
    grid, out, _, heights = _hand_run(tmp_path, "--hand-bay", str(tmp_path / "hb.geojson"))
    assert abs(heights[_pixel(grid, -122.39, 37.78)] - (-3.0)) < 0.01
    assert abs(heights[_pixel(grid, -122.415, 37.76)] - 5.0) < 0.01
    assert "hand_water" in _layer_ids(out)


def test_hand_bay_wins_over_hand_marsh_and_multiple_files_are_merged(tmp_path):
    _write_bay_geojson(tmp_path / "hb1.geojson", -122.40, 37.77, -122.39, 37.79)
    _write_bay_geojson(tmp_path / "hb2.geojson", -122.38, 37.77, -122.375, 37.79)
    _write_bay_geojson(tmp_path / "hm.geojson", -122.405, 37.77, -122.385, 37.79)
    grid, _, _, heights = _hand_run(
        tmp_path, "--hand-bay", str(tmp_path / "hb1.geojson"), str(tmp_path / "hb2.geojson"),
        "--hand-marsh", str(tmp_path / "hm.geojson"))
    assert abs(heights[_pixel(grid, -122.395, 37.78)] - (-3.0)) < 0.01  # bay + marsh: bay
    assert abs(heights[_pixel(grid, -122.387, 37.78)] - MARSH_LEVEL_M) < 0.01  # marsh only
    assert abs(heights[_pixel(grid, -122.3775, 37.78)] - (-3.0)) < 0.01  # second bay file


def test_empty_hand_files_are_accepted_and_add_nothing(tmp_path):
    for name in ("hb", "hm"):
        (tmp_path / f"{name}.geojson").write_text(json.dumps(_EMPTY_FC))
    grid, out, meta, heights = _hand_run(
        tmp_path, "--hand-bay", str(tmp_path / "hb.geojson"),
        "--hand-marsh", str(tmp_path / "hm.geojson"))
    assert "hand_water" not in _layer_ids(out)
    assert np.abs(heights - 5.0).max() < 0.01


def test_hand_polygons_stop_the_gap_rule(tmp_path):
    out = tmp_path / "out"
    grid, args = _gap_args(tmp_path, out, "--coverage", str(tmp_path / "cov.geojson"), *_FLAT)
    # A hand marsh in the unmapped (east) north half, where the modern DEM is 0 m.
    _write_bay_geojson(tmp_path / "hm.geojson", -122.385, 37.785, -122.375, 37.795)

    assert main([*args, "--hand-marsh", str(tmp_path / "hm.geojson")]) == 0

    heights = _read_heights(out, json.loads((out / "meta.json").read_text()))
    assert abs(heights[_pixel(grid, -122.38, 37.79)] - MARSH_LEVEL_M) < 0.01  # not gap bay
    # Elsewhere in the unmapped north the gap fill still makes open bay.
    assert abs(heights[_pixel(grid, -122.372, 37.79)] - (-3.0)) < 0.01
    ids = _layer_ids(out)
    assert "hand_water" in ids and "open_water_gap_fill" in ids


# ------------------------------------------------------------ habitat raster ---

def _habitat_collection(tmp_path, with_unknown=False):
    feats = [{"type": "Feature", "properties": {"HabitatCla": "Coast live oak woodland"},
              "geometry": {"type": "Polygon", "coordinates": [[
                  [-122.43, 37.74], [-122.395, 37.74], [-122.395, 37.84], [-122.43, 37.84],
                  [-122.43, 37.74]]]}}]
    if with_unknown:
        feats.append({"type": "Feature", "properties": {"HabitatCla": "Weird thing"},
                      "geometry": {"type": "Polygon", "coordinates": [[
                          [-122.42, 37.80], [-122.41, 37.80], [-122.41, 37.81],
                          [-122.42, 37.81], [-122.42, 37.80]]]}})
    path = tmp_path / "hab.geojson"
    path.write_text(json.dumps({"type": "FeatureCollection", "features": feats}))
    return path


def _habitat(out, meta) -> np.ndarray:
    return np.fromfile(out / "habitat.u8", dtype=np.uint8).reshape(meta["height"], meta["width"])


def test_habitats_flag_writes_raster_legend_and_inferred_open_bay(tmp_path, capsys):
    out = tmp_path / "out"
    grid, args = _gap_args(tmp_path, out)
    hab = _habitat_collection(tmp_path, with_unknown=True)

    assert main([*args, "--habitats", str(hab)]) == 0

    meta = json.loads((out / "meta.json").read_text())
    assert (out / "habitat.u8").stat().st_size == meta["width"] * meta["height"]
    assert meta["habitat_file"] == "habitat.u8"
    ids = {e["name"]: e["id"] for e in meta["habitat_classes"]}
    assert (ids["Coast live oak woodland"], ids["Weird thing"]) == (4, 5)  # sorted-name ids
    woodland = ids["Coast live oak woodland"]
    raster = _habitat(out, meta)
    # --habitats is the coverage too: the unmapped, low (0 m) north-east is gap-filled bay.
    assert raster[_pixel(grid, *_UNCOVERED_N)] == ID_OPEN_BAY_INFERRED
    assert raster[_pixel(grid, *_UNCOVERED_S)] == ID_UNMAPPED  # unmapped high land
    assert raster[_pixel(grid, *_COVERED_S)] == woodland
    assert raster[_pixel(grid, *_COVERED_N)] == woodland  # mapped cells are never gap bay
    heights = _read_heights(out, meta)
    assert abs(heights[_pixel(grid, *_UNCOVERED_N)] - (-3.0)) < 0.01
    assert "open_water_gap_fill" in _layer_ids(out)
    assert "Weird thing" in capsys.readouterr().err  # unknown class warned on stderr


def test_explicit_coverage_wins_over_habitats_as_coverage(tmp_path):
    out = tmp_path / "out"
    # cov.geojson covers lon < -122.395; the habitat polygon covers everything east.
    grid, args = _gap_args(tmp_path, out, "--coverage", str(tmp_path / "cov.geojson"))
    hab = tmp_path / "hab.geojson"
    _write_bay_geojson(hab, -122.395, 37.74, -122.30, 37.84)
    data = json.loads(hab.read_text())
    data["features"][0]["properties"] = {"HabitatCla": "Beach"}
    hab.write_text(json.dumps(data))

    assert main([*args, "--habitats", str(hab)]) == 0

    meta = json.loads((out / "meta.json").read_text())
    heights = _read_heights(out, meta)
    assert abs(heights[_pixel(grid, *_UNCOVERED_N)] - (-3.0)) < 0.01  # gap from --coverage
    assert _habitat(out, meta)[_pixel(grid, *_UNCOVERED_N)] == ID_OPEN_BAY_INFERRED


def test_without_habitats_no_habitat_file(tmp_path):
    out = tmp_path / "out"
    _, args = _gap_args(tmp_path, out, "--coverage", str(tmp_path / "cov.geojson"))
    assert main(args) == 0
    meta = json.loads((out / "meta.json").read_text())
    assert not (out / "habitat.u8").exists()
    assert "habitat_file" not in meta and "habitat_classes" not in meta


def test_hand_marsh_is_stamped_on_the_habitat_raster(tmp_path):
    out = tmp_path / "out"
    grid, args = _gap_args(tmp_path, out)
    hab = _habitat_collection(tmp_path)
    _write_bay_geojson(tmp_path / "hm.geojson", -122.385, 37.785, -122.375, 37.795)
    _write_bay_geojson(tmp_path / "hb.geojson", -122.385, 37.765, -122.375, 37.775)

    assert main([*args, "--habitats", str(hab), "--hand-marsh", str(tmp_path / "hm.geojson"),
                 "--hand-bay", str(tmp_path / "hb.geojson")]) == 0

    meta = json.loads((out / "meta.json").read_text())
    raster = _habitat(out, meta)
    assert raster[_pixel(grid, -122.38, 37.79)] == ID_HAND_MARSH  # not gap bay, not unmapped
    assert raster[_pixel(grid, -122.38, 37.77)] == ID_HAND_BAY
    assert raster[_pixel(grid, -122.372, 37.79)] == ID_OPEN_BAY_INFERRED  # rest of the gap


def test_thin_pier_removed_from_water_is_inferred_open_bay_in_the_raster(tmp_path):
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem_with_block(tmp_path / "dem.tif", grid, 0.0, (-122.38200, 37.780, -122.38175, 37.783),
                          5.0, tag_nodata=None)
    hab = _habitat_collection(tmp_path)
    out = tmp_path / "out"
    assert main(["--dem", str(tmp_path / "dem.tif"), "--bbox", *map(str, BBOX),
                 "--out", str(out), "--habitats", str(hab)]) == 0
    meta = json.loads((out / "meta.json").read_text())
    assert _habitat(out, meta)[_pixel(grid, -122.381875, 37.7815)] == ID_OPEN_BAY_INFERRED


# -------------------------------------------------------------- --region ---

def _region_setup(tmp_path, **overrides):
    """A tmp pipeline dir with a DEM, a bay and a region file; returns (region_path, grid)."""
    pipe = tmp_path / "pipeline"
    (pipe / "regions").mkdir(parents=True)
    (pipe / "data").mkdir()
    grid = Grid.from_lonlat_bbox(*BBOX, cell=10)
    _write_dem(pipe / "data" / "dem.tif", grid, 5.0)
    _write_bay_geojson(pipe / "data" / "bay.geojson", -122.40, 37.77, -122.38, 37.79)
    region = {"name": "t", "bbox": list(BBOX), "cell_m": 10, "dem": "data/dem.tif",
              "bay": "data/bay.geojson", "out": "build/out", **overrides}
    path = pipe / "regions" / "t.json"
    path.write_text(json.dumps(region))
    return path, grid


def test_region_alone_runs_the_pipeline(tmp_path):
    path, grid = _region_setup(tmp_path)
    assert main(["--region", str(path)]) == 0
    out = tmp_path / "pipeline" / "build" / "out"
    meta = json.loads((out / "meta.json").read_text())
    assert abs(_read_heights(out, meta)[_pixel(grid, -122.39, 37.78)] - (-3.0)) < 0.01
    assert "water" in [l["id"] for l in meta["layers"]]


def test_cli_flags_override_region_values(tmp_path):
    path, _ = _region_setup(tmp_path, smooth_m=20, shelf_m=90, shore_open_cells=3)
    assert main(["--region", str(path), "--out", str(tmp_path / "o1")]) == 0
    proc = json.loads((tmp_path / "o1" / "meta.json").read_text())["processing"]
    assert proc["smooth_m"] == 20 and proc["shelf_m"] == 90 and proc["shore_open_cells"] == 3
    assert proc["shore_slope"] == 0.30  # region None/absent: CLI default

    assert main(["--region", str(path), "--out", str(tmp_path / "o2"),
                 "--smooth-m", "5", "--shore-open-cells", "0", "--cell", "20"]) == 0
    meta = json.loads((tmp_path / "o2" / "meta.json").read_text())
    assert meta["processing"]["smooth_m"] == 5 and meta["processing"]["shore_open_cells"] == 0
    assert meta["processing"]["shelf_m"] == 90  # still from the region
    assert meta["cell_m"] == 20  # CLI --cell beat the region's cell_m 10
    assert not (tmp_path / "pipeline" / "build").exists()  # --out replaced the region's out


def test_parse_args_merges_region_defaults_and_overrides(tmp_path):
    path, _ = _region_setup(tmp_path, hand_bay=["data/a.geojson"],
                            hand_marsh=["data/m.geojson"], habitats="data/h.geojson")
    base = tmp_path / "pipeline"
    a = parse_args(["--region", str(path)])
    assert a.dem == base / "data/dem.tif" and a.out == base / "build/out"
    assert tuple(a.bbox) == BBOX and a.cell == 10.0
    assert a.hand_bay == [base / "data/a.geojson"] and a.hand_marsh == [base / "data/m.geojson"]
    assert a.habitats == base / "data/h.geojson"
    assert a.smooth_m == 30.0 and a.shelf_m == 150.0  # untouched defaults

    b = parse_args(["--region", str(path), "--hand-bay", "x.geojson", "y.geojson",
                    "--bbox", "1", "2", "3", "4", "--habitats", "z.geojson"])
    assert b.hand_bay == [Path("x.geojson"), Path("y.geojson")]  # replaced, not appended
    assert b.bbox == [1.0, 2.0, 3.0, 4.0] and b.habitats == Path("z.geojson")
    assert b.hand_marsh == [base / "data/m.geojson"]
    # Form --region=FILE works too.
    assert parse_args([f"--region={path}"]).dem == base / "data/dem.tif"


def test_parse_args_without_region_is_the_old_interface(tmp_path):
    a = parse_args(["--dem", "d.tif", "--bbox", "1", "2", "3", "4", "--out", "o"])
    assert a.dem == Path("d.tif") and a.hand_bay == [] and a.hand_marsh == []
    assert a.habitats is None and a.cell == 10.0 and a.region is None


@pytest.mark.parametrize("given, missing", [
    ([], ["--dem", "--bbox", "--out"]),
    (["--dem", "d.tif", "--bbox", "1", "2", "3", "4"], ["--out"]),
    (["--dem", "d.tif", "--out", "o"], ["--bbox"]),
    (["--bbox", "1", "2", "3", "4", "--out", "o"], ["--dem"]),
])
def test_missing_required_inputs_is_a_clear_parser_error(capsys, given, missing):
    with pytest.raises(SystemExit) as exc:
        main(given)
    assert exc.value.code == 2
    err = capsys.readouterr().err
    assert "missing" in err and all(m in err for m in missing)


def test_a_broken_region_file_is_a_parser_error_naming_the_file(tmp_path, capsys):
    path, _ = _region_setup(tmp_path, nope=1)
    with pytest.raises(SystemExit) as exc:
        main(["--region", str(path)])
    assert exc.value.code == 2
    err = capsys.readouterr().err
    assert "t.json" in err and "nope" in err

    with pytest.raises(SystemExit) as exc:
        main(["--region", str(tmp_path / "absent.json")])
    assert exc.value.code == 2 and "absent.json" in capsys.readouterr().err


def test_region_checks_run_and_can_fail(tmp_path):
    pipe = tmp_path / "pipeline"
    path, _ = _region_setup(tmp_path, checks="data/checks.json")
    (pipe / "data" / "checks.json").write_text(json.dumps(
        [{"name": "needs a hill", "lon": -122.415, "lat": 37.76, "min_m": 60.0}]))
    assert main(["--region", str(path)]) == 2
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_pipeline.py -q`
Expected: collection error `ImportError: cannot import name 'parse_args' from 'yelamu.cli'`

- [ ] **Step 3: Replace `pipeline/yelamu/cli.py`**

```python
"""Command line entry point: build the heightmap assets for one bounding box."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

import numpy as np

from yelamu.checks import load_expectations, run_checks
from yelamu.export import Layer, write_assets
from yelamu.geo import Grid, lonlat_to_utm
from yelamu.habitat import apply_overrides, rasterize_habitats
from yelamu.region import Region, load_region
from yelamu.sources import load_dem, load_polygons
from yelamu.terrain import (
    apply_bay_shelf,
    apply_historical_water,
    apply_land_ramp,
    fill_missing_land,
    smooth_land,
    stamp_landform,
)
from yelamu.water import remove_thin_unmapped_land, unmapped_open_water, water_mask


def build(
    dem_path: Path,
    bbox: tuple[float, float, float, float],
    cell: float,
    out_dir: Path,
    bay_path: Path | None = None,
    marsh_path: Path | None = None,
    landforms_path: Path | None = None,
    checks_path: Path | None = None,
    dem_nodata: float | None = None,
    coverage_path: Path | None = None,
    open_water_max_m: float = 0.5,
    smooth_m: float = 30.0,
    shelf_m: float = 150.0,
    shore_open_cells: int = 2,
    shore_slope: float = 0.30,
    habitats_path: Path | None = None,
    hand_bay_paths: Sequence[Path] = (),
    hand_marsh_paths: Sequence[Path] = (),
) -> list[str]:
    """Run the pipeline. Returns the list of failed sanity checks (empty is good).

    `habitats_path` (the SFEI habitat GeoJSON) produces the habitat raster, and also
    serves as the coverage polygons when `coverage_path` is not given. Hand-drawn water
    files (`hand_bay_paths`, `hand_marsh_paths`) may be empty; their polygons are
    added to the bay / marsh masks and count as mapped area for the gap rule.
    """
    grid = Grid.from_lonlat_bbox(*bbox, cell=cell)
    dem = load_dem(dem_path, grid, nodata=dem_nodata)

    bay = water_mask(load_polygons(bay_path) if bay_path else [], grid)
    marsh = water_mask(load_polygons(marsh_path) if marsh_path else [], grid)

    hand_bay_polys = [
        g for path in hand_bay_paths for g in load_polygons(path, allow_empty=True)
    ]
    hand_marsh_polys = [
        g for path in hand_marsh_paths for g in load_polygons(path, allow_empty=True)
    ]
    hand_bay = water_mask(hand_bay_polys, grid)
    hand_marsh = water_mask(hand_marsh_polys, grid)
    hand_used = bool(hand_bay_polys or hand_marsh_polys)
    # Where both are drawn, bay wins (apply_historical_water's usual rule).
    bay = bay | hand_bay
    marsh = marsh | hand_marsh

    # Where SFEI maps no habitat at all, the modern DEM stands in for open bay. Decide
    # this from the raw DEM, before smoothing or landform stamping change any elevation.
    gap = None
    removed = None
    coverage_src = coverage_path or habitats_path
    if coverage_src:
        # Hand-drawn polygons are mapped area too, so the gap fill never overrides them.
        coverage = water_mask(load_polygons(coverage_src), grid) | hand_bay | hand_marsh
        gap = unmapped_open_water(dem, coverage, open_water_max_m)
        bay = bay | gap
        print(
            f"Gap-filled {int(gap.sum())} cells ({gap.mean():.1%}) as open bay "
            "where SFEI has no polygon"
        )
        # Modern piers and one-cell specks in that DEM-derived shoreline are not 1769.
        if shore_open_cells > 0:
            removed = remove_thin_unmapped_land(~(bay | marsh), ~coverage, shore_open_cells)
            bay = bay | removed
            print(f"Removed {int(removed.sum())} cells of thin unmapped land "
                  f"(piers/specks narrower than {2 * shore_open_cells + 1} cells)")

    habitat = habitat_classes = None
    if habitats_path:
        habitat, habitat_classes, unknown = rasterize_habitats(
            json.loads(Path(habitats_path).read_text()), grid
        )
        if unknown:
            print("WARNING: habitat classes not in the group mapping (shown as unmapped): "
                  + ", ".join(unknown), file=sys.stderr)
        # Everything turned into bay from the modern DEM is "inferred open bay"; a hand
        # marsh under a bay cell stays bay, matching the heightmap.
        inferred = gap if removed is None or gap is None else gap | removed
        habitat = apply_overrides(habitat, inferred, hand_bay, hand_marsh & ~bay)

    # Blur away the modern street grid and building pads, using land cells only.
    if smooth_m > 0:
        dem = smooth_land(dem, smooth_m / cell, valid=~(bay | marsh) & ~np.isnan(dem))

    # Landforms after smoothing, so stamps stay exact. The water edit and the clamp come
    # after the stamps so one near the shore can't raise the bay floor or dig dry land.
    landforms = json.loads(Path(landforms_path).read_text()) if landforms_path else []
    for lf in landforms:
        x, y = lonlat_to_utm(lf["lon"], lf["lat"])
        dem = stamp_landform(dem, grid, x, y, lf["radius_m"], lf["delta_m"])

    dem = apply_historical_water(dem, bay, marsh)
    dem = fill_missing_land(dem)
    # Fill and grading by the old shore would form a wall: cap how steeply land rises
    # from the water (shore_slope m per m; 0 disables).
    dem = apply_land_ramp(dem, bay | marsh, grid.cell, shore_slope)
    # Slope the bay floor up to the shore (shelf_m <= 0 keeps it flat), so no cliff.
    dem = apply_bay_shelf(dem, bay, cell, shelf_m)

    layers = [
        Layer("terrain", "USGS 3DEP, modified", "inferred", "USGS 3DEP; see docs/research"),
    ]
    if bay_path or marsh_path:
        layers.append(
            Layer("water", "SFEI historical ecology", "documented", "SFEI; see docs/research")
        )
    if gap is not None:
        layers.append(
            Layer("open_water_gap_fill", "modern DEM where SFEI maps no habitat", "inferred",
                  "USGS 3DEP; gap fill by this project")
        )
    if hand_used:
        layers.append(
            Layer("hand_water", "hand-drawn from historical maps (user-authored)", "inferred",
                  "this project")
        )
    if landforms:
        layers.append(
            Layer("landforms", "hand-sculpted corrections", "illustrative", "this project")
        )
    processing = {
        "smooth_m": smooth_m,
        "shelf_m": shelf_m,
        "shore_slope": shore_slope,
        "shore_open_cells": shore_open_cells,
        "open_water_max_m": open_water_max_m,
        "coverage": coverage_src is not None,
    }
    write_assets(dem, grid, layers, out_dir, processing, habitat, habitat_classes)

    if checks_path:
        return run_checks(dem, grid, load_expectations(checks_path))
    return []


def _region_defaults(region: Region) -> dict:
    """argparse defaults (by dest) taken from a region; None overrides are left out."""
    defaults: dict = {
        "dem": region.dem,
        "bbox": region.bbox,
        "cell": region.cell_m,
        "out": region.out,
        "habitats": region.habitats,
        "bay": region.bay,
        "marsh": region.marsh,
        "hand_bay": region.hand_bay,
        "hand_marsh": region.hand_marsh,
        "landforms": region.landforms,
        "checks": region.checks,
    }
    for key in ("smooth_m", "shelf_m", "shore_slope", "shore_open_cells", "open_water_max_m"):
        if getattr(region, key) is not None:
            defaults[key] = getattr(region, key)
    return defaults


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse the command line. Values from --region are defaults; explicit flags win."""
    p = argparse.ArgumentParser(prog="yelamu", allow_abbrev=False)
    p.add_argument("--region", type=Path,
                   help="region JSON (see regions/); its values are the defaults, and any "
                        "flag given here overrides them")
    p.add_argument("--dem", type=Path)
    p.add_argument("--bbox", type=float, nargs=4,
                   metavar=("WEST", "SOUTH", "EAST", "NORTH"), help="lon/lat degrees")
    p.add_argument("--dem-nodata", type=float, default=None,
                   help="nodata value to use instead of the DEM's own tag")
    p.add_argument("--cell", type=float, default=10.0, help="metres per pixel")
    p.add_argument("--out", type=Path)
    p.add_argument("--bay", type=Path, help="GeoJSON of historical bay water")
    p.add_argument("--marsh", type=Path, help="GeoJSON of historical marsh")
    p.add_argument("--habitats", type=Path,
                   help="SFEI habitat GeoJSON: builds the habitat raster, and is the "
                        "coverage when --coverage is not given")
    p.add_argument("--hand-bay", type=Path, nargs="+", default=[],
                   help="GeoJSON file(s) of hand-drawn bay polygons (may be empty)")
    p.add_argument("--hand-marsh", type=Path, nargs="+", default=[],
                   help="GeoJSON file(s) of hand-drawn marsh polygons (may be empty)")
    p.add_argument("--coverage", type=Path,
                   help="GeoJSON of ALL habitat polygons (the area SFEI mapped); where it "
                        "has none and the DEM is low, the cell is open bay")
    p.add_argument("--open-water-max-m", type=float, default=0.5,
                   help="DEM height (m) at or below which an unmapped cell is open bay")
    p.add_argument("--smooth-m", type=float, default=30.0,
                   help="Gaussian sigma (m) that blurs the modern street grid and building "
                        "pads out of the land; 0 disables")
    p.add_argument("--shelf-m", type=float, default=150.0,
                   help="distance (m) over which the bay floor slopes from the shore down "
                        "to full depth; 0 gives a flat floor")
    p.add_argument("--shore-open-cells", type=int, default=2,
                   help="radius (cells) of the opening that removes thin piers and specks "
                        "from DEM-derived shoreline; 0 disables")
    p.add_argument("--shore-slope", type=float, default=0.30,
                   help="maximum land slope (metres of rise per metre) away from the "
                        "historical shoreline, so modern fill doesn't form a wall; 0 disables")
    p.add_argument("--landforms", type=Path, help="JSON list of hand-sculpted landforms")
    p.add_argument("--checks", type=Path, help="JSON list of height expectations")

    # Load the region first (a tiny pre-parse), then make its values the defaults.
    pre = argparse.ArgumentParser(add_help=False, allow_abbrev=False)
    pre.add_argument("--region", type=Path)
    region_path = pre.parse_known_args(argv)[0].region
    if region_path is not None:
        try:
            p.set_defaults(**_region_defaults(load_region(region_path)))
        except (OSError, ValueError) as exc:
            p.error(f"--region: {exc}")

    args = p.parse_args(argv)
    missing = [f"--{name}" for name in ("dem", "bbox", "out") if getattr(args, name) is None]
    if missing:
        p.error("missing " + ", ".join(missing) + " (give the flag or use --region)")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    failures = build(
        args.dem, tuple(args.bbox), args.cell, args.out,
        args.bay, args.marsh, args.landforms, args.checks, args.dem_nodata,
        args.coverage, args.open_water_max_m,
        args.smooth_m, args.shelf_m, args.shore_open_cells, args.shore_slope,
        args.habitats, args.hand_bay, args.hand_marsh,
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

- [ ] **Step 4: Run the whole pipeline suite**

Run: `cd pipeline && uv run pytest -q -W error`
Expected: **166 passed**, no warnings (`test_pipeline.py` alone has 47).

- [ ] **Step 5: Check the slice still builds from its region file**

Run: `cd pipeline && uv run python -m yelamu.cli --region regions/slice.json --out /tmp/yelamu-slice-check`
Expected: prints the gap-fill and thin-land lines, then `Wrote assets to /tmp/yelamu-slice-check` and exits 0 (its sanity checks pass). Then `ls /tmp/yelamu-slice-check` shows `habitat.u8 heightmap.u16 meta.json`.

- [ ] **Step 6: Commit**

```bash
git add pipeline/yelamu/cli.py pipeline/tests/test_pipeline.py
git commit -m "feat(pipeline): --region, --habitats, and hand-drawn water in the CLI"
```

---

### Task 5: Build the whole city and look at it

A dev helper renders the habitat raster as a map so you can judge the data before touching the viewer.

**Files:**
- Create: `pipeline/scripts/render_classes.py`

- [ ] **Step 1: Create `pipeline/scripts/render_classes.py`**

```python
"""Render a habitat-group classification map (PNG) from a built asset folder.

Pillow is not a project dependency, so run it through uv:

    uv run --with pillow python scripts/render_classes.py ../viewer/public/assets/real-city out.png
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

GROUP_RGB = {
    "unmapped": (154, 148, 132), "water": (40, 90, 160), "marsh": (110, 190, 190),
    "dune": (235, 215, 140), "beach": (255, 245, 200), "woodland": (30, 110, 40),
    "grassland": (170, 200, 90), "scrub": (140, 110, 50), "wetland": (130, 60, 160),
    "rock": (30, 30, 30),
}


def render(asset_dir: Path, scale: int = 2) -> Image.Image:
    meta = json.loads((asset_dir / "meta.json").read_text())
    width, height = meta["width"], meta["height"]
    raster = np.fromfile(asset_dir / meta["habitat_file"], dtype=np.uint8).reshape(height, width)
    palette = np.zeros((256, 3), dtype=np.uint8)
    palette[:] = GROUP_RGB["unmapped"]
    for entry in meta["habitat_classes"]:
        palette[entry["id"]] = GROUP_RGB.get(entry["group"], GROUP_RGB["unmapped"])
    # Inferred open bay (id 1) is water too, a little lighter so the SFEI margin is visible.
    palette[1] = (120, 170, 230)
    image = Image.fromarray(palette[raster])
    return image.resize((max(1, width // scale), max(1, height // scale)), Image.NEAREST)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: render_classes.py ASSET_DIR OUT.png")
    render(Path(sys.argv[1])).save(sys.argv[2])
    print(f"wrote {sys.argv[2]}")
```

(It is a throwaway visual aid, run through `uv run --with pillow` because Pillow is not a project dependency, so it has no unit test.)

- [ ] **Step 2: Build the full city**

```bash
cd pipeline
/usr/bin/time -l uv run python -m yelamu.cli --region regions/full-city.json 2>&1 | grep -E "Gap-filled|Removed|Wrote|maximum resident|real"
```
Expected (from the prototype): `Gap-filled ... (43.4%)`, `Removed 628 cells of thin unmapped land ...`, `Wrote assets to ../viewer/public/assets/real-city`, about 2 s, about 472 MB peak. Exit code 0 means all four sanity checks in `data/full-city/checks.json` passed. If one fails, investigate the data (wrong layer, CRS, the smoothing) before editing an expectation, as before.

- [ ] **Step 3: Check the outputs**

Run: `ls -l ../viewer/public/assets/real-city && gzip -c ../viewer/public/assets/real-city/heightmap.u16 | wc -c && gzip -c ../viewer/public/assets/real-city/habitat.u8 | wc -c`
Expected: `heightmap.u16` 5,543,230 bytes (about 2.57 MB gzipped), `habitat.u8` 2,771,615 bytes (about 47 KB gzipped), `meta.json` with `"width": 1771, "height": 1565`. The folder is gitignored (`viewer/public/assets/real*/`); confirm with `git status --short` (nothing new).

- [ ] **Step 4: Render and inspect the classification map**

```bash
uv run --with pillow python scripts/render_classes.py ../viewer/public/assets/real-city ../docs/research/local/city-classes.png
```
Open `docs/research/local/city-classes.png` (gitignored). Expected picture: SFEI-mapped dunes, woodland, grassland and marsh over the north and west; a dark-blue SFEI water margin with a lighter inferred-bay band outside it; a **large grey unmapped area in the south-east** with a modern harbour shoreline; Treasure Island and Yerba Buena Island as grey specks in the bay; the Marin Headlands and East Bay as grey slivers at the edges. These are the known limits in Addendum B, not bugs.

- [ ] **Step 5: Commit**

```bash
git add pipeline/scripts/render_classes.py
git commit -m "feat(pipeline): classification map helper for inspecting habitat output"
```

---

# Part B: Viewer

### Task 6: Habitat colours and loading

**Files:**
- Create: `viewer/src/habitat.ts`, `viewer/src/habitat.test.ts`
- Modify: `viewer/src/heightmap.ts`

- [ ] **Step 1: Write the failing test `viewer/src/habitat.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPalette,
  GROUP_COLORS,
  makeColorAt,
  paletteToLinear,
  shadeByDepth,
  srgbToLinear,
  type HabitatClass,
} from "./habitat";
import { loadHabitat } from "./heightmap";

const GROUPS = [
  "unmapped",
  "water",
  "marsh",
  "dune",
  "beach",
  "woodland",
  "grassland",
  "scrub",
  "wetland",
  "rock",
];

describe("GROUP_COLORS", () => {
  it("has a colour for every habitat group", () => {
    for (const g of GROUPS) expect(typeof GROUP_COLORS[g]).toBe("number");
  });
});

describe("buildPalette", () => {
  const classes: HabitatClass[] = [
    { id: 0, name: "Unmapped", group: "unmapped" },
    { id: 1, name: "Bay", group: "water" },
    { id: 3, name: "Oak", group: "woodland" },
  ];
  const p = buildPalette(classes);

  it("has 3 floats per class id up to the maximum id", () => {
    expect(p).toBeInstanceOf(Float32Array);
    expect(p.length).toBe(4 * 3);
  });

  it("stores plain sRGB floats in 0..1", () => {
    expect(p[3]).toBeCloseTo(0x3f / 255, 5);
    expect(p[4]).toBeCloseTo(0x7f / 255, 5);
    expect(p[5]).toBeCloseTo(0xa6 / 255, 5);
    expect(p[9]).toBeCloseTo(0x4f / 255, 5);
  });

  it("fills unused ids with the unmapped colour", () => {
    expect(p[6]).toBeCloseTo(0x9a / 255, 5);
    expect(p[7]).toBeCloseTo(0x94 / 255, 5);
    expect(p[8]).toBeCloseTo(0x84 / 255, 5);
  });

  it("falls back to the unmapped colour for an unknown group", () => {
    const q = buildPalette([{ id: 0, name: "?", group: "lava" }]);
    expect(q[0]).toBeCloseTo(0x9a / 255, 5);
    expect(q[2]).toBeCloseTo(0x84 / 255, 5);
  });

  it("returns an empty palette for no classes", () => {
    expect(buildPalette([]).length).toBe(0);
  });
});

describe("srgbToLinear / paletteToLinear", () => {
  it("maps the endpoints and a mid value", () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 6);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214041, 5);
    expect(srgbToLinear(0.02)).toBeCloseTo(0.02 / 12.92, 6);
  });

  it("converts a whole palette without touching the source", () => {
    const src = Float32Array.from([0, 0.5, 1]);
    const lin = paletteToLinear(src);
    expect(lin[1]).toBeCloseTo(0.214041, 5);
    expect(src[1]).toBe(0.5);
  });
});

describe("shadeByDepth", () => {
  const c: [number, number, number] = [0.8, 0.6, 0.4];

  it("leaves colours at or above the water level unchanged", () => {
    expect(shadeByDepth(c, 0.6, 0.6, 6)).toEqual(c);
    expect(shadeByDepth(c, 10, 0.6, 6)).toEqual(c);
  });

  it("darkens to 0.55 at max depth and clamps beyond it", () => {
    const at = shadeByDepth(c, -5.4, 0.6, 6);
    expect(at[0]).toBeCloseTo(0.8 * 0.55, 5);
    expect(at[2]).toBeCloseTo(0.4 * 0.55, 5);
    const deep = shadeByDepth(c, -100, 0.6, 6);
    expect(deep[1]).toBeCloseTo(0.6 * 0.55, 5);
  });

  it("is linear in depth", () => {
    const mid = shadeByDepth(c, -2.4, 0.6, 6); // depth 3 of 6
    expect(mid[0]).toBeCloseTo(0.8 * (1 - 0.45 * 0.5), 5);
  });

  it("does not mutate its input and tolerates maxDepth 0", () => {
    shadeByDepth(c, -3, 0.6, 6);
    expect(c).toEqual([0.8, 0.6, 0.4]);
    const z = shadeByDepth(c, -1, 0.6, 0);
    expect(z[0]).toBeCloseTo(0.8 * 0.55, 5);
  });
});

describe("makeColorAt", () => {
  const palette = Float32Array.from([1, 0, 0, 0, 1, 0]); // id 0 red, id 1 green
  const fallback: [number, number, number] = [0.5, 0.5, 0.5];
  const habitat = Uint8Array.from([0, 1, 7]);

  it("looks up the class colour for the cell", () => {
    const f = makeColorAt(palette, habitat, 0, 6, fallback);
    expect(f(0, 10)).toEqual([1, 0, 0]);
    expect(f(1, 10)).toEqual([0, 1, 0]);
  });

  it("uses the fallback for ids beyond the palette", () => {
    const f = makeColorAt(palette, habitat, 0, 6, fallback);
    expect(f(2, 10)).toEqual(fallback);
  });

  it("applies depth shading below the water level", () => {
    const f = makeColorAt(palette, habitat, 0, 6, fallback);
    const c = f(0, -6);
    expect(c[0]).toBeCloseTo(0.55, 5);
  });

  it("works without a habitat raster (fallback only)", () => {
    const f = makeColorAt(palette, null, 0, 6, fallback);
    expect(f(5, 10)).toEqual(fallback);
  });
});

describe("loadHabitat", () => {
  afterEach(() => vi.unstubAllGlobals());

  const meta = { width: 2, height: 2, habitat_file: "habitat.u8" };

  it("returns null when the dataset has no habitat file", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await loadHabitat("/assets/x", { width: 2, height: 2 })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches and returns the bytes", async () => {
    const fetchMock = vi.fn(async () => new Response(Uint8Array.from([1, 2, 3, 4])));
    vi.stubGlobal("fetch", fetchMock);
    const out = await loadHabitat("/assets/x", meta);
    expect(fetchMock).toHaveBeenCalledWith("/assets/x/habitat.u8");
    expect(Array.from(out!)).toEqual([1, 2, 3, 4]);
    expect(out).toBeInstanceOf(Uint8Array);
  });

  it("throws with url and status on HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 404 })));
    await expect(loadHabitat("/assets/x", meta)).rejects.toThrow(/\/assets\/x\/habitat\.u8.*404/);
  });

  it("throws on a size mismatch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Uint8Array.from([1, 2, 3]))));
    await expect(loadHabitat("/assets/x", meta)).rejects.toThrow(/expected 4 bytes/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd viewer && npm test`
Expected: FAIL: cannot resolve `./habitat`

- [ ] **Step 3: Create `viewer/src/habitat.ts`**

```ts
export interface HabitatClass {
  id: number;
  name: string;
  /** One of the keys of GROUP_COLORS; unknown groups render as "unmapped". */
  group: string;
}

/** Ground colour per habitat group, as 0xRRGGBB sRGB. */
export const GROUP_COLORS: Record<string, number> = {
  unmapped: 0x9a9484,
  water: 0x3f7fa6,
  marsh: 0x7fa06a,
  dune: 0xd8c58a,
  beach: 0xe6d9a8,
  woodland: 0x4f6b3f,
  grassland: 0xb4b870,
  scrub: 0x8a9a5a,
  wetland: 0x6f9a8a,
  rock: 0x8c8c80,
};

function hexToRgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/**
 * Palette indexed by habitat class id: 3 plain sRGB floats (0..1) per id, so the length
 * is (maxId + 1) * 3. Ids with no class, and classes with an unknown group, get the
 * "unmapped" colour. An empty class list gives an empty palette.
 */
export function buildPalette(classes: HabitatClass[]): Float32Array {
  if (classes.length === 0) return new Float32Array(0);
  const maxId = classes.reduce((m, c) => Math.max(m, c.id), 0);
  const palette = new Float32Array((maxId + 1) * 3);
  const unmapped = hexToRgb(GROUP_COLORS.unmapped);
  for (let id = 0; id <= maxId; id++) palette.set(unmapped, id * 3);
  for (const c of classes) {
    const hex = Object.hasOwn(GROUP_COLORS, c.group) ? GROUP_COLORS[c.group] : GROUP_COLORS.unmapped;
    palette.set(hexToRgb(hex), c.id * 3);
  }
  return palette;
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * three.js treats vertex colours as linear values, so sRGB palette entries must be
 * converted before they go into a geometry's `color` attribute. Returns a new array.
 */
export function paletteToLinear(palette: Float32Array): Float32Array {
  const out = new Float32Array(palette.length);
  for (let i = 0; i < palette.length; i++) out[i] = srgbToLinear(palette[i]);
  return out;
}

/**
 * Darken a colour that lies under the water surface: factor 1.0 at the surface falling
 * linearly to 0.55 at maxDepthM and beyond. At or above the water level it is unchanged.
 */
export function shadeByDepth(
  rgb: [number, number, number],
  heightM: number,
  waterLevelM: number,
  maxDepthM: number,
): [number, number, number] {
  const depth = waterLevelM - heightM;
  if (!(depth > 0)) return [rgb[0], rgb[1], rgb[2]];
  const t = maxDepthM > 0 ? Math.min(depth, maxDepthM) / maxDepthM : 1;
  const f = 1 - 0.45 * t;
  return [rgb[0] * f, rgb[1] * f, rgb[2] * f];
}

/**
 * Per-vertex colour function for buildChunkGeometry: class colour of the cell from
 * `palette` (use the linear one), depth-shaded below the water level. `habitat` may be
 * null (no raster), and ids beyond the palette use `fallback`.
 */
export function makeColorAt(
  palette: Float32Array,
  habitat: Uint8Array | null,
  waterLevelM: number,
  maxDepthM: number,
  fallback: [number, number, number],
): (cellIndex: number, heightM: number) => [number, number, number] {
  return (cellIndex, heightM) => {
    let base = fallback;
    if (habitat) {
      const o = habitat[cellIndex] * 3;
      if (o + 2 < palette.length) base = [palette[o], palette[o + 1], palette[o + 2]];
    }
    return shadeByDepth(base, heightM, waterLevelM, maxDepthM);
  };
}
```

- [ ] **Step 4: Replace `viewer/src/heightmap.ts`** (adds the optional habitat meta fields and `loadHabitat`)

```ts
import type { HabitatClass } from "./habitat";

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
  heights_file: string;
  heights_format: string;
  water_level_m: number;
  layers: LayerInfo[];
  /** One byte per cell (habitat class id), same row-major layout as the heightmap. */
  habitat_file?: string;
  habitat_classes?: HabitatClass[];
}

/**
 * Turn quantized 16-bit values into heights (metres). The pipeline maps [min_m, max_m]
 * onto 0..65535; see pipeline/yelamu/export.py.
 */
export function decodeHeights(
  q: ArrayLike<number>,
  meta: Pick<HeightmapMeta, "width" | "height" | "min_m" | "max_m">,
): Float32Array {
  const count = meta.width * meta.height;
  if (q.length !== count) {
    throw new Error(`expected ${count} values for ${meta.width}x${meta.height}, got ${q.length}`);
  }
  const span = meta.max_m - meta.min_m;
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = meta.min_m + (q[i] / 65535) * span;
  }
  return out;
}

async function fetchChecked(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: HTTP ${res.status}`);
  return res;
}

export async function loadHeightmap(
  baseUrl: string,
): Promise<{ meta: HeightmapMeta; heights: Float32Array }> {
  const meta: HeightmapMeta = await (await fetchChecked(`${baseUrl}/meta.json`)).json();
  if (meta.heights_format !== "uint16-le") {
    throw new Error(`unsupported heights_format ${JSON.stringify(meta.heights_format)}`);
  }
  const url = `${baseUrl}/${meta.heights_file}`;
  const buffer = await (await fetchChecked(url)).arrayBuffer();
  const count = meta.width * meta.height;
  if (buffer.byteLength !== count * 2) {
    throw new Error(
      `${url}: expected ${count * 2} bytes for ${meta.width}x${meta.height}, got ${buffer.byteLength}`,
    );
  }
  // Read little-endian explicitly rather than trusting the platform's byte order.
  const view = new DataView(buffer);
  const q = new Uint16Array(count);
  for (let i = 0; i < count; i++) q[i] = view.getUint16(i * 2, true);
  return { meta, heights: decodeHeights(q, meta) };
}

/** Habitat class id per cell, or null when the dataset has no habitat raster. */
export async function loadHabitat(
  baseUrl: string,
  meta: Pick<HeightmapMeta, "width" | "height" | "habitat_file">,
): Promise<Uint8Array | null> {
  if (!meta.habitat_file) return null;
  const url = `${baseUrl}/${meta.habitat_file}`;
  const buffer = await (await fetchChecked(url)).arrayBuffer();
  const count = meta.width * meta.height;
  if (buffer.byteLength !== count) {
    throw new Error(
      `${url}: expected ${count} bytes for ${meta.width}x${meta.height}, got ${buffer.byteLength}`,
    );
  }
  return new Uint8Array(buffer);
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `cd viewer && npm test && npx tsc --noEmit`
Expected: `habitat.test.ts` 20 passed and `heightmap.test.ts` 3 passed (plus the other existing files); `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add viewer/src/habitat.ts viewer/src/habitat.test.ts viewer/src/heightmap.ts
git commit -m "feat(viewer): habitat palette, depth shading, and raster loading"
```

---

### Task 7: Chunk planning and the LRU cache

Pure logic: where the chunks are, which LOD to use, and how to keep a bounded set of built chunks.

**Files:**
- Create: `viewer/src/chunks.ts`, `viewer/src/chunks.test.ts`, `viewer/src/lru.ts`, `viewer/src/lru.test.ts`

- [ ] **Step 1: Write the failing tests**

`viewer/src/chunks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  chunkKey,
  chunkWorldBounds,
  lodForZoom,
  planChunks,
  strideFor,
  switchZoomFor,
} from "./chunks";

describe("planChunks", () => {
  it("covers every cell edge exactly once, with inclusive shared borders", () => {
    const width = 11;
    const height = 8;
    const plan = planChunks(width, height, 4);
    const colHits = new Array(width - 1).fill(0);
    const rowHits = new Array(height - 1).fill(0);
    for (const c of plan) {
      if (c.cy === 0) for (let x = c.x0; x < c.x0 + c.w; x++) colHits[x]++;
      if (c.cx === 0) for (let y = c.y0; y < c.y0 + c.h; y++) rowHits[y]++;
    }
    expect(colHits.every((n) => n === 1)).toBe(true);
    expect(rowHits.every((n) => n === 1)).toBe(true);
    // Total cell area = (width-1)*(height-1).
    expect(plan.reduce((s, c) => s + c.w * c.h, 0)).toBe((width - 1) * (height - 1));
  });

  it("shortens the last chunk and never exceeds the grid", () => {
    const plan = planChunks(11, 8, 4); // 10 x 7 cells -> 3 x 2 chunks
    expect(plan).toHaveLength(6);
    const last = plan[plan.length - 1];
    expect(last).toEqual({ cx: 2, cy: 1, x0: 8, y0: 4, w: 2, h: 3 });
    for (const c of plan) {
      expect(c.x0 + c.w).toBeLessThanOrEqual(10);
      expect(c.y0 + c.h).toBeLessThanOrEqual(7);
    }
  });

  it("orders chunks row-major (north row first)", () => {
    const plan = planChunks(11, 8, 4);
    expect(plan.map((c) => [c.cx, c.cy])).toEqual([
      [0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1],
    ]);
  });

  it("handles the real city size", () => {
    const plan = planChunks(1760, 1560, 128);
    expect(plan).toHaveLength(14 * 13);
    expect(plan[13].w).toBe(1759 - 13 * 128);
  });

  it("makes a single chunk for a tiny grid", () => {
    expect(planChunks(2, 2, 128)).toEqual([{ cx: 0, cy: 0, x0: 0, y0: 0, w: 1, h: 1 }]);
  });

  it("rejects degenerate input", () => {
    expect(() => planChunks(1, 5, 4)).toThrow();
    expect(() => planChunks(5, 1, 4)).toThrow();
    expect(() => planChunks(5, 5, 0)).toThrow();
  });
});

describe("lod helpers", () => {
  it("lodForZoom switches at the threshold (inclusive)", () => {
    expect(lodForZoom(1, 2)).toBe(1);
    expect(lodForZoom(2, 2)).toBe(0);
    expect(lodForZoom(10, 2)).toBe(0);
  });

  it("strideFor maps lods to strides", () => {
    expect(strideFor(0)).toBe(1);
    expect(strideFor(1)).toBe(4);
  });

  it("chunkKey is unique per chunk and lod", () => {
    const [a, b] = planChunks(11, 8, 4);
    expect(chunkKey(a, 0)).not.toBe(chunkKey(a, 1));
    expect(chunkKey(a, 0)).not.toBe(chunkKey(b, 0));
    expect(chunkKey(a, 0)).toBe(chunkKey({ ...a }, 0));
  });
});

describe("switchZoomFor", () => {
  it("is the zoom at which stride-4 vertices are maxSpacingPx apart", () => {
    // 15000 world units across 1000 px = 15 m/px; 40 m spacing is 2.667 px at zoom 1.
    expect(switchZoomFor(15000, 1000, 10, 6, 4)).toBeCloseTo(6 / (40 / 15), 6);
  });

  it("is below the minimum zoom for a small map, so it is always full resolution", () => {
    expect(switchZoomFor(4000, 900, 10, 6, 4)).toBeLessThan(1);
  });
});

describe("chunkWorldBounds", () => {
  const size = { width: 3, height: 3, cell_m: 10 };

  it("matches the terrainMesh world coordinates (north is -z)", () => {
    const b = chunkWorldBounds({ cx: 0, cy: 0, x0: 0, y0: 0, w: 2, h: 2 }, size, -1, 5);
    expect(b.min).toEqual([-10, -1, -10]);
    expect(b.max).toEqual([10, 5, 10]);
  });

  it("places an inner chunk correctly", () => {
    const b = chunkWorldBounds({ cx: 1, cy: 1, x0: 1, y0: 1, w: 1, h: 1 }, size, 0, 1);
    expect(b.min).toEqual([0, 0, 0]);
    expect(b.max).toEqual([10, 1, 10]);
  });
});
```

`viewer/src/lru.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { LruCache } from "./lru";

describe("LruCache", () => {
  it("stores and retrieves values", () => {
    const c = new LruCache<string, number>(2);
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
    expect(c.has("a")).toBe(true);
    expect(c.has("b")).toBe(false);
    expect(c.get("b")).toBeUndefined();
    expect(c.size).toBe(1);
  });

  it("evicts the least recently used entry and calls onEvict", () => {
    const onEvict = vi.fn();
    const c = new LruCache<string, number>(2, onEvict);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    expect(onEvict).toHaveBeenCalledTimes(1);
    expect(onEvict).toHaveBeenCalledWith("a", 1);
    expect(c.has("a")).toBe(false);
    expect(c.size).toBe(2);
  });

  it("get refreshes recency", () => {
    const onEvict = vi.fn();
    const c = new LruCache<string, number>(2, onEvict);
    c.set("a", 1);
    c.set("b", 2);
    c.get("a");
    c.set("c", 3);
    expect(onEvict).toHaveBeenCalledWith("b", 2);
    expect(c.has("a")).toBe(true);
  });

  it("has does not refresh recency", () => {
    const onEvict = vi.fn();
    const c = new LruCache<string, number>(2, onEvict);
    c.set("a", 1);
    c.set("b", 2);
    c.has("a");
    c.set("c", 3);
    expect(onEvict).toHaveBeenCalledWith("a", 1);
  });

  it("evicts in recency order across several inserts", () => {
    const evicted: string[] = [];
    const c = new LruCache<string, number>(2, (k) => evicted.push(k));
    c.set("a", 1);
    c.set("b", 2);
    c.get("a");
    c.set("c", 3); // evicts b
    c.set("d", 4); // evicts a
    expect(evicted).toEqual(["b", "a"]);
  });

  it("replacing an existing key refreshes it and calls onEvict for the old value", () => {
    const onEvict = vi.fn();
    const c = new LruCache<string, number>(2, onEvict);
    c.set("a", 1);
    c.set("b", 2);
    c.set("a", 10);
    expect(onEvict).toHaveBeenCalledWith("a", 1);
    expect(c.size).toBe(2);
    c.set("c", 3); // b is now the oldest
    expect(onEvict).toHaveBeenLastCalledWith("b", 2);
    expect(c.get("a")).toBe(10);
  });

  it("clear calls onEvict for every entry", () => {
    const onEvict = vi.fn();
    const c = new LruCache<string, number>(3, onEvict);
    c.set("a", 1);
    c.set("b", 2);
    c.clear();
    expect(onEvict).toHaveBeenCalledTimes(2);
    expect(c.size).toBe(0);
  });

  it("shrinking the capacity evicts on the next set", () => {
    const evicted: string[] = [];
    const c = new LruCache<string, number>(3, (k) => evicted.push(k));
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    c.capacity = 1;
    c.set("d", 4);
    expect(evicted).toEqual(["a", "b", "c"]);
    expect(c.size).toBe(1);
  });

  it("iterates entries without refreshing recency", () => {
    const c = new LruCache<string, number>(3);
    c.set("a", 1);
    c.set("b", 2);
    expect([...c.entries()]).toEqual([["a", 1], ["b", 2]]);
  });

  it("rejects a capacity below 1", () => {
    expect(() => new LruCache<string, number>(0)).toThrow();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd viewer && npm test`
Expected: FAIL: cannot resolve `./chunks` and `./lru`

- [ ] **Step 3: Create the modules**

`viewer/src/chunks.ts`:

```ts
export interface ChunkPlan {
  cx: number;
  cy: number;
  /** Sample columns x0..x0+w and rows y0..y0+h, INCLUSIVE: neighbours share a border. */
  x0: number;
  y0: number;
  w: number;
  h: number;
}

export type Lod = 0 | 1;

/**
 * Split a width x height sample grid into chunks of up to chunkCells x chunkCells cells.
 * Every cell edge belongs to exactly one chunk; adjacent chunks share their border
 * samples. Row-major order (cy outer, cx inner), north row first.
 */
export function planChunks(width: number, height: number, chunkCells: number): ChunkPlan[] {
  if (width < 2 || height < 2) throw new Error(`grid ${width}x${height} is too small to chunk`);
  if (!Number.isInteger(chunkCells) || chunkCells < 1) {
    throw new Error(`chunkCells must be a positive integer, got ${chunkCells}`);
  }
  const plan: ChunkPlan[] = [];
  const nx = Math.ceil((width - 1) / chunkCells);
  const ny = Math.ceil((height - 1) / chunkCells);
  for (let cy = 0; cy < ny; cy++) {
    const y0 = cy * chunkCells;
    const h = Math.min(chunkCells, height - 1 - y0);
    for (let cx = 0; cx < nx; cx++) {
      const x0 = cx * chunkCells;
      const w = Math.min(chunkCells, width - 1 - x0);
      plan.push({ cx, cy, x0, y0, w, h });
    }
  }
  return plan;
}

/** Zoomed in at or past switchZoom -> full resolution (0); otherwise coarse (1). */
export function lodForZoom(zoom: number, switchZoom: number): Lod {
  return zoom >= switchZoom ? 0 : 1;
}

export function strideFor(lod: Lod): number {
  return lod === 0 ? 1 : 4;
}

export function chunkKey(c: ChunkPlan, lod: Lod): string {
  return `${c.cx}:${c.cy}:${lod}`;
}

/**
 * The orthographic zoom at which the coarse LOD's vertices (stride * cell_m apart) appear
 * maxSpacingPx apart on screen. viewSize is the camera's world-unit view height at zoom 1
 * (from fitViewSize) and viewportHeightPx the canvas height in CSS pixels, so one pixel
 * covers viewSize / (viewportHeightPx * zoom) world units.
 */
export function switchZoomFor(
  viewSize: number,
  viewportHeightPx: number,
  cellM: number,
  maxSpacingPx = 6,
  stride = strideFor(1),
): number {
  const metresPerPixelAtZoom1 = viewSize / viewportHeightPx;
  return (maxSpacingPx * metresPerPixelAtZoom1) / (stride * cellM);
}

/** World-space bounds of a chunk, with the same coordinates as buildTerrainGeometry. */
export function chunkWorldBounds(
  c: ChunkPlan,
  size: { width: number; height: number; cell_m: number },
  minY: number,
  maxY: number,
): { min: [number, number, number]; max: [number, number, number] } {
  const { width, height, cell_m } = size;
  const cx = (width - 1) / 2;
  const cz = (height - 1) / 2;
  return {
    min: [(c.x0 - cx) * cell_m, minY, (c.y0 - cz) * cell_m],
    max: [(c.x0 + c.w - cx) * cell_m, maxY, (c.y0 + c.h - cz) * cell_m],
  };
}
```

`viewer/src/lru.ts`:

```ts
/** Least-recently-used cache backed by Map insertion order. */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(
    public capacity: number,
    private readonly onEvict?: (key: K, value: V) => void,
  ) {
    if (capacity < 1) throw new Error(`capacity must be >= 1, got ${capacity}`);
  }

  get size(): number {
    return this.map.size;
  }

  /** Does not refresh recency. */
  has(key: K): boolean {
    return this.map.has(key);
  }

  /** Refreshes recency. */
  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      const old = this.map.get(key) as V;
      this.map.delete(key);
      if (old !== value) this.onEvict?.(key, old);
    }
    this.map.set(key, value);
    while (this.map.size > this.capacity) {
      // The first key in iteration order is the least recently used.
      const [oldKey, oldValue] = this.map.entries().next().value as [K, V];
      this.map.delete(oldKey);
      this.onEvict?.(oldKey, oldValue);
    }
  }

  /** Oldest first; does not refresh recency. */
  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  clear(): void {
    const all = [...this.map];
    this.map.clear();
    for (const [k, v] of all) this.onEvict?.(k, v);
  }
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `cd viewer && npm test && npx tsc --noEmit`
Expected: `chunks.test.ts` 13 passed and `lru.test.ts` 10 passed; `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add viewer/src/chunks.ts viewer/src/chunks.test.ts viewer/src/lru.ts viewer/src/lru.test.ts
git commit -m "feat(viewer): chunk planning, LOD choice, and LRU cache"
```

---

### Task 8: Chunk geometry

Adds `buildChunkGeometry` next to the existing `buildTerrainGeometry` (which keeps working and keeps its tests). Shared border vertices of neighbouring chunks are identical, so there are no cracks; there is no normals attribute because the material uses flat shading.

**Files:**
- Modify: `viewer/src/terrainMesh.ts`, `viewer/src/terrainMesh.test.ts`

- [ ] **Step 1: Replace `viewer/src/terrainMesh.test.ts`** (the original five tests are kept; the rest are new)

```ts
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { planChunks } from "./chunks";
import { buildChunkGeometry, buildTerrainGeometry } from "./terrainMesh";

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

describe("buildChunkGeometry", () => {
  // 17x17 samples, 16x16 cells; height encodes the sample: h = x + 100 * y.
  const big = { width: 17, height: 17, cell_m: 10 };
  const bigHeights = new Float32Array(17 * 17);
  for (let y = 0; y < 17; y++) for (let x = 0; x < 17; x++) bigHeights[y * 17 + x] = x + 100 * y;
  const plan = planChunks(17, 17, 8); // 2 x 2 chunks of 8 cells

  const positions = (g: THREE.BufferGeometry) => {
    const p = g.getAttribute("position");
    return Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)]);
  };

  it("has (w/stride+1) x (h/stride+1) vertices and two triangles per quad", () => {
    const g1 = buildChunkGeometry(bigHeights, big, plan[0], 1, 1);
    expect(g1.getAttribute("position").count).toBe(81);
    expect(g1.getIndex()!.count).toBe(8 * 8 * 6);
    const g4 = buildChunkGeometry(bigHeights, big, plan[0], 4, 1);
    expect(g4.getAttribute("position").count).toBe(9);
    expect(g4.getIndex()!.count).toBe(2 * 2 * 6);
  });

  it("has no normal attribute and computes bounds", () => {
    const g = buildChunkGeometry(bigHeights, big, plan[0], 1, 1);
    expect(g.getAttribute("normal")).toBeUndefined();
    expect(g.boundingSphere).not.toBeNull();
    expect(g.boundingBox).not.toBeNull();
    expect(g.boundingBox!.max.y).toBeCloseTo(8 + 800);
  });

  it("uses Uint16 indices for small chunks and Uint32 for large ones", () => {
    const g = buildChunkGeometry(bigHeights, big, plan[0], 1, 1);
    expect(g.getIndex()!.array).toBeInstanceOf(Uint16Array);
    const n = 300;
    const hs = new Float32Array(n * n);
    const huge = buildChunkGeometry(hs, { width: n, height: n, cell_m: 1 }, planChunks(n, n, 400)[0], 1, 1);
    expect(huge.getAttribute("position").count).toBe(n * n);
    expect(huge.getIndex()!.array).toBeInstanceOf(Uint32Array);
  });

  it("places positions in the same world coordinates as buildTerrainGeometry", () => {
    const whole = buildTerrainGeometry(bigHeights, big, 3);
    const wp = whole.getAttribute("position");
    const chunk = plan[3]; // x0 = 8, y0 = 8
    const g = buildChunkGeometry(bigHeights, big, chunk, 1, 3);
    const p = g.getAttribute("position");
    for (let j = 0; j <= chunk.h; j++) {
      for (let i = 0; i <= chunk.w; i++) {
        const v = j * (chunk.w + 1) + i;
        const w = (chunk.y0 + j) * 17 + chunk.x0 + i;
        expect(p.getX(v)).toBeCloseTo(wp.getX(w));
        expect(p.getY(v)).toBeCloseTo(wp.getY(w));
        expect(p.getZ(v)).toBeCloseTo(wp.getZ(w));
      }
    }
  });

  it("puts row 0 (north) at negative z and the first row first", () => {
    const g = buildChunkGeometry(bigHeights, big, plan[0], 1, 1);
    const p = g.getAttribute("position");
    expect(p.getX(0)).toBeCloseTo(-80);
    expect(p.getZ(0)).toBeCloseTo(-80);
    expect(p.getZ(80)).toBeCloseTo(0); // last vertex: sample row 8 -> z = (8 - 8) * 10
    expect(p.getZ(9)).toBeGreaterThan(p.getZ(0)); // next row is further south
  });

  it("applies vertical exaggeration", () => {
    const g = buildChunkGeometry(bigHeights, big, plan[0], 1, 2.5);
    expect(g.getAttribute("position").getY(1)).toBeCloseTo(1 * 2.5);
  });

  it.each([1, 2, 4])("shares identical border vertices between neighbours at stride %i", (stride) => {
    const a = positions(buildChunkGeometry(bigHeights, big, plan[0], stride, 1));
    const b = positions(buildChunkGeometry(bigHeights, big, plan[1], stride, 1));
    const c = positions(buildChunkGeometry(bigHeights, big, plan[2], stride, 1));
    const n = Math.ceil(8 / stride) + 1;
    for (let j = 0; j < n; j++) {
      // East border of chunk 0 == west border of chunk 1.
      expect(a[j * n + (n - 1)]).toEqual(b[j * n]);
      // South border of chunk 0 == north border of chunk 2.
      expect(a[(n - 1) * n + j]).toEqual(c[j]);
    }
  });

  it("lands the last vertex exactly on the border when w is not a multiple of stride", () => {
    const grid = { width: 8, height: 8, cell_m: 10 }; // 7 cells
    const hs = new Float32Array(64).map((_, i) => i);
    const chunk = planChunks(8, 8, 7)[0]; // w = h = 7
    const g = buildChunkGeometry(hs, grid, chunk, 4, 1);
    const p = g.getAttribute("position");
    expect(p.count).toBe(3 * 3); // columns 0, 4, 7
    const xs = [0, 1, 2].map((i) => p.getX(i));
    expect(xs[0]).toBeCloseTo((0 - 3.5) * 10);
    expect(xs[1]).toBeCloseTo((4 - 3.5) * 10);
    expect(xs[2]).toBeCloseTo((7 - 3.5) * 10);
    // Last vertex is sample (7, 7).
    expect(p.getX(8)).toBeCloseTo(35);
    expect(p.getZ(8)).toBeCloseTo(35);
    expect(p.getY(8)).toBeCloseTo(63);
    // Triangle indices stay in range.
    const idx = g.getIndex()!.array;
    expect(Math.max(...idx)).toBe(8);
  });

  it("puts heights on the right vertices at stride 4", () => {
    const g = buildChunkGeometry(bigHeights, big, plan[3], 4, 1); // x0 = y0 = 8
    const p = g.getAttribute("position");
    // vertex (i=1, j=2): sample (12, 16)
    expect(p.getY(2 * 3 + 1)).toBeCloseTo(12 + 1600);
  });

  it("faces the triangles up (+y)", () => {
    const g = buildChunkGeometry(new Float32Array(9), { width: 3, height: 3, cell_m: 10 }, planChunks(3, 3, 2)[0], 1, 1);
    const p = g.getAttribute("position");
    const idx = g.getIndex()!;
    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => {
        const i = idx.getX(t + k);
        return new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
      });
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      expect(n.y).toBeGreaterThan(0);
    }
  });

  it("adds a colour attribute from colorAt with the cell index and unexaggerated height", () => {
    const calls: Array<[number, number]> = [];
    const g = buildChunkGeometry(bigHeights, big, plan[3], 4, 3, (cell, h) => {
      calls.push([cell, h]);
      return [h / 2000, cell / 1000, 0.5];
    });
    const col = g.getAttribute("color");
    expect(col.itemSize).toBe(3);
    expect(col.count).toBe(9);
    // vertex (i=1, j=2): sample (12, 16) -> cell 16*17+12
    const cell = 16 * 17 + 12;
    expect(col.getX(7)).toBeCloseTo((12 + 1600) / 2000);
    expect(col.getY(7)).toBeCloseTo(cell / 1000);
    expect(col.getZ(7)).toBeCloseTo(0.5);
    expect(calls).toHaveLength(9);
  });

  it("omits the colour attribute when colorAt is not given", () => {
    expect(buildChunkGeometry(bigHeights, big, plan[0], 4, 1).getAttribute("color")).toBeUndefined();
  });

  it("rejects mismatched sizes and bad strides", () => {
    expect(() => buildChunkGeometry(new Float32Array(4), big, plan[0], 1, 1)).toThrow();
    expect(() => buildChunkGeometry(bigHeights, big, plan[0], 0, 1)).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd viewer && npm test -- src/terrainMesh.test.ts`
Expected: FAIL with `TypeError: buildChunkGeometry is not a function`

- [ ] **Step 3: Replace `viewer/src/terrainMesh.ts`**

```ts
import * as THREE from "three";
import type { ChunkPlan } from "./chunks";

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

/**
 * Geometry for one chunk of the grid at a given stride (1 = every sample, 4 = every 4th).
 * Vertices sit on sample columns x0 + min(i * stride, w) and rows y0 + min(j * stride, h),
 * so the last vertex always lands exactly on the chunk border (even when w is not a
 * multiple of stride) and neighbouring chunks share identical border vertices.
 * Positions use the same world coordinates as buildTerrainGeometry. No normals are
 * produced: pair it with a flat-shaded material. `colorAt` receives the sample's cell
 * index (row * width + col) and its height in metres (before exaggeration).
 */
export function buildChunkGeometry(
  heights: Float32Array,
  size: GridSize,
  chunk: ChunkPlan,
  stride: number,
  exaggeration: number,
  colorAt?: (cellIndex: number, heightM: number) => [number, number, number],
): THREE.BufferGeometry {
  const { width, height, cell_m } = size;
  if (heights.length !== width * height) {
    throw new Error(`heights has ${heights.length} samples, expected ${width * height}`);
  }
  if (!Number.isInteger(stride) || stride < 1) {
    throw new Error(`stride must be a positive integer, got ${stride}`);
  }
  const { x0, y0, w, h } = chunk;
  const nx = Math.ceil(w / stride) + 1;
  const ny = Math.ceil(h / stride) + 1;
  const count = nx * ny;
  const cx = (width - 1) / 2;
  const cz = (height - 1) / 2;

  const positions = new Float32Array(count * 3);
  const colors = colorAt ? new Float32Array(count * 3) : null;
  let v = 0;
  for (let j = 0; j < ny; j++) {
    const sy = y0 + Math.min(j * stride, h);
    for (let i = 0; i < nx; i++) {
      const sx = x0 + Math.min(i * stride, w);
      const cell = sy * width + sx;
      const heightM = heights[cell];
      positions[v * 3] = (sx - cx) * cell_m;
      positions[v * 3 + 1] = heightM * exaggeration;
      positions[v * 3 + 2] = (sy - cz) * cell_m;
      if (colors) {
        const c = colorAt!(cell, heightM);
        colors[v * 3] = c[0];
        colors[v * 3 + 1] = c[1];
        colors[v * 3 + 2] = c[2];
      }
      v++;
    }
  }

  const quads = (nx - 1) * (ny - 1);
  const indices = count < 65536 ? new Uint16Array(quads * 6) : new Uint32Array(quads * 6);
  let k = 0;
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i; // north-west
      const b = a + nx; // south-west
      const c = a + 1; // north-east
      const d = b + 1; // south-east
      // Counter-clockwise seen from above (+y), so faces point up.
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = c;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (colors) geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `cd viewer && npm test && npx tsc --noEmit`
Expected: `terrainMesh.test.ts` 20 passed; `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add viewer/src/terrainMesh.ts viewer/src/terrainMesh.test.ts
git commit -m "feat(viewer): chunk geometry with shared borders and vertex colours"
```

---

### Task 9: The terrain LOD manager

Thin wiring between the tested pure functions and three.js: all chunks at LOD1 up front; at LOD0, build only what is in view, nearest the view centre first, a few per frame, in an LRU cache whose capacity never drops below the number of chunks in view.

**Files:**
- Create: `viewer/src/terrainChunks.ts`, `viewer/src/terrainChunks.test.ts`

- [ ] **Step 1: Write the failing test `viewer/src/terrainChunks.test.ts`**

```ts
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TerrainChunks } from "./terrainChunks";

// 33x33 samples, 10 m cells -> world x/z in [-160, 160]; 4x4 chunks of 8 cells (80 m).
const size = { width: 33, height: 33, cell_m: 10 };
const heights = new Float32Array(33 * 33).map((_, i) => (i % 33) + Math.floor(i / 33));
const material = new THREE.MeshBasicMaterial();

/** Top-down camera centred on (x, z) seeing a square of `view` metres at zoom 1. */
function camera(x: number, z: number, view: number, zoom: number): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(-view / 2, view / 2, view / 2, -view / 2, -1e5, 1e5);
  cam.zoom = zoom;
  cam.up.set(0, 0, -1);
  cam.position.set(x, 1000, z);
  cam.lookAt(x, 0, z);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
}

function make(opts: Partial<ConstructorParameters<typeof TerrainChunks>[5]> = {}) {
  return new TerrainChunks(
    heights,
    size,
    3,
    () => [1, 1, 1],
    material,
    { chunkCells: 8, switchZoom: 2, ...opts },
  );
}

const lodMeshes = (t: TerrainChunks, lod: number) =>
  t.root.children.filter((m) => m.userData.lod === lod) as THREE.Mesh[];
const visible = (t: TerrainChunks, lod: number) => lodMeshes(t, lod).filter((m) => m.visible);

describe("TerrainChunks", () => {
  it("builds a visible LOD1 mesh for every chunk at construction", () => {
    const t = make();
    expect(lodMeshes(t, 1)).toHaveLength(16);
    expect(visible(t, 1)).toHaveLength(16);
    expect(lodMeshes(t, 0)).toHaveLength(0);
    // Stride-4 chunks of 8 cells: 3x3 vertices each, with colours.
    const g = lodMeshes(t, 1)[0].geometry;
    expect(g.getAttribute("position").count).toBe(9);
    expect(g.getAttribute("color")).toBeDefined();
    t.dispose();
  });

  it("shows only LOD1 and builds nothing when zoomed out", () => {
    const t = make();
    const pending = t.update(camera(0, 0, 400, 1));
    expect(pending).toBe(false);
    expect(t.stats()).toMatchObject({ lod: 1, lod0Resident: 0, lod0Visible: 0, lod1Visible: 16 });
    t.dispose();
  });

  it("builds LOD0 only for chunks in view when zoomed in, and hides LOD1", () => {
    const t = make();
    // View 400 m at zoom 4 -> 100 m square around (-100, -100): x,z in [-150, -50].
    // Chunks span 80 m: columns/rows [-160,-80] and [-80,0] -> 2 x 2 chunks.
    const pending = t.update(camera(-100, -100, 400, 4));
    expect(pending).toBe(false);
    expect(t.stats()).toMatchObject({ lod: 0, lod0Resident: 4, lod0Visible: 4, lod1Visible: 0 });
    expect(visible(t, 0)[0].geometry.getAttribute("position").count).toBe(81);
    t.dispose();
  });

  it("can see a single chunk", () => {
    const t = make();
    t.update(camera(-100, -100, 400, 12)); // 33 m square: x,z in [-116, -83]
    expect(t.stats()).toMatchObject({ lod0Resident: 1, lod0Visible: 1 });
    t.dispose();
  });

  it("switches back to LOD1 and hides LOD0 when zooming out", () => {
    const t = make();
    t.update(camera(-100, -100, 400, 12));
    t.update(camera(-100, -100, 400, 1));
    expect(t.stats()).toMatchObject({ lod: 1, lod0Visible: 0, lod1Visible: 16, lod0Resident: 1 });
    t.dispose();
  });

  it("hides cached LOD0 chunks that leave the view but keeps them resident", () => {
    const t = make();
    t.update(camera(-100, -100, 400, 12));
    t.update(camera(100, 100, 400, 12));
    expect(t.stats()).toMatchObject({ lod0Resident: 2, lod0Visible: 1 });
    // Going back reuses the cached mesh: nothing new is built.
    const before = lodMeshes(t, 0);
    t.update(camera(-100, -100, 400, 12));
    expect(lodMeshes(t, 0)).toEqual(before);
    expect(t.stats()).toMatchObject({ lod0Resident: 2, lod0Visible: 1 });
    t.dispose();
  });

  it("caps builds per update and reports pending work", () => {
    const t = make({ maxBuildsPerUpdate: 6 });
    const cam = camera(0, 0, 800, 2); // sees the whole 320 m grid
    expect(t.update(cam)).toBe(true);
    expect(t.stats().lod0Resident).toBe(6);
    expect(t.update(cam)).toBe(true);
    expect(t.stats().lod0Resident).toBe(12);
    expect(t.update(cam)).toBe(false);
    expect(t.stats()).toMatchObject({ lod0Resident: 16, lod0Visible: 16 });
    t.dispose();
  });

  it("builds the chunks nearest the view centre first", () => {
    const t = make({ maxBuildsPerUpdate: 4 });
    t.update(camera(0, 0, 800, 2));
    // The four chunks touching the origin come first.
    const bounds = visible(t, 0).map((m) => {
      m.geometry.computeBoundingBox();
      return m.geometry.boundingBox!;
    });
    expect(bounds).toHaveLength(4);
    for (const b of bounds) {
      expect(b.min.x).toBeGreaterThanOrEqual(-80);
      expect(b.max.x).toBeLessThanOrEqual(80);
      expect(b.min.z).toBeGreaterThanOrEqual(-80);
      expect(b.max.z).toBeLessThanOrEqual(80);
    }
    t.dispose();
  });

  it("evicts least recently used LOD0 chunks and disposes their geometry", () => {
    const t = make({ lruCapacity: 2 });
    t.update(camera(-100, -100, 400, 12));
    const first = lodMeshes(t, 0)[0];
    let disposed = 0;
    first.geometry.addEventListener("dispose", () => disposed++);

    t.update(camera(100, -100, 400, 12));
    expect(t.stats().lod0Resident).toBe(2);
    expect(disposed).toBe(0);
    t.update(camera(100, 100, 400, 12)); // third chunk: evicts the first
    expect(t.stats().lod0Resident).toBe(2);
    expect(disposed).toBe(1);
    expect(t.root.children.includes(first)).toBe(false);
    expect(lodMeshes(t, 0)).toHaveLength(2);
    t.dispose();
  });

  it("does not thrash when more chunks are in view than the LRU capacity", () => {
    const t = make({ lruCapacity: 2, maxBuildsPerUpdate: 100 });
    const cam = camera(0, 0, 800, 2);
    expect(t.update(cam)).toBe(false);
    expect(t.stats()).toMatchObject({ lod0Resident: 16, lod0Visible: 16 });
    t.dispose();
  });

  it("dispose removes everything and disposes geometries", () => {
    const t = make();
    t.update(camera(-100, -100, 400, 12));
    const geos = t.root.children.map((m) => (m as THREE.Mesh).geometry);
    let n = 0;
    for (const g of geos) g.addEventListener("dispose", () => n++);
    t.dispose();
    expect(t.root.children).toHaveLength(0);
    expect(n).toBe(geos.length);
  });

  it("works without colorAt", () => {
    const t = new TerrainChunks(heights, size, 1, undefined, material, { chunkCells: 8, switchZoom: 2 });
    expect(lodMeshes(t, 1)[0].geometry.getAttribute("color")).toBeUndefined();
    t.dispose();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd viewer && npm test`
Expected: FAIL: cannot resolve `./terrainChunks`

- [ ] **Step 3: Create `viewer/src/terrainChunks.ts`**

```ts
import * as THREE from "three";
import {
  chunkKey,
  chunkWorldBounds,
  lodForZoom,
  planChunks,
  strideFor,
  type ChunkPlan,
  type Lod,
} from "./chunks";
import { LruCache } from "./lru";
import { buildChunkGeometry, type GridSize } from "./terrainMesh";

export interface TerrainChunksOptions {
  /** Cells per chunk edge. Default 128. */
  chunkCells?: number;
  /** Camera zoom at or above which full-resolution chunks are used. */
  switchZoom: number;
  /** Max resident full-resolution chunks (grows if more are in view). Default 96. */
  lruCapacity?: number;
  /** Max full-resolution chunks built by one update() call. Default 6. */
  maxBuildsPerUpdate?: number;
}

export type ColorAt = (cellIndex: number, heightM: number) => [number, number, number];

interface Entry {
  plan: ChunkPlan;
  bounds: THREE.Box3;
  lod1: THREE.Mesh;
}

/**
 * Chunked terrain with two global levels of detail. All chunks share one LOD at a time
 * (picked from camera zoom), so LOD boundaries never meet: LOD1 (stride 4) covers every
 * chunk and is built up front; LOD0 (stride 1) is built lazily for chunks in view and
 * kept in an LRU cache. The decisions live in chunks.ts; this class only wires them to
 * three.js objects. The material is shared and owned by the caller.
 */
export class TerrainChunks {
  readonly root = new THREE.Group();

  private readonly entries: Entry[];
  private readonly lod0: LruCache<string, THREE.Mesh>;
  private readonly visibleLod0 = new Set<THREE.Mesh>();
  private readonly baseCapacity: number;
  private readonly maxBuilds: number;
  private readonly switchZoom: number;
  private currentLod: Lod = 1;

  private readonly frustum = new THREE.Frustum();
  private readonly projScreen = new THREE.Matrix4();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();

  constructor(
    private readonly heights: Float32Array,
    private readonly size: GridSize,
    private readonly exaggeration: number,
    private readonly colorAt: ColorAt | undefined,
    private readonly material: THREE.Material,
    options: TerrainChunksOptions,
  ) {
    const chunkCells = options.chunkCells ?? 128;
    this.switchZoom = options.switchZoom;
    this.baseCapacity = options.lruCapacity ?? 96;
    this.maxBuilds = options.maxBuildsPerUpdate ?? 6;
    this.lod0 = new LruCache<string, THREE.Mesh>(this.baseCapacity, (_key, mesh) => {
      this.visibleLod0.delete(mesh);
      this.root.remove(mesh);
      mesh.geometry.dispose();
    });

    const plan = planChunks(size.width, size.height, chunkCells);
    this.entries = plan.map((chunk) => {
      const [minH, maxH] = this.heightRange(chunk);
      const ys = [minH * exaggeration, maxH * exaggeration];
      const b = chunkWorldBounds(chunk, size, Math.min(...ys), Math.max(...ys));
      const lod1 = this.makeMesh(chunk, 1);
      this.root.add(lod1);
      return { plan: chunk, bounds: new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max)), lod1 };
    });
  }

  /**
   * Pick the LOD for the camera and make the right meshes visible. Returns true when
   * full-resolution chunks in view are still waiting to be built (call again next frame).
   */
  update(camera: THREE.OrthographicCamera): boolean {
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const lod = lodForZoom(camera.zoom, this.switchZoom);
    this.currentLod = lod;

    if (lod === 1) {
      for (const e of this.entries) e.lod1.visible = true;
      this.hideAllLod0();
      return false;
    }
    for (const e of this.entries) e.lod1.visible = false;

    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    const inView = this.entries.filter((e) => this.frustum.intersectsBox(e.bounds));

    // Never let the cache be smaller than the working set, or it would thrash.
    this.lod0.capacity = Math.max(this.baseCapacity, inView.length);

    // Pass 1: reuse cached meshes (this also refreshes their recency, so the builds in
    // pass 2 can only evict chunks that are not in view).
    const nowVisible = new Set<THREE.Mesh>();
    const missing: Entry[] = [];
    for (const e of inView) {
      const mesh = this.lod0.get(chunkKey(e.plan, 0));
      if (mesh) nowVisible.add(mesh);
      else missing.push(e);
    }

    // Pass 2: build the missing chunks nearest the view centre first, up to the cap.
    this.viewCentre(camera, this.tmpPos);
    const centre = this.tmpPos;
    const dist = (e: Entry) => {
      const c = e.bounds.getCenter(this.tmpDir);
      return (c.x - centre.x) ** 2 + (c.z - centre.z) ** 2;
    };
    const order = missing.map((e) => ({ e, d: dist(e) })).sort((a, b) => a.d - b.d);
    let built = 0;
    for (const { e } of order) {
      if (built >= this.maxBuilds) break;
      const mesh = this.makeMesh(e.plan, 0);
      this.root.add(mesh);
      this.lod0.set(chunkKey(e.plan, 0), mesh);
      nowVisible.add(mesh);
      built++;
    }

    for (const m of this.visibleLod0) if (!nowVisible.has(m)) m.visible = false;
    for (const m of nowVisible) m.visible = true;
    this.visibleLod0.clear();
    for (const m of nowVisible) this.visibleLod0.add(m);

    return missing.length > built;
  }

  stats(): { lod: Lod; lod0Resident: number; lod0Visible: number; lod1Visible: number } {
    return {
      lod: this.currentLod,
      lod0Resident: this.lod0.size,
      lod0Visible: this.visibleLod0.size,
      lod1Visible: this.entries.filter((e) => e.lod1.visible).length,
    };
  }

  /** Free all geometry. The shared material is left alone. */
  dispose(): void {
    this.lod0.clear();
    this.visibleLod0.clear();
    for (const e of this.entries) {
      this.root.remove(e.lod1);
      e.lod1.geometry.dispose();
    }
    this.root.clear();
  }

  private makeMesh(chunk: ChunkPlan, lod: Lod): THREE.Mesh {
    const geometry = buildChunkGeometry(
      this.heights,
      this.size,
      chunk,
      strideFor(lod),
      this.exaggeration,
      this.colorAt,
    );
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.userData.lod = lod;
    mesh.matrixAutoUpdate = false; // chunks sit at the origin and never move
    return mesh;
  }

  private heightRange(c: ChunkPlan): [number, number] {
    const { width } = this.size;
    let lo = Infinity;
    let hi = -Infinity;
    for (let y = c.y0; y <= c.y0 + c.h; y++) {
      const row = y * width;
      for (let x = c.x0; x <= c.x0 + c.w; x++) {
        const h = this.heights[row + x];
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    return [lo, hi];
  }

  private hideAllLod0(): void {
    for (const m of this.visibleLod0) m.visible = false;
    this.visibleLod0.clear();
  }

  /** Where the view axis meets the ground plane (y = 0); falls back to the camera position. */
  private viewCentre(camera: THREE.OrthographicCamera, out: THREE.Vector3): THREE.Vector3 {
    camera.getWorldPosition(out);
    camera.getWorldDirection(this.tmpDir);
    if (this.tmpDir.y < -1e-6) out.addScaledVector(this.tmpDir, -out.y / this.tmpDir.y);
    return out;
  }
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `cd viewer && npm test && npx tsc --noEmit`
Expected: `terrainChunks.test.ts` 12 passed; `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add viewer/src/terrainChunks.ts viewer/src/terrainChunks.test.ts
git commit -m "feat(viewer): chunked terrain with lazy full-resolution LOD and LRU cache"
```

---

### Task 10: Wire it into the app; synthetic whole-city data; performance check

`main.ts` switches to `TerrainChunks`, colours the ground from the habitat raster, adds a sea-floor plane (so the edge of the data is invisible from open water), and gains a `?debug` overlay. A synthetic whole-city dataset lets you test the viewer without any real data, and it contains no SFEI data.

**Files:**
- Modify: `viewer/src/main.ts`, `viewer/package.json`, `.gitignore`
- Create: `viewer/scripts/make_city_synth.mjs`

- [ ] **Step 1: Replace `viewer/src/main.ts`**

```ts
import * as THREE from "three";
import { createIsoCamera, fitViewSize } from "./camera";
import { switchZoomFor } from "./chunks";
import { attachControls } from "./controls";
import { GROUP_COLORS, buildPalette, makeColorAt, paletteToLinear, shadeByDepth } from "./habitat";
import { loadHabitat, loadHeightmap } from "./heightmap";
import { TerrainChunks } from "./terrainChunks";

// Real hills are gentle at this scale; a diorama needs them exaggerated to read.
const VERTICAL_EXAGGERATION = 3;
// Ground below the water surface darkens down to this depth (metres, real scale).
const MAX_SHADE_DEPTH_M = 6;
// Ground colour for datasets without a habitat raster (the old flat tan).
const FALLBACK_GROUND = 0xa89f78;
// The coarse LOD (every 4th sample) is replaced by full resolution once its vertices
// would be more than this many screen pixels apart. See switchZoomFor in chunks.ts.
const MAX_COARSE_SPACING_PX = 6;

// Which dataset folder under public/assets/ to load. `?data=real` selects the locally
// generated real-data slice (gitignored; see docs/research/slice-results.md);
// `?data=city-synth` the synthetic whole-city grid (npm run make:city-synth). The name
// is restricted so a URL cannot point the loader at arbitrary paths.
const params = new URLSearchParams(location.search);
const requested = params.get("data") ?? "slice";
const dataset = /^[a-z0-9_-]+$/.test(requested) ? requested : "slice";
const ASSET_BASE = `${import.meta.env.BASE_URL}assets/${dataset}`;
const DEBUG = params.has("debug");

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
  const habitat = await loadHabitat(ASSET_BASE, meta);

  // Palette entries are sRGB; vertex colours are read as linear by three.js.
  const palette = paletteToLinear(buildPalette(habitat ? (meta.habitat_classes ?? []) : []));
  const fallback = new THREE.Color(FALLBACK_GROUND); // already linear
  const colorAt = makeColorAt(
    palette,
    habitat,
    meta.water_level_m,
    MAX_SHADE_DEPTH_M,
    [fallback.r, fallback.g, fallback.b],
  );

  const widthM = meta.width * meta.cell_m;
  const depthM = meta.height * meta.cell_m;
  const maxHeightM = (meta.max_m - meta.min_m) * VERTICAL_EXAGGERATION;
  const aspect0 = canvas.clientWidth / canvas.clientHeight;
  // Fixed from the framing at startup (resizing refits the view but keeps this zoom).
  const switchZoom = switchZoomFor(
    fitViewSize(widthM, depthM, maxHeightM, aspect0),
    canvas.clientHeight,
    meta.cell_m,
    MAX_COARSE_SPACING_PX,
  );

  const terrain = new TerrainChunks(
    heights,
    meta,
    VERTICAL_EXAGGERATION,
    colorAt,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }),
    { switchZoom },
  );
  scene.add(terrain.root);

  const extent = Math.max(meta.width, meta.height) * meta.cell_m;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(extent * 4, extent * 4).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3f7fa6, transparent: true, opacity: 0.8 }),
  );
  water.position.y = meta.water_level_m * VERTICAL_EXAGGERATION;
  scene.add(water);

  // A sea floor under the translucent water, coloured like the deepest bay cells and lit
  // like the terrain (same material type), so the edge of the data square is invisible
  // from the open water beyond it. Half a metre below the lowest terrain to avoid z-fighting.
  const deep = new THREE.Color(GROUP_COLORS.water); // linear working space
  const [fr, fg, fb] = shadeByDepth([deep.r, deep.g, deep.b], meta.min_m, meta.water_level_m, MAX_SHADE_DEPTH_M);
  const seaFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(extent * 4, extent * 4).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(fr, fg, fb) }),
  );
  seaFloor.position.y = (meta.min_m - 0.5) * VERTICAL_EXAGGERATION;
  scene.add(seaFloor);

  const camera = createIsoCamera(fitViewSize(widthM, depthM, maxHeightM, aspect0), aspect0);

  // Debug overlay (?debug): rolling fps over the last frames, renderer stats, LOD state.
  const overlay = DEBUG ? document.createElement("div") : null;
  if (overlay) {
    overlay.style.cssText =
      "position:fixed;right:12px;top:12px;padding:6px 10px;background:rgba(0,0,0,.7);" +
      "color:#fff;border-radius:6px;font:12px/1.4 ui-monospace,monospace;white-space:pre;pointer-events:none";
    document.body.appendChild(overlay);
  }
  const frameTimes: number[] = [];
  let lastFrame = 0;
  const trackFrame = (now: number) => {
    // Rendering is on demand, so skip the idle gaps between interactions.
    if (lastFrame && now - lastFrame < 500) {
      frameTimes.push(now - lastFrame);
      if (frameTimes.length > 60) frameTimes.shift();
    }
    lastFrame = now;
  };
  const updateOverlay = () => {
    if (!overlay) return;
    const avg = frameTimes.reduce((a, b) => a + b, 0) / (frameTimes.length || 1);
    const s = terrain.stats();
    overlay.textContent =
      `fps        ${avg > 0 ? (1000 / avg).toFixed(0) : "-"}\n` +
      `draw calls ${renderer.info.render.calls}\n` +
      `triangles  ${renderer.info.render.triangles.toLocaleString()}\n` +
      `LOD        ${s.lod} (switch at zoom ${switchZoom.toFixed(2)}, now ${camera.zoom.toFixed(2)})\n` +
      `LOD0 chunks resident ${s.lod0Resident}, visible ${s.lod0Visible}`;
  };

  // One render per animation frame, however many times it is requested. update() may
  // return true when chunks are still being built, so keep going until it settles.
  let queued = false;
  const requestRender = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame((now) => {
      queued = false;
      const pending = terrain.update(camera);
      renderer.render(scene, camera);
      trackFrame(now);
      updateOverlay();
      if (pending) requestRender();
    });
  };
  const controls = attachControls(canvas, camera, requestRender);

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    // Refit to the current aspect so the whole map stays in view; zoom is left alone.
    const half = fitViewSize(widthM, depthM, maxHeightM, aspect) / 2;
    camera.top = half;
    camera.bottom = -half;
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

- [ ] **Step 2: Create `viewer/scripts/make_city_synth.mjs`**

```javascript
// Synthetic whole-city dataset for exercising the chunked viewer (no real data).
// Writes public/assets/city-synth/{heightmap.u16, habitat.u8, meta.json}:
//   1760 x 1560 cells at 10 m, little-endian uint16 heights over [min_m, max_m],
//   one habitat class id byte per cell, row-major, row 0 = north.
// Usage: node scripts/make_city_synth.mjs   then open  /?data=city-synth[&debug]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = 1760;
const H = 1560;
const CELL_M = 10;
const MIN_M = -3;
const MAX_M = 280;
const WATER_LEVEL_M = 0.6;

const CLASSES = [
  { id: 0, name: "Unmapped", group: "unmapped" },
  { id: 1, name: "Open Bay Water", group: "water" },
  { id: 2, name: "Tidal Salt Marsh", group: "marsh" },
  { id: 3, name: "Active Dune Field", group: "dune" },
  { id: 4, name: "Sandy Beach", group: "beach" },
  { id: 5, name: "Coast Live Oak Woodland", group: "woodland" },
  { id: 6, name: "Redwood Stand", group: "woodland" },
  { id: 7, name: "Coastal Prairie", group: "grassland" },
  { id: 8, name: "Serpentine Grassland", group: "grassland" },
  { id: 9, name: "Northern Coastal Scrub", group: "scrub" },
  { id: 10, name: "Willow Riparian Wetland", group: "wetland" },
  { id: 11, name: "Rocky Outcrop", group: "rock" },
];

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Deterministic hash -> [0, 1).
function hash(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Bilinearly interpolated value noise with feature size `scale` cells.
function vnoise(x, y, scale, seed) {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const gauss = (x, y, cx, cy, sx, sy) =>
  Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2) / 2);

// Hills: [centre x, centre y (cells), sigma x, sigma y, peak metres].
const HILLS = [
  [520, 520, 190, 160, 205],
  [980, 1000, 240, 200, 180],
  [300, 1150, 160, 190, 150],
  [1150, 330, 130, 120, 120],
  [700, 800, 320, 300, 90],
];

/** Column of the eastern shoreline at row y. */
function shoreX(y) {
  return (
    0.78 * W +
    0.05 * W * Math.sin((y / H) * Math.PI * 4) +
    0.02 * W * Math.sin((y / H) * Math.PI * 11 + 1.3) +
    // A deeper bay mouth in the middle rows.
    0.06 * W * gauss(0, y, 0, 0.5 * H, 1, 0.12 * H)
  );
}

function buildHeight(x, y) {
  const shore = shoreX(y);
  const dist = x - shore; // > 0: into the bay
  let land = 4 + 3 * Math.sin(x / 90) * Math.cos(y / 110) + 6 * (vnoise(x, y, 40, 1) - 0.5);
  for (const [cx, cy, sx, sy, peak] of HILLS) land += peak * gauss(x, y, cx, cy, sx, sy);
  land += 14 * vnoise(x, y, 70, 2) * smoothstep(0, 200, -dist);
  // Flatten towards a low coastal plain near the shore so the beach is gentle.
  land *= smoothstep(-5, 90, -dist) * 0.97 + 0.03;
  land = Math.max(land, 1.2 * smoothstep(-5, 0, -dist) + 0.9);

  if (dist <= 0) return Math.min(land, MAX_M - 1);
  // Bay: slope from the shoreline down to a -3 m shelf over ~40 cells.
  const shelf = -3;
  const t = smoothstep(0, 40, dist);
  const edge = 0.9; // just above water level at the shoreline
  return edge + (shelf - edge) * t;
}

function classify(x, y, h, slope) {
  if (h < WATER_LEVEL_M) return 1;
  const shore = shoreX(y);
  const dist = shore - x; // cells inland from the shoreline
  const n1 = vnoise(x, y, 120, 11);
  const n2 = vnoise(x, y, 45, 12);
  const n3 = vnoise(x, y, 220, 13);
  if (h < 3 && dist < 14) return 4; // beach strip
  if (h < 4 && n1 > 0.45 && y < 0.5 * H) return 2; // tidal marsh, northern shore
  if (h < 5 && y > 0.6 * H && n2 > 0.6 && dist < 120) return 10; // riparian lowlands
  if (x < 0.22 * W && h < 40) return n2 > 0.35 ? 3 : 9; // dunes behind the west coast
  if (h > 170 && slope > 0.5) return 11; // summits and ledges
  if (h > 190) return 11;
  if (h > 60 && n1 > 0.5) return n3 > 0.55 ? 6 : 5; // wooded slopes
  if (h > 25 && n2 > 0.62) return 5;
  if (n3 > 0.62) return 8; // serpentine grassland patches
  if (n1 < 0.38) return 9; // scrub
  if (n2 < 0.12) return 0; // a few unmapped holes
  return 7; // coastal prairie
}

const count = W * H;
const heights = new Float32Array(count);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) heights[y * W + x] = buildHeight(x, y);

const q = Buffer.alloc(count * 2);
const habitat = Buffer.alloc(count);
const span = MAX_M - MIN_M;
let minH = Infinity;
let maxH = -Infinity;
const used = new Set();
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const h = heights[i];
    minH = Math.min(minH, h);
    maxH = Math.max(maxH, h);
    q.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(((h - MIN_M) / span) * 65535))), i * 2);
    const hx = heights[y * W + Math.min(W - 1, x + 1)] - h;
    const hy = heights[Math.min(H - 1, y + 1) * W + x] - h;
    const slope = Math.hypot(hx, hy) / CELL_M;
    const c = classify(x, y, h, slope);
    habitat[i] = c;
    used.add(c);
  }
}

const meta = {
  width: W,
  height: H,
  cell_m: CELL_M,
  min_m: MIN_M,
  max_m: MAX_M,
  heights_file: "heightmap.u16",
  heights_format: "uint16-le",
  water_level_m: WATER_LEVEL_M,
  habitat_file: "habitat.u8",
  habitat_classes: CLASSES,
  layers: [],
};

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "city-synth");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "heightmap.u16"), q);
writeFileSync(join(out, "habitat.u8"), habitat);
writeFileSync(join(out, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
console.log(
  `wrote ${out}\n  heights ${minH.toFixed(1)}..${maxH.toFixed(1)} m, classes used: ${[...used].sort((a, b) => a - b).join(",")}`,
);
```

- [ ] **Step 3: Add the npm script and ignore the generated data**

In `viewer/package.json`, add this line to `"scripts"`:

```json
    "make:city-synth": "node scripts/make_city_synth.mjs",
```

Append to the root `.gitignore`:

```gitignore
# Generated synthetic whole-city test data (no real data in it, but 8 MB of binary)
viewer/public/assets/city-synth/
```

- [ ] **Step 4: Typecheck, test, build**

Run: `cd viewer && npx tsc --noEmit && npm test && npm run build`
Expected: `tsc` clean; **88 passed** across 7 files; the build succeeds (the Three.js chunk-size warning is expected).

- [ ] **Step 5: Generate the synthetic city and look at it**

```bash
cd viewer && npm run make:city-synth && npx vite --port 5199 --strictPort
```
Open <http://localhost:5199/?data=city-synth&debug>. Expected:
- A whole synthetic city (hills, patches of habitat colour, a wavy bay on the east) fits the window, with no visible edge to the sea.
- The overlay reads about `draw calls 184`, `triangles 343,2xx` (343 k), `LOD 1`, `LOD0 chunks resident 0`.
- Scroll to zoom in. Past the `switch at zoom` value the overlay flips to `LOD 0` and shows `LOD0 chunks resident`/`visible` counts; pan around and the counts change without hitches; nothing in the console.

- [ ] **Step 6: Measure performance**

Open the browser console on that page (or use the Browser pane's JavaScript tool), paste the benchmark, then run it at two zooms: once zoomed out (LOD 1) and once just above the switch zoom (the worst case). First create the benchmark file so it is kept with the plan:

Create `docs/research/perf-bench.js`:

```javascript
// Paste into the browser console (or the Browser pane's javascript tool) on a page opened with ?debug.
// Drives continuous panning through the page's own pointer handlers and reports the cost of
// each render callback and the gap between frames. Rendering is on demand, so the page only
// draws while input arrives; that is exactly the interactive case we want to measure.
window.__bench = async function (label, seconds, dxPerMove) {
  const canvas = document.getElementById("scene");
  canvas.setPointerCapture = () => {}; // synthetic pointer ids cannot be captured
  const durations = [], stamps = [];
  const orig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    orig((t) => { const s = performance.now(); cb(t); durations.push(performance.now() - s); stamps.push(s); });
  const r = canvas.getBoundingClientRect();
  let x = r.left + r.width / 2, y = r.top + r.height / 2, dir = 1, moves = 0;
  const fire = (type, buttons) =>
    canvas.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: "mouse", button: 0, buttons, clientX: x, clientY: y, bubbles: true }));
  fire("pointerdown", 1);
  const t0 = performance.now();
  await new Promise((res) => {
    const id = setInterval(() => {
      x += dir * dxPerMove; moves++;
      if (moves % 20 === 0) dir = -dir; // sweep back and forth so the view stays put
      fire("pointermove", 1);
      if (performance.now() - t0 > seconds * 1000) { clearInterval(id); res(); }
    }, 8);
  });
  fire("pointerup", 0);
  window.requestAnimationFrame = orig;
  const gaps = stamps.slice(1).map((s, i) => s - stamps[i]).sort((a, b) => a - b);
  const d = durations.slice().sort((a, b) => a - b);
  const q = (arr, p) => (arr.length ? +arr[Math.min(arr.length - 1, Math.floor(arr.length * p))].toFixed(1) : null);
  return {
    label, frames: durations.length,
    effectiveFps: +(durations.length / ((performance.now() - t0) / 1000)).toFixed(1),
    cbMs: { median: q(d, 0.5), p95: q(d, 0.95), max: q(d, 1) },
    frameGapMs: { median: q(gaps, 0.5), p95: q(gaps, 0.95) },
  };
};
// Example: JSON.stringify(await window.__bench("zoomed in, panning", 4, 12))
```

Then run, for example, `JSON.stringify(await window.__bench("just above switch, panning", 4, 12))`.
Expected on a recent desktop: `effectiveFps` equal to the display refresh rate (115 to 120 on the prototype machine) and `cbMs.p95` under about 2. Record the numbers for Task 11. If your hardware is far slower, see Task 11, Step 4.

- [ ] **Step 7: Commit**

```bash
git add viewer/src/main.ts viewer/scripts/make_city_synth.mjs viewer/package.json .gitignore docs/research/perf-bench.js
git commit -m "feat(viewer): render chunked terrain with habitat colours; synthetic city and perf bench"
```

---

### Task 11: The real city in the viewer, and the go/no-go

**Files:**
- Create: `docs/research/full-city-results.md`

- [ ] **Step 1: View the real city**

With the dev server from Task 10 running, open <http://localhost:5199/?data=real-city&debug>. Expected (the prototype saw exactly this):
- A recognisable San Francisco peninsula with relief. North-west and west: tan dunes, dark-green oak woodland patches, small blue ponds, a teal marsh fringe at the Mission Bay and north shore. South-east: grey unmapped modern terrain. Bay around it, uniform blue, no data edge. Marin hills at the top, Yerba Buena and Treasure Island to the east.
- Whole-city view: about 346 k triangles, 184 draw calls.
- Zoom in on the dune and woodland country: LOD flips to 0 with a few tens of chunks, around 1 to 1.5 M triangles, no visible seams between chunks, no popping holes.

- [ ] **Step 2: Check the data against the picture**

Compare with `docs/research/local/city-classes.png` from Task 5: colours should line up with the classification map (dunes over the Sunset and Richmond, marsh around Mission Bay, grey in the south-east). Look especially for: seams at chunk borders (none expected), the dark-blue SFEI water margin showing as the same colour as the inferred bay (it should: both are group `water`), and any chunk-sized rectangles of wrong height (none expected).

- [ ] **Step 3: Measure**

Run the Task 10 benchmark on the real city at two zooms and write the numbers down. Take two screenshots (whole city; zoomed in) into `docs/research/local/` (gitignored, because they show SFEI-derived data).

- [ ] **Step 4: If performance is not good enough on your target device**

`MAX_COARSE_SPACING_PX` in `viewer/src/main.ts` (default 6) sets how coarse the zoomed-out mesh may look before full resolution takes over. Raising it to 8 moves the switch to a higher zoom (about 3.5 instead of 2.6 on a 1600x900 window), which roughly halves the worst-case chunk count at the cost of a chunkier coarse mesh. Other knobs: `lruCapacity`, `maxBuildsPerUpdate`, and `VERTICAL_EXAGGERATION`.

- [ ] **Step 5: Write `docs/research/full-city-results.md`**

Record, in this order: (1) the reproduce commands (Task 5 Step 2, then the URL above); (2) the numbers from the prototype table in this plan next to what you measured; (3) what looks right and what looks wrong, with the known limits from Addendum B; (4) the **Decision**: *Go to Phase 3* (polish, ponds, hand-drawn south-east, camera, overlay, search), *Go with changes* (say what), or *Stop* (say why). Note that the derived screenshots stay local.

- [ ] **Step 6: Stop the dev server and commit**

```bash
git add docs/research/full-city-results.md
git commit -m "docs: full-city results and decision"
```

---

## Addendum B: Known limits (expected, not bugs) and Phase 3 candidates

**South-east is unmapped.** SFEI's layer maps only the north and west (bounds lon -122.523..-122.380, lat 37.733..37.817). About 31% of the city is grey, with a **modern shoreline** (Hunters Point, Candlestick, the harbour). Real data there comes from hand-drawn polygons (Task 3 created the empty files and the mechanism) or from the Mapping Yelamu's Historical Landscape project when it publishes.

**Anachronisms to hand-draw first.** Treasure Island (1930s fill) shows as land; the modern harbour piers and fill in the south-east likewise. Draw them as `hand_bay` once you have a source you may use.

**Edges of the box.** The Marin Headlands, Yerba Buena Island, Treasure Island and a sliver of the East Bay show as unmapped land because the elevation tile covers them. Harmless, but they are not part of San Francisco.

**Freshwater is colour only.** About 1,900 cells (Lake Merced area, dune-dammed lakes, lagoons) are classed as water in the habitat raster but stay at land height, because the pipeline carves only `bay` and `marsh`. Carving them needs per-lake water levels.

**Legend ids can differ between regions.** SFEI class ids are assigned only for classes present in a region's data, in sorted-name order. The legend travels in `meta.json`, so the viewer is unaffected.

**Unmeasured on phones and low-end GPUs.** See Task 11, Step 4.

**Still on the earlier list:** SFEI license, hand-sculpting lost landforms (Rincon Hill and others) from the 1850s sheets, the 'Tidal coastal lagoon' decision, the constrained camera, animated water, vegetation, the modern overlay, search, hotspots and the provenance panel.

---

## Addendum C: Changes made during execution (supersede the tasks above where they differ)

Phase 2 was executed with one implementer subagent per part (pipeline Tasks 0-5, viewer Tasks 6-10) with a byte-for-byte cross-check against the verified files, then one read-only review on a stronger model. Stage 1 (compliance) was clean: 30 of 33 changed files were byte-identical and the rest differed only in test order or `package.json` script order. Stage 2 found five real issues, fixed in commits `6b1ea4f` and `f6f4199` (pipeline 167 tests, viewer 93 tests):

1. **Region paths from a subdirectory.** `load_region` derived the base directory without resolving the file path, so `--region full-city.json` run from inside `regions/` resolved everything wrongly. It now uses `path.resolve().parent.parent`. Test added.
2. **LOD switch follows resizes.** `switchZoom` was computed once at startup, but `fitViewSize` changes with the window aspect (a half-width window or a rotated phone puts up to about 1.7 to 2.8 times more chunks in view at the switch). `TerrainChunks.setSwitchZoom` was added, and `main.ts` recomputes it in `resize()` with the same formula as at startup. Checked in a browser: the switch moved from 2.62 at 1500x900 to 4.87 at 800x900.
3. **No holes while chunks build.** An in-view chunk keeps its coarse (LOD1) mesh until its full-resolution mesh exists. Previously the coarse meshes were hidden at once and up to 12 frames of holes showed the sea floor.
4. **Memory after zooming out.** The LRU capacity grew to the in-view count and never shrank. `LruCache.trim()` was added and `update()` trims back to the base capacity while at LOD1.
5. **Never guess colours.** When a habitat raster exists, a class id missing from the legend now renders as the neutral "unmapped" grey instead of the old tan fallback.

**Checked and not changed:** overlapping SFEI polygons. On the real data no cell is covered by more than one class (the layer is dissolved), so the "later class wins" rule is only theoretical; it stays documented in `habitat.py`.

**Measured after the fixes (browser, 800x900 window):** whole city 346,430 triangles / 184 draw calls; zoomed in 720,900 triangles, 22 chunks, 120 fps; no console errors.

---

## Self-Review

| Spec requirement | Task |
|---|---|
| 8 step 2: full-city terrain | Tasks 3, 4, 5 (pipeline), 7 to 10 (viewer) |
| 5.3: habitat splat-map | Tasks 2, 4, 5 |
| 5.4: every layer carries source and confidence | Task 4 (`hand_water` layer is `inferred`), unchanged otherwise |
| 6: LOD chunks | Tasks 7, 8, 9 |
| 6: terrain shading by habitat | Tasks 6, 10 |
| 6: water, depth-tinted | Task 10 (translucent plane, sea floor, depth shading of the seabed); animated shader deferred |
| 6: targets (60 fps desktop, 30 fps phone, under 10 MB) | Task 10 Step 6 and Task 11 (desktop measured, phone not); size measured in Task 5 |
| 10: pipeline sanity checks on known points | Task 3 (`checks.json`), Task 5 Step 2 |
| 10: viewer tests | Tasks 6 to 9 (88 tests in total) |

**Placeholder scan:** none in code. Task 11's results note is a document you write from your own measurements. **Type and name consistency:** the habitat meta fields (`habitat_file`, `habitat_classes`, `water_level_m`) are written by `export.py` (Task 2) and read by `heightmap.ts` (Task 6); group names are defined in `habitat.py` (Task 2) and `GROUP_COLORS` (Task 6); `ChunkPlan`, `Lod`, `GridSize` flow from `chunks.ts` and `terrainMesh.ts` into `terrainChunks.ts` and `main.ts` as tested in Tasks 7 to 10.
