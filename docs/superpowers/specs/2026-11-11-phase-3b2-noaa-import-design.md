# Yelamu Phase 3b-2 (NOAA Shoreline Import) — Design

**Date:** 2026-11-11
**Status:** Approved design; plan to follow
**Builds on:** Phase 3b-1 (hand-water files with required provenance, comparison tool, ponds). Supersedes the "coverage not found" findings in the 3b spec.

## 1. Goal

Replace the modern ground that the map still shows in the south-east and north waterfront (fill, drained marsh and creek channels) with water and marsh read from NOAA's 1850s survey linework, every polygon carrying its sheet, year and confidence.

## 2. Decisions

| Question | Decision |
|---|---|
| Route | **Vectors first**: import NOAA's already-extracted shoreline lines (owner's choice). Scans and hand tracing stay the fallback for what the vectors do not cover |
| Water or land | **Seed points the owner confirms** (owner's choice). The importer closes the linework into numbered candidate areas; an areas file of seeds (lon, lat, bay / marsh / land, source, confidence) assigns each area its class. Unseeded areas are reported and left unchanged |
| Output | The hand-water GeoJSON files the build already reads (provenance mandatory), generated into separate NOAA files so the owner's own tracing stays separate |
| Viewer | No logic change; a NOAA credit line is added to the Credits list |
| Licence | NOAA states **no access constraints** and asks for credit; "not for litigation or navigation". The derived polygons may be committed; the downloaded zips stay under the gitignored `pipeline/data/raw/` |

## 3. Source findings (discovery, 2026-11-11)

NOAA's Shoreline Data Explorer serves a T-sheet index (vector tiles, `nsde.ngs.noaa.gov/tsheets/tsheetidx/{z}/{x}/{y}.pbf`) with one record per survey, and **vector project zips at a fixed URL** (`nsde.ngs.noaa.gov/downloads/<PROJECT>.zip`, a few hundred KB each). The index also lists a georeferenced scan and world file for every survey (`nosimagery.noaa.gov/images/shoreline_surveys/scans/`, not downloaded).

San Francisco 1850s projects (55 surveys overlap the city; these are the pre-1860 vectors):

| Project | Sheets (survey year) | Covers | Zip |
|---|---|---|---|
| CA37A02 | T-00352 (1852) San Francisco and its vicinity; T-00382 (1852) Point Lobos southward; T-00314 (1851), T-00321 (1850), T-00334 (1851), T-00361 (1852) | the east side of the peninsula down to lat 37.69, the west coast, the Golden Gate | 110 KB |
| CA37B02B | T-00433 (1853), T-00460 (1854) | Hunters Point south to San Mateo | 621 KB |
| CA37B07 | T-00398 (1853) | north waterfront, Yerba Buena Cove, Mission Bay | 48 KB |
| CA37B08 | T-00687 (1857) | the city and its vicinity | 90 KB |

All four were downloaded with the owner's approval (870 KB in total) into `pipeline/data/raw/noaa/zips/` and unpacked into `pipeline/data/raw/noaa/extracted/<PROJECT>/` (gitignored). Later surveys exist (1873 to 1882: CA37C05 and others; 1929 onward) and are not used: by then fill had changed the shore.

What the real files contain (inspected): **polylines only**, NAD83, one layer `historicl1` (shoreline) and one `projbnd` (project boundary). Attributes per line: `ATTRIBUTE` (`Natural.Mean High Water`, `Natural.Apparent.Marsh Or Swamp`, `Man-made`, `Man-made.Wharf Or Quay`, `Undetermined Alongshore Feature`, `Shoreline/Alongshore Feature Boundary`, `Undetermined.Approximate`, `User Added Line`), `SOURCE_ID` (the T-sheet), `SRC_DATE`. `HOR_ACC` is `0` (accuracy not determined). The lines are doubled where sheets overlap, include creek meanders, and `User Added Line` marks closures added by NOAA's digitisers at sheet edges. Overlaid on the current reconstruction the mean-high-water lines clearly show the 1850s Mission Bay, Islais Creek and Hunters Point shores where the reconstruction still draws modern ground.

**Not covered by these vectors:** Yerba Buena and Treasure Island (the 1857 vector stops at longitude -122.382, west of the islands). The georeferenced scan of T-00687 may show them; tracing from it is outside this plan.

## 4. Parts

**A. Importer** (`yelamu/noaa.py`, `scripts/import_noaa.py`): read project zips' `historicl1` and `projbnd` with pyshp (already a dependency); select line classes by a configurable list (default: mean high water, marsh edge, user-added closures, alongshore-feature boundary; wharves and other man-made lines excluded because they stand over water); transform to UTM; node the linework and add the project boundary as a frame; close gaps within a snap tolerance; polygonise; drop slivers below a minimum area; give every area a stable id (project plus ordinal by centroid).

**B. Seeds and output**: `data/full-city/hand/noaa_seeds.json` lists seeds (`id`, `lon`, `lat`, `class` bay | marsh | land, `source`, `confidence`, optional `note`). Every area containing a seed takes its class; two seeds with different classes in one area, or a seed in no area, are errors. Bay and marsh areas are written to `hand_bay_noaa.geojson` and `hand_marsh_noaa.geojson` with `properties.source` of the form "NOAA Shoreline Data Rescue Project, <project>, sheet <T-xxxxx> (<year>), mean high water line; area classed by seed <id>" (at most 200 characters) and confidence `inferred`; land areas are not written (they are the default). Unseeded areas are listed with their ids, area and centroid.

**C. Review aids**: a preview PNG (areas numbered and coloured by class, source lines drawn by class, scale bar and ticks) and a text report; the Phase 3b-1 comparison tool then shows the result against the rebuilt reconstruction.

**D. Wiring and checks**: the region file lists the NOAA files after the hand files; `checks.json` gains expectations on known places (water where the 1850s shore was, land on the hills beside it); the Credits list gains the NOAA credit.

## 5. Out of scope
Treasure Island and Yerba Buena Island; scans and georeferencing of any sheet; surveys after 1860; automatic water/land classification; the cultural layer; hosting.

## 6. Testing
- Pure geometry (noding, gap closing, polygonising, sliver removal, seeding, ids, provenance text) tested on synthetic linework with known truth: a closed lake, a gap, doubled lines, a creek, a frame-closed bay, ambiguous seeds.
- The real files are run through the importer in a scratch copy, previews inspected, seeds chosen with the owner, and the rebuilt city checked in the browser and with the comparison tool.
- **Not verifiable:** the positional accuracy of the 1850s lines (NOAA states it has not been determined) and how much of the 1850s shore is already altered by the first fill; both are recorded as `inferred`, never `documented`.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Linework does not close into clean areas (gaps, overlaps, double lines) | Snap tolerance, frame, sliver filter, preview image with numbered areas; unresolved areas are reported, never guessed |
| By the 1850s some shore was already filled or wharfed | Wharf and man-made lines excluded; sheets compared against 1769 knowledge by the owner when choosing seeds; confidence stays `inferred` |
| Sheet-to-sheet disagreement (doubled lines from overlapping surveys) | Both sheets' lines enter the noding; the owner chooses seeds on the preview, and the source text names the sheet of the area's seed |
| Seeds chosen wrongly flood land or fill water | Preview plus comparison tool before the build; `check_polygons` on the output; sanity checks on known places |
