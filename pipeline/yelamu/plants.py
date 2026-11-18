"""Low-poly tree recipes for the viewer's vegetation layer, built into GLB files by Blender.

Pure standard-library Python (no numpy, no bpy), so Blender's bundled Python can import it
and pytest can check it. scripts/make_plants_blender.py turns each recipe into a mesh,
exports viewer/public/assets/plants/<species>.glb and renders preview images.

A recipe is a list of parts in the VIEWER's frame (y up, metres of a unit-height tree):
  Stem: a tapered, open 5-sided tube from `base` to `tip` (10 triangles).
  Lump: a leaf mass, an icosahedron (20 triangles) scaled to `radii`, turned by `turn` about
        y and with each vertex pushed in or out by up to `jitter` (seeded), so no two lumps
        are alike.
Colours are LINEAR rgb (glTF COLOR_0 is linear, and so are the viewer's vertex colours).
Lumps carry a `shade` factor for their underside: the vertex colour runs from shade (lowest
point) to 1 (highest), a cheap stand-in for the crown shadowing itself.

The trees are stylised illustrations of the three tree species the viewer plants (see
viewer/src/vegetation/species.ts), not botanical models. Their leaf colours match VEG_COLORS
in viewer/src/vegetation/geometry.ts.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

SPECIES = ("oak", "bay", "willow")

# sRGB hex, as VEG_COLORS in viewer/src/vegetation/geometry.ts.
HEX = {
    "trunk": 0x6B4A2F,
    "oak": 0x30492A,
    "bay": 0x6E8538,
    "willow": 0x5A6E40,
    # Detailed set only: bark colours seen in photos (bay grey-brown, willow twigs red-brown).
    "bay_bark": 0x6E6252,
    "willow_bark": 0x7A4E3A,
}

STEM_TRIANGLES = 10
LUMP_TRIANGLES = 20
# Most triangles a tree may have. Scene C of the phone bench draws about 33,000 plants, a few
# thousand of them trees; the old procedural trees had 50-70 triangles.
MAX_TRIANGLES = 240
# The detailed set (DETAILED_RECIPES) may use a little more. The phone bench on 2026-11-18
# set the limit: a 370/320/380 version dropped close-up woodland (scene C) to 53 fps with
# 28 ms frame gaps at 1.86M triangles, while the simple set held 59.5 fps at 1.56M.
DETAILED_MAX_TRIANGLES = 260


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(h: int) -> tuple[float, float, float]:
    return tuple(srgb_to_linear(((h >> s) & 255) / 255) for s in (16, 8, 0))  # type: ignore[return-value]


Vec3 = tuple[float, float, float]


@dataclass(frozen=True)
class Stem:
    base: Vec3
    tip: Vec3
    r_base: float
    r_tip: float
    color: Vec3


@dataclass(frozen=True)
class Lump:
    center: Vec3
    radii: Vec3
    turn: float
    jitter: float
    seed: int
    color: Vec3
    shade: float = 0.72


Part = Stem | Lump


def _tint(c: Vec3, f: float) -> Vec3:
    return (c[0] * f, c[1] * f, c[2] * f)


def oak(seed: int = 1) -> list[Part]:
    """Coast live oak: a short trunk forking into spreading limbs under a broad, lumpy dome
    about one and a half times as wide as it is tall."""
    rng = random.Random(seed)
    bark = hex_to_linear(HEX["trunk"])
    leaf = hex_to_linear(HEX["oak"])
    parts: list[Part] = [Stem((0, -0.08, 0), (0, 0.3, 0), 0.075, 0.055, bark)]
    for k in range(3):
        a = k * 2.1 + 0.4
        parts.append(Stem((0, 0.27, 0), (0.3 * math.cos(a), 0.52, 0.3 * math.sin(a)), 0.045, 0.022, bark))
    parts.append(Lump((0, 0.64, 0), (0.5, 0.28, 0.48), 0.2, 0.16, rng.randrange(1 << 30), leaf))
    for k in range(6):
        a = k * (math.tau / 6) + rng.uniform(-0.3, 0.3)
        d = rng.uniform(0.3, 0.4)
        r = rng.uniform(0.26, 0.33)
        parts.append(
            Lump(
                (d * math.cos(a), rng.uniform(0.5, 0.6), d * math.sin(a)),
                (r, r * rng.uniform(0.55, 0.68), r * rng.uniform(0.9, 1.1)),
                rng.uniform(0, math.tau),
                0.18,
                rng.randrange(1 << 30),
                _tint(leaf, rng.uniform(0.9, 1.1)),
            )
        )
    parts.append(Lump((0.05, 0.82, -0.03), (0.3, 0.17, 0.28), 0.9, 0.16, rng.randrange(1 << 30), _tint(leaf, 1.08)))
    return parts


def bay(seed: int = 2) -> list[Part]:
    """California bay laurel: often several stems from the base, under a dense, upright oval
    crown that is taller than it is wide."""
    rng = random.Random(seed)
    bark = hex_to_linear(HEX["trunk"])
    leaf = hex_to_linear(HEX["bay"])
    parts: list[Part] = []
    for k in range(3):
        a = k * 2.2 + 0.3
        parts.append(Stem((0.03 * math.cos(a), -0.08, 0.03 * math.sin(a)), (0.12 * math.cos(a), 0.42, 0.12 * math.sin(a)), 0.04, 0.025, bark))
    parts.append(Lump((0, 0.52, 0), (0.32, 0.3, 0.3), 0.3, 0.1, rng.randrange(1 << 30), leaf))
    for k in range(3):
        a = k * 2.1 + rng.uniform(-0.3, 0.3)
        r = rng.uniform(0.19, 0.24)
        parts.append(
            Lump(
                (0.2 * math.cos(a), rng.uniform(0.58, 0.7), 0.2 * math.sin(a)),
                (r, r * 1.05, r),
                rng.uniform(0, math.tau),
                0.12,
                rng.randrange(1 << 30),
                _tint(leaf, rng.uniform(0.92, 1.08)),
            )
        )
    parts.append(Lump((0.02, 0.86, 0.02), (0.18, 0.15, 0.17), 0.5, 0.1, rng.randrange(1 << 30), _tint(leaf, 1.08)))
    return parts


def willow(seed: int = 3) -> list[Part]:
    """Arroyo willow: a thicket of thin stems fanning out from the ground (no single trunk)
    under a broad, uneven, low crown about as wide as it is tall."""
    rng = random.Random(seed)
    bark = hex_to_linear(HEX["trunk"])
    leaf = hex_to_linear(HEX["willow"])
    parts: list[Part] = []
    for k in range(5):
        a = k * (math.tau / 5) + rng.uniform(-0.3, 0.3)
        out = rng.uniform(0.22, 0.32)
        parts.append(Stem((0.02 * math.cos(a), -0.08, 0.02 * math.sin(a)), (out * math.cos(a), rng.uniform(0.32, 0.42), out * math.sin(a)), 0.028, 0.016, bark))
    parts.append(Lump((0, 0.62, 0), (0.32, 0.3, 0.3), 0.1, 0.16, rng.randrange(1 << 30), leaf))
    for k in range(6):
        a = k * (math.tau / 6) + rng.uniform(-0.35, 0.35)
        d = rng.uniform(0.24, 0.36)
        r = rng.uniform(0.2, 0.27)
        parts.append(
            Lump(
                (d * math.cos(a), rng.uniform(0.24, 0.48), d * math.sin(a)),
                (r, r * rng.uniform(0.85, 1.05), r * rng.uniform(0.85, 1.05)),
                rng.uniform(0, math.tau),
                0.18,
                rng.randrange(1 << 30),
                _tint(leaf, rng.uniform(0.88, 1.08)),
            )
        )
    return parts


RECIPES = {"oak": oak, "bay": bay, "willow": willow}


# --- Detailed set -------------------------------------------------------------------------
# Same species, closer to photos of the real trees, at up to DETAILED_MAX_TRIANGLES each.


def _bent(points: list[Vec3], r0: float, r1: float, color: Vec3) -> list[Part]:
    """A bent limb: one tapered stem per segment of a polyline, radius running r0 -> r1."""
    n = len(points) - 1
    out: list[Part] = []
    for i in range(n):
        ra = r0 + (r1 - r0) * i / n
        rb = r0 + (r1 - r0) * (i + 1) / n
        out.append(Stem(points[i], points[i + 1], ra, rb, color))
    return out


def _polar(d: float, a: float, y: float) -> Vec3:
    return (d * math.cos(a), y, d * math.sin(a))


def oak_detailed(seed: int = 11) -> list[Part]:
    """Coast live oak: a short thick trunk splitting into five heavy, twisting limbs that run
    out almost sideways; leaf clumps sit on the limb ends, with gaps between, around a
    flattened central cap, so the dark limbs show through a broad, patchy crown."""
    rng = random.Random(seed)
    bark = hex_to_linear(HEX["trunk"])
    leaf = hex_to_linear(HEX["oak"])
    fork = (0.02, 0.2, 0.01)
    parts: list[Part] = [Stem((0, -0.08, 0), fork, 0.1, 0.075, bark)]
    lumps: list[Part] = []
    for k in range(5):
        a = k * (math.tau / 5) + rng.uniform(-0.25, 0.25)
        swing = rng.uniform(-0.3, 0.3)  # the limb twists sideways along its length
        reach = rng.uniform(0.46, 0.55)
        elbow = _polar(0.22, a - swing * 0.5, rng.uniform(0.3, 0.36))
        tip = _polar(reach, a + swing, rng.uniform(0.42, 0.5))
        parts += _bent([fork, elbow, tip], 0.06, 0.018, bark)
        r = rng.uniform(0.24, 0.27)
        lumps.append(
            Lump(_polar(reach - 0.03, a + swing, rng.uniform(0.54, 0.6)), (r, r * 0.62, r * 1.05), rng.uniform(0, math.tau), 0.18, rng.randrange(1 << 30), _tint(leaf, rng.uniform(0.92, 1.06)))
        )
    lumps.append(Lump((0, 0.68, 0), (0.36, 0.19, 0.35), 0.4, 0.14, rng.randrange(1 << 30), _tint(leaf, 0.96)))
    lumps.append(Lump((0.04, 0.8, -0.02), (0.25, 0.15, 0.24), 1.1, 0.16, rng.randrange(1 << 30), _tint(leaf, 1.1)))
    return parts + lumps


def bay_detailed(seed: int = 12) -> list[Part]:
    """California bay laurel: three leaning, slightly curved grey-brown trunks under a dense,
    tiered dome, taller than wide: wide tiers low down, narrowing to a rounded top."""
    rng = random.Random(seed)
    bark = hex_to_linear(HEX["bay_bark"])
    leaf = hex_to_linear(HEX["bay"])
    parts: list[Part] = []
    for k in range(3):
        a = k * 2.1 + rng.uniform(-0.2, 0.2)
        bend = rng.uniform(-0.25, 0.25)
        pts = [_polar(0.03, a, -0.08), _polar(0.1, a + bend, 0.24), _polar(0.13, a - bend, 0.46)]
        parts += _bent(pts, 0.045, 0.02, bark)
    lumps: list[Part] = [Lump((0, 0.6, 0), (0.25, 0.3, 0.24), 0.2, 0.1, rng.randrange(1 << 30), _tint(leaf, 0.86))]
    # (count, distance out, height, radius, tint) per tier, bottom to top
    for count, d, y, r0, tint in ((3, 0.19, 0.46, 0.22, 0.9), (3, 0.16, 0.63, 0.21, 1.0), (2, 0.1, 0.78, 0.17, 1.05)):
        off = rng.uniform(0, math.tau)
        for k in range(count):
            a = off + k * math.tau / count + rng.uniform(-0.2, 0.2)
            r = r0 * rng.uniform(0.92, 1.08)
            lumps.append(Lump(_polar(d, a, y + rng.uniform(-0.02, 0.02)), (r, r * 1.05, r), rng.uniform(0, math.tau), 0.12, rng.randrange(1 << 30), _tint(leaf, tint * rng.uniform(0.95, 1.04))))
    lumps.append(Lump((0.01, 0.9, 0.0), (0.12, 0.13, 0.12), 0.3, 0.1, rng.randrange(1 << 30), _tint(leaf, 1.1)))
    return parts + lumps


def willow_detailed(seed: int = 13) -> list[Part]:
    """Arroyo willow: a thicket of seven thin, straight, red-brown stems fanning up from one spot
    into a vase; grey-green foliage in small upright plumes on the stem ends and lower down,
    loose enough that the stems show between them."""
    rng = random.Random(seed)
    bark = hex_to_linear(HEX["willow_bark"])
    leaf = hex_to_linear(HEX["willow"])
    parts: list[Part] = []
    lumps: list[Part] = []
    n = 7
    for k in range(n):
        a = k * (math.tau / n) + rng.uniform(-0.25, 0.25)
        out = rng.uniform(0.18, 0.36)
        top = rng.uniform(0.55, 0.8)
        base = _polar(0.03, a, -0.08)
        tip = _polar(out, a, top)
        parts.append(Stem(base, tip, 0.022, 0.012, bark))
        r = rng.uniform(0.14, 0.18)
        lumps.append(Lump(_polar(out * 0.97, a, top - 0.02), (r, r * 1.3, r * 0.9), rng.uniform(0, math.tau), 0.2, rng.randrange(1 << 30), _tint(leaf, rng.uniform(0.92, 1.12))))
    for k in range(2):
        a = k * math.pi + rng.uniform(-0.4, 0.4)
        r = rng.uniform(0.13, 0.16)
        lumps.append(Lump(_polar(rng.uniform(0.12, 0.2), a, rng.uniform(0.35, 0.45)), (r, r * 1.2, r), rng.uniform(0, math.tau), 0.2, rng.randrange(1 << 30), _tint(leaf, rng.uniform(0.86, 0.95))))
    return parts + lumps


DETAILED_RECIPES = {"oak": oak_detailed, "bay": bay_detailed, "willow": willow_detailed}


def triangles(parts: list[Part]) -> int:
    return sum(STEM_TRIANGLES if isinstance(p, Stem) else LUMP_TRIANGLES for p in parts)


def lump_jitter(lump: Lump, n_vertices: int) -> list[float]:
    """Per-vertex radial scale factors for a lump (1 +- jitter), seeded by the lump."""
    rng = random.Random(lump.seed)
    return [1 + rng.uniform(-lump.jitter, lump.jitter) for _ in range(n_vertices)]


def bounds(parts: list[Part]) -> tuple[Vec3, Vec3]:
    """Loose axis-aligned bounds (lumps at their full radii plus jitter, stems by their ends)."""
    lo = [math.inf] * 3
    hi = [-math.inf] * 3
    for p in parts:
        if isinstance(p, Stem):
            for pt, r in ((p.base, p.r_base), (p.tip, p.r_tip)):
                for i in range(3):
                    pad = 0 if i == 1 else r
                    lo[i] = min(lo[i], pt[i] - pad)
                    hi[i] = max(hi[i], pt[i] + pad)
        else:
            for i in range(3):
                ext = p.radii[i] * (1 + p.jitter) if i == 1 else max(p.radii[0], p.radii[2]) * (1 + p.jitter)
                lo[i] = min(lo[i], p.center[i] - ext)
                hi[i] = max(hi[i], p.center[i] + ext)
    return (lo[0], lo[1], lo[2]), (hi[0], hi[1], hi[2])
