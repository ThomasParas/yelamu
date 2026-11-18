"""Build creeks.json (SFEI's hand-mapped creeks and modelled streams) for a built city.

    uv run python scripts/build_creeks.py ../viewer/public/assets/real-city [--remove]

A thin wrapper: the logic lives in yelamu.creeks (`python -m yelamu.creeks` works too). Run it
after build_overlay.py and build_shade.py: a city rebuild rewrites meta.json and drops the creek keys.
"""

from yelamu.creeks import main

if __name__ == "__main__":
    raise SystemExit(main())
