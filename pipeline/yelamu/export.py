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
    if not np.isfinite(dem).all():
        raise ValueError(
            "dem contains NaN or infinite values; fill or mask missing data before "
            "writing assets (see fill_missing_land)"
        )
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
