import json

import numpy as np
import pytest
from shapely.geometry import MultiPolygon, Polygon, box

from yelamu.geo import Grid
from yelamu.habitat import ID_HAND_POND
from yelamu.overlay import world_xz
from yelamu.ponds import (
    DEFAULT_POND_CLASSES,
    Pond,
    PondSpec,
    build_ponds,
    carve_ponds,
    hand_pond_specs,
    pond_layer,
    pond_mask,
    pond_provenance_rows,
    ponds_document,
    sfei_pond_specs,
    slugify,
    stamp_ponds_on_habitat,
)
from yelamu.sources import Feature

# 40 x 40 cells of 10 m: x 500000..500400, y 4180000..4180400 (row 0 = north).
GRID = Grid(west=500000, south=4180000, east=500400, north=4180400, cell=10)


def flat(value=5.0):
    return np.full((GRID.height, GRID.width), value, dtype="float32")


def spec(geom, *, origin="hand", name=None, class_name=None, level=None, id_hint=None,
         source="a sheet", confidence="inferred"):
    return PondSpec(geometry=geom, origin=origin, source=source, confidence=confidence,
                    class_name=class_name, name=name, id_hint=id_hint, level_m=level)


def square(x0, y0, size):  # metres relative to the grid's SW corner
    return box(500000 + x0, 4180000 + y0, 500000 + x0 + size, 4180000 + y0 + size)


def test_slugify():
    assert slugify("Lake Merced (north)") == "lake-merced-north"
    assert slugify("Dune-dammed pond or lake") == "dune-dammed-pond-or-lake"
    assert slugify("  --  ") == "pond"
    assert slugify("Café") == "caf"


def test_default_pond_classes_exclude_the_tidal_lagoon():
    assert "Tidal coastal lagoon" not in DEFAULT_POND_CLASSES
    assert set(DEFAULT_POND_CLASSES) == {
        "Dune-dammed pond or lake", "Dune-dammed headwater lake",
        "Barrier beach-impounded freshwater lagoon", "Other pond or lake"}


# ------------------------------------------------------------------ specs


def _ll_square(lon0, lat0, lon1, lat1):
    return {"type": "Polygon", "coordinates": [[[lon0, lat0], [lon1, lat0], [lon1, lat1],
                                                [lon0, lat1], [lon0, lat0]]]}


def test_sfei_pond_specs_select_classes_and_explode_multipolygons():
    multi = {"type": "MultiPolygon", "coordinates": [
        _ll_square(-122.50, 37.70, -122.49, 37.71)["coordinates"],
        _ll_square(-122.48, 37.70, -122.47, 37.71)["coordinates"]]}
    coll = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"HabitatCla": "Dune-dammed pond or lake"},
         "geometry": multi},
        {"type": "Feature", "properties": {"HabitatCla": "Beach"},
         "geometry": _ll_square(-122.5, 37.7, -122.4, 37.8)},
        {"type": "Feature", "properties": {"HabitatCla": "Tidal coastal lagoon"},
         "geometry": _ll_square(-122.5, 37.7, -122.4, 37.8)},
        {"type": "Feature", "properties": {"HabitatCla": " Other pond or lake "},
         "geometry": _ll_square(-122.46, 37.70, -122.45, 37.71)},
        {"type": "Feature", "properties": {"HabitatCla": "Other pond or lake"}, "geometry": None},
        {"type": "Feature", "properties": {}, "geometry": _ll_square(-122.5, 37.7, -122.4, 37.8)},
    ]}
    specs = sfei_pond_specs(coll, DEFAULT_POND_CLASSES)
    assert [s.class_name for s in specs] == ["Dune-dammed pond or lake"] * 2 + ["Other pond or lake"]
    for s in specs:
        assert s.origin == "sfei" and s.confidence == "documented" and s.level_m is None
        assert s.source == f"SFEI Hidden Nature SF habitat class '{s.class_name}'"
        assert s.geometry.geom_type == "Polygon" and s.geometry.is_valid
        assert s.geometry.bounds[0] > 500000  # UTM metres, not degrees
    assert sfei_pond_specs(coll, []) == []
    assert len(sfei_pond_specs(coll, ["Beach"])) == 1


def _feature(geom, **props):
    return Feature(geometry=geom, source=props.get("source", "sheet"),
                   confidence=props.get("confidence", "inferred"), properties=props, index=0)


def test_hand_pond_specs_read_level_name_and_id():
    f = _feature(square(0, 0, 100), level_m=7.5, name="Pond A", id="My Pond!", source="S",
                 confidence="documented")
    (s,) = hand_pond_specs([f], path="x.geojson")
    assert (s.level_m, s.name, s.id_hint, s.source, s.confidence, s.origin) == (
        7.5, "Pond A", "My Pond!", "S", "documented", "hand")
    multi = _feature(MultiPolygon([square(0, 0, 50), square(100, 0, 50)]))
    assert len(hand_pond_specs([multi], path="x")) == 2


@pytest.mark.parametrize("bad", ["high", float("nan"), True, None])
def test_hand_pond_bad_level_is_an_error_naming_the_file(bad):
    f = _feature(square(0, 0, 100), level_m=bad)
    if bad is None:  # absent / null means "use the DEM median"
        assert hand_pond_specs([f], path="p.geojson")[0].level_m is None
        return
    with pytest.raises(ValueError, match="p.geojson"):
        hand_pond_specs([f], path="p.geojson")


# ----------------------------------------------------------- levels, ids, drops


def test_level_is_the_median_of_the_raw_dem_ignoring_nan():
    dem = flat(5.0)
    dem[10:20, 10:20] = 9.0
    dem[10, 10:20] = np.nan  # voids are ignored
    (p,) = build_ponds([spec(square(100, 200, 100))], dem, GRID, log=lambda m: None)
    # square(100,200,100) covers cols 10..19, rows 40-20-10=10..19 (north-up) -> all 9.0
    assert p.level_m == 9.0
    assert p.mask.sum() == 100


def test_explicit_level_wins_and_is_rounded_to_a_centimetre():
    (p,) = build_ponds([spec(square(100, 100, 100), level=6.2345)], flat(), GRID,
                       log=lambda m: None)
    assert p.level_m == 6.23


def test_median_not_mean():
    dem = flat(3.0)
    dem[10:20, 10:12] = 50.0  # 20 high cells of 100
    (p,) = build_ponds([spec(square(100, 200, 100))], dem, GRID, log=lambda m: None)
    assert p.level_m == 3.0


def test_tiny_polygons_are_dropped_with_a_note():
    notes = []
    ponds = build_ponds(
        [spec(square(100, 100, 100), name="Big"),
         spec(square(300, 300, 8), name="Tiny")],  # 8 m square: 1 cell centre
        flat(), GRID, log=notes.append)
    assert [p.name for p in ponds] == ["Big"]
    assert len(notes) == 1 and "Tiny" in notes[0] and "4" in notes[0]
    # exactly 4 cells is kept
    ponds = build_ponds([spec(square(100, 100, 20))], flat(), GRID, log=lambda m: None)
    assert len(ponds) == 1 and ponds[0].mask.sum() == 4


def test_no_elevation_and_no_level_is_a_clear_error_for_hand_ponds_but_drops_sfei():
    dem = np.full((GRID.height, GRID.width), np.nan, dtype="float32")
    with pytest.raises(ValueError, match="level_m"):
        build_ponds([spec(square(100, 100, 100), name="Hand")], dem, GRID, log=lambda m: None)
    notes = []
    out = build_ponds([spec(square(100, 100, 100), origin="sfei", class_name="Other pond or lake",
                            confidence="documented")], dem, GRID, log=notes.append)
    assert out == [] and "level_m" in notes[0] or "elevation" in notes[0]


def test_ids_are_unique_deterministic_and_independent_of_input_order():
    specs = [
        spec(square(300, 100, 60), origin="sfei", class_name="Dune-dammed pond or lake"),
        spec(square(100, 100, 60), origin="sfei", class_name="Dune-dammed pond or lake"),
        spec(square(100, 300, 60), name="Lake Merced (north)"),
        spec(square(250, 300, 60), name="Lake Merced (north)"),  # duplicate name
        spec(square(100, 200, 60), id_hint="My Pond"),
        spec(square(250, 200, 60)),  # hand, no name: from provenance? -> generic id
    ]
    a = build_ponds(specs, flat(), GRID, log=lambda m: None)
    b = build_ponds(specs[::-1], flat(), GRID, log=lambda m: None)
    ids = [p.id for p in a]
    assert ids == sorted(ids) and len(set(ids)) == len(ids)
    assert ids == [p.id for p in b]
    assert "dune-dammed-pond-or-lake-1" in ids and "dune-dammed-pond-or-lake-2" in ids
    # west-to-east numbering of the class
    by_id = {p.id: p for p in a}
    assert by_id["dune-dammed-pond-or-lake-1"].geometry.bounds[0] < \
        by_id["dune-dammed-pond-or-lake-2"].geometry.bounds[0]
    assert "my-pond" in ids
    assert "lake-merced-north-1" in ids and "lake-merced-north-2" in ids
    assert "pond-1" in ids  # nameless hand pond
    # a unique name needs no suffix
    solo = build_ponds([spec(square(100, 100, 60), name="Mountain Lake")], flat(), GRID,
                       log=lambda m: None)
    assert solo[0].id == "mountain-lake"


def test_overlapping_ponds_own_disjoint_cells_hand_beats_sfei():
    sfei = spec(square(100, 100, 100), origin="sfei", class_name="Other pond or lake")
    hand = spec(square(150, 100, 100), name="Hand")
    ponds = {p.name or p.class_name: p for p in build_ponds([sfei, hand], flat(), GRID,
                                                            log=lambda m: None)}
    a, b = ponds["Other pond or lake"].mask, ponds["Hand"].mask
    assert not (a & b).any()
    assert b.sum() == 100 and a.sum() == 50


# ----------------------------------------------------------------- carving


def _one_pond(size=200, level=5.0, dem=None, **kw):
    dem = flat(8.0) if dem is None else dem
    (p,) = build_ponds([spec(square(100, 100, size), level=level)], dem, GRID, log=lambda m: None)
    return dem, p


def test_carving_profile_is_deepest_inside_and_zero_depth_at_the_shore():
    dem, p = _one_pond()
    out = carve_ponds(dem, [p], cell_m=10, max_depth_m=2.0, shelf_m=20.0)
    m = p.mask
    depth = np.where(m, 5.0 - out, 0.0)
    assert out.dtype == np.float32
    # Outside: untouched
    assert (out[~m] == dem[~m]).all()
    # Never above the water level; bounded by max depth
    assert depth[m].min() > 0 and depth[m].max() <= 2.0 + 1e-6
    # Centre is at full depth (more than shelf_m from every shore)
    r, c = np.argwhere(m).mean(axis=0).astype(int)
    assert depth[r, c] == pytest.approx(2.0, abs=1e-5)
    # Edge cell is the shallowest: half a cell (5 m) from the true shoreline
    padded = np.pad(m, 1)
    touches_land = ~(padded[:-2, 1:-1] & padded[2:, 1:-1] & padded[1:-1, :-2] & padded[1:-1, 2:])
    edge = m & touches_land
    t = 5.0 / 20.0
    expected_edge = 2.0 * t * t * (3 - 2 * t)
    assert depth[edge].max() == pytest.approx(expected_edge, abs=1e-5)
    # Monotonic ramp inwards along the middle row
    row = depth[r, m[r]]
    half = row[: len(row) // 2]
    assert (np.diff(half) >= -1e-9).all()


def test_flat_when_shelf_is_zero_and_pond_at_grid_edge_has_no_fake_shore():
    dem, p = _one_pond()
    out = carve_ponds(dem, [p], 10, 2.0, 0.0)
    assert np.allclose(out[p.mask], 3.0)
    # A pond running off the grid edge: the grid border is not a shore.
    (q,) = build_ponds([spec(box(500000 - 100, 4180000 + 100, 500000 + 100, 4180000 + 300),
                             level=5.0)], flat(8.0), GRID, log=lambda m: None)
    out = carve_ponds(flat(8.0), [q], 10, 2.0, 20.0)
    assert out[20, 0] == pytest.approx(3.0, abs=1e-5)  # on the border column, in the middle


def test_whole_grid_pond_is_full_depth():
    (p,) = build_ponds([spec(box(499000, 4179000, 501000, 4181000), level=5.0)], flat(), GRID,
                       log=lambda m: None)
    out = carve_ponds(flat(), [p], 10, 2.0, 20.0)
    assert np.allclose(out, 3.0)


def test_pond_mask_union():
    _, p = _one_pond()
    assert pond_mask([p], (GRID.height, GRID.width)).sum() == p.mask.sum()
    assert not pond_mask([], (GRID.height, GRID.width)).any()


# ----------------------------------------------------------------- JSON


def test_ponds_document_structure_world_coordinates_and_ordering():
    # A pond centred on the grid centre: world coordinates must straddle (0, 0).
    cx, cy = 500200, 4180200
    hole = Polygon([(cx - 20, cy - 20), (cx + 20, cy - 20), (cx + 20, cy + 20), (cx - 20, cy + 20)])
    big = box(cx - 100, cy - 100, cx + 100, cy + 100).difference(hole)
    (p2,) = build_ponds([spec(square(20, 20, 60), name="B pond", source="S2", confidence="illustrative",
                              level=7.04)], flat(), GRID, log=lambda m: None)
    (p1,) = build_ponds([spec(big, name="A pond", level=5.6)], flat(), GRID, log=lambda m: None)
    doc = ponds_document([p2, p1], GRID, {"max_depth_m": 2.0})
    assert doc["version"] == 1 and doc["processing"] == {"max_depth_m": 2.0}
    assert [q["id"] for q in doc["ponds"]] == ["a-pond", "b-pond"]  # sorted by id
    a = doc["ponds"][0]
    assert set(a) == {"id", "name", "level_m", "source", "confidence", "rings"}
    assert a["name"] == "A pond" and a["level_m"] == 5.6
    assert (a["source"], a["confidence"]) == ("a sheet", "inferred")
    assert len(a["rings"]) == 2  # outer + hole
    outer, inner = a["rings"]
    xs, zs = outer[0::2], outer[1::2]
    assert len(outer) % 2 == 0 and min(xs) == -100.0 and max(xs) == 100.0
    assert min(zs) == -100.0 and max(zs) == 100.0
    assert max(abs(v) for v in inner) == 20.0
    # Rings are open (first point not repeated), values rounded to 0.1.
    assert (outer[0], outer[1]) != (outer[-2], outer[-1])
    assert all(round(v, 1) == v for v in outer + inner)
    # Round trip: the cell-centre of the grid maps near (0, 0) in world metres
    x, z = world_xz(GRID, cx, cy)
    assert (x, z) == (0.0, 0.0)
    # z points south: a northern vertex has NEGATIVE z.
    assert min(zs) == -100.0
    json.dumps(doc)  # serialisable
    b = doc["ponds"][1]
    assert b["confidence"] == "illustrative" and b["level_m"] == 7.04 and b["source"] == "S2"


def test_ponds_document_is_deterministic_and_null_name():
    ponds = build_ponds([spec(square(100, 100, 60), origin="sfei", class_name="Other pond or lake")],
                        flat(), GRID, log=lambda m: None)
    a = json.dumps(ponds_document(ponds, GRID, {}), sort_keys=True)
    b = json.dumps(ponds_document(list(reversed(ponds)), GRID, {}), sort_keys=True)
    assert a == b
    assert ponds_document(ponds, GRID, {})["ponds"][0]["name"] is None


# --------------------------------------------------------- provenance, habitat


def test_provenance_rows_and_layer():
    ponds = build_ponds([
        spec(square(100, 100, 60), origin="sfei", class_name="Other pond or lake",
             source="SFEI Hidden Nature SF habitat class 'Other pond or lake'",
             confidence="documented"),
        spec(square(250, 100, 60), name="H1", source="Sheet A", confidence="inferred"),
        spec(square(250, 200, 60), name="H2", source="Sheet A", confidence="inferred"),
    ], flat(), GRID, log=lambda m: None)
    rows = pond_provenance_rows(ponds)
    assert rows == [
        {"layer": "ponds", "source": "SFEI Hidden Nature SF habitat class 'Other pond or lake'",
         "confidence": "documented", "count": 1},
        {"layer": "ponds", "source": "Sheet A", "confidence": "inferred", "count": 2},
    ]
    layer = pond_layer(ponds)
    assert layer.id == "ponds" and layer.confidence == "inferred"  # the lowest
    assert "3 freshwater ponds" in layer.source and "Sheet A" in layer.source and len(layer.source) <= 300
    assert pond_layer([]) is None


def test_stamp_ponds_on_habitat_sfei_keeps_its_class_hand_gets_the_synthetic_id():
    legend = [{"id": 0, "name": "Unmapped", "group": "unmapped"},
              {"id": 7, "name": "Other pond or lake", "group": "water"},
              {"id": 9, "name": "Beach", "group": "beach"}]
    ponds = build_ponds([
        spec(square(100, 100, 60), origin="sfei", class_name="Other pond or lake"),
        spec(square(250, 100, 60), name="Hand"),
    ], flat(), GRID, log=lambda m: None)
    habitat = np.full((GRID.height, GRID.width), 9, dtype=np.uint8)  # beach everywhere
    out = stamp_ponds_on_habitat(habitat, legend, ponds)
    assert out is not habitat and (habitat == 9).all()
    sfei = next(p for p in ponds if p.origin == "sfei")
    hand = next(p for p in ponds if p.origin == "hand")
    assert (out[sfei.mask] == 7).all() and (out[hand.mask] == ID_HAND_POND).all()
    assert (out[~(sfei.mask | hand.mask)] == 9).all()


# ------------------------------------------------------------- pond banks

from yelamu.ponds import DEFAULT_BANK_M, DEFAULT_BANK_SLOPE, blend_pond_banks  # noqa: E402

LAND_ALL = np.ones((GRID.height, GRID.width), dtype=bool)


def _pond(x0, y0, size, level):
    (p,) = build_ponds([spec(square(x0, y0, size), level=level)], flat(), GRID, log=lambda m: None)
    return p


def _carved(dem, ponds):
    return carve_ponds(dem, ponds, 10, 2.0, 20.0)


def test_defaults():
    assert DEFAULT_BANK_SLOPE == 0.35 and DEFAULT_BANK_M == 200.0


def test_a_wall_beside_a_pond_becomes_a_ramp():
    p = _pond(100, 100, 100, 5.0)  # cols 10..19, rows 20..29
    dem = _carved(flat(19.0), [p])  # 14 m of ground above the water level around it
    assert np.abs(np.diff(dem[24, 0:12])).max() > 10  # the wall exists before
    out = blend_pond_banks(dem, GRID, [p], LAND_ALL, 0.35, 200)
    # Pond cells and their bed are untouched.
    assert (out[p.mask] == dem[p.mask]).all()
    # Ramp: no step between adjacent cells (any direction) exceeds slope * cell, plus the
    # small shore-cell allowance, anywhere within 100 m of the pond.
    near = ndimage_dilate(p.mask, 10)
    for axis in (0, 1):
        step = np.abs(np.diff(out, axis=axis))
        both = np.take(near, range(1, near.shape[axis]), axis=axis) | np.take(
            near, range(0, near.shape[axis] - 1), axis=axis)
        assert step[both].max() <= 0.35 * 10 + 0.5
    # First land cell is level + slope * half a cell; the ramp then climbs 3.5 m per cell.
    assert out[24, 9] == pytest.approx(5.0 + 0.35 * 5.0, abs=1e-4)
    assert out[24, 8] == pytest.approx(5.0 + 0.35 * 15.0, abs=1e-4)
    # Far from the pond the ground is back to its original height (ramp reached 19 m).
    assert out[24, 0] == 19.0 and out[5, 5] == 19.0


def ndimage_dilate(mask, cells):
    from scipy import ndimage
    return ndimage.binary_dilation(mask, iterations=cells)


def test_a_dam_is_raised_into_an_embankment():
    p = _pond(100, 100, 100, 30.0)
    dem = _carved(flat(5.0), [p])  # a lake perched on 5 m ground
    out = blend_pond_banks(dem, GRID, [p], LAND_ALL, 0.35, 200)
    assert out[24, 9] == pytest.approx(30.0 - 0.35 * 5.0, abs=1e-4)
    assert out[24, 8] == pytest.approx(30.0 - 0.35 * 15.0, abs=1e-4)
    # ...until the embankment meets the real ground: 25 m / 0.35 = ~71 m
    assert out[24, 0] == 5.0
    assert (out[~p.mask] >= dem[~p.mask]).all()  # only ever raised here


def test_unchanged_beyond_bank_m_and_when_terrain_is_already_gentle():
    p = _pond(100, 100, 100, 5.0)
    wall = _carved(flat(100.0), [p])
    out = blend_pond_banks(wall, GRID, [p], LAND_ALL, 0.35, 50)
    from scipy import ndimage
    dist_cells = ndimage.distance_transform_edt(~p.mask)
    far = dist_cells - 0.5 > 5.0  # more than bank_m = 50 m from the shore
    assert far.any() and (out[far] == wall[far]).all()
    assert (out[(dist_cells - 0.5 <= 5.0) & ~p.mask] != wall[(dist_cells - 0.5 <= 5.0) & ~p.mask]).any()
    # Already gentler than the bank slope: nothing changes.
    gentle = _carved(flat(5.0), [p])
    assert (blend_pond_banks(gentle, GRID, [p], LAND_ALL, 0.35, 200) == gentle).all()


def test_slope_zero_disables_and_input_is_not_modified():
    p = _pond(100, 100, 100, 5.0)
    dem = _carved(flat(19.0), [p])
    before = dem.copy()
    assert (blend_pond_banks(dem, GRID, [p], LAND_ALL, 0.0, 200) == dem).all()
    assert (blend_pond_banks(dem, GRID, [], LAND_ALL, 0.35, 200) == dem).all()
    blend_pond_banks(dem, GRID, [p], LAND_ALL, 0.35, 200)
    assert (dem == before).all()


def test_non_land_cells_next_to_a_pond_are_untouched():
    p = _pond(200, 100, 100, 5.0)  # cols 20..29
    dem = _carved(flat(19.0), [p])
    land = LAND_ALL.copy()
    land[:, 10:20] = False  # a bay/marsh strip touching the pond's west shore
    dem[:, 10:20] = -3.0
    out = blend_pond_banks(dem, GRID, [p], land, 0.35, 200)
    assert (out[:, 10:20] == -3.0).all()
    assert out[24, 30] != 19.0  # land on the east side is still graded


def test_two_ponds_nearest_wins():
    a = _pond(50, 100, 50, 5.0)  # cols 5..9, rows 25..29
    b = _pond(250, 100, 50, 30.0)  # cols 25..29
    dem = _carved(flat(100.0), [a, b])
    out = blend_pond_banks(dem, GRID, [a, b], LAND_ALL, 0.35, 400)
    # Row 27, col 12 is 3 cells east of A's shore cell: d = (3 - 0.5) * 10 = 25 m, A's level.
    assert out[27, 12] == pytest.approx(5.0 + 0.35 * 25.0, abs=1e-4)
    # Col 22 is 3 cells west of B: B's level.
    assert out[27, 22] == pytest.approx(30.0 + 0.35 * 25.0, abs=1e-4)
    # A low cell nearer B than A is lifted to B's embankment, not A's.
    dem2 = _carved(flat(0.0), [a, b])
    out2 = blend_pond_banks(dem2, GRID, [a, b], LAND_ALL, 0.35, 400)
    assert out2[27, 22] == pytest.approx(30.0 - 0.35 * 25.0, abs=1e-4)
    assert out2[27, 12] == pytest.approx(0.0, abs=1e-4) or out2[27, 12] >= 5.0 - 0.35 * 25.0 - 1e-4


def test_blend_is_deterministic_and_independent_of_pond_order():
    a = _pond(50, 100, 50, 5.0)
    b = _pond(250, 100, 50, 30.0)
    rng = np.random.default_rng(0)
    dem = _carved(rng.uniform(0, 60, (GRID.height, GRID.width)).astype("float32"), [a, b])
    one = blend_pond_banks(dem, GRID, [a, b], LAND_ALL)
    two = blend_pond_banks(dem, GRID, [b, a], LAND_ALL)
    assert (one == two).all() and (one == blend_pond_banks(dem, GRID, [a, b], LAND_ALL)).all()
