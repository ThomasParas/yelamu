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
        # the extent is documented, the level comes from the modern DEM: only inferred
        assert s.origin == "sfei" and s.confidence == "inferred" and s.level_m is None
        assert s.source == (f"SFEI Hidden Nature SF habitat class '{s.class_name}' (extent); "
                            "water level from the modern DEM")
        assert len(s.source) <= 300
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
    # Only hand-drawn ponds are "hand-drawn and sculpted" sources; the SFEI one is not listed.
    assert rows == [
        {"layer": "ponds", "source": "Sheet A", "confidence": "inferred", "count": 2},
    ]
    assert pond_provenance_rows([p for p in ponds if p.origin == "sfei"]) == []
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
    # The shore cell is AT the water level; the embankment then falls 3.5 m per cell.
    assert out[24, 9] == pytest.approx(30.0, abs=1e-4)
    assert out[24, 8] == pytest.approx(30.0 - 0.35 * 10.0, abs=1e-4)
    # ...until the embankment meets the real ground: 25 m / 0.35 = ~71 m, plus the half cell
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
    assert out2[27, 22] == pytest.approx(30.0 - 0.35 * 20.0, abs=1e-4)
    assert out2[27, 12] == pytest.approx(0.0, abs=1e-4) or out2[27, 12] >= 5.0 - 0.35 * 25.0 - 1e-4


def test_blend_is_deterministic_and_independent_of_pond_order():
    a = _pond(50, 100, 50, 5.0)
    b = _pond(250, 100, 50, 30.0)
    rng = np.random.default_rng(0)
    dem = _carved(rng.uniform(0, 60, (GRID.height, GRID.width)).astype("float32"), [a, b])
    one = blend_pond_banks(dem, GRID, [a, b], LAND_ALL)
    two = blend_pond_banks(dem, GRID, [b, a], LAND_ALL)
    assert (one == two).all() and (one == blend_pond_banks(dem, GRID, [a, b], LAND_ALL)).all()


# ------------------------------------------- overlap: one surface per cell, grid clipping


def _ring_polygon(flat_ring):
    pts = list(zip(flat_ring[0::2], flat_ring[1::2]))
    return Polygon(pts)


def _doc_polygons(doc):
    """Each exported pond as a shapely Polygon in world metres, with holes."""
    out = {}
    for q in doc["ponds"]:
        out[q["id"]] = Polygon(_ring_polygon(q["rings"][0]).exterior.coords,
                               [_ring_polygon(r).exterior.coords for r in q["rings"][1:]])
    return out


def test_overlapping_ponds_export_no_area_at_two_levels():
    sfei = spec(square(50, 50, 200), origin="sfei", class_name="Other pond or lake",
                level=8.0, confidence="inferred")
    hand = spec(square(100, 100, 100), name="Hand", level=5.0)
    ponds = build_ponds([sfei, hand], flat(), GRID, log=lambda m: None)
    doc = ponds_document(ponds, GRID, {})
    polys = _doc_polygons(doc)
    by_level = {q["level_m"]: polys[q["id"]] for q in doc["ponds"]}
    assert set(by_level) == {5.0, 8.0}
    hand_poly, sfei_poly = by_level[5.0], by_level[8.0]
    assert hand_poly.area == pytest.approx(100 * 100, rel=1e-6)
    assert sfei_poly.area == pytest.approx(200 * 200 - 100 * 100, rel=1e-6)
    assert len(next(q for q in doc["ponds"] if q["level_m"] == 8.0)["rings"]) == 2  # a hole
    assert hand_poly.intersection(sfei_poly).area < 1e-6
    # the exported rings agree with the cells each pond owns
    for p in ponds:
        poly = polys[p.id]
        assert poly.area == pytest.approx(p.mask.sum() * 100.0, rel=1e-6)


def test_pond_split_by_a_higher_priority_pond_becomes_two_ponds():
    sfei = spec(square(50, 150, 300), origin="sfei", class_name="Other pond or lake", level=8.0)
    hand = spec(box(500000 + 150, 4180000 + 100, 500000 + 200, 4180000 + 400), name="Cut", level=5.0)
    ponds = build_ponds([sfei, hand], flat(), GRID, log=lambda m: None)
    sf = [p for p in ponds if p.origin == "sfei"]
    assert len(sf) == 2 and len({p.id for p in sf}) == 2
    assert all(p.geometry.geom_type == "Polygon" and p.mask.sum() >= 4 for p in sf)
    assert not (sf[0].mask & sf[1].mask).any()
    ids = [p.id for p in ponds]
    assert len(set(ids)) == len(ids)


def test_pond_fully_inside_a_higher_priority_pond_is_dropped():
    notes = []
    big = spec(square(50, 50, 200), name="Big", level=5.0)
    small = spec(square(100, 100, 50), origin="sfei", class_name="Other pond or lake", level=8.0)
    ponds = build_ponds([big, small], flat(), GRID, log=notes.append)
    assert [p.name for p in ponds] == ["Big"] and notes


def test_polygon_running_off_the_grid_is_exported_clipped_to_the_grid():
    (p,) = build_ponds([spec(box(499900, 4180100, 500200, 4180300), level=5.0)], flat(), GRID,
                       log=lambda m: None)
    doc = ponds_document([p], GRID, {})
    poly = _doc_polygons(doc)[p.id]
    assert poly.bounds[0] >= -200.0 - 1e-6  # west edge of the grid in world metres
    assert poly.bounds[0] == pytest.approx(-200.0)
    assert poly.area == pytest.approx(200 * 200)
    assert p.geometry.bounds[0] == pytest.approx(500000)


def test_polygon_clipped_into_pieces_by_the_grid_makes_separate_ponds():
    # a U shape whose two arms stay on the grid while the base lies outside it
    u = Polygon([(500100, 4179900), (500300, 4179900), (500300, 4180200), (500260, 4180200),
                 (500260, 4179960), (500140, 4179960), (500140, 4180200), (500100, 4180200)])
    ponds = build_ponds([spec(u, name="U", level=5.0)], flat(), GRID, log=lambda m: None)
    assert len(ponds) == 2
    assert all(p.geometry.geom_type == "Polygon" for p in ponds)
    assert len({p.id for p in ponds}) == 2
    assert all(p.geometry.bounds[1] >= 4180000 - 1e-6 for p in ponds)


# ---------------------------------------- limits shared with viewer/src/ponds/parse.ts

import re  # noqa: E402
from pathlib import Path  # noqa: E402

from yelamu import ponds as ponds_module  # noqa: E402

PARSE_TS = Path(__file__).resolve().parents[2] / "viewer" / "src" / "ponds" / "parse.ts"
_CONFIDENCES = ("documented", "inferred", "illustrative")


def _viewer_would_accept(doc):
    """A Python port of the checks in parsePonds (viewer/src/ponds/parse.ts)."""
    m = ponds_module
    assert doc["version"] == 1
    assert len(doc["ponds"]) <= m.MAX_PONDS
    seen, points = set(), 0
    for q in doc["ponds"]:
        assert re.fullmatch(r"[a-z0-9][a-z0-9-]*", q["id"]) and q["id"] not in seen
        seen.add(q["id"])
        assert q["name"] is None or (isinstance(q["name"], str) and len(q["name"]) <= m.MAX_NAME_CHARS)
        assert isinstance(q["level_m"], (int, float)) and np.isfinite(q["level_m"])
        assert m.MIN_LEVEL_M <= q["level_m"] <= m.MAX_LEVEL_M
        assert q["source"].strip() and len(q["source"]) <= m.MAX_SOURCE_CHARS
        assert q["confidence"] in _CONFIDENCES
        assert q["rings"]
        for ring in q["rings"]:
            assert len(ring) % 2 == 0 and len(ring) >= 6
            points += len(ring) // 2
            assert all(np.isfinite(v) and abs(v) <= m.MAX_COORD_M for v in ring)
    assert points <= m.MAX_POND_POINTS


def test_pipeline_limits_match_the_viewer_parser():
    if not PARSE_TS.exists():
        pytest.skip("viewer sources not present")
    text = PARSE_TS.read_text()

    def const(name):
        found = re.search(rf"export const {name} = ([-0-9_e.]+);", text)
        assert found, name
        return float(found.group(1).replace("_", ""))

    m = ponds_module
    assert (m.MAX_PONDS, m.MAX_POND_POINTS, m.MAX_NAME_CHARS, m.MAX_SOURCE_CHARS) == (
        const("MAX_PONDS"), const("MAX_POND_POINTS"), const("MAX_NAME_CHARS"),
        const("MAX_SOURCE_CHARS"))
    assert (m.MAX_COORD_M, m.MIN_LEVEL_M, m.MAX_LEVEL_M) == (
        const("MAX_COORD_M"), const("MIN_LEVEL_M"), const("MAX_LEVEL_M"))
    assert re.search(r'const ID = /\^\[a-z0-9\]\[a-z0-9-\]\*\$/;', text)


def test_the_worst_allowed_pond_satisfies_every_viewer_limit():
    m = ponds_module
    name = "N" * m.MAX_NAME_CHARS
    source = "s" * 200  # the provenance limit for a hand-drawn source
    f = _feature(square(100, 100, 100), name=name, source=source, level_m=m.MAX_LEVEL_M,
                 confidence="illustrative")
    specs = hand_pond_specs([f], path="p.geojson")
    ponds = build_ponds(specs, flat(), GRID, log=lambda m_: None)
    doc = ponds_document(ponds, GRID, {})
    _viewer_would_accept(doc)
    q = doc["ponds"][0]
    assert len(q["name"]) == 120 and q["level_m"] == 1000.0 and len(q["source"]) == 200


def test_hand_pond_name_and_level_outside_the_viewer_limits_are_errors_naming_the_feature():
    m = ponds_module
    long_name = _feature(square(0, 0, 100), name="N" * (m.MAX_NAME_CHARS + 1))
    with pytest.raises(ValueError, match=r"p\.geojson.*feature 0.*name"):
        hand_pond_specs([long_name], path="p.geojson")
    for bad in (m.MAX_LEVEL_M + 0.5, m.MIN_LEVEL_M - 0.5, float("inf"), float("-inf")):
        with pytest.raises(ValueError, match=r"p\.geojson.*feature 0.*level_m"):
            hand_pond_specs([_feature(square(0, 0, 100), level_m=bad)], path="p.geojson")
    for ok in (m.MIN_LEVEL_M, m.MAX_LEVEL_M):
        assert hand_pond_specs([_feature(square(0, 0, 100), level_m=ok)], path="p")[0].level_m == ok


def test_a_sfei_pond_whose_dem_median_is_outside_the_level_range_is_dropped():
    notes = []
    out = build_ponds([spec(square(100, 100, 100), origin="sfei", class_name="Other pond or lake")],
                      flat(5000.0), GRID, log=notes.append)
    assert out == [] and "level" in notes[0]
    with pytest.raises(ValueError, match="level"):
        build_ponds([spec(square(100, 100, 100), name="Hand")], flat(5000.0), GRID,
                    log=lambda m_: None)


def test_export_refuses_more_ponds_or_ring_points_than_the_viewer_accepts(monkeypatch):
    ponds = build_ponds([spec(square(100, 100, 100), name="A"),
                         spec(square(250, 250, 100), name="B")], flat(), GRID, log=lambda m_: None)
    monkeypatch.setattr(ponds_module, "MAX_PONDS", 1)
    with pytest.raises(ValueError, match="2 ponds"):
        ponds_document(ponds, GRID, {})
    monkeypatch.setattr(ponds_module, "MAX_PONDS", 2000)
    monkeypatch.setattr(ponds_module, "MAX_POND_POINTS", 7)
    with pytest.raises(ValueError, match="ring points"):
        ponds_document(ponds, GRID, {})


def test_export_refuses_a_name_or_source_the_viewer_would_reject():
    (p,) = build_ponds([spec(square(100, 100, 100), name="A")], flat(), GRID, log=lambda m_: None)
    for bad in (replace_pond(p, name="N" * 121), replace_pond(p, source="s" * 301),
                replace_pond(p, source="   "), replace_pond(p, level_m=1001.0)):
        with pytest.raises(ValueError, match=p.id):
            ponds_document([bad], GRID, {})


def replace_pond(p, **kw):
    import dataclasses
    return dataclasses.replace(p, **kw)


# ------------------------------------------- the ground at the shore never sits below the water


def _shore_cells(p):
    from scipy import ndimage
    ring = ndimage.binary_dilation(p.mask, structure=ndimage.generate_binary_structure(2, 1))
    return ring & ~p.mask


@pytest.mark.parametrize("level,ground", [(5.0, 19.0), (30.0, 5.0), (12.0, 12.0), (5.0, 100.0)])
def test_land_beside_a_pond_is_never_lower_than_the_water(level, ground):
    p = _pond(100, 100, 100, level)
    out = blend_pond_banks(_carved(flat(ground), [p]), GRID, [p], LAND_ALL)
    shore = _shore_cells(p)
    assert shore.any() and (out[shore] >= level - 0.05).all()


def test_land_beside_a_pond_is_never_lower_than_the_water_on_rough_ground():
    rng = np.random.default_rng(3)
    a = _pond(50, 100, 70, 5.0)
    b = _pond(250, 150, 60, 30.0)
    dem = _carved(rng.uniform(-10, 80, (GRID.height, GRID.width)).astype("float32"), [a, b])
    out = blend_pond_banks(dem, GRID, [a, b], LAND_ALL)
    for p in (a, b):
        shore = _shore_cells(p) & ~a.mask & ~b.mask
        assert (out[shore] >= p.level_m - 0.05).all()
        # ...and the ramp up is still no steeper than the bank slope allows
        assert (out[shore] <= p.level_m + 0.35 * 5.0 + 1e-4).all()


def test_an_embankment_reaches_the_shore_at_the_water_level_then_falls_at_the_bank_slope():
    p = _pond(100, 100, 100, 30.0)
    out = blend_pond_banks(_carved(flat(5.0), [p]), GRID, [p], LAND_ALL, 0.35, 200)
    assert out[24, 9] == pytest.approx(30.0, abs=1e-4)
    assert out[24, 8] == pytest.approx(30.0 - 0.35 * 10.0, abs=1e-4)
    assert out[24, 7] == pytest.approx(30.0 - 0.35 * 20.0, abs=1e-4)


def test_a_sfei_class_name_that_would_overflow_the_source_limit_is_an_error():
    coll = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"HabitatCla": "X" * 300},
         "geometry": _ll_square(-122.5, 37.7, -122.4, 37.8)}]}
    with pytest.raises(ValueError, match="300"):
        sfei_pond_specs(coll, ["X" * 300])


# ------------------------------------------------ rings that collapse when rounded to 0.1 m

CX, CZ = 500200.0, 4180200.0  # the grid centre: world (0, 0)


def _with_hole(side):
    outer = box(CX - 100, CZ - 100, CX + 100, CZ + 100)
    hole = box(CX + 30 - side / 2, CZ - 30 - side / 2, CX + 30 + side / 2, CZ - 30 + side / 2)
    return outer.difference(hole)


def test_a_hole_that_collapses_when_rounded_is_dropped_with_a_note_not_an_abort():
    notes = []
    (p,) = build_ponds([spec(_with_hole(0.04), name="Holey", level=5.0)], flat(), GRID,
                       log=notes.append)
    assert len(p.geometry.interiors) == 0 and any("hole" in n for n in notes)
    out = []
    doc = ponds_document([p], GRID, {}, log=out.append)
    assert len(doc["ponds"][0]["rings"]) == 1


def test_a_proper_hole_is_kept():
    notes = []
    (p,) = build_ponds([spec(_with_hole(20), name="Holey", level=5.0)], flat(), GRID,
                       log=notes.append)
    assert len(p.geometry.interiors) == 1 and not notes
    assert len(ponds_document([p], GRID, {})["ponds"][0]["rings"]) == 2


def test_ponds_document_drops_a_collapsed_hole_even_for_a_hand_built_pond():
    (p,) = build_ponds([spec(square(100, 100, 100), name="A", level=5.0)], flat(), GRID,
                       log=lambda m: None)
    import dataclasses
    holey = dataclasses.replace(p, geometry=_with_hole(0.04))
    notes = []
    doc = ponds_document([holey], GRID, {}, log=notes.append)
    assert len(doc["ponds"][0]["rings"]) == 1 and any("hole" in n for n in notes)


def _sliver():
    # 40 m long and 0.02 m wide along a row of cell centres: 4 cells, but the outer ring
    # is a line once rounded to 0.1 m.
    y = 4180005.0
    return Polygon([(500005, y - 0.01), (500045, y - 0.01), (500045, y + 0.01), (500005, y + 0.01)])


def test_a_hand_pond_whose_outer_ring_collapses_is_an_error_naming_the_feature():
    s = spec(_sliver(), name="Sliver", level=5.0)
    import dataclasses
    s = dataclasses.replace(s, where="hp.geojson: feature 3 ('Sliver')")
    with pytest.raises(ValueError, match=r"hp\.geojson: feature 3"):
        build_ponds([s], flat(), GRID, log=lambda m: None)


def test_an_sfei_pond_whose_outer_ring_collapses_is_dropped_with_a_note():
    notes = []
    out = build_ponds([spec(_sliver(), origin="sfei", class_name="Other pond or lake", level=5.0)],
                      flat(), GRID, log=notes.append)
    assert out == [] and notes and "collapse" in notes[0]
