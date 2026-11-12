# Yelamu Phase 3 (The Experience) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the working full-city renderer into something a visitor can use and trust: find where they are (modern-street overlay, landmark labels, search), understand what is documented and what is inferred (hotspots with sources, legend, provenance panel, About), explore comfortably (share links, keyboard, rotation, clamped camera, phone layout), and see the place come alive (vegetation, animated water), while an automatic quality controller protects frame rate.

**Architecture:** A new pipeline script converts TIGER roads, landmarks and hotspots into one `overlay.json` in the viewer's world metres, so the viewer needs no projection code. The viewer gains a shared app state encoded in the URL hash, a camera rig (rotation, clamping, fly-to), a plain-DOM UI shell, an overlay module (streets draped on the terrain, HTML labels and hotspot markers), local search, information panels, vegetation instanced per full-resolution chunk, an animated water material, and a quality controller. Everything pure is unit-tested; DOM and WebGL are checked in a browser (Task 12).

**Tech Stack:** Same as Phase 2 plus one Python dependency, `pyshp` (pure Python, reads the TIGER shapefile). **No new npm dependencies, and no third-party network requests from the page.**

**Spec:** [`docs/superpowers/specs/2026-11-11-phase-3-experience-design.md`](../specs/2026-11-11-phase-3-experience-design.md)

**Base commit:** `80d96b2` plus the Phase 3 spec commit `a0dc968` (pipeline 167 tests, viewer 93 tests). Tasks 3 to 11 replace or add whole files that were tested at that base; if `heightmap.ts`, `terrainChunks.ts`, `controls.ts`, `main.ts`, `index.html` or `package.json` changed since, merge by hand instead of replacing.

**Out of scope (separate plans):** the data-authenticity work (hand-drawn south-east, Treasure Island, lost landforms, ponds: "Phase 3b"), the cultural layer, hosting and public launch, geocoding street addresses.

> **Licensing gate (unchanged).** Everything derived from SFEI's habitat layer stays gitignored (`viewer/public/assets/real*/`, `docs/research/local/`, `pipeline/data/raw/`) until SFEI confirms terms in writing. This plan adds files whose content is **not** SFEI-derived and may be committed: the overlay build script, `landmarks.json`, `hotspots.json`. The generated `overlay.json` lives inside the gitignored `real-city` folder anyway.

> **Owner review before any public launch.** Two pieces of text speak for the project and must be read and approved by you (and ideally by the Ramaytush Ohlone community's contacts) before the site is public: the **About dialog wording** (`viewer/src/ui/about.ts`) and every **hotspot description** (`pipeline/data/overlay/hotspots.json`). Task 2 includes a review step for the hotspots.

---

## Design decisions (veto points)

| # | Decision | Why |
|---|---|---|
| 1 | **Overlay data from US Census TIGER/Line roads** (public domain, 594 KB), not OpenStreetMap or DataSF. | Federal public domain, no attribution obligation or share-alike question, and small. DataSF's default is a public-domain license but it is set per dataset and the street centerlines page does not state one. |
| 2 | **Street hierarchy by length, not by hand.** TIGER calls almost every San Francisco arterial "local" (Market, Geary, Mission), so a local street whose total length is at least 6 km is promoted to "secondary". | Measured on the real data: this promotes exactly the long arterials (Geary, Market, Mission, Alemany, Great Highway, Lincoln Way, California...) without a hand-curated list. The threshold is a flag (`--promote-m`). |
| 3 | **Coordinates are converted in the pipeline**, in the viewer's world metres. | No projection library in the browser; one formula, tested against the terrain mesh. |
| 4 | **Search is local only** (hotspots, landmarks, street names). No geocoder, no street addresses. | Nothing leaves the browser; no third-party service or key. |
| 5 | **Hotspot text must cite a source and carry a confidence tag**; both Python and TypeScript validators reject entries without one. Facts are paraphrased, never copied. | Honesty rule. The 11 starter hotspots were researched against their cited pages by the prototype; three were then re-checked by hand against the live pages (Yerba Buena Cove and Mission Bay matched; one clause in Precita Creek was removed because the source attached that figure to a different creek). **The other eight were not re-checked: Task 2 Step 5 is where you check them.** |
| 6 | **One side panel at a time.** | Panels share a spot; a stack hid the newer button's panel behind an older one. |
| 7 | **Streets are dark slate lines** (not cream). | Contrast was computed against all ten ground colours; cream failed on beach and dune (1.3 and 1.6 to 1) and slate passes on all (worst case 1.7 to 2.4 at their opacities). They are a faint orientation aid, not text. |
| 8 | **Vegetation is illustrative and capped** (1500 instances per chunk), built only for full-resolution chunks and tagged in the Legend and Sources. On touch devices it starts off. | Biggest GPU and "invented content" risk, so the easiest to switch off. |
| 9 | **Animated water costs idle renders** (15 fps while enabled), so it is off under reduced motion and turned off by the quality controller. | The viewer otherwise renders only on demand. |
| 10 | **The About dialog opens on a first visit** (flag in `localStorage`, safe when storage is unavailable). | The community statement should not be something a visitor can miss. |
| 11 | **Phone layout collapses the secondary actions into a Menu** below 640 px. | The unfolded bar took 18% of a phone screen. |

## What the prototypes measured

Everything was built and run first in a scratch copy of the repo (pipeline 268 tests, viewer 479 tests), exercised on real data in a real browser, then replayed task by task on a fresh checkout.

| Measurement | Result |
|---|---|
| Overlay build (full city) | 1.1 s; `overlay.json` 328 KB raw, 102 KB gzipped; 2,493 streets (8 primary, 40 secondary, 2,445 local), 3,659 polylines, 13,219 points; 38 landmarks; 11 hotspots |
| Landmark cross-check | all hills at 63 m or more on the 1769 terrain; the Ferry Building, Oracle Park, Chase Center and Pier 39 read as water (about -3 m), correctly, because they stand on later fill |
| Hotspot cross-check | every hotspot lands on the matching habitat group where SFEI maps the area (cove: water, Mission Bay: marsh, Mountain Lake: water, dunes: dune); Lake Merced, Laguna Honda, Islais and Precita creeks fall in the unmapped south |
| Viewer frame time with everything on (real city, zoom 7, panning) | median 8 to 11 ms per frame (90 to 120 fps): all optional layers off 8.9 ms, streets and labels 8.5, plus vegetation 8.2, plus animated water 10.8; vegetation about 28 to 38 k instances in 55 to 74 meshes |
| Browser pane caveat | the Browser pane throttles itself to about 1 frame per second after a fraction of a second of script-driven activity, so measure in short windows right after a user action (Task 12 explains) |
| Phone | **not measured** (Task 12 has the protocol) |

---

## File Structure

```
pipeline/
  yelamu/overlay.py                  Task 1: streets, validation, world coordinates, build_overlay + CLI
  tests/test_overlay.py              Task 1
  data/overlay/landmarks.json        Task 1: 38 well-known places (approximate)
  data/overlay/hotspots.json         Task 1: 11 sourced landscape hotspots
  scripts/build_overlay.py           Task 1: thin wrapper
  scripts/verify_overlay_data.py     Task 1: cross-checks against the real DEM and habitat raster
  scripts/render_overlay_preview.py  Task 1: top-down preview image
viewer/src/
  appState.ts, keys.ts, randomLand.ts, hashSync.ts, layerSelection.ts,
  placeSelection.ts, surprise.ts                     Task 3: state, keyboard, share links
  viewRig.ts                                         Task 4: camera rig
  search.ts, placesList.ts                           Task 5: search ranking, places list
  heightmap.ts (modified), overlay/*                 Task 6: overlay data, draping, streets, labels
  confidence.ts, legendEntries.ts, provenanceData.ts,
  aboutSeen.ts                                       Task 7: information content
  quality.ts, effects.ts, a11y.ts, theme.ts, water/* Task 8: quality controller, water, contrast
  vegetation/*, terrainChunks.ts (modified)          Task 9: vegetation and LOD hooks
  ui/*                                               Task 10: shell, search box, panels, About, CSS
  appContext.ts, modules.ts, infoModule.ts, overlayModule.ts, effectsModule.ts,
  controls.ts (rewritten), main.ts (rewritten), nodeTestShims.d.ts,
  uiColors.test.ts                                   Task 11: wiring
viewer/scripts/make_overlay_synth.mjs                Task 11: synthetic overlay for development
viewer/index.html, viewer/package.json               Task 11
docs/research/phone-measurement.md, phase-3-results.md   Task 12
```

---

### Task 0: Preflight

- [ ] **Step 1: Confirm the base**

Run: `cd "/Users/paras/Documents/Ancient San Francisco" && git status --short && git log --oneline | head -4`
Expected: a clean tree and the Phase 3 spec commit near the top.

- [ ] **Step 2: Confirm the baseline tests**

Run: `cd pipeline && uv run pytest -q -W error` then `cd ../viewer && npm test`
Expected: pipeline **167 passed**; viewer **93 passed** (7 files).

- [ ] **Step 3: Confirm the viewer's local `fsevents`**

Run: `ls viewer/node_modules/fsevents`
Expected: exists. If not: `cd viewer && npm install --no-save --ignore-scripts fsevents`. Never run a plain `npm install` or `npm ci` in `viewer/` without repeating that.

- [ ] **Step 4: Confirm the Phase 2 real-city assets exist locally**

Run: `ls -l viewer/public/assets/real-city`
Expected: `heightmap.u16`, `habitat.u8`, `meta.json` (gitignored). If missing, rebuild them with `cd pipeline && uv run python -m yelamu.cli --region regions/full-city.json`.

---

# Part A: Pipeline

### Task 1: The overlay builder, landmarks and hotspots

Converts TIGER roads, a landmark list and a hotspot list into `overlay.json` in the viewer's world metres. The tests cover the coordinate formula (checked against the terrain mesh's cell-centre formula), TIGER reading and class mapping, simplification, merging, the long-street promotion, every validation rule for landmarks and hotspots, the end-to-end build and the CLI, and a test that the committed data files are valid.

**Files:**
- Modify: `pipeline/pyproject.toml`, `pipeline/uv.lock`
- Create: `pipeline/yelamu/overlay.py`, `pipeline/tests/test_overlay.py`
- Create: `pipeline/data/overlay/landmarks.json`, `pipeline/data/overlay/hotspots.json`
- Create: `pipeline/scripts/build_overlay.py`, `verify_overlay_data.py`, `render_overlay_preview.py`

- [ ] **Step 1: Add the dependency**

In `pipeline/pyproject.toml`, the `dependencies` list becomes (one new line, `pyshp`):

```toml
dependencies = [
  "numpy>=1.26",
  "pyproj>=3.6",
  "pyshp>=3.1.8",
  "rasterio>=1.3",
  "scipy>=1.11",
  "shapely>=2.0",
]
```

Then: `cd pipeline && uv lock && uv sync`
Expected: `pyshp` is added to `uv.lock`; `uv sync` installs it.

- [ ] **Step 2: Write the failing tests `pipeline/tests/test_overlay.py`**

```python
import json
import math
from pathlib import Path

import pytest
import shapefile

from yelamu.geo import Grid, lonlat_to_utm
from yelamu.overlay import (
    HOTSPOT_KINDS,
    LANDMARK_KINDS,
    build_overlay,
    build_streets,
    kind_for_mtfcc,
    lonlat_to_world,
    promote_long_streets,
    read_tiger_roads,
    validate_hotspots,
    validate_landmarks,
    world_xz,
)

BBOX = (-122.45, 37.75, -122.40, 37.80)
CELL = 10.0
LAT = 37.775  # inside BBOX
LON0 = -122.43


@pytest.fixture(scope="module")
def grid() -> Grid:
    return Grid.from_lonlat_bbox(*BBOX, cell=CELL)


# --------------------------------------------------------------------- world coordinates


def test_world_xz_matches_the_viewer_vertex_formula(grid):
    # viewer/src/terrainMesh.ts: x = (sx - (width-1)/2) * cell, z = (sy - (height-1)/2) * cell
    # for the cell-centre indices sx (column) and sy (row, 0 = north).
    for sx, sy in [(0, 0), (grid.width - 1, grid.height - 1), (7, 3), (grid.width // 2, 11)]:
        easting = grid.west + (sx + 0.5) * grid.cell
        northing = grid.north - (sy + 0.5) * grid.cell
        x, z = world_xz(grid, easting, northing)
        assert x == pytest.approx((sx - (grid.width - 1) / 2) * grid.cell, abs=1e-6)
        assert z == pytest.approx((sy - (grid.height - 1) / 2) * grid.cell, abs=1e-6)


def test_centre_of_the_grid_is_the_origin(grid):
    centre_e = (grid.west + grid.east) / 2
    centre_n = (grid.north + grid.south) / 2
    x, z = world_xz(grid, centre_e, centre_n)
    assert (x, z) == (pytest.approx(0.0, abs=1e-9), pytest.approx(0.0, abs=1e-9))


def test_east_is_plus_x_and_south_is_plus_z(grid):
    x0, z0 = world_xz(grid, grid.west + 100, grid.south + 100)
    x1, z1 = world_xz(grid, grid.west + 200, grid.south + 50)
    assert x1 - x0 == pytest.approx(100)  # further east -> larger x
    assert z1 - z0 == pytest.approx(50)  # further south -> larger z


def test_lonlat_to_world_agrees_with_utm_route(grid):
    lon, lat = -122.42, 37.77
    e, n = lonlat_to_utm(lon, lat)
    assert lonlat_to_world(grid, lon, lat) == pytest.approx(world_xz(grid, e, n))
    # The bbox corners land on the grid edges (the grid snaps outwards, so inside it).
    x, z = lonlat_to_world(grid, BBOX[0], BBOX[3])
    half_w, half_h = grid.width * grid.cell / 2, grid.height * grid.cell / 2
    assert -half_w - 1 <= x <= half_w and -half_h <= z <= half_h


# --------------------------------------------------------------------------- MTFCC kinds


@pytest.mark.parametrize(
    "code,kind",
    [("S1100", "primary"), ("S1200", "secondary"), ("S1400", "local"),
     ("S1630", None), ("S1500", None), ("S1710", None), ("S1730", None),
     ("S1740", None), ("S1750", None), ("S1780", None), ("S1820", None),
     ("", None), (None, None), ("junk", None)],
)
def test_kind_for_mtfcc(code, kind):
    assert kind_for_mtfcc(code) == kind


# ----------------------------------------------------------------------- TIGER reading


def write_roads(path: Path, rows: list[tuple[str | None, str, list[list[tuple[float, float]]]]]):
    """rows: (FULLNAME, MTFCC, parts); each part is a list of (lon, lat)."""
    w = shapefile.Writer(str(path), shapeType=shapefile.POLYLINE)
    w.field("LINEARID", "C", 22)
    w.field("FULLNAME", "C", 100)
    w.field("RTTYP", "C", 1)
    w.field("MTFCC", "C", 5)
    for i, (name, mtfcc, parts) in enumerate(rows):
        w.line(parts)
        w.record(str(i), name, "M", mtfcc)
    w.close()


def line(lon_a, lon_b, lat=LAT, n=2):
    """A west-east line of n points at constant latitude."""
    return [(lon_a + (lon_b - lon_a) * i / (n - 1), lat) for i in range(n)]


@pytest.fixture
def tiger(tmp_path) -> Path:
    path = tmp_path / "roads"
    write_roads(path, [
        ("Market St", "S1100", [line(LON0, LON0 + 0.01, n=3)]),          # collinear mid point
        ("Valencia St", "S1200", [line(LON0, LON0 + 0.004, lat=LAT + 0.004)]),
        ("Elm St", "S1400", [line(LON0, LON0 + 0.003, lat=LAT - 0.004)]),
        ("Elm St", "S1400", [line(LON0 + 0.004, LON0 + 0.007, lat=LAT - 0.004)]),  # same name
        ("Alley Way", "S1400", [line(LON0, LON0 + 0.003, lat=LAT - 0.006)]),
        ("", "S1400", [line(LON0, LON0 + 0.003, lat=LAT - 0.007)]),       # no name
        ("Hwy 1 On Rmp", "S1630", [line(LON0, LON0 + 0.003, lat=LAT - 0.009)]),  # ramp
        ("Service Rd", "S1740", [line(LON0, LON0 + 0.003, lat=LAT - 0.010)]),    # dropped kind
        ("Far Away Rd", "S1400", [line(-121.0, -120.99, lat=36.0)]),     # outside the grid
        ("Two Part Ave", "S1200", [line(LON0, LON0 + 0.002, lat=LAT + 0.001),
                                   line(LON0 + 0.003, LON0 + 0.005, lat=LAT + 0.001)]),
        ("Edge Rd", "S1400", [[(BBOX[2] - 0.0005, LAT), (BBOX[2] + 0.02, LAT)]]),  # crosses east edge
    ])
    return path.with_suffix(".shp")


def test_read_tiger_roads_filters_kinds_and_names(tiger):
    roads = read_tiger_roads(tiger)
    names = [r["name"] for r in roads]
    assert "Alley Way" in names  # S1400 local is kept
    assert not any(n in names for n in ("Hwy 1 On Rmp", "Service Rd"))  # dropped MTFCC
    assert all(r["name"] and r["name"].strip() == r["name"] for r in roads)  # no empty names
    by_name = {r["name"]: r for r in roads if r["name"] != "Elm St"}
    assert by_name["Market St"]["kind"] == "primary"
    assert by_name["Valencia St"]["kind"] == "secondary"
    assert by_name["Alley Way"]["kind"] == "local"
    # coords are lon/lat polylines
    market = by_name["Market St"]["coords"]
    assert len(market) == 1 and len(market[0]) == 3
    lon, lat = market[0][0]
    assert (lon, lat) == pytest.approx((LON0, LAT))


def test_read_tiger_roads_keeps_every_part_of_a_multipart_feature(tiger):
    roads = {r["name"]: r for r in read_tiger_roads(tiger)}
    assert len(roads["Two Part Ave"]["coords"]) == 2


def test_read_tiger_roads_missing_file_has_clear_message(tmp_path):
    with pytest.raises(FileNotFoundError, match="roads"):
        read_tiger_roads(tmp_path / "roads.shp")


# ----------------------------------------------------------------------- build_streets


def test_build_streets_kinds_names_and_order(tiger, grid):
    streets = build_streets(read_tiger_roads(tiger), grid)
    assert [(s["kind"], s["name"]) for s in streets] == [
        ("primary", "Market St"),
        ("secondary", "Two Part Ave"),
        ("secondary", "Valencia St"),
        ("local", "Alley Way"),
        ("local", "Edge Rd"),
        ("local", "Elm St"),
    ]
    for s in streets:
        assert set(s) == {"name", "kind", "lines"}
        for ln in s["lines"]:
            assert len(ln) % 2 == 0 and len(ln) >= 4


def test_build_streets_merges_same_name_and_kind(tiger, grid):
    streets = {(s["name"], s["kind"]): s for s in build_streets(read_tiger_roads(tiger), grid)}
    assert len(streets[("Elm St", "local")]["lines"]) == 2  # two features -> one entry
    assert len(streets[("Two Part Ave", "secondary")]["lines"]) == 2  # two parts -> two lines


def test_build_streets_simplifies_collinear_points(tiger, grid):
    streets = {s["name"]: s for s in build_streets(read_tiger_roads(tiger), grid)}
    (market,) = streets["Market St"]["lines"]
    assert len(market) == 4  # the collinear middle vertex was removed: 2 points = 4 numbers
    unsimplified = build_streets(read_tiger_roads(tiger), grid, tolerance_m=0.0)
    (m0,) = [s for s in unsimplified if s["name"] == "Market St"][0]["lines"]
    assert len(m0) == 6


def test_build_streets_clips_lines_wholly_outside_but_keeps_crossing_ones(tiger, grid):
    names = {s["name"] for s in build_streets(read_tiger_roads(tiger), grid)}
    assert "Far Away Rd" not in names
    streets = {s["name"]: s for s in build_streets(read_tiger_roads(tiger), grid)}
    (edge,) = streets["Edge Rd"]["lines"]
    # Geometry is not cut: the far end is still beyond the east edge of the grid.
    assert max(edge[0::2]) > grid.width * grid.cell / 2


def test_build_streets_world_coordinates_and_rounding(tiger, grid):
    streets = {s["name"]: s for s in build_streets(read_tiger_roads(tiger), grid)}
    (ln,) = streets["Valencia St"]["lines"]
    x0, z0 = lonlat_to_world(grid, LON0, LAT + 0.004)
    assert (ln[0], ln[1]) == pytest.approx((x0, z0), abs=0.06)
    for v in ln:
        assert round(v, 1) == v  # rounded to 0.1 m
    assert math.isclose(ln[2] - ln[0], 0.004 * 111320 * math.cos(math.radians(LAT)), rel_tol=0.01)


def test_build_streets_kinds_filter(tiger, grid):
    streets = build_streets(read_tiger_roads(tiger), grid, kinds=("primary",))
    assert {s["kind"] for s in streets} == {"primary"}


def test_build_streets_drops_degenerate_lines(grid):
    roads = [
        {"name": "Dot St", "kind": "local", "coords": [[(LON0, LAT), (LON0, LAT)]]},
        {"name": "Tiny St", "kind": "local", "coords": [[(LON0, LAT), (LON0 + 1e-7, LAT)]]},
        {"name": "Short St", "kind": "local", "coords": [[(LON0, LAT)]]},
        {"name": "Good St", "kind": "local", "coords": [[(LON0, LAT), (LON0 + 0.002, LAT)]]},
    ]
    names = [s["name"] for s in build_streets(roads, grid)]
    assert names == ["Good St"]


def test_build_streets_is_deterministic_and_input_order_independent(tiger, grid):
    roads = read_tiger_roads(tiger)
    a = build_streets(roads, grid)
    b = build_streets(list(reversed(roads)), grid)
    assert a == b
    assert json.dumps(a) == json.dumps(build_streets(roads, grid))


# ------------------------------------------------------------------ promote_long_streets


def st(name, kind, *lines):
    return {"name": name, "kind": kind, "lines": [list(map(float, ln)) for ln in lines]}


def hline(length, z=0.0, x0=0.0):
    """A flat polyline running `length` metres east, with a mid vertex."""
    return [x0, z, x0 + length / 2, z, x0 + length, z]


def kinds_by_name(streets):
    return {s["name"]: s["kind"] for s in streets}


def test_promote_threshold_boundary_is_inclusive():
    streets = [st("Exact", "local", hline(6000)), st("Under", "local", hline(5999.9)),
               st("Over", "local", hline(6000.1))]
    assert kinds_by_name(promote_long_streets(streets)) == {
        "Exact": "secondary", "Under": "local", "Over": "secondary"}


def test_promote_sums_all_lines_of_a_street():
    streets = [st("Split", "local", hline(2000), hline(2000, z=50), hline(2000, z=100)),
               st("Short", "local", hline(2000), hline(2000, z=50))]
    assert kinds_by_name(promote_long_streets(streets)) == {"Split": "secondary", "Short": "local"}


def test_promote_measures_diagonal_polylines_in_metres():
    # 3-4-5 triangles: two segments of 5 km each -> 10 km
    streets = [st("Diag", "local", [0, 0, 3000, 4000, 6000, 8000])]
    assert kinds_by_name(promote_long_streets(streets, min_length_m=9999)) == {"Diag": "secondary"}
    assert kinds_by_name(promote_long_streets(streets, min_length_m=10001)) == {"Diag": "local"}


def test_promote_leaves_primary_and_secondary_alone():
    streets = [st("Huge Primary", "primary", hline(50000)), st("Tiny Primary", "primary", hline(10)),
               st("Sec", "secondary", hline(10)), st("Long Sec", "secondary", hline(50000))]
    out = promote_long_streets(streets)
    assert kinds_by_name(out) == {"Huge Primary": "primary", "Tiny Primary": "primary",
                                  "Sec": "secondary", "Long Sec": "secondary"}


def test_promote_returns_new_list_without_mutating_input():
    streets = [st("Long", "local", hline(7000))]
    before = json.dumps(streets)
    out = promote_long_streets(streets)
    assert json.dumps(streets) == before and streets[0]["kind"] == "local"
    assert out is not streets and out[0] is not streets[0]
    assert out[0]["lines"] == streets[0]["lines"] and set(out[0]) == {"name", "kind", "lines"}
    out[0]["lines"][0][0] = 99.0  # the copy does not alias the input's lines
    assert streets[0]["lines"][0][0] == 0.0


def test_promote_ordering_after_promotion():
    streets = [
        st("Zed Local", "local", hline(10)), st("Alpha Local", "local", hline(7000)),
        st("Mid Sec", "secondary", hline(10)), st("Aaa Sec", "secondary", hline(10)),
        st("Beta Local", "local", hline(6500)), st("Prime", "primary", hline(10)),
    ]
    out = promote_long_streets(streets)
    assert [(s["kind"], s["name"]) for s in out] == [
        ("primary", "Prime"),
        ("secondary", "Aaa Sec"), ("secondary", "Alpha Local"), ("secondary", "Beta Local"),
        ("secondary", "Mid Sec"),
        ("local", "Zed Local"),
    ]


def test_promote_sums_duplicate_local_entries_and_merges_into_existing_secondary():
    streets = [st("Same", "local", hline(3000)), st("Same", "local", hline(3000, z=9)),
               st("Mixed", "secondary", hline(10, z=5)), st("Mixed", "local", hline(7000))]
    out = promote_long_streets(streets)
    assert [(s["kind"], s["name"], len(s["lines"])) for s in out] == [
        ("secondary", "Mixed", 2), ("secondary", "Same", 2)]
    assert out[0]["lines"] == sorted(out[0]["lines"])


@pytest.mark.parametrize("disabled", [0, 0.0, -1.0])
def test_promote_disabled_returns_an_equal_copy(disabled):
    streets = [st("Long", "local", hline(90000)), st("P", "primary", hline(1))]
    out = promote_long_streets(streets, min_length_m=disabled)
    assert out == streets and out is not streets and out[0] is not streets[0]


def test_promote_empty_and_is_deterministic():
    assert promote_long_streets([]) == []
    streets = [st("B", "local", hline(7000)), st("A", "local", hline(8000)), st("C", "local", hline(1))]
    a = promote_long_streets(streets)
    b = promote_long_streets(list(reversed(streets)))
    assert a == b
    assert json.dumps(a) == json.dumps(promote_long_streets(streets))


# ------------------------------------------------------------------------- validation


def lm(**over):
    item = {"id": "ferry-building", "name": "Ferry Building", "kind": "building",
            "lon": -122.42, "lat": 37.77}
    item.update(over)
    return item


def hs(**over):
    item = {
        "id": "yerba-buena-cove", "name": "Yerba Buena Cove", "kind": "bay",
        "lon": -122.42, "lat": 37.77,
        "description": "A sheltered tidal cove on the northeast shore of the peninsula.",
        "sources": [{"title": "Hidden Nature SF", "url": "https://hidden-nature.org/x"}],
        "confidence": "documented",
    }
    item.update(over)
    return item


def test_valid_items_pass():
    validate_landmarks([lm(), lm(id="coit-tower", name="Coit Tower")], BBOX)
    validate_hotspots([hs(), hs(id="other")], BBOX)


def test_kind_vocabularies():
    assert set(LANDMARK_KINDS) == {"park", "bridge", "hill", "building", "neighborhood",
                                   "beach", "water", "fort", "other"}
    assert set(HOTSPOT_KINDS) == {"creek", "lagoon", "marsh", "dune", "hill", "shoreline",
                                  "bay", "lake", "valley", "other"}


@pytest.mark.parametrize("validate,make", [(validate_landmarks, lm), (validate_hotspots, hs)])
class TestCommonRules:
    def test_missing_field(self, validate, make):
        for key in ("id", "name", "kind", "lon", "lat"):
            item = make(id="the-id")
            del item[key]
            with pytest.raises(ValueError, match=key):
                validate([item], BBOX)

    def test_blank_fields(self, validate, make):
        with pytest.raises(ValueError, match="the-id"):
            validate([make(id="the-id", name="   ")], BBOX)
        with pytest.raises(ValueError, match="id"):
            validate([make(id="")], BBOX)

    def test_bad_kind_names_item(self, validate, make):
        with pytest.raises(ValueError, match="the-id.*kind"):
            validate([make(id="the-id", kind="spaceport")], BBOX)

    def test_duplicate_id(self, validate, make):
        with pytest.raises(ValueError, match="dup-id.*duplicate|duplicate.*dup-id"):
            validate([make(id="dup-id"), make(id="dup-id")], BBOX)

    @pytest.mark.parametrize("lon,lat", [(-122.5, 37.77), (-122.35, 37.77),
                                         (-122.42, 37.7), (-122.42, 37.9)])
    def test_outside_bbox(self, validate, make, lon, lat):
        with pytest.raises(ValueError, match="the-id.*(bbox|outside)"):
            validate([make(id="the-id", lon=lon, lat=lat)], BBOX)

    @pytest.mark.parametrize("bad_id", ["Upper", "has space", "-leading", "under_score", "é"])
    def test_id_pattern(self, validate, make, bad_id):
        with pytest.raises(ValueError, match="id"):
            validate([make(id=bad_id)], BBOX)

    @pytest.mark.parametrize("bad", ["-122.4", None, True, float("nan")])
    def test_non_numeric_coordinates(self, validate, make, bad):
        with pytest.raises(ValueError, match="the-id"):
            validate([make(id="the-id", lon=bad)], BBOX)

    def test_not_an_object_or_list(self, validate, make):
        with pytest.raises(ValueError):
            validate(["nope"], BBOX)
        with pytest.raises(ValueError):
            validate({"id": "x"}, BBOX)


def test_hotspot_description_length():
    with pytest.raises(ValueError, match="the-id.*description"):
        validate_hotspots([hs(id="the-id", description="too short")], BBOX)
    with pytest.raises(ValueError, match="the-id.*description"):
        validate_hotspots([hs(id="the-id", description="x" * 401)], BBOX)
    validate_hotspots([hs(description="x" * 20)], BBOX)
    validate_hotspots([hs(description="x" * 400)], BBOX)
    with pytest.raises(ValueError, match="the-id.*description"):
        validate_hotspots([hs(id="the-id", description=None)], BBOX)


@pytest.mark.parametrize("sources", [
    [], None, "https://x.org", [{"title": "T"}], [{"url": "https://x.org"}],
    [{"title": " ", "url": "https://x.org"}], [{"title": "T", "url": "ftp://x.org"}],
    [{"title": "T", "url": "x.org/page"}], [{"title": "T", "url": "https://"}],
    ["https://x.org"],
])
def test_hotspot_bad_sources(sources):
    with pytest.raises(ValueError, match="the-id.*sources"):
        validate_hotspots([hs(id="the-id", sources=sources)], BBOX)


def test_hotspot_accepts_http_and_multiple_sources():
    validate_hotspots([hs(sources=[{"title": "A", "url": "http://a.org"},
                                   {"title": "B", "url": "https://b.org/c?d=1"}])], BBOX)


def test_hotspot_confidence():
    with pytest.raises(ValueError, match="the-id.*confidence"):
        validate_hotspots([hs(id="the-id", confidence="certain")], BBOX)
    for c in ("documented", "inferred", "illustrative"):
        validate_hotspots([hs(confidence=c)], BBOX)


def test_hotspot_kind_vocabulary_is_hotspot_specific():
    with pytest.raises(ValueError, match="kind"):
        validate_hotspots([hs(kind="building")], BBOX)  # a landmark kind
    with pytest.raises(ValueError, match="kind"):
        validate_landmarks([lm(kind="creek")], BBOX)


# --------------------------------------------------------------------- build_overlay e2e


def write_inputs(tmp_path: Path, grid: Grid, with_meta: bool = True):
    tiger = tmp_path / "tiger" / "roads"
    tiger.parent.mkdir()
    write_roads(tiger, [
        ("B St", "S1200", [line(LON0, LON0 + 0.004)]),
        ("A St", "S1100", [line(LON0, LON0 + 0.004, lat=LAT + 0.002)]),
    ])
    landmarks = tmp_path / "landmarks.json"
    landmarks.write_text(json.dumps([lm(id="z-place", name="Z"), lm(id="a-place", name="A")]))
    hotspots = tmp_path / "hotspots.json"
    hotspots.write_text(json.dumps([hs()]))
    out = tmp_path / "out"
    out.mkdir()
    meta = {"width": grid.width, "height": grid.height, "cell_m": grid.cell,
            "west": grid.west, "south": grid.south, "east": grid.east, "north": grid.north,
            "heights_file": "heightmap.u16", "layers": [{"id": "terrain"}]}
    if with_meta:
        (out / "meta.json").write_text(json.dumps(meta, indent=2))
    return dict(bbox=BBOX, cell=CELL, out_dir=out, tiger_path=tiger.with_suffix(".shp"),
                landmarks_path=landmarks, hotspots_path=hotspots), meta


def test_build_overlay_writes_file_and_updates_meta(tmp_path, grid):
    kwargs, meta = write_inputs(tmp_path, grid)
    overlay = build_overlay(**kwargs)

    out = kwargs["out_dir"]
    text = (out / "overlay.json").read_text()
    assert ": " not in text and ", " not in text  # compact separators
    assert json.loads(text) == overlay
    assert list(overlay) == ["version", "streets", "landmarks", "hotspots", "processing"]
    assert overlay["processing"] == {"tolerance_m": 6.0, "promote_m": 6000.0}
    assert overlay["version"] == 1
    assert [(s["kind"], s["name"]) for s in overlay["streets"]] == [
        ("primary", "A St"), ("secondary", "B St")]
    assert [m["id"] for m in overlay["landmarks"]] == ["a-place", "z-place"]  # sorted by id
    m = overlay["landmarks"][0]
    assert set(m) == {"id", "name", "kind", "x", "z", "lon", "lat"}
    x, z = lonlat_to_world(grid, m["lon"], m["lat"])
    assert (m["x"], m["z"]) == (round(x, 1), round(z, 1))
    h = overlay["hotspots"][0]
    assert set(h) == {"id", "name", "kind", "x", "z", "lon", "lat", "description",
                      "sources", "confidence"}
    assert h["sources"] == [{"title": "Hidden Nature SF", "url": "https://hidden-nature.org/x"}]

    new_meta = json.loads((out / "meta.json").read_text())
    assert new_meta.pop("overlay_file") == "overlay.json"
    assert new_meta == meta  # every other key untouched


def write_long_road_inputs(tmp_path, grid):
    kwargs, meta = write_inputs(tmp_path, grid)
    tiger = tmp_path / "tiger2" / "roads"
    tiger.parent.mkdir()
    # 0.04 deg of longitude at lat 37.775 is about 3.5 km; two such features share a name.
    write_roads(tiger, [
        ("Long Blvd", "S1400", [line(LON0 - 0.02, LON0 + 0.02, lat=LAT - 0.001)]),
        ("Long Blvd", "S1400", [line(LON0 - 0.02, LON0 + 0.02, lat=LAT - 0.002)]),
        ("Short St", "S1400", [line(LON0, LON0 + 0.004, lat=LAT + 0.001)]),
        ("A St", "S1100", [line(LON0, LON0 + 0.004, lat=LAT + 0.002)]),
    ])
    kwargs["tiger_path"] = tiger.with_suffix(".shp")
    return kwargs


def test_build_overlay_promotes_long_local_roads_and_records_processing(tmp_path, grid):
    kwargs = write_long_road_inputs(tmp_path, grid)
    overlay = build_overlay(**kwargs, promote_m=5000.0)
    assert [(s["kind"], s["name"]) for s in overlay["streets"]] == [
        ("primary", "A St"), ("secondary", "Long Blvd"), ("local", "Short St")]
    assert len(overlay["streets"][1]["lines"]) == 2
    assert overlay["processing"] == {"tolerance_m": 6.0, "promote_m": 5000.0}
    assert list(overlay)[-1] == "processing"
    assert json.loads((kwargs["out_dir"] / "overlay.json").read_text()) == overlay


def test_build_overlay_promote_default_and_disabled(tmp_path, grid):
    kwargs = write_long_road_inputs(tmp_path, grid)
    default = build_overlay(**kwargs)  # 6000 m: ~7 km of Long Blvd is promoted
    assert {s["name"]: s["kind"] for s in default["streets"]}["Long Blvd"] == "secondary"
    assert default["processing"]["promote_m"] == 6000.0
    off = build_overlay(**kwargs, promote_m=0)
    assert {s["name"]: s["kind"] for s in off["streets"]}["Long Blvd"] == "local"
    assert off["processing"] == {"tolerance_m": 6.0, "promote_m": 0.0}
    tol = build_overlay(**kwargs, tolerance_m=2.5, promote_m=0)
    assert tol["processing"] == {"tolerance_m": 2.5, "promote_m": 0.0}


def test_build_overlay_is_idempotent(tmp_path, grid):
    kwargs, _ = write_inputs(tmp_path, grid)
    build_overlay(**kwargs)
    first = ((kwargs["out_dir"] / "overlay.json").read_bytes(),
             (kwargs["out_dir"] / "meta.json").read_bytes())
    build_overlay(**kwargs)
    second = ((kwargs["out_dir"] / "overlay.json").read_bytes(),
              (kwargs["out_dir"] / "meta.json").read_bytes())
    assert first == second


def test_build_overlay_missing_meta_is_a_clear_error(tmp_path, grid):
    kwargs, _ = write_inputs(tmp_path, grid, with_meta=False)
    with pytest.raises(FileNotFoundError, match="meta.json"):
        build_overlay(**kwargs)
    assert not (kwargs["out_dir"] / "overlay.json").exists()  # nothing half-written


def test_build_overlay_rejects_meta_from_a_different_grid(tmp_path, grid):
    kwargs, meta = write_inputs(tmp_path, grid)
    meta["west"] += 500.0
    (kwargs["out_dir"] / "meta.json").write_text(json.dumps(meta))
    with pytest.raises(ValueError, match="west"):
        build_overlay(**kwargs)
    assert not (kwargs["out_dir"] / "overlay.json").exists()


def test_build_overlay_propagates_validation_errors(tmp_path, grid):
    kwargs, _ = write_inputs(tmp_path, grid)
    kwargs["landmarks_path"].write_text(json.dumps([lm(id="bad-one", kind="nope")]))
    with pytest.raises(ValueError, match="bad-one"):
        build_overlay(**kwargs)


def test_data_files_in_the_repo_are_valid():
    """The curated landmark/hotspot files must pass validation against the real region."""
    from yelamu.region import load_region

    root = Path(__file__).resolve().parent.parent
    region = load_region(root / "regions" / "full-city.json")
    landmarks = json.loads((root / "data/overlay/landmarks.json").read_text())
    hotspots = json.loads((root / "data/overlay/hotspots.json").read_text())
    validate_landmarks(landmarks, region.bbox)
    validate_hotspots(hotspots, region.bbox)
    assert 20 <= len(landmarks) <= 40
    assert 8 <= len(hotspots) <= 12


# ------------------------------------------------------------------------------- CLI


def test_cli_main_builds_and_reports_errors(tmp_path, grid, capsys):
    from yelamu.overlay import main

    kwargs, _ = write_inputs(tmp_path, grid)
    (tmp_path / "regions").mkdir()
    region = tmp_path / "regions" / "r.json"
    region.write_text(json.dumps({"name": "t", "bbox": list(BBOX), "cell_m": CELL,
                                  "dem": "data/raw/dem.tif", "out": "elsewhere"}))
    argv = ["--region", str(region), "--tiger", str(kwargs["tiger_path"]),
            "--landmarks", str(kwargs["landmarks_path"]),
            "--hotspots", str(kwargs["hotspots_path"]), "--out", str(kwargs["out_dir"])]
    assert main(argv) == 0
    assert "2 streets" in capsys.readouterr().out
    assert json.loads((kwargs["out_dir"] / "overlay.json").read_text())["processing"]["promote_m"] == 6000.0
    assert main(argv + ["--promote-m", "0"]) == 0
    capsys.readouterr()
    assert json.loads((kwargs["out_dir"] / "overlay.json").read_text())["processing"]["promote_m"] == 0.0
    assert main(argv + ["--promote-m", "1500.5"]) == 0
    capsys.readouterr()
    assert json.loads((kwargs["out_dir"] / "overlay.json").read_text())["processing"]["promote_m"] == 1500.5
    assert json.loads((kwargs["out_dir"] / "meta.json").read_text())["overlay_file"] == "overlay.json"

    # Without --out the region's own `out` ("elsewhere", no meta.json) is used -> clear error.
    assert main(argv[:-2]) == 1
    assert "meta.json" in capsys.readouterr().err
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_overlay.py -q`
Expected: collection error `ModuleNotFoundError: No module named 'yelamu.overlay'`

- [ ] **Step 4: Create `pipeline/yelamu/overlay.py`**

```python
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
```

- [ ] **Step 5: Create the two data files**

`pipeline/data/overlay/landmarks.json`: 38 places you would find on any visitor map. Positions are approximate (within about 100 m); the kinds drive label priority in the viewer.

```json
[
 {
  "id": "ferry-building",
  "name": "Ferry Building",
  "kind": "building",
  "lon": -122.3937,
  "lat": 37.7955
 },
 {
  "id": "coit-tower",
  "name": "Coit Tower",
  "kind": "building",
  "lon": -122.4058,
  "lat": 37.8024
 },
 {
  "id": "golden-gate-bridge",
  "name": "Golden Gate Bridge (south end)",
  "kind": "bridge",
  "lon": -122.4757,
  "lat": 37.8087
 },
 {
  "id": "fort-point",
  "name": "Fort Point",
  "kind": "fort",
  "lon": -122.477,
  "lat": 37.8106
 },
 {
  "id": "alcatraz",
  "name": "Alcatraz Island",
  "kind": "other",
  "lon": -122.423,
  "lat": 37.8267
 },
 {
  "id": "twin-peaks",
  "name": "Twin Peaks",
  "kind": "hill",
  "lon": -122.4477,
  "lat": 37.7544
 },
 {
  "id": "mount-davidson",
  "name": "Mount Davidson",
  "kind": "hill",
  "lon": -122.4547,
  "lat": 37.7383
 },
 {
  "id": "sutro-tower",
  "name": "Sutro Tower",
  "kind": "building",
  "lon": -122.4528,
  "lat": 37.7552
 },
 {
  "id": "mission-dolores",
  "name": "Mission Dolores",
  "kind": "building",
  "lon": -122.4268,
  "lat": 37.7644
 },
 {
  "id": "presidio-main-post",
  "name": "Presidio Main Post",
  "kind": "fort",
  "lon": -122.4608,
  "lat": 37.7983
 },
 {
  "id": "conservatory-of-flowers",
  "name": "Conservatory of Flowers",
  "kind": "building",
  "lon": -122.4601,
  "lat": 37.7724
 },
 {
  "id": "ocean-beach",
  "name": "Ocean Beach (Judah St)",
  "kind": "beach",
  "lon": -122.5098,
  "lat": 37.7601
 },
 {
  "id": "lands-end",
  "name": "Lands End",
  "kind": "park",
  "lon": -122.5108,
  "lat": 37.7853
 },
 {
  "id": "lake-merced",
  "name": "Lake Merced",
  "kind": "water",
  "lon": -122.493,
  "lat": 37.7268
 },
 {
  "id": "bernal-heights",
  "name": "Bernal Heights summit",
  "kind": "hill",
  "lon": -122.4151,
  "lat": 37.7438
 },
 {
  "id": "nob-hill",
  "name": "Nob Hill",
  "kind": "hill",
  "lon": -122.413,
  "lat": 37.792
 },
 {
  "id": "russian-hill",
  "name": "Russian Hill",
  "kind": "hill",
  "lon": -122.419,
  "lat": 37.801
 },
 {
  "id": "telegraph-hill",
  "name": "Telegraph Hill",
  "kind": "hill",
  "lon": -122.4045,
  "lat": 37.8015
 },
 {
  "id": "oracle-park",
  "name": "Oracle Park",
  "kind": "building",
  "lon": -122.3893,
  "lat": 37.7786
 },
 {
  "id": "chase-center",
  "name": "Chase Center",
  "kind": "building",
  "lon": -122.3877,
  "lat": 37.768
 },
 {
  "id": "candlestick-point",
  "name": "Candlestick Point",
  "kind": "park",
  "lon": -122.3863,
  "lat": 37.7137
 },
 {
  "id": "pier-39",
  "name": "Pier 39",
  "kind": "other",
  "lon": -122.4098,
  "lat": 37.8087
 },
 {
  "id": "palace-of-fine-arts",
  "name": "Palace of Fine Arts",
  "kind": "building",
  "lon": -122.4484,
  "lat": 37.8029
 },
 {
  "id": "city-hall",
  "name": "City Hall",
  "kind": "building",
  "lon": -122.4193,
  "lat": 37.7793
 },
 {
  "id": "crissy-field",
  "name": "Crissy Field",
  "kind": "park",
  "lon": -122.465,
  "lat": 37.8037
 },
 {
  "id": "baker-beach",
  "name": "Baker Beach",
  "kind": "beach",
  "lon": -122.484,
  "lat": 37.7933
 },
 {
  "id": "stern-grove",
  "name": "Stern Grove",
  "kind": "park",
  "lon": -122.4758,
  "lat": 37.7366
 },
 {
  "id": "mountain-lake",
  "name": "Mountain Lake Park",
  "kind": "park",
  "lon": -122.4716,
  "lat": 37.7871
 },
 {
  "id": "glen-canyon-park",
  "name": "Glen Canyon Park",
  "kind": "park",
  "lon": -122.4421,
  "lat": 37.7389
 },
 {
  "id": "dolores-park",
  "name": "Dolores Park",
  "kind": "park",
  "lon": -122.4269,
  "lat": 37.7596
 },
 {
  "id": "fort-mason",
  "name": "Fort Mason",
  "kind": "fort",
  "lon": -122.4305,
  "lat": 37.8063
 },
 {
  "id": "buena-vista-park",
  "name": "Buena Vista Park",
  "kind": "hill",
  "lon": -122.4403,
  "lat": 37.7686
 },
 {
  "id": "corona-heights",
  "name": "Corona Heights",
  "kind": "hill",
  "lon": -122.4386,
  "lat": 37.765
 },
 {
  "id": "potrero-hill",
  "name": "Potrero Hill",
  "kind": "hill",
  "lon": -122.3995,
  "lat": 37.7572
 },
 {
  "id": "cliff-house",
  "name": "Cliff House",
  "kind": "building",
  "lon": -122.5139,
  "lat": 37.7785
 },
 {
  "id": "alamo-square",
  "name": "Alamo Square",
  "kind": "park",
  "lon": -122.4347,
  "lat": 37.7764
 },
 {
  "id": "fort-funston",
  "name": "Fort Funston",
  "kind": "park",
  "lon": -122.5033,
  "lat": 37.7156
 },
 {
  "id": "yerba-buena-island",
  "name": "Yerba Buena Island",
  "kind": "other",
  "lon": -122.363,
  "lat": 37.8095
 }
]
```

`pipeline/data/overlay/hotspots.json`: 11 landscape features of the pre-contact peninsula. Each description paraphrases a cited page; each entry names its sources and a confidence. **No cultural, village or people content.**

```json
[
  {
    "id": "yerba-buena-cove",
    "name": "Yerba Buena Cove",
    "kind": "bay",
    "lon": -122.3975,
    "lat": 37.7955,
    "description": "A tidal cove on the bay shore between Clarks Point and Rincon Point; its beach lay back near today's Montgomery Street until Gold Rush filling put downtown over it.",
    "sources": [
      {
        "title": "Yerba Buena Cove (Wikipedia)",
        "url": "https://en.wikipedia.org/wiki/Yerba_Buena_Cove"
      }
    ],
    "confidence": "documented"
  },
  {
    "id": "mission-bay",
    "name": "Mission Bay and Mission Creek marsh",
    "kind": "marsh",
    "lon": -122.3985,
    "lat": 37.7705,
    "description": "An estuary of freshwater marsh, saltwater marsh, tidal mudflats and shallow bay, fed by Mission Creek, whose mouth lay near today's Berry Street between 7th and 8th.",
    "sources": [
      {
        "title": "Natural History of Mission Bay, Chris Carlsson (FoundSF)",
        "url": "https://www.foundsf.org/Natural_History_of_Mission_Bay"
      }
    ],
    "confidence": "documented"
  },
  {
    "id": "soma-fens",
    "name": "South of Market fens",
    "kind": "marsh",
    "lon": -122.404,
    "lat": 37.7835,
    "description": "Rare peat-soil fens lay in low ground between dune ridges and along tidal marsh edges in today's SoMa; an 1896 botanist called one an Arctic oasis in California.",
    "sources": [
      {
        "title": "Hidden in Plain Sight: the unique natural landscape of San Francisco (SFEI Hidden Nature SF story map)",
        "url": "https://storymaps.arcgis.com/stories/e42ea1a97f4f480b85ffc056734ba14f"
      }
    ],
    "confidence": "documented"
  },
  {
    "id": "mountain-lake",
    "name": "Mountain Lake",
    "kind": "lake",
    "lon": -122.4711,
    "lat": 37.7887,
    "description": "A dune-dammed headwater lake: drainage pooled behind sand mounds, making habitat for California red-legged frogs and San Francisco garter snakes.",
    "sources": [
      {
        "title": "Hidden in Plain Sight: the unique natural landscape of San Francisco (SFEI Hidden Nature SF story map)",
        "url": "https://storymaps.arcgis.com/stories/e42ea1a97f4f480b85ffc056734ba14f"
      }
    ],
    "confidence": "documented"
  },
  {
    "id": "washerwomans-lagoon",
    "name": "Washerwoman's Lagoon",
    "kind": "lagoon",
    "lon": -122.4283,
    "lat": 37.8004,
    "description": "A freshwater lagoon held back by dunes and beaches, in what is now the Marina District, below Russian Hill and toward the Presidio.",
    "sources": [
      {
        "title": "Hidden in Plain Sight: the unique natural landscape of San Francisco (SFEI Hidden Nature SF story map)",
        "url": "https://storymaps.arcgis.com/stories/e42ea1a97f4f480b85ffc056734ba14f"
      },
      {
        "title": "Washerwoman's Lagoon (FoundSF)",
        "url": "https://www.foundsf.org/WASHERWOMAN%27S_LAGOON"
      }
    ],
    "confidence": "documented"
  },
  {
    "id": "laguna-honda",
    "name": "Laguna Honda",
    "kind": "lake",
    "lon": -122.461,
    "lat": 37.7505,
    "description": "A natural lake before it was dammed and enlarged for the city's water supply; a second natural lake, near Seventh Avenue and Lawton, was filled in early last century.",
    "sources": [
      {
        "title": "Laguna Honda (FoundSF, quoting Gilliam, The Natural World of San Francisco)",
        "url": "https://www.foundsf.org/Laguna_Honda"
      }
    ],
    "confidence": "documented"
  },
  {
    "id": "lake-merced",
    "name": "Lake Merced",
    "kind": "lake",
    "lon": -122.4945,
    "lat": 37.7268,
    "description": "Once a lagoon fed by streams, groundwater and an ocean channel; drifting dunes cut that link, though storms and quakes reopened it, and a tail ran to Ocean Beach as late as the 1800s.",
    "sources": [
      {
        "title": "San Francisco's Lake Merced: Native Wetland (Western Neighborhoods Project)",
        "url": "https://www.outsidelands.org/lakemerced1.php"
      },
      {
        "title": "Lake Merced (Wikipedia)",
        "url": "https://en.wikipedia.org/wiki/Lake_Merced"
      }
    ],
    "confidence": "documented"
  },
  {
    "id": "lobos-creek",
    "name": "Lobos Creek",
    "kind": "creek",
    "lon": -122.4838,
    "lat": 37.7892,
    "description": "One of the few small flowing creeks of the old peninsula, its banks lined with riparian woodland and scrub of coast live oak, willow and Pacific wax myrtle.",
    "sources": [
      {
        "title": "Hidden in Plain Sight: the unique natural landscape of San Francisco (SFEI Hidden Nature SF story map)",
        "url": "https://storymaps.arcgis.com/stories/e42ea1a97f4f480b85ffc056734ba14f"
      }
    ],
    "confidence": "documented"
  },
  {
    "id": "western-dune-sheet",
    "name": "Western mobile dune sheet",
    "kind": "dune",
    "lon": -122.493,
    "lat": 37.7594,
    "description": "A vast sheet of loose, shifting sand on the peninsula's west side, sparsely vegetated; Coast Survey maps show its edge moved up to a quarter mile in about twenty years.",
    "sources": [
      {
        "title": "Hidden in Plain Sight: the unique natural landscape of San Francisco (SFEI Hidden Nature SF story map)",
        "url": "https://storymaps.arcgis.com/stories/e42ea1a97f4f480b85ffc056734ba14f"
      }
    ],
    "confidence": "documented"
  },
  {
    "id": "islais-creek",
    "name": "Islais Creek estuary",
    "kind": "creek",
    "lon": -122.3925,
    "lat": 37.7485,
    "description": "Fresh water from uphill springs ran down the Islais Creek watershed into saltwater marshlands on the bay's east shore, before the lower creek was filled and channelized.",
    "sources": [
      {
        "title": "Islais Creek (Port of San Francisco)",
        "url": "https://www.sfport.com/islaiscreek"
      }
    ],
    "confidence": "documented"
  },
  {
    "id": "precita-creek",
    "name": "Precita Creek",
    "kind": "creek",
    "lon": -122.4103,
    "lat": 37.7473,
    "description": "A small stream running from near Market and 24th Streets along today's Precita Avenue and Cesar Chavez Street into Islais Creek's estuarine bog.",
    "sources": [
      {
        "title": "Precita Creek (Wikipedia)",
        "url": "https://en.wikipedia.org/wiki/Precita_Creek"
      }
    ],
    "confidence": "documented"
  }
]
```

- [ ] **Step 6: Create the three scripts**

`pipeline/scripts/build_overlay.py`:

```python
"""Build overlay.json (modern streets, landmarks, hotspots) for a built region.

    uv run python scripts/build_overlay.py --region regions/full-city.json [--tiger PATH]
        [--landmarks PATH] [--hotspots PATH] [--out DIR]

A thin wrapper: the logic lives in yelamu.overlay (`python -m yelamu.overlay` works too).
"""

from yelamu.overlay import main

if __name__ == "__main__":
    raise SystemExit(main())
```

`pipeline/scripts/verify_overlay_data.py` (cross-checks landmarks and hotspots against the real terrain and habitat; read-only):

```python
"""Cross-check landmarks and hotspots against the built terrain and habitat rasters.

    uv run python scripts/verify_overlay_data.py ASSET_DIR [--landmarks P] [--hotspots P]

Reads heightmap.u16, habitat.u8 and meta.json from ASSET_DIR (no writes). Rules:
  * landmark kind "hill": DEM height at the point must be >= 60 m
  * landmark kind "water" / "beach": DEM height must be <= 30 m
  * hotspot kinds marsh/lagoon/lake/bay/creek: the habitat group at the point (and the
    groups within 100 m) are reported; water/marsh/wetland (or unmapped) is expected.
Exit code 1 if a landmark rule fails. Hotspot results are informational (printed).
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
WET_GROUPS = {"water", "marsh", "wetland", "unmapped"}


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

    print("== landmarks (DEM height) ==")
    for item in json.loads(args.landmarks.read_text()):
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
    if args.hotspots.exists():
        for item in json.loads(args.hotspots.read_text()):
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
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
```

`pipeline/scripts/render_overlay_preview.py` (a top-down picture for judging the result; run it with `uv run --with pillow`, because Pillow is not a project dependency):

```python
"""Plot overlay.json over the land/water habitat raster (PNG) to eyeball the overlay.

Pillow is not a project dependency, so run it through uv:

    uv run --with pillow python scripts/render_overlay_preview.py ASSET_DIR out.png

Streets: primary dark, secondary medium, local light. Landmarks: blue dots. Hotspots: red dots.
Uses only the viewer's world coordinates (no projection code), exactly as the viewer will.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

WATER_GROUPS = {"water", "marsh"}
STREET_STYLE = {"primary": ((20, 20, 20), 3), "secondary": ((70, 70, 70), 2), "local": ((150, 150, 150), 1)}


def render(asset_dir: Path, scale: int = 1) -> Image.Image:
    meta = json.loads((asset_dir / "meta.json").read_text())
    overlay = json.loads((asset_dir / meta["overlay_file"]).read_text())
    w, h, cell = meta["width"], meta["height"], meta["cell_m"]
    habitat = np.fromfile(asset_dir / meta["habitat_file"], dtype=np.uint8).reshape(h, w)
    q = np.fromfile(asset_dir / meta["heights_file"], dtype="<u2").reshape(h, w)
    dem = meta["min_m"] + q / 65535.0 * (meta["max_m"] - meta["min_m"])
    group = {c["id"]: c["group"] for c in meta["habitat_classes"]}
    palette = np.zeros((256, 3), dtype=np.uint8)
    for cid, g in group.items():
        palette[cid] = (170, 205, 235) if g in WATER_GROUPS else (238, 236, 226)
    img = palette[habitat].astype(float)
    # Light hillshade-free relief: darken higher ground a little so hills read.
    shade = np.clip(dem / meta["max_m"], 0, 1)[..., None] * 35
    land = ~np.isin(habitat, [i for i, g in group.items() if g in WATER_GROUPS])
    img[land] -= shade[land]
    base = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    base = base.resize((w * scale, h * scale), Image.NEAREST)
    draw = ImageDraw.Draw(base)

    def px(x: float, z: float) -> tuple[float, float]:
        # same as the viewer mesh: cell-centre index = x / cell + (w - 1) / 2
        return ((x / cell + (w - 1) / 2 + 0.5) * scale, (z / cell + (h - 1) / 2 + 0.5) * scale)

    for kind in ("local", "secondary", "primary"):
        colour, width = STREET_STYLE[kind]
        for street in (s for s in overlay["streets"] if s["kind"] == kind):
            for line in street["lines"]:
                pts = [px(line[i], line[i + 1]) for i in range(0, len(line), 2)]
                draw.line(pts, fill=colour, width=width)
    for m in overlay["landmarks"]:
        x, y = px(m["x"], m["z"])
        draw.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(30, 80, 220), outline=(255, 255, 255))
    for m in overlay["hotspots"]:
        x, y = px(m["x"], m["z"])
        draw.ellipse([x - 7, y - 7, x + 7, y + 7], fill=(220, 30, 30), outline=(255, 255, 255), width=2)
    return base


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: render_overlay_preview.py ASSET_DIR OUT.png")
    render(Path(sys.argv[1])).save(sys.argv[2])
```

- [ ] **Step 7: Run the whole pipeline suite**

Run: `cd pipeline && uv run pytest -q -W error`
Expected: **268 passed** (167 existing plus 101 in `test_overlay.py`), no warnings.

- [ ] **Step 8: Commit**

```bash
git add pipeline/pyproject.toml pipeline/uv.lock pipeline/yelamu/overlay.py pipeline/tests/test_overlay.py pipeline/data/overlay pipeline/scripts/build_overlay.py pipeline/scripts/verify_overlay_data.py pipeline/scripts/render_overlay_preview.py
git commit -m "feat(pipeline): overlay builder for streets, landmarks and sourced hotspots"
```

---

### Task 2: Build the real overlay, cross-check it, and review the hotspots

**Files:** none committed here; outputs go to the gitignored `real-city` folder.

- [ ] **Step 1: Get the TIGER roads (approval needed if not already downloaded)**

Check first: `ls pipeline/data/raw/tiger/extracted/tl_2024_06075_roads.shp`. If it exists, skip to Step 2.

If not, **ask the user to approve this one download**, stating filename, source and size: `tl_2024_06075_roads.zip`, 594,125 bytes, from `www2.census.gov` (US Census Bureau TIGER/Line 2024, San Francisco County roads, public domain). Then:

```bash
cd pipeline/data/raw && mkdir -p tiger/extracted
curl -sL -o tiger/tl_2024_06075_roads.zip "https://www2.census.gov/geo/tiger/TIGER2024/ROADS/tl_2024_06075_roads.zip"
unzip -oq tiger/tl_2024_06075_roads.zip -d tiger/extracted
```
Expected: `tiger/extracted/tl_2024_06075_roads.shp` (about 901 KB), `.dbf`, `.shx`, `.prj`. `pipeline/data/raw/` is gitignored. Keep the extracted files in their own folder.

- [ ] **Step 2: Build the overlay for the full city**

```bash
cd pipeline
uv run python scripts/build_overlay.py --region regions/full-city.json
```
Expected: `overlay: 2493 streets ({'primary': 8, 'secondary': 40, 'local': 2445}), 3659 polylines, 13219 points; 38 landmarks, 11 hotspots`, in about a second. It writes `viewer/public/assets/real-city/overlay.json` and adds `"overlay_file": "overlay.json"` to that folder's `meta.json`. Run it a second time: the output is byte-identical.

Check the size: `ls -l ../viewer/public/assets/real-city/overlay.json && gzip -c ../viewer/public/assets/real-city/overlay.json | wc -c` — Expected: about 328 KB raw and about 102 KB gzipped.

- [ ] **Step 3: Cross-check the data against the terrain**

Run: `uv run python scripts/verify_overlay_data.py ../viewer/public/assets/real-city`
Expected: exit code 0. It checks that hills are at least 60 m on the reconstructed terrain, that water and beach landmarks are not on high ground, and prints the habitat group at each hotspot. Landmarks standing on later fill (Ferry Building, Oracle Park, Chase Center, Pier 39) read as water: that is correct, not a failure. Hotspots in the unmapped south (Lake Merced, Laguna Honda, Islais and Precita creeks) report "unmapped".

- [ ] **Step 4: Look at the preview**

```bash
uv run --with pillow python scripts/render_overlay_preview.py ../viewer/public/assets/real-city ../docs/research/local/overlay-preview.png
```
Open the image (gitignored folder). Expected: streets aligned with the coastline, the bay shore cutting through the modern grid (the old bay shows as water under the downtown streets), landmarks as blue dots and hotspots as red dots on the right features.

- [ ] **Step 5: Owner review of the hotspots**

Read every entry in `pipeline/data/overlay/hotspots.json` with its source link open. For each: is the description supported by the source, and does it say nothing the source does not? Edit or remove any that are not, and re-run `uv run pytest tests/test_overlay.py -q` (the repo-data test validates the file) and Step 2. One example from the prototype: a description of Precita Creek that gave a marsh width was cut, because the source attached that figure to a different creek.

Positions are approximate (Laguna Honda's by about 300 m). If you want the panel to say so, add it to the description text.

---

# Part B: Viewer

### Task 3: App state, keyboard, share links

Pure modules: the URL-hash codec (camera target, zoom, rotation, layers, selected place), keyboard shortcut mapping, a seeded random land picker for "Surprise me", the debounced hash writer, the layer selection (defaults apply only until the hash or the visitor decides), the selected place, and the surprise-target chooser.

**Files:**
- Create: `viewer/src/appState.ts`, `keys.ts`, `randomLand.ts`, `hashSync.ts`, `layerSelection.ts`, `placeSelection.ts`, `surprise.ts` and a `*.test.ts` for each

- [ ] **Step 1: Write the failing tests**

`viewer/src/appState.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decodeState, encodeState, isPlaceId, type AppState } from "./appState";

const base: AppState = { x: 123.4, z: -56.7, zoom: 3.2, rot: 1, layers: ["landmarks", "streets"] };

describe("encodeState", () => {
  it("produces the compact documented form without a leading #", () => {
    expect(encodeState(base)).toBe("x=123.4&z=-56.7&k=3.20&r=1&l=landmarks,streets");
  });

  it("rounds x and z to 0.1 and zoom to 2 decimals", () => {
    expect(encodeState({ ...base, x: 1.26, z: -0.04, zoom: 2.34567, layers: undefined })).toBe(
      "x=1.3&z=0.0&k=2.35&r=1",
    );
  });

  it("never writes a negative zero", () => {
    expect(encodeState({ ...base, x: -0.01, z: -0, layers: undefined })).toBe("x=0.0&z=0.0&k=3.20&r=1");
  });

  it("omits l only when layers is unset", () => {
    expect(encodeState({ ...base, layers: undefined })).not.toContain("l=");
  });

  it("writes an explicit empty selection as an empty l=", () => {
    expect(encodeState({ ...base, layers: [] })).toBe("x=123.4&z=-56.7&k=3.20&r=1&l=");
  });

  it("sorts and de-duplicates layers and drops invalid ids", () => {
    const s = encodeState({ ...base, layers: ["b", "a", "b", "Bad Id", "x&y"] });
    expect(s.endsWith("l=a,b")).toBe(true);
  });

  it("normalises the rotation into 0..3", () => {
    expect(encodeState({ ...base, rot: 5, layers: undefined })).toContain("r=1");
    expect(encodeState({ ...base, rot: -1, layers: undefined })).toContain("r=3");
  });

  it("skips non-finite numbers rather than writing NaN", () => {
    const s = encodeState({ ...base, x: NaN, zoom: Infinity, layers: undefined });
    expect(s).toBe("z=-56.7&r=1");
  });
});

describe("decodeState", () => {
  it("round-trips an encoded state", () => {
    expect(decodeState(encodeState(base))).toEqual(base);
  });

  it("round-trips with unset layers (layers key stays absent)", () => {
    const s = { ...base, layers: undefined };
    const d = decodeState(encodeState(s));
    expect(d).toEqual({ x: 123.4, z: -56.7, zoom: 3.2, rot: 1 });
    expect("layers" in d).toBe(false);
  });

  it("round-trips an explicit empty selection", () => {
    const d = decodeState(encodeState({ ...base, layers: [] }));
    expect(d.layers).toEqual([]);
  });

  it("a hash without l has no layers key; l= has an empty one", () => {
    expect("layers" in decodeState("x=1&z=2")).toBe(false);
    expect(decodeState("x=1&l=").layers).toEqual([]);
  });

  it("accepts a leading #, with or without", () => {
    expect(decodeState("#x=5&z=6")).toEqual({ x: 5, z: 6 });
    expect(decodeState("x=5&z=6")).toEqual({ x: 5, z: 6 });
  });

  it("returns an empty object for empty or garbage input", () => {
    expect(decodeState("")).toEqual({});
    expect(decodeState("#")).toEqual({});
    expect(decodeState("&&&===&")).toEqual({});
    expect(decodeState("lorem ipsum")).toEqual({});
    expect(decodeState("\u0000￿%%%")).toEqual({});
  });

  it("ignores unknown keys", () => {
    expect(decodeState("x=1&foo=bar&__proto__=1&constructor=2")).toEqual({ x: 1 });
  });

  it("omits non-finite and non-numeric values", () => {
    expect(decodeState("x=NaN&z=Infinity&k=-Infinity&r=abc")).toEqual({});
    expect(decodeState("x=&z=&k=&r=")).toEqual({});
    expect(decodeState("x=1e999&z=0x10&k=1,5")).toEqual({});
  });

  it("keeps huge but finite numbers (the rig clamps them)", () => {
    expect(decodeState("x=1e300")).toEqual({ x: 1e300 });
  });

  it("accepts negative, decimal and exponent forms", () => {
    expect(decodeState("x=-12.5&z=.5&k=2e0")).toEqual({ x: -12.5, z: 0.5, zoom: 2 });
  });

  it("clamps r to an integer 0..3 (mod 4)", () => {
    expect(decodeState("r=0").rot).toBe(0);
    expect(decodeState("r=3").rot).toBe(3);
    expect(decodeState("r=4").rot).toBe(0);
    expect(decodeState("r=-1").rot).toBe(3);
    expect(decodeState("r=6").rot).toBe(2);
    expect(decodeState("r=1.6").rot).toBe(2);
    expect(decodeState("r=1e20").rot).toBe(0);
  });

  it("duplicate keys: the last valid value wins", () => {
    expect(decodeState("x=1&x=2&x=3")).toEqual({ x: 3 });
    expect(decodeState("x=1&x=oops")).toEqual({ x: 1 });
  });

  it("splits layers on commas, keeps valid ids, de-duplicates, sorts", () => {
    expect(decodeState("l=streets,landmarks,streets").layers).toEqual(["landmarks", "streets"]);
    expect(decodeState("l=a-b,c1").layers).toEqual(["a-b", "c1"]);
  });

  it("drops layer ids that are not lowercase alphanumerics or hyphens", () => {
    expect(decodeState("l=ok,Bad,has space,a_b,<script>,x.y,,").layers).toEqual(["ok"]);
  });

  it("caps layers at 12", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `l${String(i).padStart(2, "0")}`);
    const out = decodeState(`l=${ids.join(",")}`).layers!;
    expect(out).toHaveLength(12);
    expect(out).toEqual(ids.slice(0, 12));
  });

  it("treats an explicit empty l= as an explicit empty selection", () => {
    expect(decodeState("l=").layers).toEqual([]);
  });

  it("neutralises script-looking input", () => {
    const d = decodeState("x=<script>alert(1)</script>&l=<img src=x onerror=alert(1)>&r=javascript:1");
    expect(d).toEqual({ layers: [] });
  });

  it("percent-decodes values and survives malformed escapes", () => {
    expect(decodeState("l=a%2Cb")).toEqual({ layers: ["a", "b"] });
    expect(() => decodeState("x=%E0%A4%A&l=%")).not.toThrow();
  });

  it("never throws on pathological input", () => {
    const inputs = ["#".repeat(100000), "x=".repeat(50000), "=".repeat(10), "&".repeat(10), "x=1&".repeat(10000)];
    for (const i of inputs) expect(() => decodeState(i)).not.toThrow();
    // @ts-expect-error deliberately wrong type
    expect(decodeState(undefined)).toEqual({});
    // @ts-expect-error deliberately wrong type
    expect(decodeState(null)).toEqual({});
  });
});

describe("place (p=)", () => {
  it("is written after the layers and only when set and valid", () => {
    expect(encodeState({ ...base, place: "mission-creek" })).toBe(
      "x=123.4&z=-56.7&k=3.20&r=1&l=landmarks,streets&p=mission-creek",
    );
    expect(encodeState({ ...base, layers: undefined, place: "a1" }).endsWith("&r=1&p=a1")).toBe(true);
    expect(encodeState({ ...base, place: undefined })).not.toContain("p=");
    expect(encodeState({ ...base, place: "" })).not.toContain("p=");
    expect(encodeState({ ...base, place: "Bad Id&x=1" })).not.toContain("p=");
    expect(encodeState({ ...base, place: "a".repeat(49) })).not.toContain("p=");
  });

  it("round-trips", () => {
    const s = { ...base, place: "lobos-creek" };
    expect(decodeState(encodeState(s))).toEqual(s);
  });

  it("accepts ids up to 48 characters and no more", () => {
    expect(decodeState(`p=${"a".repeat(48)}`).place).toBe("a".repeat(48));
    expect(decodeState(`p=${"a".repeat(49)}`)).toEqual({});
  });

  it("rejects ids that are not lowercase alphanumerics and hyphens, or start with a hyphen", () => {
    for (const bad of ["Upper", "-lead", "has space", "a_b", "a.b", "<script>", "a%2Fb", ""]) {
      expect(decodeState(`p=${bad}`).place).toBeUndefined();
    }
    expect(decodeState("p=0abc-d").place).toBe("0abc-d");
  });

  it("keeps the last valid value of a repeated key", () => {
    expect(decodeState("p=one&p=BAD").place).toBe("one");
    expect(decodeState("p=one&p=two").place).toBe("two");
  });
});

describe("isPlaceId", () => {
  it("validates", () => {
    expect(isPlaceId("a")).toBe(true);
    expect(isPlaceId("a-b-1")).toBe(true);
    expect(isPlaceId("")).toBe(false);
    expect(isPlaceId(5)).toBe(false);
    expect(isPlaceId(undefined)).toBe(false);
  });
});
```

`viewer/src/keys.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { keyAction } from "./keys";

describe("keyAction mappings", () => {
  it("arrows pan in the direction the view should move on screen", () => {
    expect(keyAction({ key: "ArrowLeft" })).toEqual({ type: "pan", dx: -1, dy: 0 });
    expect(keyAction({ key: "ArrowRight" })).toEqual({ type: "pan", dx: 1, dy: 0 });
    expect(keyAction({ key: "ArrowUp" })).toEqual({ type: "pan", dx: 0, dy: -1 });
    expect(keyAction({ key: "ArrowDown" })).toEqual({ type: "pan", dx: 0, dy: 1 });
  });

  it("WASD is not bound", () => {
    for (const k of ["w", "a", "s", "d"]) expect(keyAction({ key: k })).toBeNull();
  });

  it("+ and = zoom in; - and _ zoom out", () => {
    expect(keyAction({ key: "+", shiftKey: true })).toEqual({ type: "zoom", dir: 1 });
    expect(keyAction({ key: "=" })).toEqual({ type: "zoom", dir: 1 });
    expect(keyAction({ key: "-" })).toEqual({ type: "zoom", dir: -1 });
    expect(keyAction({ key: "_", shiftKey: true })).toEqual({ type: "zoom", dir: -1 });
  });

  it("q / e rotate left / right, case-insensitively", () => {
    expect(keyAction({ key: "q" })).toEqual({ type: "rotate", dir: -1 });
    expect(keyAction({ key: "Q", shiftKey: true })).toEqual({ type: "rotate", dir: -1 });
    expect(keyAction({ key: "e" })).toEqual({ type: "rotate", dir: 1 });
    expect(keyAction({ key: "E", shiftKey: true })).toEqual({ type: "rotate", dir: 1 });
  });

  it("h resets, / searches, ? opens help, Escape escapes", () => {
    expect(keyAction({ key: "h" })).toEqual({ type: "reset" });
    expect(keyAction({ key: "H", shiftKey: true })).toEqual({ type: "reset" });
    expect(keyAction({ key: "/" })).toEqual({ type: "search" });
    expect(keyAction({ key: "?", shiftKey: true })).toEqual({ type: "help" });
    expect(keyAction({ key: "Escape" })).toEqual({ type: "escape" });
    expect(keyAction({ key: "Esc" })).toEqual({ type: "escape" });
  });

  it("returns null for unmapped keys", () => {
    for (const k of ["x", "Enter", " ", "Tab", "F5", "1", "", "Shift", "Dead"]) {
      expect(keyAction({ key: k })).toBeNull();
    }
  });
});

describe("keyAction guards", () => {
  it("lets browser shortcuts through when ctrl, meta or alt is held", () => {
    for (const mod of ["ctrlKey", "metaKey", "altKey"] as const) {
      expect(keyAction({ key: "=", [mod]: true })).toBeNull();
      expect(keyAction({ key: "q", [mod]: true })).toBeNull();
      expect(keyAction({ key: "ArrowLeft", [mod]: true })).toBeNull();
      expect(keyAction({ key: "Escape", [mod]: true })).toBeNull();
    }
  });

  it("Shift alone does not block arrows", () => {
    expect(keyAction({ key: "ArrowLeft", shiftKey: true })).toEqual({ type: "pan", dx: -1, dy: 0 });
  });

  it("ignores keys typed into inputs, textareas, selects and contenteditable", () => {
    for (const tagName of ["INPUT", "input", "TEXTAREA", "SELECT"]) {
      expect(keyAction({ key: "q", target: { tagName } })).toBeNull();
      expect(keyAction({ key: "/", target: { tagName } })).toBeNull();
      expect(keyAction({ key: "ArrowLeft", target: { tagName } })).toBeNull();
    }
    expect(keyAction({ key: "e", target: { tagName: "DIV", isContentEditable: true } })).toBeNull();
  });

  it("Escape still works from a text field", () => {
    expect(keyAction({ key: "Escape", target: { tagName: "INPUT" } })).toEqual({ type: "escape" });
    expect(keyAction({ key: "Escape", target: { tagName: "DIV", isContentEditable: true } })).toEqual({
      type: "escape",
    });
  });

  it("handles keys on buttons, the body and a null target", () => {
    expect(keyAction({ key: "e", target: { tagName: "BUTTON" } })).toEqual({ type: "rotate", dir: 1 });
    expect(keyAction({ key: "e", target: { tagName: "BODY" } })).toEqual({ type: "rotate", dir: 1 });
    expect(keyAction({ key: "e", target: null })).toEqual({ type: "rotate", dir: 1 });
  });
});
```

`viewer/src/randomLand.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mulberry32, pickRandomLandPoint } from "./randomLand";

const size = { width: 20, height: 10, cell_m: 10 };

/** Cell (col,row) -> the world x/z terrainMesh.ts gives that sample. */
const cellOf = (p: { x: number; z: number }) => ({
  col: p.x / size.cell_m + (size.width - 1) / 2,
  row: p.z / size.cell_m + (size.height - 1) / 2,
});

function grid(fill: (col: number, row: number) => number): Float32Array {
  const h = new Float32Array(size.width * size.height);
  for (let r = 0; r < size.height; r++) for (let c = 0; c < size.width; c++) h[r * size.width + c] = fill(c, r);
  return h;
}

describe("mulberry32", () => {
  it("is deterministic for a seed and stays in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 50 }, () => a());
    const seqB = Array.from({ length: 50 }, () => b());
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(Array.from({ length: 5 }, mulberry32(43))).not.toEqual(seqA.slice(0, 5));
  });
});

describe("pickRandomLandPoint", () => {
  it("is deterministic with a seeded rng", () => {
    const h = grid(() => 20);
    const a = pickRandomLandPoint(h, size, 0.6, mulberry32(7));
    const b = pickRandomLandPoint(h, size, 0.6, mulberry32(7));
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
  });

  it("uses terrainMesh world coordinates (cell centres, origin at the middle)", () => {
    const h = grid((c, r) => (c === 0 && r === 0 ? 50 : -5)); // single land cell: NW corner
    const p = pickRandomLandPoint(h, size, 0.6, mulberry32(1))!;
    expect(p.x).toBeCloseTo(-9.5 * 10);
    expect(p.z).toBeCloseTo(-4.5 * 10);
  });

  it("only returns land above both minHeight and the water level", () => {
    // Left half is land at 10 m, right half is below the 3 m minimum, a strip is 2 m.
    const h = grid((c) => (c < 10 ? 10 : 2));
    const rng = mulberry32(99);
    for (let i = 0; i < 300; i++) {
      const p = pickRandomLandPoint(h, size, 0.6, rng)!;
      const { col } = cellOf(p);
      expect(col).toBeLessThan(10);
    }
  });

  it("respects a water level higher than minHeight", () => {
    const h = grid((c) => (c < 5 ? 40 : 8));
    const rng = mulberry32(5);
    for (let i = 0; i < 100; i++) {
      const p = pickRandomLandPoint(h, size, 10, rng)!;
      expect(cellOf(p).col).toBeLessThan(5);
    }
  });

  it("finds a lone land cell even when random tries would miss it", () => {
    const h = grid((c, r) => (c === 13 && r === 6 ? 30 : 0));
    const p = pickRandomLandPoint(h, size, 0.6, mulberry32(3), 3, 5)!;
    expect(p).not.toBeNull();
    const { col, row } = cellOf(p);
    expect(Math.round(col)).toBe(13);
    expect(Math.round(row)).toBe(6);
  });

  it("returns null when there is no land", () => {
    expect(pickRandomLandPoint(grid(() => 0), size, 0.6, mulberry32(1))).toBeNull();
    expect(pickRandomLandPoint(grid(() => 2.9), size, 0.6, mulberry32(1))).toBeNull();
    expect(pickRandomLandPoint(grid(() => NaN), size, 0.6, mulberry32(1))).toBeNull();
  });

  it("returns null for a size that does not match the data", () => {
    expect(pickRandomLandPoint(new Float32Array(5), size, 0.6, mulberry32(1))).toBeNull();
  });

  it("copes with maxTries = 0", () => {
    const h = grid(() => 20);
    expect(pickRandomLandPoint(h, size, 0.6, mulberry32(1), 3, 0)).not.toBeNull();
  });
});
```

`viewer/src/hashSync.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "./appState";
import { createHashSync } from "./hashSync";

let state: AppState;
let writes: string[];

beforeEach(() => {
  vi.useFakeTimers();
  state = { x: 0, z: 0, zoom: 1, rot: 0 };
  writes = [];
});
afterEach(() => vi.useRealTimers());

const make = (delayMs?: number) =>
  createHashSync({ getState: () => state, write: (h) => writes.push(h), delayMs });

describe("createHashSync", () => {
  it("does not write on creation or when nothing changed", () => {
    const sync = make();
    sync.schedule();
    vi.advanceTimersByTime(1000);
    expect(writes).toEqual([]);
  });

  it("writes the encoded state once after the debounce delay", () => {
    const sync = make(250);
    state = { ...state, x: 12.34 };
    sync.schedule();
    vi.advanceTimersByTime(249);
    expect(writes).toEqual([]);
    vi.advanceTimersByTime(2);
    expect(writes).toEqual(["x=12.3&z=0.0&k=1.00&r=0"]);
  });

  it("restarts the timer on every schedule (trailing debounce)", () => {
    const sync = make(250);
    for (let i = 1; i <= 5; i++) {
      state = { ...state, x: i };
      sync.schedule();
      vi.advanceTimersByTime(200);
    }
    expect(writes).toEqual([]);
    vi.advanceTimersByTime(60);
    expect(writes).toEqual(["x=5.0&z=0.0&k=1.00&r=0"]);
  });

  it("skips writes whose encoded form equals the last one (sub-rounding changes)", () => {
    const sync = make(10);
    state = { ...state, x: 5 };
    sync.schedule();
    vi.advanceTimersByTime(20);
    state = { ...state, x: 5.01 };
    sync.schedule();
    vi.advanceTimersByTime(20);
    expect(writes).toHaveLength(1);
    state = { ...state, x: 6 };
    sync.schedule();
    vi.advanceTimersByTime(20);
    expect(writes).toHaveLength(2);
  });

  it("flush() writes immediately and cancels the pending timer", () => {
    const sync = make(250);
    state = { ...state, zoom: 4, layers: ["streets"] };
    sync.schedule();
    sync.flush();
    expect(writes).toEqual(["x=0.0&z=0.0&k=4.00&r=0&l=streets"]);
    vi.advanceTimersByTime(1000);
    expect(writes).toHaveLength(1);
  });

  it("cancel() drops a pending write", () => {
    const sync = make(250);
    state = { ...state, x: 9 };
    sync.schedule();
    sync.cancel();
    vi.advanceTimersByTime(1000);
    expect(writes).toEqual([]);
  });

  it("markWritten() records a state that came from the URL so it is not echoed back", () => {
    const sync = make(10);
    state = { ...state, x: 77 };
    sync.markCurrent();
    sync.schedule();
    vi.advanceTimersByTime(50);
    expect(writes).toEqual([]);
  });
});
```

`viewer/src/layerSelection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LayerSelection } from "./layerSelection";

describe("LayerSelection", () => {
  it("starts from the initial ids, cleaned and sorted", () => {
    const l = new LayerSelection(["streets", "Bad Id", "landmarks", "streets"]);
    expect(l.list()).toEqual(["landmarks", "streets"]);
    expect(l.has("streets")).toBe(true);
    expect(l.has("nope")).toBe(false);
  });

  it("set(id, on) adds and removes, notifying only on real changes", () => {
    const l = new LayerSelection([]);
    let n = 0;
    l.onChange(() => n++);
    l.set("b", true);
    l.set("a", true);
    expect(l.list()).toEqual(["a", "b"]);
    expect(n).toBe(2);
    l.set("a", true);
    expect(n).toBe(2);
    l.set("a", false);
    l.set("a", false);
    expect(l.list()).toEqual(["b"]);
    expect(n).toBe(3);
  });

  it("rejects invalid ids", () => {
    const l = new LayerSelection([]);
    l.set("<script>", true);
    l.set("Upper", true);
    expect(l.list()).toEqual([]);
  });

  it("replace() swaps the whole selection and notifies once if it differs", () => {
    const l = new LayerSelection(["a"]);
    let n = 0;
    l.onChange(() => n++);
    l.replace(["b", "a"]);
    expect(l.list()).toEqual(["a", "b"]);
    expect(n).toBe(1);
    l.replace(["a", "b"]);
    expect(n).toBe(1);
  });

  it("onChange passes the sorted list and can be unsubscribed", () => {
    const l = new LayerSelection([]);
    const seen: string[][] = [];
    const off = l.onChange((ids) => seen.push(ids));
    l.set("x", true);
    off();
    l.set("y", true);
    expect(seen).toEqual([["x"]]);
  });
});

describe("LayerSelection defaults (unset vs empty)", () => {
  it("unset selection: register() applies the default and keeps the hash clean", () => {
    const l = new LayerSelection(undefined);
    let n = 0;
    l.onChange(() => n++);
    expect(l.register("landmarks", true)).toBe(true);
    expect(l.register("hotspots", true)).toBe(true);
    expect(l.register("streets", false)).toBe(false);
    expect(l.list()).toEqual(["hotspots", "landmarks"]);
    expect(l.hashValue()).toBeUndefined();
    expect(n).toBe(0);
  });

  it("explicit empty selection (l=): defaults are NOT applied, every layer is off", () => {
    const l = new LayerSelection([]);
    expect(l.register("landmarks", true)).toBe(false);
    expect(l.register("hotspots", true)).toBe(false);
    expect(l.list()).toEqual([]);
    expect(l.hashValue()).toEqual([]);
  });

  it("explicit selection wins over defaults in both directions", () => {
    const l = new LayerSelection(["streets"]);
    expect(l.register("streets", false)).toBe(true);
    expect(l.register("landmarks", true)).toBe(false);
    expect(l.list()).toEqual(["streets"]);
  });

  it("the first user change makes the selection explicit", () => {
    const l = new LayerSelection(undefined);
    l.register("landmarks", true);
    l.register("hotspots", true);
    l.set("streets", true);
    expect(l.hashValue()).toEqual(["hotspots", "landmarks", "streets"]);
    const m = new LayerSelection(undefined);
    m.register("landmarks", true);
    m.set("landmarks", false);
    expect(m.hashValue()).toEqual([]);
  });

  it("register() ignores invalid ids", () => {
    const l = new LayerSelection(undefined);
    expect(l.register("Bad Id", true)).toBe(false);
  });
});
```

`viewer/src/placeSelection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PlaceSelection } from "./placeSelection";

describe("PlaceSelection", () => {
  it("starts from a valid initial id only", () => {
    expect(new PlaceSelection("mission-creek").get()).toBe("mission-creek");
    expect(new PlaceSelection("Bad Id").get()).toBeUndefined();
    expect(new PlaceSelection().get()).toBeUndefined();
  });

  it("notifies on real changes only", () => {
    const p = new PlaceSelection();
    const seen: Array<string | undefined> = [];
    p.onChange((id) => seen.push(id));
    p.set("a");
    p.set("a");
    p.set("b");
    p.set(undefined);
    p.set(undefined);
    expect(seen).toEqual(["a", "b", undefined]);
  });

  it("treats an invalid id as clearing", () => {
    const p = new PlaceSelection("a");
    p.set("<script>");
    expect(p.get()).toBeUndefined();
  });

  it("can be unsubscribed", () => {
    const p = new PlaceSelection();
    let n = 0;
    const off = p.onChange(() => n++);
    p.set("a");
    off();
    p.set("b");
    expect(n).toBe(1);
  });
});
```

`viewer/src/surprise.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SURPRISE_TARGET_FRACTION, pickSurpriseTarget, type SurpriseTarget } from "./surprise";

const targets: SurpriseTarget[] = [
  { x: 1, z: 1, zoom: 5, place: "a" },
  { x: 2, z: 2, zoom: 5, place: "b" },
  { x: 3, z: 3, zoom: 5 },
];
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

describe("pickSurpriseTarget", () => {
  it("returns null without targets", () => {
    expect(pickSurpriseTarget([], () => 0)).toBeNull();
  });

  it("goes to a target when the first draw is under the fraction", () => {
    expect(pickSurpriseTarget(targets, seq(0.1, 0.0))).toBe(targets[0]);
    expect(pickSurpriseTarget(targets, seq(0.59, 0.5))).toBe(targets[1]);
    expect(pickSurpriseTarget(targets, seq(0.0, 0.99999))).toBe(targets[2]);
  });

  it("falls back to a random land point otherwise", () => {
    expect(pickSurpriseTarget(targets, seq(0.6, 0.0))).toBeNull();
    expect(pickSurpriseTarget(targets, seq(0.99, 0.0))).toBeNull();
  });

  it("is about 60% over many draws", () => {
    let state = 12345;
    const rng = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    let hits = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (pickSurpriseTarget(targets, rng)) hits++;
    expect(hits / n).toBeGreaterThan(SURPRISE_TARGET_FRACTION - 0.05);
    expect(hits / n).toBeLessThan(SURPRISE_TARGET_FRACTION + 0.05);
  });

  it("honours a custom fraction and a rng that returns 1", () => {
    expect(pickSurpriseTarget(targets, seq(0.3, 0), 0.2)).toBeNull();
    expect(pickSurpriseTarget(targets, seq(0.3, 0), 1)).toBe(targets[0]);
    expect(pickSurpriseTarget(targets, seq(0, 1))).toBe(targets[2]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd viewer && npx vitest run src/appState.test.ts src/keys.test.ts src/randomLand.test.ts src/hashSync.test.ts src/layerSelection.test.ts src/placeSelection.test.ts src/surprise.test.ts`
Expected: FAIL: the modules under test cannot be found.

- [ ] **Step 3: Create the modules**

`viewer/src/appState.ts`:

```ts
/**
 * Shareable view state, kept in the URL hash (e.g. `#x=123.4&z=-56.7&k=3.20&r=1&l=streets,landmarks`).
 * Everything here is pure: no DOM, no three.js.
 */
export interface AppState {
  /** Camera target, world metres (+x east, +z south, same frame as terrainMesh.ts). */
  x: number;
  z: number;
  /** Orthographic camera zoom. */
  zoom: number;
  /** Quarter turns of the camera around the target, 0..3. */
  rot: number;
  /**
   * Ids of enabled optional layers, sorted. `undefined` means "not specified" (the app
   * uses each layer's default); `[]` means "every optional layer is off" and is written as `l=`.
   */
  layers?: string[];
  /** Id of the selected hotspot or landmark, written as `p=<id>`. */
  place?: string;
}

export const MAX_LAYERS = 12;
export const MAX_PLACE_ID_CHARS = 48;
/** Hash text beyond this many characters is ignored, so a hostile link cannot make us loop long. */
const MAX_HASH_CHARS = 4096;

const LAYER_ID = /^[a-z0-9-]+$/;
const PLACE_ID = /^[a-z0-9][a-z0-9-]*$/;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/** Wrap any integer (including negatives and huge values) into 0..3. */
export function normalizeRot(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return (((Math.round(n) % 4) + 4) % 4) || 0;
}

/** Valid ids only, de-duplicated, at most MAX_LAYERS (first ones win), then sorted. */
export function cleanLayers(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || !LAYER_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    if (seen.size >= MAX_LAYERS) break;
  }
  return [...seen].sort();
}

/** True for an id that may be written to / read from `p=`. */
export function isPlaceId(id: unknown): id is string {
  return typeof id === "string" && id.length <= MAX_PLACE_ID_CHARS && PLACE_ID.test(id);
}

function fixed(n: number, decimals: number): string {
  const s = n.toFixed(decimals);
  // toFixed keeps the sign of tiny negatives ("-0.0"); never write a negative zero.
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

/** Compact hash text WITHOUT the leading '#'. Non-finite numbers are left out. */
export function encodeState(s: AppState): string {
  const parts: string[] = [];
  if (Number.isFinite(s.x)) parts.push(`x=${fixed(s.x, 1)}`);
  if (Number.isFinite(s.z)) parts.push(`z=${fixed(s.z, 1)}`);
  if (Number.isFinite(s.zoom)) parts.push(`k=${fixed(s.zoom, 2)}`);
  if (Number.isFinite(s.rot)) parts.push(`r=${normalizeRot(s.rot)}`);
  // Unset layers are left out; an explicit empty selection is written as an empty `l=`.
  if (s.layers !== undefined) parts.push(`l=${cleanLayers(s.layers).join(",")}`);
  if (isPlaceId(s.place)) parts.push(`p=${s.place}`);
  return parts.join("&");
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function parseNumber(v: string): number | undefined {
  const t = v.trim();
  if (!NUMBER.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Tolerant parse of a location hash. Accepts a leading '#', ignores unknown keys, drops
 * values that are not finite numbers, wraps r into 0..3 and filters layer ids. A repeated
 * key takes its last VALID value. Never throws; returns only what it could read.
 * `layers` is present (possibly `[]`) only when the hash has an `l` key.
 * Huge-but-finite numbers are returned as is: the view rig clamps them to the map.
 */
export function decodeState(hash: string): Partial<AppState> {
  const out: Partial<AppState> = {};
  if (typeof hash !== "string") return out;
  let text = hash.length > MAX_HASH_CHARS ? hash.slice(0, MAX_HASH_CHARS) : hash;
  if (text.startsWith("#")) text = text.slice(1);

  for (const pair of text.split("&")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const key = pair.slice(0, eq);
    const value = safeDecode(pair.slice(eq + 1));
    switch (key) {
      case "x":
      case "z": {
        const n = parseNumber(value);
        if (n !== undefined) out[key] = n;
        break;
      }
      case "k": {
        const n = parseNumber(value);
        if (n !== undefined) out.zoom = n;
        break;
      }
      case "r": {
        const n = parseNumber(value);
        if (n !== undefined) out.rot = normalizeRot(n);
        break;
      }
      case "l":
        out.layers = cleanLayers(value.split(","));
        break;
      case "p":
        if (isPlaceId(value)) out.place = value;
        break;
      default:
        break;
    }
  }
  return out;
}
```

`viewer/src/keys.ts`:

```ts
/** Keyboard shortcut mapping. Pure: the DOM listener lives in controls.ts. */

export type KeyAction =
  /** Unit direction the VIEW should move on screen (ArrowRight = +1, 0). */
  | { type: "pan"; dx: -1 | 0 | 1; dy: -1 | 0 | 1 }
  | { type: "zoom"; dir: 1 | -1 }
  /** -1 = rotate left (Q), +1 = rotate right (E). */
  | { type: "rotate"; dir: 1 | -1 }
  | { type: "reset" }
  | { type: "search" }
  | { type: "help" }
  | { type: "escape" };

export interface KeyEventLike {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: { tagName?: string; isContentEditable?: boolean } | null;
}

const TEXT_ENTRY = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isTextEntry(target: KeyEventLike["target"]): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return typeof target.tagName === "string" && TEXT_ENTRY.has(target.tagName.toUpperCase());
}

/**
 * The action for a keydown, or null when the key is not ours: a ctrl/meta/alt chord (so
 * browser shortcuts keep working) or any key typed into a text field (except Escape).
 */
export function keyAction(e: KeyEventLike): KeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const escape = e.key === "Escape" || e.key === "Esc";
  if (escape) return { type: "escape" };
  if (isTextEntry(e.target)) return null;

  switch (e.key) {
    case "ArrowLeft":
      return { type: "pan", dx: -1, dy: 0 };
    case "ArrowRight":
      return { type: "pan", dx: 1, dy: 0 };
    case "ArrowUp":
      return { type: "pan", dx: 0, dy: -1 };
    case "ArrowDown":
      return { type: "pan", dx: 0, dy: 1 };
    case "+":
    case "=":
      return { type: "zoom", dir: 1 };
    case "-":
    case "_":
      return { type: "zoom", dir: -1 };
    case "/":
      return { type: "search" };
    case "?":
      return { type: "help" };
  }
  switch (e.key.toLowerCase()) {
    case "q":
      return { type: "rotate", dir: -1 };
    case "e":
      return { type: "rotate", dir: 1 };
    case "h":
      return { type: "reset" };
    default:
      return null;
  }
}
```

`viewer/src/randomLand.ts`:

```ts
/** Small seeded PRNG (mulberry32): fast, 32-bit state, uniform in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LandGrid {
  width: number;
  height: number;
  cell_m: number;
}

/**
 * A random cell centre that is land: at least `minHeightM` and above the water level.
 * Returns world metres in the frame terrainMesh.ts uses (origin at the grid centre,
 * +x east, +z south). It tries `maxTries` random cells first, then scans the grid from a
 * random start, so null means the grid really has no land (or the size is wrong).
 */
export function pickRandomLandPoint(
  heights: Float32Array,
  size: LandGrid,
  waterLevelM: number,
  rng: () => number,
  minHeightM = 3,
  maxTries = 200,
): { x: number; z: number } | null {
  const { width, height, cell_m } = size;
  const count = width * height;
  if (!(count > 0) || heights.length !== count) return null;

  const isLand = (i: number) => heights[i] >= minHeightM && heights[i] > waterLevelM;
  const toWorld = (i: number) => {
    const col = i % width;
    const row = (i - col) / width;
    return { x: (col - (width - 1) / 2) * cell_m, z: (row - (height - 1) / 2) * cell_m };
  };

  for (let k = 0; k < maxTries; k++) {
    const i = Math.min(count - 1, Math.floor(rng() * count));
    if (isLand(i)) return toWorld(i);
  }
  const start = Math.min(count - 1, Math.floor(rng() * count));
  for (let k = 0; k < count; k++) {
    const i = (start + k) % count;
    if (isLand(i)) return toWorld(i);
  }
  return null;
}
```

`viewer/src/hashSync.ts`:

```ts
import { encodeState, type AppState } from "./appState";

export interface HashSyncOptions {
  getState: () => AppState;
  /** Receives the encoded state (no '#'); main.ts puts it in the URL with history.replaceState. */
  write: (encoded: string) => void;
  /** Quiet period before a scheduled write happens. Default 250 ms. */
  delayMs?: number;
}

export interface HashSync {
  /** Something may have changed: (re)start the debounce timer. */
  schedule(): void;
  /** Write now if the state differs from what was last written. */
  flush(): void;
  /** Drop any pending write. */
  cancel(): void;
  /** Treat the current state as already in the URL (e.g. just read from it). */
  markCurrent(): void;
}

/** Debounced, change-only writer for the URL hash. Timers are the global ones. */
export function createHashSync(options: HashSyncOptions): HashSync {
  const delay = options.delayMs ?? 250;
  let last = encodeState(options.getState());
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const flush = () => {
    clear();
    const next = encodeState(options.getState());
    if (next === last) return;
    last = next;
    options.write(next);
  };
  return {
    schedule() {
      clear();
      timer = setTimeout(flush, delay);
    },
    flush,
    cancel: clear,
    markCurrent() {
      last = encodeState(options.getState());
    },
  };
}
```

`viewer/src/layerSelection.ts`:

```ts
import { cleanLayers } from "./appState";

/**
 * Which optional layers are enabled. Shared by the URL hash sync and by whichever module
 * owns each layer; ids are validated the same way as in the URL (see appState.ts).
 *
 * "Unset" and "empty" differ: constructed with `undefined` (the hash had no `l`), each
 * layer starts from its own default (see register()); constructed with a list - even an
 * empty one (`l=`) - the list is the whole truth and defaults do not apply.
 */
export class LayerSelection {
  private ids: string[];
  /** True once the selection came from the hash or the user changed it. */
  private touched: boolean;
  private readonly listeners = new Set<(ids: string[]) => void>();

  constructor(initial?: readonly string[]) {
    this.ids = cleanLayers(initial ?? []);
    this.touched = initial !== undefined;
  }

  has(id: string): boolean {
    return this.ids.includes(id);
  }

  /** Sorted copy of the enabled ids. */
  list(): string[] {
    return [...this.ids];
  }

  /**
   * What goes into the URL hash: `undefined` while the selection is still the untouched
   * defaults (so a default view has a clean URL), the sorted list otherwise (`[]` = all off).
   */
  hashValue(): string[] | undefined {
    return this.touched ? this.list() : undefined;
  }

  /**
   * A module declares an optional layer. When the selection is still unset the layer takes
   * `defaultOn` (silently: no change event, the hash stays clean); otherwise the existing
   * selection decides. Returns whether the layer is on.
   */
  register(id: string, defaultOn: boolean): boolean {
    if (!this.touched && defaultOn && !this.has(id)) {
      this.ids = cleanLayers([...this.ids, id]);
    }
    return this.has(id);
  }

  set(id: string, on: boolean): void {
    if (on === this.has(id)) return;
    this.replace(on ? [...this.ids, id] : this.ids.filter((x) => x !== id));
  }

  replace(ids: readonly string[]): void {
    const next = cleanLayers(ids);
    this.touched = true;
    if (next.length === this.ids.length && next.every((id, i) => id === this.ids[i])) return;
    this.ids = next;
    for (const cb of [...this.listeners]) cb(this.list());
  }

  onChange(cb: (ids: string[]) => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
}
```

`viewer/src/placeSelection.ts`:

```ts
import { isPlaceId } from "./appState";

/**
 * The selected hotspot or landmark (an overlay id), mirrored into the URL hash as `p=`.
 * Invalid ids are ignored, so a hand-edited hash cannot put junk into the app.
 */
export class PlaceSelection {
  private id: string | undefined;
  private readonly listeners = new Set<(id: string | undefined) => void>();

  constructor(initial?: string) {
    this.id = isPlaceId(initial) ? initial : undefined;
  }

  get(): string | undefined {
    return this.id;
  }

  /** Select a place (or `undefined` to clear). Notifies only when the value changes. */
  set(id: string | undefined): void {
    const next = isPlaceId(id) ? id : undefined;
    if (next === this.id) return;
    this.id = next;
    for (const cb of [...this.listeners]) cb(next);
  }

  onChange(cb: (id: string | undefined) => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
}
```

`viewer/src/surprise.ts`:

```ts
export interface SurpriseTarget {
  x: number;
  z: number;
  zoom: number;
  /** Place (hotspot) id to select on arrival, if any. */
  place?: string;
}

/** Share of "Surprise me" clicks that go to a registered target instead of a random land point. */
export const SURPRISE_TARGET_FRACTION = 0.6;

/**
 * A registered surprise target (with probability `fraction`), or null when the caller
 * should pick a random land point instead. Uses `rng` once for the decision and, only
 * when a target is chosen, once more to pick it.
 */
export function pickSurpriseTarget(
  targets: readonly SurpriseTarget[],
  rng: () => number,
  fraction = SURPRISE_TARGET_FRACTION,
): SurpriseTarget | null {
  if (targets.length === 0) return null;
  if (!(rng() < fraction)) return null;
  const i = Math.min(targets.length - 1, Math.max(0, Math.floor(rng() * targets.length)));
  return targets[i];
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `cd viewer && npm test && npx tsc --noEmit`
Expected: the seven new files pass (33 + 11 + 9 + 7 + 10 + 4 + 5 = **79** new tests, **172** in total); `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add viewer/src/appState.ts viewer/src/appState.test.ts viewer/src/keys.ts viewer/src/keys.test.ts viewer/src/randomLand.ts viewer/src/randomLand.test.ts viewer/src/hashSync.ts viewer/src/hashSync.test.ts viewer/src/layerSelection.ts viewer/src/layerSelection.test.ts viewer/src/placeSelection.ts viewer/src/placeSelection.test.ts viewer/src/surprise.ts viewer/src/surprise.test.ts
git commit -m "feat(viewer): app state codec, keyboard map, hash sync, layer and place selection"
```

---

### Task 4: The camera rig

Pan, zoom, rotation in quarter turns, clamping to the map, animated fly-to, reset; instant under reduced motion; driven by an injectable clock so the tests control time.

**Files:**
- Create: `viewer/src/viewRig.ts`, `viewer/src/viewRig.test.ts`

- [ ] **Step 1: Write the failing test `viewer/src/viewRig.test.ts`**

```ts
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ISO_AZIMUTH, ISO_ELEVATION, isoOffset } from "./camera";
import {
  CAMERA_DISTANCE,
  ROT_STEP,
  ViewRig,
  azimuthFor,
  clampTarget,
  clampZoom,
  easeInOutCubic,
  interpolateView,
  unitsPerPixel,
  type ViewRigOptions,
} from "./viewRig";

const BOUNDS = { halfWidth: 1000, halfDepth: 500 };

describe("azimuthFor", () => {
  it("is the isometric azimuth plus quarter turns", () => {
    expect(azimuthFor(0)).toBeCloseTo(ISO_AZIMUTH);
    expect(azimuthFor(1)).toBeCloseTo(ISO_AZIMUTH + Math.PI / 2);
    expect(azimuthFor(3)).toBeCloseTo(ISO_AZIMUTH + (3 * Math.PI) / 2);
    expect(ROT_STEP).toBeCloseTo(Math.PI / 2);
  });
});

describe("clampTarget", () => {
  it("leaves points inside the expanded rectangle alone", () => {
    expect(clampTarget(10, -20, BOUNDS, 100)).toEqual([10, -20]);
  });
  it("clamps to half extent plus margin on each axis", () => {
    expect(clampTarget(5000, 5000, BOUNDS, 100)).toEqual([1100, 600]);
    expect(clampTarget(-5000, -5000, BOUNDS, 100)).toEqual([-1100, -600]);
  });
  it("margin 0 clamps to the map edge", () => {
    expect(clampTarget(2000, 0, BOUNDS, 0)).toEqual([1000, 0]);
  });
  it("sends non-finite input to the centre instead of poisoning the camera", () => {
    expect(clampTarget(NaN, Infinity, BOUNDS, 0)).toEqual([0, 0]);
  });
});

describe("clampZoom", () => {
  it("clamps to [min, max]", () => {
    expect(clampZoom(0.1, 0.8, 40)).toBe(0.8);
    expect(clampZoom(100, 0.8, 40)).toBe(40);
    expect(clampZoom(3, 0.8, 40)).toBe(3);
  });
  it("falls back to min for NaN", () => {
    expect(clampZoom(NaN, 0.8, 40)).toBe(0.8);
  });
});

describe("easeInOutCubic", () => {
  it("pins the ends, is 0.5 at the middle and monotone", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    let prev = 0;
    for (let i = 1; i <= 20; i++) {
      const v = easeInOutCubic(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it("clamps t outside 0..1", () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });
});

describe("interpolateView", () => {
  const a = { x: 0, z: 0, zoom: 1 };
  const b = { x: 100, z: -50, zoom: 16 };
  it("returns exact endpoints at t=0 and t=1", () => {
    expect(interpolateView(a, b, 0)).toEqual(a);
    expect(interpolateView(a, b, 1)).toEqual(b);
  });
  it("interpolates the target linearly and the zoom geometrically", () => {
    const m = interpolateView(a, b, 0.5);
    expect(m.x).toBeCloseTo(50);
    expect(m.z).toBeCloseTo(-25);
    expect(m.zoom).toBeCloseTo(4); // sqrt(1 * 16)
  });
});

describe("unitsPerPixel", () => {
  it("is view height over zoom over viewport height", () => {
    const cam = new THREE.OrthographicCamera(-100, 100, 50, -50, -1, 1);
    cam.zoom = 2;
    expect(unitsPerPixel(cam, 400)).toBeCloseTo(100 / 2 / 400);
  });
  it("never divides by zero", () => {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    expect(Number.isFinite(unitsPerPixel(cam, 0))).toBe(true);
  });
});

/** A rig on a fake clock: frames only run when the test calls step(). */
function harness(over: Partial<ViewRigOptions> & { reduced?: boolean } = {}) {
  const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, -1e5, 1e5);
  let t = 1000;
  let queue: Array<(t: number) => void> = [];
  const rig = new ViewRig(camera, {
    bounds: BOUNDS,
    margin: 100,
    minZoom: 0.8,
    maxZoom: 40,
    reducedMotion: () => over.reduced ?? false,
    now: () => t,
    schedule: (cb) => void queue.push(cb),
    ...over,
  });
  /** Advance the clock by ms and run the frame callbacks that were pending. */
  const step = (ms: number) => {
    t += ms;
    const q = queue;
    queue = [];
    for (const cb of q) cb(t);
  };
  const run = (totalMs: number, frameMs = 16) => {
    for (let elapsed = 0; elapsed < totalMs; elapsed += frameMs) step(frameMs);
  };
  const pending = () => queue.length;
  return { camera, rig, step, run, pending };
}

describe("ViewRig state", () => {
  it("starts at the origin with the camera zoom and rot 0", () => {
    const { rig } = harness();
    expect(rig.getState()).toEqual({ x: 0, z: 0, zoom: 1, rot: 0 });
    expect(rig.isAnimating()).toBe(false);
  });

  it("setState clamps target and zoom and normalises rot", () => {
    const { rig } = harness();
    rig.setState({ x: 99999, z: -99999, zoom: 999, rot: 5 });
    expect(rig.getState()).toEqual({ x: 1100, z: -600, zoom: 40, rot: 1 });
    rig.setState({ zoom: 0.01 });
    expect(rig.getState().zoom).toBe(0.8);
  });

  it("setState with a partial leaves the other fields alone", () => {
    const { rig } = harness();
    rig.setState({ x: 10, z: 20, zoom: 2, rot: 2 });
    rig.setState({ x: 30 });
    expect(rig.getState()).toEqual({ x: 30, z: 20, zoom: 2, rot: 2 });
  });

  it("setState ignores non-finite fields", () => {
    const { rig } = harness();
    rig.setState({ x: 10, zoom: 2 });
    rig.setState({ x: NaN, zoom: Infinity, z: NaN });
    expect(rig.getState()).toMatchObject({ x: 10, z: 0, zoom: 2 });
  });

  it("zoomBy multiplies and clamps", () => {
    const { rig } = harness();
    rig.zoomBy(2);
    expect(rig.getState().zoom).toBeCloseTo(2);
    rig.zoomBy(1000);
    expect(rig.getState().zoom).toBe(40);
    rig.zoomBy(1e-9);
    expect(rig.getState().zoom).toBe(0.8);
  });

  it("panBy moves the target using the current azimuth and clamps to the bounds", () => {
    const { rig } = harness();
    rig.setState({ rot: 0 });
    // Dragging right by 10px at 2 units/px moves the target west, and a little south-west
    // or north-west depending on azimuth; check against panDelta's definition at 45 degrees.
    rig.panBy(10, 0, 2);
    const s = rig.getState();
    expect(s.x).toBeCloseTo(-20 * Math.cos(ISO_AZIMUTH));
    expect(s.z).toBeCloseTo(20 * Math.sin(ISO_AZIMUTH));
    rig.panBy(-1e7, 0, 1);
    expect(rig.getState().x).toBeLessThanOrEqual(1100);
    expect(rig.getState().z).toBeGreaterThanOrEqual(-600);
    expect(rig.getState().z).toBeLessThanOrEqual(600);
  });

  it("panBy follows the rotated view", () => {
    const a = harness();
    const b = harness();
    b.rig.setState({ rot: 1 });
    a.rig.panBy(0, 10, 1);
    b.rig.panBy(0, 10, 1);
    // Rotating the view by a quarter turn rotates the pan direction by the same amount.
    const sa = a.rig.getState();
    const sb = b.rig.getState();
    expect(Math.hypot(sa.x, sa.z)).toBeCloseTo(Math.hypot(sb.x, sb.z));
    expect(sb.x).toBeCloseTo(sa.z);
    expect(sb.z).toBeCloseTo(-sa.x);
  });
});

describe("ViewRig camera placement", () => {
  it("place() puts the camera at target + isoOffset looking at the target", () => {
    const { rig, camera } = harness();
    rig.setState({ x: 300, z: -200, zoom: 4, rot: 2 });
    const expected = isoOffset(CAMERA_DISTANCE, azimuthFor(2), ISO_ELEVATION).add(
      new THREE.Vector3(300, 0, -200),
    );
    expect(camera.position.distanceTo(expected)).toBeLessThan(1e-6);
    expect(camera.zoom).toBe(4);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const toTarget = new THREE.Vector3(300, 0, -200).sub(camera.position).normalize();
    expect(dir.distanceTo(toTarget)).toBeLessThan(1e-6);
  });

  it("the constructor places the camera so the first frame is correct", () => {
    const { camera } = harness();
    expect(camera.position.length()).toBeCloseTo(CAMERA_DISTANCE);
  });
});

describe("ViewRig onChange", () => {
  it("fires once per discrete change and not when nothing changed", () => {
    const { rig } = harness();
    let n = 0;
    rig.onChange(() => n++);
    rig.zoomBy(2);
    expect(n).toBe(1);
    rig.setState({ x: 5 });
    expect(n).toBe(2);
    rig.setState({ x: 5 });
    expect(n).toBe(2);
    rig.zoomBy(1);
    expect(n).toBe(2);
  });

  it("the unsubscribe function stops notifications", () => {
    const { rig } = harness();
    let n = 0;
    const off = rig.onChange(() => n++);
    rig.zoomBy(2);
    off();
    rig.zoomBy(2);
    expect(n).toBe(1);
  });

  it("fires on every animation frame, with the camera already updated", () => {
    const { rig, camera, run } = harness();
    const zooms: number[] = [];
    rig.onChange(() => zooms.push(camera.zoom));
    rig.flyTo(500, 0, 8);
    run(2000);
    expect(zooms.length).toBeGreaterThan(5);
    expect(zooms[zooms.length - 1]).toBe(8);
  });
});

describe("ViewRig.flyTo", () => {
  it("animates over ~600ms and lands exactly on the clamped target", () => {
    const { rig, run, step } = harness();
    rig.flyTo(400, -300, 6);
    expect(rig.isAnimating()).toBe(true);
    run(300);
    const mid = rig.getState();
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(400);
    expect(rig.isAnimating()).toBe(true);
    run(320); // total ~620 ms
    step(16);
    expect(rig.getState()).toEqual({ x: 400, z: -300, zoom: 6, rot: 0 });
    expect(rig.isAnimating()).toBe(false);
  });

  it("is exact at t=1 even when a frame overshoots the duration", () => {
    const { rig, step } = harness();
    rig.flyTo(123.456, 78.9, 3.3);
    step(5000);
    expect(rig.getState()).toEqual({ x: 123.456, z: 78.9, zoom: 3.3, rot: 0 });
    expect(rig.isAnimating()).toBe(false);
  });

  it("keeps the current zoom when none is given", () => {
    const { rig, step } = harness();
    rig.setState({ zoom: 5 });
    rig.flyTo(100, 100);
    step(5000);
    expect(rig.getState().zoom).toBe(5);
  });

  it("clamps the destination to the map plus margin and the zoom range", () => {
    const { rig, step } = harness();
    rig.flyTo(1e6, -1e6, 1e6);
    step(5000);
    expect(rig.getState()).toEqual({ x: 1100, z: -600, zoom: 40, rot: 0 });
  });

  it("is instant under reduced motion", () => {
    const { rig, pending } = harness({ reduced: true });
    let n = 0;
    rig.onChange(() => n++);
    rig.flyTo(400, -300, 6);
    expect(rig.getState()).toEqual({ x: 400, z: -300, zoom: 6, rot: 0 });
    expect(rig.isAnimating()).toBe(false);
    expect(pending()).toBe(0);
    expect(n).toBe(1);
  });

  it("cancels a running flight and replaces it", () => {
    const { rig, run, step } = harness();
    rig.flyTo(900, 0, 10);
    run(200);
    const partial = rig.getState().x;
    expect(partial).toBeGreaterThan(0);
    rig.flyTo(-200, 100, 2);
    step(5000);
    expect(rig.getState()).toEqual({ x: -200, z: 100, zoom: 2, rot: 0 });
    expect(rig.isAnimating()).toBe(false);
    // The first flight's leftover frame callbacks must not move the camera any more.
    step(100);
    expect(rig.getState().x).toBe(-200);
  });

  it("a flight started mid-flight begins from where the camera is now", () => {
    const { rig, run } = harness();
    rig.flyTo(900, 0, 10);
    run(250);
    const before = rig.getState();
    rig.flyTo(-200, 100, 2);
    expect(rig.getState()).toEqual(before); // no jump when the new flight starts
  });

  it("user panning or zooming cancels the view animation", () => {
    const { rig, run } = harness();
    rig.flyTo(900, 0, 10);
    run(100);
    rig.panBy(1, 0, 1);
    expect(rig.isAnimating()).toBe(false);
    const s = rig.getState();
    run(1000);
    expect(rig.getState()).toEqual(s);
  });

  it("setState cancels animation", () => {
    const { rig, run } = harness();
    rig.flyTo(900, 0, 10);
    run(100);
    rig.setState({ x: 50, z: 50, zoom: 2 });
    run(1000);
    expect(rig.getState()).toMatchObject({ x: 50, z: 50, zoom: 2 });
    expect(rig.isAnimating()).toBe(false);
  });
});

describe("ViewRig.rotate", () => {
  const norm = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

  it("turns a quarter turn over ~350ms and ends at the right rot", () => {
    const { rig, run, step } = harness();
    rig.rotate(1);
    expect(rig.isAnimating()).toBe(true);
    expect(rig.getState().rot).toBe(1); // rot is the destination
    run(400);
    step(16);
    expect(rig.getState().rot).toBe(1);
    expect(rig.getAzimuth()).toBeCloseTo(azimuthFor(1));
    expect(rig.isAnimating()).toBe(false);
  });

  it("takes the shortest way: rot 0 -> 3 sweeps -90 degrees, never +270", () => {
    const { rig, run } = harness();
    const seen: number[] = [rig.getAzimuth()];
    rig.onChange(() => seen.push(rig.getAzimuth()));
    rig.rotate(-1);
    run(500);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThanOrEqual(seen[i - 1] + 1e-9);
    const total = norm(seen[seen.length - 1] - seen[0]);
    expect(total).toBeCloseTo(-ROT_STEP);
    expect(Math.abs(seen[seen.length - 1] - seen[0])).toBeCloseTo(ROT_STEP);
    expect(rig.getState().rot).toBe(3);
  });

  it("wraps 3 -> 0 forwards", () => {
    const { rig, run } = harness();
    rig.setState({ rot: 3 });
    const start = rig.getAzimuth();
    rig.rotate(1);
    run(500);
    expect(rig.getState().rot).toBe(0);
    expect(norm(rig.getAzimuth() - start)).toBeCloseTo(ROT_STEP);
    // The camera really ended up at the rot-0 position.
    const expected = isoOffset(CAMERA_DISTANCE, azimuthFor(0), ISO_ELEVATION);
    expect(rig.camera.position.distanceTo(expected)).toBeLessThan(1e-3);
  });

  it("keeps the target fixed while rotating", () => {
    const { rig, run } = harness();
    rig.setState({ x: 200, z: -100 });
    rig.rotate(1);
    run(200);
    expect(rig.getState()).toMatchObject({ x: 200, z: -100 });
  });

  it("is instant under reduced motion", () => {
    const { rig, pending } = harness({ reduced: true });
    rig.rotate(1);
    expect(rig.getState().rot).toBe(1);
    expect(rig.isAnimating()).toBe(false);
    expect(pending()).toBe(0);
    expect(norm(rig.getAzimuth() - azimuthFor(1))).toBeCloseTo(0);
  });

  it("presses made during a turn chain: two presses make a half turn", () => {
    const { rig, run } = harness();
    rig.rotate(1);
    run(100);
    rig.rotate(1);
    expect(rig.getState().rot).toBe(2);
    run(1000);
    expect(rig.getState().rot).toBe(2);
    expect(norm(rig.getAzimuth() - azimuthFor(2))).toBeCloseTo(0);
    expect(rig.isAnimating()).toBe(false);
  });

  it("rotating while a flight is running keeps the flight going to its destination", () => {
    const { rig, run } = harness();
    rig.flyTo(400, 0, 6);
    run(100);
    rig.rotate(1);
    run(2000);
    expect(rig.getState()).toEqual({ x: 400, z: 0, zoom: 6, rot: 1 });
  });
});

describe("ViewRig.reset", () => {
  it("animates back to the view the rig was created with", () => {
    const { rig, run } = harness();
    rig.setState({ x: 500, z: 100, zoom: 9, rot: 2 });
    rig.reset();
    expect(rig.isAnimating()).toBe(true);
    run(1500);
    expect(rig.getState()).toEqual({ x: 0, z: 0, zoom: 1, rot: 0 });
    expect(rig.isAnimating()).toBe(false);
  });

  it("returns by the shortest turn (3 -> 0 is a forward quarter turn)", () => {
    const { rig, run } = harness();
    rig.setState({ rot: 3 });
    const start = rig.getAzimuth();
    const seen: number[] = [];
    rig.onChange(() => seen.push(rig.getAzimuth()));
    rig.reset();
    run(1500);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1] - 1e-9);
    expect(seen[seen.length - 1] - start).toBeCloseTo(ROT_STEP);
  });

  it("is instant under reduced motion", () => {
    const { rig, pending } = harness({ reduced: true });
    rig.setState({ x: 500, zoom: 9, rot: 2 });
    rig.reset();
    expect(rig.getState()).toEqual({ x: 0, z: 0, zoom: 1, rot: 0 });
    expect(pending()).toBe(0);
  });
});

describe("ViewRig user input during a rotation", () => {
  it("panning lets a running rotation finish", () => {
    const { rig, run } = harness();
    rig.rotate(1);
    run(100);
    rig.panBy(5, 0, 1);
    expect(rig.isAnimating()).toBe(true);
    run(1000);
    expect(rig.getState().rot).toBe(1);
    expect(rig.getAzimuth()).toBeCloseTo(azimuthFor(1));
    expect(rig.isAnimating()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd viewer && npx vitest run src/viewRig.test.ts`
Expected: FAIL: cannot find `./viewRig`

- [ ] **Step 3: Create `viewer/src/viewRig.ts`**

```ts
import * as THREE from "three";
import { ISO_AZIMUTH, ISO_ELEVATION, isoOffset, panDelta } from "./camera";
import { normalizeRot } from "./appState";

/** Distance of the camera from its target. Irrelevant for orthographic projection. */
export const CAMERA_DISTANCE = 20000;
/** One rotation step: a quarter turn. */
export const ROT_STEP = Math.PI / 2;
export const ROTATE_MS = 350;
export const FLY_MS = 600;

/** Camera azimuth for a number of quarter turns (may be negative or above 3). */
export function azimuthFor(rot: number): number {
  return ISO_AZIMUTH + rot * ROT_STEP;
}

export interface MapBounds {
  /** Half the map extent east-west / north-south, in metres, about the origin. */
  halfWidth: number;
  halfDepth: number;
}

/** Keep the target inside the map rectangle expanded by `margin` metres on every side. */
export function clampTarget(
  x: number,
  z: number,
  bounds: MapBounds,
  margin: number,
): [number, number] {
  const mx = bounds.halfWidth + margin;
  const mz = bounds.halfDepth + margin;
  const cx = Number.isFinite(x) ? Math.min(mx, Math.max(-mx, x)) : 0;
  const cz = Number.isFinite(z) ? Math.min(mz, Math.max(-mz, z)) : 0;
  return [cx, cz];
}

export function clampZoom(zoom: number, min: number, max: number): number {
  if (!Number.isFinite(zoom)) return min;
  return Math.min(max, Math.max(min, zoom));
}

export function easeInOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

export interface ViewTarget {
  x: number;
  z: number;
  zoom: number;
}

/**
 * Linear in the target position, geometric in zoom (so a zoom change feels even). `t` is
 * NOT eased here; callers ease it first. t <= 0 and t >= 1 return the endpoints exactly.
 */
export function interpolateView(from: ViewTarget, to: ViewTarget, t: number): ViewTarget {
  if (t <= 0) return { x: from.x, z: from.z, zoom: from.zoom };
  if (t >= 1) return { x: to.x, z: to.z, zoom: to.zoom };
  return {
    x: from.x + (to.x - from.x) * t,
    z: from.z + (to.z - from.z) * t,
    zoom: Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * t),
  };
}

/** World units covered by one CSS pixel at the camera's current zoom. */
export function unitsPerPixel(camera: THREE.OrthographicCamera, viewportHeightPx: number): number {
  return (camera.top - camera.bottom) / camera.zoom / Math.max(1, viewportHeightPx);
}

/** What the URL hash and the UI see: `rot` is the DESTINATION quarter turn, 0..3. */
export interface ViewState extends ViewTarget {
  rot: number;
}

export interface ViewRigOptions {
  bounds: MapBounds;
  /** Metres the target may stray beyond the map rectangle. */
  margin: number;
  minZoom: number;
  maxZoom: number;
  reducedMotion: () => boolean;
  /** Clock in ms; defaults to performance.now. Injected by tests. */
  now?: () => number;
  /** Request one callback on the next frame; defaults to requestAnimationFrame. */
  schedule?: (cb: (t: number) => void) => void;
}

interface Animation {
  token: number;
  start: number;
  duration: number;
  view: { from: ViewTarget; to: ViewTarget } | null;
  az: { from: number; to: number } | null;
}

/**
 * Owns the camera pose: target (x, z), zoom and rotation about the target. Every mutation
 * clamps, repositions the camera (place()) and then notifies onChange listeners, so
 * consumers only need to request a render. Animations (rotate, flyTo, reset) run on the
 * injected clock; they are instant when `reducedMotion()` is true.
 */
export class ViewRig {
  private x = 0;
  private z = 0;
  private zoom: number;
  /** Quarter turns, UNWRAPPED (can be negative or above 3) so animations take the short way. */
  private rotTarget = 0;
  private azimuth = azimuthFor(0);
  private anim: Animation | null = null;
  private seq = 0;
  private readonly listeners = new Set<() => void>();
  private readonly initial: ViewState;
  private readonly now: () => number;
  private readonly schedule: (cb: (t: number) => void) => void;

  constructor(
    readonly camera: THREE.OrthographicCamera,
    private readonly options: ViewRigOptions,
  ) {
    this.now = options.now ?? (() => performance.now());
    this.schedule = options.schedule ?? ((cb) => void requestAnimationFrame(cb));
    this.zoom = clampZoom(camera.zoom, options.minZoom, options.maxZoom);
    this.initial = this.getState();
    this.place();
  }

  getState(): ViewState {
    return { x: this.x, z: this.z, zoom: this.zoom, rot: normalizeRot(this.rotTarget) };
  }

  /** Current (possibly mid-animation) camera azimuth in radians. */
  getAzimuth(): number {
    return this.azimuth;
  }

  isAnimating(): boolean {
    return this.anim !== null;
  }

  /** Instant jump. Clamps, ignores non-finite fields, cancels any animation. */
  setState(partial: Partial<ViewState>): void {
    const before = this.signature();
    this.cancel();
    const nx = partial.x !== undefined && Number.isFinite(partial.x) ? partial.x : this.x;
    const nz = partial.z !== undefined && Number.isFinite(partial.z) ? partial.z : this.z;
    [this.x, this.z] = clampTarget(nx, nz, this.options.bounds, this.options.margin);
    if (partial.zoom !== undefined && Number.isFinite(partial.zoom)) {
      this.zoom = clampZoom(partial.zoom, this.options.minZoom, this.options.maxZoom);
    }
    if (partial.rot !== undefined && Number.isFinite(partial.rot)) {
      this.rotTarget = normalizeRot(partial.rot);
      this.azimuth = azimuthFor(this.rotTarget);
    }
    this.commitIfChanged(before);
  }

  /**
   * Pan as if the map were dragged by (dxPx, dyPx) screen pixels, using the CURRENT
   * azimuth. Cancels a running fly-to (the user took over) but lets a rotation finish.
   */
  panBy(dxPx: number, dyPx: number, unitsPerPx: number): void {
    const before = this.signature();
    this.dropViewAnimation();
    const d = panDelta(dxPx, dyPx, unitsPerPx, this.azimuth, ISO_ELEVATION);
    [this.x, this.z] = clampTarget(this.x + d.x, this.z + d.z, this.options.bounds, this.options.margin);
    this.commitIfChanged(before);
  }

  zoomBy(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const before = this.signature();
    this.dropViewAnimation();
    this.zoom = clampZoom(this.zoom * factor, this.options.minZoom, this.options.maxZoom);
    this.commitIfChanged(before);
  }

  /** One quarter turn: +1 turns the map clockwise as seen from above, -1 anticlockwise. */
  rotate(dir: 1 | -1): void {
    const before = this.signature();
    this.rotTarget += dir;
    if (this.options.reducedMotion()) {
      this.anim = null;
      this.azimuth = azimuthFor(this.rotTarget);
      this.commitIfChanged(before);
      return;
    }
    this.begin(undefined, ROTATE_MS);
  }

  /** Back to the view the rig was created with, by the shortest turn. */
  reset(): void {
    if (this.options.reducedMotion()) {
      this.setState(this.initial);
      return;
    }
    this.rotTarget += shortestTurn(normalizeRot(this.rotTarget), this.initial.rot);
    this.begin({ x: this.initial.x, z: this.initial.z, zoom: this.initial.zoom }, FLY_MS);
  }

  /** Glide to (x, z), optionally changing zoom. Cancels and replaces a running animation. */
  flyTo(x: number, z: number, zoom?: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const [cx, cz] = clampTarget(x, z, this.options.bounds, this.options.margin);
    const czoom = clampZoom(
      zoom !== undefined && Number.isFinite(zoom) ? zoom : this.zoom,
      this.options.minZoom,
      this.options.maxZoom,
    );
    if (this.options.reducedMotion()) {
      const before = this.signature();
      this.anim = null;
      this.azimuth = azimuthFor(this.rotTarget);
      this.x = cx;
      this.z = cz;
      this.zoom = czoom;
      this.commitIfChanged(before);
      return;
    }
    this.begin({ x: cx, z: cz, zoom: czoom }, FLY_MS);
  }

  /** Position the camera at target + isoOffset looking at the target (no notification). */
  place(): void {
    const off = isoOffset(CAMERA_DISTANCE, this.azimuth, ISO_ELEVATION);
    this.camera.position.set(this.x + off.x, off.y, this.z + off.z);
    this.camera.lookAt(this.x, 0, this.z);
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
  }

  /** Called after every state change, including each animation frame. Returns unsubscribe. */
  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  // --- internals ---

  private signature(): string {
    return `${this.x}|${this.z}|${this.zoom}|${this.azimuth}`;
  }

  private commit(): void {
    this.place();
    for (const cb of [...this.listeners]) cb();
  }

  private commitIfChanged(before: string): void {
    if (this.signature() !== before) this.commit();
  }

  /** Stop animating; a half-finished turn jumps to its destination. */
  private cancel(): void {
    this.anim = null;
    this.azimuth = azimuthFor(this.rotTarget);
  }

  /** The user took over the view: stop gliding, but let a rotation finish. */
  private dropViewAnimation(): void {
    if (!this.anim) return;
    this.anim.view = null;
    if (!this.anim.az) this.anim = null;
  }

  /**
   * Start (replace) the animation. The azimuth channel always heads for the current
   * rotTarget; the view channel heads for `toView`, or - when only a rotation was
   * requested - keeps going to the destination of a flight already in progress.
   */
  private begin(toView: ViewTarget | undefined, duration: number): void {
    const dest = toView ?? this.anim?.view?.to;
    const from: ViewTarget = { x: this.x, z: this.z, zoom: this.zoom };
    const view =
      dest && (dest.x !== from.x || dest.z !== from.z || dest.zoom !== from.zoom)
        ? { from, to: dest }
        : null;
    const azTo = azimuthFor(this.rotTarget);
    const az = this.azimuth !== azTo ? { from: this.azimuth, to: azTo } : null;
    if (!view && !az) {
      this.anim = null;
      return;
    }
    const token = ++this.seq;
    this.anim = { token, start: this.now(), duration, view, az };
    this.schedule(() => this.frame(token));
  }

  private frame(token: number): void {
    const a = this.anim;
    if (!a || a.token !== token) return; // cancelled or replaced
    const raw = (this.now() - a.start) / a.duration;
    const t = raw >= 1 ? 1 : Math.max(0, raw);
    const e = easeInOutCubic(t);
    if (a.view) {
      const v = interpolateView(a.view.from, a.view.to, e);
      this.x = v.x;
      this.z = v.z;
      this.zoom = v.zoom;
    }
    if (a.az) this.azimuth = e >= 1 ? a.az.to : a.az.from + (a.az.to - a.az.from) * e;
    if (t >= 1) this.anim = null;
    this.commit();
    if (this.anim) this.schedule(() => this.frame(token));
  }
}

/** Signed quarter turns (-1, 0, 1 or 2) that take rotation `from` to `to`, both in 0..3. */
function shortestTurn(from: number, to: number): number {
  const diff = (((to - from) % 4) + 4) % 4;
  return diff === 3 ? -1 : diff;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `cd viewer && npm test && npx tsc --noEmit`
Expected: `viewRig.test.ts` **45** passed; **217** in total; `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add viewer/src/viewRig.ts viewer/src/viewRig.test.ts
git commit -m "feat(viewer): camera rig with rotation, clamping, and animated fly-to"
```

---

### Task 5: Search ranking and the places list

**Files:**
- Create: `viewer/src/search.ts`, `viewer/src/search.test.ts`, `viewer/src/placesList.ts`, `viewer/src/placesList.test.ts`

- [ ] **Step 1: Write the failing tests**

`viewer/src/search.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSearchIndex, normalize, search, searchMetaLabel, type SearchItem } from "./search";

const it_ = (id: string, name: string, group: SearchItem["group"] = "landmark", kind = "other"): SearchItem => ({
  id,
  name,
  group,
  kind,
  x: 0,
  z: 0,
});
const names = (r: SearchItem[]) => r.map((i) => i.name);

describe("normalize", () => {
  it("lowercases, strips diacritics and punctuation, collapses whitespace", () => {
    expect(normalize("  St. Mary's   Square ")).toBe("st marys square");
    expect(normalize("Cañada Café")).toBe("canada cafe");
    expect(normalize("Mission-Creek / Channel")).toBe("mission creek channel");
    expect(normalize("O’Farrell")).toBe("ofarrell");
    expect(normalize("...")).toBe("");
  });
});

describe("search ranking", () => {
  const index = buildSearchIndex([
    it_("1", "Mission Dolores"),
    it_("2", "Mission", "street"),
    it_("3", "Old Mission Road", "street"),
    it_("4", "Commission Hall"),
    it_("5", "Mission Creek", "hotspot", "creek"),
  ]);

  it("ranks exact > prefix > word prefix > substring", () => {
    const r = search(index, "mission");
    expect(names(r)).toEqual(["Mission", "Mission Creek", "Mission Dolores", "Old Mission Road", "Commission Hall"]);
  });

  it("breaks prefix ties by group (hotspot, landmark, street), then shorter, then alphabetical", () => {
    const idx = buildSearchIndex([
      it_("a", "Lake Merced Blvd", "street"),
      it_("b", "Lake Merced", "landmark"),
      it_("c", "Lake Merced Vista", "hotspot", "lake"),
      it_("d", "Lake Mead", "landmark"),
      it_("e", "Lake Maxwell", "landmark"),
    ]);
    expect(names(search(idx, "lake m"))).toEqual([
      "Lake Merced Vista", // hotspot first
      "Lake Mead", // then landmarks: shorter names first
      "Lake Merced",
      "Lake Maxwell",
      "Lake Merced Blvd", // street last
    ]);
  });

  it("falls back to alphabetical order and then id", () => {
    const idx = buildSearchIndex([it_("2", "Bb"), it_("1", "Ba"), it_("3", "Bc")]);
    expect(names(search(idx, "b"))).toEqual([]); // too short
    expect(names(search(idx, "ba"))).toEqual(["Ba"]);
    const same = buildSearchIndex([it_("z", "Fort A"), it_("y", "Fort B")]);
    expect(names(search(same, "fort"))).toEqual(["Fort A", "Fort B"]);
  });

  it("matches words inside a name only at word starts for tier 2", () => {
    const idx = buildSearchIndex([it_("1", "Golden Gate Park"), it_("2", "Gatehouse Lane", "street")]);
    // "gate": word prefix of Golden Gate Park (tier 2) vs name prefix Gatehouse (tier 1)
    expect(names(search(idx, "gate"))).toEqual(["Gatehouse Lane", "Golden Gate Park"]);
  });

  it("handles multi-word queries and punctuation in the query", () => {
    expect(names(search(index, "mission  creek"))).toEqual(["Mission Creek"]);
    expect(names(search(index, "MISSION-CREEK!"))).toEqual(["Mission Creek"]);
    expect(names(search(index, "old mission"))).toEqual(["Old Mission Road"]);
  });
});

describe("search matching rules", () => {
  it("ignores case and diacritics on both sides", () => {
    const idx = buildSearchIndex([it_("1", "Cañada Hill")]);
    expect(names(search(idx, "CANADA"))).toEqual(["Cañada Hill"]);
    expect(names(search(idx, "cañada"))).toEqual(["Cañada Hill"]);
  });

  it("returns [] for empty, short or punctuation-only queries", () => {
    const idx = buildSearchIndex([it_("1", "A Place")]);
    expect(search(idx, "")).toEqual([]);
    expect(search(idx, "a")).toEqual([]);
    expect(search(idx, " a ")).toEqual([]);
    expect(search(idx, "...")).toEqual([]);
    expect(names(search(idx, "pl"))).toEqual(["A Place"]);
  });

  it("returns [] for no match and for an empty index", () => {
    expect(search(buildSearchIndex([it_("1", "Alpha")]), "zzz")).toEqual([]);
    expect(search(buildSearchIndex([]), "alpha")).toEqual([]);
  });

  it("respects the limit (default 8)", () => {
    const many = Array.from({ length: 20 }, (_, i) => it_(`i${i}`, `Street ${String(i).padStart(2, "0")}`, "street"));
    const idx = buildSearchIndex(many);
    expect(search(idx, "street")).toHaveLength(8);
    expect(search(idx, "street", 3)).toHaveLength(3);
    expect(search(idx, "street", 0)).toEqual([]);
    expect(search(idx, "street", 100)).toHaveLength(20);
    expect(names(search(idx, "street", 3))).toEqual(["Street 00", "Street 01", "Street 02"]);
  });
});

describe("buildSearchIndex dedupe", () => {
  it("keeps one item per normalised name", () => {
    const idx = buildSearchIndex([
      it_("s1", "Market St", "street"),
      it_("s2", "market  st.", "street"),
      it_("s3", "MARKET ST", "street"),
    ]);
    expect(search(idx, "market")).toHaveLength(1);
    expect(search(idx, "market")[0].id).toBe("s1");
  });

  it("prefers the higher group when names collide across groups", () => {
    const idx = buildSearchIndex([
      it_("s", "Lobos Creek", "street"),
      it_("h", "Lobos Creek", "hotspot", "creek"),
      it_("l", "Lobos Creek", "landmark"),
    ]);
    const r = search(idx, "lobos");
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("h");
  });

  it("skips items without a usable name", () => {
    const idx = buildSearchIndex([it_("1", ""), it_("2", "..."), it_("3", "Real")]);
    expect(idx.entries).toHaveLength(1);
  });
});

describe("searchMetaLabel", () => {
  it("shows group and kind", () => {
    expect(searchMetaLabel(it_("1", "x", "hotspot", "creek"))).toBe("Hotspot · creek");
    expect(searchMetaLabel(it_("1", "x", "landmark", "park"))).toBe("Landmark · park");
    expect(searchMetaLabel(it_("1", "x", "street", "primary"))).toBe("Street");
  });
});
```

`viewer/src/placesList.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupPlaces, layerAnnouncement, selectedAnnouncement } from "./placesList";

const h = (id: string, name: string, kind = "creek") => ({ id, name, kind });

describe("groupPlaces", () => {
  it("groups hotspots then landmarks, each sorted by name", () => {
    const groups = groupPlaces(
      [h("h2", "Lobos Creek"), h("h1", "Mission Creek"), h("h3", "laguna Dolores")],
      [h("l2", "Twin Peaks", "hill"), h("l1", "Alcatraz", "other")],
    );
    expect(groups.map((g) => g.title)).toEqual(["Hotspots", "Landmarks"]);
    expect(groups[0].items.map((i) => i.name)).toEqual(["laguna Dolores", "Lobos Creek", "Mission Creek"]);
    expect(groups[1].items.map((i) => i.name)).toEqual(["Alcatraz", "Twin Peaks"]);
  });

  it("keeps ids and kinds, and breaks name ties by id", () => {
    const [g] = groupPlaces([h("b", "Same"), h("a", "Same", "marsh")], []);
    expect(g.items).toEqual([
      { id: "a", name: "Same", kind: "marsh" },
      { id: "b", name: "Same", kind: "creek" },
    ]);
  });

  it("leaves out empty groups, blank names and duplicate ids", () => {
    expect(groupPlaces([], [])).toEqual([]);
    const groups = groupPlaces([h("a", "  "), h("b", "Real"), h("b", "Real again")], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual(["b"]);
    expect(groupPlaces([], [h("l", "Hill", "hill")]).map((g) => g.title)).toEqual(["Landmarks"]);
  });

  it("sorts numbers naturally and ignores accents' case", () => {
    const [g] = groupPlaces([h("a", "Spring 10"), h("b", "Spring 2"), h("c", "Élan")], []);
    expect(g.items.map((i) => i.name)).toEqual(["Élan", "Spring 2", "Spring 10"]);
  });

  it("does not modify its input", () => {
    const input = [h("b", "B"), h("a", "A")];
    groupPlaces(input, []);
    expect(input.map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("announcements", () => {
  it("formats selection and layer messages", () => {
    expect(selectedAnnouncement("Lobos Creek")).toBe("Selected: Lobos Creek");
    expect(layerAnnouncement("Streets", true)).toBe("Streets on");
    expect(layerAnnouncement("Water motion", false)).toBe("Water motion off");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd viewer && npx vitest run src/search.test.ts src/placesList.test.ts`
Expected: FAIL: cannot find the modules.

- [ ] **Step 3: Create the modules**

`viewer/src/search.ts`:

```ts
/** Local search over place names. Pure: no DOM. */

export type SearchGroup = "hotspot" | "landmark" | "street";

export interface SearchItem {
  id: string;
  name: string;
  group: SearchGroup;
  kind: string;
  x: number;
  z: number;
}

interface Entry {
  item: SearchItem;
  norm: string;
}

export interface SearchIndex {
  entries: Entry[];
}

export const MIN_QUERY_CHARS = 2;
const GROUP_WEIGHT: Record<SearchGroup, number> = { hotspot: 0, landmark: 1, street: 2 };

/**
 * Lowercase, strip diacritics, drop apostrophes, turn every other run of punctuation and
 * whitespace into one space, trim. "St. Mary's  Square" -> "st marys square".
 */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function weight(group: SearchGroup): number {
  return Object.hasOwn(GROUP_WEIGHT, group) ? GROUP_WEIGHT[group] : 9;
}

/**
 * Index the items. Items whose normalised names are equal collapse to one: the best group
 * (hotspot, landmark, street) wins, then the first in input order. Items with an empty
 * normalised name are skipped.
 */
export function buildSearchIndex(items: readonly SearchItem[]): SearchIndex {
  const best = new Map<string, Entry>();
  for (const item of items) {
    const norm = normalize(item.name);
    if (norm === "") continue;
    const have = best.get(norm);
    if (!have || weight(item.group) < weight(have.item.group)) best.set(norm, { item, norm });
  }
  return { entries: [...best.values()] };
}

/** 0 exact, 1 name prefix, 2 word prefix, 3 substring, or -1 for no match. */
function tier(norm: string, q: string): number {
  if (norm === q) return 0;
  if (norm.startsWith(q)) return 1;
  if (norm.includes(` ${q}`)) return 2;
  if (norm.includes(q)) return 3;
  return -1;
}

/**
 * Best matches for a query, at most `limit`. Rank: exact name, name prefix, word prefix,
 * substring; ties go to hotspots, then landmarks, then streets, then the shorter name,
 * then alphabetical order (then id). A query shorter than 2 characters finds nothing.
 */
export function search(index: SearchIndex, query: string, limit = 8): SearchItem[] {
  const q = normalize(query);
  if (q.length < MIN_QUERY_CHARS || !(limit > 0)) return [];
  const hits: Array<{ e: Entry; t: number }> = [];
  for (const e of index.entries) {
    const t = tier(e.norm, q);
    if (t >= 0) hits.push({ e, t });
  }
  hits.sort(
    (a, b) =>
      a.t - b.t ||
      weight(a.e.item.group) - weight(b.e.item.group) ||
      a.e.norm.length - b.e.norm.length ||
      (a.e.norm < b.e.norm ? -1 : a.e.norm > b.e.norm ? 1 : 0) ||
      (a.e.item.id < b.e.item.id ? -1 : a.e.item.id > b.e.item.id ? 1 : 0),
  );
  return hits.slice(0, Math.floor(limit)).map((h) => h.e.item);
}

const GROUP_LABEL: Record<SearchGroup, string> = {
  hotspot: "Hotspot",
  landmark: "Landmark",
  street: "Street",
};

/** Small secondary label for a result: "Hotspot · creek", "Landmark · park", "Street". */
export function searchMetaLabel(item: SearchItem): string {
  const group = Object.hasOwn(GROUP_LABEL, item.group) ? GROUP_LABEL[item.group] : item.group;
  return item.group === "street" || !item.kind ? group : `${group} · ${item.kind}`;
}
```

`viewer/src/placesList.ts`:

```ts
/** Pure data for the Places panel: every hotspot and landmark, grouped and sorted by name. */

export interface PlaceEntry {
  id: string;
  name: string;
  /** Hotspot or landmark kind, e.g. "creek" or "hill". */
  kind: string;
}

export interface PlaceGroup {
  title: "Hotspots" | "Landmarks";
  items: PlaceEntry[];
}

const compare = (a: PlaceEntry, b: PlaceEntry) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function clean(list: ReadonlyArray<PlaceEntry>): PlaceEntry[] {
  const seen = new Set<string>();
  const out: PlaceEntry[] = [];
  for (const p of list) {
    if (!p.name.trim() || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ id: p.id, name: p.name, kind: p.kind });
  }
  return out.sort(compare);
}

/** Hotspots first, then landmarks; a group with no entries is left out. */
export function groupPlaces(
  hotspots: ReadonlyArray<PlaceEntry>,
  landmarks: ReadonlyArray<PlaceEntry>,
): PlaceGroup[] {
  const groups: PlaceGroup[] = [
    { title: "Hotspots", items: clean(hotspots) },
    { title: "Landmarks", items: clean(landmarks) },
  ];
  return groups.filter((g) => g.items.length > 0);
}

/** The screen-reader announcement when a place is selected. */
export function selectedAnnouncement(name: string): string {
  return `Selected: ${name}`;
}

/** The announcement for a layer toggle, e.g. "Streets on". */
export function layerAnnouncement(label: string, on: boolean): string {
  return `${label} ${on ? "on" : "off"}`;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `cd viewer && npm test && npx tsc --noEmit`
Expected: 14 + 6 = **20** new tests, **237** in total; `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add viewer/src/search.ts viewer/src/search.test.ts viewer/src/placesList.ts viewer/src/placesList.test.ts
git commit -m "feat(viewer): local search ranking and the places list"
```

---

### Task 6: Overlay data, draping, streets and labels

`heightmap.ts` gains two optional meta fields (`overlay_file`, `processing`). The overlay is validated strictly on load (with caps), draped onto the terrain by sampling heights, drawn as three line layers by street kind, and labelled with HTML elements that are decluttered each frame.

**Files:**
- Modify: `viewer/src/heightmap.ts`
- Create: `viewer/src/overlay/types.ts`, `parse.ts`, `heightAt.ts`, `drape.ts`, `streetsLayer.ts`, `labels.ts`, `searchItems.ts` and a `*.test.ts` for each (types has none)

- [ ] **Step 1: Write the failing tests**

`viewer/src/overlay/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_STREETS,
  MAX_STREET_POINTS,
  loadOverlay,
  parseOverlay,
} from "./parse";

const street = (over: Record<string, unknown> = {}) => ({
  name: "Market St",
  kind: "primary",
  lines: [[0, 0, 10, 10]],
  ...over,
});
const landmark = (over: Record<string, unknown> = {}) => ({
  id: "twin-peaks",
  name: "Twin Peaks",
  kind: "hill",
  x: 1,
  z: 2,
  lon: -122.44,
  lat: 37.75,
  ...over,
});
const hotspot = (over: Record<string, unknown> = {}) => ({
  id: "mission-creek",
  name: "Mission Creek",
  kind: "creek",
  x: 1,
  z: 2,
  lon: -122.4,
  lat: 37.77,
  description: "A tidal creek that drained into the bay near here.",
  sources: [{ title: "Hidden Nature SF", url: "https://hidden-nature.org/" }],
  confidence: "documented",
  ...over,
});
const doc = (over: Record<string, unknown> = {}) => ({
  version: 1,
  streets: [street()],
  landmarks: [landmark()],
  hotspots: [hotspot()],
  ...over,
});

describe("parseOverlay: valid input", () => {
  it("accepts a complete document and returns a clean copy", () => {
    const raw = doc({ extra: "ignored" });
    (raw.streets[0] as Record<string, unknown>).junk = 1;
    const o = parseOverlay(raw);
    expect(o.version).toBe(1);
    expect(o.streets).toEqual([street()]);
    expect(o.landmarks).toEqual([landmark()]);
    expect(o.hotspots).toEqual([hotspot()]);
    expect(o).not.toHaveProperty("extra");
    expect(o.streets[0]).not.toHaveProperty("junk");
    expect(o.streets[0].lines[0]).not.toBe((raw.streets[0] as { lines: number[][] }).lines[0]);
  });

  it("accepts empty sections and every allowed kind / confidence", () => {
    expect(parseOverlay(doc({ streets: [], landmarks: [], hotspots: [] })).streets).toEqual([]);
    for (const kind of ["primary", "secondary", "local"]) parseOverlay(doc({ streets: [street({ kind })] }));
    for (const kind of ["park", "bridge", "hill", "building", "neighborhood", "beach", "water", "fort", "other"]) {
      parseOverlay(doc({ landmarks: [landmark({ kind })] }));
    }
    for (const kind of ["creek", "lagoon", "marsh", "dune", "hill", "shoreline", "bay", "lake", "valley", "other"]) {
      parseOverlay(doc({ hotspots: [hotspot({ kind })] }));
    }
    for (const confidence of ["documented", "inferred", "illustrative"]) {
      parseOverlay(doc({ hotspots: [hotspot({ confidence })] }));
    }
  });

  it("accepts http and https source urls, negative and fractional coordinates", () => {
    const o = parseOverlay(
      doc({
        landmarks: [landmark({ x: -1234.5, z: 0.25 })],
        hotspots: [hotspot({ sources: [{ title: "a", url: "http://example.org/x" }, { title: "b", url: "https://example.org/y?z=1" }] })],
      }),
    );
    expect(o.landmarks[0].x).toBe(-1234.5);
    expect(o.hotspots[0].sources).toHaveLength(2);
  });
});

describe("parseOverlay: top level", () => {
  it("rejects non-objects", () => {
    for (const bad of [null, undefined, 5, "x", [], true]) {
      expect(() => parseOverlay(bad)).toThrow(/JSON object/);
    }
  });

  it("rejects a wrong or missing version", () => {
    expect(() => parseOverlay(doc({ version: 2 }))).toThrow(/version 2/);
    expect(() => parseOverlay(doc({ version: "1" }))).toThrow(/version "1"/);
    const { version: _v, ...rest } = doc();
    void _v;
    expect(() => parseOverlay(rest)).toThrow(/version/);
  });

  it("rejects non-array or missing sections, naming the section", () => {
    expect(() => parseOverlay(doc({ streets: {} }))).toThrow(/streets: must be an array/);
    expect(() => parseOverlay(doc({ landmarks: "no" }))).toThrow(/landmarks: must be an array/);
    expect(() => parseOverlay(doc({ hotspots: undefined }))).toThrow(/hotspots: must be an array/);
  });
});

describe("parseOverlay: streets", () => {
  it("names the street index and name in errors", () => {
    expect(() => parseOverlay(doc({ streets: [street(), street({ name: "Bad St", kind: "highway" })] }))).toThrow(
      /streets\[1\] \("Bad St"\).*kind "highway"/,
    );
  });

  it("rejects non-object entries and blank names", () => {
    expect(() => parseOverlay(doc({ streets: [5] }))).toThrow(/streets\[0\]: must be an object/);
    expect(() => parseOverlay(doc({ streets: [street({ name: "  " })] }))).toThrow(/name must be a non-empty/);
    expect(() => parseOverlay(doc({ streets: [street({ name: "x".repeat(121) })] }))).toThrow(/longer than/);
  });

  it("rejects lines that are not arrays, odd, or shorter than two points", () => {
    expect(() => parseOverlay(doc({ streets: [street({ lines: "x" })] }))).toThrow(/lines must be an array/);
    expect(() => parseOverlay(doc({ streets: [street({ lines: [5] })] }))).toThrow(/line 0.*array of numbers/);
    expect(() => parseOverlay(doc({ streets: [street({ lines: [[0, 0, 1, 1, 2]] })] }))).toThrow(/odd number of values \(5\)/);
    expect(() => parseOverlay(doc({ streets: [street({ lines: [[0, 0]] })] }))).toThrow(/at least 2 points/);
    expect(() => parseOverlay(doc({ streets: [street({ lines: [[0, 0, 1, 1], []] })] }))).toThrow(/line 1.*at least 2 points/);
  });

  it("rejects non-finite or non-number values", () => {
    for (const bad of [NaN, Infinity, -Infinity, "3", null]) {
      expect(() => parseOverlay(doc({ streets: [street({ lines: [[0, 0, bad, 1]] })] }))).toThrow(/value 2 is not a finite number/);
    }
  });

  it("allows a street with no lines", () => {
    expect(parseOverlay(doc({ streets: [street({ lines: [] })] })).streets[0].lines).toEqual([]);
  });

  it("caps the number of streets", () => {
    const many = Array.from({ length: MAX_STREETS + 1 }, () => street());
    expect(() => parseOverlay(doc({ streets: many }))).toThrow(/more than the limit of 6000/);
    expect(parseOverlay(doc({ streets: many.slice(0, MAX_STREETS) })).streets).toHaveLength(MAX_STREETS);
  });

  it("caps the total number of street points", () => {
    const line = new Array<number>(2 * (MAX_STREET_POINTS / 2)).fill(1);
    const ok = doc({ streets: [street({ lines: [line, line] })] });
    expect(parseOverlay(ok).streets[0].lines).toHaveLength(2);
    const over = doc({ streets: [street({ lines: [line, line, [0, 0, 1, 1]] })] });
    expect(() => parseOverlay(over)).toThrow(/more than 400000 points/);
  });
});

describe("parseOverlay: ids", () => {
  it("rejects bad landmark and hotspot ids", () => {
    for (const id of ["Twin Peaks", "-x", "a_b", "", "UPPER", "a/b", 5, null, undefined]) {
      expect(() => parseOverlay(doc({ landmarks: [landmark({ id })] }))).toThrow(/landmarks\[0\]: id/);
      expect(() => parseOverlay(doc({ hotspots: [hotspot({ id })] }))).toThrow(/hotspots\[0\]: id/);
    }
  });

  it("rejects duplicates within a section but allows the same id across sections", () => {
    expect(() => parseOverlay(doc({ landmarks: [landmark(), landmark({ name: "Again" })] }))).toThrow(
      /landmarks\[1\]: duplicate id "twin-peaks"/,
    );
    expect(() => parseOverlay(doc({ hotspots: [hotspot(), hotspot()] }))).toThrow(/hotspots\[1\]: duplicate id/);
    expect(() => parseOverlay(doc({ landmarks: [landmark({ id: "same" })], hotspots: [hotspot({ id: "same" })] }))).not.toThrow();
  });

  it("includes the id in later errors", () => {
    expect(() => parseOverlay(doc({ landmarks: [landmark({ x: NaN })] }))).toThrow(/landmarks\[0\] \(twin-peaks\): x must be a finite/);
    expect(() => parseOverlay(doc({ landmarks: [landmark({ kind: "mountain" })] }))).toThrow(/\(twin-peaks\).*kind "mountain"/);
    for (const f of ["z", "lon", "lat"]) {
      expect(() => parseOverlay(doc({ landmarks: [landmark({ [f]: "1" })] }))).toThrow(new RegExp(`${f} must be a finite`));
      expect(() => parseOverlay(doc({ hotspots: [hotspot({ [f]: Infinity })] }))).toThrow(new RegExp(`${f} must be a finite`));
    }
  });
});

describe("parseOverlay: hotspots", () => {
  it("enforces the description length 20..400", () => {
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ description: "x".repeat(19) })] }))).toThrow(/20 to 400 characters \(got 19\)/);
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ description: "x".repeat(401) })] }))).toThrow(/got 401/);
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ description: 5 })] }))).toThrow(/not a string/);
    parseOverlay(doc({ hotspots: [hotspot({ description: "x".repeat(20) })] }));
    parseOverlay(doc({ hotspots: [hotspot({ description: "x".repeat(400) })] }));
  });

  it("requires a non-empty sources array", () => {
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ sources: [] })] }))).toThrow(/sources must be a non-empty array/);
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ sources: "x" })] }))).toThrow(/sources must be a non-empty array/);
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ sources: undefined })] }))).toThrow(/sources/);
  });

  it("rejects blank titles and non-http(s) or malformed urls", () => {
    const src = (s: unknown) => doc({ hotspots: [hotspot({ sources: [s] })] });
    expect(() => parseOverlay(src({ title: " ", url: "https://a.org" }))).toThrow(/source 0.*title must not be blank/);
    expect(() => parseOverlay(src({ title: 5, url: "https://a.org" }))).toThrow(/title/);
    expect(() => parseOverlay(src({ title: "t", url: "javascript:alert(1)" }))).toThrow(/must be http or https, got javascript:/);
    expect(() => parseOverlay(src({ title: "t", url: "data:text/html,hi" }))).toThrow(/http or https/);
    expect(() => parseOverlay(src({ title: "t", url: "ftp://a.org/x" }))).toThrow(/http or https/);
    expect(() => parseOverlay(src({ title: "t", url: "not a url" }))).toThrow(/not a valid URL/);
    expect(() => parseOverlay(src({ title: "t", url: 5 }))).toThrow(/url must be a string/);
    expect(() => parseOverlay(src(null))).toThrow(/must be an object/);
  });

  it("rejects an unknown confidence", () => {
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ confidence: "certain" })] }))).toThrow(/confidence "certain"/);
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ confidence: undefined })] }))).toThrow(/confidence/);
  });

  it("rejects an unknown hotspot kind", () => {
    expect(() => parseOverlay(doc({ hotspots: [hotspot({ kind: "volcano" })] }))).toThrow(/kind "volcano"/);
  });
});

describe("loadOverlay", () => {
  const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });

  it("returns null when the dataset has no overlay_file (and does not fetch)", async () => {
    let called = false;
    const f = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };
    expect(await loadOverlay("/assets/x", {}, f)).toBeNull();
    expect(await loadOverlay("/assets/x", { overlay_file: "" }, f)).toBeNull();
    expect(called).toBe(false);
  });

  it("fetches base/file and parses it", async () => {
    let seen = "";
    const o = await loadOverlay("/assets/x", { overlay_file: "overlay.json" }, async (u) => {
      seen = u;
      return { ok: true, status: 200, json: async () => doc() };
    });
    expect(seen).toBe("/assets/x/overlay.json");
    expect(o?.hotspots[0].id).toBe("mission-creek");
  });

  it("reports the URL and status of a failed request", async () => {
    await expect(
      loadOverlay("/a", { overlay_file: "overlay.json" }, async () => ({ ok: false, status: 404, json: async () => ({}) })),
    ).rejects.toThrow("failed to fetch /a/overlay.json: HTTP 404");
  });

  it("reports the URL for invalid JSON and for invalid content", async () => {
    await expect(
      loadOverlay("/a", { overlay_file: "overlay.json" }, async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      })),
    ).rejects.toThrow(/\/a\/overlay\.json: not valid JSON/);
    await expect(loadOverlay("/a", { overlay_file: "overlay.json" }, ok({ version: 9 }))).rejects.toThrow(
      /\/a\/overlay\.json: overlay: unsupported version 9/,
    );
  });

  it("refuses file names that could leave the dataset folder", async () => {
    for (const f of ["../x.json", "a/b.json", "/etc/passwd", "..", "a..b/c", "https://evil.example/x.json"]) {
      await expect(loadOverlay("/a", { overlay_file: f }, ok(doc()))).rejects.toThrow(/unsupported overlay_file/);
    }
  });
});

// The generated synthetic dataset (npm run make:overlay-synth) must satisfy the parser.
// import.meta.glob finds nothing when the file has not been generated, and the test is skipped.
const synth = Object.values(
  import.meta.glob("../../public/assets/city-synth/overlay.json", { eager: true, import: "default" }),
);
describe.skipIf(synth.length === 0)("synthetic overlay file", () => {
  it("parses", () => {
    const o = parseOverlay(synth[0]);
    expect(o.hotspots.map((h) => h.name)).toEqual([
      "Synthetic test hotspot A",
      "Synthetic test hotspot B",
      "Synthetic test hotspot C",
    ]);
    expect(o.hotspots.every((h) => h.confidence === "illustrative")).toBe(true);
    expect(o.landmarks).toHaveLength(6);
    expect(new Set(o.streets.map((s) => s.kind))).toEqual(new Set(["primary", "secondary", "local"]));
  });
});
```

`viewer/src/overlay/heightAt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeHeightSampler } from "./heightAt";

// 3 columns x 2 rows, 10 m cells. Columns at x = -10, 0, 10; rows at z = -5, 5 (row 0 = north).
//   row 0:  0  10  20
//   row 1: 30  40  50
const heights = new Float32Array([0, 10, 20, 30, 40, 50]);
const size = { width: 3, height: 2, cell_m: 10 };
const h = makeHeightSampler(heights, size);

describe("makeHeightSampler", () => {
  it("is exact at cell centres", () => {
    expect(h(-10, -5)).toBeCloseTo(0);
    expect(h(0, -5)).toBeCloseTo(10);
    expect(h(10, -5)).toBeCloseTo(20);
    expect(h(-10, 5)).toBeCloseTo(30);
    expect(h(0, 5)).toBeCloseTo(40);
    expect(h(10, 5)).toBeCloseTo(50);
  });

  it("is linear between samples", () => {
    expect(h(-5, -5)).toBeCloseTo(5); // halfway along the north row
    expect(h(5, 5)).toBeCloseTo(45);
    expect(h(-10, 0)).toBeCloseTo(15); // halfway between rows at the west column
    expect(h(0, 0)).toBeCloseTo(25);
    expect(h(2.5, -5)).toBeCloseTo(12.5);
    // bilinear at the middle of the first cell: mean of 0, 10, 30, 40
    expect(h(-5, 0)).toBeCloseTo(20);
  });

  it("clamps outside the grid to the nearest edge", () => {
    expect(h(-1000, -1000)).toBeCloseTo(0);
    expect(h(1000, 1000)).toBeCloseTo(50);
    expect(h(1000, -1000)).toBeCloseTo(20);
    expect(h(-1000, 1000)).toBeCloseTo(30);
    expect(h(0, -1000)).toBeCloseTo(10); // clamps z, keeps x
    expect(h(1000, 0)).toBeCloseTo(35); // clamps x, interpolates z
  });

  it("puts north at -z and east at +x", () => {
    expect(h(0, -5)).toBeLessThan(h(0, 5)); // row 0 (north) is lower here
    expect(h(-10, 0)).toBeLessThan(h(10, 0));
  });

  it("handles non-finite input and one-sample axes", () => {
    expect(h(NaN, NaN)).toBeCloseTo(25);
    expect(Number.isFinite(h(Infinity, -Infinity))).toBe(true);
    const one = makeHeightSampler(new Float32Array([7]), { width: 1, height: 1, cell_m: 10 });
    expect(one(123, -456)).toBe(7);
    const row = makeHeightSampler(new Float32Array([0, 10]), { width: 2, height: 1, cell_m: 10 });
    expect(row(0, 99)).toBeCloseTo(5);
    const col = makeHeightSampler(new Float32Array([0, 10]), { width: 1, height: 2, cell_m: 10 });
    expect(col(99, 0)).toBeCloseTo(5);
  });

  it("matches the terrain vertex frame: grid centre is the origin", () => {
    const sq = makeHeightSampler(new Float32Array([1, 2, 3, 4]), { width: 2, height: 2, cell_m: 100 });
    expect(sq(-50, -50)).toBeCloseTo(1);
    expect(sq(50, -50)).toBeCloseTo(2);
    expect(sq(-50, 50)).toBeCloseTo(3);
    expect(sq(50, 50)).toBeCloseTo(4);
    expect(sq(0, 0)).toBeCloseTo(2.5);
  });

  it("rejects a mismatched array", () => {
    expect(() => makeHeightSampler(new Float32Array(5), size)).toThrow(/expected 6/);
  });
});
```

`viewer/src/overlay/drape.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSegmentGeometry, drapePolyline } from "./drape";

const flat = () => 0;
const ramp = (x: number) => x / 10; // height grows 1 m per 10 m east

describe("drapePolyline", () => {
  it("keeps short segments as they are", () => {
    expect(drapePolyline([0, 0, 5, 0], ramp, 10)).toEqual([0, 0, 0, 5, 0.5, 0]);
  });

  it("subdivides so that no step exceeds stepM", () => {
    const out = drapePolyline([0, 0, 100, 0], flat, 30);
    // ceil(100 / 30) = 4 parts -> 5 points
    expect(out.length / 3).toBe(5);
    const xs = out.filter((_, i) => i % 3 === 0);
    expect(xs).toEqual([0, 25, 50, 75, 100]);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeLessThanOrEqual(30);
  });

  it("an exact multiple of the step does not add an extra point", () => {
    expect(drapePolyline([0, 0, 100, 0], flat, 50).length / 3).toBe(3);
    expect(drapePolyline([0, 0, 100, 0], flat, 100).length / 3).toBe(2);
  });

  it("measures the step horizontally on diagonals", () => {
    const out = drapePolyline([0, 0, 30, 40], flat, 10); // length 50 -> 5 parts
    expect(out.length / 3).toBe(6);
    expect(out.slice(3, 6)).toEqual([6, 0, 8]);
  });

  it("takes y from heightAt (un-exaggerated) and keeps original vertices exactly", () => {
    const out = drapePolyline([0, 0, 20, 0, 20, 20], ramp, 10);
    // points: (0,0) (10,0) (20,0) (20,10) (20,20)
    expect(out.length / 3).toBe(5);
    expect(out[1]).toBe(0);
    expect(out[4]).toBe(1);
    expect(out.slice(6, 9)).toEqual([20, 2, 0]);
    expect(out.slice(12, 15)).toEqual([20, 2, 20]);
  });

  it("handles degenerate input", () => {
    expect(drapePolyline([], flat, 10)).toEqual([]);
    expect(drapePolyline([3, 4], ramp, 10)).toEqual([3, 0.3, 4]);
    expect(drapePolyline([1, 1, 1, 1], flat, 10)).toEqual([1, 0, 1, 1, 0, 1]); // zero-length segment
    expect(drapePolyline([0, 0, 10, 0, 99], flat, 10).length / 3).toBe(2); // trailing value ignored
  });

  it("rejects a non-positive step", () => {
    expect(() => drapePolyline([0, 0, 1, 1], flat, 0)).toThrow(RangeError);
    expect(() => drapePolyline([0, 0, 1, 1], flat, -5)).toThrow(RangeError);
    expect(() => drapePolyline([0, 0, 1, 1], flat, NaN)).toThrow(RangeError);
  });
});

describe("buildSegmentGeometry", () => {
  const pos = (g: ReturnType<typeof buildSegmentGeometry>) =>
    Array.from(g.getAttribute("position").array as Float32Array);

  it("pairs consecutive points of every line", () => {
    const g = buildSegmentGeometry([[0, 0, 10, 0, 10, 10]], flat, 100, 1, 0);
    // 3 points -> 2 segments -> 4 vertices
    expect(g.getAttribute("position").count).toBe(4);
    expect(pos(g)).toEqual([0, 0, 0, 10, 0, 0, 10, 0, 0, 10, 0, 10]);
  });

  it("does not join separate lines", () => {
    const g = buildSegmentGeometry([[0, 0, 10, 0], [50, 0, 60, 0]], flat, 100, 1, 0);
    expect(g.getAttribute("position").count).toBe(4);
    expect(pos(g).slice(3, 9)).toEqual([10, 0, 0, 50, 0, 0]);
  });

  it("applies (height + lift) * exaggeration to y only", () => {
    const g = buildSegmentGeometry([[0, 0, 10, 0]], ramp, 100, 3, 4);
    expect(pos(g)).toEqual([0, 12, 0, 10, 15, 0]); // (0+4)*3, (1+4)*3
  });

  it("subdivides before pairing", () => {
    const g = buildSegmentGeometry([[0, 0, 100, 0]], flat, 25, 1, 0);
    expect(g.getAttribute("position").count).toBe(8); // 4 segments
  });

  it("returns an empty geometry for no input", () => {
    expect(buildSegmentGeometry([], flat, 10, 1, 0).getAttribute("position").count).toBe(0);
    expect(buildSegmentGeometry([[1, 1]], flat, 10, 1, 0).getAttribute("position").count).toBe(0);
    expect(buildSegmentGeometry([[]], flat, 10, 1, 0).getAttribute("position").count).toBe(0);
  });

  it("computes a bounding sphere that contains the line", () => {
    const g = buildSegmentGeometry([[0, 0, 100, 0]], flat, 50, 1, 0);
    expect(g.boundingSphere).not.toBeNull();
    expect(g.boundingSphere!.radius).toBeGreaterThanOrEqual(50);
  });
});
```

`viewer/src/overlay/streetsLayer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  STREET_COLOR,
  STREET_OPACITY,
  STREET_LIFT_M,
  STREET_STEP_M,
  STREET_THRESHOLDS,
  StreetsLayer,
  streetKindVisibility,
} from "./streetsLayer";

const t = { secondary: 2, local: 4 };

describe("streetKindVisibility", () => {
  it("always shows primary streets", () => {
    expect(streetKindVisibility(0.1, t).primary).toBe(true);
    expect(streetKindVisibility(Number.NaN, t).primary).toBe(true);
  });

  it("adds secondary then local as the zoom grows", () => {
    expect(streetKindVisibility(1.99, t)).toEqual({ primary: true, secondary: false, local: false });
    expect(streetKindVisibility(2, t)).toEqual({ primary: true, secondary: true, local: false });
    expect(streetKindVisibility(3.99, t)).toEqual({ primary: true, secondary: true, local: false });
    expect(streetKindVisibility(4, t)).toEqual({ primary: true, secondary: true, local: true });
    expect(streetKindVisibility(40, t)).toEqual({ primary: true, secondary: true, local: true });
  });

  it("treats a non-finite zoom as zoomed out", () => {
    expect(streetKindVisibility(Number.NaN, t)).toEqual({ primary: true, secondary: false, local: false });
  });
});

describe("named constants", () => {
  it("are exported for tuning", () => {
    expect(STREET_LIFT_M).toBe(4);
    expect(STREET_STEP_M).toBeGreaterThan(0);
    expect(STREET_THRESHOLDS.secondary).toBeLessThan(STREET_THRESHOLDS.local);
  });
});

describe("StreetsLayer", () => {
  const overlay = {
    streets: [
      { name: "A", kind: "primary" as const, lines: [[0, 0, 100, 0]] },
      { name: "B", kind: "secondary" as const, lines: [[0, 10, 100, 10]] },
      { name: "C", kind: "local" as const, lines: [[0, 20, 100, 20], [0, 30, 100, 30]] },
    ],
  };
  const make = () =>
    new StreetsLayer(overlay, () => 1, { exaggeration: 3, liftM: STREET_LIFT_M, stepM: 50, thresholds: t });
  const kids = (l: StreetsLayer) => Object.fromEntries(l.object.children.map((c) => [c.name, c.visible]));

  it("builds one LineSegments per kind with the documented material settings", () => {
    const l = make();
    expect(l.object.children).toHaveLength(3);
    const primary = l.object.children[0] as THREE.LineSegments;
    expect(primary).toBeInstanceOf(THREE.LineSegments);
    const m = primary.material as THREE.LineBasicMaterial;
    expect(m.color.getHex()).toBe(STREET_COLOR);
    expect(m.opacity).toBe(0.95);
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect(((l.object.children[1] as THREE.LineSegments).material as THREE.LineBasicMaterial).color.getHex()).toBe(STREET_COLOR);
    expect(((l.object.children[2] as THREE.LineSegments).material as THREE.LineBasicMaterial).opacity).toBe(STREET_OPACITY.local);
  });

  it("puts each street in its own kind's geometry, lifted and exaggerated", () => {
    const l = make();
    const counts = l.object.children.map((c) => (c as THREE.LineSegments).geometry.getAttribute("position").count);
    expect(counts).toEqual([4, 4, 8]); // 100 m at 50 m steps = 2 segments per line
    const pos = (l.object.children[0] as THREE.LineSegments).geometry.getAttribute("position");
    expect(pos.getY(0)).toBe((1 + STREET_LIFT_M) * 3);
  });

  it("update() shows kinds by zoom and reports changes", () => {
    const l = make();
    expect(l.update(1)).toBe(true);
    expect(kids(l)).toEqual({ "streets-primary": true, "streets-secondary": false, "streets-local": false });
    expect(l.update(1)).toBe(false);
    expect(l.update(3)).toBe(true);
    expect(kids(l)["streets-secondary"]).toBe(true);
    expect(l.update(3.5)).toBe(false); // new zoom, same visibility
    expect(l.update(5)).toBe(true);
    expect(kids(l)["streets-local"]).toBe(true);
    expect(l.update(1)).toBe(true);
    expect(kids(l)["streets-local"]).toBe(false);
  });

  it("setEnabled toggles the whole group without losing the per-kind state", () => {
    const l = make();
    l.update(5);
    l.setEnabled(false);
    expect(l.object.visible).toBe(false);
    expect(l.isEnabled()).toBe(false);
    l.setEnabled(true);
    expect(l.object.visible).toBe(true);
    expect(kids(l)["streets-local"]).toBe(true);
  });

  it("copes with an overlay without streets", () => {
    const l = new StreetsLayer({ streets: [] }, () => 0, { exaggeration: 1, liftM: 0, stepM: 10, thresholds: t });
    expect(() => l.update(10)).not.toThrow();
    expect((l.object.children[0] as THREE.LineSegments).geometry.getAttribute("position").count).toBe(0);
  });
});
```

`viewer/src/overlay/labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { declutter, landmarkPriority, projectToScreen, type DeclutterItem } from "./labels";

const item = (id: string, x: number, y: number, priority = 1, w = 50, h = 14): DeclutterItem => ({
  id,
  x,
  y,
  w,
  h,
  priority,
});

describe("projectToScreen", () => {
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -100, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  it("maps the view centre to the canvas centre", () => {
    const p = projectToScreen(new THREE.Vector3(0, 0, 0), camera, 800, 600);
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeCloseTo(300);
  });

  it("puts up at the top (y grows downwards) and right at the right", () => {
    const tr = projectToScreen(new THREE.Vector3(10, 10, 0), camera, 800, 600);
    expect(tr.x).toBeCloseTo(800);
    expect(tr.y).toBeCloseTo(0);
    const bl = projectToScreen(new THREE.Vector3(-10, -10, 0), camera, 800, 600);
    expect(bl.x).toBeCloseTo(0);
    expect(bl.y).toBeCloseTo(600);
  });

  it("follows the camera zoom and does not modify the input point", () => {
    const zoomed = camera.clone();
    zoomed.zoom = 2;
    zoomed.updateProjectionMatrix();
    zoomed.updateMatrixWorld();
    const pt = new THREE.Vector3(5, 0, 0);
    const p = projectToScreen(pt, zoomed, 200, 200);
    expect(p.x).toBeCloseTo(200); // 5 m at zoom 2 is the right edge
    expect(pt.toArray()).toEqual([5, 0, 0]);
  });

  it("returns points outside the viewport as out-of-range coordinates", () => {
    expect(projectToScreen(new THREE.Vector3(30, 0, 0), camera, 100, 100).x).toBeCloseTo(200);
  });
});

describe("declutter", () => {
  it("keeps everything that does not overlap", () => {
    const kept = declutter([item("a", 0, 0), item("b", 100, 0), item("c", 0, 100)], 4);
    expect([...kept].sort()).toEqual(["a", "b", "c"]);
  });

  it("drops the lower priority of two overlapping items", () => {
    const kept = declutter([item("low", 10, 0, 1), item("high", 0, 0, 5)], 4);
    expect([...kept]).toEqual(["high"]);
  });

  it("requires the padding between rectangles", () => {
    // a covers x 0..50; b starts at 52: 2 px gap
    expect(declutter([item("a", 0, 0, 2), item("b", 52, 0, 1)], 4).has("b")).toBe(false);
    expect(declutter([item("a", 0, 0, 2), item("b", 52, 0, 1)], 2).has("b")).toBe(true);
    expect(declutter([item("a", 0, 0, 2), item("b", 54, 0, 1)], 4).has("b")).toBe(true);
    // padding applies vertically too
    expect(declutter([item("a", 0, 0, 2), item("b", 0, 16, 1)], 4).has("b")).toBe(false);
    expect(declutter([item("a", 0, 0, 2), item("b", 0, 18, 1)], 4).has("b")).toBe(true);
  });

  it("breaks priority ties by id, whatever the input order", () => {
    const a = item("a", 0, 0, 3);
    const b = item("b", 5, 0, 3);
    expect([...declutter([a, b], 4)]).toEqual(["a"]);
    expect([...declutter([b, a], 4)]).toEqual(["a"]);
  });

  it("is greedy: a dropped item does not block others", () => {
    // b overlaps a (dropped), c overlaps b but not a: c survives
    const kept = declutter([item("a", 0, 0, 9), item("b", 40, 0, 5), item("c", 80, 0, 1)], 4);
    expect([...kept].sort()).toEqual(["a", "c"]);
  });

  it("is deterministic for identical input and handles empty input and duplicate ids", () => {
    expect(declutter([], 4).size).toBe(0);
    const input = Array.from({ length: 30 }, (_, i) => item(`i${i}`, (i * 13) % 90, (i * 7) % 40, i % 4));
    expect([...declutter(input, 4)]).toEqual([...declutter([...input].reverse(), 4)]);
    expect(declutter([item("x", 0, 0), item("x", 500, 0)], 4).size).toBe(1);
  });

  it("does not mutate its input", () => {
    const input = [item("b", 0, 0, 1), item("a", 0, 0, 2)];
    declutter(input, 4);
    expect(input.map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("landmarkPriority", () => {
  it("ranks kinds and defaults unknown ones", () => {
    expect(landmarkPriority("hill")).toBeGreaterThan(landmarkPriority("building"));
    expect(landmarkPriority("nonsense")).toBe(landmarkPriority("other"));
    expect(landmarkPriority("constructor")).toBe(landmarkPriority("other"));
  });
});
```

`viewer/src/overlay/searchItems.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { overlaySearchItems, polylineMidpoint, streetSearchItems } from "./searchItems";
import type { Overlay } from "./types";

describe("polylineMidpoint", () => {
  it("is the middle of a straight segment", () => {
    expect(polylineMidpoint([0, 0, 10, 0])).toEqual({ x: 5, z: 0 });
  });

  it("goes by arc length, not by vertex count", () => {
    // 90 m then 10 m: half-length 50 m lies on the first segment
    const m = polylineMidpoint([0, 0, 90, 0, 90, 10])!;
    expect(m.x).toBeCloseTo(50);
    expect(m.z).toBeCloseTo(0);
  });

  it("crosses into later segments", () => {
    const m = polylineMidpoint([0, 0, 10, 0, 10, 30])!;
    expect(m.x).toBeCloseTo(10);
    expect(m.z).toBeCloseTo(10 + 0); // total 40, half 20: 10 m up the second segment
  });

  it("copes with degenerate lines", () => {
    expect(polylineMidpoint([])).toBeNull();
    expect(polylineMidpoint([3, 4])).toEqual({ x: 3, z: 4 });
    expect(polylineMidpoint([3, 4, 3, 4])).toEqual({ x: 3, z: 4 });
  });
});

describe("streetSearchItems", () => {
  it("keeps one item per name, at the midpoint of its longest line", () => {
    const items = streetSearchItems([
      { name: "Market St", kind: "primary", lines: [[0, 0, 10, 0], [100, 100, 300, 100]] },
      { name: "market st", kind: "primary", lines: [[0, 500, 50, 500]] },
      { name: "Oak St", kind: "local", lines: [[0, 0, 0, 20]] },
    ]);
    expect(items.map((i) => i.name)).toEqual(["Market St", "Oak St"]);
    expect(items[0]).toMatchObject({ group: "street", kind: "primary", x: 200, z: 100 });
    expect(items[1]).toMatchObject({ x: 0, z: 10 });
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
  });

  it("skips streets without usable lines", () => {
    expect(streetSearchItems([{ name: "Empty", kind: "local", lines: [] }])).toEqual([]);
  });
});

describe("overlaySearchItems", () => {
  it("combines hotspots, landmarks and streets", () => {
    const overlay: Overlay = {
      version: 1,
      streets: [{ name: "Oak St", kind: "local", lines: [[0, 0, 0, 20]] }],
      landmarks: [{ id: "peak", name: "Peak", kind: "hill", x: 1, z: 2, lon: 0, lat: 0 }],
      hotspots: [
        {
          id: "creek",
          name: "Creek",
          kind: "creek",
          x: 3,
          z: 4,
          lon: 0,
          lat: 0,
          description: "d".repeat(25),
          sources: [{ title: "t", url: "https://a.org" }],
          confidence: "inferred",
        },
      ],
    };
    const items = overlaySearchItems(overlay);
    expect(items.map((i) => [i.group, i.id])).toEqual([
      ["hotspot", "creek"],
      ["landmark", "peak"],
      ["street", "street-0"],
    ]);
    expect(items[0]).toMatchObject({ x: 3, z: 4, kind: "creek" });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd viewer && npx vitest run src/overlay`
Expected: FAIL: cannot find the modules under test.

- [ ] **Step 3: Replace `viewer/src/heightmap.ts`** (adds `overlay_file?` and `processing?`; everything else is unchanged)

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
  /** File name of the overlay (streets, landmarks, hotspots) next to the heightmap. */
  overlay_file?: string;
  /** Pipeline parameters, shown on the Sources panel (see provenanceData.ts). */
  processing?: Record<string, unknown>;
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

- [ ] **Step 4: Create the overlay modules**

`viewer/src/overlay/types.ts`:

```ts
import type { Confidence } from "../heightmap";

export const STREET_KINDS = ["primary", "secondary", "local"] as const;
export type StreetKind = (typeof STREET_KINDS)[number];

export const LANDMARK_KINDS = [
  "park",
  "bridge",
  "hill",
  "building",
  "neighborhood",
  "beach",
  "water",
  "fort",
  "other",
] as const;
export type LandmarkKind = (typeof LANDMARK_KINDS)[number];

export const HOTSPOT_KINDS = [
  "creek",
  "lagoon",
  "marsh",
  "dune",
  "hill",
  "shoreline",
  "bay",
  "lake",
  "valley",
  "other",
] as const;
export type HotspotKind = (typeof HOTSPOT_KINDS)[number];

export const CONFIDENCES = ["documented", "inferred", "illustrative"] as const satisfies readonly Confidence[];

/** x, z are world metres in the viewer frame (+x east, +z south, origin at the grid centre). */
export interface Street {
  name: string;
  kind: StreetKind;
  /** Each line is a flat [x0, z0, x1, z1, ...] polyline. */
  lines: number[][];
}

export interface Landmark {
  id: string;
  name: string;
  kind: LandmarkKind;
  x: number;
  z: number;
  lon: number;
  lat: number;
}

export interface HotspotSource {
  title: string;
  url: string;
}

export interface Hotspot {
  id: string;
  name: string;
  kind: HotspotKind;
  x: number;
  z: number;
  lon: number;
  lat: number;
  description: string;
  sources: HotspotSource[];
  confidence: Confidence;
}

export interface Overlay {
  version: 1;
  streets: Street[];
  landmarks: Landmark[];
  hotspots: Hotspot[];
}
```

`viewer/src/overlay/parse.ts`:

```ts
import type { HeightmapMeta } from "../heightmap";
import {
  CONFIDENCES,
  HOTSPOT_KINDS,
  LANDMARK_KINDS,
  STREET_KINDS,
  type Hotspot,
  type HotspotSource,
  type Landmark,
  type Overlay,
  type Street,
} from "./types";

/** Protective caps: a hostile or broken file must not be able to exhaust memory. */
export const MAX_STREETS = 6000;
export const MAX_STREET_POINTS = 400_000;
export const MAX_PLACES = 5000;
export const MAX_NAME_CHARS = 120;
export const MAX_SOURCES = 20;
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 400;

const ID = /^[a-z0-9][a-z0-9-]*$/;

function fail(where: string, what: string): never {
  throw new Error(`overlay: ${where}: ${what}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function finite(v: unknown, where: string, field: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(where, `${field} must be a finite number`);
  return v;
}

function name(v: unknown, where: string): string {
  if (typeof v !== "string" || v.trim() === "") fail(where, "name must be a non-empty string");
  if (v.length > MAX_NAME_CHARS) fail(where, `name is longer than ${MAX_NAME_CHARS} characters`);
  return v;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], where: string, field: string): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    fail(where, `${field} ${JSON.stringify(v)} is not one of ${allowed.join(", ")}`);
  }
  return v as T;
}

function section(raw: Record<string, unknown>, key: string, max: number): unknown[] {
  const v = raw[key];
  if (!Array.isArray(v)) fail(key, "must be an array");
  if (v.length > max) fail(key, `has ${v.length} entries, more than the limit of ${max}`);
  return v;
}

function placeId(v: unknown, where: string, seen: Set<string>): string {
  if (typeof v !== "string" || !ID.test(v)) {
    fail(where, `id ${JSON.stringify(v)} must match ${ID.source}`);
  }
  if (seen.has(v)) fail(where, `duplicate id "${v}"`);
  seen.add(v);
  return v;
}

function parseStreets(raw: Record<string, unknown>): Street[] {
  const list = section(raw, "streets", MAX_STREETS);
  let points = 0;
  return list.map((s, i) => {
    const where = `streets[${i}]`;
    if (!isRecord(s)) fail(where, "must be an object");
    const label = typeof s.name === "string" ? `${where} ("${s.name.slice(0, 40)}")` : where;
    const streetName = name(s.name, label);
    const kind = oneOf(s.kind, STREET_KINDS, label, "kind");
    if (!Array.isArray(s.lines)) fail(label, "lines must be an array");
    const lines = s.lines.map((line: unknown, j: number) => {
      const lw = `${label} line ${j}`;
      if (!Array.isArray(line)) fail(lw, "must be an array of numbers");
      if (line.length % 2 !== 0) fail(lw, `has an odd number of values (${line.length})`);
      if (line.length < 4) fail(lw, `needs at least 2 points, has ${line.length / 2}`);
      points += line.length / 2;
      if (points > MAX_STREET_POINTS) {
        fail(label, `streets hold more than ${MAX_STREET_POINTS} points in total`);
      }
      const out = new Array<number>(line.length);
      for (let k = 0; k < line.length; k++) {
        const n: unknown = line[k];
        if (typeof n !== "number" || !Number.isFinite(n)) {
          fail(lw, `value ${k} is not a finite number`);
        }
        out[k] = n;
      }
      return out;
    });
    return { name: streetName, kind, lines };
  });
}

function parseLandmarks(raw: Record<string, unknown>): Landmark[] {
  const list = section(raw, "landmarks", MAX_PLACES);
  const seen = new Set<string>();
  return list.map((l, i) => {
    const where = `landmarks[${i}]`;
    if (!isRecord(l)) fail(where, "must be an object");
    const id = placeId(l.id, where, seen);
    const label = `${where} (${id})`;
    return {
      id,
      name: name(l.name, label),
      kind: oneOf(l.kind, LANDMARK_KINDS, label, "kind"),
      x: finite(l.x, label, "x"),
      z: finite(l.z, label, "z"),
      lon: finite(l.lon, label, "lon"),
      lat: finite(l.lat, label, "lat"),
    };
  });
}

function parseSources(v: unknown, label: string): HotspotSource[] {
  if (!Array.isArray(v) || v.length === 0) fail(label, "sources must be a non-empty array");
  if (v.length > MAX_SOURCES) fail(label, `has more than ${MAX_SOURCES} sources`);
  return v.map((s: unknown, k: number) => {
    const sw = `${label} source ${k}`;
    if (!isRecord(s)) fail(sw, "must be an object");
    if (typeof s.title !== "string" || s.title.trim() === "") fail(sw, "title must not be blank");
    if (typeof s.url !== "string") fail(sw, "url must be a string");
    let protocol = "";
    try {
      protocol = new URL(s.url).protocol;
    } catch {
      fail(sw, `url ${JSON.stringify(s.url.slice(0, 80))} is not a valid URL`);
    }
    if (protocol !== "http:" && protocol !== "https:") {
      fail(sw, `url must be http or https, got ${protocol}`);
    }
    return { title: s.title, url: s.url };
  });
}

function parseHotspots(raw: Record<string, unknown>): Hotspot[] {
  const list = section(raw, "hotspots", MAX_PLACES);
  const seen = new Set<string>();
  return list.map((h, i) => {
    const where = `hotspots[${i}]`;
    if (!isRecord(h)) fail(where, "must be an object");
    const id = placeId(h.id, where, seen);
    const label = `${where} (${id})`;
    const description = h.description;
    if (
      typeof description !== "string" ||
      description.length < DESCRIPTION_MIN ||
      description.length > DESCRIPTION_MAX
    ) {
      const len = typeof description === "string" ? description.length : "not a string";
      fail(label, `description must be ${DESCRIPTION_MIN} to ${DESCRIPTION_MAX} characters (got ${len})`);
    }
    return {
      id,
      name: name(h.name, label),
      kind: oneOf(h.kind, HOTSPOT_KINDS, label, "kind"),
      x: finite(h.x, label, "x"),
      z: finite(h.z, label, "z"),
      lon: finite(h.lon, label, "lon"),
      lat: finite(h.lat, label, "lat"),
      description,
      sources: parseSources(h.sources, label),
      confidence: oneOf(h.confidence, CONFIDENCES, label, "confidence"),
    };
  });
}

/**
 * Validate untrusted overlay JSON and return a clean copy (only the known fields).
 * Throws an Error naming the offending section, index and id.
 */
export function parseOverlay(raw: unknown): Overlay {
  if (!isRecord(raw)) throw new Error("overlay: the file must be a JSON object");
  if (raw.version !== 1) {
    throw new Error(`overlay: unsupported version ${JSON.stringify(raw.version)} (expected 1)`);
  }
  return {
    version: 1,
    streets: parseStreets(raw),
    landmarks: parseLandmarks(raw),
    hotspots: parseHotspots(raw),
  };
}

type FetchLike = (url: string) => Promise<Pick<Response, "ok" | "status" | "json">>;

/**
 * Fetch and validate the overlay named by `meta.overlay_file` next to the heightmap.
 * Resolves null when the dataset has no overlay. Rejects with the URL (and HTTP status)
 * on a failed request, or with the parser's message on bad content.
 */
export async function loadOverlay(
  baseUrl: string,
  meta: Pick<HeightmapMeta, "overlay_file">,
  fetchFn: FetchLike = (u) => fetch(u),
): Promise<Overlay | null> {
  const file = meta.overlay_file;
  if (file === undefined || file === null || file === "") return null;
  if (typeof file !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(file) || file.includes("..")) {
    throw new Error(`overlay: unsupported overlay_file ${JSON.stringify(file)}`);
  }
  const url = `${baseUrl}/${file}`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: HTTP ${res.status}`);
  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new Error(`${url}: not valid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  try {
    return parseOverlay(json);
  } catch (err) {
    throw new Error(`${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

`viewer/src/overlay/heightAt.ts`:

```ts
export interface HeightGrid {
  width: number;
  height: number;
  cell_m: number;
}

/**
 * Bilinear terrain height (metres, NOT exaggerated) at world coordinates, in the frame
 * terrainMesh.ts uses: sample (col, row) sits at x = (col - (width - 1) / 2) * cell_m and
 * z = (row - (height - 1) / 2) * cell_m, so +x is east, +z is south and row 0 is north.
 * Positions outside the grid clamp to the nearest edge sample; a non-finite coordinate
 * is treated as 0.
 */
export function makeHeightSampler(
  heights: Float32Array,
  size: HeightGrid,
): (x: number, z: number) => number {
  const { width, height, cell_m } = size;
  if (!(width >= 1) || !(height >= 1) || !(cell_m > 0) || heights.length !== width * height) {
    throw new Error(`heights has ${heights.length} samples, expected ${width * height}`);
  }
  const cx = (width - 1) / 2;
  const cz = (height - 1) / 2;
  const maxCol = width - 1;
  const maxRow = height - 1;

  return (x, z) => {
    const fc = Math.min(maxCol, Math.max(0, (Number.isFinite(x) ? x : 0) / cell_m + cx));
    const fr = Math.min(maxRow, Math.max(0, (Number.isFinite(z) ? z : 0) / cell_m + cz));
    const c0 = Math.min(maxCol - 1, Math.floor(fc));
    const r0 = Math.min(maxRow - 1, Math.floor(fr));
    // A one-sample-wide axis has nothing to interpolate towards.
    const c1 = Math.min(maxCol, c0 + 1);
    const r1 = Math.min(maxRow, r0 + 1);
    const tc = c1 === c0 ? 0 : fc - c0;
    const tr = r1 === r0 ? 0 : fr - r0;
    const i00 = Math.max(0, r0) * width + Math.max(0, c0);
    const h00 = heights[i00];
    const h10 = heights[Math.max(0, r0) * width + c1];
    const h01 = heights[r1 * width + Math.max(0, c0)];
    const h11 = heights[r1 * width + c1];
    const top = h00 + (h10 - h00) * tc;
    const bottom = h01 + (h11 - h01) * tc;
    return top + (bottom - top) * tr;
  };
}
```

`viewer/src/overlay/drape.ts`:

```ts
import * as THREE from "three";

export type HeightAt = (x: number, z: number) => number;

/**
 * Subdivide a flat [x0, z0, x1, z1, ...] polyline so that consecutive points are at most
 * `stepM` apart horizontally, and read each point's height from `heightAt`. Returns a
 * flat [x, y, z, ...] array (original vertices are kept exactly). A trailing unpaired
 * value is ignored; fewer than one point gives [].
 */
export function drapePolyline(points: number[], heightAt: HeightAt, stepM: number): number[] {
  if (!(stepM > 0) || !Number.isFinite(stepM)) throw new RangeError(`stepM must be > 0, got ${stepM}`);
  const n = Math.floor(points.length / 2);
  const out: number[] = [];
  if (n < 1) return out;
  let px = points[0];
  let pz = points[1];
  out.push(px, heightAt(px, pz), pz);
  for (let i = 1; i < n; i++) {
    const x = points[2 * i];
    const z = points[2 * i + 1];
    const parts = Math.max(1, Math.ceil(Math.hypot(x - px, z - pz) / stepM - 1e-9));
    for (let k = 1; k < parts; k++) {
      const t = k / parts;
      const sx = px + (x - px) * t;
      const sz = pz + (z - pz) * t;
      out.push(sx, heightAt(sx, sz), sz);
    }
    out.push(x, heightAt(x, z), z);
    px = x;
    pz = z;
  }
  return out;
}

/**
 * Positions for THREE.LineSegments: every polyline is draped (see drapePolyline) and cut
 * into pairs of consecutive points, so a draped line of k points contributes 2 * (k - 1)
 * vertices. y = (height + liftM) * exaggeration, i.e. in the same scaled frame as the
 * terrain mesh; liftM keeps the line above the coarse terrain. No lines gives an empty
 * geometry.
 */
export function buildSegmentGeometry(
  lines: number[][],
  heightAt: HeightAt,
  stepM: number,
  exaggeration: number,
  liftM: number,
): THREE.BufferGeometry {
  const draped = lines.map((l) => drapePolyline(l, heightAt, stepM));
  let segments = 0;
  for (const d of draped) segments += Math.max(0, d.length / 3 - 1);
  const positions = new Float32Array(segments * 6);
  let o = 0;
  for (const d of draped) {
    const count = d.length / 3;
    for (let i = 0; i + 1 < count; i++) {
      for (const j of [i, i + 1]) {
        positions[o++] = d[3 * j];
        positions[o++] = (d[3 * j + 1] + liftM) * exaggeration;
        positions[o++] = d[3 * j + 2];
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
```

`viewer/src/overlay/streetsLayer.ts`:

```ts
import * as THREE from "three";
import { buildSegmentGeometry, type HeightAt } from "./drape";
import type { Overlay, StreetKind } from "./types";
import { STREET_KINDS } from "./types";

/** Metres the street lines float above the terrain, so the coarse LOD cannot hide them. */
export const STREET_LIFT_M = 4;
/** Longest horizontal distance between draped street vertices, metres. */
export const STREET_STEP_M = 20;
/**
 * Camera zoom at which each street class appears (primary streets are always shown).
 * Tune against the real data: the camera zoom runs 0.8 .. 40.
 */
export const STREET_THRESHOLDS = { secondary: 2.5, local: 5 } as const;

export interface StreetThresholds {
  secondary: number;
  local: number;
}

export interface StreetKindVisibility {
  primary: boolean;
  secondary: boolean;
  local: boolean;
}

/** Which street classes are drawn at a camera zoom: more detail as you zoom in. */
export function streetKindVisibility(zoom: number, t: StreetThresholds): StreetKindVisibility {
  const z = Number.isFinite(zoom) ? zoom : 0;
  return { primary: true, secondary: z >= t.secondary, local: z >= t.local };
}

export interface StreetsLayerOptions {
  exaggeration: number;
  liftM: number;
  stepM: number;
  thresholds: StreetThresholds;
}

/**
 * Street line colour: a dark slate. Streets are a faint orientation aid, not text, so the
 * bar is a 1.5:1 contrast against every ground colour (WCAG asks 3:1 for graphics; a 1 px
 * line over a busy map cannot honestly reach that). A pale line cannot do it: the beach and
 * dune colours are lighter than any cream (1.28:1), while a dark line clears 1.5:1 on all of
 * them. uiColors.test.ts enforces this, including each class's opacity.
 */
export const STREET_COLOR = 0x1f2a33;
/** More opaque for bigger streets. */
export const STREET_OPACITY: Readonly<Record<StreetKind, number>> = {
  primary: 0.95,
  secondary: 0.85,
  local: 0.6,
};
const STYLE: Record<StreetKind, { color: number; opacity: number }> = {
  primary: { color: STREET_COLOR, opacity: STREET_OPACITY.primary },
  secondary: { color: STREET_COLOR, opacity: STREET_OPACITY.secondary },
  local: { color: STREET_COLOR, opacity: STREET_OPACITY.local },
};

/** The modern street network as thin lines draped over the terrain. */
export class StreetsLayer {
  readonly object = new THREE.Group();
  private readonly meshes = new Map<StreetKind, THREE.LineSegments>();
  private enabled = true;
  private lastZoom = Number.NaN;

  constructor(
    overlay: Pick<Overlay, "streets">,
    heightAt: HeightAt,
    private readonly opts: StreetsLayerOptions,
  ) {
    this.object.name = "streets";
    for (const kind of STREET_KINDS) {
      const lines = overlay.streets.filter((s) => s.kind === kind).flatMap((s) => s.lines);
      const material = new THREE.LineBasicMaterial({
        color: STYLE[kind].color,
        opacity: STYLE[kind].opacity,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.LineSegments(
        buildSegmentGeometry(lines, heightAt, opts.stepM, opts.exaggeration, opts.liftM),
        material,
      );
      mesh.name = `streets-${kind}`;
      mesh.renderOrder = 2;
      mesh.visible = false;
      this.meshes.set(kind, mesh);
      this.object.add(mesh);
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.object.visible = on;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Show the street classes that suit this zoom. Returns true when anything changed. */
  update(zoom: number): boolean {
    if (zoom === this.lastZoom) return false;
    this.lastZoom = zoom;
    const vis = streetKindVisibility(zoom, this.opts.thresholds);
    let changed = false;
    for (const kind of STREET_KINDS) {
      const mesh = this.meshes.get(kind)!;
      if (mesh.visible !== vis[kind]) {
        mesh.visible = vis[kind];
        changed = true;
      }
    }
    return changed;
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.object.removeFromParent();
  }
}
```

`viewer/src/overlay/labels.ts`:

```ts
import * as THREE from "three";
import type { LandmarkKind } from "./types";

/** Project a world point to CSS pixels (origin top-left). The camera's matrices must be current. */
export function projectToScreen(
  point: THREE.Vector3,
  camera: THREE.Camera,
  widthPx: number,
  heightPx: number,
): { x: number; y: number } {
  const ndc = point.clone().project(camera);
  return { x: (ndc.x * 0.5 + 0.5) * widthPx, y: (-ndc.y * 0.5 + 0.5) * heightPx };
}

/** A screen rectangle (x, y = top-left corner) competing for space. */
export interface DeclutterItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  priority: number;
}

/**
 * Greedy label placement: highest priority first (ties by id, so the result does not
 * depend on input order); an item is kept unless it overlaps an already kept one, with
 * `padding` pixels of clear space required between rectangles. Returns the kept ids.
 */
export function declutter(items: readonly DeclutterItem[], padding: number): Set<string> {
  const order = [...items].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const kept: DeclutterItem[] = [];
  const ids = new Set<string>();
  for (const it of order) {
    if (ids.has(it.id)) continue;
    const clash = kept.some(
      (k) =>
        it.x < k.x + k.w + padding &&
        k.x < it.x + it.w + padding &&
        it.y < k.y + k.h + padding &&
        k.y < it.y + it.h + padding,
    );
    if (clash) continue;
    kept.push(it);
    ids.add(it.id);
  }
  return ids;
}

/** Declutter priority of a landmark label by kind (hotspots use HOTSPOT_PRIORITY). */
export const HOTSPOT_PRIORITY = 100;
const LANDMARK_PRIORITY: Record<LandmarkKind, number> = {
  hill: 60,
  park: 56,
  bridge: 55,
  neighborhood: 50,
  fort: 46,
  beach: 45,
  water: 44,
  building: 40,
  other: 30,
};
export function landmarkPriority(kind: string): number {
  return Object.hasOwn(LANDMARK_PRIORITY, kind) ? LANDMARK_PRIORITY[kind as LandmarkKind] : 30;
}

export interface LabelItem {
  id: string;
  text: string;
  /** World position of the anchor; y is already scaled (exaggerated). */
  x: number;
  z: number;
  y: number;
  kind: "landmark" | "hotspot";
  priority: number;
}

/**
 * Landmark label text and the halo drawn around it so it reads over any ground colour.
 * ui.css (--label-fg, --label-halo) must hold the same values; uiColors.test.ts checks both
 * the sync and the contrast.
 */
export const LABEL_TEXT = 0x1c2429;
export const LABEL_HALO = 0xffffff;
export const LABEL_HALO_ALPHA = 0.95;

/** Clear space kept between two labels, CSS pixels. */
export const LABEL_PADDING_PX = 4;
/** Labels whose box is further than this outside the viewport are not shown. */
const CULL_MARGIN_PX = 8;
const SELECTED_BOOST = 10_000;

interface Entry {
  item: LabelItem;
  el: HTMLElement;
  dot: HTMLElement | null;
  shown: boolean;
  measured: boolean;
  /** Size and anchor (the point the box is positioned by) in CSS pixels. */
  w: number;
  h: number;
  ax: number;
  ay: number;
  tx: number;
  ty: number;
}

/**
 * DOM labels over the canvas: small text for landmarks and clickable markers for
 * hotspots. One element is created per item and reused; styles are only written when a
 * value changes. Text always goes through textContent.
 */
export class LabelLayer {
  readonly el: HTMLDivElement;
  private entries: Entry[] = [];
  private selected: string | undefined;
  private lastSize = "";
  private readonly scratch = new THREE.Vector3();

  constructor(
    parent: HTMLElement,
    private readonly onActivate: (id: string) => void,
  ) {
    this.el = document.createElement("div");
    this.el.className = "labels";
    parent.prepend(this.el);
  }

  setItems(items: readonly LabelItem[]): void {
    for (const e of this.entries) e.el.remove();
    this.entries = items.map((item) => this.createEntry(item));
    this.el.append(...this.entries.map((e) => e.el));
    this.applySelected();
  }

  /** Highlight (and keep on screen) one item, or none. */
  setSelected(id: string | undefined): void {
    this.selected = id;
    this.applySelected();
  }

  update(
    camera: THREE.Camera,
    widthPx: number,
    heightPx: number,
    visibleKinds: ReadonlySet<string>,
  ): void {
    const size = `${widthPx}x${heightPx}`;
    if (size !== this.lastSize) {
      // A resize can change fonts via media queries: measure again.
      this.lastSize = size;
      for (const e of this.entries) e.measured = false;
    }
    camera.updateMatrixWorld();

    const candidates: DeclutterItem[] = [];
    const byId = new Map<string, Entry>();
    for (const e of this.entries) {
      if (!visibleKinds.has(e.item.kind)) continue;
      const p = projectToScreen(this.scratch.set(e.item.x, e.item.y, e.item.z), camera, widthPx, heightPx);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      // Cheap anchor test first, so off-screen items are never measured.
      if (
        p.x < -200 ||
        p.x > widthPx + 200 ||
        p.y < -100 ||
        p.y > heightPx + 100
      ) {
        continue;
      }
      this.measure(e);
      const x = Math.round(p.x - e.ax);
      const y = Math.round(p.y - e.ay);
      if (x > widthPx + CULL_MARGIN_PX || y > heightPx + CULL_MARGIN_PX || x + e.w < -CULL_MARGIN_PX || y + e.h < -CULL_MARGIN_PX) {
        continue;
      }
      e.tx = x;
      e.ty = y;
      byId.set(e.item.id, e);
      candidates.push({
        id: e.item.id,
        x,
        y,
        w: e.w,
        h: e.h,
        priority: e.item.priority + (e.item.id === this.selected ? SELECTED_BOOST : 0),
      });
    }
    const keep = declutter(candidates, LABEL_PADDING_PX);

    for (const e of this.entries) {
      const show = keep.has(e.item.id) && byId.has(e.item.id);
      if (show) {
        e.el.style.transform = `translate(${e.tx}px, ${e.ty}px)`;
        if (!e.shown) e.el.hidden = false;
      } else if (e.shown) {
        e.el.hidden = true;
      }
      e.shown = show;
    }
  }

  dispose(): void {
    this.el.remove();
    this.entries = [];
  }

  private createEntry(item: LabelItem): Entry {
    let el: HTMLElement;
    let dot: HTMLElement | null = null;
    if (item.kind === "hotspot") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "marker";
      button.setAttribute("aria-label", `Hotspot: ${item.text}`);
      dot = document.createElement("span");
      dot.className = "marker__dot";
      dot.setAttribute("aria-hidden", "true");
      const name = document.createElement("span");
      name.className = "marker__name";
      name.setAttribute("aria-hidden", "true");
      name.textContent = item.text;
      button.append(dot, name);
      button.addEventListener("click", () => this.onActivate(item.id));
      el = button;
    } else {
      el = document.createElement("span");
      el.className = "label";
      el.setAttribute("aria-hidden", "true");
      el.textContent = item.text;
    }
    el.hidden = true;
    return { item, el, dot, shown: false, measured: false, w: 0, h: 0, ax: 0, ay: 0, tx: 0, ty: 0 };
  }

  /** Read the element's size once (it must be visible to have one). */
  private measure(e: Entry): void {
    if (e.measured) return;
    const wasHidden = e.el.hidden;
    if (wasHidden) {
      e.el.style.transform = "translate(-9999px, -9999px)";
      e.el.hidden = false;
    }
    e.w = e.el.offsetWidth;
    e.h = e.el.offsetHeight;
    if (e.dot) {
      // The dot, not the box, sits on the map point.
      e.ax = e.dot.offsetLeft + e.dot.offsetWidth / 2;
      e.ay = e.h / 2;
    } else {
      e.ax = e.w / 2;
      e.ay = e.h + 4; // just above the point
    }
    if (wasHidden) e.el.hidden = true;
    e.measured = true;
  }

  private applySelected(): void {
    for (const e of this.entries) {
      const on = e.item.id === this.selected;
      e.el.classList.toggle("is-selected", on);
      if (on) e.el.setAttribute("aria-current", "true");
      else e.el.removeAttribute("aria-current");
    }
  }
}
```

`viewer/src/overlay/searchItems.ts`:

```ts
import type { SearchItem } from "../search";
import type { Overlay, Street } from "./types";

/** Point halfway along a polyline's length (flat [x0, z0, x1, z1, ...]); null when it has no points. */
export function polylineMidpoint(line: readonly number[]): { x: number; z: number } | null {
  const n = Math.floor(line.length / 2);
  if (n < 1) return null;
  let total = 0;
  for (let i = 1; i < n; i++) total += Math.hypot(line[2 * i] - line[2 * i - 2], line[2 * i + 1] - line[2 * i - 1]);
  if (total === 0) return { x: line[0], z: line[1] };
  let remaining = total / 2;
  for (let i = 1; i < n; i++) {
    const len = Math.hypot(line[2 * i] - line[2 * i - 2], line[2 * i + 1] - line[2 * i - 1]);
    if (remaining <= len && len > 0) {
      const t = remaining / len;
      return {
        x: line[2 * i - 2] + (line[2 * i] - line[2 * i - 2]) * t,
        z: line[2 * i - 1] + (line[2 * i + 1] - line[2 * i - 1]) * t,
      };
    }
    remaining -= len;
  }
  return { x: line[2 * (n - 1)], z: line[2 * (n - 1) + 1] };
}

function lineLength(line: readonly number[]): number {
  let total = 0;
  for (let i = 2; i + 1 < line.length; i += 2) total += Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1]);
  return total;
}

/**
 * One search item per street NAME: a street that appears in several records (or with
 * several lines) is placed at the midpoint of its longest line. Ids are `street-<n>`.
 */
export function streetSearchItems(streets: readonly Street[]): SearchItem[] {
  const byName = new Map<string, { street: Street; line: readonly number[]; len: number }>();
  for (const street of streets) {
    const key = street.name.trim().toLowerCase();
    for (const line of street.lines) {
      const len = lineLength(line);
      const have = byName.get(key);
      if (!have || len > have.len) byName.set(key, { street, line, len });
    }
  }
  const items: SearchItem[] = [];
  let n = 0;
  for (const { street, line } of byName.values()) {
    const mid = polylineMidpoint(line);
    if (!mid) continue;
    items.push({ id: `street-${n++}`, name: street.name, group: "street", kind: street.kind, x: mid.x, z: mid.z });
  }
  return items;
}

/** Hotspots, landmarks and street names as search items. */
export function overlaySearchItems(overlay: Overlay): SearchItem[] {
  return [
    ...overlay.hotspots.map((h): SearchItem => ({ id: h.id, name: h.name, group: "hotspot", kind: h.kind, x: h.x, z: h.z })),
    ...overlay.landmarks.map((l): SearchItem => ({ id: l.id, name: l.name, group: "landmark", kind: l.kind, x: l.x, z: l.z })),
    ...streetSearchItems(overlay.streets),
  ];
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `cd viewer && npm test && npx tsc --noEmit`
Expected: the six overlay test files pass (27 + 7 + 13 + 9 + 12 + 7 = **75** new tests), **312** in total, of which **one is skipped**: a test that parses the generated synthetic overlay skips until Task 11 creates that file (so vitest prints `311 passed | 1 skipped (312)`); `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add viewer/src/heightmap.ts viewer/src/overlay
git commit -m "feat(viewer): validated overlay data, terrain-draped streets, decluttered labels"
```

---

### Task 7: Information content: confidence, legend, provenance, About flag

Pure content and helpers for the panels, so wording and labels are tested and in one place.

**Files:**
- Create: `viewer/src/confidence.ts`, `legendEntries.ts`, `provenanceData.ts`, `aboutSeen.ts` and a `*.test.ts` for each

- [ ] **Step 1: Write the failing tests**

`viewer/src/confidence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CONFIDENCE_INFO, confidenceInfo } from "./confidence";

describe("confidence", () => {
  it("has a label and a one-sentence meaning for each level", () => {
    for (const key of ["documented", "inferred", "illustrative"] as const) {
      const info = CONFIDENCE_INFO[key];
      expect(info.label.length).toBeGreaterThan(3);
      expect(info.meaning.endsWith(".")).toBe(true);
      expect(info.meaning.split(". ").length).toBe(1);
    }
  });

  it("confidenceInfo handles known and unknown values", () => {
    expect(confidenceInfo("inferred")).toMatchObject({ key: "inferred", label: "Inferred" });
    expect(confidenceInfo("weird")).toMatchObject({ key: "unknown", label: "weird" });
    expect(confidenceInfo("")).toMatchObject({ key: "unknown", label: "Unknown" });
    expect(confidenceInfo("constructor").key).toBe("unknown");
  });
});
```

`viewer/src/legendEntries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GROUP_COLORS } from "./habitat";
import { GROUP_LABELS, hexToCss, legendEntries } from "./legendEntries";

describe("hexToCss", () => {
  it("pads to six digits", () => {
    expect(hexToCss(0x3f7fa6)).toBe("#3f7fa6");
    expect(hexToCss(0x0000ff)).toBe("#0000ff");
    expect(hexToCss(0)).toBe("#000000");
  });
});

describe("legendEntries", () => {
  it("lists only groups present, once each, in legend order, with the terrain colours", () => {
    const e = legendEntries([
      { id: 0, name: "Unmapped", group: "unmapped" },
      { id: 1, name: "Redwood", group: "woodland" },
      { id: 2, name: "Oak", group: "woodland" },
      { id: 3, name: "Bay", group: "water" },
    ]);
    expect(e.map((x) => x.group)).toEqual(["water", "woodland", "unmapped"]);
    expect(e[0].label).toBe("Bay, ocean and ponds");
    expect(e[1].label).toBe("Oak and bay woodland");
    expect(e[2].label).toBe("Not yet reconstructed (modern terrain shown for context)");
    expect(e[0].color).toBe("#3f7fa6");
  });

  it("treats unknown groups as unmapped and handles missing or empty classes", () => {
    expect(legendEntries([{ id: 1, name: "x", group: "lava" }]).map((x) => x.group)).toEqual(["unmapped"]);
    expect(legendEntries([{ id: 1, name: "x", group: "constructor" }]).map((x) => x.group)).toEqual(["unmapped"]);
    expect(legendEntries([])).toEqual([]);
    expect(legendEntries(undefined)).toEqual([]);
  });

  it("has a label for every colour group", () => {
    expect(GROUP_LABELS.map(([g]) => g).sort()).toEqual(Object.keys(GROUP_COLORS).sort());
  });
});
```

`viewer/src/provenanceData.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { OVERLAY_NOTE, VEGETATION_NOTE, formatValue, processingEntries } from "./provenanceData";

describe("formatValue", () => {
  it("formats scalars", () => {
    expect(formatValue(30)).toBe("30");
    expect(formatValue(0.123456789)).toBe("0.1235");
    expect(formatValue("abc")).toBe("abc");
    expect(formatValue(true)).toBe("yes");
    expect(formatValue(false)).toBe("no");
    expect(formatValue(null)).toBe("not recorded");
    expect(formatValue(undefined)).toBe("not recorded");
    expect(formatValue(NaN)).toBe("NaN");
  });

  it("serialises objects and clips long values", () => {
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
    expect(formatValue("x".repeat(500)).length).toBe(200);
    expect(formatValue("x".repeat(500)).endsWith("…")).toBe(true);
  });

  it("survives values that cannot be serialised", () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(typeof formatValue(loop)).toBe("string");
  });
});

describe("processingEntries", () => {
  it("labels the known parameters, with units, in a fixed order", () => {
    const rows = processingEntries({
      coverage: 0.82,
      shore_open_cells: 12,
      smooth_m: 30,
      open_water_max_m: 6,
      shelf_m: 80,
      shore_slope: 0.05,
    });
    expect(rows.map((r) => r.key)).toEqual([
      "smooth_m",
      "shelf_m",
      "shore_slope",
      "shore_open_cells",
      "open_water_max_m",
      "coverage",
    ]);
    expect(rows[0]).toEqual({ key: "smooth_m", label: "Terrain smoothing distance", value: "30 m" });
    expect(rows[3].value).toBe("12 cells");
    expect(rows[2].value).toBe("0.05");
    expect(rows[5].value).toBe("0.82");
  });

  it("appends unknown keys alphabetically with a humanised label", () => {
    const rows = processingEntries({ zeta_value: 1, alpha_beta: "x", smooth_m: 10 });
    expect(rows.map((r) => r.key)).toEqual(["smooth_m", "alpha_beta", "zeta_value"]);
    expect(rows[1].label).toBe("Alpha beta");
  });

  it("does not add a unit to a non-numeric value and handles missing input", () => {
    expect(processingEntries({ smooth_m: "n/a" })[0].value).toBe("n/a");
    expect(processingEntries(undefined)).toEqual([]);
    expect(processingEntries({})).toEqual([]);
  });

  it("ignores inherited properties", () => {
    expect(processingEntries(Object.create({ smooth_m: 5 }) as Record<string, unknown>)).toEqual([]);
  });
});

describe("OVERLAY_NOTE", () => {
  it("is the agreed wording", () => {
    expect(OVERLAY_NOTE).toBe(
      "Modern streets: US Census Bureau TIGER/Line, approximate positions; landmarks are approximate.",
    );
  });
});

describe("VEGETATION_NOTE", () => {
  it("says the shapes are illustrative", () => {
    expect(VEGETATION_NOTE).toBe(
      "Vegetation shapes (trees, shrubs, reeds) are illustrative: they show the kind of plants, not individual plants.",
    );
  });
});
```

`viewer/src/aboutSeen.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ABOUT_SEEN_KEY, takeFirstVisit } from "./aboutSeen";

const memory = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe("takeFirstVisit", () => {
  it("is true once, then false", () => {
    const s = memory();
    expect(takeFirstVisit(s)).toBe(true);
    expect(s.data.get(ABOUT_SEEN_KEY)).toBe("1");
    expect(takeFirstVisit(s)).toBe(false);
    expect(takeFirstVisit(s)).toBe(false);
  });

  it("uses the agreed key", () => {
    expect(ABOUT_SEEN_KEY).toBe("yelamu-about-seen");
  });

  it("shows the dialog when storage is unavailable", () => {
    expect(takeFirstVisit(null)).toBe(true);
  });

  it("shows the dialog when reading throws", () => {
    const s = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {},
    };
    expect(takeFirstVisit(s)).toBe(true);
  });

  it("still shows the dialog when writing throws", () => {
    const s = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(takeFirstVisit(s)).toBe(true);
  });

  it("default storage lookup does not throw in a non-browser environment", () => {
    expect(() => takeFirstVisit()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd viewer && npx vitest run src/confidence.test.ts src/legendEntries.test.ts src/provenanceData.test.ts src/aboutSeen.test.ts`
Expected: FAIL: cannot find the modules.

- [ ] **Step 3: Create the modules**

`viewer/src/confidence.ts`:

```ts
import type { Confidence } from "./heightmap";

export interface ConfidenceInfo {
  label: string;
  /** One plain-language sentence for visitors. */
  meaning: string;
}

export const CONFIDENCE_INFO: Record<Confidence, ConfidenceInfo> = {
  documented: { label: "Documented", meaning: "Stated by a cited source." },
  inferred: {
    label: "Inferred",
    meaning: "Reconstructed by this project from other data.",
  },
  illustrative: {
    label: "Illustrative",
    meaning: "Drawn to give an impression, not a record.",
  },
};

/** Info for a confidence value from data; an unknown value is shown as-is with no claim. */
export function confidenceInfo(c: string): ConfidenceInfo & { key: Confidence | "unknown" } {
  if (Object.hasOwn(CONFIDENCE_INFO, c)) return { key: c as Confidence, ...CONFIDENCE_INFO[c as Confidence] };
  return { key: "unknown", label: String(c || "Unknown"), meaning: "No confidence level is recorded." };
}
```

`viewer/src/legendEntries.ts`:

```ts
import { GROUP_COLORS, type HabitatClass } from "./habitat";

export interface LegendEntry {
  group: string;
  label: string;
  /** CSS colour like "#3f7fa6". */
  color: string;
}

/** Visitor-facing names for the habitat groups, in legend order. */
export const GROUP_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["water", "Bay, ocean and ponds"],
  ["marsh", "Tidal marsh and flats"],
  ["wetland", "Freshwater wetland and riparian"],
  ["beach", "Beach"],
  ["dune", "Dunes"],
  ["grassland", "Grassland"],
  ["scrub", "Scrub"],
  ["woodland", "Oak and bay woodland"],
  ["rock", "Rock"],
  ["unmapped", "Not yet reconstructed (modern terrain shown for context)"],
];

export function hexToCss(hex: number): string {
  return `#${(hex & 0xffffff).toString(16).padStart(6, "0")}`;
}

/**
 * Legend rows for the habitat groups that occur in `classes` (a class with an unknown
 * group counts as "unmapped", like the terrain colouring does). One row per group.
 */
export function legendEntries(classes: readonly HabitatClass[] | undefined): LegendEntry[] {
  const present = new Set<string>();
  for (const c of classes ?? []) {
    present.add(Object.hasOwn(GROUP_COLORS, c.group) ? c.group : "unmapped");
  }
  return GROUP_LABELS.filter(([group]) => present.has(group)).map(([group, label]) => ({
    group,
    label,
    color: hexToCss(GROUP_COLORS[group]),
  }));
}
```

`viewer/src/provenanceData.ts` (the labels were reviewed for accuracy against what each pipeline parameter really does):

```ts
/** Pure helpers for the Sources panel: human labels for the pipeline parameters. */

export interface ProcessingEntry {
  key: string;
  label: string;
  value: string;
}

interface Known {
  label: string;
  unit?: string;
}

const KNOWN: ReadonlyArray<readonly [string, Known]> = [
  ["smooth_m", { label: "Terrain smoothing distance", unit: "m" }],
  ["shelf_m", { label: "Width of the sloping bay floor at the shore", unit: "m" }],
  ["shore_slope", { label: "Steepest rise allowed for land beside the shore (metres per metre)" }],
  ["shore_open_cells", { label: "Piers and thin spits removed where narrower than", unit: "cells" }],
  ["open_water_max_m", { label: "Unmapped ground at or below this height counts as open bay", unit: "m" }],
  ["coverage", { label: "SFEI habitat map used to find unmapped areas" }],
];

const MAX_VALUE_CHARS = 200;

function humanize(key: string): string {
  const t = key.replace(/[_-]+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : key;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(4)));
}

/** Plain text for any JSON value, clipped so a huge value cannot flood the panel. */
export function formatValue(v: unknown): string {
  let text: string;
  if (typeof v === "number") text = formatNumber(v);
  else if (typeof v === "string") text = v;
  else if (typeof v === "boolean") text = v ? "yes" : "no";
  else if (v === null || v === undefined) text = "not recorded";
  else {
    try {
      text = JSON.stringify(v);
    } catch {
      text = String(v);
    }
  }
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS - 1)}…` : text;
}

/**
 * Labelled rows for `meta.processing`: known parameters first in a fixed order with
 * plain labels and units, then any others alphabetically with a humanised key.
 */
export function processingEntries(processing: Record<string, unknown> | undefined): ProcessingEntry[] {
  if (!processing || typeof processing !== "object") return [];
  const out: ProcessingEntry[] = [];
  const seen = new Set<string>();
  for (const [key, known] of KNOWN) {
    if (!Object.hasOwn(processing, key)) continue;
    seen.add(key);
    const raw = processing[key];
    const base = formatValue(raw);
    out.push({
      key,
      label: known.label,
      value: known.unit && typeof raw === "number" ? `${base} ${known.unit}` : base,
    });
  }
  for (const key of Object.keys(processing).sort()) {
    if (seen.has(key)) continue;
    out.push({ key, label: humanize(key), value: formatValue(processing[key]) });
  }
  return out;
}

export const OVERLAY_NOTE =
  "Modern streets: US Census Bureau TIGER/Line, approximate positions; landmarks are approximate.";

/** Shown on the Sources panel (and echoed in the Legend) whenever vegetation shapes can appear. */
export const VEGETATION_NOTE =
  "Vegetation shapes (trees, shrubs, reeds) are illustrative: they show the kind of plants, not individual plants.";
```

`viewer/src/aboutSeen.ts`:

```ts
export const ABOUT_SEEN_KEY = "yelamu-about-seen";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** localStorage, or null when it is missing or access throws (private mode, blocked data). */
export function safeLocalStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * True when the About dialog should open by itself: the visitor has not seen it yet (or
 * storage is unavailable, so we cannot tell). Marks it as seen as a side effect; every
 * storage access is guarded, so a throwing or missing storage never breaks the page.
 */
export function takeFirstVisit(storage: StorageLike | null = safeLocalStorage()): boolean {
  if (!storage) return true;
  try {
    if (storage.getItem(ABOUT_SEEN_KEY)) return false;
  } catch {
    return true;
  }
  try {
    storage.setItem(ABOUT_SEEN_KEY, "1");
  } catch {
    // Not remembered; the dialog will show again next time.
  }
  return true;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `cd viewer && npm test && npx tsc --noEmit`
Expected: 2 + 4 + 9 + 6 = **21** new tests, **333** in total (still including the one skipped test); `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add viewer/src/confidence.ts viewer/src/confidence.test.ts viewer/src/legendEntries.ts viewer/src/legendEntries.test.ts viewer/src/provenanceData.ts viewer/src/provenanceData.test.ts viewer/src/aboutSeen.ts viewer/src/aboutSeen.test.ts
git commit -m "feat(viewer): confidence meanings, legend entries, provenance labels, About flag"
```

---

### Task 8: Quality controller, water, and colour contrast

A pure frame-time state machine that turns effects down and up (with hysteresis), the animated water material and its throttled idle animator, and WCAG contrast helpers.

**Files:**
- Create: `viewer/src/quality.ts`, `effects.ts`, `a11y.ts`, `theme.ts`, `water/waterMaterial.ts`, `water/idleAnimator.ts` and a `*.test.ts` for each except `theme.ts`

- [ ] **Step 1: Write the failing tests**

`viewer/src/quality.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { QualityController, percentile90 } from "./quality";

/** A controller on a fake clock; `feed(gap, n)` records n frames, advancing the clock by gap each. */
function make(opts: ConstructorParameters<typeof QualityController>[0] = {}) {
  let t = 1000;
  const q = new QualityController({ now: () => t, ...opts });
  const advance = (ms: number) => void (t += ms);
  const feed = (gap: number, n: number) => {
    for (let i = 0; i < n; i++) {
      advance(gap);
      q.record(gap);
    }
  };
  return { q, advance, feed, clock: () => t };
}

describe("percentile90", () => {
  it("uses nearest rank", () => {
    expect(percentile90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(9);
    expect(percentile90([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])).toBe(9);
    expect(percentile90([5])).toBe(5);
    expect(percentile90([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])).toBe(1);
    expect(percentile90([1, 1, 1, 1, 1, 1, 1, 1, 100, 100])).toBe(100);
  });
  it("does not modify its input and handles empty input", () => {
    const a = [3, 1, 2];
    percentile90(a);
    expect(a).toEqual([3, 1, 2]);
    expect(Number.isNaN(percentile90([]))).toBe(true);
  });
});

describe("QualityController", () => {
  it("starts at the initial level (default 2)", () => {
    expect(make().q.level()).toBe(2);
    expect(make({ initial: 0 }).q.level()).toBe(0);
    expect(make({ initial: 1 }).q.level()).toBe(1);
  });

  it("makes no decision with fewer than 20 samples", () => {
    const { q, feed } = make({ degradeAfterMs: 0, minDwellMs: 0 });
    feed(80, 19);
    expect(q.level()).toBe(2);
    feed(80, 1);
    expect(q.level()).toBe(1);
  });

  it("degrades one level after sustained slow frames, then another, never below 0", () => {
    const { q, feed } = make();
    const seen: Array<[number, number]> = [];
    q.onChange((l, p) => seen.push([l, p]));
    feed(40, 20); // 800 ms of slow frames: not long enough yet
    expect(q.level()).toBe(2);
    feed(40, 60); // well past 1500 ms
    expect(q.level()).toBe(1);
    expect(seen).toEqual([[1, 2]]);
    // Dwell: the next change cannot come within 5 s of the previous one.
    feed(40, 60); // 2.4 s
    expect(q.level()).toBe(1);
    feed(40, 100); // 4 s more: dwell over, window refilled
    expect(q.level()).toBe(0);
    expect(seen).toEqual([
      [1, 2],
      [0, 1],
    ]);
    feed(40, 600);
    expect(q.level()).toBe(0); // never below 0
    expect(seen).toHaveLength(2);
  });

  it("does not degrade on a short spike", () => {
    const { q, feed } = make();
    feed(16, 60);
    feed(60, 12); // ~0.7 s of slow frames, then recovery
    feed(16, 200);
    expect(q.level()).toBe(2);
  });

  it("does not degrade when only a few frames are slow (p90 stays low)", () => {
    const { q, feed } = make();
    for (let i = 0; i < 20; i++) {
      feed(16, 9);
      feed(100, 1); // 10% slow: p90 is still a fast frame
    }
    expect(q.level()).toBe(2);
  });

  it("upgrades one level after sustained fast frames, only after the dwell, never above 2", () => {
    const { q, feed } = make({ initial: 0 });
    const seen: Array<[number, number]> = [];
    q.onChange((l, p) => seen.push([l, p]));
    feed(10, 300); // 3 s of fast frames: below upgradeAfterMs (8 s)
    expect(q.level()).toBe(0);
    feed(10, 600); // now > 8 s
    expect(q.level()).toBe(1);
    // After the change the window is cleared; another 8 s of fast frames brings level 2.
    feed(10, 500);
    expect(q.level()).toBe(1);
    feed(10, 400);
    expect(q.level()).toBe(2);
    feed(10, 2000);
    expect(q.level()).toBe(2);
    expect(seen).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });

  it("does not upgrade while frames are only mediocre (between the thresholds)", () => {
    const { q, feed } = make({ initial: 1 });
    feed(20, 2000); // p90 = 20 ms: neither slow (>25) nor fast (<14)
    expect(q.level()).toBe(1);
  });

  it("respects minDwellMs after a change even when conditions still hold", () => {
    const { q, feed } = make({ degradeAfterMs: 100, minDwellMs: 5000 });
    feed(40, 30);
    expect(q.level()).toBe(1);
    // 100 more slow frames = 4 s < 5 s dwell
    feed(40, 100);
    expect(q.level()).toBe(1);
    feed(40, 40);
    expect(q.level()).toBe(0);
  });

  it("ignores idle gaps, non-finite and negative values", () => {
    const { q, feed } = make({ degradeAfterMs: 1e9, minDwellMs: 0 });
    for (const bad of [500, 501, 5000, Infinity, -1, NaN, -Infinity]) {
      for (let i = 0; i < 30; i++) q.record(bad);
    }
    expect(q.level()).toBe(2);
    expect(q.sampleCount()).toBe(0);
    feed(30, 19);
    expect(q.sampleCount()).toBe(19);
    q.record(499); // counts
    expect(q.sampleCount()).toBe(20);
  });

  it("clears the window when the level changes", () => {
    const { q, feed } = make();
    const counts: number[] = [];
    q.onChange(() => counts.push(q.sampleCount()));
    feed(40, 100);
    expect(q.level()).toBe(1);
    expect(counts).toEqual([0]); // already empty when listeners run
  });

  it("keeps only the last windowSize gaps", () => {
    const { q, feed } = make({ windowSize: 30, degradeAfterMs: 1e9 });
    feed(16, 100);
    expect(q.sampleCount()).toBe(30);
  });

  it("restarts the continuity timer after a long silence", () => {
    const { q, feed, advance } = make();
    feed(40, 30); // 1.2 s slow, not yet 1.5 s
    advance(10_000); // the visitor stopped interacting; no frames recorded
    feed(40, 5);
    expect(q.level()).toBe(2); // the pre-silence slow time does not count
    feed(40, 60);
    expect(q.level()).toBe(1);
  });

  it("onChange payload is (level, previous) and unsubscribe works", () => {
    const { q, feed } = make();
    const a: Array<[number, number]> = [];
    const b: number[] = [];
    const offA = q.onChange((l, p) => a.push([l, p]));
    q.onChange((l) => b.push(l));
    offA();
    feed(40, 100);
    expect(a).toEqual([]);
    expect(b).toEqual([1]);
  });

  it("a throwing listener does not stop the others or the controller", () => {
    const { q, feed } = make();
    const seen: number[] = [];
    q.onChange(() => {
      throw new Error("boom");
    });
    q.onChange((l) => seen.push(l));
    feed(40, 100);
    expect(seen).toEqual([1]);
    expect(q.level()).toBe(1);
  });

  it("reset restores the level silently, clears the window and the dwell", () => {
    const { q, feed } = make();
    const seen: number[] = [];
    q.onChange((l) => seen.push(l));
    feed(40, 100);
    expect(q.level()).toBe(1);
    q.reset();
    expect(q.level()).toBe(2);
    expect(q.sampleCount()).toBe(0);
    expect(seen).toEqual([1]); // reset does not notify
    q.reset(0);
    expect(q.level()).toBe(0);
    // no dwell after a reset: a change can follow as soon as the conditions are met
    feed(10, 900);
    expect(q.level()).toBe(1);
  });

  it("uses the default thresholds from the spec", () => {
    const { q } = make();
    expect(q.options).toMatchObject({
      windowSize: 60,
      degradeAboveMs: 25,
      upgradeBelowMs: 14,
      degradeAfterMs: 1500,
      upgradeAfterMs: 8000,
      minDwellMs: 5000,
      initial: 2,
    });
  });
});
```

`viewer/src/effects.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cleanLayers } from "./appState";
import {
  REDUCED_EFFECTS_MESSAGE,
  VEGETATION_LAYER,
  WATER_MOTION_DISABLED_REASON,
  WATER_MOTION_LAYER,
  defaultVegetationOn,
  degradeMessage,
  effectiveEffects,
} from "./effects";
import type { QualityLevel } from "./quality";

describe("layer ids", () => {
  it("are valid for the hash codec", () => {
    for (const id of [VEGETATION_LAYER, WATER_MOTION_LAYER]) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
      expect(cleanLayers([id])).toEqual([id]);
    }
  });
});

describe("defaultVegetationOn", () => {
  it("is on for fine pointers and off for coarse ones", () => {
    expect(defaultVegetationOn(false)).toBe(true);
    expect(defaultVegetationOn(true)).toBe(false);
  });
});

describe("effectiveEffects", () => {
  const base = { vegetation: true, waterMotion: true, level: 2 as QualityLevel, reducedMotion: false };

  it("shows everything at full quality", () => {
    expect(effectiveEffects(base)).toEqual({ vegetation: true, waterAnimation: true });
  });

  it("level 1: vegetation but still water", () => {
    expect(effectiveEffects({ ...base, level: 1 })).toEqual({ vegetation: true, waterAnimation: false });
  });

  it("level 0: neither", () => {
    expect(effectiveEffects({ ...base, level: 0 })).toEqual({ vegetation: false, waterAnimation: false });
  });

  it("toggles switch each effect off independently", () => {
    expect(effectiveEffects({ ...base, vegetation: false })).toEqual({ vegetation: false, waterAnimation: true });
    expect(effectiveEffects({ ...base, waterMotion: false })).toEqual({ vegetation: true, waterAnimation: false });
  });

  it("reduced motion never animates the water, whatever the toggle", () => {
    expect(effectiveEffects({ ...base, reducedMotion: true })).toEqual({ vegetation: true, waterAnimation: false });
  });

  it("covers every combination consistently", () => {
    for (const vegetation of [true, false])
      for (const waterMotion of [true, false])
        for (const level of [0, 1, 2] as const)
          for (const reducedMotion of [true, false]) {
            const e = effectiveEffects({ vegetation, waterMotion, level, reducedMotion });
            expect(e.vegetation).toBe(vegetation && level >= 1);
            expect(e.waterAnimation).toBe(waterMotion && level === 2 && !reducedMotion);
          }
  });
});

describe("degradeMessage", () => {
  const full = { vegetation: true, waterAnimation: true };
  const noWater = { vegetation: true, waterAnimation: false };
  const none = { vegetation: false, waterAnimation: false };

  it("announces a degrade that switched something off", () => {
    expect(degradeMessage(1, 2, full, noWater)).toBe(REDUCED_EFFECTS_MESSAGE);
    expect(degradeMessage(0, 1, noWater, none)).toBe(REDUCED_EFFECTS_MESSAGE);
    expect(REDUCED_EFFECTS_MESSAGE).toBe("Reduced effects to keep the map smooth");
  });
  it("stays quiet when nothing visible changed, and on upgrades", () => {
    expect(degradeMessage(1, 2, none, none)).toBeNull();
    expect(degradeMessage(1, 2, noWater, noWater)).toBeNull();
    expect(degradeMessage(2, 1, noWater, full)).toBeNull();
    expect(degradeMessage(1, 1, full, full)).toBeNull();
  });
});

describe("texts", () => {
  it("explains the disabled water-motion toggle", () => {
    expect(WATER_MOTION_DISABLED_REASON).toMatch(/reduce motion/);
  });
});
```

`viewer/src/a11y.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { blend, contrastRatio, meetsContrast, nextAnnouncement, relativeLuminance } from "./a11y";

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance(0x000000)).toBe(0);
    expect(relativeLuminance(0xffffff)).toBeCloseTo(1, 10);
  });
  it("matches known WCAG values", () => {
    expect(relativeLuminance(0xff0000)).toBeCloseTo(0.2126, 4);
    expect(relativeLuminance(0x00ff00)).toBeCloseTo(0.7152, 4);
    expect(relativeLuminance(0x0000ff)).toBeCloseTo(0.0722, 4);
  });
  it("ignores bits above 24", () => {
    expect(relativeLuminance(0xff000000 | 0x336699)).toBeCloseTo(relativeLuminance(0x336699), 12);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white, in either order", () => {
    expect(contrastRatio(0x000000, 0xffffff)).toBeCloseTo(21, 6);
    expect(contrastRatio(0xffffff, 0x000000)).toBeCloseTo(21, 6);
  });
  it("is 1 for identical colours", () => {
    expect(contrastRatio(0x123456, 0x123456)).toBe(1);
    expect(contrastRatio(0xffffff, 0xffffff)).toBe(1);
  });
  it("matches published values for #767676 and #777777 on white", () => {
    expect(contrastRatio(0x767676, 0xffffff)).toBeCloseTo(4.54, 2); // the lightest grey that passes AA
    expect(contrastRatio(0x777777, 0xffffff)).toBeCloseTo(4.48, 2);
  });
  it("matches the well-known mid greys on white", () => {
    expect(contrastRatio(0x808080, 0xffffff)).toBeCloseTo(3.95, 2);
    expect(contrastRatio(0x595959, 0xffffff)).toBeCloseTo(7.0, 1);
  });
});

describe("meetsContrast", () => {
  it("compares against the minimum, inclusive", () => {
    expect(meetsContrast(0x767676, 0xffffff, 4.5)).toBe(true);
    expect(meetsContrast(0x777777, 0xffffff, 4.5)).toBe(false);
    expect(meetsContrast(0x000000, 0xffffff, 21 - 1e-9)).toBe(true);
    expect(meetsContrast(0x123456, 0x123456, 1)).toBe(true);
    expect(meetsContrast(0x123456, 0x123456, 1.01)).toBe(false);
  });
});

describe("blend", () => {
  it("mixes a foreground over a background by alpha", () => {
    expect(blend(0xffffff, 1, 0x000000)).toBe(0xffffff);
    expect(blend(0xffffff, 0, 0x102030)).toBe(0x102030);
    expect(blend(0xffffff, 0.5, 0x000000)).toBe(0x808080);
    expect(blend(0xff0000, 0.25, 0x0000ff)).toBe(0x4000bf);
  });
  it("clamps alpha", () => {
    expect(blend(0xffffff, 2, 0x000000)).toBe(0xffffff);
    expect(blend(0xffffff, -1, 0x000000)).toBe(0x000000);
  });
});

describe("nextAnnouncement", () => {
  it("returns the text unchanged when it differs from the previous one", () => {
    expect(nextAnnouncement("Streets on", "Streets off")).toBe("Streets on");
    expect(nextAnnouncement("Streets on", "")).toBe("Streets on");
  });
  it("makes a repeated message differ so screen readers announce it again", () => {
    const first = nextAnnouncement("Selected: Lobos Creek", "");
    const second = nextAnnouncement("Selected: Lobos Creek", first);
    expect(second).not.toBe(first);
    expect(second.trim()).toBe("Selected: Lobos Creek");
    expect(nextAnnouncement("Selected: Lobos Creek", second)).toBe(first);
  });
});
```

`viewer/src/water/idleAnimator.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { IDLE_POLL_MS, createIdleAnimator } from "./idleAnimator";

/** A deterministic timer queue with its own clock. */
function fakeEnv() {
  let time = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const env = {
    now: () => time,
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: time + ms, fn });
      return id;
    },
    clearTimer: (h: unknown) => void timers.delete(h as number),
    pending: () => timers.size,
    /** Run timers in order until `ms` have passed. */
    advance(ms: number) {
      const end = time + ms;
      for (;;) {
        let best: [number, { at: number; fn: () => void }] | null = null;
        for (const e of timers) if (e[1].at <= end && (!best || e[1].at < best[1].at)) best = e;
        if (!best) break;
        timers.delete(best[0]);
        time = best[1].at;
        best[1].fn();
      }
      time = end;
    },
    /** Fire the earliest timer right now, however early (a misbehaving timer). */
    fireNow() {
      const first = [...timers][0];
      if (!first) return;
      timers.delete(first[0]);
      first[1].fn();
    },
  };
  return env;
}

describe("createIdleAnimator", () => {
  it("requests renders at the configured rate while enabled and visible", () => {
    const env = fakeEnv();
    const render = vi.fn();
    const a = createIdleAnimator(render, { fps: 10, enabled: () => true, isVisible: () => true, ...env });
    a.start();
    env.advance(1000);
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(9);
    expect(render.mock.calls.length).toBeLessThanOrEqual(10);
    a.stop();
  });

  it("defaults to 15 fps", () => {
    const env = fakeEnv();
    const render = vi.fn();
    const a = createIdleAnimator(render, { enabled: () => true, isVisible: () => true, ...env });
    a.start();
    env.advance(2000);
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(28);
    expect(render.mock.calls.length).toBeLessThanOrEqual(30);
    a.stop();
  });

  it("never exceeds fps even if timers fire early", () => {
    const env = fakeEnv();
    const render = vi.fn();
    const a = createIdleAnimator(render, { fps: 10, enabled: () => true, isVisible: () => true, ...env });
    a.start();
    env.advance(100); // first request at 100 ms
    expect(render).toHaveBeenCalledTimes(1);
    env.fireNow(); // the next tick arrives immediately: too soon
    env.fireNow();
    expect(render).toHaveBeenCalledTimes(1);
    env.advance(100);
    expect(render).toHaveBeenCalledTimes(2);
    a.stop();
  });

  it("does not render while disabled, and resumes when enabled again", () => {
    const env = fakeEnv();
    const render = vi.fn();
    let on = false;
    const a = createIdleAnimator(render, { fps: 10, enabled: () => on, isVisible: () => true, ...env });
    a.start();
    env.advance(3000);
    expect(render).not.toHaveBeenCalled();
    on = true;
    env.advance(IDLE_POLL_MS + 1000); // it notices within one poll, then runs at fps
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(8);
    const before = render.mock.calls.length;
    on = false;
    env.advance(1000);
    expect(render.mock.calls.length).toBeLessThanOrEqual(before + 1);
    const settled = render.mock.calls.length;
    env.advance(5000);
    expect(render.mock.calls.length).toBe(settled);
    on = true;
    env.advance(IDLE_POLL_MS + 500);
    expect(render.mock.calls.length).toBeGreaterThan(settled);
    a.stop();
  });

  it("pauses while the page is hidden", () => {
    const env = fakeEnv();
    const render = vi.fn();
    let visible = true;
    const a = createIdleAnimator(render, { fps: 10, enabled: () => true, isVisible: () => visible, ...env });
    a.start();
    env.advance(500);
    const n = render.mock.calls.length;
    expect(n).toBeGreaterThan(0);
    visible = false;
    env.advance(600); // the in-flight tick notices
    const m = render.mock.calls.length;
    env.advance(5000);
    expect(render.mock.calls.length).toBe(m);
    visible = true;
    env.advance(IDLE_POLL_MS + 500);
    expect(render.mock.calls.length).toBeGreaterThan(m);
    a.stop();
  });

  it("never calls after stop() and leaves no timer behind", () => {
    const env = fakeEnv();
    const render = vi.fn();
    const a = createIdleAnimator(render, { fps: 10, enabled: () => true, isVisible: () => true, ...env });
    a.start();
    env.advance(300);
    const n = render.mock.calls.length;
    a.stop();
    expect(a.isRunning()).toBe(false);
    expect(env.pending()).toBe(0);
    env.advance(10_000);
    expect(render.mock.calls.length).toBe(n);
    // idempotent
    a.stop();
    expect(env.pending()).toBe(0);
  });

  it("can be restarted, and start() twice does not double the rate", () => {
    const env = fakeEnv();
    const render = vi.fn();
    const a = createIdleAnimator(render, { fps: 10, enabled: () => true, isVisible: () => true, ...env });
    a.start();
    a.start();
    expect(env.pending()).toBe(1);
    env.advance(1000);
    expect(render.mock.calls.length).toBeLessThanOrEqual(10);
    a.stop();
    render.mockClear();
    a.start();
    env.advance(1000);
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(9);
    a.stop();
  });

  it("does nothing before start()", () => {
    const env = fakeEnv();
    const render = vi.fn();
    createIdleAnimator(render, { enabled: () => true, isVisible: () => true, ...env });
    env.advance(5000);
    expect(render).not.toHaveBeenCalled();
    expect(env.pending()).toBe(0);
  });

  it("keeps running if requestRender throws", () => {
    const env = fakeEnv();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const a = createIdleAnimator(
      () => {
        calls++;
        throw new Error("boom");
      },
      { fps: 10, enabled: () => true, isVisible: () => true, ...env },
    );
    a.start();
    env.advance(500);
    expect(calls).toBeGreaterThan(2);
    a.stop();
    spy.mockRestore();
  });

  describe("with the default timers", () => {
    afterEach(() => vi.useRealTimers());

    it("works with vitest fake timers", () => {
      vi.useFakeTimers();
      const render = vi.fn();
      const a = createIdleAnimator(render, { fps: 20, enabled: () => true, isVisible: () => true });
      a.start();
      vi.advanceTimersByTime(1000);
      expect(render.mock.calls.length).toBeGreaterThanOrEqual(18);
      expect(render.mock.calls.length).toBeLessThanOrEqual(20);
      a.stop();
      render.mockClear();
      vi.advanceTimersByTime(1000);
      expect(render).not.toHaveBeenCalled();
    });
  });
});
```

`viewer/src/water/waterMaterial.test.ts`:

```ts
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { WATER_COLOR, WATER_OPACITY, WAVE_SLOPE, createWaterMaterial, patchWaterShaders } from "./waterMaterial";

/** Run the material's onBeforeCompile on three's real standard-material shader text. */
function compile(m: ReturnType<typeof createWaterMaterial>) {
  const shader = {
    uniforms: {} as Record<string, { value: number }>,
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  m.material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  return shader;
}

describe("createWaterMaterial", () => {
  it("keeps the old look: colour, transparency, opacity", () => {
    const { material } = createWaterMaterial();
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(material.color.getHex()).toBe(WATER_COLOR);
    expect(WATER_COLOR).toBe(0x3f7fa6);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(WATER_OPACITY);
    expect(WATER_OPACITY).toBe(0.8);
  });

  it("starts static: amplitude uniform is 0", () => {
    const m = createWaterMaterial();
    const s = compile(m);
    expect(s.uniforms.uAmp.value).toBe(0);
    expect(s.uniforms.uTime.value).toBe(0);
  });

  it("setAnimated switches the amplitude uniform on and off; setTime updates uTime", () => {
    const m = createWaterMaterial();
    const s = compile(m);
    m.setAnimated(true);
    expect(s.uniforms.uAmp.value).toBe(WAVE_SLOPE);
    m.setTime(12.5);
    expect(s.uniforms.uTime.value).toBe(12.5);
    m.setAnimated(false);
    expect(s.uniforms.uAmp.value).toBe(0);
    m.setTime(Number.NaN); // ignored
    expect(s.uniforms.uTime.value).toBe(12.5);
  });

  it("uniform objects are shared by every compile (state survives recompiles)", () => {
    const m = createWaterMaterial();
    const a = compile(m);
    m.setAnimated(true);
    const b = compile(m);
    expect(b.uniforms.uAmp).toBe(a.uniforms.uAmp);
    expect(b.uniforms.uAmp.value).toBe(WAVE_SLOPE);
  });

  it("patches the vertex and fragment shaders at real three anchors", () => {
    const original = THREE.ShaderLib.standard;
    const s = compile(createWaterMaterial());
    // vertex: world XZ varying
    expect(s.vertexShader).toContain("varying vec2 vWaterXZ;");
    expect(s.vertexShader).toContain("modelMatrix * vec4( transformed, 1.0 )");
    expect(s.vertexShader.indexOf("#include <project_vertex>")).toBeLessThan(s.vertexShader.indexOf("vWaterXZ = "));
    // fragment: uniforms, normal perturbation after the normal chunk, glint before the output
    expect(s.fragmentShader).toContain("uniform float uTime;");
    expect(s.fragmentShader).toContain("uniform float uAmp;");
    const iNormal = s.fragmentShader.indexOf("#include <normal_fragment_maps>");
    const iPerturb = s.fragmentShader.indexOf("vec3 nWorld");
    const iGlint = s.fragmentShader.indexOf("float glint");
    const iOutput = s.fragmentShader.indexOf("#include <opaque_fragment>");
    expect(iNormal).toBeGreaterThan(-1);
    expect(iNormal).toBeLessThan(iPerturb);
    expect(iPerturb).toBeLessThan(iGlint);
    expect(iGlint).toBeLessThan(iOutput);
    // two crossed waves
    expect(s.fragmentShader).toContain("float w1");
    expect(s.fragmentShader).toContain("float w2");
    // the shared source is untouched
    expect(original.fragmentShader).not.toContain("uAmp");
    expect(original.vertexShader).not.toContain("vWaterXZ");
  });

  it("each patched section is applied exactly once", () => {
    const s = compile(createWaterMaterial());
    for (const needle of ["varying vec2 vWaterXZ;", "uniform float uAmp;", "float glint =", "vec3 nWorld"]) {
      expect(s.vertexShader.split(needle).length - 1 + s.fragmentShader.split(needle).length - 1).toBeLessThanOrEqual(2);
    }
    expect(s.fragmentShader.split("vec3 nWorld").length - 1).toBe(1);
    expect(s.fragmentShader.split("float glint =").length - 1).toBe(1);
  });

  it("throws a clear error when three's shader no longer has an anchor", () => {
    expect(() => patchWaterShaders({ vertexShader: "void main(){}", fragmentShader: "void main(){}" })).toThrow(/anchor/);
  });

  it("shares one program cache key", () => {
    const a = createWaterMaterial().material;
    const b = createWaterMaterial().material;
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd viewer && npx vitest run src/quality.test.ts src/effects.test.ts src/a11y.test.ts src/water`
Expected: FAIL: cannot find the modules.

- [ ] **Step 3: Create the modules**

`viewer/src/quality.ts`:

```ts
/**
 * Automatic quality controller: watches the gaps between rendered frames during
 * interaction and steps the effects level down when the map is struggling (and back up
 * when there is plenty of headroom). Pure: the clock is injected, nothing touches the DOM.
 *
 * Levels: 2 = full (vegetation + animated water), 1 = reduced (vegetation, still water),
 * 0 = minimal (neither).
 */
export type QualityLevel = 0 | 1 | 2;

export interface QualityOptions {
  /** Clock in milliseconds. Default performance.now(). */
  now?: () => number;
  /** How many recent frame gaps the percentile is computed over. Default 60. */
  windowSize?: number;
  /** Degrade when the 90th percentile gap stays above this (ms). Default 25 (~40 fps). */
  degradeAboveMs?: number;
  /** Upgrade when the 90th percentile gap stays below this (ms). Default 14 (~70 fps). */
  upgradeBelowMs?: number;
  /** How long the slow condition must hold continuously. Default 1500 ms. */
  degradeAfterMs?: number;
  /** How long the fast condition must hold continuously. Default 8000 ms. */
  upgradeAfterMs?: number;
  /** No level change within this long of the previous one. Default 5000 ms. */
  minDwellMs?: number;
  /** Starting level. Default 2. */
  initial?: QualityLevel;
}

/** Frame gaps at or above this are idle time between interactions, not frame cost. */
export const MAX_FRAME_GAP_MS = 500;
/** Fewer samples than this make no decision. */
export const MIN_SAMPLES = 20;
/** If more than this passes between two record() calls the "continuously" streak restarts. */
export const MAX_SILENCE_MS = 1000;

/** Nearest-rank 90th percentile (NaN for an empty list). Does not modify its input. */
export function percentile90(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(0.9 * sorted.length) - 1)];
}

export class QualityController {
  readonly options: Required<QualityOptions>;
  private current: QualityLevel;
  private gaps: number[] = [];
  private slowSince: number | null = null;
  private fastSince: number | null = null;
  private lastChangeAt: number | null = null;
  private lastRecordAt: number | null = null;
  private readonly listeners = new Set<(level: QualityLevel, previous: QualityLevel) => void>();

  constructor(options: QualityOptions = {}) {
    this.options = {
      now: options.now ?? (() => performance.now()),
      windowSize: options.windowSize ?? 60,
      degradeAboveMs: options.degradeAboveMs ?? 25,
      upgradeBelowMs: options.upgradeBelowMs ?? 14,
      degradeAfterMs: options.degradeAfterMs ?? 1500,
      upgradeAfterMs: options.upgradeAfterMs ?? 8000,
      minDwellMs: options.minDwellMs ?? 5000,
      initial: options.initial ?? 2,
    };
    this.current = this.options.initial;
  }

  level(): QualityLevel {
    return this.current;
  }

  /** Number of gaps currently in the window (for tests and the debug overlay). */
  sampleCount(): number {
    return this.gaps.length;
  }

  /** 90th percentile of the current window (NaN when empty). */
  p90(): number {
    return percentile90(this.gaps);
  }

  /**
   * Feed the time between two consecutive rendered frames during interaction. Idle gaps
   * (>= 500 ms) and non-finite or negative values are ignored.
   */
  record(frameGapMs: number): void {
    if (!Number.isFinite(frameGapMs) || frameGapMs < 0 || frameGapMs >= MAX_FRAME_GAP_MS) return;
    const o = this.options;
    const now = o.now();
    if (this.lastRecordAt !== null && now - this.lastRecordAt > MAX_SILENCE_MS) {
      // The visitor stopped interacting for a while: the old streaks no longer count.
      this.slowSince = null;
      this.fastSince = null;
    }
    this.lastRecordAt = now;

    this.gaps.push(frameGapMs);
    if (this.gaps.length > o.windowSize) this.gaps.shift();
    if (this.gaps.length < MIN_SAMPLES) {
      this.slowSince = null;
      this.fastSince = null;
      return;
    }

    const p90 = percentile90(this.gaps);
    if (p90 > o.degradeAboveMs) this.slowSince ??= now;
    else this.slowSince = null;
    if (p90 < o.upgradeBelowMs) this.fastSince ??= now;
    else this.fastSince = null;

    if (this.lastChangeAt !== null && now - this.lastChangeAt < o.minDwellMs) return;

    if (this.slowSince !== null && now - this.slowSince >= o.degradeAfterMs && this.current > 0) {
      this.change((this.current - 1) as QualityLevel, now);
    } else if (this.fastSince !== null && now - this.fastSince >= o.upgradeAfterMs && this.current < 2) {
      this.change((this.current + 1) as QualityLevel, now);
    }
  }

  /** Subscribe to level changes; returns the unsubscribe function. */
  onChange(cb: (level: QualityLevel, previous: QualityLevel) => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  /**
   * Back to `level` (default: the initial level) with an empty window and no dwell.
   * Silent: listeners are NOT notified, the caller applies the level itself.
   */
  reset(level: QualityLevel = this.options.initial): void {
    this.current = level;
    this.clearState();
    this.lastChangeAt = null;
  }

  private change(next: QualityLevel, now: number): void {
    const previous = this.current;
    this.current = next;
    this.lastChangeAt = now;
    this.clearState();
    for (const cb of [...this.listeners]) {
      try {
        cb(next, previous);
      } catch (err) {
        console.error("quality listener failed", err);
      }
    }
  }

  private clearState(): void {
    this.gaps = [];
    this.slowSince = null;
    this.fastSince = null;
    this.lastRecordAt = null;
  }
}
```

`viewer/src/effects.ts`:

```ts
/** Pure rules for the vegetation and water-motion effects (no DOM, no three.js). */
import type { QualityLevel } from "./quality";

/** Layer ids (they appear in the URL hash `l=`, so they must match ^[a-z0-9-]+$). */
export const VEGETATION_LAYER = "vegetation";
export const WATER_MOTION_LAYER = "water-motion";

export const REDUCED_EFFECTS_MESSAGE = "Reduced effects to keep the map smooth";
export const WATER_MOTION_DISABLED_REASON =
  "Water motion is off because your device is set to reduce motion.";

/** Phones and tablets (coarse pointer) start with vegetation off; it can be switched on. */
export function defaultVegetationOn(coarsePointer: boolean): boolean {
  return !coarsePointer;
}

export interface EffectInputs {
  /** The visitor's toggles (layer on/off). */
  vegetation: boolean;
  waterMotion: boolean;
  /** Automatic quality level: 2 full, 1 reduced, 0 minimal. */
  level: QualityLevel;
  /** prefers-reduced-motion: reduce. */
  reducedMotion: boolean;
}

export interface EffectiveEffects {
  vegetation: boolean;
  waterAnimation: boolean;
}

/** What is really drawn: the visitor's choice, limited by quality level and motion preference. */
export function effectiveEffects(i: EffectInputs): EffectiveEffects {
  return {
    vegetation: i.vegetation && i.level >= 1,
    waterAnimation: i.waterMotion && i.level >= 2 && !i.reducedMotion,
  };
}

/**
 * The toast to show after a quality change: only when the level went DOWN and something
 * that was visible actually got switched off (so it never claims a reduction that the
 * visitor could not see). Upgrades are silent.
 */
export function degradeMessage(
  level: QualityLevel,
  previous: QualityLevel,
  before: EffectiveEffects,
  after: EffectiveEffects,
): string | null {
  if (level >= previous) return null;
  const lost = (before.vegetation && !after.vegetation) || (before.waterAnimation && !after.waterAnimation);
  return lost ? REDUCED_EFFECTS_MESSAGE : null;
}
```

`viewer/src/a11y.ts`:

```ts
/** Pure accessibility helpers: WCAG contrast maths and a live-region announcement trick. */

function channel(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance of an 0xRRGGBB colour (0 = black, 1 = white). */
export function relativeLuminance(hex: number): number {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two 0xRRGGBB colours: 1 (identical) .. 21 (black on white). */
export function contrastRatio(hexA: number, hexB: number): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** True when the pair reaches `minRatio` (4.5 for normal text, 3 for large text and UI parts). */
export function meetsContrast(hexA: number, hexB: number, minRatio: number): boolean {
  // The tiny epsilon keeps exact-threshold pairs (e.g. 21:1) from failing on rounding.
  return contrastRatio(hexA, hexB) + 1e-9 >= minRatio;
}

/** `fg` at opacity `alpha` composited over opaque `bg`, as 0xRRGGBB. */
export function blend(fg: number, alpha: number, bg: number): number {
  const a = Math.min(1, Math.max(0, alpha));
  const mix = (shift: number) => {
    const f = (fg >> shift) & 255;
    const b = (bg >> shift) & 255;
    return Math.round(f * a + b * (1 - a)) & 255;
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/**
 * Live regions only announce CHANGES, so saying the same thing twice in a row is silent.
 * Returns `text`, or `text` plus a trailing no-break space when it equals `previous`
 * (alternating, so the result always differs from the last message).
 */
export function nextAnnouncement(text: string, previous: string): string {
  if (text !== previous) return text;
  return previous.endsWith(" ") ? text : `${text} `;
}
```

`viewer/src/theme.ts`:

```ts
/** Colours shared between the 3D scene and the page. */

/** Behind the map (scene.background). The page keeps this light colour in dark mode too. */
export const SCENE_BACKGROUND = 0xdfe6e9;
```

`viewer/src/water/idleAnimator.ts`:

```ts
/**
 * Keeps the render loop ticking at a low, fixed rate while something (the water) is
 * animating and the visitor is NOT interacting. The app renders on demand, so without
 * this the water would freeze whenever the camera is still.
 *
 * Throttled to `fps` requests per second, and only while enabled() is true AND the page
 * is visible; otherwise it just polls slowly (IDLE_POLL_MS) so it resumes by itself.
 * Nothing is scheduled before start() or after stop().
 */
export interface IdleAnimatorOptions {
  /** Maximum requestRender calls per second. Default 15. */
  fps?: number;
  /** Is there anything to animate right now? */
  enabled: () => boolean;
  /** Is the page visible? Default: document.visibilityState !== "hidden". */
  isVisible?: () => boolean;
  /** Clock in ms. Default performance.now(). */
  now?: () => number;
  /** Timer functions (injectable for tests). Default setTimeout / clearTimeout. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface IdleAnimator {
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

/** How often to look again while disabled or hidden. */
export const IDLE_POLL_MS = 500;

export function createIdleAnimator(requestRender: () => void, opts: IdleAnimatorOptions): IdleAnimator {
  const fps = Math.max(1, opts.fps ?? 15);
  const interval = 1000 / fps;
  const isVisible =
    opts.isVisible ?? (() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const now = opts.now ?? (() => performance.now());
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let running = false;
  let handle: unknown = null;
  let lastRequest = -Infinity;

  const schedule = (ms: number) => {
    handle = setTimer(tick, ms);
  };
  const tick = () => {
    handle = null;
    if (!running) return;
    if (!opts.enabled() || !isVisible()) {
      schedule(IDLE_POLL_MS);
      return;
    }
    const t = now();
    // Timers can fire a little early or late; never exceed the frame budget.
    if (t - lastRequest >= interval - 1) {
      lastRequest = t;
      try {
        requestRender();
      } catch (err) {
        console.error("idle animator render request failed", err);
      }
    }
    schedule(interval);
  };

  return {
    start() {
      if (running) return;
      running = true;
      schedule(interval);
    },
    stop() {
      running = false;
      if (handle !== null) {
        clearTimer(handle);
        handle = null;
      }
    },
    isRunning: () => running,
  };
}
```

`viewer/src/water/waterMaterial.ts` (the GLSL could not be compiled in Node; the tests pin the patch anchors against three's own shader source, and Task 12 checks it in a real WebGL context):

```ts
import * as THREE from "three";

/** The old static look: translucent blue plane. */
export const WATER_COLOR = 0x3f7fa6;
export const WATER_OPACITY = 0.8;
/** Tilt (dimensionless slope) of the animated normal; 0.18 is about 10 degrees at most. */
export const WAVE_SLOPE = 0.18;
/** Sharpness and strength of the sun glint (only while animated). */
export const GLINT_POWER = 18;
export const GLINT_STRENGTH = 0.55;

export interface WaterMaterial {
  material: THREE.MeshStandardMaterial;
  /** Seconds, any origin; call before each render while animated. */
  setTime(t: number): void;
  /** Off: amplitude 0, identical to the old static plane. */
  setAnimated(on: boolean): void;
}

const f = (n: number) => n.toFixed(4);

/** Declarations added to the vertex shader (after #include <common>). */
export const VERTEX_PARS = /* glsl */ `
varying vec2 vWaterXZ;
`;
/** Added to the vertex shader after #include <project_vertex>. */
export const VERTEX_BODY = /* glsl */ `
vWaterXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz; // world position on the water plane
`;
/** Declarations added to the fragment shader (after #include <common>). */
export const FRAGMENT_PARS = /* glsl */ `
uniform float uTime; // seconds
uniform float uAmp;  // wave slope; 0 = static plane
varying vec2 vWaterXZ;
`;
/**
 * Added after #include <normal_fragment_maps>. Two crossed travelling sine waves in
 * world XZ (wavelengths ~100 m and ~90 m, at roughly right angles); the slope of their
 * sum tilts the world-space up vector, which is then rotated into view space. With
 * uAmp = 0 the branch is skipped and the normal is the plane's own.
 */
export const FRAGMENT_NORMAL = /* glsl */ `
if ( uAmp > 0.0 ) {
	float w1 = dot( vWaterXZ, vec2( 0.055, 0.030 ) ) + uTime * 0.9;
	float w2 = dot( vWaterXZ, vec2( -0.034, 0.061 ) ) + uTime * 1.3;
	// cos() is the derivative of sin(); the vec2s are the unit directions of the two waves
	vec2 slope = uAmp * 0.5 * ( cos( w1 ) * vec2( 0.878, 0.479 ) + cos( w2 ) * vec2( -0.487, 0.874 ) );
	vec3 nWorld = normalize( vec3( -slope.x, 1.0, -slope.y ) );
	normal = normalize( ( viewMatrix * vec4( nWorld, 0.0 ) ).xyz );
}
`;
/**
 * Added before #include <opaque_fragment>: a soft glint where the perturbed normal faces
 * the half vector between the sun (same direction as the scene's DirectionalLight) and
 * the viewer. Only while animated, so the static plane is unchanged.
 */
export const FRAGMENT_GLINT = /* glsl */ `
if ( uAmp > 0.0 ) {
	const vec3 SUN_WORLD = vec3( -0.5976, 0.7171, 0.3586 ); // normalize( -1, 1.2, 0.6 )
	vec3 sunView = normalize( ( viewMatrix * vec4( SUN_WORLD, 0.0 ) ).xyz );
	vec3 halfV = normalize( sunView + geometryViewDir );
	float glint = pow( max( dot( normal, halfV ), 0.0 ), ${f(GLINT_POWER)} );
	outgoingLight += vec3( 1.0, 0.96, 0.85 ) * glint * ${f(GLINT_STRENGTH)};
}
`;

function replaceOnce(source: string, anchor: string, withText: string): string {
  if (!source.includes(anchor)) throw new Error(`water shader patch: anchor ${anchor} not found`);
  return source.replace(anchor, withText);
}

/** Patch three's standard-material shader source (exported so tests can check the anchors). */
export function patchWaterShaders(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = replaceOnce(shader.vertexShader, "#include <common>", `#include <common>${VERTEX_PARS}`);
  shader.vertexShader = replaceOnce(
    shader.vertexShader,
    "#include <project_vertex>",
    `#include <project_vertex>${VERTEX_BODY}`,
  );
  shader.fragmentShader = replaceOnce(shader.fragmentShader, "#include <common>", `#include <common>${FRAGMENT_PARS}`);
  shader.fragmentShader = replaceOnce(
    shader.fragmentShader,
    "#include <normal_fragment_maps>",
    `#include <normal_fragment_maps>${FRAGMENT_NORMAL}`,
  );
  shader.fragmentShader = replaceOnce(
    shader.fragmentShader,
    "#include <opaque_fragment>",
    `${FRAGMENT_GLINT}#include <opaque_fragment>`,
  );
}

export function createWaterMaterial(): WaterMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: WATER_COLOR,
    transparent: true,
    opacity: WATER_OPACITY,
  });
  // Shared uniform objects: updating .value reaches every compiled program.
  const uTime = { value: 0 };
  const uAmp = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uAmp = uAmp;
    patchWaterShaders(shader);
  };
  // All water materials share one patch, so they can share one program.
  material.customProgramCacheKey = () => "yelamu-water-v1";
  return {
    material,
    setTime(t) {
      if (Number.isFinite(t)) uTime.value = t;
    },
    setAnimated(on) {
      uAmp.value = on ? WAVE_SLOPE : 0;
    },
  };
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `cd viewer && npm test && npx tsc --noEmit`
Expected: 18 + 11 + 12 + 10 + 8 = **59** new tests, **392** in total (still including the one skipped test); `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add viewer/src/quality.ts viewer/src/quality.test.ts viewer/src/effects.ts viewer/src/effects.test.ts viewer/src/a11y.ts viewer/src/a11y.test.ts viewer/src/theme.ts viewer/src/water
git commit -m "feat(viewer): quality controller, animated water material, contrast helpers"
```

---

### Task 9: Vegetation and the chunk hooks

Deterministic placement per chunk from the habitat raster, three shared low-poly shapes, and a layer that plants chunks as they are built and frees them when they are evicted. `TerrainChunks` gains two hooks.

**Files:**
- Modify: `viewer/src/terrainChunks.ts`, `viewer/src/terrainChunks.test.ts`
- Create: `viewer/src/vegetation/placement.ts`, `geometry.ts`, `layer.ts` and a `*.test.ts` for each

- [ ] **Step 1: Write the failing tests**

Replace `viewer/src/terrainChunks.test.ts` (the existing tests are kept; five hook and lifecycle tests are new):

```ts
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { ChunkPlan } from "./chunks";
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

  it("follows setSwitchZoom on the next update (both directions)", () => {
    const t = make({ switchZoom: 2 });
    const cam = camera(-100, -100, 400, 3);
    t.update(cam);
    expect(t.stats().lod).toBe(0);
    t.setSwitchZoom(4); // e.g. the window got wider: more chunks fit, switch later
    t.update(cam);
    expect(t.stats()).toMatchObject({ lod: 1, lod0Visible: 0, lod1Visible: 16 });
    t.setSwitchZoom(1.5);
    t.update(cam);
    expect(t.stats().lod).toBe(0);
    expect(t.stats().lod0Visible).toBeGreaterThan(0);
    t.dispose();
  });

  it("keeps LOD1 visible under in-view chunks whose LOD0 is not built yet (no holes)", () => {
    const t = make({ maxBuildsPerUpdate: 1 });
    // View 200 m at zoom 2 -> 100 m square around the origin: 2 x 2 chunks in view.
    const cam = camera(0, 0, 200, 2);
    const inViewLod1 = () => visible(t, 1).length;
    expect(t.update(cam)).toBe(true);
    expect(visible(t, 0)).toHaveLength(1);
    expect(inViewLod1()).toBe(3); // the other three in-view chunks still show LOD1
    // The visible LOD1 chunks are exactly the in-view chunks without a visible LOD0.
    const covered = (m: THREE.Mesh) => {
      m.geometry.computeBoundingBox();
      return m.geometry.boundingBox!;
    };
    const lod0Box = covered(visible(t, 0)[0]);
    for (const m of visible(t, 1)) {
      const b = covered(m);
      expect(b.min.x === lod0Box.min.x && b.min.z === lod0Box.min.z).toBe(false);
    }
    expect(t.update(cam)).toBe(true);
    expect(visible(t, 0)).toHaveLength(2);
    expect(inViewLod1()).toBe(2);
    expect(t.update(cam)).toBe(true);
    expect(t.update(cam)).toBe(false);
    expect(visible(t, 0)).toHaveLength(4);
    expect(inViewLod1()).toBe(0); // out-of-view chunks have neither
    expect(visible(t, 0).length + inViewLod1()).toBe(4);
    t.dispose();
  });

  it("drops LOD1 under a chunk that leaves the view while LOD0 is pending", () => {
    const t = make({ maxBuildsPerUpdate: 1 });
    t.update(camera(0, 0, 200, 2));
    t.update(camera(-120, -120, 100, 2)); // 50 m square inside one corner chunk
    expect(visible(t, 0).length + visible(t, 1).length).toBe(1);
    t.dispose();
  });

  it("returns LOD0 memory to the base capacity once back at LOD1", () => {
    const t = make({ lruCapacity: 2, maxBuildsPerUpdate: 100 });
    t.update(camera(0, 0, 800, 2)); // all 16 in view: capacity grows, 16 resident
    expect(t.stats().lod0Resident).toBe(16);
    t.update(camera(0, 0, 800, 1)); // zoomed out -> LOD1
    expect(t.stats()).toMatchObject({ lod: 1, lod0Resident: 2, lod0Visible: 0 });
    expect(lodMeshes(t, 0)).toHaveLength(2);
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

  describe("hooks", () => {
    function hooked(opts: Partial<ConstructorParameters<typeof TerrainChunks>[5]> = {}) {
      const built: Array<[ChunkPlan, THREE.Mesh]> = [];
      const evicted: Array<[ChunkPlan, THREE.Mesh, boolean, boolean]> = [];
      let t!: TerrainChunks;
      t = make({
        hooks: {
          onLod0Built: (plan, mesh) => built.push([plan, mesh]),
          // record what the hook can still see at eviction time
          onLod0Evicted: (plan, mesh) =>
            evicted.push([plan, mesh, t.root.children.includes(mesh), mesh.geometry.getAttribute("position") !== undefined]),
        },
        ...opts,
      });
      return { t, built, evicted };
    }

    it("fires onLod0Built once per built chunk, after the mesh is added, with its plan", () => {
      const { t, built } = hooked();
      expect(built).toHaveLength(0); // LOD1 meshes never fire hooks
      t.update(camera(-100, -100, 400, 4));
      expect(built).toHaveLength(4);
      for (const [plan, mesh] of built) {
        expect(mesh.userData.lod).toBe(0);
        expect(t.root.children.includes(mesh)).toBe(true);
        expect(mesh.userData.plan).toBe(plan);
        expect(typeof plan.cx).toBe("number");
      }
      // cached chunks are not announced again
      t.update(camera(-100, -100, 400, 4));
      t.update(camera(-100, -100, 400, 1));
      t.update(camera(-100, -100, 400, 4));
      expect(built).toHaveLength(4);
      t.dispose();
    });

    it("fires onLod0Evicted once per eviction, before the geometry is disposed and the mesh removed", () => {
      const { t, built, evicted } = hooked({ lruCapacity: 2 });
      t.update(camera(-100, -100, 400, 12));
      const first = built[0][1];
      let disposedAtHook: boolean | null = null;
      first.geometry.addEventListener("dispose", () => {
        disposedAtHook = evicted.length > 0; // the hook has already run
      });
      t.update(camera(100, -100, 400, 12));
      expect(evicted).toHaveLength(0);
      t.update(camera(100, 100, 400, 12)); // third chunk evicts the first
      expect(built).toHaveLength(3);
      expect(evicted).toHaveLength(1);
      const [plan, mesh, stillChild, hasGeometry] = evicted[0];
      expect(mesh).toBe(first);
      expect(plan).toBe(built[0][0]);
      expect(stillChild).toBe(true); // not yet removed from root
      expect(hasGeometry).toBe(true);
      expect(disposedAtHook).toBe(true);
      expect(t.root.children.includes(first)).toBe(false);
      t.dispose();
    });

    it("announces evictions of everything on dispose", () => {
      const { t, built, evicted } = hooked();
      t.update(camera(-100, -100, 400, 4));
      t.dispose();
      expect(evicted).toHaveLength(built.length);
    });

    it("survives a throwing hook", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const t = make({
        hooks: {
          onLod0Built: () => {
            throw new Error("boom");
          },
          onLod0Evicted: () => {
            throw new Error("boom");
          },
        },
        lruCapacity: 1,
      });
      expect(() => {
        t.update(camera(-100, -100, 400, 12));
        t.update(camera(100, 100, 400, 12));
      }).not.toThrow();
      expect(t.stats().lod0Resident).toBe(1);
      t.dispose();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("exposes the visible LOD0 meshes", () => {
      const t = make();
      t.update(camera(-100, -100, 400, 4));
      expect(t.visibleLod0Meshes().size).toBe(4);
      t.update(camera(-100, -100, 400, 1));
      expect(t.visibleLod0Meshes().size).toBe(0);
      t.dispose();
    });
  });
});
```

`viewer/src/vegetation/placement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planChunks, type ChunkPlan } from "../chunks";
import { GROUP_COLORS, type HabitatClass } from "../habitat";
import {
  MAX_SLOPE_DEG,
  VEGETATION_BY_GROUP,
  chunkSeed,
  groupNameForClass,
  heightOnMesh,
  placeChunkVegetation,
  vegetationForGroup,
} from "./placement";

const CLASSES: HabitatClass[] = [
  { id: 0, name: "Unmapped", group: "unmapped" },
  { id: 1, name: "Bay", group: "water" },
  { id: 2, name: "Marsh", group: "marsh" },
  { id: 3, name: "Dune", group: "dune" },
  { id: 4, name: "Beach", group: "beach" },
  { id: 5, name: "Oak", group: "woodland" },
  { id: 7, name: "Prairie", group: "grassland" },
  { id: 9, name: "Scrub", group: "scrub" },
  { id: 10, name: "Willow", group: "wetland" },
  { id: 11, name: "Rock", group: "rock" },
  { id: 12, name: "Odd", group: "no-such-group" },
];
const groupOf = groupNameForClass(CLASSES);
const WATER = 0.6;

interface Grid {
  size: { width: number; height: number; cell_m: number };
  heights: Float32Array;
  habitat: Uint8Array;
}
function grid(
  width: number,
  height: number,
  heightAt: (x: number, y: number) => number,
  classAt: (x: number, y: number) => number,
  cell_m = 10,
): Grid {
  const heights = new Float32Array(width * height);
  const habitat = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      heights[y * width + x] = heightAt(x, y);
      habitat[y * width + x] = classAt(x, y);
    }
  }
  return { size: { width, height, cell_m }, heights, habitat };
}

function place(g: Grid, chunk: ChunkPlan, over: Partial<Parameters<typeof placeChunkVegetation>[0]> = {}) {
  return placeChunkVegetation({
    chunk,
    size: g.size,
    heights: g.heights,
    habitat: g.habitat,
    groupOfClass: groupOf,
    waterLevelM: WATER,
    seed: 1234,
    maxInstances: 100_000,
    ...over,
  });
}

/** Sample-space position of an instance (inverse of the world mapping in terrainMesh.ts). */
const toSample = (g: Grid, v: { x: number; z: number }) => ({
  px: v.x / g.size.cell_m + (g.size.width - 1) / 2,
  py: v.z / g.size.cell_m + (g.size.height - 1) / 2,
});

describe("VEGETATION_BY_GROUP", () => {
  it("has the specified table", () => {
    const t = VEGETATION_BY_GROUP;
    expect(t.woodland).toMatchObject({ kind: "tree", perHectare: 45 });
    expect(t.scrub).toMatchObject({ kind: "shrub", perHectare: 70 });
    expect(t.grassland).toMatchObject({ kind: "shrub", perHectare: 6 });
    expect(t.dune).toMatchObject({ kind: "shrub", perHectare: 8 });
    expect(t.wetland).toMatchObject({ kind: "reed", perHectare: 60 });
    expect(t.marsh).toMatchObject({ kind: "reed", perHectare: 90 });
    for (const g of ["beach", "water", "rock", "unmapped"]) expect(t[g]).toBeNull();
  });
  it("covers every habitat group and has sane scale ranges", () => {
    for (const g of Object.keys(GROUP_COLORS)) expect(Object.hasOwn(VEGETATION_BY_GROUP, g)).toBe(true);
    for (const spec of Object.values(VEGETATION_BY_GROUP)) {
      if (!spec) continue;
      expect(spec.minScale).toBeGreaterThan(0);
      expect(spec.maxScale).toBeGreaterThanOrEqual(spec.minScale);
      expect(spec.perHectare).toBeGreaterThan(0);
    }
  });
  it("vegetationForGroup ignores prototype keys and unknown groups", () => {
    expect(vegetationForGroup("woodland")?.kind).toBe("tree");
    expect(vegetationForGroup("toString")).toBeNull();
    expect(vegetationForGroup("nope")).toBeNull();
  });
});

describe("groupNameForClass", () => {
  it("maps ids to groups; unknown ids and unknown groups are unmapped", () => {
    expect(groupOf(5)).toBe("woodland");
    expect(groupOf(1)).toBe("water");
    expect(groupOf(12)).toBe("unmapped");
    expect(groupOf(200)).toBe("unmapped");
    expect(groupNameForClass([])(3)).toBe("unmapped");
  });
});

describe("chunkSeed", () => {
  it("is deterministic and depends on every argument", () => {
    expect(chunkSeed(1, 2, 3)).toBe(chunkSeed(1, 2, 3));
    const seeds = new Set([chunkSeed(1, 2, 3), chunkSeed(2, 2, 3), chunkSeed(1, 3, 3), chunkSeed(1, 2, 4), chunkSeed(1, 3, 2)]);
    expect(seeds.size).toBe(5);
    expect(Number.isInteger(chunkSeed(1, 2, 3))).toBe(true);
  });
});

describe("heightOnMesh", () => {
  it("interpolates exactly on the rendered triangles (diagonal SW-NE)", () => {
    // 2x2 samples: a=NW=0, c=NE=10, b=SW=20, d=SE=40
    const h = new Float32Array([0, 10, 20, 40]);
    const size = { width: 2, height: 2, cell_m: 1 };
    expect(heightOnMesh(h, size, 0, 0)).toBe(0);
    expect(heightOnMesh(h, size, 1, 0)).toBe(10);
    expect(heightOnMesh(h, size, 0, 1)).toBe(20);
    expect(heightOnMesh(h, size, 1, 1)).toBe(40);
    // on the diagonal b-c (u+v=1) both triangles agree: midpoint of 20 and 10
    expect(heightOnMesh(h, size, 0.5, 0.5)).toBeCloseTo(15, 5);
    // inside triangle (a,b,c): a + u(c-a) + v(b-a)
    expect(heightOnMesh(h, size, 0.25, 0.25)).toBeCloseTo(0 + 0.25 * 10 + 0.25 * 20, 5);
    // inside triangle (b,d,c): d + (1-u)(b-d) + (1-v)(c-d)
    expect(heightOnMesh(h, size, 0.75, 0.75)).toBeCloseTo(40 + 0.25 * (20 - 40) + 0.25 * (10 - 40), 5);
  });
});

describe("placeChunkVegetation", () => {
  const woodland = grid(129, 129, () => 50, () => 5);
  const full = planChunks(129, 129, 128)[0];

  it("is deterministic", () => {
    const a = place(woodland, full);
    const b = place(woodland, full);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it("differs for different seeds and different chunks", () => {
    const a = place(woodland, full);
    const b = place(woodland, full, { seed: 99 });
    expect(b).not.toEqual(a);
    const g = grid(257, 129, () => 50, () => 5);
    const [c0, c1] = planChunks(257, 129, 128);
    const p0 = place(g, c0);
    const p1 = place(g, c1);
    // same relative layout would mean the seed ignored the chunk index
    const rel = (list: typeof p0, chunk: ChunkPlan) =>
      list.slice(0, 5).map((v) => [toSample(g, v).px - chunk.x0, toSample(g, v).py - chunk.y0]);
    expect(rel(p1, c1)).not.toEqual(rel(p0, c0));
  });

  it("reaches the expected density on a big woodland patch (within 15%)", () => {
    const list = place(woodland, full);
    const hectares = (128 * 10 * 128 * 10) / 10_000;
    const expected = 45 * hectares;
    expect(list.length).toBeGreaterThan(expected * 0.85);
    expect(list.length).toBeLessThan(expected * 1.15);
    expect(list.every((v) => v.kind === "tree" && v.group === "woodland")).toBe(true);
  });

  it("reaches the expected density for each vegetated group", () => {
    for (const [classId, group] of [
      [9, "scrub"],
      [3, "dune"],
      [7, "grassland"],
      [10, "wetland"],
      [2, "marsh"],
    ] as const) {
      const g = grid(129, 129, () => 50, () => classId);
      const list = place(g, full);
      const expected = VEGETATION_BY_GROUP[group]!.perHectare * 163.84;
      // sparse groups have few instances, so allow more relative noise there
      const tol = expected > 500 ? 0.15 : 0.3;
      expect(list.length, group).toBeGreaterThan(expected * (1 - tol));
      expect(list.length, group).toBeLessThan(expected * (1 + tol));
    }
  });

  it("does not double count shared chunk borders", () => {
    const g = grid(257, 129, () => 50, () => 5);
    const [c0, c1] = planChunks(257, 129, 128);
    const total = place(g, c0).length + place(g, c1).length;
    const expected = 45 * (256 * 128 * 100) / 10_000;
    expect(total).toBeGreaterThan(expected * 0.9);
    expect(total).toBeLessThan(expected * 1.1);
  });

  it("respects maxInstances and thins uniformly and deterministically", () => {
    // west half woodland (trees), east half scrub (shrubs): thinning must keep the mix and the spread
    const g = grid(129, 129, () => 50, (x) => (x < 64 ? 5 : 9));
    const all = place(g, full);
    const capped = place(g, full, { maxInstances: 1500 });
    expect(capped.length).toBe(1500);
    expect(place(g, full, { maxInstances: 1500 })).toEqual(capped);
    // every kept instance is one of the unthinned ones
    const key = (v: { x: number; z: number }) => `${v.x},${v.z}`;
    const allKeys = new Set(all.map(key));
    expect(capped.every((v) => allKeys.has(key(v)))).toBe(true);
    // the share of trees is preserved (within a few points)
    const share = (l: typeof all) => l.filter((v) => v.kind === "tree").length / l.length;
    expect(Math.abs(share(capped) - share(all))).toBeLessThan(0.04);
    // spread: each quadrant keeps about its proportional part
    const quad = (l: typeof all) => {
      const q = [0, 0, 0, 0];
      for (const v of l) {
        const { px, py } = toSample(g, v);
        q[(px < 64 ? 0 : 1) + (py < 64 ? 0 : 2)]++;
      }
      return q.map((n) => n / l.length);
    };
    const qa = quad(all);
    const qc = quad(capped);
    for (let i = 0; i < 4; i++) expect(Math.abs(qa[i] - qc[i])).toBeLessThan(0.04);
    // exactly at the limit and below it: nothing is removed
    expect(place(g, full, { maxInstances: all.length })).toEqual(all);
    expect(place(g, full, { maxInstances: 0 })).toEqual([]);
  });

  it("puts nothing on water, unmapped, beach, rock or unknown groups", () => {
    for (const classId of [0, 1, 4, 11, 12, 99]) {
      const g = grid(65, 65, () => 50, () => classId);
      expect(place(g, planChunks(65, 65, 64)[0]), `class ${classId}`).toEqual([]);
    }
  });

  it("assigns each instance the group and kind of the sample it stands on", () => {
    // vertical stripes of classes
    const stripes = [5, 4, 9, 11, 10, 1, 3, 0];
    const g = grid(129, 65, () => 50, (x) => stripes[Math.floor(x / 16) % stripes.length]);
    const list = place(g, planChunks(129, 65, 128)[0]);
    expect(list.length).toBeGreaterThan(100);
    const kinds = { woodland: "tree", scrub: "shrub", wetland: "reed", dune: "shrub" } as Record<string, string>;
    const seen = new Set<string>();
    for (const v of list) {
      const { px, py } = toSample(g, v);
      const id = g.habitat[Math.round(py) * 129 + Math.round(px)];
      expect(groupOf(id)).toBe(v.group);
      expect(v.kind).toBe(kinds[v.group]);
      seen.add(v.group);
    }
    expect([...seen].sort()).toEqual(["dune", "scrub", "wetland", "woodland"]);
  });

  it("keeps trees and shrubs off the shore band but lets reeds reach the water line", () => {
    const wl = WATER;
    for (const [classId, kind, offset, expectAny] of [
      [5, "tree", 0.2, false], // <= water + 0.3
      [9, "shrub", 0.29, false],
      [5, "tree", 0.35, true],
      [10, "reed", 0.1, true], // wetland reeds down to water + 0.05
      [2, "reed", 0.1, true],
      [2, "reed", 0.02, false],
      [2, "reed", -0.5, false], // marsh below water level: tidal, no reeds
    ] as const) {
      const g = grid(65, 65, () => wl + offset, () => classId);
      const list = place(g, planChunks(65, 65, 64)[0]);
      expect(list.length > 0, `${kind} at +${offset}`).toBe(expectAny);
      if (expectAny) expect(list.every((v) => v.kind === kind)).toBe(true);
    }
  });

  it("skips ground steeper than 35 degrees but keeps gentle slopes", () => {
    const rise = (deg: number) => Math.tan((deg * Math.PI) / 180) * 10; // metres per 10 m cell
    expect(MAX_SLOPE_DEG).toBe(35);
    const steep = grid(65, 65, (x) => 20 + x * rise(40), () => 5);
    expect(place(steep, planChunks(65, 65, 64)[0])).toEqual([]);
    const gentle = grid(65, 65, (x) => 20 + x * rise(30), () => 5);
    expect(place(gentle, planChunks(65, 65, 64)[0]).length).toBeGreaterThan(100);
    // a steep half and a gentle half: trees only on the gentle side
    const mixed = grid(65, 65, (x) => 20 + (x < 32 ? x * rise(45) : 32 * rise(45) + (x - 32) * rise(10)), () => 5);
    const list = place(mixed, planChunks(65, 65, 64)[0]);
    expect(list.length).toBeGreaterThan(50);
    for (const v of list) expect(toSample(mixed, v).px).toBeGreaterThan(31.4);
  });

  it("stands every instance on the rendered surface (un-exaggerated height)", () => {
    const g = grid(65, 65, (x, y) => 20 + 3 * Math.sin(x / 7) + 2 * Math.cos(y / 5), () => 5);
    const list = place(g, planChunks(65, 65, 64)[0]);
    expect(list.length).toBeGreaterThan(50);
    for (const v of list) {
      const { px, py } = toSample(g, v);
      expect(v.y).toBeCloseTo(heightOnMesh(g.heights, g.size, px, py), 4);
    }
  });

  it("keeps positions inside the chunk (world frame of terrainMesh.ts)", () => {
    const g = grid(300, 200, () => 50, () => 5);
    const plan = planChunks(300, 200, 128);
    for (const chunk of plan) {
      const list = place(g, chunk, { maxInstances: 100_000 });
      expect(list.length).toBeGreaterThan(0);
      const cx = (g.size.width - 1) / 2;
      const cz = (g.size.height - 1) / 2;
      const xMin = (chunk.x0 - cx) * 10;
      const xMax = (chunk.x0 + chunk.w - cx) * 10;
      const zMin = (chunk.y0 - cz) * 10;
      const zMax = (chunk.y0 + chunk.h - cz) * 10;
      for (const v of list) {
        expect(v.x).toBeGreaterThanOrEqual(xMin);
        expect(v.x).toBeLessThanOrEqual(xMax);
        expect(v.z).toBeGreaterThanOrEqual(zMin);
        expect(v.z).toBeLessThanOrEqual(zMax);
      }
    }
  });

  it("keeps scale within the group's range and rotation within a turn", () => {
    const g = grid(129, 129, () => 50, (x) => [5, 9, 3, 10][Math.floor(x / 32) % 4]);
    const list = place(g, full);
    expect(list.length).toBeGreaterThan(200);
    for (const v of list) {
      const spec = VEGETATION_BY_GROUP[v.group]!;
      expect(v.scale).toBeGreaterThanOrEqual(spec.minScale);
      expect(v.scale).toBeLessThanOrEqual(spec.maxScale);
      expect(v.rotation).toBeGreaterThanOrEqual(0);
      expect(v.rotation).toBeLessThan(Math.PI * 2);
    }
    // the scale actually varies
    expect(new Set(list.filter((v) => v.kind === "tree").map((v) => v.scale)).size).toBeGreaterThan(10);
  });

  it("handles partial edge chunks and tiny grids", () => {
    const g = grid(70, 70, () => 50, () => 9);
    const plan = planChunks(70, 70, 64);
    expect(plan).toHaveLength(4);
    const last = plan[3]; // 5x5 cells
    const list = place(g, last);
    for (const v of list) {
      const { px, py } = toSample(g, v);
      expect(px).toBeGreaterThanOrEqual(last.x0);
      expect(px).toBeLessThanOrEqual(last.x0 + last.w);
      expect(py).toBeGreaterThanOrEqual(last.y0);
      expect(py).toBeLessThanOrEqual(last.y0 + last.h);
    }
    const tiny = grid(2, 2, () => 50, () => 9);
    expect(() => place(tiny, planChunks(2, 2, 64)[0])).not.toThrow();
  });

  it("rejects mismatched array sizes", () => {
    const g = grid(33, 33, () => 50, () => 5);
    expect(() => place(g, planChunks(33, 33, 32)[0], { heights: new Float32Array(10) })).toThrow();
    expect(() => place(g, planChunks(33, 33, 32)[0], { habitat: new Uint8Array(10) })).toThrow();
  });
});
```

`viewer/src/vegetation/geometry.test.ts`:

```ts
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import mergeGeometries, { TINT_RANGE, makeVegetationGeometries, makeVegetationMaterial, tintFor } from "./geometry";
import { mulberry32 } from "../randomLand";

describe("mergeGeometries", () => {
  it("concatenates positions, normals and colours of non-indexed parts", () => {
    const a = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const b = new THREE.TetrahedronGeometry(1, 0).toNonIndexed();
    const ca = a.getAttribute("position").count;
    const cb = b.getAttribute("position").count;
    const m = mergeGeometries([
      { geometry: a, color: [1, 0, 0] },
      { geometry: b, color: [0, 0, 1] },
    ]);
    expect(m.getIndex()).toBeNull();
    expect(m.getAttribute("position").count).toBe(ca + cb);
    expect(m.getAttribute("normal").count).toBe(ca + cb);
    const color = m.getAttribute("color");
    expect([color.getX(0), color.getY(0), color.getZ(0)]).toEqual([1, 0, 0]);
    expect([color.getX(ca), color.getY(ca), color.getZ(ca)]).toEqual([0, 0, 1]);
    expect(m.boundingBox).not.toBeNull();
  });
  it("also accepts indexed parts", () => {
    const m = mergeGeometries([{ geometry: new THREE.ConeGeometry(1, 1, 6), color: [0, 1, 0] }]);
    expect(m.getIndex()).toBeNull();
    expect(m.getAttribute("position").count).toBeGreaterThan(0);
  });
});

describe("vegetation geometries", () => {
  const geos = makeVegetationGeometries();
  const bbox = (g: THREE.BufferGeometry) => {
    g.computeBoundingBox();
    return g.boundingBox!;
  };

  it("builds a tree, a shrub and a reed with vertex colours", () => {
    for (const g of [geos.tree, geos.shrub, geos.reed]) {
      const pos = g.getAttribute("position");
      expect(pos.count).toBeGreaterThan(0);
      expect(pos.count % 3).toBe(0);
      expect(g.getAttribute("color").count).toBe(pos.count);
      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
      }
    }
  });

  it("is low poly", () => {
    expect(geos.tree.getAttribute("position").count / 3).toBeLessThan(60);
    expect(geos.shrub.getAttribute("position").count / 3).toBeLessThan(60);
    expect(geos.reed.getAttribute("position").count / 3).toBeLessThan(40);
  });

  it("has unit height trees, with the trunk base a little below the ground", () => {
    const b = bbox(geos.tree);
    expect(b.max.y).toBeCloseTo(1, 5);
    expect(b.min.y).toBeLessThan(0);
    expect(b.min.y).toBeGreaterThan(-0.15);
    expect(b.max.x).toBeLessThan(0.5);
    expect(b.max.x).toBeGreaterThan(0.2);
  });

  it("has a squashed shrub of radius about 1 that does not go far below ground", () => {
    const b = bbox(geos.shrub);
    expect(b.max.y).toBeGreaterThan(0.5);
    expect(b.max.y).toBeLessThan(1);
    expect(b.min.y).toBeGreaterThanOrEqual(-0.5);
    expect(b.max.x).toBeLessThanOrEqual(1.0001);
  });

  it("has thin tall reeds", () => {
    const b = bbox(geos.reed);
    expect(b.max.y).toBeCloseTo(1, 1);
    expect(b.max.x - b.min.x).toBeLessThan(0.6);
  });

  it("makes a vertex-coloured flat-shaded standard material", () => {
    const m = makeVegetationMaterial();
    expect(m).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(m.vertexColors).toBe(true);
    expect(m.flatShading).toBe(true);
  });
});

describe("tintFor", () => {
  const groups = ["woodland", "scrub", "grassland", "dune", "wetland", "marsh", "unknown-group"];

  it("returns three multipliers within the tint range", () => {
    const rng = mulberry32(5);
    for (const g of groups) {
      for (let i = 0; i < 200; i++) {
        const t = tintFor(g, rng);
        expect(t).toHaveLength(3);
        for (const c of t) {
          expect(c).toBeGreaterThanOrEqual(TINT_RANGE.min);
          expect(c).toBeLessThanOrEqual(TINT_RANGE.max);
        }
      }
    }
  });

  it("is deterministic for a given rng stream and varies between draws", () => {
    const a = tintFor("woodland", mulberry32(9));
    const b = tintFor("woodland", mulberry32(9));
    expect(a).toEqual(b);
    const rng = mulberry32(9);
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(tintFor("woodland", rng).join(","));
    expect(seen.size).toBeGreaterThan(40);
  });

  it("stays subtle: the average is close to 1", () => {
    const rng = mulberry32(3);
    let sum = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) sum += tintFor("scrub", rng).reduce((s, c) => s + c, 0) / 3;
    expect(sum / n).toBeGreaterThan(0.9);
    expect(sum / n).toBeLessThan(1.1);
  });
});
```

`viewer/src/vegetation/layer.test.ts`:

```ts
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { planChunks, type ChunkPlan } from "../chunks";
import type { HabitatClass } from "../habitat";
import { VegetationLayer, type VegetationLayerOptions } from "./layer";

const CLASSES: HabitatClass[] = [
  { id: 0, name: "Unmapped", group: "unmapped" },
  { id: 1, name: "Bay", group: "water" },
  { id: 5, name: "Oak", group: "woodland" },
  { id: 9, name: "Scrub", group: "scrub" },
  { id: 10, name: "Willow", group: "wetland" },
];
const SIZE = { width: 129, height: 65, cell_m: 10 };
const PLANS = planChunks(SIZE.width, SIZE.height, 64); // two chunks side by side

function options(over: Partial<VegetationLayerOptions> = {}): VegetationLayerOptions {
  const n = SIZE.width * SIZE.height;
  const heights = new Float32Array(n).fill(40);
  // west chunk: woodland (class 5) on the north half, scrub (9) on the south half; east chunk: reeds (10)
  const habitat = new Uint8Array(n);
  for (let y = 0; y < SIZE.height; y++) {
    for (let x = 0; x < SIZE.width; x++) habitat[y * SIZE.width + x] = x === 64 ? 1 : x > 64 ? 10 : y < 32 ? 5 : 9; // column 64 (shared border) is water
  }
  return { size: SIZE, heights, habitat, classes: CLASSES, waterLevelM: 0.6, exaggeration: 3, seed: 7, ...over };
}

const chunkMesh = () => new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
const veg = (m: THREE.Object3D) => m.children.filter((c): c is THREE.InstancedMesh => (c as THREE.InstancedMesh).isInstancedMesh);

describe("VegetationLayer", () => {
  it("builds up to three instanced meshes per chunk as children of the chunk mesh", () => {
    const layer = new VegetationLayer(options());
    const west = chunkMesh();
    layer.attach(west, PLANS[0]);
    const kids = veg(west);
    expect(kids.map((k) => k.name).sort()).toEqual(["vegetation-shrub", "vegetation-tree"]);
    for (const k of kids) {
      expect(k.count).toBeGreaterThan(0);
      expect(k.frustumCulled).toBe(false);
      expect(k.instanceColor).not.toBeNull();
      expect(k.visible).toBe(true);
    }
    const east = chunkMesh();
    layer.attach(east, PLANS[1]);
    expect(veg(east).map((k) => k.name)).toEqual(["vegetation-reed"]);
    const s = layer.stats();
    expect(s.meshes).toBe(3);
    expect(s.instances).toBe([...veg(west), ...veg(east)].reduce((n, k) => n + k.count, 0));
    layer.dispose();
  });

  it("scales y by the exaggeration and keeps x/z in world metres", () => {
    const layer = new VegetationLayer(options({ exaggeration: 3, sizeBoost: 1 }));
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    const tree = veg(m).find((k) => k.name === "vegetation-tree")!;
    const mat = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < Math.min(tree.count, 20); i++) {
      tree.getMatrixAt(i, mat);
      mat.decompose(p, q, s);
      expect(p.y).toBeCloseTo(40 * 3, 3); // flat ground at 40 m, exaggerated x3
      expect(Math.abs(p.x)).toBeLessThanOrEqual(64 * 10);
      expect(s.x).toBeGreaterThanOrEqual(9 - 1e-4);
      expect(s.x).toBeLessThanOrEqual(15 + 1e-4);
      expect(s.y).toBeCloseTo(s.x, 4);
    }
    layer.dispose();
  });

  it("applies sizeBoost to the instance scale", () => {
    const sizes = (boost: number) => {
      const layer = new VegetationLayer(options({ sizeBoost: boost }));
      const m = chunkMesh();
      layer.attach(m, PLANS[0]);
      const tree = veg(m).find((k) => k.name === "vegetation-tree")!;
      const mat = new THREE.Matrix4();
      tree.getMatrixAt(0, mat);
      const s = new THREE.Vector3();
      mat.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
      layer.dispose();
      return s.x;
    };
    expect(sizes(2) / sizes(1)).toBeCloseTo(2, 4);
  });

  it("gives instances a tint in the allowed band", () => {
    const layer = new VegetationLayer(options());
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    const k = veg(m)[0];
    const arr = k.instanceColor!.array;
    for (let i = 0; i < k.count * 3; i++) {
      expect(arr[i]).toBeGreaterThanOrEqual(0.78 - 1e-6);
      expect(arr[i]).toBeLessThanOrEqual(1.12 + 1e-6);
    }
    layer.dispose();
  });

  it("is deterministic: re-attaching the same chunk gives identical instances", () => {
    const layer = new VegetationLayer(options());
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    const first = veg(m).map((k) => Array.from(k.instanceMatrix.array));
    layer.detach(m);
    expect(veg(m)).toHaveLength(0);
    layer.attach(m, PLANS[0]);
    expect(veg(m).map((k) => Array.from(k.instanceMatrix.array))).toEqual(first);
    layer.dispose();
  });

  it("caps instances per chunk", () => {
    const layer = new VegetationLayer(options({ maxInstancesPerChunk: 50 }));
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    expect(layer.stats().instances).toBe(50);
    layer.dispose();
  });

  it("detach disposes the instance buffers but not the shared geometry or material", () => {
    const layer = new VegetationLayer(options());
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    const kids = veg(m);
    let instDisposed = 0;
    let geoDisposed = 0;
    let matDisposed = 0;
    for (const k of kids) {
      k.addEventListener("dispose", () => instDisposed++);
      k.geometry.addEventListener("dispose", () => geoDisposed++);
      (k.material as THREE.Material).addEventListener("dispose", () => matDisposed++);
    }
    layer.detach(m);
    expect(instDisposed).toBe(kids.length);
    expect(geoDisposed).toBe(0);
    expect(matDisposed).toBe(0);
    expect(m.children).toHaveLength(0);
    expect(layer.stats()).toEqual({ instances: 0, meshes: 0 });
    layer.detach(m); // second detach is a no-op
    layer.detach(chunkMesh()); // so is an unknown mesh
    layer.dispose();
  });

  it("re-attaching a mesh replaces its vegetation instead of doubling it", () => {
    const layer = new VegetationLayer(options());
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    const before = layer.stats();
    layer.attach(m, PLANS[0]);
    expect(layer.stats()).toEqual(before);
    expect(veg(m)).toHaveLength(2);
    layer.dispose();
  });

  it("setEnabled(false) hides existing vegetation; setEnabled(true) shows it again", () => {
    const layer = new VegetationLayer(options());
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    layer.setEnabled(false);
    expect(layer.isEnabled()).toBe(false);
    expect(veg(m).every((k) => !k.visible)).toBe(true);
    expect(layer.stats().instances).toBeGreaterThan(0); // still built, just hidden
    layer.setEnabled(true);
    expect(veg(m).every((k) => k.visible)).toBe(true);
    layer.dispose();
  });

  it("chunks attached while disabled get vegetation lazily on refresh after enabling", () => {
    const layer = new VegetationLayer(options({ maxBuildsPerRefresh: 1 }));
    layer.setEnabled(false);
    const a = chunkMesh();
    const b = chunkMesh();
    layer.attach(a, PLANS[0]);
    layer.attach(b, PLANS[1]);
    expect(veg(a)).toHaveLength(0);
    expect(veg(b)).toHaveLength(0);
    expect(layer.stats()).toEqual({ instances: 0, meshes: 0 });
    // refresh does nothing while disabled
    expect(layer.refresh([a, b])).toBe(false);
    expect(veg(a)).toHaveLength(0);
    layer.setEnabled(true);
    expect(veg(a)).toHaveLength(0); // enabling alone builds nothing: refresh does
    // budget 1 per call: first call builds one and reports more pending
    expect(layer.refresh([a, b])).toBe(true);
    expect(veg(a).length + veg(b).length).toBeGreaterThan(0);
    expect(veg(a).length > 0 && veg(b).length > 0).toBe(false);
    expect(layer.refresh([a, b])).toBe(true); // built the last one: render again
    expect(veg(a).length).toBeGreaterThan(0);
    expect(veg(b).length).toBeGreaterThan(0);
    // nothing left: later refreshes are no-ops
    const s = layer.stats();
    expect(layer.refresh([a, b])).toBe(false);
    expect(layer.stats()).toEqual(s);
    layer.dispose();
  });

  it("refresh only builds meshes it is given", () => {
    const layer = new VegetationLayer(options());
    layer.setEnabled(false);
    const a = chunkMesh();
    const b = chunkMesh();
    layer.attach(a, PLANS[0]);
    layer.attach(b, PLANS[1]);
    layer.setEnabled(true);
    expect(layer.refresh(new Set([b]))).toBe(true);
    expect(layer.refresh(new Set([b]))).toBe(false);
    expect(veg(a)).toHaveLength(0);
    expect(veg(b).length).toBeGreaterThan(0);
    layer.dispose();
  });

  it("a mesh detached while pending is forgotten", () => {
    const layer = new VegetationLayer(options());
    layer.setEnabled(false);
    const a = chunkMesh();
    layer.attach(a, PLANS[0]);
    layer.detach(a);
    layer.setEnabled(true);
    layer.refresh([a]);
    expect(veg(a)).toHaveLength(0);
    layer.dispose();
  });

  it("dispose frees everything including the shared assets", () => {
    const layer = new VegetationLayer(options());
    const m = chunkMesh();
    layer.attach(m, PLANS[0]);
    let geoDisposed = 0;
    for (const k of veg(m)) k.geometry.addEventListener("dispose", () => geoDisposed++);
    layer.dispose();
    expect(m.children).toHaveLength(0);
    expect(geoDisposed).toBeGreaterThan(0);
    expect(layer.stats()).toEqual({ instances: 0, meshes: 0 });
  });

  it("plugs into the terrain hook signature", () => {
    const layer = new VegetationLayer(options());
    const hooks = {
      onLod0Built: (plan: ChunkPlan, mesh: THREE.Mesh) => layer.attach(mesh, plan),
      onLod0Evicted: (_plan: ChunkPlan, mesh: THREE.Mesh) => layer.detach(mesh),
    };
    const m = chunkMesh();
    hooks.onLod0Built(PLANS[0], m);
    expect(layer.stats().meshes).toBeGreaterThan(0);
    hooks.onLod0Evicted(PLANS[0], m);
    expect(layer.stats().meshes).toBe(0);
    layer.dispose();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd viewer && npx vitest run src/terrainChunks.test.ts src/vegetation`
Expected: FAIL: the vegetation modules are missing and the new hook tests fail.

- [ ] **Step 3: Replace `viewer/src/terrainChunks.ts`** (adds the optional `hooks` and `visibleLod0Meshes()`)

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
  /** Observers of the full-resolution chunk lifecycle (e.g. a vegetation layer). */
  hooks?: TerrainChunkHooks;
}

/**
 * Called for LOD0 (full resolution) chunk meshes only. `onLod0Built` runs right after the
 * mesh has been created and added to `root`; `onLod0Evicted` runs when the LRU drops it
 * (or on dispose), BEFORE its geometry is disposed and the mesh is removed from `root`,
 * so a hook can detach children it added. A throwing hook is logged and ignored.
 */
export interface TerrainChunkHooks {
  onLod0Built(plan: ChunkPlan, mesh: THREE.Mesh): void;
  onLod0Evicted(plan: ChunkPlan, mesh: THREE.Mesh): void;
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
  private readonly hooks: TerrainChunkHooks | undefined;
  private switchZoom: number;
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
    this.hooks = options.hooks;
    this.lod0 = new LruCache<string, THREE.Mesh>(this.baseCapacity, (_key, mesh) => {
      this.runHook("onLod0Evicted", mesh);
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

  /** Replace the zoom at which full-resolution chunks take over; used by the next update(). */
  setSwitchZoom(zoom: number): void {
    this.switchZoom = zoom;
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
      // Zoomed out again: give back the memory the full-resolution working set grew into.
      this.lod0.capacity = this.baseCapacity;
      this.lod0.trim();
      return false;
    }

    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    const inView = this.entries.filter((e) => this.frustum.intersectsBox(e.bounds));

    // Never let the cache be smaller than the working set, or it would thrash.
    this.lod0.capacity = Math.max(this.baseCapacity, inView.length);

    // Pass 1: reuse cached meshes (this also refreshes their recency, so the builds in
    // pass 2 can only evict chunks that are not in view).
    const nowVisible = new Set<THREE.Mesh>();
    const covered = new Set<Entry>(); // in-view chunks whose LOD0 mesh is shown
    const missing: Entry[] = [];
    for (const e of inView) {
      const mesh = this.lod0.get(chunkKey(e.plan, 0));
      if (mesh) {
        nowVisible.add(mesh);
        covered.add(e);
      } else missing.push(e);
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
      this.runHook("onLod0Built", mesh);
      nowVisible.add(mesh);
      covered.add(e);
      built++;
    }

    // A chunk keeps its LOD1 mesh until its LOD0 mesh is shown, so builds that are still
    // pending never leave a hole. Chunks outside the view show neither.
    const inViewSet = new Set(inView);
    for (const e of this.entries) e.lod1.visible = inViewSet.has(e) && !covered.has(e);

    for (const m of this.visibleLod0) if (!nowVisible.has(m)) m.visible = false;
    for (const m of nowVisible) m.visible = true;
    this.visibleLod0.clear();
    for (const m of nowVisible) this.visibleLod0.add(m);

    return missing.length > built;
  }

  /** The full-resolution meshes currently shown (read-only view; do not keep it across updates). */
  visibleLod0Meshes(): ReadonlySet<THREE.Mesh> {
    return this.visibleLod0;
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
    mesh.userData.plan = chunk;
    mesh.matrixAutoUpdate = false; // chunks sit at the origin and never move
    return mesh;
  }

  private runHook(name: keyof TerrainChunkHooks, mesh: THREE.Mesh): void {
    if (!this.hooks) return;
    try {
      this.hooks[name](mesh.userData.plan as ChunkPlan, mesh);
    } catch (err) {
      console.error(`terrain chunk hook ${name} failed`, err);
    }
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

- [ ] **Step 4: Create the vegetation modules**

`viewer/src/vegetation/placement.ts`:

```ts
/**
 * Where vegetation goes, as pure maths: no three.js, no DOM. One call per terrain chunk
 * returns world-space instances for trees, shrubs and reeds, deterministic for a given
 * (seed, chunk), so a chunk that is evicted and rebuilt looks exactly the same.
 *
 * Coordinates match terrainMesh.ts: x = (sx - (width-1)/2) * cell_m, z likewise, +z south.
 * y is the UN-exaggerated height in metres; the renderer multiplies it by the terrain's
 * vertical exaggeration. Scale is the plant's size in metres (see geometry.ts).
 */
import type { ChunkPlan } from "../chunks";
import { GROUP_COLORS, type HabitatClass } from "../habitat";
import { mulberry32 } from "../randomLand";
import type { GridSize } from "../terrainMesh";

export type VegKind = "tree" | "shrub" | "reed";

export interface VegSpec {
  kind: VegKind;
  /** Mean number of plants per hectare (10,000 m2). */
  perHectare: number;
  /** Size range in metres (tree: height, shrub: radius, reed: clump height). */
  minScale: number;
  maxScale: number;
}

/**
 * Vegetation per habitat group; `null` = nothing grows there (open water, beach, bare
 * rock, and ground we have not reconstructed). Densities are deliberately modest: the
 * shapes only suggest the kind of plants, they are not a census.
 */
export const VEGETATION_BY_GROUP: Readonly<Record<string, VegSpec | null>> = {
  woodland: { kind: "tree", perHectare: 45, minScale: 9, maxScale: 15 },
  scrub: { kind: "shrub", perHectare: 70, minScale: 1.6, maxScale: 2.6 },
  grassland: { kind: "shrub", perHectare: 6, minScale: 1.4, maxScale: 2.2 },
  dune: { kind: "shrub", perHectare: 8, minScale: 1.2, maxScale: 2.0 },
  wetland: { kind: "reed", perHectare: 60, minScale: 3, maxScale: 5 },
  marsh: { kind: "reed", perHectare: 90, minScale: 2.5, maxScale: 4 },
  beach: null,
  water: null,
  rock: null,
  unmapped: null,
};

export function vegetationForGroup(group: string): VegSpec | null {
  return Object.hasOwn(VEGETATION_BY_GROUP, group) ? VEGETATION_BY_GROUP[group] : null;
}

export interface VegInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  /** Rotation about +y, radians, 0..2pi. */
  rotation: number;
  kind: VegKind;
  group: string;
}

/** Ground steeper than this (degrees, from neighbouring heights) gets no plants. */
export const MAX_SLOPE_DEG = 35;
/** Trees and shrubs need ground at least this far above the water level (metres). */
export const MIN_ABOVE_WATER_M = 0.3;
/** Reeds may stand right at the water line. */
export const REED_MIN_ABOVE_WATER_M = 0.05;

const TAN_MAX_SLOPE = Math.tan((MAX_SLOPE_DEG * Math.PI) / 180);

/** Visitor-independent group name for a habitat class id ("unmapped" when unknown). */
export function groupNameForClass(classes: readonly HabitatClass[]): (id: number) => string {
  const byId = new Map<number, string>();
  for (const c of classes) {
    byId.set(c.id, Object.hasOwn(GROUP_COLORS, c.group) ? c.group : "unmapped");
  }
  return (id) => byId.get(id) ?? "unmapped";
}

/** Mix (seed, chunk column, chunk row) into one 32-bit PRNG seed. */
export function chunkSeed(seed: number, cx: number, cy: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (cx + 0x7f4a7c15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (cy + 0x165667b1), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Height of the rendered terrain surface at a fractional sample position (px, py), using
 * the same triangles as buildChunkGeometry (diagonal from the south-west to the
 * north-east sample), so plants sit on the mesh and do not float or sink.
 */
export function heightOnMesh(heights: Float32Array, size: GridSize, px: number, py: number): number {
  const { width, height } = size;
  const bx = Math.max(0, Math.min(Math.floor(px), width - 2));
  const by = Math.max(0, Math.min(Math.floor(py), height - 2));
  const u = px - bx;
  const v = py - by;
  const i = by * width + bx;
  const a = heights[i]; // north-west
  const c = heights[i + 1]; // north-east
  const b = heights[i + width]; // south-west
  const d = heights[i + width + 1]; // south-east
  return u + v <= 1 ? a + u * (c - a) + v * (b - a) : d + (1 - u) * (b - d) + (1 - v) * (c - d);
}

export interface PlaceArgs {
  chunk: ChunkPlan;
  size: GridSize;
  /** Whole-grid heights (metres), row-major. */
  heights: Float32Array;
  /** Whole-grid habitat class ids. */
  habitat: Uint8Array;
  groupOfClass: (classId: number) => string;
  waterLevelM: number;
  seed: number;
  /** Hard cap for this chunk; more candidates are thinned uniformly. */
  maxInstances: number;
}

/**
 * Plants for one chunk. Every habitat sample owns the patch of ground nearest to it (its
 * Voronoi cell, cut off at the chunk edge, so a shared border sample is split between the
 * two chunks and nothing is counted twice). The patch gets floor(n) plants plus one more
 * with probability frac(n), n = perHectare x patch area in hectares, each at a jittered
 * position. Plants are dropped where the ground is within the shore band, steeper than
 * 35 degrees, or where the group grows nothing.
 */
export function placeChunkVegetation(args: PlaceArgs): VegInstance[] {
  const { chunk, size, heights, habitat, groupOfClass, waterLevelM, seed, maxInstances } = args;
  const { width, height, cell_m } = size;
  if (heights.length !== width * height) {
    throw new Error(`heights has ${heights.length} samples, expected ${width * height}`);
  }
  if (habitat.length !== width * height) {
    throw new Error(`habitat has ${habitat.length} samples, expected ${width * height}`);
  }
  if (!(maxInstances > 0)) return [];

  const rng = mulberry32(chunkSeed(seed, chunk.cx, chunk.cy));
  const cellHa = (cell_m * cell_m) / 10_000;
  const cx = (width - 1) / 2;
  const cz = (height - 1) / 2;
  const { x0, y0, w, h } = chunk;

  // Per class id: group name and spec, resolved once.
  const groupCache = new Array<string | undefined>(256);
  const specCache = new Array<VegSpec | null | undefined>(256);
  const specFor = (id: number): VegSpec | null => {
    let spec = specCache[id];
    if (spec === undefined) {
      const group = groupOfClass(id);
      groupCache[id] = group;
      spec = vegetationForGroup(group);
      specCache[id] = spec;
    }
    return spec;
  };

  const out: VegInstance[] = [];
  for (let sy = y0; sy <= y0 + h; sy++) {
    const ylo = Math.max(sy - 0.5, y0);
    const yhi = Math.min(sy + 0.5, y0 + h);
    const leny = yhi - ylo;
    if (!(leny > 0)) continue;
    for (let sx = x0; sx <= x0 + w; sx++) {
      const id = habitat[sy * width + sx];
      const spec = specFor(id);
      if (!spec) continue;
      const xlo = Math.max(sx - 0.5, x0);
      const xhi = Math.min(sx + 0.5, x0 + w);
      const lenx = xhi - xlo;
      if (!(lenx > 0)) continue;

      const expected = spec.perHectare * cellHa * lenx * leny;
      const whole = Math.floor(expected);
      const count = whole + (rng() < expected - whole ? 1 : 0);
      for (let k = 0; k < count; k++) {
        // Four draws per plant whether or not it survives, so a change in one rule does
        // not reshuffle the rest of the chunk.
        const px = xlo + rng() * lenx;
        const py = ylo + rng() * leny;
        const scale = spec.minScale + rng() * (spec.maxScale - spec.minScale);
        const rotation = rng() * Math.PI * 2;

        const y = heightOnMesh(heights, size, px, py);
        const minAbove = spec.kind === "reed" ? REED_MIN_ABOVE_WATER_M : MIN_ABOVE_WATER_M;
        if (!(y > waterLevelM + minAbove)) continue;
        if (slopeTan(heights, width, height, px, py, cell_m) > TAN_MAX_SLOPE) continue;

        out.push({
          x: (px - cx) * cell_m,
          y,
          z: (py - cz) * cell_m,
          scale,
          rotation,
          kind: spec.kind,
          group: groupCache[id]!,
        });
      }
    }
  }

  if (out.length <= maxInstances) return out;
  // Uniform, deterministic thinning: keep evenly spaced entries of the (row-major) list.
  const thinned = new Array<VegInstance>(maxInstances);
  const n = out.length;
  for (let i = 0; i < maxInstances; i++) thinned[i] = out[Math.floor((i * n) / maxInstances)];
  return thinned;
}

/** tan(slope) of the terrain quad containing (px, py), from its four corner heights. */
function slopeTan(
  heights: Float32Array,
  width: number,
  height: number,
  px: number,
  py: number,
  cellM: number,
): number {
  const bx = Math.max(0, Math.min(Math.floor(px), width - 2));
  const by = Math.max(0, Math.min(Math.floor(py), height - 2));
  const i = by * width + bx;
  const a = heights[i];
  const c = heights[i + 1];
  const b = heights[i + width];
  const d = heights[i + width + 1];
  const gx = (c + d - a - b) / (2 * cellM);
  const gz = (b + d - a - c) / (2 * cellM);
  return Math.hypot(gx, gz);
}
```

`viewer/src/vegetation/geometry.ts`:

```ts
/**
 * Shared low-poly plant shapes (built once, drawn as instances) and the per-instance
 * colour variation. Shapes are unit sized and scaled per instance by placement.ts:
 *   tree  - height 1 (scale = height in metres): short brown trunk + green cone canopy
 *   shrub - radius 1 (scale = radius in metres): a squashed icosahedron
 *   reed  - height 1 (scale = clump height in metres): three thin tapered blades
 * Vertex colours are LINEAR (like the terrain's), so the sRGB hex values go through
 * srgbToLinear. They are illustrative shapes, not botanical models.
 */
import * as THREE from "three";
import { srgbToLinear } from "../habitat";

export type RGB = [number, number, number];

/** sRGB hex -> linear [r, g, b] for vertex colours. */
export function hexToLinear(hex: number): RGB {
  return [
    srgbToLinear(((hex >> 16) & 255) / 255),
    srgbToLinear(((hex >> 8) & 255) / 255),
    srgbToLinear((hex & 255) / 255),
  ];
}

// Chosen to stand out against the ground colours in habitat.ts (woodland 4f6b3f, scrub
// 8a9a5a, dune d8c58a, marsh 7fa06a, wetland 6f9a8a): darker or warmer than the ground.
export const VEG_COLORS = {
  trunk: 0x6b4a2f,
  canopy: 0x24502b,
  shrub: 0x5f7a38,
  reed: 0x8c6d2c,
} as const;

export interface GeometryPart {
  geometry: THREE.BufferGeometry;
  /** Linear vertex colour for the whole part. */
  color: RGB;
}

/**
 * Merge parts into one non-indexed geometry with position, normal and colour attributes
 * (flat-shaded faces, so the normals are per-face). Input geometries are not modified.
 * A minimal stand-in for BufferGeometryUtils.mergeGeometries that adds the colour.
 */
export function mergeGeometries(parts: readonly GeometryPart[]): THREE.BufferGeometry {
  const flat = parts.map(({ geometry, color }) => {
    const g = geometry.getIndex() ? geometry.toNonIndexed() : geometry.clone();
    g.computeVertexNormals();
    return { g, color };
  });
  const total = flat.reduce((n, p) => n + p.g.getAttribute("position").count, 0);
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const colour = new Float32Array(total * 3);
  let at = 0;
  for (const { g, color } of flat) {
    const pos = g.getAttribute("position");
    const nor = g.getAttribute("normal");
    for (let i = 0; i < pos.count; i++, at++) {
      position.set([pos.getX(i), pos.getY(i), pos.getZ(i)], at * 3);
      normal.set([nor.getX(i), nor.getY(i), nor.getZ(i)], at * 3);
      colour.set(color, at * 3);
    }
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colour, 3));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
export default mergeGeometries;

export interface VegetationGeometries {
  tree: THREE.BufferGeometry;
  shrub: THREE.BufferGeometry;
  reed: THREE.BufferGeometry;
}

function tree(): THREE.BufferGeometry {
  // trunk: y from -0.08 (a little below ground) to 0.22; canopy cone: y 0.18 .. 1
  const trunk = new THREE.CylinderGeometry(0.045, 0.06, 0.3, 5).translate(0, 0.07, 0);
  const canopy = new THREE.ConeGeometry(0.32, 0.82, 6).translate(0, 0.59, 0);
  return mergeGeometries([
    { geometry: trunk, color: hexToLinear(VEG_COLORS.trunk) },
    { geometry: canopy, color: hexToLinear(VEG_COLORS.canopy) },
  ]);
}

function shrub(): THREE.BufferGeometry {
  // radius 1, squashed to 0.6 high, sunk 0.15 so the bottom hides in the ground
  const blob = new THREE.IcosahedronGeometry(1, 0).scale(1, 0.6, 1).translate(0, 0.45, 0);
  return mergeGeometries([{ geometry: blob, color: hexToLinear(VEG_COLORS.shrub) }]);
}

function reed(): THREE.BufferGeometry {
  const blade = (h: number, x: number, z: number, lean: number) =>
    new THREE.ConeGeometry(0.05, h, 4)
      .translate(0, h / 2, 0)
      .rotateZ(lean)
      .translate(x, 0, z);
  const c = hexToLinear(VEG_COLORS.reed);
  return mergeGeometries([
    { geometry: blade(1, 0, 0, 0), color: c },
    { geometry: blade(0.8, 0.12, 0.06, -0.18), color: c },
    { geometry: blade(0.9, -0.1, -0.08, 0.2), color: c },
  ]);
}

export function makeVegetationGeometries(): VegetationGeometries {
  return { tree: tree(), shrub: shrub(), reed: reed() };
}

/** Lit like the terrain: flat shaded, colours from the vertices (times the instance tint). */
export function makeVegetationMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
}

/** Per-instance colour multipliers stay inside this band so the variation is slight. */
export const TINT_RANGE = { min: 0.78, max: 1.12 } as const;

// Per-group lean: [r, g, b] bias added to the random brightness (kept small).
const TINT_BIAS: Record<string, RGB> = {
  woodland: [-0.02, 0.02, -0.02],
  scrub: [0.02, 0.0, -0.03],
  grassland: [0.03, 0.01, -0.03],
  dune: [0.03, 0.0, -0.02],
  wetland: [-0.02, 0.01, 0.03],
  marsh: [0.03, 0.01, -0.02],
};

/**
 * Slight random colour variation for one instance: a shared brightness factor plus a
 * small per-channel wobble and a group bias. Returns multipliers for the vertex colour
 * (instanceColor x vertexColor), each within TINT_RANGE. Consumes 4 draws from `rng`.
 */
export function tintFor(group: string, rng: () => number): RGB {
  const bias = Object.hasOwn(TINT_BIAS, group) ? TINT_BIAS[group] : [0, 0, 0];
  const brightness = 0.86 + rng() * 0.2; // 0.86 .. 1.06
  const out: RGB = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const v = brightness + bias[c] + (rng() - 0.5) * 0.06;
    out[c] = Math.min(TINT_RANGE.max, Math.max(TINT_RANGE.min, v));
  }
  return out;
}
```

`viewer/src/vegetation/layer.ts`:

```ts
/**
 * Vegetation drawn as instanced meshes parented to the full-resolution terrain chunks, so
 * a plant is shown, hidden and freed together with the chunk under it. All placement
 * maths lives in placement.ts; this class only turns instances into three.js objects.
 *
 * Wire it with TerrainChunks hooks: onLod0Built -> attach, onLod0Evicted -> detach, and
 * call refresh(terrain.visibleLod0Meshes()) after each frame so chunks that were built
 * while the layer was off get their plants once it is switched on.
 */
import * as THREE from "three";
import type { ChunkPlan } from "../chunks";
import type { HabitatClass } from "../habitat";
import type { GridSize } from "../terrainMesh";
import { mulberry32 } from "../randomLand";
import {
  makeVegetationGeometries,
  makeVegetationMaterial,
  tintFor,
  type VegetationGeometries,
} from "./geometry";
import {
  chunkSeed,
  groupNameForClass,
  placeChunkVegetation,
  type VegInstance,
  type VegKind,
} from "./placement";

export interface VegetationLayerOptions {
  size: GridSize;
  /** Whole-grid heights in metres. */
  heights: Float32Array;
  /** Whole-grid habitat class ids. */
  habitat: Uint8Array;
  classes: HabitatClass[];
  waterLevelM: number;
  /** Terrain vertical exaggeration: plant bases are lifted by this factor. */
  exaggeration: number;
  seed?: number;
  /** Cap per chunk (all kinds together). Default 1500. */
  maxInstancesPerChunk?: number;
  /**
   * Multiplier on every plant's size. The terrain is 10 m resolution and vertically
   * exaggerated, so true-size plants would be specks; this is the "illustrative" fudge.
   * Default 1.5.
   */
  sizeBoost?: number;
  /** Chunks built per refresh() call (keeps a frame short). Default 3. */
  maxBuildsPerRefresh?: number;
}

export const DEFAULT_VEGETATION_SEED = 0x59454c41; // "YELA"
export const DEFAULT_MAX_INSTANCES_PER_CHUNK = 1500;
export const DEFAULT_SIZE_BOOST = 1.5;

const KINDS: readonly VegKind[] = ["tree", "shrub", "reed"];

interface Built {
  meshes: THREE.InstancedMesh[];
  instances: number;
}

export class VegetationLayer {
  private readonly geometries: VegetationGeometries;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly groupOfClass: (id: number) => string;
  private readonly seed: number;
  private readonly maxInstances: number;
  private readonly sizeBoost: number;
  private readonly maxBuilds: number;
  private enabled = true;
  /** Every attached chunk mesh with its plan. */
  private readonly chunks = new Map<THREE.Mesh, ChunkPlan>();
  /** Vegetation currently built per chunk mesh. */
  private readonly built = new Map<THREE.Mesh, Built>();
  /** Attached chunks that have no vegetation yet (attached while disabled). */
  private readonly pending = new Set<THREE.Mesh>();

  private readonly m4 = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scl = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly col = new THREE.Color();

  constructor(private readonly opts: VegetationLayerOptions) {
    this.geometries = makeVegetationGeometries();
    this.material = makeVegetationMaterial();
    this.groupOfClass = groupNameForClass(opts.classes);
    this.seed = opts.seed ?? DEFAULT_VEGETATION_SEED;
    this.maxInstances = opts.maxInstancesPerChunk ?? DEFAULT_MAX_INSTANCES_PER_CHUNK;
    this.sizeBoost = opts.sizeBoost ?? DEFAULT_SIZE_BOOST;
    this.maxBuilds = opts.maxBuildsPerRefresh ?? 3;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** A full-resolution chunk mesh now exists: remember it and, if enabled, plant it. */
  attach(mesh: THREE.Mesh, plan: ChunkPlan): void {
    this.detach(mesh); // never double up
    this.chunks.set(mesh, plan);
    if (this.enabled) this.build(mesh, plan);
    else this.pending.add(mesh);
  }

  /** The chunk mesh is about to be freed: dispose its instance buffers (shared assets stay). */
  detach(mesh: THREE.Mesh): void {
    this.chunks.delete(mesh);
    this.pending.delete(mesh);
    const b = this.built.get(mesh);
    if (!b) return;
    this.built.delete(mesh);
    for (const im of b.meshes) {
      mesh.remove(im);
      im.dispose();
    }
  }

  /** Show or hide all vegetation; future attaches follow the setting. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    for (const b of this.built.values()) for (const im of b.meshes) im.visible = on;
  }

  /**
   * Plant chunks that were attached while the layer was off, for the given (visible)
   * meshes, at most `maxBuildsPerRefresh` per call. Returns true when the scene changed
   * or more of the given meshes still wait, i.e. the caller should render again (the next
   * call then returns false once everything is planted). O(1) when nothing is pending.
   */
  refresh(visibleMeshes: Iterable<THREE.Mesh>): boolean {
    if (!this.enabled || this.pending.size === 0) return false;
    let built = 0;
    for (const mesh of visibleMeshes) {
      if (!this.pending.has(mesh)) continue;
      if (built >= this.maxBuilds) return true;
      this.pending.delete(mesh);
      const plan = this.chunks.get(mesh);
      if (plan) this.build(mesh, plan);
      built++;
    }
    return built > 0;
  }

  stats(): { instances: number; meshes: number } {
    let instances = 0;
    let meshes = 0;
    for (const b of this.built.values()) {
      instances += b.instances;
      meshes += b.meshes.length;
    }
    return { instances, meshes };
  }

  /** Free everything, including the shared geometry and material. */
  dispose(): void {
    for (const mesh of [...this.chunks.keys()]) this.detach(mesh);
    for (const g of Object.values(this.geometries)) g.dispose();
    this.material.dispose();
  }

  private build(mesh: THREE.Mesh, plan: ChunkPlan): void {
    const o = this.opts;
    const list = placeChunkVegetation({
      chunk: plan,
      size: o.size,
      heights: o.heights,
      habitat: o.habitat,
      groupOfClass: this.groupOfClass,
      waterLevelM: o.waterLevelM,
      seed: this.seed,
      maxInstances: this.maxInstances,
    });
    const tintRng = mulberry32(chunkSeed(this.seed, plan.cx, plan.cy) ^ 0x7f4a7c15);
    const byKind: Record<VegKind, VegInstance[]> = { tree: [], shrub: [], reed: [] };
    for (const v of list) byKind[v.kind].push(v);

    const meshes: THREE.InstancedMesh[] = [];
    for (const kind of KINDS) {
      const items = byKind[kind];
      if (items.length === 0) continue;
      const im = new THREE.InstancedMesh(this.geometries[kind], this.material, items.length);
      im.name = `vegetation-${kind}`;
      // The parent chunk is already culled by its own bounds and hidden when out of view.
      im.frustumCulled = false;
      // Positions are world coordinates and chunks sit at the origin: nothing to update.
      im.matrixAutoUpdate = false;
      for (let i = 0; i < items.length; i++) {
        const v = items[i];
        const s = v.scale * this.sizeBoost;
        this.pos.set(v.x, v.y * o.exaggeration, v.z);
        this.quat.setFromAxisAngle(this.up, v.rotation);
        this.scl.set(s, s, s);
        im.setMatrixAt(i, this.m4.compose(this.pos, this.quat, this.scl));
        const [r, g, b] = tintFor(v.group, tintRng);
        im.setColorAt(i, this.col.setRGB(r, g, b));
      }
      im.visible = this.enabled;
      mesh.add(im);
      meshes.push(im);
    }
    this.built.set(mesh, { meshes, instances: list.length });
  }
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `cd viewer && npm test && npx tsc --noEmit`
Expected: 21 + 11 + 14 new vegetation tests plus 5 new `terrainChunks` tests = **51** new, **443** in total (still including the one skipped test); `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add viewer/src/terrainChunks.ts viewer/src/terrainChunks.test.ts viewer/src/vegetation
git commit -m "feat(viewer): deterministic vegetation per chunk with LOD hooks"
```

---

### Task 10: The UI shell and panels

Plain DOM and CSS: the top bar (search, actions, layer toggles) with a Menu disclosure under 640 px, accessible panels (one open at a time), the search combobox, hotspot, Legend, Sources and Places panels, the About dialog, a skip link, a live region, and the stylesheet. These are DOM-only, so there are no unit tests here; the typecheck guards the interfaces, and Task 12 checks behaviour in a browser.

**Files:**
- Create: `viewer/src/ui/ui.css`, `clipboard.ts`, `shell.ts`, `searchBox.ts`, `hotspotPanel.ts`, `legend.ts`, `provenance.ts`, `about.ts`, `placesPanel.ts`

- [ ] **Step 1: Create the stylesheet `viewer/src/ui/ui.css`**

```css
/* Yelamu viewer UI. System fonts only; no external requests. */

:root {
  color-scheme: light dark;
  --font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --bg: #dfe6e9;
  --surface: rgba(255, 255, 255, 0.92);
  --surface-strong: #ffffff;
  --text: #1c2429;
  --text-muted: #55636c;
  --border: rgba(28, 36, 41, 0.16);
  --accent: #1d6a87;
  --accent-text: #ffffff;
  --hover: rgba(29, 106, 135, 0.1);
  --focus: #0b57d0;
  --shadow: 0 2px 12px rgba(0, 0, 0, 0.16);
  --radius: 10px;
  --gap: 8px;
  --control-h: 36px;
  --edge: 12px;
  --topbar-h: 56px;
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  /* confidence badges: background / text / border per level */
  --doc-bg: #dcefe0;
  --doc-fg: #14532d;
  --inf-bg: #fdf0d2;
  --inf-fg: #6b4300;
  --ill-bg: #ece7f6;
  --ill-fg: #44316b;
  /* map labels sit on the (unthemed) canvas, so they keep their own contrast */
  --label-fg: #1c2429;
  --label-halo: rgba(255, 255, 255, 0.95);
  /* focus ring around the canvas: fixed, because the scene background does not follow the theme */
  --canvas-ring: #0b57d0;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a2126;
    --surface: rgba(28, 36, 41, 0.92);
    --surface-strong: #232d33;
    --text: #e8eef1;
    --text-muted: #a2b1ba;
    --border: rgba(232, 238, 241, 0.2);
    --accent: #6cc1de;
    --accent-text: #0d1a20;
    --hover: rgba(108, 193, 222, 0.16);
    --focus: #8ab4f8;
    --shadow: 0 2px 14px rgba(0, 0, 0, 0.5);
    --doc-bg: #1f3b2a;
    --doc-fg: #bfe8cb;
    --inf-bg: #43331a;
    --inf-fg: #f3d9a0;
    --ill-bg: #33294a;
    --ill-fg: #d8caf2;
  }
}

html,
body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: var(--bg);
  color: var(--text);
  font: 14px/1.4 var(--font);
}

#scene {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
#scene:active {
  cursor: grabbing;
}

[hidden] {
  display: none !important;
}

.visually-hidden {
  position: absolute !important;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
@media (forced-colors: active) {
  :focus-visible {
    outline-color: Highlight;
  }
}

/* The map itself is a keyboard target (arrow keys pan, +/- zoom, Q/E rotate). It fills the
   window, so the ring goes inside it: a blue line on a white band reads on any ground. */
#scene:focus {
  outline: none;
}
#scene:focus-visible {
  outline: 3px solid var(--canvas-ring);
  outline-offset: -3px;
  box-shadow: inset 0 0 0 6px rgba(255, 255, 255, 0.9);
}

/* --- skip link: first in the tab order, visible only while focused --- */
.skip-link {
  position: fixed;
  top: var(--edge);
  left: var(--edge);
  z-index: 40;
  padding: 10px 16px;
  background: var(--surface-strong);
  color: var(--text);
  border: 2px solid var(--focus);
  border-radius: 8px;
  box-shadow: var(--shadow);
  font: 600 14px/1.3 var(--font);
  text-decoration: none;
  transform: translateY(-300%);
}
.skip-link:focus {
  transform: none;
}

/* The UI layer never blocks the canvas; only the boxes inside it take pointer events. */
.ui-root {
  position: fixed;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  font-family: var(--font);
}
.ui-root > * {
  pointer-events: auto;
}
.ui-root > .panels {
  pointer-events: none;
}

/* --- top bar --- */
.topbar {
  position: fixed;
  top: var(--edge);
  left: var(--edge);
  right: var(--edge);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap) 12px;
  padding: 8px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}
.topbar__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 650;
  letter-spacing: 0.01em;
}
.topbar__search {
  flex: 1 1 220px;
  min-width: 0;
}
.topbar__search:empty {
  display: none;
}
.topbar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: auto;
}
/* Wide screens: the menu's children sit directly in the top bar's row. */
.topbar__menu {
  display: contents;
}
.topbar__menu-btn {
  display: none;
}
.topbar__links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.topbar__links:empty {
  display: none;
}

.topbar button,
.btn {
  min-height: var(--control-h);
  min-width: var(--control-h);
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-strong);
  color: var(--text);
  font: inherit;
  cursor: pointer;
  transition: background-color 0.12s ease;
}
.topbar button:hover,
.btn:hover {
  background: var(--hover);
}
.topbar button:active,
.btn:active {
  background: var(--accent);
  color: var(--accent-text);
}
.topbar button.btn--icon,
.btn--icon {
  padding: 0;
}
.btn-glyph {
  font-size: 1.2rem;
  line-height: 1;
}

/* --- layer toggles --- */
.toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--control-h);
  cursor: pointer;
  user-select: none;
}
.toggle input {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--accent);
}
.toggle.is-disabled {
  cursor: not-allowed;
  color: var(--text-muted);
}
.toggle input:disabled {
  cursor: not-allowed;
}

/* --- status line and toast --- */
.status {
  position: fixed;
  left: var(--edge);
  bottom: calc(var(--edge) + var(--safe-bottom));
  max-width: calc(100% - 2 * var(--edge));
  margin: 0;
  padding: 6px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 13px;
  pointer-events: none;
}
.status:empty {
  display: none;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: calc(56px + var(--safe-bottom));
  transform: translateX(-50%);
  max-width: calc(100% - 2 * var(--edge));
  padding: 8px 14px;
  background: var(--text);
  color: var(--bg);
  border-radius: 999px;
  box-shadow: var(--shadow);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}
.toast[data-visible="true"] {
  opacity: 1;
}
.toast:empty {
  display: none;
}

/* --- side panel (bottom sheet on narrow screens) --- */
.panel {
  position: fixed;
  top: calc(var(--topbar-h) + 2 * var(--edge));
  right: var(--edge);
  bottom: var(--edge);
  width: min(360px, calc(100% - 2 * var(--edge)));
  display: flex;
  flex-direction: column;
  background: var(--surface-strong);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  pointer-events: auto;
}
.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap);
  padding: 8px 8px 8px 14px;
  border-bottom: 1px solid var(--border);
}
.panel__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 650;
}
.panel__body {
  flex: 1 1 auto;
  padding: 12px 14px;
  overflow: auto;
  overscroll-behavior: contain;
}
.panel:focus {
  outline: none;
}
.panel:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}

/* --- narrow screens: Menu disclosure, bigger touch targets, bottom sheet --- */
@media (max-width: 640px) {
  .topbar button,
  .btn,
  .toggle,
  .topbar .search__input {
    min-height: 44px;
    min-width: 44px;
  }
  .topbar {
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px;
  }
  .topbar__search {
    flex: 1 1 0;
  }
  .topbar__menu-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: auto;
  }
  .topbar__menu {
    display: none;
  }
  .topbar__menu[data-open="true"] {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }
  .topbar__links,
  .topbar__actions {
    margin-left: 0;
    width: 100%;
  }
  .topbar__links .btn,
  .topbar__actions .btn:not(.btn--icon) {
    flex: 1 1 auto;
  }
  .panel {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    max-height: 60vh;
    max-height: 60dvh;
    border-radius: var(--radius) var(--radius) 0 0;
    border-bottom: 0;
    padding-bottom: var(--safe-bottom);
  }
}
@media (pointer: coarse) {
  .topbar button,
  .btn,
  .toggle,
  .topbar .search__input {
    min-height: 44px;
    min-width: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition: none !important;
    animation: none !important;
    scroll-behavior: auto !important;
  }
}

.noscript-msg {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: min(32rem, calc(100% - 2 * var(--edge)));
  padding: 16px 20px;
  background: var(--surface-strong);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-align: center;
}


/* --- search combobox --- */
.search {
  position: relative;
}
.search__input {
  box-sizing: border-box;
  width: 100%;
  min-height: var(--control-h);
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-strong);
  color: var(--text);
  font: inherit;
}
.search__input::placeholder {
  color: var(--text-muted);
}
.search__list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 5;
  box-sizing: border-box;
  width: max(100%, 280px);
  max-width: calc(100vw - 4 * var(--edge));
  max-height: min(50vh, 360px);
  margin: 0;
  padding: 4px;
  overflow: auto;
  list-style: none;
  background: var(--surface-strong);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.search__option {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 10px;
  border-left: 3px solid transparent;
  border-radius: 6px;
  cursor: pointer;
}
.search__option.is-active {
  background: var(--hover);
  border-left-color: var(--accent);
}
.search__name {
  min-width: 0;
  overflow-wrap: anywhere;
}
.search__meta {
  flex: none;
  color: var(--text-muted);
  font-size: 12px;
  white-space: nowrap;
}

/* --- map labels and hotspot markers (over the canvas) --- */
.ui-root > .labels {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}
.labels > * {
  position: absolute;
  top: 0;
  left: 0;
}
.label {
  padding: 0 2px;
  color: var(--label-fg);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
  text-shadow:
    0 0 2px var(--label-halo),
    0 0 2px var(--label-halo),
    0 0 3px var(--label-halo),
    0 0 4px var(--label-halo);
  pointer-events: none;
}
.label.is-selected {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.marker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 28px;
  padding: 2px 9px 2px 5px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: var(--shadow);
}
/* Grow the hit area to at least 44x44 CSS px without changing the layout. */
.marker::after {
  content: "";
  position: absolute;
  inset: -11px -8px;
}
.marker__dot {
  flex: none;
  box-sizing: border-box;
  width: 14px;
  height: 14px;
  border: 3px solid var(--surface-strong);
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 1.5px var(--accent);
}
.marker:hover {
  background: var(--surface-strong);
}
.marker.is-selected {
  background: var(--accent);
  color: var(--accent-text);
  box-shadow: 0 0 0 3px var(--surface-strong), 0 0 0 5px var(--accent);
}
.marker.is-selected .marker__dot {
  background: var(--accent-text);
  border-color: var(--accent);
  box-shadow: 0 0 0 1.5px var(--accent-text);
}

/* --- panel content --- */
.btn--text {
  padding: 0 14px;
}
.btn--primary,
.topbar button.btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}
.btn--primary:hover,
.topbar button.btn--primary:hover {
  background: var(--accent);
  filter: brightness(1.1);
}
.panel__subtitle {
  margin: 16px 0 6px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.panel__body > .panel__subtitle:first-child {
  margin-top: 0;
}
.panel__note {
  margin: 8px 0;
  color: var(--text-muted);
  font-size: 13px;
}
.link {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
  overflow-wrap: anywhere;
}
.hotspot__kind {
  margin: 0 0 8px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.hotspot__description {
  margin: 0 0 12px;
  font-size: 15px;
  line-height: 1.5;
}
.hotspot__confidence {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}
.hotspot__meaning {
  color: var(--text-muted);
  font-size: 13px;
}
.hotspot__sources {
  margin: 0 0 16px;
  padding-left: 1.2em;
}
.hotspot__sources li {
  margin: 4px 0;
}

/* Badges always carry their text; the border style repeats the level for colour-blind readers. */
.badge {
  display: inline-block;
  padding: 1px 9px;
  border: 1.5px solid currentcolor;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.5;
  white-space: nowrap;
}
.badge--documented {
  background: var(--doc-bg);
  color: var(--doc-fg);
  border-style: solid;
}
.badge--inferred {
  background: var(--inf-bg);
  color: var(--inf-fg);
  border-style: dashed;
}
.badge--illustrative {
  background: var(--ill-bg);
  color: var(--ill-fg);
  border-style: dotted;
}
.badge--unknown {
  background: transparent;
  color: var(--text-muted);
}

/* --- legend --- */
.legend {
  margin: 0;
  padding: 0;
  list-style: none;
}
.legend__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}
.swatch {
  flex: none;
  width: 22px;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: 4px;
}
.legend__icon {
  position: relative;
  flex: none;
  width: 22px;
  height: 22px;
}
.legend__icon--marker::before {
  content: "";
  position: absolute;
  inset: 4px;
  border: 3px solid var(--surface-strong);
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 1.5px var(--accent);
}
.legend__icon--label::before {
  content: "Aa";
  position: absolute;
  inset: 0;
  font-size: 13px;
  font-weight: 700;
  line-height: 22px;
  text-align: center;
}
/* A dark street line on a swatch of the (light) map background, so it shows in dark mode too. */
.legend__icon--street {
  background: #dfe6e9;
  border-radius: 4px;
}
.legend__icon--street::before {
  content: "";
  position: absolute;
  left: 2px;
  right: 2px;
  top: 10px;
  height: 2px;
  background: #1f2a33; /* STREET_COLOR in overlay/streetsLayer.ts */
}

/* --- sources panel --- */
.prov {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.prov__title {
  margin: 0 0 6px;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.prov__list {
  display: grid;
  grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
  gap: 4px 12px;
  margin: 0;
}
.prov__list dt {
  color: var(--text-muted);
  font-size: 13px;
}
.prov__list dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.prov__list--processing {
  grid-template-columns: minmax(0, 1fr) auto; /* label, then a value that never wraps */
}
.prov__list--processing dd {
  white-space: nowrap;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.prov__list dd .hotspot__meaning {
  display: block;
  margin-top: 2px;
}

/* --- about dialog --- */
.about {
  box-sizing: border-box;
  width: min(40rem, calc(100% - 2 * var(--edge)));
  max-height: calc(100vh - 2 * var(--edge));
  max-height: calc(100dvh - 2 * var(--edge));
  padding: 0;
  overflow: auto;
  overscroll-behavior: contain;
  background: var(--surface-strong);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.about::backdrop {
  background: rgba(0, 0, 0, 0.55);
}
.about__inner {
  padding: 20px 22px 22px;
  font-size: 15px;
  line-height: 1.5;
}
.about__title {
  margin: 0 0 8px;
  font-size: 1.4rem;
}
.about__heading {
  margin: 18px 0 4px;
  font-size: 1.05rem;
}
.about p {
  margin: 6px 0;
}
.about__confidence,
.about__credits {
  margin: 6px 0;
  padding-left: 1.2em;
}
.about__confidence {
  padding-left: 0;
  list-style: none;
}
.about__confidence li {
  margin: 6px 0;
}
.about__warning {
  margin: 18px 0 14px;
  font-weight: 650;
}
.about__close {
  min-height: 44px;
}

/* --- places panel --- */
.places {
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
}
.places__item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  box-sizing: border-box;
  width: 100%;
  min-height: var(--control-h);
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.places__item:hover {
  background: var(--hover);
}
.places__name {
  min-width: 0;
  overflow-wrap: anywhere;
}
.places__kind {
  flex: none;
  color: var(--text-muted);
  font-size: 12px;
}
@media (pointer: coarse) {
  .places__item {
    min-height: 44px;
  }
}
```

- [ ] **Step 2: Create the shell and helpers**

`viewer/src/ui/clipboard.ts`:

```ts
/**
 * Copy text to the clipboard. Uses the async Clipboard API when it is available (secure
 * contexts only), otherwise a hidden textarea and execCommand("copy"). Resolves true on
 * success, false when both routes fail (e.g. permission denied); it never rejects.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy route (permission denied, insecure context, no focus).
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const active = document.activeElement as HTMLElement | null;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;pointer-events:none";
  document.body.appendChild(area);
  let ok = false;
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    area.remove();
    active?.focus?.();
  }
  return ok;
}
```

`viewer/src/ui/shell.ts`:

```ts
/**
 * The plain-DOM UI shell: top bar, layer toggles, side panels, status line and toasts.
 * No frameworks and no three.js. Every string from data goes through textContent.
 */
import { nextAnnouncement } from "../a11y";
import { layerAnnouncement } from "../placesList";
import { SEARCH_INPUT_ID } from "./searchBox";

export interface Panel {
  /** The panel's content area; fill it with your own elements. */
  el: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** Replace the heading (and the close button's label). Plain text only. */
  setTitle(title: string): void;
  /** Called whenever the panel goes from open to closed, however that happened. */
  onClose(handler: () => void): void;
}

export interface ToggleHandle {
  /** Set the checkbox without calling the onChange handler. */
  set(on: boolean): void;
  /** Grey the toggle out; `reason` becomes its tooltip and is read by screen readers. */
  disable(reason: string): void;
  /** Undo disable(). */
  enable(): void;
}

export interface Shell {
  readonly root: HTMLElement;
  readonly header: HTMLElement;
  /** Empty container in the top bar where the search box goes. */
  readonly searchSlot: HTMLElement;
  /**
   * Add a text button (Legend, Sources, About, ...) to the top bar, before the layer
   * toggles. Below 640px it lives inside the Menu disclosure with the other actions.
   * `first` puts it before the existing ones.
   */
  addAction(id: string, label: string, onClick: () => void, options?: { first?: boolean }): HTMLButtonElement;
  addToggle(
    id: string,
    label: string,
    checked: boolean,
    onChange: (on: boolean) => void,
  ): ToggleHandle;
  onReset(handler: () => void): void;
  /** -1 = rotate left (Q), +1 = rotate right (E). */
  onRotate(handler: (dir: 1 | -1) => void): void;
  onSurprise(handler: () => void): void;
  onCopyLink(handler: () => void): void;
  /** Replace the text of the polite live status line (empty hides it). */
  setStatus(text: string): void;
  /**
   * Say something to screen readers only (a visually hidden polite live region), e.g.
   * "Selected: Lobos Creek". Saying the same text twice in a row is announced again.
   */
  announce(text: string): void;
  addPanel(id: string, title: string): Panel;
  /** Close the most recently opened open panel; false when none was open. */
  closeTopPanel(): boolean;
  /** Show a short message for TOAST_MS in a polite live region. */
  toast(text: string): void;
}

export const TOAST_MS = 2500;
const TOAST_FADE_MS = 300;

type Attrs = Record<string, string>;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  attrs?: Attrs,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function actionButton(
  className: string,
  visible: string,
  ariaLabel: string,
  title: string,
  glyphOnly = false,
): HTMLButtonElement {
  const b = el("button", className, { type: "button", "aria-label": ariaLabel, title });
  const span = el("span", glyphOnly ? "btn-glyph" : "btn-text", undefined, visible);
  if (glyphOnly) span.setAttribute("aria-hidden", "true");
  b.appendChild(span);
  return b;
}

export function createShell(root: HTMLElement): Shell {
  root.classList.add("ui-root");
  root.replaceChildren();

  // First stop in the tab order: jump past the top bar to the search box (or, when the
  // dataset has none, to the first control). The link must not touch the URL hash, which
  // holds the view state, so it is handled in script.
  document.querySelector(".skip-link")?.remove();
  const skip = el("a", "skip-link", { href: "#", "data-skip": "search" }, "Skip to search");
  skip.addEventListener("click", (e) => {
    e.preventDefault();
    const target =
      document.getElementById(SEARCH_INPUT_ID) ?? root.querySelector<HTMLElement>(".topbar button, .topbar input");
    target?.focus();
  });
  document.body.prepend(skip);

  const header = el("header", "topbar", { role: "banner" });
  const title = el("h1", "topbar__title", undefined, "Yelamu");
  const searchSlot = el("div", "topbar__search");

  // Everything except the title and the search sits in the menu: inline on wide screens,
  // behind a disclosure button on phones (see ui.css).
  const MENU_ID = "topbar-menu";
  const menuBtn = el("button", "btn topbar__menu-btn", {
    type: "button",
    "aria-expanded": "false",
    "aria-controls": MENU_ID,
  });
  menuBtn.append(el("span", "btn-text", undefined, "Menu"));
  const menu = el("div", "topbar__menu", { id: MENU_ID });
  const links = el("div", "topbar__links", { role: "group", "aria-label": "About this map" });

  const toggles = el("fieldset", "toggles");
  toggles.hidden = true; // nothing to show until a layer registers a toggle
  toggles.appendChild(el("legend", "visually-hidden", undefined, "Layers"));

  const actions = el("div", "topbar__actions", { role: "group", "aria-label": "View controls" });
  const resetBtn = actionButton("btn", "Reset", "Reset view", "Reset view (H)");
  const rotLeftBtn = actionButton("btn btn--icon", "↺", "Rotate left", "Rotate left (Q)", true);
  const rotRightBtn = actionButton("btn btn--icon", "↻", "Rotate right", "Rotate right (E)", true);
  const surpriseBtn = actionButton("btn", "Surprise me", "Surprise me", "Fly to a random place");
  const copyBtn = actionButton("btn", "Copy link", "Copy link", "Copy a link to this view");
  actions.append(resetBtn, rotLeftBtn, rotRightBtn, surpriseBtn, copyBtn);

  menu.append(links, toggles, actions);
  header.append(title, searchSlot, menuBtn, menu);

  let menuOpen = false;
  const setMenuOpen = (open: boolean) => {
    menuOpen = open;
    menuBtn.setAttribute("aria-expanded", String(open));
    menu.dataset.open = String(open);
  };
  setMenuOpen(false);
  menuBtn.addEventListener("click", () => setMenuOpen(!menuOpen));
  // Choosing an action closes the menu so the result is not hidden behind it.
  menu.addEventListener("click", (e) => {
    if ((e.target as Element).closest("button")) setMenuOpen(false);
  });
  header.addEventListener("keydown", (e) => {
    // Only when the Menu button is actually shown (phones); on wide screens Esc keeps its usual job.
    if (e.key === "Escape" && menuOpen && menuBtn.offsetParent !== null) {
      setMenuOpen(false);
      menuBtn.focus();
      e.stopPropagation();
    }
  });

  const status = el("p", "status", { role: "status", "aria-live": "polite" });
  const announcer = el("p", "visually-hidden", { role: "status", "aria-live": "polite" });
  let lastAnnouncement = "";
  const toastEl = el("div", "toast", { role: "status", "aria-live": "polite" });
  const panelHost = el("div", "panels");
  root.append(header, status, announcer, toastEl, panelHost);

  // Panels sit below the top bar, which wraps to a variable height on narrow screens.
  const syncBarHeight = () =>
    root.style.setProperty("--topbar-h", `${Math.ceil(header.getBoundingClientRect().height)}px`);
  syncBarHeight();
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(syncBarHeight).observe(header);

  const resetHandlers: Array<() => void> = [];
  const rotateHandlers: Array<(dir: 1 | -1) => void> = [];
  const surpriseHandlers: Array<() => void> = [];
  const copyHandlers: Array<() => void> = [];
  resetBtn.addEventListener("click", () => resetHandlers.forEach((h) => h()));
  rotLeftBtn.addEventListener("click", () => rotateHandlers.forEach((h) => h(-1)));
  rotRightBtn.addEventListener("click", () => rotateHandlers.forEach((h) => h(1)));
  surpriseBtn.addEventListener("click", () => surpriseHandlers.forEach((h) => h()));
  copyBtn.addEventListener("click", () => copyHandlers.forEach((h) => h()));

  const announce = (text: string) => {
    lastAnnouncement = nextAnnouncement(text, lastAnnouncement);
    announcer.textContent = lastAnnouncement;
  };

  const openStack: Panel[] = [];
  const panelIds = new Set<string>();
  const toggleIds = new Set<string>();
  const actionIds = new Set<string>();
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let toastClearTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    root,
    header,
    searchSlot,

    addAction(id, label, onClick, options) {
      if (actionIds.has(id)) throw new Error(`action "${id}" already exists`);
      actionIds.add(id);
      const button = el("button", "btn btn--text", { type: "button", "data-action": id }, label);
      button.addEventListener("click", () => onClick());
      if (options?.first) links.prepend(button);
      else links.appendChild(button);
      return button;
    },

    addToggle(id, label, checked, onChange) {
      if (toggleIds.has(id)) throw new Error(`toggle "${id}" already exists`);
      toggleIds.add(id);
      const inputId = `toggle-${id}`;
      const input = el("input", undefined, { type: "checkbox", id: inputId });
      input.checked = checked;
      input.dataset.layer = id;
      const text = el("span", undefined, undefined, label);
      const wrap = el("label", "toggle", { for: inputId });
      wrap.append(input, text);
      // The reason a toggle is disabled lives outside the label so it is not part of its name.
      const whyId = `toggle-${id}-why`;
      const why = el("span", "visually-hidden", { id: whyId });
      toggles.append(wrap, why);
      toggles.hidden = false;
      input.addEventListener("change", () => {
        // A checkbox already announces its own state; this also covers the layer's effect.
        announce(layerAnnouncement(label, input.checked));
        onChange(input.checked);
      });
      return {
        set(on: boolean) {
          input.checked = on;
        },
        disable(reason: string) {
          input.disabled = true;
          wrap.title = reason;
          wrap.classList.add("is-disabled");
          why.textContent = reason;
          input.setAttribute("aria-describedby", whyId);
        },
        enable() {
          input.disabled = false;
          wrap.removeAttribute("title");
          wrap.classList.remove("is-disabled");
          why.textContent = "";
          input.removeAttribute("aria-describedby");
        },
      };
    },

    onReset: (h) => void resetHandlers.push(h),
    onRotate: (h) => void rotateHandlers.push(h),
    onSurprise: (h) => void surpriseHandlers.push(h),
    onCopyLink: (h) => void copyHandlers.push(h),

    setStatus(text) {
      status.textContent = text;
    },

    announce,

    addPanel(id, panelTitle) {
      if (panelIds.has(id)) throw new Error(`panel "${id}" already exists`);
      panelIds.add(id);
      const titleId = `panel-${id}-title`;
      const section = el("section", "panel", {
        id: `panel-${id}`,
        role: "region",
        "aria-labelledby": titleId,
        tabindex: "-1",
      });
      section.hidden = true;
      const head = el("div", "panel__header");
      const h2 = el("h2", "panel__title", { id: titleId }, panelTitle);
      const closeBtn = el("button", "btn btn--icon panel__close", {
        type: "button",
        "aria-label": `Close ${panelTitle}`,
        title: "Close (Esc)",
      });
      closeBtn.appendChild(el("span", "btn-glyph", { "aria-hidden": "true" }, "×"));
      head.append(h2, closeBtn);
      const body = el("div", "panel__body");
      section.append(head, body);
      panelHost.appendChild(section);

      let returnFocus: HTMLElement | null = null;
      const closeHandlers: Array<() => void> = [];
      const panel: Panel = {
        el: body,
        isOpen: () => !section.hidden,
        open() {
          // One side panel at a time: panels share the same spot, so an older one would
          // otherwise sit hidden behind the newest and its button would seem to do nothing.
          for (const other of [...openStack]) if (other !== panel) other.close();
          const at = openStack.indexOf(panel);
          if (at >= 0) openStack.splice(at, 1);
          else returnFocus = document.activeElement as HTMLElement | null;
          openStack.push(panel);
          section.hidden = false;
          section.focus({ preventScroll: true });
        },
        close() {
          const at = openStack.indexOf(panel);
          if (at >= 0) openStack.splice(at, 1);
          if (section.hidden) return;
          const hadFocus = section.contains(document.activeElement);
          section.hidden = true;
          if (hadFocus && returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
          returnFocus = null;
          for (const h of [...closeHandlers]) h();
        },
        setTitle(text) {
          h2.textContent = text;
          closeBtn.setAttribute("aria-label", `Close ${text}`);
        },
        onClose: (h) => void closeHandlers.push(h),
      };
      closeBtn.addEventListener("click", () => panel.close());
      return panel;
    },

    closeTopPanel() {
      const top = openStack[openStack.length - 1];
      if (!top) return false;
      top.close();
      return true;
    },

    toast(text) {
      if (toastTimer !== null) clearTimeout(toastTimer);
      if (toastClearTimer !== null) clearTimeout(toastClearTimer);
      toastEl.textContent = text;
      toastEl.dataset.visible = "true";
      toastTimer = setTimeout(() => {
        delete toastEl.dataset.visible;
        // Empty the live region once it has faded, so stale text is not left for screen readers.
        toastClearTimer = setTimeout(() => {
          toastEl.textContent = "";
        }, TOAST_FADE_MS);
      }, TOAST_MS);
    },
  };
}
```

`viewer/src/ui/searchBox.ts`:

```ts
/**
 * Accessible search combobox (ARIA 1.2 list autocomplete): an input with role=combobox
 * that controls a listbox of options. Names come from data, so everything is textContent.
 * The matching itself lives in search.ts.
 */
import { searchMetaLabel, type SearchItem } from "../search";

export interface SearchBoxOptions {
  /** Results for the current text (called on every input). */
  query(text: string): SearchItem[];
  onSelect(item: SearchItem): void;
}

export interface SearchBox {
  /** Focus the input and select its text (the "/" shortcut). */
  focus(): void;
  clear(): void;
}

const LISTBOX_ID = "search-listbox";
/** id of the search input (the skip link in shell.ts focuses it). */
export const SEARCH_INPUT_ID = "search-input";
const INPUT_ID = SEARCH_INPUT_ID;

export function createSearchBox(slot: HTMLElement, options: SearchBoxOptions): SearchBox {
  const wrap = document.createElement("div");
  wrap.className = "search";

  const label = document.createElement("label");
  label.className = "visually-hidden";
  label.htmlFor = INPUT_ID;
  label.textContent = "Search places and streets";

  const input = document.createElement("input");
  input.id = INPUT_ID;
  input.className = "search__input";
  input.type = "text";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", LISTBOX_ID);
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "Search places (/)";
  input.maxLength = 80;

  const list = document.createElement("ul");
  list.id = LISTBOX_ID;
  list.className = "search__list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Search results");
  list.hidden = true;

  const live = document.createElement("p");
  live.className = "visually-hidden";
  live.setAttribute("role", "status");

  wrap.append(label, input, list, live);
  slot.appendChild(wrap);

  let results: SearchItem[] = [];
  let active = -1;

  const optionId = (i: number) => `search-opt-${i}`;

  const setActive = (i: number) => {
    active = i;
    const options_ = list.children;
    for (let k = 0; k < options_.length; k++) {
      const on = k === i;
      options_[k].setAttribute("aria-selected", String(on));
      options_[k].classList.toggle("is-active", on);
    }
    if (i >= 0) {
      input.setAttribute("aria-activedescendant", optionId(i));
      options_[i]?.scrollIntoView?.({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  };

  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    setActive(-1);
  };

  const open = () => {
    if (results.length === 0) return;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };

  const choose = (i: number) => {
    const item = results[i];
    if (!item) return;
    input.value = item.name;
    close();
    live.textContent = "";
    input.blur(); // hand the keyboard back to the map shortcuts
    options.onSelect(item);
  };

  const render = () => {
    list.replaceChildren();
    results.forEach((item, i) => {
      const li = document.createElement("li");
      li.id = optionId(i);
      li.className = "search__option";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      const name = document.createElement("span");
      name.className = "search__name";
      name.textContent = item.name;
      const meta = document.createElement("span");
      meta.className = "search__meta";
      meta.textContent = searchMetaLabel(item);
      li.append(name, meta);
      list.appendChild(li);
    });
  };

  input.addEventListener("input", () => {
    results = options.query(input.value);
    render();
    setActive(-1);
    if (results.length > 0) {
      open();
      live.textContent = `${results.length} ${results.length === 1 ? "result" : "results"}`;
    } else {
      close();
      live.textContent = input.value.trim().length >= 2 ? "No results" : "";
    }
  });

  input.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (results.length === 0) return;
        e.preventDefault();
        if (list.hidden) open();
        const step = e.key === "ArrowDown" ? 1 : -1;
        const next = active < 0 ? (step > 0 ? 0 : results.length - 1) : (active + step + results.length) % results.length;
        setActive(next);
        break;
      }
      case "Enter":
        if (!list.hidden && results.length > 0) {
          e.preventDefault();
          choose(active >= 0 ? active : 0);
        }
        break;
      case "Escape":
        if (!list.hidden) {
          close();
          e.stopPropagation(); // closing the list must not also close a panel
        } else if (input.value !== "") {
          input.value = "";
          results = [];
          live.textContent = "";
          e.stopPropagation();
        } else {
          input.blur(); // nothing to undo: let Esc carry on to the panel handler
        }
        break;
      default:
        break;
    }
  });

  input.addEventListener("focus", () => {
    if (results.length > 0 && input.value !== "") open();
  });
  input.addEventListener("blur", () => close());

  // Keep focus in the input while clicking an option, so blur does not close the list first.
  list.addEventListener("mousedown", (e) => e.preventDefault());
  list.addEventListener("click", (e) => {
    const li = (e.target as Element).closest("li");
    if (!li) return;
    choose(Array.prototype.indexOf.call(list.children, li));
  });
  list.addEventListener("mousemove", (e) => {
    const li = (e.target as Element).closest("li");
    if (!li) return;
    const i = Array.prototype.indexOf.call(list.children, li);
    if (i !== active) setActive(i);
  });

  return {
    focus() {
      input.focus();
      input.select();
    },
    clear() {
      input.value = "";
      results = [];
      close();
      live.textContent = "";
    },
  };
}
```

- [ ] **Step 3: Create the panels and dialog**

`viewer/src/ui/hotspotPanel.ts`:

```ts
/** Side panel with the details of one hotspot. All text from data goes through textContent. */
import { confidenceInfo } from "../confidence";
import type { Hotspot } from "../overlay/types";
import type { Panel, Shell } from "./shell";

export interface HotspotPanel {
  /** Fill and open the panel for `hotspot`. */
  show(hotspot: Hotspot): void;
  /** Close the panel (calls the onClose handlers). */
  hide(): void;
  isOpen(): boolean;
  onClose(handler: () => void): void;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** A badge whose text is always visible (colour is only a hint). */
export function confidenceBadge(confidence: string): HTMLElement {
  const info = confidenceInfo(confidence);
  const badge = node("span", `badge badge--${info.key}`, info.label);
  badge.title = info.meaning;
  return badge;
}

/** Only absolute http(s) links reach the DOM. */
export function safeLink(url: string, text: string): HTMLElement {
  let ok = false;
  try {
    const p = new URL(url).protocol;
    ok = p === "http:" || p === "https:";
  } catch {
    ok = false;
  }
  if (!ok) return node("span", undefined, text);
  const a = node("a", "link", text);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

export function createHotspotPanel(shell: Shell): HotspotPanel {
  const panel: Panel = shell.addPanel("hotspot", "Hotspot");

  const show = (h: Hotspot) => {
    panel.setTitle(h.name);
    const info = confidenceInfo(h.confidence);

    const kind = node("p", "hotspot__kind", h.kind);
    const description = node("p", "hotspot__description", h.description);

    const confidence = node("div", "hotspot__confidence");
    confidence.append(confidenceBadge(h.confidence), node("span", "hotspot__meaning", info.meaning));

    const sourcesTitle = node("h3", "panel__subtitle", "Sources");
    const sources = node("ul", "hotspot__sources");
    for (const s of h.sources) {
      const li = node("li");
      li.appendChild(safeLink(s.url, s.title));
      sources.appendChild(li);
    }

    const close = node("button", "btn btn--text hotspot__close", "Close");
    close.type = "button";
    close.addEventListener("click", () => panel.close());

    panel.el.replaceChildren(kind, description, confidence, sourcesTitle, sources, close);
    panel.open();
  };

  return {
    show,
    hide: () => panel.close(),
    isOpen: () => panel.isOpen(),
    onClose: (h) => panel.onClose(h),
  };
}
```

`viewer/src/ui/legend.ts`:

```ts
/** Legend panel: what the ground colours and map symbols mean. */
import type { HeightmapMeta } from "../heightmap";
import { legendEntries } from "../legendEntries";
import { VEGETATION_NOTE } from "../provenanceData";
import type { Shell } from "./shell";

export function createLegend(
  shell: Shell,
  meta: Pick<HeightmapMeta, "habitat_classes" | "overlay_file">,
  options: { vegetation?: boolean } = {},
) {
  const panel = shell.addPanel("legend", "Legend");

  const heading = document.createElement("h3");
  heading.className = "panel__subtitle";
  heading.textContent = "Ground";
  const list = document.createElement("ul");
  list.className = "legend";
  for (const e of legendEntries(meta.habitat_classes)) {
    const li = document.createElement("li");
    li.className = "legend__row";
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.backgroundColor = e.color; // our own constant, never data
    swatch.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = e.label;
    li.append(swatch, text);
    list.appendChild(li);
  }

  const parts: Node[] = [heading, list];
  if (list.children.length === 0) {
    const none = document.createElement("p");
    none.className = "panel__note";
    none.textContent = "This dataset has no ground classes.";
    parts.splice(1, 1, none);
  }

  if (meta.overlay_file) {
    const symbols = document.createElement("h3");
    symbols.className = "panel__subtitle";
    symbols.textContent = "Map symbols";
    const sym = document.createElement("ul");
    sym.className = "legend legend--symbols";
    const rows: Array<[string, string]> = [
      ["marker", "Hotspot: select it to read about the place."],
      ["label", "Text label: a landmark. Positions are approximate."],
      ["street", "Thin dark line: a modern street, for orientation only."],
    ];
    for (const [kind, text] of rows) {
      const li = document.createElement("li");
      li.className = "legend__row";
      const icon = document.createElement("span");
      icon.className = `legend__icon legend__icon--${kind}`;
      icon.setAttribute("aria-hidden", "true");
      const t = document.createElement("span");
      t.textContent = text;
      li.append(icon, t);
      sym.appendChild(li);
    }
    parts.push(symbols, sym);
  }

  if (options.vegetation) {
    // The same sentence as on the Sources panel, so the two never disagree.
    const note = document.createElement("p");
    note.className = "panel__note";
    note.textContent = VEGETATION_NOTE;
    parts.push(note);
  }

  panel.el.replaceChildren(...parts);
  return panel;
}
```

`viewer/src/ui/provenance.ts`:

```ts
/** Sources panel: where each data layer comes from and how sure we are. */
import { confidenceInfo } from "../confidence";
import type { HeightmapMeta } from "../heightmap";
import { OVERLAY_NOTE, VEGETATION_NOTE, processingEntries } from "../provenanceData";
import { confidenceBadge } from "./hotspotPanel";
import type { Shell } from "./shell";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function createProvenance(
  shell: Shell,
  meta: Pick<HeightmapMeta, "layers" | "processing" | "overlay_file">,
  options: { vegetation?: boolean } = {},
) {
  const panel = shell.addPanel("provenance", "Sources");
  const parts: Node[] = [];

  parts.push(el("h3", "panel__subtitle", "Data layers"));
  const layers = meta.layers ?? [];
  if (layers.length === 0) {
    parts.push(el("p", "panel__note", "No data layers are listed for this dataset."));
  }
  for (const layer of layers) {
    const card = el("section", "prov");
    card.appendChild(el("h4", "prov__title", layer.id));
    const dl = el("dl", "prov__list");
    const info = confidenceInfo(layer.confidence);
    const confidenceDd = el("dd");
    confidenceDd.append(confidenceBadge(layer.confidence), el("span", "hotspot__meaning", info.meaning));
    const rows: Array<[string, Node | string]> = [
      ["Source", layer.source],
      ["Confidence", confidenceDd],
      ["Attribution", layer.attribution],
    ];
    for (const [term, value] of rows) {
      dl.appendChild(el("dt", undefined, term));
      if (typeof value === "string") dl.appendChild(el("dd", undefined, value));
      else dl.appendChild(value);
    }
    card.appendChild(dl);
    parts.push(card);
  }

  const entries = processingEntries(meta.processing);
  if (entries.length > 0) {
    parts.push(el("h3", "panel__subtitle", "Processing"));
    const dl = el("dl", "prov__list prov__list--processing");
    for (const e of entries) {
      dl.appendChild(el("dt", undefined, e.label));
      dl.appendChild(el("dd", undefined, e.value));
    }
    parts.push(dl);
  }

  if (meta.overlay_file) {
    parts.push(el("h3", "panel__subtitle", "Streets and landmarks"));
    parts.push(el("p", "panel__note", OVERLAY_NOTE));
  }

  if (options.vegetation) {
    parts.push(el("h3", "panel__subtitle", "Vegetation"));
    parts.push(el("p", "panel__note", VEGETATION_NOTE));
  }

  panel.el.replaceChildren(...parts);
  return panel;
}
```

`viewer/src/ui/placesPanel.ts`:

```ts
/**
 * Places panel: every hotspot and landmark as a list of buttons, so the whole map can be
 * reached from the keyboard or a screen reader without hunting for markers on the canvas.
 * Choosing one closes the panel (returning focus to the Places button) and calls onSelect,
 * which flies there and opens the hotspot panel. All names go through textContent.
 */
import type { PlaceGroup } from "../placesList";
import type { Panel, Shell } from "./shell";

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function createPlacesPanel(shell: Shell, groups: readonly PlaceGroup[], onSelect: (id: string) => void): Panel {
  const panel = shell.addPanel("places", "Places");
  const parts: Node[] = [];
  parts.push(node("p", "panel__note", "Every hotspot and landmark on the map. Choose one to fly there."));
  for (const group of groups) {
    const headingId = `places-${group.title.toLowerCase()}`;
    const heading = node("h3", "panel__subtitle", group.title);
    heading.id = headingId;
    const list = node("ul", "places");
    list.setAttribute("aria-labelledby", headingId);
    for (const item of group.items) {
      const li = node("li");
      const button = node("button", "places__item");
      button.type = "button";
      button.dataset.place = item.id;
      button.append(node("span", "places__name", item.name), node("span", "places__kind", item.kind));
      button.addEventListener("click", () => {
        panel.close();
        onSelect(item.id);
      });
      li.appendChild(button);
      list.appendChild(li);
    }
    parts.push(heading, list);
  }
  if (groups.length === 0) parts.push(node("p", "panel__note", "This dataset has no places."));
  panel.el.replaceChildren(...parts);
  return panel;
}
```

`viewer/src/ui/about.ts` (**owner review required before launch**; the wording is plain on purpose):

```ts
/**
 * The About dialog: a native <dialog> opened with showModal(), so the browser traps focus,
 * Esc closes it and focus returns to whatever opened it. Static wording only (no data).
 */
import { CONFIDENCE_INFO } from "../confidence";
import { takeFirstVisit } from "../aboutSeen";
import { confidenceBadge, safeLink } from "./hotspotPanel";

export interface AboutDialog {
  open(): void;
  close(): void;
  /** Open once for a first-time visitor (remembered in localStorage, never throws). */
  openIfFirstVisit(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function section(title: string, ...body: Node[]): HTMLElement {
  const s = el("section", "about__section");
  s.appendChild(el("h3", "about__heading", title));
  s.append(...body);
  return s;
}

function paragraph(...parts: Array<string | Node>): HTMLElement {
  const p = el("p");
  p.append(...parts);
  return p;
}

export function createAbout(): AboutDialog {
  const dialog = el("dialog", "about");
  dialog.setAttribute("aria-labelledby", "about-title");

  const inner = el("div", "about__inner");
  const title = el("h2", "about__title", "About Yelamu");
  title.id = "about-title";
  inner.appendChild(title);

  inner.appendChild(
    section(
      "What this map is",
      paragraph(
        "This map shows the landscape of the San Francisco peninsula around 1769. It is reconstructed from " +
          "modern elevation data and from historical ecology maps. It is an informed picture of how land and " +
          "water may have lain, not a photograph or a survey.",
      ),
    ),
  );

  // Wording needs the owner's review before public launch
  inner.appendChild(
    section(
      "The Ramaytush Ohlone",
      paragraph(
        "The San Francisco peninsula is the homeland of the Ramaytush Ohlone. The Ramaytush Ohlone are a " +
          "living community today, not only a people of the past. To learn from them directly, visit the ",
        safeLink("https://www.ramaytush.org/", "Association of Ramaytush Ohlone"),
        ".",
      ),
      paragraph(
        "This map shows land and water only. It does not depict villages, people or sacred sites.",
      ),
    ),
  );

  const sure = el("ul", "about__confidence");
  for (const key of ["documented", "inferred", "illustrative"] as const) {
    const li = el("li");
    li.append(confidenceBadge(key), el("span", undefined, ` ${CONFIDENCE_INFO[key].meaning}`));
    sure.appendChild(li);
  }
  inner.appendChild(
    section(
      "How sure are we",
      paragraph("Each layer and each hotspot says how well supported it is:"),
      sure,
    ),
  );

  const credits = el("ul", "about__credits");
  const credit = (...parts: Array<string | Node>) => {
    const li = el("li");
    li.append(...parts);
    credits.appendChild(li);
  };
  credit(
    "San Francisco Estuary Institute. 2021. Hidden Nature SF, version 1.0. ",
    safeLink("https://hidden-nature.org/", "hidden-nature.org"),
    ".",
  );
  credit("U.S. Geological Survey 3D Elevation Program.");
  credit("U.S. Census Bureau TIGER/Line.");
  credit("three.js.");
  inner.appendChild(section("Credits", credits));

  inner.appendChild(el("p", "about__warning", "This map is not for navigation, engineering or legal use."));

  const explore = el("button", "btn btn--primary about__close", "Explore the map");
  explore.type = "button";
  explore.autofocus = true;
  explore.addEventListener("click", () => dialog.close());
  inner.appendChild(explore);

  dialog.appendChild(inner);
  document.body.appendChild(dialog);

  // A click on the backdrop lands on the <dialog> itself (the content fills .about__inner).
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  // Typing inside the dialog must not drive the map behind it (Q/E rotate, arrows pan, ...).
  dialog.addEventListener("keydown", (e) => e.stopPropagation());

  const open = () => {
    if (dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", ""); // very old browsers: non-modal fallback
    explore.focus();
  };

  return {
    open,
    close: () => dialog.close(),
    openIfFirstVisit() {
      if (takeFirstVisit()) open();
    },
  };
}
```

- [ ] **Step 4: Typecheck and test**

Run: `cd viewer && npx tsc --noEmit && npm test`
Expected: `tsc` clean; still **443** in total (including the one skipped test).

- [ ] **Step 5: Commit**

```bash
git add viewer/src/ui
git commit -m "feat(viewer): UI shell, search box, panels, About dialog, and styles"
```

---

### Task 11: Wire everything together

New pointer and keyboard controls drive the rig; `main.ts` builds one `AppContext` that the modules (information, overlay, effects) plug into; the hash and layers stay in sync; the quality controller and idle animator run. A synthetic overlay generator supports development without real data. `uiColors.test.ts` is a guard test for contrast against the real stylesheet, so it passes as soon as it is added.

**Files:**
- Create: `viewer/src/appContext.ts`, `modules.ts`, `infoModule.ts`, `overlayModule.ts`, `effectsModule.ts`, `nodeTestShims.d.ts`, `uiColors.test.ts`
- Replace: `viewer/src/controls.ts`, `viewer/src/main.ts`, `viewer/index.html`
- Modify: `viewer/package.json`
- Create: `viewer/scripts/make_overlay_synth.mjs`

- [ ] **Step 1: Add the contrast guard test**

`viewer/src/nodeTestShims.d.ts`:

```ts
// Tests run in Node but the project has no @types/node; declare the one call they use.
declare module "node:fs" {
  export function readFileSync(path: URL, encoding: "utf8"): string;
}
```

`viewer/src/uiColors.test.ts`:

```ts
/**
 * Colour contrast of the viewer UI, checked against the real ui.css tokens and the colour
 * constants exported by the modules that draw things. WCAG 2.x: 4.5:1 for text, 3:1 for
 * UI parts such as focus rings. Streets are the one exception: a faint orientation aid
 * drawn as 1 px lines, held to 1.5:1 against every ground colour (see streetsLayer.ts).
 *
 * Measured numbers (light theme unless noted), kept here so a reviewer need not run it:
 *   label text 1c2429 on its white halo ........ 15.7:1   (on bare ground: 2.6 woodland .. 11.1 beach)
 *   street slate 1f2a33: darkest ground (woodland 4f6b3f) 2.4:1, lightest (beach e6d9a8) 10.3:1,
 *     worst case over all ten ground colours 2.35:1 (primary) / 1.74:1 (local, 0.6 opacity)
 *   old street cream fff3d6: woodland 5.4:1 but beach 1.28:1, dune 1.55:1 -> replaced
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { blend, contrastRatio, meetsContrast } from "./a11y";
import { GROUP_COLORS } from "./habitat";
import { LABEL_HALO, LABEL_HALO_ALPHA, LABEL_TEXT } from "./overlay/labels";
import { STREET_COLOR, STREET_OPACITY } from "./overlay/streetsLayer";
import { SCENE_BACKGROUND } from "./theme";
import { VEG_COLORS } from "./vegetation/geometry";
import { VEGETATION_BY_GROUP } from "./vegetation/placement";

// Read the real stylesheet (vitest replaces CSS imports with an empty string).
const css = readFileSync(new URL("./ui/ui.css", import.meta.url), "utf8");

interface Rgba {
  color: number;
  alpha: number;
}
type Tokens = Record<string, string>;

function tokensOf(block: string): Tokens {
  const out: Tokens = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
function color(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return { color: parseInt(hex[1], 16), alpha: 1 };
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value);
  if (!rgba) throw new Error(`cannot parse colour ${value}`);
  return { color: (+rgba[1] << 16) | (+rgba[2] << 8) | +rgba[3], alpha: rgba[4] === undefined ? 1 : +rgba[4] };
}

const rootBlock = /:root\s*\{([^}]*)\}/.exec(css)![1];
const darkBlock = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)![1];
const light = tokensOf(rootBlock);
const themes: Record<string, Tokens> = { light, dark: { ...light, ...tokensOf(darkBlock) } };

const grounds = Object.entries(GROUP_COLORS);
const hexCss = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const fmt = (n: number) => n.toFixed(2);

describe("ui.css tokens", () => {
  it("parses both themes", () => {
    expect(light.text).toBe("#1c2429");
    expect(themes.dark.text).toBe("#e8eef1");
    expect(themes.dark["accent-text"]).toBe("#0d1a20");
    expect(themes.dark["label-fg"]).toBe(light["label-fg"]); // labels sit on the unthemed canvas
  });

  it("keeps the label colours in sync with overlay/labels.ts", () => {
    expect(color(light["label-fg"]).color).toBe(LABEL_TEXT);
    const halo = color(light["label-halo"]);
    expect(halo.color).toBe(LABEL_HALO);
    expect(halo.alpha).toBeCloseTo(LABEL_HALO_ALPHA, 5);
  });
});

describe.each(Object.keys(themes))("text contrast, %s theme (>= 4.5:1)", (name) => {
  const t = themes[name];
  const c = (k: string) => color(t[k]).color;
  const pairs: Array<[string, string, string]> = [
    ["text", "surface-strong", "body text on panels"],
    ["text", "bg", "body text on the page background"],
    ["text-muted", "surface-strong", "muted text on panels"],
    ["text-muted", "bg", "muted text on the page background"],
    ["accent", "surface-strong", "links and accent text on panels"],
    ["accent-text", "accent", "selected marker, pressed and primary buttons"],
    ["bg", "text", "toast (inverted)"],
    ["doc-fg", "doc-bg", "documented badge"],
    ["inf-fg", "inf-bg", "inferred badge"],
    ["ill-fg", "ill-bg", "illustrative badge"],
  ];
  it.each(pairs)("%s on %s (%s)", (fg, bg) => {
    expect(contrastRatio(c(fg), c(bg)), `${fg} on ${bg} in ${name}`).toBeGreaterThanOrEqual(4.5);
  });

  it("text on the hover and active-option tint of a panel", () => {
    const hover = color(t.hover);
    const tinted = blend(hover.color, hover.alpha, c("surface-strong"));
    expect(contrastRatio(c("text"), tinted)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c("text-muted"), tinted)).toBeGreaterThanOrEqual(4.5);
  });

  it("marker chip text stays readable over every ground colour", () => {
    const surface = color(t.surface);
    for (const [group, ground] of grounds) {
      const chip = blend(surface.color, surface.alpha, ground);
      const ratio = contrastRatio(c("text"), chip);
      expect(ratio, `marker chip over ${group} (${hexCss(ground)})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the status line text stays readable over every ground colour", () => {
    const surface = color(t.surface);
    for (const [group, ground] of grounds) {
      const box = blend(surface.color, surface.alpha, ground);
      expect(contrastRatio(c("text-muted"), box), `status over ${group}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the focus ring is visible against panels and the page (>= 3:1)", () => {
    expect(contrastRatio(c("focus"), c("surface-strong"))).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(c("focus"), c("bg"))).toBeGreaterThanOrEqual(3);
  });
});

describe("map labels", () => {
  it("text on its halo meets 4.5:1, also over every ground colour", () => {
    expect(meetsContrast(LABEL_TEXT, LABEL_HALO, 4.5)).toBe(true);
    for (const [group, ground] of grounds) {
      const halo = blend(LABEL_HALO, LABEL_HALO_ALPHA, ground);
      expect(contrastRatio(LABEL_TEXT, halo), `halo over ${group}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("canvas focus ring", () => {
  it("is a fixed colour that stands out from the (unthemed) scene background", () => {
    const ring = color(light["canvas-ring"]).color;
    expect(contrastRatio(ring, SCENE_BACKGROUND)).toBeGreaterThanOrEqual(3);
    // and in dark mode it is the same colour: the scene does not change with the theme
    expect(themes.dark["canvas-ring"]).toBe(light["canvas-ring"]);
  });
});

describe("street lines (a faint orientation aid, not text)", () => {
  const lum = (h: number) => contrastRatio(h, 0x000000); // monotonic in luminance
  const sorted = [...grounds].sort((a, b) => lum(a[1]) - lum(b[1]));
  const [darkestName, darkest] = sorted[0];
  const [lightestName, lightest] = sorted[sorted.length - 1];

  it("identifies the extremes", () => {
    expect(darkestName).toBe("woodland");
    expect(lightestName).toBe("beach");
  });

  it("clears 1.5:1 against the darkest and lightest ground colours", () => {
    expect(contrastRatio(STREET_COLOR, darkest)).toBeGreaterThanOrEqual(1.5);
    expect(contrastRatio(STREET_COLOR, lightest)).toBeGreaterThanOrEqual(1.5);
  });

  it("clears 1.5:1 against every ground colour, at each street class's opacity", () => {
    for (const [kind, opacity] of Object.entries(STREET_OPACITY)) {
      for (const [group, ground] of grounds) {
        const drawn = blend(STREET_COLOR, opacity, ground);
        const ratio = contrastRatio(drawn, ground);
        expect(ratio, `${kind} streets over ${group}: ${fmt(ratio)}`).toBeGreaterThanOrEqual(1.5);
      }
    }
  });
});

describe("vegetation shapes against their ground", () => {
  // Not WCAG: a rough check that a plant is told apart from the colour it stands on.
  it("each plant colour differs from the ground of every group it grows in", () => {
    const colorOf = { tree: VEG_COLORS.canopy, shrub: VEG_COLORS.shrub, reed: VEG_COLORS.reed };
    for (const [group, spec] of Object.entries(VEGETATION_BY_GROUP)) {
      if (!spec) continue;
      const ratio = contrastRatio(colorOf[spec.kind], GROUP_COLORS[group]);
      expect(ratio, `${spec.kind} on ${group}: ${fmt(ratio)}`).toBeGreaterThanOrEqual(1.3);
    }
  });
});
```

- [ ] **Step 2: Create the context and modules**

`viewer/src/appContext.ts`:

```ts
import type * as THREE from "three";
import type { HeightmapMeta } from "./heightmap";
import type { LayerSelection } from "./layerSelection";
import type { PlaceSelection } from "./placeSelection";
import type { QualityController } from "./quality";
import type { SurpriseTarget } from "./surprise";
import type { TerrainChunks } from "./terrainChunks";
import type { Shell } from "./ui/shell";
import type { VegetationLayer } from "./vegetation/layer";
import type { ViewRig } from "./viewRig";
import type { WaterMaterial } from "./water/waterMaterial";

/** Callbacks for the keyboard shortcuts that belong to modules built on top of the core. */
export interface KeyHandlers {
  /** "/" pressed. Default: no-op. A search module replaces it to focus its input. */
  search(): void;
  /** "?" pressed. Default: no-op. A help module replaces it to open the help panel. */
  help(): void;
  /** Escape pressed. Default: closes the top-most open panel. Wrap it to add behaviour. */
  escape(): void;
}

/**
 * Everything a feature module needs, built once by start() in main.ts after the data has
 * loaded. Modules receive it from initModules (modules.ts) and keep a reference.
 */
export interface AppContext {
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  /** Camera pose: pan, zoom, rotate, flyTo, onChange. */
  rig: ViewRig;
  shell: Shell;
  meta: HeightmapMeta;
  /** Heights in metres, row-major, row 0 = north edge (see terrainMesh.ts). */
  heights: Float32Array;
  habitat: Uint8Array | null;
  terrain: TerrainChunks;
  /** Ask for one render on the next animation frame (cheap to call repeatedly). */
  requestRender(): void;
  /**
   * Like requestRender, but for frames nobody asked for by interacting (the idle water
   * animation): the frame only draws the scene, skips terrain updates and onFrame
   * callbacks, and is not fed to the quality controller.
   */
  requestIdleRender(): void;
  /** Watches interaction frame gaps and steps the effects level down/up. */
  quality: QualityController;
  /** Plants on the full-resolution chunks; null when the dataset has no habitat raster. */
  vegetation: VegetationLayer | null;
  /** The water surface material (animation on/off, time). */
  water: WaterMaterial;
  /** Base URL of the selected dataset folder, e.g. "/assets/slice" (no trailing slash). */
  assetBase: string;
  /** Vertical exaggeration applied to terrain (and anything that must sit on it). */
  verticalExaggeration: number;
  /** Enabled optional layers; mirrored into the URL hash (`l=`). */
  layers: LayerSelection;
  /** The selected hotspot / landmark id; mirrored into the URL hash (`p=`). */
  place: PlaceSelection;
  /**
   * Places "Surprise me" may fly to instead of a random land point (about 60% of the
   * time when non-empty). Modules push onto it; `place` is selected on arrival.
   */
  surpriseTargets: SurpriseTarget[];
  /**
   * Run `cb` after every renderer.render (camera matrices are current). A callback that
   * throws is removed and logged once. Returns an unsubscribe function.
   */
  onFrame(cb: () => void): () => void;
  handlers: KeyHandlers;
}
```

`viewer/src/modules.ts`:

```ts
import type { AppContext } from "./appContext";
import { effectsModule } from "./effectsModule";
import { infoModule } from "./infoModule";
import { overlayModule } from "./overlayModule";

/** A feature module (overlay, search, hotspots, vegetation, ...) plugged into the app. */
export type AppModule = (ctx: AppContext) => void | Promise<void>;

/**
 * Registered modules run in order after the core view is up. Add a module by importing
 * it here and appending it; a module that throws is logged and does not stop the rest.
 */
export const modules: AppModule[] = [infoModule, effectsModule, overlayModule];

export async function initModules(ctx: AppContext): Promise<void> {
  for (const init of modules) {
    try {
      await init(ctx);
    } catch (err) {
      console.error("module failed to initialise", err);
    }
  }
}
```

`viewer/src/infoModule.ts` (Legend, Sources and About exist even when there is no overlay):

```ts
import type { AppModule } from "./modules";
import { createAbout } from "./ui/about";
import { createLegend } from "./ui/legend";
import { createProvenance } from "./ui/provenance";

/**
 * Legend, Sources and About: they only need the dataset's meta.json, so they exist with or
 * without an overlay. The About dialog opens by itself on a visitor's first visit.
 */
export const infoModule: AppModule = (ctx) => {
  const { shell, meta } = ctx;
  // Vegetation shapes exist only where there is a habitat raster to place them by.
  const vegetation = ctx.vegetation !== null;
  const legend = createLegend(shell, meta, { vegetation });
  const sources = createProvenance(shell, meta, { vegetation });
  const about = createAbout();

  // One info panel at a time keeps the screen readable.
  const openOnly = (panel: { open(): void; close(): void }, others: Array<{ close(): void }>) => {
    for (const o of others) o.close();
    panel.open();
  };
  shell.addAction("legend", "Legend", () => openOnly(legend, [sources]));
  shell.addAction("sources", "Sources", () => openOnly(sources, [legend]));
  shell.addAction("about", "About", () => about.open());

  about.openIfFirstVisit();
};
```

`viewer/src/overlayModule.ts`:

```ts
import type { AppContext } from "./appContext";
import type { AppModule } from "./modules";
import { makeHeightSampler } from "./overlay/heightAt";
import { HOTSPOT_PRIORITY, LabelLayer, landmarkPriority, type LabelItem } from "./overlay/labels";
import { loadOverlay } from "./overlay/parse";
import { overlaySearchItems } from "./overlay/searchItems";
import {
  STREET_LIFT_M,
  STREET_STEP_M,
  STREET_THRESHOLDS,
  StreetsLayer,
} from "./overlay/streetsLayer";
import type { Hotspot, Landmark } from "./overlay/types";
import { groupPlaces, selectedAnnouncement } from "./placesList";
import { buildSearchIndex, search, type SearchItem } from "./search";
import { createHotspotPanel } from "./ui/hotspotPanel";
import { createPlacesPanel } from "./ui/placesPanel";
import { createSearchBox } from "./ui/searchBox";

/** Camera zoom used when flying to a search result or a surprise hotspot (never zooms out). */
export const PLACE_ZOOM = { hotspot: 6, landmark: 4, street: 4 } as const;

const LAYER_DEFS = [
  { id: "streets", label: "Streets", defaultOn: false },
  { id: "landmarks", label: "Landmarks", defaultOn: true },
  { id: "hotspots", label: "Hotspots", defaultOn: true },
] as const;

/**
 * Modern streets, landmark labels, hotspot markers + panel and local search, all driven by
 * the dataset's overlay.json. A dataset without `overlay_file`, or a failed load, leaves
 * the viewer exactly as it was (one console warning).
 */
export const overlayModule: AppModule = async (ctx: AppContext) => {
  let overlay;
  try {
    overlay = await loadOverlay(ctx.assetBase, ctx.meta);
  } catch (err) {
    console.warn("Overlay not loaded; continuing without streets, labels and hotspots.", err);
    return;
  }
  if (!overlay) return;

  const { shell, rig, layers, place } = ctx;
  const heightAt = makeHeightSampler(ctx.heights, ctx.meta);
  const exaggeration = ctx.verticalExaggeration;
  /** World y for a label at (x, z): the ground, or the water surface where that is higher. */
  const groundY = (x: number, z: number) => Math.max(heightAt(x, z), ctx.meta.water_level_m) * exaggeration;

  // --- streets (built on first use: the layer starts off) ---
  let streets: StreetsLayer | null = null;
  const ensureStreets = (): StreetsLayer => {
    if (!streets) {
      streets = new StreetsLayer(overlay, heightAt, {
        exaggeration,
        liftM: STREET_LIFT_M,
        stepM: STREET_STEP_M,
        thresholds: STREET_THRESHOLDS,
      });
      streets.update(ctx.camera.zoom);
      ctx.scene.add(streets.object);
    }
    return streets;
  };

  // --- labels and markers ---
  const hotspots = new Map<string, Hotspot>(overlay.hotspots.map((h) => [h.id, h]));
  const landmarks = new Map<string, Landmark>(overlay.landmarks.map((l) => [l.id, l]));
  const items: LabelItem[] = [
    ...overlay.landmarks.map(
      (l): LabelItem => ({ id: l.id, text: l.name, x: l.x, z: l.z, y: groundY(l.x, l.z), kind: "landmark", priority: landmarkPriority(l.kind) }),
    ),
    ...overlay.hotspots.map(
      (h): LabelItem => ({ id: h.id, text: h.name, x: h.x, z: h.z, y: groundY(h.x, h.z), kind: "hotspot", priority: HOTSPOT_PRIORITY }),
    ),
  ];

  const panel = createHotspotPanel(shell);
  const labels = new LabelLayer(shell.root, (id) => place.set(id));
  labels.setItems(items);

  // --- layer toggles (defaults apply only when the URL has no `l`) ---
  const visibleKinds = new Set<string>();
  const handles = new Map<string, ReturnType<typeof shell.addToggle>>();
  const syncLayers = () => {
    visibleKinds.clear();
    if (layers.has("landmarks")) visibleKinds.add("landmark");
    if (layers.has("hotspots")) visibleKinds.add("hotspot");
    const wantStreets = layers.has("streets");
    if (wantStreets) ensureStreets().setEnabled(true);
    else streets?.setEnabled(false);
    for (const def of LAYER_DEFS) handles.get(def.id)?.set(layers.has(def.id));
    ctx.requestRender();
  };
  for (const def of LAYER_DEFS) {
    const on = layers.register(def.id, def.defaultOn);
    handles.set(def.id, shell.addToggle(def.id, def.label, on, (v) => layers.set(def.id, v)));
  }
  layers.onChange(syncLayers);
  syncLayers();

  // --- per frame: street detail by zoom, label placement ---
  // Streets switch before the render (rig changes arrive first), labels after it, when
  // the camera matrices are final.
  rig.onChange(() => {
    if (streets?.update(ctx.camera.zoom)) ctx.requestRender();
  });
  ctx.onFrame(() => labels.update(ctx.camera, ctx.canvas.clientWidth, ctx.canvas.clientHeight, visibleKinds));

  // --- places: one selection drives the panel, the highlight and the hash (`p=`) ---
  const applyPlace = (id: string | undefined) => {
    labels.setSelected(id);
    const hotspot = id ? hotspots.get(id) : undefined;
    if (hotspot) panel.show(hotspot);
    else panel.hide();
    ctx.requestRender();
  };
  place.onChange((id) => {
    applyPlace(id);
    // Screen readers hear the selection even when no panel opens (a landmark).
    const name = id ? (hotspots.get(id)?.name ?? landmarks.get(id)?.name) : undefined;
    if (name) shell.announce(selectedAnnouncement(name));
  });
  panel.onClose(() => {
    if (place.get() && hotspots.has(place.get()!)) place.set(undefined);
  });
  // A place in the URL (shared link): validate it now that the overlay is known.
  const initial = place.get();
  if (initial && !hotspots.has(initial) && !landmarks.has(initial)) place.set(undefined);
  else applyPlace(place.get());

  // Esc: close a panel first; otherwise drop a selected landmark.
  const defaultEscape = ctx.handlers.escape;
  ctx.handlers.escape = () => {
    if (shell.closeTopPanel()) return;
    if (place.get()) place.set(undefined);
    else defaultEscape();
  };

  // --- search ---
  const index = buildSearchIndex(overlaySearchItems(overlay));
  const choose = (item: SearchItem) => {
    const zoom = Math.max(rig.getState().zoom, PLACE_ZOOM[item.group]);
    rig.flyTo(item.x, item.z, zoom);
    if (item.group === "street") return;
    // Same place picked again: the panel may have been closed, so reopen it directly.
    if (place.get() === item.id) applyPlace(item.id);
    else place.set(item.id);
  };
  const box = createSearchBox(shell.searchSlot, {
    query: (text) => search(index, text),
    onSelect: choose,
  });
  ctx.handlers.search = () => box.focus();

  // --- Places: a keyboard and screen-reader route to every hotspot and landmark ---
  const placeItems = new Map<string, SearchItem>();
  for (const item of overlaySearchItems(overlay)) if (item.group !== "street") placeItems.set(item.id, item);
  const placesPanel = createPlacesPanel(
    shell,
    groupPlaces(
      overlay.hotspots.map((h) => ({ id: h.id, name: h.name, kind: h.kind })),
      overlay.landmarks.map((l) => ({ id: l.id, name: l.name, kind: l.kind })),
    ),
    (id) => {
      const item = placeItems.get(id);
      if (item) choose(item);
    },
  );
  shell.addAction("places", "Places", () => placesPanel.open(), { first: true });

  // --- Surprise me sometimes goes to a hotspot ---
  for (const h of overlay.hotspots) {
    ctx.surpriseTargets.push({ x: h.x, z: h.z, zoom: PLACE_ZOOM.hotspot, place: h.id });
  }

  ctx.requestRender();
};
```

`viewer/src/effectsModule.ts`:

```ts
import type { AppModule } from "./modules";
import {
  VEGETATION_LAYER,
  WATER_MOTION_DISABLED_REASON,
  WATER_MOTION_LAYER,
  defaultVegetationOn,
  degradeMessage,
  effectiveEffects,
  type EffectiveEffects,
} from "./effects";
import { createIdleAnimator } from "./water/idleAnimator";

/** How often the water is redrawn while the camera is still. */
export const IDLE_WATER_FPS = 15;

/**
 * Vegetation and animated water: the two layer toggles, the automatic quality level that
 * can switch them off on a slow device, the prefers-reduced-motion rule, and the idle
 * animator that keeps the water moving while nobody is interacting. The rules live in
 * effects.ts; this module only connects them to the shell, the layer selection and the
 * scene objects.
 */
export const effectsModule: AppModule = (ctx) => {
  const { layers, shell, quality, vegetation, water } = ctx;
  const media = (query: string) => (typeof matchMedia === "function" ? matchMedia(query) : null);
  const reducedMq = media("(prefers-reduced-motion: reduce)");
  const coarse = media("(pointer: coarse)")?.matches ?? false;
  const reduced = () => reducedMq?.matches ?? false;

  // A visitor who switches an effect ON while the controller has switched it off expects to
  // see it: give them full quality again (the controller will step down again if needed).
  const userTurnedOn = () => {
    if (quality.level() < 2) quality.reset(2);
  };

  const handles = new Map<string, ReturnType<typeof shell.addToggle>>();
  if (vegetation) {
    const on = layers.register(VEGETATION_LAYER, defaultVegetationOn(coarse));
    handles.set(
      VEGETATION_LAYER,
      shell.addToggle(VEGETATION_LAYER, "Vegetation", on, (v) => {
        if (v) userTurnedOn(); // before the layer change, which applies the level
        layers.set(VEGETATION_LAYER, v);
      }),
    );
  }
  const waterOn = layers.register(WATER_MOTION_LAYER, true);
  handles.set(
    WATER_MOTION_LAYER,
    shell.addToggle(WATER_MOTION_LAYER, "Water motion", waterOn, (v) => {
      if (v) userTurnedOn();
      layers.set(WATER_MOTION_LAYER, v);
    }),
  );

  const effective = (): EffectiveEffects =>
    effectiveEffects({
      vegetation: vegetation !== null && layers.has(VEGETATION_LAYER),
      waterMotion: layers.has(WATER_MOTION_LAYER),
      level: quality.level(),
      reducedMotion: reduced(),
    });

  const idle = createIdleAnimator(() => ctx.requestIdleRender(), {
    fps: IDLE_WATER_FPS,
    enabled: () => effective().waterAnimation,
  });

  let current: EffectiveEffects = { vegetation: false, waterAnimation: false };
  const apply = (): EffectiveEffects => {
    const before = current;
    current = effective();
    vegetation?.setEnabled(current.vegetation);
    water.setAnimated(current.waterAnimation);
    if (current.waterAnimation) idle.start();
    else idle.stop();

    // Toggles mirror the layer selection (the URL hash can change it); under reduced
    // motion the water toggle is shown off and disabled, with the reason as its tooltip.
    handles.get(VEGETATION_LAYER)?.set(layers.has(VEGETATION_LAYER));
    const waterHandle = handles.get(WATER_MOTION_LAYER)!;
    if (reduced()) {
      waterHandle.set(false);
      waterHandle.disable(WATER_MOTION_DISABLED_REASON);
    } else {
      waterHandle.enable();
      waterHandle.set(layers.has(WATER_MOTION_LAYER));
    }
    ctx.requestRender();
    return before;
  };

  layers.onChange(() => void apply());
  reducedMq?.addEventListener?.("change", () => void apply());
  quality.onChange((level, previous) => {
    const before = apply();
    const message = degradeMessage(level, previous, before, current);
    if (message) shell.toast(message);
  });

  // Chunks built while vegetation was off (or hidden by the quality level) get their plants
  // here, a few per frame, once it is on and the chunk is in view.
  if (vegetation) {
    ctx.onFrame(() => {
      if (vegetation.refresh(ctx.terrain.visibleLod0Meshes())) ctx.requestRender();
    });
  }

  apply();
};
```

- [ ] **Step 3: Replace the controls, the entry point and the page**

`viewer/src/controls.ts`:

```ts
import * as THREE from "three";
import { keyAction } from "./keys";
import { unitsPerPixel, type ViewRig } from "./viewRig";

/** Wheel zoom feel: the zoom factor is exp(-deltaY * WHEEL_ZOOM_RATE). */
const WHEEL_ZOOM_RATE = 0.0015;
/** Zoom factor of one + / - key press. */
export const KEY_ZOOM_FACTOR = 1.25;
/** Holding Shift multiplies an arrow-key pan step by this. */
const SHIFT_PAN_MULTIPLIER = 3;

/**
 * Drag to pan, wheel / two-finger pinch to zoom, all through the ViewRig (which clamps,
 * places the camera and notifies). Returns a function that removes the listeners.
 */
export function attachPointerControls(
  canvas: HTMLCanvasElement,
  camera: THREE.OrthographicCamera,
  rig: ViewRig,
): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart = 0;
  let zoomStart = 1;

  const upp = () => unitsPerPixel(camera, canvas.clientHeight);

  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const rebasePinch = () => {
    pinchStart = pinchDistance();
    zoomStart = rig.getState().zoom;
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) rebasePinch();
  };

  const onMove = (e: PointerEvent) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    if (e.pointerType === "mouse" && e.buttons === 0) {
      // The button was released outside the window; treat the drag as over.
      pointers.delete(e.pointerId);
      return;
    }
    const next = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, next);
    if (pointers.size === 1) {
      rig.panBy(next.x - prev.x, next.y - prev.y, upp());
    } else if (pointers.size === 2 && pinchStart > 0) {
      rig.setState({ zoom: (zoomStart * pinchDistance()) / pinchStart });
    }
  };

  const onRelease = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 2) {
      // A third finger lifted: restart the pinch from the two that remain.
      rebasePinch();
    } else if (pointers.size < 2) {
      pinchStart = 0;
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    // deltaMode 1 = lines, 2 = pages (Firefox mouse wheels); normalise to pixels.
    const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
    rig.zoomBy(Math.exp(-e.deltaY * px * WHEEL_ZOOM_RATE));
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onRelease);
  canvas.addEventListener("pointercancel", onRelease);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onRelease);
    canvas.removeEventListener("pointercancel", onRelease);
    canvas.removeEventListener("wheel", onWheel);
  };
}

export interface KeyboardHandlers {
  onSearch(): void;
  onHelp(): void;
  onEscape(): void;
  /** Screen pixels an arrow key press pans by (Shift = 3x). */
  panStepPx: number;
}

/**
 * Keyboard shortcuts (see keys.ts). Arrow keys pan and + / - zoom (both may auto-repeat);
 * Q / E rotate, H resets, / searches, ? shows help, Escape escapes. preventDefault is
 * called only for keys that were handled. Returns a function that removes the listener.
 */
export function attachKeyboard(
  root: HTMLElement | Window,
  rig: ViewRig,
  handlers: KeyboardHandlers,
  getUnitsPerPixel: () => number,
): () => void {
  const onKeyDown = (event: Event) => {
    const e = event as KeyboardEvent;
    if (e.defaultPrevented) return;
    const action = keyAction({
      key: e.key,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
      target: e.target as HTMLElement | null,
    });
    if (!action) return;
    const oneShot = action.type !== "pan" && action.type !== "zoom";
    if (oneShot && e.repeat) {
      e.preventDefault();
      return;
    }
    switch (action.type) {
      case "pan": {
        const step = handlers.panStepPx * (e.shiftKey ? SHIFT_PAN_MULTIPLIER : 1);
        // The action is where the VIEW moves; panBy takes a drag, which is the opposite.
        rig.panBy(-action.dx * step, -action.dy * step, getUnitsPerPixel());
        break;
      }
      case "zoom":
        rig.zoomBy(action.dir > 0 ? KEY_ZOOM_FACTOR : 1 / KEY_ZOOM_FACTOR);
        break;
      case "rotate":
        rig.rotate(action.dir);
        break;
      case "reset":
        rig.reset();
        break;
      case "search":
        handlers.onSearch();
        break;
      case "help":
        handlers.onHelp();
        break;
      case "escape":
        handlers.onEscape();
        return; // nothing to prevent: Escape has no default action we are replacing
    }
    e.preventDefault();
  };
  root.addEventListener("keydown", onKeyDown);
  return () => root.removeEventListener("keydown", onKeyDown);
}
```

`viewer/src/main.ts`:

```ts
import * as THREE from "three";
import { createIsoCamera, fitViewSize } from "./camera";
import { switchZoomFor } from "./chunks";
import type { AppContext } from "./appContext";
import { decodeState, type AppState } from "./appState";
import { attachKeyboard, attachPointerControls } from "./controls";
import { GROUP_COLORS, buildPalette, makeColorAt, paletteToLinear, shadeByDepth } from "./habitat";
import { loadHabitat, loadHeightmap } from "./heightmap";
import { createHashSync } from "./hashSync";
import { LayerSelection } from "./layerSelection";
import { initModules } from "./modules";
import { PlaceSelection } from "./placeSelection";
import { QualityController } from "./quality";
import { pickSurpriseTarget, type SurpriseTarget } from "./surprise";
import { pickRandomLandPoint } from "./randomLand";
import { SCENE_BACKGROUND } from "./theme";
import { TerrainChunks } from "./terrainChunks";
import { copyText } from "./ui/clipboard";
import { createShell } from "./ui/shell";
import "./ui/ui.css";
import { VegetationLayer } from "./vegetation/layer";
import { ViewRig, unitsPerPixel } from "./viewRig";
import { createWaterMaterial } from "./water/waterMaterial";

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

// Camera limits. The target may stray this fraction of the larger map half-extent past the edge.
const TARGET_MARGIN_FRACTION = 0.15;
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 40;
// "Surprise me" flies in to this multiple of the zoom where full-resolution terrain starts.
const SURPRISE_ZOOM_FACTOR = 1.3;
// Screen pixels one arrow-key press pans by (Shift = 3x).
const KEY_PAN_STEP_PX = 60;

// The shell does not need any data, so it exists before loading and can show errors.
const shell = createShell(document.getElementById("ui")!);
shell.setStatus("Loading...");

async function start() {
  const canvas = document.getElementById("scene") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE_BACKGROUND);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f6a, 0.7));
  const sun = new THREE.DirectionalLight(0xfff3d6, 2.6);
  sun.position.set(-1, 1.2, 0.6);
  scene.add(sun);

  const { meta, heights } = await loadHeightmap(ASSET_BASE);
  const habitat = await loadHabitat(ASSET_BASE, meta);

  // Palette entries are sRGB; vertex colours are read as linear by three.js.
  const palette = paletteToLinear(buildPalette(habitat ? (meta.habitat_classes ?? []) : []));
  // With a habitat raster a class id missing from the legend is "unmapped" grey, never a
  // guessed ground tan; the tan is only for datasets without any habitat data.
  const fallback = new THREE.Color(habitat ? GROUP_COLORS.unmapped : FALLBACK_GROUND); // linear
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
  // The switch zoom depends on the framing, which follows the window aspect, so it is
  // recomputed on every resize (a half-width window fits much more map into view).
  const switchZoomAt = (aspect: number, heightPx: number) =>
    switchZoomFor(
      fitViewSize(widthM, depthM, maxHeightM, aspect),
      heightPx,
      meta.cell_m,
      MAX_COARSE_SPACING_PX,
    );
  let switchZoom = switchZoomAt(aspect0, canvas.clientHeight);

  // Plants stand on the full-resolution chunks only (the coarse LOD is too rough to plant on).
  // The layer starts disabled; the effects module switches it on from the layer toggle and the
  // quality level, and chunks built before that are planted lazily (see VegetationLayer.refresh).
  const vegetation = habitat
    ? new VegetationLayer({
        size: meta,
        heights,
        habitat,
        classes: meta.habitat_classes ?? [],
        waterLevelM: meta.water_level_m,
        exaggeration: VERTICAL_EXAGGERATION,
      })
    : null;
  vegetation?.setEnabled(false);

  const terrain = new TerrainChunks(
    heights,
    meta,
    VERTICAL_EXAGGERATION,
    colorAt,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }),
    {
      switchZoom,
      hooks: vegetation
        ? {
            onLod0Built: (plan, mesh) => vegetation.attach(mesh, plan),
            onLod0Evicted: (_plan, mesh) => vegetation.detach(mesh),
          }
        : undefined,
    },
  );
  scene.add(terrain.root);

  const extent = Math.max(meta.width, meta.height) * meta.cell_m;
  // The same translucent blue as before; moving ripples are switched on by the effects module.
  const waterFx = createWaterMaterial();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(extent * 4, extent * 4).rotateX(-Math.PI / 2), waterFx.material);
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
      "position:fixed;right:12px;bottom:12px;z-index:20;padding:6px 10px;background:rgba(0,0,0,.7);" +
      "color:#fff;border-radius:6px;font:12px/1.4 ui-monospace,monospace;white-space:pre;pointer-events:none";
    document.body.appendChild(overlay);
  }
  const quality = new QualityController();
  const frameTimes: number[] = [];
  let lastFrame = 0;
  const trackFrame = (now: number) => {
    // Rendering is on demand, so skip the idle gaps between interactions (>= 500 ms).
    if (lastFrame && now - lastFrame < 500) {
      frameTimes.push(now - lastFrame);
      if (frameTimes.length > 60) frameTimes.shift();
      quality.record(now - lastFrame);
    }
    lastFrame = now;
  };
  const updateOverlay = () => {
    if (!overlay) return;
    const avg = frameTimes.reduce((a, b) => a + b, 0) / (frameTimes.length || 1);
    const s = terrain.stats();
    const veg = vegetation?.stats() ?? { instances: 0, meshes: 0 };
    overlay.textContent =
      `fps        ${avg > 0 ? (1000 / avg).toFixed(0) : "-"}\n` +
      `draw calls ${renderer.info.render.calls}\n` +
      `triangles  ${renderer.info.render.triangles.toLocaleString()}\n` +
      `LOD        ${s.lod} (switch at zoom ${switchZoom.toFixed(2)}, now ${camera.zoom.toFixed(2)})\n` +
      `LOD0 chunks resident ${s.lod0Resident}, visible ${s.lod0Visible}\n` +
      `quality    level ${quality.level()} (p90 ${Number.isFinite(quality.p90()) ? quality.p90().toFixed(1) : "-"} ms)\n` +
      `vegetation ${vegetation ? `${veg.instances.toLocaleString()} instances, ${veg.meshes} meshes` : "none"}`;
  };

  // One render per animation frame, however many times it is requested. update() may
  // return true when chunks are still being built, so keep going until it settles.
  const frameCallbacks = new Set<() => void>();
  const onFrame = (cb: () => void) => {
    frameCallbacks.add(cb);
    return () => void frameCallbacks.delete(cb);
  };
  let queued = false;
  let interactive = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame((now) => {
      queued = false;
      const wasInteractive = interactive;
      interactive = false;
      waterFx.setTime(now / 1000);
      if (!wasInteractive) {
        // Only the idle water animation asked for this frame: nothing else has changed, so
        // skip the terrain update and the post-render callbacks (label layout), and do not
        // let the ~15 fps cadence reach the quality controller as if it were slow rendering.
        renderer.render(scene, camera);
        lastFrame = 0;
        return;
      }
      const pending = terrain.update(camera);
      renderer.render(scene, camera);
      for (const cb of [...frameCallbacks]) {
        try {
          cb();
        } catch (err) {
          // A broken callback must not stop rendering; drop it after the first failure.
          frameCallbacks.delete(cb);
          console.error("frame callback failed and was removed", err);
        }
      }
      trackFrame(now);
      updateOverlay();
      if (pending) requestRender();
    });
  };
  const requestRender = () => {
    interactive = true;
    schedule();
  };
  const requestIdleRender = () => schedule();
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const halfWidth = widthM / 2;
  const halfDepth = depthM / 2;
  const rig = new ViewRig(camera, {
    bounds: { halfWidth, halfDepth },
    margin: TARGET_MARGIN_FRACTION * Math.max(halfWidth, halfDepth),
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    reducedMotion,
  });

  // Shared state from the URL hash: view pose and enabled layers.
  const fromHash = decodeState(location.hash);
  rig.setState({ x: fromHash.x, z: fromHash.z, zoom: fromHash.zoom, rot: fromHash.rot });
  // No `l` in the hash: each layer takes its default. `l=` (empty): everything optional is off.
  const layers = new LayerSelection(fromHash.layers);
  const place = new PlaceSelection(fromHash.place);

  const appState = (): AppState => ({
    ...rig.getState(),
    layers: layers.hashValue(),
    place: place.get(),
  });
  const hashSync = createHashSync({
    getState: appState,
    write: (encoded) => {
      try {
        // Keep the path and the ?data= / ?debug query; only the fragment changes.
        history.replaceState(history.state, "", `${location.pathname}${location.search}#${encoded}`);
      } catch {
        // replaceState can throw in sandboxed frames; the URL just stays as it is.
      }
    },
  });
  rig.onChange(() => {
    requestRender();
    hashSync.schedule();
  });
  layers.onChange(() => hashSync.schedule());
  place.onChange(() => hashSync.schedule());
  window.addEventListener("pagehide", () => hashSync.flush());
  // A hand-edited or pasted hash on the same page: apply it (replaceState does not fire this).
  window.addEventListener("hashchange", () => {
    const next = decodeState(location.hash);
    rig.setState({ x: next.x, z: next.z, zoom: next.zoom, rot: next.rot });
    if (next.layers) layers.replace(next.layers);
    place.set(next.place);
    hashSync.markCurrent();
  });

  attachPointerControls(canvas, camera, rig);

  const surpriseTargets: SurpriseTarget[] = [];
  const handlers: AppContext["handlers"] = {
    search: () => {},
    help: () => {},
    escape: () => void shell.closeTopPanel(),
  };
  attachKeyboard(
    window,
    rig,
    {
      onSearch: () => handlers.search(),
      onHelp: () => handlers.help(),
      onEscape: () => handlers.escape(),
      panStepPx: KEY_PAN_STEP_PX,
    },
    () => unitsPerPixel(camera, canvas.clientHeight),
  );

  shell.onReset(() => rig.reset());
  shell.onRotate((dir) => rig.rotate(dir));
  shell.onSurprise(() => {
    const target = pickSurpriseTarget(surpriseTargets, Math.random);
    if (target) {
      rig.flyTo(target.x, target.z, target.zoom);
      place.set(target.place);
      return;
    }
    place.set(undefined);
    const spot = pickRandomLandPoint(heights, meta, meta.water_level_m, Math.random);
    if (!spot) {
      shell.toast("No dry land to visit");
      return;
    }
    rig.flyTo(spot.x, spot.z, switchZoom * SURPRISE_ZOOM_FACTOR);
  });
  shell.onCopyLink(async () => {
    hashSync.flush(); // make sure the address bar holds the view being shared
    const ok = await copyText(location.href);
    shell.toast(ok ? "Link copied" : "Could not copy the link");
  });

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
    switchZoom = switchZoomAt(aspect, h);
    terrain.setSwitchZoom(switchZoom);
    rig.place();
    requestRender();
  };
  window.addEventListener("resize", resize);
  resize();

  shell.setStatus(
    `${meta.width}x${meta.height} cells at ${meta.cell_m} m. Drag to pan, scroll to zoom, Q and E to rotate.`,
  );

  const ctx: AppContext = {
    canvas,
    scene,
    camera,
    renderer,
    rig,
    shell,
    meta,
    heights,
    habitat,
    terrain,
    requestRender,
    requestIdleRender,
    quality,
    vegetation,
    water: waterFx,
    assetBase: ASSET_BASE,
    verticalExaggeration: VERTICAL_EXAGGERATION,
    layers,
    place,
    surpriseTargets,
    onFrame,
    handlers,
  };
  if (DEBUG) (window as unknown as { __yelamu: AppContext }).__yelamu = ctx;
  void initModules(ctx);
}

start().catch((err) => {
  console.error(err);
  shell.setStatus(`Failed to load: ${err instanceof Error ? err.message : String(err)}`);
});
```

`viewer/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="color-scheme" content="light dark" />
    <title>Yelamu: interactive 3D map of the historical landscape of San Francisco</title>
  </head>
  <body>
    <canvas
      id="scene"
      role="img"
      tabindex="0"
      aria-label="Interactive 3D map of Yelamu, the historical landscape of San Francisco. Arrow keys pan the map, plus and minus zoom, Q and E rotate, H resets the view."
    ></canvas>
    <div id="ui"></div>
    <noscript>
      <p class="noscript-msg" style="font-family: system-ui, sans-serif; padding: 1rem">Yelamu is an interactive 3D map and needs JavaScript to run.</p>
    </noscript>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: Add the development script and the npm entry**

`viewer/scripts/make_overlay_synth.mjs` (writes a synthetic overlay with clearly fake hotspots into the gitignored `city-synth` folder; the synthetic hotspots are named "Synthetic test hotspot" and point to example.org):

```javascript
// Synthetic overlay for exercising the viewer's streets / labels / hotspots (no real data).
// Reads public/assets/city-synth/{meta.json, heightmap.u16} (run make:city-synth first),
// writes public/assets/city-synth/overlay.json and sets meta.overlay_file (idempotent).
// Everything here is fake: never copy these hotspots into a real dataset.
// Usage: node scripts/make_overlay_synth.mjs   then open  /?data=city-synth
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "city-synth");
const metaPath = join(dir, "meta.json");
const meta = JSON.parse(readFileSync(metaPath, "utf8"));
const buf = readFileSync(join(dir, meta.heights_file));
const { width: W, height: H, cell_m: CELL, min_m: MIN, max_m: MAX, water_level_m: WATER } = meta;
if (buf.length !== W * H * 2) throw new Error(`unexpected heightmap size ${buf.length}`);

const heightAtCell = (col, row) => {
  const c = Math.min(W - 1, Math.max(0, Math.round(col)));
  const r = Math.min(H - 1, Math.max(0, Math.round(row)));
  return MIN + (buf.readUInt16LE((r * W + c) * 2) / 65535) * (MAX - MIN);
};
// World metres (+x east, +z south, origin at the grid centre) <-> cells.
const heightAt = (x, z) => heightAtCell(x / CELL + (W - 1) / 2, z / CELL + (H - 1) / 2);
const isLand = (x, z) => heightAt(x, z) > WATER + 2;

const halfW = ((W - 1) * CELL) / 2;
const halfH = ((H - 1) * CELL) / 2;
const SPACING = 500; // metres between grid streets
const STEP = 50; // sampling along each street
const round1 = (n) => Math.round(n * 10) / 10;

const kindFor = (i) => (i % 6 === 0 ? "primary" : i % 2 === 0 ? "secondary" : "local");

// Walk a straight street, keep only the stretches on land (each stretch is one line).
function landRuns(points) {
  const lines = [];
  let run = [];
  for (const [x, z] of points) {
    if (isLand(x, z)) run.push(round1(x), round1(z));
    else {
      if (run.length >= 4) lines.push(run);
      run = [];
    }
  }
  if (run.length >= 4) lines.push(run);
  return lines;
}

const streets = [];
let n = 0;
for (let i = 0, x = -Math.floor(halfW / SPACING) * SPACING; x <= halfW; x += SPACING, i++) {
  const pts = [];
  for (let z = -halfH; z <= halfH; z += STEP) pts.push([x, z]);
  const lines = landRuns(pts);
  if (lines.length) streets.push({ name: `Test Street ${++n}`, kind: kindFor(i), lines });
}
for (let i = 0, z = -Math.floor(halfH / SPACING) * SPACING; z <= halfH; z += SPACING, i++) {
  const pts = [];
  for (let x = -halfW; x <= halfW; x += STEP) pts.push([x, z]);
  const lines = landRuns(pts);
  if (lines.length) streets.push({ name: `Test Street ${++n}`, kind: kindFor(i), lines });
}

// Spread landmarks / hotspots over land: scan a coarse lattice outward from the centre and
// take well-separated land points, highest ground first for the "hill" ones.
const candidates = [];
for (let z = -halfH + 400; z < halfH - 400; z += 200) {
  for (let x = -halfW + 400; x < halfW - 400; x += 200) {
    if (isLand(x, z)) candidates.push({ x, z, h: heightAt(x, z), d: Math.hypot(x, z) });
  }
}
candidates.sort((a, b) => a.d - b.d);
const chosen = [];
for (const c of candidates) {
  if (chosen.every((p) => Math.hypot(p.x - c.x, p.z - c.z) > 1500)) chosen.push(c);
  if (chosen.length === 9) break;
}
if (chosen.length < 9) throw new Error(`only found ${chosen.length} separated land points`);

// Rough lon/lat: 111.32 km per degree of latitude, centre at 37.77 N, 122.45 W.
const lonlat = (x, z) => ({
  lon: round1((-122.45 + x / (111320 * Math.cos((37.77 * Math.PI) / 180))) * 1e5) / 1e5,
  lat: round1((37.77 - z / 111320) * 1e5) / 1e5,
});

const landmarkDefs = [
  ["synthetic-park", "Test Park", "park"],
  ["synthetic-bridge", "Test Bridge", "bridge"],
  ["synthetic-hill", "Test Hill", "hill"],
  ["synthetic-hall", "Test Hall", "building"],
  ["synthetic-district", "Test District", "neighborhood"],
  ["synthetic-fort", "Test Fort", "fort"],
];
const landmarks = landmarkDefs.map(([id, name, kind], i) => ({
  id,
  name,
  kind,
  x: round1(chosen[i].x),
  z: round1(chosen[i].z),
  ...lonlat(chosen[i].x, chosen[i].z),
}));

const hotspotDefs = [
  ["synthetic-hotspot-a", "Synthetic test hotspot A", "creek"],
  ["synthetic-hotspot-b", "Synthetic test hotspot B", "lagoon"],
  ["synthetic-hotspot-c", "Synthetic test hotspot C", "dune"],
];
const hotspots = hotspotDefs.map(([id, name, kind], i) => {
  const c = chosen[6 + i];
  return {
    id,
    name,
    kind,
    x: round1(c.x),
    z: round1(c.z),
    ...lonlat(c.x, c.z),
    description: `${name} exists only to test the viewer. It does not describe any real place or event.`,
    sources: [{ title: "Synthetic test source", url: "https://example.org/synthetic" }],
    confidence: "illustrative",
  };
});

writeFileSync(join(dir, "overlay.json"), JSON.stringify({ version: 1, streets, landmarks, hotspots }));
if (meta.overlay_file !== "overlay.json") {
  meta.overlay_file = "overlay.json";
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
}
const pts = streets.reduce((s, st) => s + st.lines.reduce((a, l) => a + l.length / 2, 0), 0);
console.log(
  `overlay.json: ${streets.length} streets (${pts} points), ${landmarks.length} landmarks, ${hotspots.length} hotspots`,
);
```

In `viewer/package.json`, add one line to `"scripts"` (mind the commas):

```json
    "make:overlay-synth": "node scripts/make_overlay_synth.mjs"
```

- [ ] **Step 5: Generate the synthetic development data**

```bash
cd viewer && npm run make:city-synth && npm run make:overlay-synth
```
Expected: `make:city-synth` prints the height range and the classes used; `make:overlay-synth` prints that it wrote `overlay.json` and set `overlay_file`. The output is in the gitignored `viewer/public/assets/city-synth/`. This also lets the one test that parses the generated overlay run instead of skipping.

- [ ] **Step 6: Typecheck, test, build**

Run: `cd viewer && npx tsc --noEmit && npm test && npm run build`
Expected: `tsc` clean; **479 passed** across 36 files, none skipped (`uiColors.test.ts` adds 36, and the synthetic-overlay test now runs); the build succeeds (the Three.js chunk-size warning is expected).

- [ ] **Step 7: Check the app loads**

```bash
cd viewer && npx vite --port 5199 --strictPort
```
Open <http://localhost:5199/?data=city-synth&debug>. Expected: a map with a top bar (search, Places, Legend, Sources, About, layer toggles, buttons), the About dialog on a first visit, no console errors. (The full checks are Task 12.) Stop the server when done.

- [ ] **Step 8: Commit**

```bash
git add viewer/src/appContext.ts viewer/src/modules.ts viewer/src/infoModule.ts viewer/src/overlayModule.ts viewer/src/effectsModule.ts viewer/src/nodeTestShims.d.ts viewer/src/uiColors.test.ts viewer/src/controls.ts viewer/src/main.ts viewer/index.html viewer/package.json viewer/scripts/make_overlay_synth.mjs
git commit -m "feat(viewer): wire the experience together (rig, shell, overlay, search, effects)"
```

---

### Task 12: Check it in a real browser, measure, and decide

Everything above is verified in Node except what only a browser can show. This task is the checklist. Do it with the real city (`?data=real-city`) and the synthetic one.

**Files:**
- Create: `docs/research/phone-measurement.md`, `docs/research/phase-3-results.md`

- [ ] **Step 1: Start the viewer and open the real city**

```bash
cd viewer && npx vite --port 5199 --strictPort
```
Open <http://localhost:5199/?data=real-city&debug>. (Clear the About flag to see the first-visit behaviour: in the console, `localStorage.removeItem('yelamu-about-seen')`, then reload.)

- [ ] **Step 2: Walk the checklist**

Tick each one; record anything that is wrong in `phase-3-results.md`.

1. **About on a first visit.** The dialog opens, focus lands on "Explore the map", Esc closes it, and the About button reopens it. The Ramaytush Ohlone paragraph reads the way you want (this is the owner-review text).
2. **Streets.** Turn Streets on. Lines follow the hills without sinking under them at any zoom (zoom in and out through the LOD switch). Primary streets show always, secondary from zoom 2.5, local from zoom 5. They stay readable over both dark woodland and pale dunes.
3. **Labels and markers.** Landmark labels declutter without flicker while panning and rotating. Hotspot markers are easy to tap (about 44 px hit area on touch).
4. **Search.** `/` focuses the box. Typing "mission" lists the Mission Bay hotspot first, then Mission Dolores, then Mission St and other streets. Arrow keys, Enter and Esc work; clicking a result works. Selecting a hotspot flies there and opens its panel with a Documented badge and a working source link; the URL gains `p=...`.
5. **Panels.** Legend, Sources, Places and the hotspot panel each open on their own; opening one closes the other (never two stacked); Esc closes. The Sources panel's "Processing" list shows values like "30 m", "150 m" without wrapping.
6. **Share links.** Copy link shows "Link copied"; reloading a URL with `#x=...&z=...&k=...&r=...&l=...&p=...` restores the view and panel. `#l=` turns every optional layer off.
7. **Camera.** Q and E rotate in smooth quarter turns (instant under `prefers-reduced-motion`); H resets; arrows pan (Shift = 3x); `+` and `-` zoom; the map cannot be panned far off the data. "Surprise me" goes to a hotspot about 60% of the time, otherwise a random hilltop or shore.
8. **Vegetation.** At full-resolution zoom the woodland patches have trees and the dunes sparse scrub; the shapes look like plants of the right kind, not like a pattern of dots. Toggling Vegetation off and on works, including on chunks built while it was off.
9. **Water.** The shader compiles with no console errors; ripples and glint are subtle; Water motion off looks like the old static plane. Under reduced motion the toggle is disabled with an explanation.
10. **Quality controller.** Throttle the CPU (devtools Performance, 6x slowdown): within a few seconds the debug overlay's quality level drops and "Reduced effects to keep the map smooth" appears; re-enabling a toggle restores full quality.
11. **Datasets without extras.** `?data=slice` (no habitat raster, no overlay) loads with Legend, Sources, About and a Water motion toggle, and no errors.
12. **Narrow screens (375 px wide, use the Browser pane's Mobile preset).** The bar is compact (title, search, Menu); the Menu holds the actions and toggles; touch targets (search, buttons, toggles) are at least 44 px; no horizontal scroll; panels become bottom sheets.
13. **Keyboard and screen reader.** The skip link is the first Tab stop and moves to search; every control has a visible focus ring; Places lists every hotspot and landmark as buttons; "Selected: NAME" and "Streets on" are announced.

- [ ] **Step 3: Measure the frame time (and know the pane's quirk)**

Use the benchmark in `docs/research/perf-bench.js`, or count real renders through the page's own hook, which `?debug` exposes as `window.__yelamu.onFrame`. The Browser pane throttles itself to roughly one frame per second after a fraction of a second of script-driven activity, so measure in **short windows (about 1.2 s) right after a user action** such as a screenshot, one configuration at a time: all optional layers off, then streets and labels, then plus vegetation, then plus water motion. The prototype's median frame times were 8.9, 8.5, 8.2 and 10.8 ms. Record yours. Judge by the median gap, not by long scripted runs.

- [ ] **Step 4: Measure on a phone**

Follow `docs/research/phone-measurement.md` (created in the next step). Phones were not measured in the prototype. Record the numbers; tune `MAX_COARSE_SPACING_PX` (`main.ts`), `maxInstancesPerChunk` (`vegetation/layer.ts`), the vegetation default on coarse pointers (`effectsModule.ts`) and the quality thresholds (`quality.ts`) from them.

- [ ] **Step 5: Create `docs/research/phone-measurement.md`**

```markdown
# Measuring the viewer on a real phone

Goal: find out whether the map is smooth enough on a mid-range phone, and which knob to
turn if it is not. Desktop numbers say little about a phone GPU, so measure on the device.

Smooth enough means: **at least 30 fps and a 95th-percentile frame gap under 50 ms** while
panning at full-resolution terrain (LOD 0) with vegetation on.

## 1. Serve the viewer to the phone

1. On the computer, from the `viewer/` folder: `npx vite --host`
2. Vite prints a `Network:` URL such as `http://192.168.1.20:5173/`. The phone and the
   computer must be on the same Wi-Fi network (no guest or client-isolated network).
3. On the phone open that URL with the debug overlay and the real data:
   `http://192.168.1.20:5173/?debug&data=real-city`
   (`?data=city-synth` is the synthetic whole-city grid, useful as a worst case: it has far
   more woodland and scrub than the real slice).
4. To switch the effects on without tapping, append a layer list to the address, for example
   `#l=vegetation,water-motion,landmarks,hotspots`. On a phone (coarse pointer) vegetation
   starts OFF; the "Vegetation" checkbox in the Menu turns it on.

Before each run: charge above 50 %, turn off Low Power Mode / Battery Saver (they cap the
frame rate and would hide real performance), set screen brightness to a fixed value, close
other apps, and let the phone cool down for a few minutes between runs.

## 2. Attach desktop developer tools to the phone

- **iPhone / iPad (Safari):** phone: Settings > Safari > Advanced > turn on Web Inspector.
  Connect by cable, tap "Trust". Mac: Safari > Settings > Advanced > "Show features for web
  developers", then Develop menu > (your phone) > the page. Use the Console tab.
- **Android (Chrome):** phone: enable Developer options and USB debugging. Connect by cable.
  Computer Chrome: open `chrome://inspect#devices`, wait for the page to be listed and press
  "inspect". Use the Console tab.

## 3. Run the benchmark snippet

The snippet is `docs/research/perf-bench.js` in the main repository. It defines
`window.__bench(label, seconds, dxPerMove)`, which pans the map back and forth through the
page's own pointer handlers and reports the cost of each render callback and the gap
between frames. Rendering is on demand, so the page only draws while input arrives, which is
exactly the interactive case.

1. Open `perf-bench.js` on the computer, select all, copy.
2. Paste it into the phone's Console (through the attached devtools) and press Enter once.
   It prints nothing; it only defines `window.__bench`.
3. Put the map in the situation to measure (below), then run
   `JSON.stringify(await window.__bench("zoomed in, panning", 4, 12))` and copy the result.

Scenarios (repeat each one three times and keep the median run):

| id | view | settings |
|----|------|----------|
| A | zoomed out, whole city (debug overlay says `LOD 1`) | vegetation on, water motion on |
| B | zoomed in past the switch zoom (`LOD 0`), woodland or scrub area | vegetation off, water motion off |
| C | same view as B | vegetation on, water motion off |
| D | same view as B | vegetation on, water motion on |
| E | same view as B, left alone for 30 s | vegetation on, water motion on (idle cost; see 5) |

Notes:
- The idle water animation also renders while you are not touching the map. For scenarios
  A-D switch "Water motion" off when you only want the interaction cost; the quality
  controller never sees these idle frames.
- The quality controller may lower the effects during a run (the toast says "Reduced effects
  to keep the map smooth", and the overlay's `quality level` drops from 2). Note the level at
  the START and the END of each run. A run that degraded is a failing run for that setting.

## 4. What to record

From the benchmark result: `effectiveFps`, `cbMs.p95` (render callback time) and
`frameGapMs.p95`. From the `?debug` overlay at the end of the run: `triangles`, `draw calls`,
`LOD`, `quality level` (with its p90 gap), and the vegetation instance count. Also write
down battery percentage before and after, and whether the phone felt warm or hot (thermal
throttling shows up as numbers getting worse from run to run).

| Result | ok if |
|--------|-------|
| `effectiveFps` | at least 30 |
| `frameGapMs.p95` | under 50 ms |
| `quality level` at the end | still 2 (nothing was switched off) |
| battery | not more than about 1 % per minute of continuous panning |

## 5. Idle cost of the animated water

With scenario E on screen and the phone untouched, the animation redraws about 15 times a
second (`IDLE_WATER_FPS`). Note the battery drop over 5 minutes against the same view with
"Water motion" off. If the difference is large, lower `IDLE_WATER_FPS` or make water motion
default to off on coarse pointers.

## 6. What to tune when a number is not ok

| Symptom | Knob | Where | Default |
|---------|------|-------|---------|
| LOD 0 itself is too slow (scenario B) | `MAX_COARSE_SPACING_PX`: larger switches to full resolution later (more zoom) | `src/main.ts` | 6 |
| Vegetation costs too much (C vs B) | `maxInstancesPerChunk`: fewer plants per chunk | `src/vegetation/layer.ts` (`DEFAULT_MAX_INSTANCES_PER_CHUNK`) | 1500 |
| Vegetation should not start on for phones | `defaultVegetationOn(coarsePointer)` | `src/effects.ts` | off on coarse pointers |
| Plants too big or too small | `sizeBoost` | `VegetationLayerOptions` / `DEFAULT_SIZE_BOOST` | 1.5 |
| Water motion costs too much | `IDLE_WATER_FPS`; `WAVE_SLOPE`, `GLINT_*` | `src/effectsModule.ts`, `src/water/waterMaterial.ts` | 15 fps |
| The controller degrades too eagerly or too late | `degradeAboveMs`, `upgradeBelowMs`, `degradeAfterMs`, `upgradeAfterMs`, `minDwellMs`, `windowSize` | `src/quality.ts` (`QualityOptions`) | 25 ms, 14 ms, 1.5 s, 8 s, 5 s, 60 |
| Several plant chunks built per frame hitch | `maxBuildsPerUpdate` (terrain) and `maxBuildsPerRefresh` (vegetation) | `src/terrainChunks.ts`, `src/vegetation/layer.ts` | 6, 3 |

Change one knob at a time and rerun the scenario that failed.

## 7. Results

Device: ______________________  OS / browser: ______________________  Date: ____________

Dataset: `real-city` / `city-synth` (circle one). Battery before: ____ %. Low Power Mode: off.

| Scenario | settings | effectiveFps | cbMs p95 | frameGapMs p95 | triangles | draw calls | quality level (start / end) | vegetation instances | battery after | thermal | verdict |
|----------|----------|--------------|----------|----------------|-----------|------------|------------------------------|----------------------|---------------|---------|---------|
| A | zoomed out, veg on, water on | | | | | | | | | | |
| B | LOD 0, veg off, water off | | | | | | | | | | |
| C | LOD 0, veg on, water off | | | | | | | | | | |
| D | LOD 0, veg on, water on | | | | | | | | | | |
| E | idle 30 s, veg on, water on | n/a | n/a | n/a | | | | | | | |

Decision: ____________________________________________________________________
```

- [ ] **Step 6: Write `docs/research/phase-3-results.md` and commit**

Record, in this order: (1) the commands to reproduce (Task 2 Step 2, Task 12 Step 1); (2) the prototype numbers from this plan beside what you measured; (3) the checklist outcome, listing anything that failed and how it was fixed; (4) the owner review of the About text and hotspots (approved, or edits made); (5) the **Decision**: *Go to the next phase* (Phase 3b data authenticity, then launch), *Go with changes* (say what), or *Stop*. Note that screenshots stay in `docs/research/local/` (gitignored).

```bash
git add docs/research/phone-measurement.md docs/research/phase-3-results.md
git commit -m "docs: Phase 3 checklist results, phone measurement protocol, and decision"
```

---

## Addendum: Known limits and what comes next

**Phones and touch.** Not measured. Vegetation starts off on coarse-pointer devices until you have numbers. The hotspot chips are 22 px tall with a padded hit area that the prototype could not measure from script.

**Labels are not occlusion-tested.** A label on the far side of a hill still shows. Search and Places are the reliable routes to every place.

**Hotspot markers hidden by declutter are not tab-focusable.** Search and Places are the keyboard route to them.

**TIGER positions are approximate** (about 10 m) and the street names are modern. The overlay is labelled "modern, approximate" in the Sources panel.

**Landmark coordinates are approximate** (about 100 m) and several stand on later fill, so their labels sit in the water of the 1769 map. That is the point of the overlay, but it can surprise people.

**Unverified in the prototype:** screen-reader output (only the markup and live regions were checked), the water shader on other GPUs (it compiled and ran on the prototype's), and hash behaviour on very old browsers.

**Phase 3b (data authenticity, a separate plan):** hand-draw the south-east and Treasure Island into `pipeline/data/full-city/hand/`, sculpt lost landforms, carve freshwater ponds, decide the 'Tidal coastal lagoon', and use SFEI's mapping of the south when it is published.

**Later:** the constrained camera is done here; still ahead are hosting and launch, the SFEI license reply, and, only with the community's involvement, any cultural layer.

---

## Self-Review

| Spec requirement (Phase 3 design) | Task |
|---|---|
| 3A app state in the URL hash, share links | Task 3 (`appState`, `hashSync`, `layerSelection`, `placeSelection`) |
| 3A camera rig: rotation, clamp, fly-to, reduced motion | Task 4 |
| 3A keyboard | Tasks 3, 11 (`keys.ts`, `controls.ts`) |
| 3A UI shell, phone layout | Task 10 (`shell.ts`, `ui.css`) |
| 3B overlay data build script | Tasks 1, 2 |
| 3B streets draped, landmark labels | Task 6 |
| 3B local search | Tasks 5, 10, 11 |
| 3C hotspots with sources, validated in Python and TypeScript | Tasks 1, 6, 10 |
| 3C legend, provenance panel, About | Tasks 7, 10, 11 |
| 3D vegetation, illustrative, capped | Task 9 |
| 3D animated water, reduced motion | Task 8 |
| 3E quality controller | Task 8, wired in Task 11 |
| 3E phone measurement protocol | Task 12 |
| 3E accessibility (keyboard, ARIA, contrast, reduced motion) | Tasks 8, 10, 11, 12 |
| Privacy: no third-party requests | no new network code; Task 12 Step 2 (console and network clean) |
| Testing: pure logic unit-tested | Tasks 1, 3 to 9 (pipeline 268, viewer 479) |

**Placeholder scan:** none in code. Task 12's results note is a document you write from your own measurements.

**Type and name consistency:** the overlay contract (`version`, `streets`, `landmarks`, `hotspots`, `processing`) is written by `overlay.py` (Task 1) and parsed by `overlay/parse.ts` (Task 6); world coordinates use one formula in both and the Python tests pin it to the terrain mesh's cell-centre formula; layer ids (`streets`, `landmarks`, `hotspots`, `vegetation`, `water-motion`) match `^[a-z0-9-]+$` in `appState.ts`; `AppContext` (Task 11) is the only place the modules meet.
