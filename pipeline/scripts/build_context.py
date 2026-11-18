"""Build the grey context ring around the city map. Run after the city build and build_overlay.

    uv run python scripts/build_context.py --region regions/full-city.json
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Sequence

from yelamu.context import build_context
from yelamu.region import load_region


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region", type=Path, required=True, help="region JSON with a context key")
    args = parser.parse_args(argv)
    try:
        doc = build_context(load_region(args.region))
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    hole = doc["hole"]
    print(
        f"ring: {doc['cols']} x {doc['rows']} vertices, spacing {doc['dx']:.2f} x {doc['dz']:.2f} m, "
        f"hole cells {hole['i0']}..{hole['i1']} x {hole['j0']}..{hole['j1']}, "
        f"heights {doc['min_m']:.0f}..{doc['max_m']:.0f} m, {len(doc['places'])} places"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
