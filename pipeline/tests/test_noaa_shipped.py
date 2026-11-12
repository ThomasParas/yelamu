"""The shipped NOAA seeds and generated hand-water files are consistent with the region file."""

import importlib.util
import sys
from pathlib import Path

from yelamu.handcheck import check_file
from yelamu.sources import load_features

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "import_noaa.py"


def _load():
    spec = importlib.util.spec_from_file_location("import_noaa", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["import_noaa"] = mod
    spec.loader.exec_module(mod)
    return mod


import_noaa = _load()


def test_full_city_region_lists_the_generated_files_after_the_hand_files():
    from yelamu.noaa import load_seed_file
    from yelamu.region import load_region

    pipeline = SCRIPT.parent.parent
    region = load_region(pipeline / "regions" / "full-city.json")
    for paths, cls in ((region.hand_bay, "bay"), (region.hand_marsh, "marsh")):
        names = [Path(p).name for p in paths]
        assert names == [f"hand_{cls}.geojson", import_noaa.OUTPUT_FILES[cls]]
        generated = pipeline / paths[-1]
        load_features(generated, allow_empty=True, require_provenance=True)
        assert check_file(generated, region.bbox).ok
    seeds = load_seed_file(pipeline / "data" / "full-city" / "hand" / "noaa_seeds.json",
                           region.bbox)
    assert seeds.seeds
