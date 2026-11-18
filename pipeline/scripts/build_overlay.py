"""Build overlay.json (modern streets, landmarks, hotspots, village sites) for a built region.

    uv run python scripts/build_overlay.py --region regions/full-city.json [--tiger PATH]
        [--landmarks PATH] [--hotspots PATH] [--villages PATH] [--out DIR]

A thin wrapper: the logic lives in yelamu.overlay (`python -m yelamu.overlay` works too).
"""

from yelamu.overlay import main

if __name__ == "__main__":
    raise SystemExit(main())
