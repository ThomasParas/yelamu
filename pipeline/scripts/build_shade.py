"""Bake the ground shading (sun shadows + ambient occlusion) for a built city. Run after the
city build (it reads heightmap.u16 and rewrites meta.json, adding a `shade` key):

    uv run python scripts/build_shade.py ../viewer/public/assets/real-city

The exaggeration and sun direction must match the viewer (VERTICAL_EXAGGERATION and the
DirectionalLight position in viewer/src/main.ts); the viewer ignores a bake that does not.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Sequence

from yelamu.shade import build_shade


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("assets", type=Path, help="viewer asset folder holding meta.json and heightmap.u16")
    args = parser.parse_args(argv)
    try:
        doc = build_shade(args.assets)
    except (OSError, ValueError, KeyError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(
        f"shade: {doc['cols']} x {doc['rows']} (every {doc['stride']} samples), "
        f"min {doc['min']:.2f}, mean {doc['mean']:.3f} -> {args.assets / doc['file']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
