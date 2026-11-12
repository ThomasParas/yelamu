# Phase 3 results (the experience), 2026-11-11

Executed from `docs/superpowers/plans/2026-11-11-phase-3-experience.md`: pipeline 167 to 268 tests, viewer 93 to 479 tests, one commit per task (`0221ad7` through `88d7cfc`). The files were applied mechanically in plan order from the verified scratch copies, with every red-then-green step and every stated count checked, and the typecheck and build clean at each step.

> **Licensing gate.** The real-city assets and everything shown below come from the SFEI habitat layer, which still has no stated license. They are gitignored (`viewer/public/assets/real*/`, `docs/research/local/`, `pipeline/data/raw/`). The license inquiry was sent; no reply is recorded.

## How to reproduce

```bash
cd pipeline
uv run python -m yelamu.cli --region regions/full-city.json                 # terrain + habitat (Phase 2)
uv run python scripts/build_overlay.py --region regions/full-city.json       # overlay.json (needs data/raw/tiger/extracted)
uv run python scripts/verify_overlay_data.py ../viewer/public/assets/real-city
cd ../viewer && npx vite --port 5199                                          # open /?data=real-city&debug
```

If `vite` crashes with `fsevents.watch is not a function`, see Addendum A6 of the Phase 0+1 plan.

## Numbers

| Measurement | Plan's prototype | This run (repo build) |
|---|---|---|
| Overlay build | 1.1 s; 328 KB raw, 102 KB gzipped; 2,493 streets (8 / 40 / 2,445), 3,659 polylines, 13,219 points; 38 landmarks; 11 hotspots | identical; re-run byte-identical; `overlay.json` 328,243 bytes, 102,579 gzipped |
| Cross-check script | exit 0 | exit 0 |
| Frame time, real city, zoom 7, panning, 1.2 s windows right after a user action | 8.9 / 8.5 / 8.2 / 10.8 ms | **8.3 ms median in all four** (n about 140 per window, display-limited at 120 Hz) |
| Triangles in those windows | 655 k to 1.0 M | 655 k (all layers off and streets/labels), 1.42 M (+ vegetation), 1.25 M (+ animated water) |
| Debug overlay while searching and viewing Mission Bay | n/a | 112 fps, frame-gap p90 6.3 ms, 15,378 plants in 31 meshes |
| Phone | not measured | **not measured** (protocol in `phone-measurement.md`) |

The four configurations were: (1) all optional layers off, (2) plus streets, landmark labels and hotspots, (3) plus vegetation, (4) plus animated water. The Browser pane throttles itself to roughly one frame per second after a fraction of a second of script-driven activity, so each window was preceded by a screenshot (a real user action) and kept short.

## Checklist (Task 12, Step 2)

Run in a real browser on the repo build, real city unless noted.

| # | Check | Result |
|---|---|---|
| 1 | About on a first visit: opens, focus on "Explore the map", Esc closes, "seen" flag set | **pass** (checked by asking the page: `dialog.open` true, focused "Explore the map"; after Esc, closed and flag `1`) |
| 2 | Streets draped, readable | **pass** visually (dark slate lines over dunes and woodland, following the hills). Behaviour across the LOD switch was checked in the prototype, not repeated here |
| 3 | Labels and markers | **pass** visually. The 44 px touch hit area could not be measured from script |
| 4 | Search "mission": Mission Bay hotspot first; Enter flies there and opens its panel (Documented badge, source link); URL gains `p=mission-bay` | **pass** |
| 5 | Panels open one at a time; Places lists all places | **pass**: Places listed 11 hotspots and 38 landmarks as 50 buttons (49 places plus the close button counted by the script; the extra is the panel's close control) |
| 6 | Share links: a hash restores the view; layers in the hash | **pass** (views restored from `#x=..&z=..&k=..&r=..&l=..`; `#l=` leaves every optional layer off) |
| 7 | Camera: rotation, reset, keyboard | **partly checked here**: rotation restored from `r=1` in the hash. Q/E, H and arrow keys were checked on the foundation prototype and not re-run on this build |
| 8 | Vegetation | **pass**: trees in woodland patches, sparse scrub on dunes; toggles on and off |
| 9 | Water: shader compiles, no console errors | **pass**. Reduced-motion behaviour **not tested** (the Browser pane cannot emulate the setting) |
| 10 | Quality controller | **pass**: fed sustained slow frames, the level dropped 2 to 1 and "Reduced effects to keep the map smooth" was announced in the live region |
| 11 | Dataset without habitat or overlay (the demo default) | **pass**: loads with a Menu, no console errors |
| 12 | Phone layout, 375 px | **pass**: bar 62 px (was 143), Menu button present, search field 44 px, no horizontal scroll |
| 13 | Keyboard and screen reader | **partly checked**: canvas has `role="img"` and `tabindex="0"`, a skip link exists, `lang="en"`, the live region carries status and the quality message. Visible focus rings and screen-reader output were **not** verified |

No console errors in any of the above.

## What still needs a person

1. **Owner review of the About text** (`viewer/src/ui/about.ts`). It speaks for the project and names the Ramaytush Ohlone; read it, and ideally have the Association's contact read it, before anything is public.
2. **Owner review of the hotspot descriptions** (`pipeline/data/overlay/hotspots.json`, Task 2 Step 5 of the plan). Only 3 of the 11 were re-checked against the live pages (two matched, one clause removed). The other eight rest on the prototype's research.
3. **Phone measurement** (`phone-measurement.md`). Vegetation starts off on touch devices until there are numbers.
4. **Screen-reader and focus-ring pass** with real assistive technology.
5. **Reduced-motion** in a real browser with the OS setting on (the water toggle should be disabled with an explanation).

## Observations worth a follow-up

- **Water stripe pattern.** On the flat demo bay the animated water reads as a fairly regular diagonal stripe. `WAVE_SLOPE` in `viewer/src/water/waterMaterial.ts` (0.18) is the knob if you want it subtler.
- **Street colour.** Dark slate is the contrast-tested choice; it is lower-contrast over dense woodland (about 2.4 to 1) than over sand (about 10 to 1). It is one constant, `STREET_COLOR`.
- **Hotspot positions are approximate** (Laguna Honda by about 300 m), and several landmarks stand on later fill, so their labels sit in the water of the 1769 map. That is deliberate, but it can surprise people.

## Decision: **Go**

The experience works end to end on the real city at the display's refresh rate with every effect on, and the safety nets (quality controller, one-panel-at-a-time, graceful datasets) behave. Next, in order:

1. The independent review of the whole phase (read-only), then fix what it finds.
2. The owner reviews above, and the phone measurement.
3. Phase 3b (data authenticity: the south-east, Treasure Island, lost landforms, ponds) and the SFEI reply, which gate any public launch.
