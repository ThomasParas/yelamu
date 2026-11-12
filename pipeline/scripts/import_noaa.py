"""Import NOAA 1850s shoreline vectors as seeded hand-water files.

    uv run python scripts/import_noaa.py --projects CA37A02 CA37B02B CA37B07 CA37B08 \\
        [--seeds data/full-city/hand/noaa_seeds.json] [--report report.txt]
    uv run --with pillow python scripts/import_noaa.py ... --preview preview.png [--bbox W S E N]

Closes each project's lines into numbered candidate areas (yelamu.noaa.close_linework).
Without --seeds it only writes the report (and preview): every candidate area with its id,
hectares, centroid and an inside point in lon/lat, sheet and year. With --seeds it also
classes the areas and writes `hand_bay_noaa.geojson` and `hand_marsh_noaa.geojson` into
--out-dir (always both, possibly empty; deterministic bytes), and prints the counts,
hectares per class and project, the unseeded areas and the overlap between projects.
Exit code 1 on any seed or input error, or a failed preview (no hand file is written then).

Relative paths are resolved against the pipeline directory, so this runs from anywhere.
Pillow is only needed for --preview.
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path
from typing import Sequence

from yelamu.noaa import (
    DEFAULT_CLOSURE_REACH_M,
    DEFAULT_FRAME_REACH_M,
    DEFAULT_JOIN_ENDS_M,
    DEFAULT_LINE_CLASSES,
    DEFAULT_MIN_AREA_M2,
    DEFAULT_SNAP_M,
    EXPORTED_CLASSES,
    Area,
    Classification,
    Closure,
    SeedFile,
    area_ordinal,
    area_row,
    areas_to_features,
    classify,
    close_linework,
    cross_project_overlaps,
    feature_collection_text,
    land_conflicts,
    load_seed_file,
    read_project,
    select_lines,
    utm_geom_to_lonlat,
)
from yelamu.region import load_region

PIPELINE = Path(__file__).resolve().parent.parent
OUTPUT_FILES = {"bay": "hand_bay_noaa.geojson", "marsh": "hand_marsh_noaa.geojson"}
UNCLOSED_LISTED = 25
SEED_ORDER = ("bay", "marsh", "land")


def _path(value: str) -> Path:
    p = Path(value)
    return p if p.is_absolute() else PIPELINE / p


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="import_noaa", description=__doc__.split("\n\n")[0])
    p.add_argument("--projects", nargs="+", required=True, metavar="PROJECT",
                   help="NOAA project folders under --noaa-dir, e.g. CA37A02 CA37B08")
    p.add_argument("--noaa-dir", type=_path, default=_path("data/raw/noaa/extracted"))
    p.add_argument("--seeds", type=_path, help="seeds JSON (without it: report/preview only)")
    p.add_argument("--region", type=_path, default=_path("regions/full-city.json"),
                   help="region JSON; its bbox bounds the seeds")
    p.add_argument("--snap-m", type=float, default=DEFAULT_SNAP_M)
    p.add_argument("--min-area-m2", type=float, default=DEFAULT_MIN_AREA_M2)
    p.add_argument("--frame-reach-m", type=float, default=DEFAULT_FRAME_REACH_M)
    p.add_argument("--closure-reach-m", type=float, default=DEFAULT_CLOSURE_REACH_M)
    p.add_argument("--join-ends-m", type=float, default=DEFAULT_JOIN_ENDS_M)
    p.add_argument("--line-classes", type=int, nargs="+", default=sorted(DEFAULT_LINE_CLASSES),
                   metavar="CODE", help="NOAA FEATURE codes that close areas (default: all)")
    p.add_argument("--out-dir", type=_path, default=_path("data/full-city/hand"))
    p.add_argument("--preview", type=_path, help="write a preview PNG (needs Pillow)")
    p.add_argument("--bbox", type=float, nargs=4, metavar=("W", "S", "E", "N"),
                   help="lon/lat crop of the preview (default: all project boundaries)")
    p.add_argument("--preview-assets", type=_path,
                   help="built asset folder drawn under the preview (pale land / water)")
    p.add_argument("--report", type=_path, help="also write the report to this text file")
    args = p.parse_args(argv)
    for name in ("snap_m", "min_area_m2", "frame_reach_m", "closure_reach_m", "join_ends_m"):
        if getattr(args, name) < 0:
            p.error(f"--{name.replace('_', '-')} must be 0 or more")
    return args


def _closure_lines(project: str, report: list[str], closure: Closure) -> None:
    report.append(
        f"== {project}: {len(closure.areas)} areas; free line ends {closure.free_ends_before} "
        f"-> {closure.free_ends_after}; {len(closure.connectors)} closing lines added; "
        f"{closure.dropped_slivers} slivers dropped; {len(closure.unclosed)} pieces "
        f"({closure.unclosed_m / 1000:.2f} km) bound no area")
    pieces = sorted(closure.unclosed, key=lambda g: (-g.length, g.wkb))
    for g in pieces[:UNCLOSED_LISTED]:
        c = utm_geom_to_lonlat(g.interpolate(0.5, normalized=True))
        report.append(f"  unclosed {g.length:8.0f} m  near {c.x:.5f}, {c.y:.5f}")
    if len(pieces) > UNCLOSED_LISTED:
        report.append(f"  ... and {len(pieces) - UNCLOSED_LISTED} shorter pieces")


def run(args: argparse.Namespace) -> int:
    report: list[str] = [
        f"NOAA import: projects {' '.join(args.projects)}; snap {args.snap_m:g} m; min area "
        f"{args.min_area_m2:g} m2; frame reach {args.frame_reach_m:g} m; closure reach "
        f"{args.closure_reach_m:g} m; end joins {args.join_ends_m:g} m; line classes "
        f"{' '.join(map(str, sorted(args.line_classes)))}"]
    seed_file = SeedFile([], [])
    if args.seeds:
        seed_file = load_seed_file(args.seeds, load_region(args.region).bbox)
        report.append(f"seeds: {args.seeds} ({len(seed_file.seeds)} seeds, "
                      f"{len(seed_file.closures)} owner closure lines)")
    unknown = sorted({c.project for c in seed_file.closures} - set(args.projects))
    if unknown:
        raise ValueError(f"closure lines name project(s) not imported: {', '.join(unknown)}")

    projects, closures = [], {}
    for name in args.projects:
        project = read_project(args.noaa_dir / name)
        projects.append(project)
        closures[project.name] = close_linework(
            select_lines(project.lines, args.line_classes), project.boundary,
            args.snap_m, args.min_area_m2, project=project.name,
            frame_reach_m=args.frame_reach_m, closure_reach_m=args.closure_reach_m,
            join_ends_m=args.join_ends_m,
            extra_lines=[c.utm() for c in seed_file.closures_for(project.name)])
        _closure_lines(project.name, report, closures[project.name])
    areas: list[Area] = [a for c in closures.values() for a in c.areas]

    result: Classification | None = None
    classes: dict[str, str] = {}
    if args.seeds:
        result = classify(areas, seed_file.seeds)
        classes = {c.area.id: c.cls for c in result.classified}
    report.append("== candidate areas (id, size, centroid, an inside point for a seed, sheet, "
                  "line class, seed class)")
    for area in sorted(areas, key=lambda a: area_ordinal(a.id)):
        report.append(f"  {area_row(area)}  [{classes.get(area.id, 'unseeded')}]")

    if args.preview:
        _preview(args, projects, closures, areas, classes, seed_file)
        report.append(f"wrote preview {args.preview}")

    if result is not None:
        features = areas_to_features(result.classified)
        args.out_dir.mkdir(parents=True, exist_ok=True)
        for cls in EXPORTED_CLASSES:
            path = args.out_dir / OUTPUT_FILES[cls]
            path.write_text(feature_collection_text(features[cls]))
            report.append(f"wrote {path}: {len(features[cls])} features")
        hectares: dict[tuple[str, str], float] = defaultdict(float)
        for c in result.classified:
            hectares[(c.cls, c.area.project)] += c.area.area_m2 / 1e4
        for cls in SEED_ORDER:
            total = sum(v for (k, _), v in hectares.items() if k == cls)
            per = ", ".join(f"{p} {v:.1f}" for (k, p), v in sorted(hectares.items()) if k == cls)
            n = sum(c.cls == cls for c in result.classified)
            report.append(f"{cls}: {n} areas, {total:.1f} ha ({per or 'none'})")
        report.append(f"unseeded: {len(result.unseeded)} areas (left unchanged): "
                      + (", ".join(a.id for a in result.unseeded) or "none"))
        overlaps = cross_project_overlaps(result.classified)
        report.append(f"overlap between projects: {sum(o[2] for o in overlaps) / 1e4:.1f} ha in "
                      f"{len(overlaps)} pairs (allowed: the build unions the files)")
        for a, b, m2 in overlaps:
            report.append(f"  {a} x {b}: {m2 / 1e4:.1f} ha")
        conflicts = land_conflicts(result.classified)
        if conflicts:
            report.append(f"WARNING: water over a land-seeded area of another project: "
                          f"{sum(o[2] for o in conflicts) / 1e4:.1f} ha in {len(conflicts)} pairs "
                          "(the build lets water win)")
            for a, b, m2 in conflicts:
                report.append(f"  {a} over {b}: {m2 / 1e4:.1f} ha")

    text = "\n".join(report) + "\n"
    print(text, end="")
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text)
    return 0


def _preview(args, projects, closures, areas, classes, seed_file) -> None:
    from yelamu.noaa_preview import make_view, render  # Pillow is imported inside render

    codes = grid = None
    if args.preview_assets:
        from yelamu.compare import classify as classify_cells, load_assets, meta_grid

        meta, heights, habitat = load_assets(args.preview_assets)
        codes, grid = classify_cells(heights, habitat, meta), meta_grid(meta)
    view = make_view(tuple(args.bbox) if args.bbox else None, [p.boundary for p in projects])
    lines = [ln for p in projects for ln in select_lines(p.lines, args.line_classes)]
    connectors = [g for c in closures.values() for g in c.connectors]
    unclosed = [g for c in closures.values() for g in c.unclosed]
    title = (f"NOAA candidate areas: {' '.join(p.name for p in projects)}  "
             f"(snap {args.snap_m:g} m, min {args.min_area_m2:g} m2)")
    render(args.preview, view, areas, classes, lines, connectors, unclosed,
           seed_file.seeds, title, codes, grid)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        return run(args)
    except ImportError as exc:
        print(f"error: {exc} (the preview needs Pillow: run with `uv run --with pillow`)", file=sys.stderr)
        return 1
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
