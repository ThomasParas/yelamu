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

WATER_GROUPS = {"water", "marsh", "mudflat"}
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
