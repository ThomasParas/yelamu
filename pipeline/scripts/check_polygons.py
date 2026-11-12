"""Check hand-drawn polygon files (validity, provenance, area, bbox, overlaps).

    uv run python scripts/check_polygons.py FILE... --region regions/full-city.json

A thin wrapper: the logic lives in yelamu.handcheck. Exit code 1 on any problem.
"""

from yelamu.handcheck import main

if __name__ == "__main__":
    raise SystemExit(main())
