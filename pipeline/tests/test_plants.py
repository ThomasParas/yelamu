import math

import pytest

from yelamu.plants import (
    DETAILED_MAX_TRIANGLES,
    DETAILED_RECIPES,
    HEX,
    MAX_TRIANGLES,
    RECIPES,
    SPECIES,
    Lump,
    Stem,
    bounds,
    hex_to_linear,
    lump_jitter,
    triangles,
)


SETS = {"simple": (RECIPES, MAX_TRIANGLES), "detailed": (DETAILED_RECIPES, DETAILED_MAX_TRIANGLES)}
EVERY = [(name, sp) for name in SETS for sp in SPECIES]


@pytest.mark.parametrize("name", SETS)
def test_every_species_has_a_recipe(name):
    assert set(SETS[name][0]) == set(SPECIES)


@pytest.mark.parametrize("name,species", EVERY)
def test_recipes_are_deterministic(name, species):
    recipes = SETS[name][0]
    assert recipes[species]() == recipes[species]()


@pytest.mark.parametrize("name,species", EVERY)
def test_trees_stay_inside_the_phone_triangle_budget(name, species):
    recipes, budget = SETS[name]
    n = triangles(recipes[species]())
    assert 60 <= n <= budget


def test_detailed_trees_are_more_detailed():
    for sp in SPECIES:
        assert triangles(DETAILED_RECIPES[sp]()) > triangles(RECIPES[sp]())


@pytest.mark.parametrize("name,species", EVERY)
def test_trees_stand_on_the_origin_and_are_about_unit_height(name, species):
    parts = SETS[name][0][species]()
    lo, hi = bounds(parts)
    # The viewer rescales to exactly 1, but the recipe should already be close.
    assert 0.85 <= hi[1] <= 1.1
    # Sunk a little into the ground, so a slope never shows the bottom.
    assert -0.1 <= lo[1] < 0
    # Centred over the trunk.
    assert abs((lo[0] + hi[0]) / 2) < 0.15
    assert abs((lo[2] + hi[2]) / 2) < 0.15


@pytest.mark.parametrize("name", SETS)
def test_oak_is_broad_bay_is_upright(name):
    def aspect(sp):
        lo, hi = bounds(SETS[name][0][sp]())
        return max(hi[0] - lo[0], hi[2] - lo[2]) / (hi[1] - lo[1])

    assert aspect("oak") > 1.3
    assert aspect("bay") < aspect("oak")


@pytest.mark.parametrize("name", SETS)
def test_willow_has_no_single_trunk_but_many_stems(name):
    stems = [p for p in SETS[name][0]["willow"]() if isinstance(p, Stem)]
    assert len(stems) >= 4
    # all thin, fanning outward
    assert all(s.r_base < 0.05 for s in stems)
    assert all(math.hypot(s.tip[0], s.tip[2]) > math.hypot(s.base[0], s.base[2]) for s in stems)


@pytest.mark.parametrize("name", SETS)
def test_leaf_colours_follow_the_viewer_palette(name):
    for sp in SPECIES:
        lumps = [p for p in SETS[name][0][sp]() if isinstance(p, Lump)]
        base = hex_to_linear(HEX[sp])
        for lump in lumps:
            ratio = [lump.color[i] / base[i] for i in range(3)]
            # a lump may be tinted lighter or darker, but keeps the hue
            assert max(ratio) - min(ratio) < 1e-9
            assert 0.85 <= ratio[0] <= 1.13


def test_lump_jitter_is_seeded_and_bounded():
    lump = next(p for p in RECIPES["oak"]() if isinstance(p, Lump))
    a = lump_jitter(lump, 12)
    assert a == lump_jitter(lump, 12)
    assert all(abs(f - 1) <= lump.jitter for f in a)
    assert len(set(a)) > 1


def test_srgb_to_linear_matches_the_viewer():
    # trunk 6b4a2f: same numbers the viewer's hexToLinear gives
    r, g, b = hex_to_linear(0x6B4A2F)
    assert r == pytest.approx(0.14702726, rel=1e-6)
    assert g == pytest.approx(0.06847818, rel=1e-6)
    assert b == pytest.approx(0.02842604, rel=1e-6)
