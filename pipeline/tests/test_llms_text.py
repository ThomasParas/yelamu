"""llms-full.txt is built from the map's own data and the committed file is up to date."""

import json
import re
from pathlib import Path

from yelamu.llms_text import (
    CONFIDENCE_MEANING,
    LLMS_FULL_FILE,
    SITE,
    build_llms_full,
    main,
)

PIPELINE = Path(__file__).resolve().parent.parent
VIEWER = PIPELINE.parent / "viewer"
ASSETS = VIEWER / "public" / "assets" / "real-city"
PUBLIC = VIEWER / "public"

META = {
    "layers": [{"id": "water", "source": "SFEI historical ecology", "confidence": "documented", "attribution": "SFEI"}],
    "hand_sources": [{"layer": "creeks", "source": "SFEI creeks", "confidence": "inferred", "count": 2}],
}
OVERLAY = {
    "hotspots": [
        {
            "id": "lake-one", "name": "Lake One", "kind": "lake", "lon": -122.5, "lat": 37.75,
            "description": "A lake.", "confidence": "documented",
            "sources": [{"title": "SFEI", "url": "https://example.org/a"}],
        }
    ],
    "villages": [
        {"id": "village-x", "name": "X", "lon": -122.4, "lat": 37.7, "description": "A village site.",
         "confidence": "inferred", "sources": []}
    ],
    "landmarks": [{"id": "pier", "name": "Pier", "kind": "other", "lon": -122.39, "lat": 37.8}],
}


def test_lists_every_place_with_position_and_deep_link():
    text = build_llms_full(META, OVERLAY)
    assert "- Lake One (lake; 37.7500, -122.5000; Documented). Link: " + SITE + "#p=lake-one" in text
    assert "  A lake." in text
    assert "  Sources: SFEI (https://example.org/a)" in text
    assert "- X (37.7000, -122.4000; Inferred). Link: " + SITE + "#p=village-x" in text
    assert "- Pier (other; 37.8000, -122.3900). Link: " + SITE + "#p=pier" in text


def test_lists_layers_and_hand_sources():
    text = build_llms_full(META, OVERLAY)
    assert "- water: SFEI historical ecology (Documented). Credit: SFEI." in text
    assert "- creeks (Inferred, 2): SFEI creeks" in text


def test_a_layer_with_hand_source_rows_points_to_them_instead_of_a_shortened_text():
    meta = {
        "layers": [{"id": "ponds", "source": "20 ponds from 5 sources: a; b...", "confidence": "inferred", "attribution": "x"}],
        "hand_sources": [{"layer": "ponds", "source": "a lake surface", "confidence": "inferred", "count": 3}],
    }
    text = build_llms_full(meta, OVERLAY)
    assert "- ponds: each source is listed below (Inferred). Credit: x." in text
    assert "b..." not in text
    assert "- ponds (Inferred, 3): a lake surface" in text


def test_is_deterministic_and_ends_with_a_newline():
    assert build_llms_full(META, OVERLAY) == build_llms_full(META, OVERLAY)
    assert build_llms_full(META, OVERLAY).endswith("\n")


def test_confidence_wording_is_the_viewers():
    source = (VIEWER / "src" / "confidence.ts").read_text()
    for _name, meaning in CONFIDENCE_MEANING:
        assert meaning + "." in source


def test_committed_file_matches_the_data():
    meta = json.loads((ASSETS / "meta.json").read_text())
    overlay = json.loads((ASSETS / meta["overlay_file"]).read_text())
    expected = build_llms_full(meta, overlay)
    committed = (PUBLIC / LLMS_FULL_FILE).read_text()
    assert committed == expected, (
        "viewer/public/llms-full.txt is out of date: run "
        "`uv run python scripts/build_llms_full.py ../viewer/public/assets/real-city ../viewer/public/llms-full.txt`"
    )


def test_every_shipped_place_is_in_the_committed_file():
    overlay = json.loads((ASSETS / "overlay.json").read_text())
    committed = (PUBLIC / LLMS_FULL_FILE).read_text()
    for key in ("hotspots", "villages", "landmarks"):
        for p in overlay[key]:
            assert f"#p={p['id']}" in committed


def test_llms_txt_sitemap_and_robots_agree():
    llms = (PUBLIC / "llms.txt").read_text()
    assert llms.startswith("# Yelamu\n")
    assert SITE + LLMS_FULL_FILE in llms
    robots = (PUBLIC / "robots.txt").read_text()
    assert f"Sitemap: {SITE}sitemap.xml" in robots
    assert f"<loc>{SITE}</loc>" in (PUBLIC / "sitemap.xml").read_text()


def _index_html() -> str:
    return (VIEWER / "index.html").read_text()


def test_index_html_counts_match_the_overlay():
    overlay = json.loads((ASSETS / "overlay.json").read_text())
    html = _index_html()
    assert f"{len(overlay['landmarks'])} modern landmarks" in html
    assert f"about {len(overlay['hotspots'])} landscape features" in html
    assert len(overlay["villages"]) == 5 and "the five primary Yelamu villages" in html


def test_index_html_json_ld_parses_and_names_the_site():
    match = re.search(r'<script type="application/ld\+json">(.*?)</script>', _index_html(), re.S)
    assert match, "no JSON-LD block in viewer/index.html"
    doc = json.loads(match.group(1))
    assert {node["@type"] for node in doc["@graph"]} == {"WebApplication", "Dataset"}
    assert all(node["license"] == "https://www.gnu.org/licenses/gpl-3.0.html" for node in doc["@graph"])
    app = next(n for n in doc["@graph"] if n["@type"] == "WebApplication")
    assert app["url"] == SITE


def test_cli_writes_the_file(tmp_path):
    out = tmp_path / "llms-full.txt"
    assert main([str(ASSETS), str(out)]) == 0
    assert out.read_text() == (PUBLIC / LLMS_FULL_FILE).read_text()


def test_cli_reports_a_missing_folder(tmp_path, capsys):
    assert main([str(tmp_path / "nope"), str(tmp_path / "x.txt")]) == 1
    assert "error:" in capsys.readouterr().err
