"""Provenance helpers: every hand-drawn input carries a source and a confidence.

The honesty rule of the project: hand-drawn polygons, landforms and ponds must say
where they came from (`source`, at most 200 characters) and how sure we are
(`confidence`, one of yelamu.export.CONFIDENCE_LEVELS). The build rejects inputs without
them, and records what was used in meta.json (`hand_sources`) and in the layers list.
"""

from __future__ import annotations

from typing import Any, Iterable

from yelamu.export import CONFIDENCE_LEVELS

MAX_SOURCE_CHARS = 200
MAX_LAYER_SOURCE_CHARS = 300
# Lowest first: the confidence of a group of things is that of its weakest member.
_RANK = {"illustrative": 0, "inferred": 1, "documented": 2}


def provenance_problem(properties: Any) -> str | None:
    """Why `properties` has no valid provenance, or None when it is fine."""
    props = properties if isinstance(properties, dict) else {}
    source = props.get("source")
    if not isinstance(source, str) or not source.strip():
        return "properties.source is missing or blank (say where this was traced from)"
    if len(source.strip()) > MAX_SOURCE_CHARS:
        return f"properties.source is longer than {MAX_SOURCE_CHARS} characters"
    confidence = props.get("confidence")
    if confidence not in CONFIDENCE_LEVELS:
        return (f"properties.confidence must be one of {', '.join(CONFIDENCE_LEVELS)}, "
                f"got {confidence!r}")
    return None


def lowest_confidence(levels: Iterable[str]) -> str:
    """The weakest of the given confidence levels (illustrative < inferred < documented)."""
    levels = list(levels)
    if not levels:
        raise ValueError("no confidence levels given")
    for level in levels:
        if level not in _RANK:
            raise ValueError(f"unknown confidence {level!r}")
    return min(levels, key=_RANK.__getitem__)


def layer_source_summary(prefix: str, sources: Iterable[str]) -> str:
    """'<prefix> from N sources: A; B' (distinct, sorted), cut to 300 characters."""
    distinct = sorted({s.strip() for s in sources})
    n = len(distinct)
    text = f"{prefix} from {n} source{'' if n == 1 else 's'}: " + "; ".join(distinct)
    if len(text) > MAX_LAYER_SOURCE_CHARS:
        text = text[: MAX_LAYER_SOURCE_CHARS - 3] + "..."
    return text


def hand_source_rows(layer: str, items: Iterable[tuple[str, str]]) -> list[dict]:
    """One {"layer","source","confidence","count"} row per distinct (source, confidence)."""
    counts: dict[tuple[str, str], int] = {}
    for source, confidence in items:
        key = (source.strip(), confidence)
        counts[key] = counts.get(key, 0) + 1
    return [
        {"layer": layer, "source": s, "confidence": c, "count": n}
        for (s, c), n in sorted(counts.items())
    ]
