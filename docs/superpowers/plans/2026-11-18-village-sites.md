# Village sites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Design: `docs/superpowers/specs/2026-11-18-village-sites-design.md` (read it first; it holds the approved wording, which must be used verbatim).

**Goal:** Mark the five primary Yelamu villages as approximate labelled circles behind their own "Village sites" toggle.

**Architecture:** Villages are a new optional `villages` array in `overlay.json` (hotspot-shaped plus `radius_m`), built by the pipeline from `pipeline/data/overlay/villages.json`. The viewer parses them, draws draped translucent discs, and reuses the existing label, hotspot panel, search, Places and layer-toggle machinery. Legend, About and Sources text appear only when the dataset has villages.

**Tech Stack:** Python (uv, pytest `-W error`, pyproj) pipeline; Vite 8 / TypeScript / Three.js 0.187 / Vitest (node environment, no DOM tests) viewer.

**Working rules (all tasks):**
- Work only in this worktree (`/Users/paras/Documents/Ancient San Francisco/.claude/worktrees/villages`, branch `worktree-villages`). Never touch the main folder; another session is working there on branch `native-plant-shapes`. Do not `git stash`; do not push; do not merge.
- Tests first (write the failing test, see it fail, then implement). One commit per task, message `feat(...)`/`test(...)`/`docs(...)`, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- The wording in the design's "Approved wording" section is owner-approved; copy it exactly into constants and test against the exact strings. Do not reword.
- Follow the existing hotspot code as the pattern in every place. Keep edits to the shared files (`overlayModule.ts`, `ui/legend.ts`, `ui/about.ts`, `modules.ts`, `main.ts`) small.
- `pipeline/data/raw/` is gitignored and absent here. Link it from the main folder: `ln -s "/Users/paras/Documents/Ancient San Francisco/pipeline/data/raw" pipeline/data/raw` (do not commit the link; check `git status`).
- Viewer: `cd viewer && npx vitest run && npx tsc --noEmit`. Pipeline: `cd pipeline && uv run python -m pytest -W error -q`.

---

### Task 1: Pipeline data, overlay builder, meta patch

**Files:**
- Create: `pipeline/data/overlay/villages.json`
- Modify: `pipeline/yelamu/overlay.py`, `pipeline/tests/test_overlay.py` (or a new `pipeline/tests/test_villages.py`), `pipeline/tests/test_context_shipped.py` only if it breaks, `viewer/public/assets/real-city/overlay.json` and `meta.json` (regenerated), `.gitignore` (add `.claude/worktrees/`), `README.md` (rebuild note)
- Create: `docs/research/village-sites-results.md`

- [ ] **Step 1: Data file.** Write `villages.json`: five records, ids `village-sitlintac`, `village-chutchui`, `village-amuctac`, `village-tubsinte`, `village-petlenuc`, `radius_m` 530, `confidence` `inferred`, descriptions built from the approved card text, and positions:

| name | lon | lat | place phrase |
|---|---|---|---|
| Sitlintac | -122.4152 | 37.7714 | along Mission Creek |
| Chutchui | -122.4235 | 37.7619 | along Mission Creek |
| Amuctac | -122.4016 | 37.7238 | around Visitacion Valley |
| Tubsinte | -122.4148 | 37.7109 | around Visitacion Valley |
| Petlenuc | -122.4552 | 37.7978 | in the Presidio near Crissy Field |

Sources for every village (two entries): `{"title": "SFEI Hidden Nature SF: Yelamu: the Native Peoples of San Francisco (story map, 2026)", "url": "https://storymaps.arcgis.com/stories/56b1d134920d46c6ac2462c1344eeb3f"}` and `{"title": "Milliken, Shoup and Ortiz (2009): Ohlone/Costanoan Indians of the San Francisco Peninsula and Their Neighbors, Yesterday and Today (National Park Service report)", "url": "https://digitalcommons.csumb.edu/hornbeck_ind_1/6/"}`.

- [ ] **Step 2: Failing tests** in the overlay test module: `validate_villages` accepts the shipped file; rejects a missing/blank description, a description over 400 characters, no sources, a bad confidence, a `radius_m` below 100 or above 2000 or not a number, a position outside the region bbox; `validate_unique_ids` rejects a village id that equals a landmark or hotspot id; `build_overlay` (use the existing fixtures) emits `villages` sorted by id with `x`, `z`, `radius_m`, `description`, `sources`, `confidence` and no `kind`; a missing villages file gives an empty list (older datasets still build); the meta patch sets `overlay_villages` and upserts exactly one `hand_sources` row with `layer: "villages"`, `source` equal to the approved Sources-row sentence, `confidence: "inferred"`, `count` equal to the number of villages, and running it twice leaves one row.
- [ ] **Step 3: Implement** in `overlay.py`: `validate_villages`, `validate_unique_ids` extended to three lists, `build_overlay(villages_path=...)`, CLI flag `--villages` (default `data/overlay/villages.json`, optional when absent), and the meta patch next to the existing `overlay_file` patch (keep every other meta key, including `context_file` and any `shade` key added by another session).
- [ ] **Step 4: Rebuild** with `uv run python scripts/build_overlay.py --region regions/full-city.json` (needs the raw link). Check `git diff --stat viewer/public/assets/real-city`: `overlay.json` must differ only by the new `villages` array (streets, landmarks, hotspots byte-identical), and `meta.json` only by `overlay_villages` and the new `hand_sources` row. If streets or hotspots changed, stop and report.
- [ ] **Step 5: Shipped-data test:** the committed `overlay.json` has exactly the five village ids, every village inside the city rectangle, radius 530, and every id unique across the three lists.
- [ ] **Step 6: Docs.** `docs/research/village-sites-results.md`: what was drawn and from what; the georeference method and numbers (screenshot alignment to the 1769 land mask, 10.95 m per pixel, 96 percent overlap, centres read from the picture, radius about 527 m, accuracy about 150 m); the sanity distances (Chutchui about 410 m from Mission Dolores; Sitlintac to Chutchui about 1280 m); that SFEI point data was requested; and the removal recipe. README rebuild notes: `build_overlay.py` must be rerun after a city rebuild (already true) and now also restores the villages. `.gitignore`: add `.claude/worktrees/`.
- [ ] **Step 7:** run pipeline tests (`-W error`), then commit.

### Task 2: Viewer types, parsing and meta fields

**Files:** Modify `viewer/src/overlay/types.ts`, `viewer/src/overlay/parse.ts`, `viewer/src/heightmap.ts` (meta type), `viewer/src/provenanceData.ts`; tests beside each.

- [ ] **Step 1: Failing tests.** `parseOverlay` accepts a file without `villages` (empty array) and with the shipped five; rejects a non-array `villages`, a village missing `radius_m` or with a non-finite, negative or over-3000 value, a bad description length, bad sources or confidence, and a duplicate id across landmarks, hotspots and villages; strips unknown fields. `HeightmapMeta` carries an optional numeric `overlay_villages`. `handSourceRows` labels layer `villages` as "Village sites" with count text "5 villages" (singular "1 village").
- [ ] **Step 2: Implement:** `Village` type (all hotspot fields except `kind`, plus `radius_m`), `Overlay.villages`, `parseVillages` sharing the hotspot helpers (do not copy-paste the description/sources checks: extract a shared helper), the meta field, and the `HAND_LAYERS` entry `["villages", { label: "Village sites", one: "village", many: "villages" }]` after ponds.
- [ ] **Step 3:** `npx vitest run && npx tsc --noEmit`; commit.

### Task 3: Draw and wire the layer

**Files:** Create `viewer/src/overlay/villageDiscs.ts` (+ test), `viewer/src/overlay/villageColors.ts` if colours need their own module; modify `viewer/src/overlayModule.ts`, `viewer/src/overlay/labels.ts` (label kind and priority), `viewer/src/overlay/regionLabels.ts` (`labelKindsFor` accepts the new kind), `viewer/src/overlay/searchItems.ts`, `viewer/src/search.ts`, `viewer/src/placesList.ts`, `viewer/src/ui/hotspotPanel.ts`, `viewer/src/ui/placesPanel.ts` if it hard-codes group titles; tests beside each; `viewer/src/uiColors.test.ts` for contrast.

- [ ] **Step 1: Failing tests (pure parts).** Disc geometry: for a centre, radius and a height sampler, the builder returns a fan (centre plus N ring vertices, `N` segments, triangle indices, no degenerate triangles) with every vertex lifted above `max(ground, waterLevel)` by the same small lift, and an outline ring strip of constant width; deterministic output. Search: a village is found by its name (and by a prefix); group label "Village site"; kind text "Village site". Places: a "Village sites" group listing the five, after Hotspots and before Landmarks. Label kinds: `labelKindsFor` includes `village` only when the layer is on; villages are never hidden by the region-zoom rule. Colours: disc/outline/label colours meet the existing contrast rules against the lightest and darkest ground colours (extend the existing test, do not weaken it).
- [ ] **Step 2: Implement** `villageDiscs.ts`: `buildDiscGeometry` (pure) and `VillageDiscs` class (a `THREE.Group`; translucent tan fill `#caaf8f` at about 0.45 opacity and a brighter outline, `depthWrite: false`, polygon offset so it never z-fights; `setEnabled`, `setSelected(id)`, `dispose`). Cost must stay tiny (about 64 segments per disc).
- [ ] **Step 3: Wire `overlayModule.ts`:** `LAYER_DEFS` gains `{ id: "villages", label: "Village sites", defaultOn: true }`; label items of kind `village` (priority equal to hotspots, text = name, y = ground or water); discs added to the scene and enabled by the toggle; `syncLayers` adds the `village` label kind; selecting a village (label click, search, Places, `p=` link) opens the hotspot panel with kind text "Village site" and selects the disc; `place.restrictTo` and the Esc/close handlers include villages; `PLACE_ZOOM.village = 5`; search items and Places include villages. A dataset without villages must behave exactly as before.
- [ ] **Step 4:** `npx vitest run && npx tsc --noEmit`; commit.

### Task 4: Legend, About and Sources text

**Files:** Modify `viewer/src/legendEntries.ts`, `viewer/src/ui/legend.ts`, `viewer/src/ui/about.ts`, the stylesheet that defines `legend__icon--*`; tests (`legendEntries.test.ts`, an about-text test if one exists, otherwise a new pure-function test).

- [ ] **Step 1: Failing tests** against the exact approved strings: the Legend row text appears in the symbols list only when `meta.overlay_villages > 0`; the About paragraph uses the approved village sentence when `overlay_villages > 0` and keeps today's "This map shows land and water only. It does not depict villages, people or sacred sites." otherwise; no other About wording changes; the Sources panel shows a "Village sites" row (from the Task 1 `hand_sources` entry) with confidence Inferred.
- [ ] **Step 2: Implement:** constants `VILLAGES_LEGEND_NOTE` (Legend row) and the About sentence as exported constants with a comment `// Wording approved by the owner on 2026-11-18`; a `legend__icon--village` disc swatch in the same tan as the layer (CSS); thread `overlay_villages` into `createLegend` and `createAbout` the same way `context_file` is.
- [ ] **Step 3:** `npx vitest run && npx tsc --noEmit`; commit.

### Task 5: Browser check, benchmark, results (controller)

- [ ] Run the viewer (`?data=real-city`) in a real browser: circles in the right places against the owner's screenshot of SFEI's map (compare side by side), toggle on and off, card text for each village, search "Chutchui", Places panel, `p=village-chutchui` link, Esc, Legend, About, Sources, desktop and phone width, reduced motion, console clean, axe check.
- [ ] Bench scenarios A to E in Playwright (not the browser pane): all pass.
- [ ] Update `docs/research/village-sites-results.md` and the project notes; rebase on `main` (the other session may have merged); run all tests; merge fast-forward to `main`; push; confirm the Pages deploy and the live site.
