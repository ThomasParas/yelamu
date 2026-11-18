# Village sites: the five primary Yelamu villages

Status: design approved by the owner 2026-11-18 (conversation); wording approved verbatim the same day. Next: the plan in `docs/superpowers/plans/2026-11-18-village-sites.md`.

## Why

The map labels modern places (Fort Mason, City Hall, the Chase Center) and said nothing about the people who lived on this land. The owner considers that erasure. SFEI's Hidden Nature SF published the general locations of the five primary Yelamu villages (story map "Yelamu: the Native Peoples of San Francisco", Jan 2026), so the map marks the same five, in the same general way.

## Decisions already made

1. **Five villages only,** SFEI's names and spellings: Sitlintac and Chutchui (along Mission Creek), Amuctac and Tubsinte (around Visitacion Valley), Petlenuc (in the Presidio near Crissy Field). SFEI calls them the primary villages and says others existed; the map never says "all".
2. **General locations, drawn as soft circles about the size SFEI draws them** (radius about 530 m), plus a text label. No icons, figures, trails, burial or sacred sites, population numbers, or villages outside San Francisco. Anything more needs the Association of Ramaytush Ohlone.
3. **Own layer toggle, "Village sites", on by default,** separate from Landmarks and Hotspots.
4. **Published without waiting for the Association's reply** (owner decision, knowing that SFEI's licence reply advised asking the Association first). The emails to SFEI and the Association say so plainly. Removal must stay easy: deleting `pipeline/data/overlay/villages.json` and rebuilding the overlay removes every trace.
5. **Confidence "Inferred".** The positions are digitised from SFEI's story-map picture, not from SFEI point data (none is published; the owner is asking SFEI for it).

## Data

- Source of truth: `pipeline/data/overlay/villages.json`, one record per village: `id` (`village-<name>`), `name`, `lon`, `lat`, `radius_m`, `description`, `sources` (title + http(s) URL), `confidence`. Same validation rules as hotspots (description 20 to 400 characters, at least one source, confidence one of the three tags), plus `radius_m` between 100 and 2000, and ids unique across landmarks, hotspots and villages.
- Built into `overlay.json` as a new optional `villages` array (same shape as a hotspot, `kind` omitted, plus `radius_m`), with the viewer-frame `x`, `z`. Overlay version stays 1; a file without `villages` still loads.
- Positions: the owner's screenshot of SFEI's village map was aligned to this project's own 1769 land mask (north-up, scale 10.95 m per pixel, 96 percent overlap on the Pacific and Golden Gate coast), and the five disc centres were read off. Rounded to 4 decimal places (about 10 m); real accuracy is about 150 m, well inside a 1 km circle. Method and numbers go in `docs/research/village-sites-results.md`.
- `build_overlay` also patches `meta.json`: `overlay_villages` (count) and one `hand_sources` row (layer `villages`) so the Sources panel lists the layer. A city rebuild drops both; rerun `build_overlay.py` afterwards (the README already says so for the overlay).

## Viewer

- Parse: `overlay.villages` (optional, default empty), validated like hotspots plus `radius_m`.
- Draw: a draped, translucent disc and outline per village, in a warm tan taken from SFEI's own colour, brighter when selected; pure geometry builder (tested in node) plus a small layer class. No change to terrain or vegetation code.
- Label: its own label kind `village`, shown whenever the layer is on.
- Panel: selecting a village (label, search, Places, or `p=` link) opens the existing hotspot panel with kind text "Village site", the card text, the confidence badge and the sources.
- Search group `village` ("Village site"), Places group "Village sites", fly to zoom 5.
- Toggle `villages`, default on. A share link made before this layer existed and carrying an explicit `l=` list will not show it until the visitor turns it on; accepted.
- Legend symbol row, About sentence and Sources row appear only when the dataset has villages (`meta.overlay_villages > 0`), so datasets without them keep today's text.

## Approved wording (owner, 2026-11-18; use verbatim)

- **Legend row:** "General locations of the five primary Yelamu villages around the time of Spanish contact. Approximate."
- **Card text** (per village, `{place}` = "along Mission Creek" for Sitlintac and Chutchui, "around Visitacion Valley" for Amuctac and Tubsinte, "in the Presidio near Crissy Field" for Petlenuc): "General location of a Yelamu village site {place}, around the time of Spanish contact. Approximate: villages were places and the people who lived there, and they moved seasonally and over time. Source: SFEI Hidden Nature SF, after Milliken (1983, 1995) and the National Park Service (2009)."
- **About** (replaces "This map shows land and water only. It does not depict villages, people or sacred sites." when villages are present): "The map marks the general locations of the five primary Yelamu villages named by SFEI's Hidden Nature SF, because leaving them out would erase the people who lived here. The locations are approximate. The map does not depict people, and it does not show burial or sacred sites."
- **Sources row, "Village sites", confidence Inferred:** "General locations from SFEI's Hidden Nature SF story map 'Yelamu: the Native Peoples of San Francisco' (2026), after Milliken (1983, 1995) and the NPS (2009). Approximate."

## Risks

- Circles drawn too large or in the wrong place: checked by overlaying them on our map and comparing with SFEI's picture.
- Contrast: the Visual Improvements session is darkening shaded ground; circles and labels must stay readable (`uiColors.test.ts`).
- The shared files (`overlayModule.ts`, `legend.ts`, `about.ts`) are also touched by the other session: keep edits small.
- Cost: five discs of a few hundred triangles each; bench A to E before merging.

## Testing

Pipeline: validation, id clashes, projection to world coordinates, meta patch idempotence, shipped-data check. Viewer (node): parse, disc geometry, label kinds, search and Places groups, Legend/About/Sources text equal to the approved strings. Browser: circles on the map versus SFEI's picture, toggle, card, search, share link, desktop and phone width, axe.
