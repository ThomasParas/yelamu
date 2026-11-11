"""Split SFEI's habitat GeoJSON into bay and marsh polygon files for the pipeline.

    uv run python -m yelamu.habitats data/raw/sf_habitats.geojson \
        --field HabitatCla \
        --bay "Deep ocean/bay" "Shallow ocean/bay" "Tidal flat" \
        --marsh "Tidal marsh" "Tidal slough" \
        --out data/raw
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def split_features(
    collection: dict, field: str, bay: list[str], marsh: list[str]
) -> tuple[list[dict], list[dict]]:
    """Return (bay_features, marsh_features). A class listed in both goes to bay."""
    bay_features, marsh_features = [], []
    for feature in collection["features"]:
        habitat = (feature.get("properties") or {}).get(field)
        if habitat in bay:
            bay_features.append(feature)
        elif habitat in marsh:
            marsh_features.append(feature)
    return bay_features, marsh_features


def _write(path: Path, features: list[dict]) -> None:
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="habitats")
    p.add_argument("source", type=Path, help="GeoJSON FeatureCollection (EPSG:4326)")
    p.add_argument("--field", required=True, help="attribute holding the habitat class")
    p.add_argument("--bay", nargs="+", required=True, help="class values that are open bay")
    p.add_argument("--marsh", nargs="+", required=True, help="class values that are marsh")
    p.add_argument("--out", type=Path, required=True, help="directory for bay/marsh files")
    args = p.parse_args(argv)

    collection = json.loads(args.source.read_text())
    bay, marsh = split_features(collection, args.field, args.bay, args.marsh)
    if not bay and not marsh:
        raise SystemExit(
            f"No features matched field {args.field!r} with the given values; "
            "check the spelling against the data."
        )
    args.out.mkdir(parents=True, exist_ok=True)
    _write(args.out / "bay.geojson", bay)
    _write(args.out / "marsh.geojson", marsh)
    print(f"bay: {len(bay)} polygons, marsh: {len(marsh)} polygons -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
