"""Preview image of the NOAA candidate areas, for choosing and checking seeds.

The pure parts (view frame, pixel mapping, colours, labels, background sampling) are tested
without Pillow; `render` draws with Pillow, which is not a project dependency:

    uv run --with pillow python scripts/import_noaa.py ... --preview preview.png

Each candidate area is filled by its class (bay blue, marsh teal; land and unseeded areas
are not filled, unseeded ones get a grey hatch and an orange outline), labelled with its id
at an interior point; the NOAA lines are drawn in their FEATURE class colours, the closing
lines added by the importer dashed magenta, linework that bounds nothing thick red, seeds as
dots with their id. Lon/lat ticks, a scale bar and a legend frame the map.
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np
from shapely.geometry import Point, Polygon, box
from shapely.geometry.base import BaseGeometry

from yelamu.compare import LAND, lonlat_ticks, scale_bar_pixels
from yelamu.geo import Grid
from yelamu.noaa import (
    ALONGSHORE, ALONGSHORE_BOUNDARY, APPROXIMATE, FEATURE_NAMES, MAN_MADE, MARSH_EDGE,
    MEAN_HIGH_WATER, USER_ADDED, WHARF, Area, Line, Seed, area_ordinal, lonlat_geom_to_utm,
)

MAX_SIDE_PX = 2400
MARGIN_LEFT, MARGIN_BOTTOM, MARGIN_TOP, LEGEND_W = 72, 34, 30, 250
LABEL_MIN_PX2 = 40.0  # areas smaller than this on the image are not labelled (see report)

CLASS_FILL = {  # RGBA
    "bay": (62, 112, 200, 120),
    "marsh": (40, 160, 140, 140),
}
UNSEEDED_OUTLINE = (230, 120, 20, 255)
# Unseeded areas get a pale tint cycling through this palette (by ordinal) so neighbouring
# areas can be told apart, under the grey hatch.
UNSEEDED_TINTS = ((255, 170, 60), (255, 220, 90), (230, 140, 200), (170, 210, 120),
                  (150, 190, 240), (240, 160, 140))
UNSEEDED_ALPHA = 70
HATCH_RGBA = (120, 120, 120, 110)
HATCH_STEP_PX = 9
LINE_COLOURS = {
    MEAN_HIGH_WATER: (200, 0, 0),
    MARSH_EDGE: (0, 140, 60),
    MAN_MADE: (90, 0, 160),
    WHARF: (150, 60, 200),
    ALONGSHORE: (240, 120, 0),
    ALONGSHORE_BOUNDARY: (120, 120, 120),
    APPROXIMATE: (240, 0, 240),
    USER_ADDED: (0, 0, 0),
}
OTHER_LINE_RGB = (0, 170, 170)
CONNECTOR_RGB = (255, 0, 200)
UNCLOSED_RGB = (255, 0, 0)
SEED_RGB = {"bay": (0, 40, 160), "marsh": (0, 100, 80), "land": (120, 80, 0)}
BACKGROUND_RGB = (250, 250, 247)
RECON_WATER_RGB = (214, 228, 242)
RECON_LAND_RGB = (238, 232, 214)


@dataclass(frozen=True)
class View:
    """A north-up UTM window drawn at `m_per_px` metres per pixel."""

    west: float
    south: float
    east: float
    north: float
    m_per_px: float

    @property
    def width(self) -> int:
        return max(1, int(math.ceil((self.east - self.west) / self.m_per_px)))

    @property
    def height(self) -> int:
        return max(1, int(math.ceil((self.north - self.south) / self.m_per_px)))

    def px(self, x: float, y: float) -> tuple[float, float]:
        return ((x - self.west) / self.m_per_px, (self.north - y) / self.m_per_px)

    def grid(self) -> Grid:
        """The view as a yelamu Grid (one cell per pixel), for yelamu.compare.lonlat_ticks."""
        return Grid(self.west, self.north - self.height * self.m_per_px,
                    self.west + self.width * self.m_per_px, self.north, self.m_per_px)


def make_view(bbox_lonlat: tuple[float, float, float, float] | None,
              boundaries: Sequence[Polygon], max_side_px: int = MAX_SIDE_PX) -> View:
    """The view of a lon/lat bbox (W, S, E, N), or of the union of the project boundaries,
    scaled so its longer side is max_side_px."""
    if bbox_lonlat is not None:
        w, s, e, n = bbox_lonlat
        if not (w < e and s < n):
            raise ValueError(f"bbox must satisfy west < east and south < north, got {bbox_lonlat}")
        x0, y0, x1, y1 = lonlat_geom_to_utm(box(w, s, e, n).segmentize(0.001)).bounds
    else:
        if not boundaries:
            raise ValueError("no bbox and no project boundary to frame the preview")
        x0 = min(b.bounds[0] for b in boundaries)
        y0 = min(b.bounds[1] for b in boundaries)
        x1 = max(b.bounds[2] for b in boundaries)
        y1 = max(b.bounds[3] for b in boundaries)
    m_per_px = max(x1 - x0, y1 - y0) / max_side_px
    return View(x0, y0, x1, y1, m_per_px)


def short_label(area_id: str, projects: Sequence[str]) -> str:
    """'CA37B08-7' -> 'B08-7' when every project shares the prefix 'CA37'."""
    prefix = os.path.commonprefix(list(projects)) if len(projects) > 1 else ""
    project, n = area_ordinal(area_id)
    return f"{project[len(prefix):] or project}-{n}"


def line_colour(feature: int) -> tuple[int, int, int]:
    return LINE_COLOURS.get(feature, OTHER_LINE_RGB)


def unseeded_tint(area_id: str) -> tuple[int, int, int]:
    """The pale tint of an unseeded area (cycles with its ordinal)."""
    return UNSEEDED_TINTS[area_ordinal(area_id)[1] % len(UNSEEDED_TINTS)]


def hatch_mask(height: int, width: int, step: int = HATCH_STEP_PX) -> np.ndarray:
    """Boolean diagonal-stripe pattern (one pixel stripes every `step` pixels)."""
    rows, cols = np.indices((height, width))
    return (rows + cols) % step == 0


def background(view: View, codes: np.ndarray | None, grid: Grid | None) -> np.ndarray:
    """RGB background: the reconstruction's land / water (pale) sampled at each pixel centre
    when `codes` (yelamu.compare.classify output on `grid`) is given, plain otherwise."""
    rgb = np.empty((view.height, view.width, 3), dtype=np.uint8)
    rgb[...] = BACKGROUND_RGB
    if codes is None or grid is None:
        return rgb
    xs = view.west + (np.arange(view.width) + 0.5) * view.m_per_px
    ys = view.north - (np.arange(view.height) + 0.5) * view.m_per_px
    cols = np.floor((xs - grid.west) / grid.cell).astype(int)
    rows = np.floor((grid.north - ys) / grid.cell).astype(int)
    ok_c = (cols >= 0) & (cols < codes.shape[1])
    ok_r = (rows >= 0) & (rows < codes.shape[0])
    sub = codes[np.clip(rows, 0, codes.shape[0] - 1)[:, None],
                np.clip(cols, 0, codes.shape[1] - 1)[None, :]]
    inside = ok_r[:, None] & ok_c[None, :]
    rgb[inside & (sub == LAND)] = RECON_LAND_RGB
    rgb[inside & (sub != LAND)] = RECON_WATER_RGB
    return rgb


def label_point(geom: BaseGeometry) -> Point:
    """An interior point for the label (the polygon's representative point)."""
    return geom.representative_point()


def legend_entries() -> list[tuple[str, str, tuple]]:
    """(kind, text, colour) rows of the legend: fills, then lines."""
    rows = [("fill", "bay (seeded)", CLASS_FILL["bay"]),
            ("fill", "marsh (seeded)", CLASS_FILL["marsh"]),
            ("hatch", "unseeded area (left unchanged)", UNSEEDED_OUTLINE),
            ("outline", "land (seeded; not written)", SEED_RGB["land"])]
    rows += [("line", FEATURE_NAMES[code], LINE_COLOURS[code]) for code in sorted(LINE_COLOURS)]
    rows += [("dash", "closing line added by the importer", CONNECTOR_RGB),
             ("thick", "linework bounding no area", UNCLOSED_RGB),
             ("dot", "seed", SEED_RGB["bay"])]
    return rows


def render(
    out: Path,
    view: View,
    areas: Sequence[Area],
    classes: dict[str, str],
    lines: Sequence[Line],
    connectors: Sequence[BaseGeometry],
    unclosed: Sequence[BaseGeometry],
    seeds: Sequence[Seed],
    title: str,
    codes: np.ndarray | None = None,
    grid: Grid | None = None,
) -> tuple[int, int]:
    """Draw the preview PNG (needs Pillow). `classes` maps area id -> bay / marsh / land."""
    from PIL import Image, ImageDraw, ImageFont

    def font(size: int):
        try:
            return ImageFont.load_default(size=size)
        except TypeError:  # old Pillow
            return ImageFont.load_default()

    small, big = font(11), font(14)
    w, h = view.width, view.height
    clip = box(view.west, view.south, view.east, view.north)
    projects = sorted({a.project for a in areas})

    def coords(seq) -> list[tuple[float, float]]:
        return [view.px(x, y) for x, y in seq]

    base = Image.fromarray(background(view, codes, grid)).convert("RGBA")
    fills = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    fdraw = ImageDraw.Draw(fills)
    hatch_area = Image.new("L", (w, h), 0)
    hdraw = ImageDraw.Draw(hatch_area)
    visible = [a for a in sorted(areas, key=lambda a: area_ordinal(a.id))
               if a.geometry.intersects(clip)]
    for area in visible:
        cls = classes.get(area.id)
        if cls in CLASS_FILL:
            target, fill, empty = fdraw, CLASS_FILL[cls], (0, 0, 0, 0)
        elif cls is None:
            target, fill, empty = hdraw, 255, 0
        else:
            continue  # land: outline only
        target.polygon(coords(area.geometry.exterior.coords), fill=fill)
        for hole in area.geometry.interiors:
            target.polygon(coords(hole.coords), fill=empty)
        if cls is None:
            tint = Image.new("L", (w, h), 0)
            tdraw = ImageDraw.Draw(tint)
            tdraw.polygon(coords(area.geometry.exterior.coords), fill=UNSEEDED_ALPHA)
            for hole in area.geometry.interiors:
                tdraw.polygon(coords(hole.coords), fill=0)
            fills.paste(unseeded_tint(area.id) + (UNSEEDED_ALPHA,), mask=tint)
    alpha = np.where((np.asarray(hatch_area) > 0) & hatch_mask(h, w), HATCH_RGBA[3], 0)
    hatch_layer = Image.new("RGBA", (w, h), HATCH_RGBA)
    hatch_layer.putalpha(Image.fromarray(alpha.astype(np.uint8)))
    image = Image.alpha_composite(Image.alpha_composite(base, fills), hatch_layer)
    draw = ImageDraw.Draw(image)

    for area in visible:
        cls = classes.get(area.id)
        outline = UNSEEDED_OUTLINE if cls is None else (
            SEED_RGB["land"] if cls == "land" else None)
        if outline:
            draw.line(coords(area.geometry.exterior.coords), fill=outline, width=1)
    for line in sorted(lines, key=lambda ln: ln.feature):
        if line.geometry.intersects(clip):
            draw.line(coords(line.geometry.coords), fill=line_colour(line.feature), width=1)
    for g in unclosed:
        if g.intersects(clip):
            draw.line(coords(g.coords), fill=UNCLOSED_RGB, width=3)
    for g in connectors:
        if g.intersects(clip):
            pts = coords(g.coords)
            _dashed(draw, pts[0], pts[-1], CONNECTOR_RGB)
    for area in visible:
        pixels = area.geometry.area / view.m_per_px ** 2
        if pixels < LABEL_MIN_PX2:
            continue
        p = label_point(area.geometry.intersection(clip) if not clip.contains(area.geometry)
                        else area.geometry)
        x, y = view.px(p.x, p.y)
        text = short_label(area.id, projects)
        draw.text((x + 1, y + 1), text, fill=(255, 255, 255), font=small, anchor="mm")
        draw.text((x, y), text, fill=(0, 0, 0), font=small, anchor="mm")
    for seed in seeds:
        p = lonlat_geom_to_utm(Point(seed.lon, seed.lat))
        if not clip.contains(p):
            continue
        x, y = view.px(p.x, p.y)
        draw.ellipse([x - 4, y - 4, x + 4, y + 4], fill=SEED_RGB[seed.cls],
                     outline=(255, 255, 255))
        draw.text((x + 6, y - 6), seed.id, fill=SEED_RGB[seed.cls], font=small)

    sheet = Image.new("RGB", (MARGIN_LEFT + w + 12 + LEGEND_W, MARGIN_TOP + h + MARGIN_BOTTOM),
                      (255, 255, 255))
    sheet.paste(image.convert("RGB"), (MARGIN_LEFT, MARGIN_TOP))
    sd = ImageDraw.Draw(sheet)
    sd.text((6, 8), title, fill=(0, 0, 0), font=big)
    sd.rectangle([MARGIN_LEFT - 1, MARGIN_TOP - 1, MARGIN_LEFT + w, MARGIN_TOP + h],
                 outline=(80, 80, 80))
    xt, yt = lonlat_ticks(view.grid(), 1)
    for py, label in yt:
        y = MARGIN_TOP + py
        sd.line([MARGIN_LEFT - 5, y, MARGIN_LEFT - 1, y], fill=(0, 0, 0))
        sd.text((2, y - 6), label, fill=(0, 0, 0), font=small)
    for px_, label in xt:
        x = MARGIN_LEFT + px_
        sd.line([x, MARGIN_TOP + h + 1, x, MARGIN_TOP + h + 5], fill=(0, 0, 0))
        sd.text((x - 24, MARGIN_TOP + h + 8), label, fill=(0, 0, 0), font=small)
    bar_m = nice_bar_m(view.width * view.m_per_px)
    length = scale_bar_pixels(view.m_per_px, 1, bar_m)
    x0, y0 = MARGIN_LEFT + 10, MARGIN_TOP + h - 14
    sd.rectangle([x0 - 4, y0 - 16, x0 + length + 56, y0 + 8], fill=(255, 255, 255))
    sd.line([x0, y0, x0 + length, y0], fill=(0, 0, 0), width=3)
    sd.text((x0 + length + 6, y0 - 7),
            f"{bar_m / 1000:g} km" if bar_m >= 1000 else f"{bar_m:g} m",
            fill=(0, 0, 0), font=small)
    _legend(sd, MARGIN_LEFT + w + 16, MARGIN_TOP, small)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    return sheet.size


def nice_bar_m(span_m: float) -> float:
    """A 1-2-5 scale-bar length close to a fifth of the span."""
    target = max(span_m / 5.0, 1.0)
    exp = 10 ** math.floor(math.log10(target))
    return max(m * exp for m in (1, 2, 5) if m * exp <= target)


def _dashed(draw, a, b, colour, dash: float = 6.0) -> None:
    length = math.dist(a, b)
    n = max(1, int(length // dash))
    for i in range(0, n, 2):
        t0, t1 = i / n, min(1.0, (i + 1) / n)
        draw.line([(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0),
                   (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)], fill=colour, width=2)


def _legend(draw, x: int, y: int, font) -> None:
    for kind, text, colour in legend_entries():
        rgb = tuple(colour[:3])
        if kind == "fill":
            draw.rectangle([x, y, x + 18, y + 10], fill=rgb, outline=(60, 60, 60))
        elif kind == "hatch":
            draw.rectangle([x, y, x + 18, y + 10], outline=rgb)
            for k in range(0, 28, 5):
                draw.line([x + max(0, k - 10), y + min(10, k), x + min(18, k), y + max(0, k - 18)],
                          fill=HATCH_RGBA[:3])
        elif kind == "outline":
            draw.rectangle([x, y, x + 18, y + 10], outline=rgb)
        elif kind == "dot":
            draw.ellipse([x + 5, y + 1, x + 13, y + 9], fill=rgb)
        elif kind == "dash":
            _dashed(draw, (x, y + 5), (x + 18, y + 5), rgb, 4.0)
        else:
            draw.line([x, y + 5, x + 18, y + 5], fill=rgb, width=3 if kind == "thick" else 2)
        draw.text((x + 24, y - 1), text, fill=(0, 0, 0), font=font)
        y += 16
