"""Georeference a scanned map sheet from ground control points.

    uv run python scripts/georeference.py SCAN.tif GCPS.csv --bbox W S E N --cell 5 \
        --order 2 --max-rms-m 25 --out OUT.tif [--report report.txt]

A thin wrapper: the logic lives in yelamu.georef (`python -m yelamu.georef` works too).
"""

from yelamu.georef import main

if __name__ == "__main__":
    raise SystemExit(main())
