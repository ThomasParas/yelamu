"""Download SFEI's two public creek layers to pipeline/data/raw/sfei-creeks/ (git-ignored).

    uv run python scripts/fetch_creeks.py mapped      # 26 hand-mapped lines, about 84 KB
    uv run python scripts/fetch_creeks.py modelled    # modelled streams, Strahler order 3 and up
    uv run python scripts/fetch_creeks.py both

Both are public ArcGIS feature services owned by SFEI's Resilient Landscapes programme. Neither
states a licence; see docs/superpowers/specs/2026-11-18-creeks-design.md and NOTICE.md. Only the
query results are saved: nothing is committed.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

BASE = "https://services1.arcgis.com/8V9ShUQ1DGYVLtOg/arcgis/rest/services"
PAGE = 2000  # the services' maxRecordCount


@dataclass(frozen=True)
class Source:
    name: str
    service: str
    layer: int
    where: str
    out_file: str


MAPPED = Source("hand-mapped creeks", "San_Francisco_Historical_Creeks", 0, "1=1",
                "san_francisco_historical_creeks.geojson")
MODELLED = Source("modelled streams, order 3 and up", "MYHL_HistoricStreams", 1, "StrahlerID>=3",
                  "myhl_historic_streams_order3.geojson")


def query_url(source: Source, *, offset: int) -> str:
    params = {
        "where": source.where,
        "outFields": "*",
        "outSR": "4326",
        "orderByFields": "OBJECTID",
        "resultOffset": str(offset),
        "resultRecordCount": str(PAGE),
        "f": "geojson",
    }
    return f"{BASE}/{source.service}/FeatureServer/{source.layer}/query?{urllib.parse.urlencode(params)}"


def fetch(source: Source, dest_dir: Path) -> Path:
    features: list[dict] = []
    offset = 0
    while True:
        with urllib.request.urlopen(query_url(source, offset=offset), timeout=60) as resp:  # noqa: S310
            page = json.load(resp)
        batch = page.get("features", [])
        features.extend(batch)
        if len(batch) < PAGE and not page.get("exceededTransferLimit"):
            break
        offset += PAGE
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / source.out_file
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    print(f"{source.name}: {len(features)} features, {out.stat().st_size / 1024:.0f} KB -> {out}")
    return out


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("which", choices=("mapped", "modelled", "both"))
    args = parser.parse_args(argv)
    dest = Path(__file__).resolve().parent.parent / "data" / "raw" / "sfei-creeks"
    try:
        if args.which in ("mapped", "both"):
            fetch(MAPPED, dest)
        if args.which in ("modelled", "both"):
            fetch(MODELLED, dest)
    except OSError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
