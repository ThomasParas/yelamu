"""Check hand-drawn polygon files before a build.

    uv run python scripts/check_polygons.py FILE... --region regions/full-city.json

For each GeoJSON file: feature count, geometry validity as drawn, provenance (sources and
confidences), total area in hectares, features outside the region's bounding box, and
pairs of features of the same file that overlap by more than 0.5 ha. Exit code 1 when any
file has an unreadable or invalid geometry, a feature without a valid source / confidence,
or a feature lying entirely outside the bbox (overlaps and partly-outside features are
only warnings).
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

import shapely
from shapely.geometry import box, shape
from shapely.validation import explain_validity

from yelamu.geo import Grid
from yelamu.provenance import provenance_problem
from yelamu.region import load_region
from yelamu.sources import feature_label, geometry_to_utm_polygons

OVERLAP_HA = 0.5


@dataclass
class FileReport:
    path: Path
    n_features: int = 0  # all features in the file
    n_polygonal: int = 0  # features with polygon geometry
    area_ha: float = 0.0
    sources: Counter = field(default_factory=Counter)
    confidences: Counter = field(default_factory=Counter)
    problems: list[str] = field(default_factory=list)  # make the check fail
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems


def _label(path: Path, index: int, props) -> str:
    return feature_label(path.name, index, props)


def check_file(
    path: Path,
    bbox: tuple[float, float, float, float] | None = None,
    overlap_ha: float = OVERLAP_HA,
) -> FileReport:
    """Inspect one file. `bbox` is the region (W, S, E N in lon/lat), or None to skip that check."""
    path = Path(path)
    report = FileReport(path)
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        report.problems.append(f"{path}: cannot read as JSON ({exc})")
        return report
    features = data.get("features") if isinstance(data, dict) and data.get("type") == "FeatureCollection" else (
        [data] if isinstance(data, dict) else None)
    if features is None:
        report.problems.append(f"{path}: not a GeoJSON FeatureCollection or Feature")
        return report
    report.n_features = len(features)

    region = None
    if bbox is not None:
        g = Grid.from_lonlat_bbox(*bbox, cell=1.0)
        region = box(g.west, g.south, g.east, g.north)

    kept: list[tuple[int, dict, object]] = []  # (index, properties, UTM geometry)
    for index, feature in enumerate(features):
        is_feature = isinstance(feature, dict) and feature.get("type") == "Feature"
        raw = feature.get("geometry") if is_feature else feature
        props = (feature.get("properties") or {}) if is_feature else {}
        label = _label(path, index, props)
        parts = geometry_to_utm_polygons(raw)
        if not parts:
            report.warnings.append(f"{label}: no polygon geometry (ignored by the build)")
            continue
        report.n_polygonal += 1
        try:
            drawn = shape(raw)
            if not drawn.is_valid:
                report.problems.append(
                    f"{label}: invalid geometry as drawn ({explain_validity(drawn)}); "
                    "the build would silently repair it")
        except Exception as exc:  # malformed coordinates
            report.problems.append(f"{label}: unreadable geometry ({exc})")
            continue
        problem = provenance_problem(props)
        if problem is not None:
            report.problems.append(f"{label}: {problem}")
        else:
            report.sources[props["source"].strip()] += 1
            report.confidences[props["confidence"]] += 1
        geom = shapely.unary_union(parts)
        report.area_ha += geom.area / 1e4
        kept.append((index, props, geom))
        if region is not None:
            if not geom.intersects(region):
                report.problems.append(f"{label}: entirely outside the region bbox")
            elif not region.contains(geom):
                report.warnings.append(f"{label}: partly outside the region bbox")

    geoms = [k[2] for k in kept]
    if len(geoms) > 1:
        tree = shapely.STRtree(geoms)
        left, right = tree.query(geoms, predicate="intersects")
        for i, j in sorted((int(a), int(b)) for a, b in zip(left, right) if a < b):
            ha = geoms[i].intersection(geoms[j]).area / 1e4
            if ha > overlap_ha:
                report.warnings.append(
                    f"overlap of {ha:.2f} ha between {_label(path, kept[i][0], kept[i][1])} "
                    f"and {_label(path, kept[j][0], kept[j][1])}")
    return report


def format_report(report: FileReport) -> str:
    lines = [f"{report.path}"]
    if report.n_features == 0 and report.ok:
        lines.append("  empty (0 features): fine, nothing is drawn yet")
    else:
        lines.append(f"  features: {report.n_features} ({report.n_polygonal} with polygons)")
        lines.append(f"  total area: {report.area_ha:.1f} ha")
        srcs = "; ".join(f"{s} x{n}" for s, n in sorted(report.sources.items())) or "(none)"
        lines.append(f"  sources: {srcs}")
        conf = ", ".join(f"{c} x{n}" for c, n in sorted(report.confidences.items())) or "(none)"
        lines.append(f"  confidences: {conf}")
    for w in report.warnings:
        lines.append(f"  WARNING: {w}")
    for p in report.problems:
        lines.append(f"  ERROR: {p}")
    lines.append("  " + ("OK" if report.ok else "FAILED"))
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="check_polygons", description=__doc__.split("\n\n")[0])
    p.add_argument("files", nargs="+", type=Path, help="GeoJSON file(s) of hand-drawn polygons")
    p.add_argument("--region", type=Path, help="region JSON; enables the outside-bbox check")
    args = p.parse_args(argv)
    bbox = None
    if args.region:
        try:
            bbox = load_region(args.region).bbox
        except (OSError, ValueError) as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
    failed = False
    for path in args.files:
        report = check_file(path, bbox)
        print(format_report(report))
        failed |= not report.ok
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
