"""Baked ground shading for the viewer: soft sun shadows cast by the hills and ambient occlusion.

The viewer lights each triangle by its own slope; this adds what depends on the land AROUND a
point: hollows and valley floors see less sky, and ridges throw shadows away from the sun. It
is a rendering aid, not data about 1769, so it has no layer entry or source.

Heights are vertically exaggerated first (the viewer draws them x3), so the shading matches
the relief people see. The viewer's sun is fixed in world space, so one bake is right for
every camera rotation. The result is a coarse grid (every `stride`-th city sample) of 0..1
multipliers stored as uint8; the viewer reads it back with bilinear interpolation.

World axes as in the viewer: x east (grid column), z south (grid row), y up.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np
from scipy.ndimage import map_coordinates

from yelamu.export import dequantize_heights

SHADE_FILE = "shade.u8"
AO_DIRECTIONS = 8


@dataclass(frozen=True)
class ShadeParams:
    exaggeration: float = 3.0
    # Direction TOWARD the sun (any length): the viewer's DirectionalLight position.
    sun: tuple[float, float, float] = (-1.0, 1.2, 0.6)
    stride: int = 2
    shadow_strength: float = 0.5
    # Width of the soft shadow edge, as a change in tan(elevation).
    penumbra: float = 0.25
    ao_strength: float = 0.8
    ao_distances_m: tuple[float, ...] = field(default=(20, 40, 70, 110, 170, 260, 400))


def coarse_grid(heights: np.ndarray, stride: int) -> np.ndarray:
    """Every `stride`-th sample of (rows, cols) heights, always including the last row and column."""
    h, w = heights.shape
    ys = np.minimum(np.arange(math.ceil((h - 1) / stride) + 1) * stride, h - 1)
    xs = np.minimum(np.arange(math.ceil((w - 1) / stride) + 1) * stride, w - 1)
    return heights[np.ix_(ys, xs)]


def compute_shade(heights: np.ndarray, cell_m: float, p: ShadeParams = ShadeParams()) -> np.ndarray:
    """Shade multipliers (0..1] on the coarse grid for (rows, cols) heights in metres."""
    if heights.ndim != 2 or min(heights.shape) < 2:
        raise ValueError(f"need a 2-D grid of at least 2x2 heights, got shape {heights.shape}")
    h = coarse_grid(heights.astype("float64"), p.stride) * p.exaggeration
    rows, cols = h.shape
    step_m = cell_m * p.stride
    jj, ii = np.mgrid[0:rows, 0:cols].astype("float64")

    def sample(y: np.ndarray, x: np.ndarray) -> np.ndarray:
        # Bilinear; outside the grid the edge value is used (the viewer does the same).
        return map_coordinates(h, [y, x], order=1, mode="nearest")

    # Sun shadow: steepest horizon toward the sun versus the sun's own elevation.
    sx, sy, sz = p.sun
    horiz = math.hypot(sx, sz)
    lit = np.ones_like(h)
    if horiz > 0 and sy > 0:
        tan_sun = sy / horiz
        dx, dz = sx / horiz, sz / horiz
        horizon = np.full_like(h, -np.inf)
        max_t = int((h.max() - h.min()) / tan_sun / step_m) + 1
        for t in range(1, max_t + 1):
            x = ii + dx * t
            y = jj + dz * t
            inside = (x >= 0) & (y >= 0) & (x <= cols - 1) & (y <= rows - 1)
            tan = (sample(y, x) - h) / (t * step_m)
            horizon = np.where(inside, np.maximum(horizon, tan), horizon)
        lit = np.clip((tan_sun - horizon) / p.penumbra + 0.5, 0.0, 1.0)

    # Ambient occlusion: mean sine of the horizon elevation over 8 directions.
    occ = np.zeros_like(h)
    for k in range(AO_DIRECTIONS):
        a = k / AO_DIRECTIONS * 2 * math.pi
        ox, oz = math.cos(a), math.sin(a)
        best = np.zeros_like(h)
        for d in p.ao_distances_m:
            t = d / step_m
            tan = (sample(jj + oz * t, ii + ox * t) - h) / d
            best = np.maximum(best, tan)
        occ += best / np.sqrt(1 + best * best)
    occ /= AO_DIRECTIONS

    return (1 - p.shadow_strength * (1 - lit)) * (1 - p.ao_strength * occ)


def to_u8(shade: np.ndarray) -> np.ndarray:
    return np.rint(np.clip(shade, 0.0, 1.0) * 255).astype(np.uint8)


def build_shade(assets: Path, p: ShadeParams = ShadeParams()) -> dict:
    """Bake shade.u8 next to a built city's meta.json/heightmap and record it in meta.json."""
    assets = Path(assets)
    meta_path = assets / "meta.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"{meta_path} not found: build the city first")
    meta = json.loads(meta_path.read_text())
    w, hgt = meta["width"], meta["height"]
    raw = np.fromfile(assets / meta["heights_file"], dtype="<u2")
    if raw.size != w * hgt:
        raise ValueError(f"{meta['heights_file']} has {raw.size} values, expected {w * hgt}")
    heights = dequantize_heights(raw.reshape(hgt, w), meta["min_m"], meta["max_m"])
    shade = compute_shade(heights, meta["cell_m"], p)
    to_u8(shade).tofile(assets / SHADE_FILE)
    rows, cols = shade.shape
    params = asdict(p)
    doc = {
        "file": SHADE_FILE,
        "format": "uint8 0..255 = multiplier 0..1, row-major",
        "cols": cols,
        "rows": rows,
        "stride": p.stride,
        "exaggeration": p.exaggeration,
        "sun": list(p.sun),
        "params": {k: v for k, v in params.items() if k not in ("stride", "exaggeration", "sun")},
    }
    doc["params"]["ao_distances_m"] = list(doc["params"]["ao_distances_m"])
    meta["shade"] = doc
    meta_path.write_text(json.dumps(meta, indent=2))
    return {**doc, "min": float(shade.min()), "mean": float(shade.mean())}
