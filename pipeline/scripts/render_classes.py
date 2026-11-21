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
    "mudflat": (122, 109, 88),
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
