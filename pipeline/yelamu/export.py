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
) -> dict:
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
    if processing is not None:
        meta["processing"] = processing
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta
