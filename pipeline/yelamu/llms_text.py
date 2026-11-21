"""The plain-text description of the map for people and language models (`llms-full.txt`).

Built from the same `meta.json` and `overlay.json` the viewer loads, so it cannot drift from the
map: a test fails when the committed file differs from what this module produces. The framing
text is owner-approved wording (2026-11-18); the card texts are copied unchanged from the
overlay.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Sequence

SITE = "https://yelamu.thomasparas.com/"
REPO = "https://github.com/ThomasParas/yelamu"
LLMS_FULL_FILE = "llms-full.txt"

# Wording approved by the owner on 2026-11-18 (see docs/research/llm-metadata-draft.md).
SUMMARY = (
    "Yelamu is an interactive 3D map of the San Francisco peninsula as its land and water may have "
    "lain around 1769, the homeland of the Ramaytush. It is a reconstruction from modern "
    "elevation data, SFEI historical ecology and 1850s NOAA shoreline maps. Every layer states its "
    "source and how sure we are (Documented, Inferred or Illustrative). It is not a survey, and it "
    "is not for navigation, engineering or legal use."
)

CAVEATS = (
    "It is an informed reconstruction, not a photograph or a survey.",
    "The five village sites are general locations named by SFEI's map; they are approximate, and the "
    "names and spellings are not official. The map does not depict people and does not show burial "
    "or sacred sites.",
    "The Ramaytush are a living community. To learn from them directly, see the Association "
    "of Ramaytush Ohlone: https://www.ramaytush.org/",
    "The word Yelamu comes from the Mission Dolores registers, where it names a place, probably a "
    "village, whose location is unknown; Randall Milliken (1995) used it as a cover term for the "
    "villages and territory of what is now San Francisco County. It is the title of this map, not a name for the "
    "people, who are the Ramaytush (source: https://www.ramaytush.org/terminology.html).",
    "Modern landmarks (Ferry Building, Oracle Park and so on) are labelled for orientation; several "
    "stand where this map draws water.",
    "The grey ground beyond the mapped area is today's terrain, not a reconstruction.",
)

CONFIDENCE_MEANING = (
    ("Documented", "Stated by a cited source"),
    ("Inferred", "Reconstructed by this project from other data"),
    ("Illustrative", "Drawn to give an impression, not a record"),
)  # the viewer's own wording: viewer/src/confidence.ts

LICENCE = (
    "The code and the data behind this map are free software under the GNU General Public License, "
    "version 3 or any later version: " + REPO,
    "San Francisco Historical Habitats is part of Hidden Nature SF, which is free data under the GNU "
    "General Public License, version 3 or (at your option) any later version. It is distributed in "
    "the hope that it will be useful, but without any warranty. SFEI data are available without "
    "restriction upon use with these caveats: prudent usage, knowledge of the data quality and "
    "professional courtesy should be considered. The data are not a survey document, so they must "
    "not be used as one or beyond the limits of the source scale. Questions about SFEI data can go "
    "to the SFEI GIS team at eigis@sfei.org.",
)

CREDITS = (
    "San Francisco Estuary Institute. 2021. Hidden Nature SF, version 1.0. https://hidden-nature.org/",
    "U.S. Geological Survey 3D Elevation Program.",
    "U.S. Census Bureau TIGER/Line.",
    "NOAA National Geodetic Survey, Shoreline Data Rescue Project (historical shoreline vectors, 1850s).",
    "three.js.",
)


def _confidence(value: Any) -> str:
    return str(value).capitalize() if isinstance(value, str) and value else "Unrated"


def _position(place: dict) -> str:
    return f"{place['lat']:.4f}, {place['lon']:.4f}"


def _link(place: dict) -> str:
    return f"{SITE}#p={place['id']}"


def _card_lines(place: dict, with_kind: bool) -> list[str]:
    head = f"- {place['name']} ("
    if with_kind:
        head += f"{place['kind']}; "
    head += f"{_position(place)}"
    if "confidence" in place:
        head += f"; {_confidence(place['confidence'])}"
    head += f"). Link: {_link(place)}"
    lines = [head]
    if place.get("description"):
        lines.append(f"  {place['description']}")
    sources = place.get("sources") or []
    if sources:
        lines.append("  Sources: " + "; ".join(f"{s['title']} ({s['url']})" for s in sources))
    return lines


def build_llms_full(meta: dict, overlay: dict) -> str:
    """The text of `llms-full.txt` for this dataset. Pure: same inputs, same text."""
    out: list[str] = ["# Yelamu: full description", "", f"> {SUMMARY}", "", f"Map: {SITE}", ""]

    out += ["## Things to know when describing this map", ""]
    out += [f"- {c}" for c in CAVEATS]
    out += ["", "## How sure are we", ""]
    out += [f"- {name}: {meaning}." for name, meaning in CONFIDENCE_MEANING]

    out += ["", "## Layers", ""]
    hand = meta.get("hand_sources", [])
    listed_below = {row["layer"] for row in hand}
    for layer in meta.get("layers", []):
        # meta.json shortens a layer's source text with "..."; the full entries are listed below.
        source = "each source is listed below" if layer["id"] in listed_below else layer["source"]
        out.append(
            f"- {layer['id']}: {source} ({_confidence(layer['confidence'])}). "
            f"Credit: {layer['attribution']}."
        )
    if hand:
        out += ["", "### Hand-drawn, hand-sculpted and added layers", ""]
        for row in hand:
            out.append(
                f"- {row['layer']} ({_confidence(row['confidence'])}, {row['count']}): {row['source']}"
            )

    hotspots = overlay.get("hotspots", [])
    villages = overlay.get("villages", [])
    landmarks = overlay.get("landmarks", [])
    out += ["", f"## Hotspots ({len(hotspots)} landscape features with a card)", ""]
    for p in sorted(hotspots, key=lambda p: p["name"]):
        out += _card_lines(p, with_kind=True)
    out += ["", f"## Village sites ({len(villages)}; general locations, approximate)", ""]
    for p in sorted(villages, key=lambda p: p["name"]):
        out += _card_lines(p, with_kind=False)
    out += ["", f"## Landmarks ({len(landmarks)}; modern, for orientation)", ""]
    for p in sorted(landmarks, key=lambda p: p["name"]):
        out += _card_lines(p, with_kind=True)

    out += ["", "## Licence and attribution", ""]
    out += [f"- {t}" for t in LICENCE]
    out += ["", "### Credits", ""]
    out += [f"- {c}" for c in CREDITS]
    out += ["", f"Sources and their terms: {REPO}/blob/main/NOTICE.md", "Built by Thomas Paras: https://thomasparas.com/", ""]
    return "\n".join(out)


def build(assets: Path, out_file: Path) -> str:
    meta = json.loads((assets / "meta.json").read_text())
    overlay = json.loads((assets / meta["overlay_file"]).read_text())
    text = build_llms_full(meta, overlay)
    out_file.write_text(text)
    return text


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write llms-full.txt from meta.json and overlay.json.")
    parser.add_argument("assets", type=Path, help="the real-city assets folder")
    parser.add_argument("out", type=Path, help="where to write llms-full.txt (viewer/public/llms-full.txt)")
    args = parser.parse_args(argv)
    try:
        text = build(args.assets, args.out)
    except (OSError, ValueError, KeyError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"wrote {args.out} ({len(text.splitlines())} lines)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
