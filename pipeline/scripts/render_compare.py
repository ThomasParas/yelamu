"""Compare the reconstruction with a georeferenced map sheet, side by side (PNG).

Pillow is not a project dependency, so run it through uv:

    uv run --with pillow python scripts/render_compare.py ASSET_DIR --bbox W S E N \
        [--sheet GEOREF.tif] [--scale 2] --out OUT.png

Three panels: (1) the sheet reprojected onto the crop (grey when no --sheet), with
lon/lat ticks; (2) the reconstruction (water blue, marsh teal, land tan with hillshade)
with the 1769 shoreline as a 1-pixel dark red line; (3) a 50% blend of the two with the
shoreline on top. Every panel has a title and a 500 m scale bar. The pure logic lives in
yelamu.compare.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from yelamu.compare import (
    PLACEHOLDER_RGB,
    SHORELINE_RGB,
    blend,
    crop_window,
    draw_mask,
    load_assets,
    lonlat_ticks,
    placeholder,
    read_sheet,
    render_reconstruction,
    scale_bar_pixels,
    window_grid,
)

MARGIN_LEFT, MARGIN_BOTTOM, GAP, TITLE_H, HEADER_H = 64, 28, 14, 22, 26
BAR_M = 500


def _font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # old Pillow: fixed-size default font
        return ImageFont.load_default()


def draw_scale_bar(draw: ImageDraw.ImageDraw, panel_size: tuple[int, int], cell_m: float,
                   scale: int, font) -> None:
    width, height = panel_size
    length = scale_bar_pixels(cell_m, scale, BAR_M)
    x0, y0 = 10, height - 14
    draw.rectangle([x0 - 4, y0 - 16, x0 + length + 40, y0 + 8], fill=(255, 255, 255))
    draw.line([x0, y0, x0 + length, y0], fill=(0, 0, 0), width=3)
    draw.line([x0, y0 - 4, x0, y0 + 4], fill=(0, 0, 0), width=1)
    draw.line([x0 + length, y0 - 4, x0 + length, y0 + 4], fill=(0, 0, 0), width=1)
    draw.text((x0 + length + 6, y0 - 7), f"{BAR_M} m", fill=(0, 0, 0), font=font)


def compose(asset_dir: Path, bbox, sheet: Path | None, scale: int) -> Image.Image:
    meta, heights, habitat = load_assets(asset_dir)
    win = crop_window(meta, tuple(bbox))
    rows, cols = win.slices()
    h = heights[rows, cols]
    hab = habitat[rows, cols] if habitat is not None else None
    grid = window_grid(meta, win)
    recon, shore = render_reconstruction(h, hab, meta, scale)
    ph, pw = recon.shape[:2]
    sheet_rgb = read_sheet(sheet, grid, scale) if sheet else placeholder(ph, pw)
    panels = [
        ("1. Sheet" if sheet else "1. Sheet (none given)", sheet_rgb),
        ("2. Reconstruction + 1769 shoreline", draw_mask(recon, shore, SHORELINE_RGB)),
        ("3. Blend 50% + shoreline", draw_mask(blend(sheet_rgb, recon), shore, SHORELINE_RGB)),
    ]
    font, small = _font(14), _font(12)
    width = MARGIN_LEFT + 3 * pw + 2 * GAP + 10
    height = HEADER_H + TITLE_H + ph + MARGIN_BOTTOM + 6
    image = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    header = (f"{asset_dir.resolve().name}   bbox {bbox[0]} {bbox[1]} {bbox[2]} {bbox[3]}   "
              f"sheet: {sheet.name if sheet else '(none)'}   cell {meta['cell_m']:g} m x{scale}")
    draw.text((6, 5), header, fill=(0, 0, 0), font=font)
    for i, (title, rgb) in enumerate(panels):
        x0, y0 = MARGIN_LEFT + i * (pw + GAP), HEADER_H + TITLE_H
        draw.text((x0, HEADER_H + 2), title, fill=(0, 0, 0), font=font)
        panel = Image.fromarray(rgb)
        pdraw = ImageDraw.Draw(panel)
        draw_scale_bar(pdraw, (pw, ph), grid.cell, scale, small)
        image.paste(panel, (x0, y0))
        draw.rectangle([x0 - 1, y0 - 1, x0 + pw, y0 + ph], outline=(90, 90, 90))
    # lon/lat ticks on the left and bottom edges of panel 1
    xticks, yticks = lonlat_ticks(grid, scale)
    x0, y0 = MARGIN_LEFT, HEADER_H + TITLE_H
    for py, label in yticks:
        draw.line([x0 - 5, y0 + py, x0 - 1, y0 + py], fill=(0, 0, 0))
        draw.text((2, y0 + py - 7), label, fill=(0, 0, 0), font=small)
    for px, label in xticks:
        draw.line([x0 + px, y0 + ph + 1, x0 + px, y0 + ph + 5], fill=(0, 0, 0))
        draw.text((x0 + px - 22, y0 + ph + 8), label, fill=(0, 0, 0), font=small)
    return image


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="render_compare", description=__doc__.split("\n\n")[0])
    p.add_argument("asset_dir", type=Path, help="built asset folder (meta.json, heightmap.u16, ...)")
    p.add_argument("--bbox", type=float, nargs=4, required=True,
                   metavar=("WEST", "SOUTH", "EAST", "NORTH"), help="lon/lat crop")
    p.add_argument("--sheet", type=Path, help="georeferenced sheet (GeoTIFF from georeference.py)")
    p.add_argument("--scale", type=int, default=2, help="output pixels per grid cell (default 2)")
    p.add_argument("--out", type=Path, required=True, help="output PNG")
    args = p.parse_args(argv)
    if args.scale < 1:
        p.error("--scale must be at least 1")
    try:
        image = compose(args.asset_dir, args.bbox, args.sheet, args.scale)
    except (OSError, ValueError, KeyError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.out)
    print(f"wrote {args.out} ({image.width} x {image.height})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
