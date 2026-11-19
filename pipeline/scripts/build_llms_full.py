"""Write viewer/public/llms-full.txt from the built map data. Run after build_overlay.py.

    uv run python scripts/build_llms_full.py ../viewer/public/assets/real-city ../viewer/public/llms-full.txt
"""

from yelamu.llms_text import main

if __name__ == "__main__":
    raise SystemExit(main())
