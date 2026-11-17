# Yelamu Launch-Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Tasks marked OWNER are done by the project owner, not by an agent**: an agent prepares them and then stops.

**Goal:** Put the Yelamu map on the public web as a static site at a subdomain of `thomasparas.com`, with the source and data in a public GitHub repository under GPL-3.0-or-later, after the wording, accessibility and phone checks that the earlier phases left open.

**Architecture:** The site is the viewer's `dist/` folder: one 167 kB (gzipped) script, one stylesheet and the `real-city` data folder (8.3 MB raw, about 3.5 MB gzipped). GitHub Actions tests the code, builds the site, drops the synthetic test data from it, and deploys it to GitHub Pages. DNS at Hostinger points a `yelamu` subdomain at GitHub Pages with one CNAME record. No server, no analytics, no third-party requests.

**Tech Stack:** Vite 8 / TypeScript 7 / Three.js viewer (unchanged), Python pipeline (unchanged), GitHub Actions + GitHub Pages, Hostinger DNS.

---

## Decisions already made (owner, 2026-11-17)

| Question | Decision |
|---|---|
| Where | **Public GitHub repo + GitHub Pages** (account `ThomasParas`) |
| Data in git | **Commit the built `real-city` files** (8.3 MB, GPL-3.0-or-later, listed in `NOTICE.md`) |
| Launch style | **Straight to public**, no soft launch. So the review gates in Part C are hard gates: nothing goes live until they pass |
| Domain | A **subdomain of thomasparas.com**, which is registered at Hostinger |

**Can it be hosted as a subdomain at Hostinger? Yes.** You do not need Hostinger web hosting for it. In Hostinger's DNS zone for `thomasparas.com` you add one CNAME record (`yelamu` pointing to `thomasparas.github.io`); GitHub Pages serves the site and issues the HTTPS certificate. Hostinger keeps serving the rest of `thomasparas.com` unchanged. (The alternative, uploading `dist/` to Hostinger by file manager or FTP every time, works too but is manual and has no tests or history; this plan does not use it.)

## Veto points (change before starting if you disagree)

| # | Choice | Why |
|---|---|---|
| 1 | Subdomain name **`yelamu.thomasparas.com`** | Short, and it is the name of the place. Used in the page's canonical and sharing tags (Task A2) |
| 2 | Repository name **`yelamu`**, so `https://github.com/ThomasParas/yelamu` | Matches the project. Used in the About dialog's source link (Task A4) |
| 3 | **Create the repo private first**, make it public only at launch | GitHub Pages on a private repo needs a paid plan, so Pages is enabled at the moment the repo goes public. Everything else (push, CI) can be proven privately first |
| 4 | **No analytics, no cookies, no third-party requests** | The map stores one value, a "seen the About dialog" flag, in the browser's `localStorage`. Nothing else. Keeps the site simple and the privacy note short |
| 5 | The default dataset becomes `real-city` | Today `?data=` defaults to the small `slice` demo (Task A1) |

## What this plan found about the current state

| Finding | Consequence |
|---|---|
| `viewer/src/main.ts` loads the `slice` dataset unless `?data=` says otherwise | A visitor would see the demo slice. Task A1 |
| `index.html` has a title but no description, sharing tags, icon or robots file | Links shared in chat or social media would be bare. Task A2 |
| `npm run build` copies **all** of `public/assets` into `dist/` (about 19 MB, including 8 MB of synthetic test data) | Task A3 prunes it to the real data only (11 MB) |
| `viewer/public/assets/real-city` is gitignored | Task A5 tracks it |
| All 96 commits carry your personal email address as the author | It becomes public with the history. Task C4 asks you to choose |
| A **fresh clone fails 2 pipeline tests** (`test_shipped_regions_load` needs `pipeline/data/raw`, which is gitignored); 614 pass | Task A6 fixes them so CI is green |
| Viewer tests need the synthetic datasets (`npm run make:city-synth` etc.), which are generated and gitignored | The CI workflow generates them first |
| `gh` is logged in as `ThomasParas`; no `origin` remote exists yet | Task C5 |
| Three tracked plan files mention local `/Users/...` paths | Harmless; left as they are (Task C4 notes it) |

## File structure

```
viewer/src/dataset.ts, dataset.test.ts     Task A1: which dataset to load (testable)
viewer/src/main.ts (modified)              Task A1
viewer/index.html (modified)               Task A2: description, sharing tags, icon
viewer/public/favicon.svg, og.png, robots.txt   Task A2
viewer/scripts/prune_dist.mjs, package.json (modified)   Task A3: build:site
viewer/src/ui/about.ts (modified)          Task A4: source and licence line
.gitignore (modified); README.md (modified)   Task A5: track real-city; how to rebuild the data
pipeline/tests/test_region.py (modified)   Task A6: skip raw-data checks on a fresh clone
.github/workflows/pages.yml                Task A7: test, build, deploy
docs/research/launch-review-sheet.md       Task B1: everything a reader sees, with sources
docs/research/launch-results.md            Task C8: what was checked, and what was not
```

Order: Part A (code, agent), Part B (checks an agent can run), Part C (owner steps and launch). Tests are green after every task.

---

# Part A: code changes

### Task A1: Load `real-city` by default

**Files:**
- Create: `viewer/src/dataset.ts`, `viewer/src/dataset.test.ts`
- Modify: `viewer/src/main.ts` (lines 35 to 42)

- [ ] **Step 1: Write the failing test**

`viewer/src/dataset.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_DATASET, datasetFromSearch } from "./dataset";

describe("datasetFromSearch", () => {
  it("loads the real city when nothing is asked for", () => {
    expect(DEFAULT_DATASET).toBe("real-city");
    expect(datasetFromSearch("")).toBe("real-city");
    expect(datasetFromSearch("?debug")).toBe("real-city");
  });

  it("accepts a plain dataset name", () => {
    expect(datasetFromSearch("?data=slice")).toBe("slice");
    expect(datasetFromSearch("?x=1&data=city-synth&debug")).toBe("city-synth");
  });

  it("refuses names that could point at other paths", () => {
    for (const bad of ["../secret", "a/b", "A B", "real city", "%2e%2e", ""]) {
      expect(datasetFromSearch(`?data=${encodeURIComponent(bad)}`)).toBe("real-city");
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd viewer && npx vitest run src/dataset.test.ts`

Expected: **FAIL** (`./dataset` does not exist).

- [ ] **Step 3: Write the implementation**

`viewer/src/dataset.ts`

```ts
/** Which dataset folder under public/assets/ the page loads. */
export const DEFAULT_DATASET = "real-city";

/**
 * `?data=<name>` picks another dataset (`slice`, `city-synth`, ...). The name is restricted to
 * lower-case letters, digits, `_` and `-`, so a URL cannot point the loader at arbitrary paths.
 */
export function datasetFromSearch(search: string): string {
  const requested = new URLSearchParams(search).get("data") ?? DEFAULT_DATASET;
  return /^[a-z0-9_-]+$/.test(requested) ? requested : DEFAULT_DATASET;
}
```

In `viewer/src/main.ts` replace

```ts
// Which dataset folder under public/assets/ to load. `?data=real` selects the locally
// generated real-data slice (gitignored; see docs/research/slice-results.md);
// `?data=city-synth` the synthetic whole-city grid (npm run make:city-synth). The name
// is restricted so a URL cannot point the loader at arbitrary paths.
const params = new URLSearchParams(location.search);
const requested = params.get("data") ?? "slice";
const dataset = /^[a-z0-9_-]+$/.test(requested) ? requested : "slice";
```

with

```ts
// Which dataset folder under public/assets/ to load: the real city unless `?data=<name>` asks
// for another (`slice`, or the synthetic `city-synth` from npm run make:city-synth).
const params = new URLSearchParams(location.search);
const dataset = datasetFromSearch(location.search);
```

and add `import { datasetFromSearch } from "./dataset";` with the other imports at the top of `main.ts`.

- [ ] **Step 4: Run the whole suite, the typecheck and the build**

Run: `cd viewer && npx vitest run && npx tsc --noEmit && npm run build`

Expected: vitest **572 + 3 = 575** passed, no type errors, build succeeds. (`params` is still used for `debug`.)

- [ ] **Step 5: Look at it in the browser**

Run: `cd viewer && npx vite --port 5199`, open `http://localhost:5199/` with **no** query string.

Expected: the real city (hotspots such as "Islais Creek estuary" in the Places list), not the slice demo. `http://localhost:5199/?data=slice` still shows the slice.

- [ ] **Step 6: Commit**

```bash
git add viewer/src/dataset.ts viewer/src/dataset.test.ts viewer/src/main.ts
git commit -m "feat(viewer): load the real city by default"
```

---

### Task A2: Page description, sharing tags, icon, robots

**Files:**
- Modify: `viewer/index.html`
- Create: `viewer/public/favicon.svg`, `viewer/public/robots.txt`, `viewer/public/og.png`

- [ ] **Step 1: Add the favicon and robots file**

`viewer/public/favicon.svg`

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#1f2a30"/>
  <path d="M8 44 L22 24 L32 34 L44 16 L56 44 Z" fill="#a89f78"/>
  <path d="M8 44 H56 V50 H8 Z" fill="#3e7088"/>
</svg>
```

`viewer/public/robots.txt`

```
User-agent: *
Allow: /
```

- [ ] **Step 2: Add the head tags**

In `viewer/index.html`, after the `<title>` line, add (replace the host if you changed veto point 1):

```html
    <meta name="description" content="An interactive 3D map of the San Francisco peninsula as its land and water may have lain around 1769, the homeland of the Ramaytush Ohlone. Every layer says where it comes from and how sure we are." />
    <meta name="theme-color" content="#1f2a30" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="canonical" href="https://yelamu.thomasparas.com/" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Yelamu: the landscape of San Francisco around 1769" />
    <meta property="og:description" content="An interactive 3D map of the peninsula's land and water before the city, with the source and confidence of every layer." />
    <meta property="og:url" content="https://yelamu.thomasparas.com/" />
    <meta property="og:image" content="https://yelamu.thomasparas.com/og.png" />
    <meta name="twitter:card" content="summary_large_image" />
```

- [ ] **Step 3: Make the sharing image**

Serve the viewer (`cd viewer && npx vite --port 5199`), open `http://localhost:5199/#x=2500.0&z=0.0&k=1.60&r=0` in a 1200 x 630 browser window with the Menu closed, wait until the map is drawn, and save a screenshot as `viewer/public/og.png` (1200 x 630). The Playwright tool's `browser_resize` and `browser_take_screenshot` with a `filename` do this in one go. Look at the image: the whole peninsula should be visible, no panels covering it. It shows SFEI-derived data, which is allowed under the GPL (credit is in the About dialog).

- [ ] **Step 4: Check and commit**

Run: `cd viewer && npm run build && ls dist | head`

Expected: `dist/` contains `index.html`, `favicon.svg`, `robots.txt`, `og.png` and `assets/`. Then:

```bash
git add viewer/index.html viewer/public/favicon.svg viewer/public/robots.txt viewer/public/og.png
git commit -m "feat(viewer): page description, sharing tags, icon and robots file"
```

---

### Task A3: Build only what the site needs

**Files:**
- Create: `viewer/scripts/prune_dist.mjs`
- Modify: `viewer/package.json`

`vite build` copies everything in `public/`, including the synthetic test data. This script removes every dataset folder except the real city.

- [ ] **Step 1: Write the script**

`viewer/scripts/prune_dist.mjs`

```js
// After `vite build`: keep only the datasets the public site needs in dist/assets.
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const KEEP = new Set(["real-city"]);
const assets = join(import.meta.dirname, "..", "dist", "assets");
if (!existsSync(assets)) {
  console.error("dist/assets not found: run `vite build` first");
  process.exit(1);
}
for (const entry of readdirSync(assets, { withFileTypes: true })) {
  // Built bundles are files (index-*.js, index-*.css); datasets are folders.
  if (entry.isDirectory() && !KEEP.has(entry.name)) {
    rmSync(join(assets, entry.name), { recursive: true });
    console.log(`removed dist/assets/${entry.name}`);
  }
}
for (const need of KEEP) {
  if (!existsSync(join(assets, need, "meta.json"))) {
    console.error(`dist/assets/${need}/meta.json is missing: the site would be empty`);
    process.exit(1);
  }
}
```

- [ ] **Step 2: Add the npm script**

In `viewer/package.json` `scripts`, after `"build"`, add: `"build:site": "npm run build && node scripts/prune_dist.mjs",`

- [ ] **Step 3: Run it**

Run: `cd viewer && npm run build:site && ls dist/assets && du -sh dist`

Expected: it prints `removed dist/assets/city-synth`, `real` and `slice`; `ls` shows `index-*.js`, `index-*.css` and `real-city`; `dist` is about **11 MB** (the data 8.3 MB, the sharing image 0.7 MB).

- [ ] **Step 4: Serve the production build and look at it**

Run: `cd viewer && npx vite preview --port 4173`, open `http://localhost:4173/`.

Expected: the real city loads with no console warnings; the Network panel shows requests to `localhost` only (no third-party hosts).

- [ ] **Step 5: Commit**

```bash
git add viewer/scripts/prune_dist.mjs viewer/package.json
git commit -m "build(viewer): build:site keeps only the real-city data in dist"
```

---

### Task A4: Say where the source is, and under what licence

**Files:**
- Modify: `viewer/src/ui/about.ts`

- [ ] **Step 1: Add the section** after the "Data terms" section in `createAbout` (before the "not for navigation" warning):

```ts
  inner.appendChild(
    section(
      "Source code and data",
      paragraph(
        "The code and the data behind this map are free software under the GNU General Public License, " +
          "version 3 or any later version: ",
        safeLink("https://github.com/ThomasParas/yelamu", "github.com/ThomasParas/yelamu"),
        ".",
      ),
    ),
  );
```

- [ ] **Step 2: Check**

Run: `cd viewer && npx tsc --noEmit && npx vitest run && npm run build`

Expected: typecheck clean, 575 tests pass, build succeeds. Open the About dialog in the browser: the new section appears, the link opens the repository address (it will 404 until Tasks C5 and C7).

- [ ] **Step 3: Commit**

```bash
git add viewer/src/ui/about.ts
git commit -m "feat(viewer): About links to the source and states the licence"
```

---

### Task A5: Track the built data and document how to rebuild it

**Files:**
- Modify: `.gitignore`, `README.md`
- Add to git: `viewer/public/assets/real-city/*`

- [ ] **Step 1: Rebuild from the committed inputs so the tracked files are current**

```bash
cd pipeline
uv run python -m yelamu.cli --region regions/full-city.json
uv run python scripts/build_overlay.py --region regions/full-city.json
uv run python scripts/verify_overlay_data.py ../viewer/public/assets/real-city
```

Expected: the build prints no sanity-check failure; `verify_overlay_data.py` exits 0. (The overlay step must come after the terrain build, which rewrites `meta.json`.)

- [ ] **Step 2: Stop ignoring the real city, keep ignoring the rest**

In `.gitignore` replace

```
# Derived from SFEI data (GPL-3.0-or-later since SFEI's reply, 2026-11-17; see docs/research/sfei-license-reply.md).
# Kept out of git for size and hosting reasons until a publishing plan exists.
viewer/public/assets/real*/
docs/research/local/
```

with

```
# The built real-city data is tracked: it derives from GPL-3.0-or-later SFEI data and public sources (NOTICE.md).
# Older local experiments and review images stay out of git.
viewer/public/assets/real/
docs/research/local/
```

Run: `git check-ignore -v viewer/public/assets/real-city/meta.json; echo "exit $?"`

Expected: no output, `exit 1` (not ignored). `viewer/public/assets/real/meta.json` is still ignored.

- [ ] **Step 3: Add a "Rebuilding the data" section to `README.md`** (append):

````markdown
## Rebuilding the data

The built map data in `viewer/public/assets/real-city/` is committed. To regenerate it you need
the raw inputs in `pipeline/data/raw/` (not in git, they are large): `dem.tif` (USGS 3DEP),
`sf_habitats.geojson`, `bay.geojson` and `marsh.geojson` (SFEI Hidden Nature SF),
`noaa/extracted/<project>/` (NOAA Shoreline Data Rescue Project vectors) and `tiger/` (Census
TIGER/Line). `docs/research/slice-results.md` and `docs/research/2026-data-sources.md` say where
each came from. Then, from `pipeline/`:

```
uv run python -m yelamu.cli --region regions/full-city.json
uv run python scripts/build_overlay.py --region regions/full-city.json
uv run python scripts/verify_overlay_data.py ../viewer/public/assets/real-city
```

Run the overlay step after the terrain step (the terrain build rewrites `meta.json`). The hand
data files in `pipeline/data/full-city/hand/` are described in the README beside them; three of
them are generated (`scripts/import_noaa.py`, `scripts/trace_flat_lakes.py`,
`scripts/trace_treasure_island.py`). Terms for every source are in `NOTICE.md`.
````

- [ ] **Step 4: Check what will be added, then commit**

Run: `git add viewer/public/assets/real-city .gitignore README.md && git status --short && git diff --cached --stat | tail -1`

Expected: four or five files under `viewer/public/assets/real-city` (about 8.3 MB), plus the two edited files; nothing from `real/`, `raw/` or `docs/research/local/`.

```bash
git commit -m "data: track the built real-city assets (GPL-3.0-or-later); document the rebuild"
```

---

### Task A6: Make a fresh clone's tests pass

**Files:**
- Modify: `pipeline/tests/test_region.py`

A fresh clone has no `pipeline/data/raw`, so `test_shipped_regions_load` fails. The committed files should always be checked; the raw inputs only when present.

- [ ] **Step 1: Reproduce**

Run (from the repository root; `$SCRATCH` is any empty folder): `git clone . "$SCRATCH/fresh" && cd "$SCRATCH/fresh/pipeline" && uv sync && uv run pytest -q -W error`

Expected: **2 failed** (`test_shipped_regions_load[slice]` and `[full-city]`), 614 passed.

- [ ] **Step 2: Patch the test**

Replace the body of `test_shipped_regions_load` after `assert region.dem == ...` with:

```python
    for p in (region.landforms, region.checks, *region.hand_bay, *region.hand_marsh,
              *region.hand_ponds):
        assert p is not None and p.exists(), p
    if not (PIPELINE / "data" / "raw").exists():
        pytest.skip("pipeline/data/raw is not present (a fresh clone): raw inputs not checked")
    for p in (region.habitats, region.bay, region.marsh):
        assert p is not None and p.exists(), p
```

- [ ] **Step 3: Run it here and in the fresh clone**

Run: `cd pipeline && uv run pytest -q -W error` (here: 617 passed, 5 skipped) and again in a fresh clone of the repository.

Expected in the fresh clone: **0 failed**, the 2 region tests skipped.

- [ ] **Step 4: Commit**

```bash
git add pipeline/tests/test_region.py
git commit -m "test(pipeline): shipped-region test skips raw inputs on a fresh clone"
```

---

### Task A7: Test, build and deploy with GitHub Actions

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Write the workflow**

`.github/workflows/pages.yml`

```yaml
name: Test and deploy

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  pipeline:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: pipeline
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv sync
      - run: uv run pytest -q -W error

  viewer:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: viewer
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: viewer/package-lock.json
      - run: npm ci
      # The tests use the generated synthetic datasets (gitignored).
      - run: npm run make:city-synth && npm run make:overlay-synth && npm run make:ponds-synth
      - run: npx vitest run
      - run: npx tsc --noEmit
      - run: npm run build:site
      - uses: actions/upload-pages-artifact@v3
        with:
          path: viewer/dist

  deploy:
    if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'
    needs: [pipeline, viewer]
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Check the YAML parses and the commands exist**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/pages.yml'))" && cd viewer && npm run make:city-synth && npm run build:site`

Expected: no error. (A real run happens in Task C5.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/pages.yml
git commit -m "ci: test on every push, deploy the built site to GitHub Pages from main"
```

---

# Part B: checks an agent runs (and the review sheet)

### Task B1: The review sheet, and verify the remaining hotspots

**Files:**
- Create: `docs/research/launch-review-sheet.md`

Your review (Task C1) is faster if every word a visitor reads is on one page with its source. Earlier only 3 of the 11 hotspot descriptions were re-checked against live pages.

- [ ] **Step 1: Generate the sheet.** A script or a short agent run collects: the About dialog text (from `viewer/src/ui/about.ts`), the Legend and Sources wording, every hotspot (`pipeline/data/overlay/hotspots.json`: name, description, kind, confidence, sources), the 38 landmark names, and the layer descriptions in `meta.json`.
- [ ] **Step 2: Re-check the 8 hotspots not yet verified** against their cited pages (one subagent per hotspot is fine; read-only). For each: the claim, the quote or figure from the source, and `supported` / `partly` / `not found`. Anything not fully supported is **listed as a finding for the owner, not silently reworded**.
- [ ] **Step 3: Commit** the sheet (it contains no personal data): `git add docs/research/launch-review-sheet.md && git commit -m "docs: launch review sheet of every visitor-facing text"`.

### Task B2: Accessibility scan (automated)

- [ ] **Step 1:** Serve the production build (`cd viewer && npx vite preview --port 4173`). In the browser tool, load `http://localhost:4173/`, inject axe-core (a pinned 4.x file, test only, never added to the site) and run `axe.run()` with the About dialog closed, with it open, with each of Places, Legend and Sources open, and with a hotspot panel open.
- [ ] **Step 2:** Record every violation (rule, element, impact). Fix serious and critical ones in code, test first where the logic is testable; list the rest with a reason. Contrast failures on the map labels are judged against their background, not as text on a page.
- [ ] **Step 3:** Commit fixes one per defect: `git commit -m "fix(viewer): <what> (accessibility)"`.

### Task B3: Reduced motion and the water toggle

- [ ] **Step 1:** With the browser tool's `emulate_media` set to `reducedMotion: reduce`, reload `http://localhost:4173/` and wait. Expected: the water is not animating and the "Water motion" checkbox starts unchecked (check `viewer/src/effects.ts` for the intended behaviour first; if the code does not honour the setting, that is a defect to fix test-first).
- [ ] **Step 2:** Switch to `no-preference`, reload: water animates; unchecking "Water motion" stops it, including on ponds and Lake Merced.

### Task B4: Rotation across the LOD switch

- [ ] **Step 1:** In a 1100 x 750 window at `#x=3700.0&z=3300.0&k=8.50&r=0` (just below the switch zoom of about 8.99), press Q and E repeatedly and zoom in and out across the switch, taking a screenshot every few steps.
- [ ] **Step 2:** Look for shoreline flicker or popping at the new NOAA shores (Islais, India Basin, Hunters Point) and at Lake Merced. Record what is seen. A defect gets a failing test where the logic is testable (`viewer/src/chunks.ts`), otherwise a written finding.

### Task B5: Failure states

- [ ] **Step 1:** With the production build served, block `/assets/real-city/heightmap.u16` (the browser tool's network interception, or rename the file temporarily in `dist`) and reload. Expected: a plain message that the map could not load, not a blank page. Do the same for `overlay.json` and `ponds.json` (expected: one console warning, the map still works).
- [ ] **Step 2:** If the heightmap failure shows a blank screen, add a visible message (test-first for the text) and commit.

---

# Part C: owner steps and launch

### Task C1 (OWNER): Review the wording. A hard gate

- [ ] Read `docs/research/launch-review-sheet.md` (Task B1). Change or approve: the About text ("What this map is", the Ramaytush Ohlone section, "How sure are we", Data terms, Source code), every hotspot description, the Legend. Tell the agent the edits; each becomes a commit.
- [ ] Decide consciously about the **Association of Ramaytush Ohlone**. The map has **no cultural content** and the About text says so, so it is not a technical gate. But the outreach draft is still unsent (`docs/research/aro-outreach-draft.md`) and the Association is named on a public page. Sending the introduction **before** the public announcement is recommended; the plan does not require it.

### Task C2 (OWNER): Measure on a phone

- [ ] Follow `docs/research/phone-measurement.md` (serve with `npx vite --host`, same Wi-Fi). Pass: at least 30 fps and a p95 frame gap under 50 ms in scenario D. If it fails, the agent turns the knob the note names (vegetation default off on coarse pointers is already set) and you re-measure. Save the numbers in `docs/research/launch-results.md`.

### Task C3 (OWNER): Screen reader and keyboard pass

- [ ] With VoiceOver (macOS: Cmd+F5) on the production build: the page title is read; Tab reaches Search, Menu, Places, Legend, Sources, About in order; the About dialog traps focus and Esc closes it; a hotspot panel is announced; the map canvas label is read. Keyboard only: arrow keys pan, plus and minus zoom, Q and E rotate, H resets, `/` focuses search, `?` opens About. Note every problem; the agent fixes them test-first.

### Task C4 (OWNER): Decide what the public history shows

All 96 commits are authored with your personal email address. Pushing publishes it. See it with `git log --format='%ae' | sort -u`.

- [ ] Choose one:
  - **Keep it.** Simple; the address will be public and scrapeable.
  - **Rewrite the author to GitHub's no-reply address before the first push** (recommended if you do not want your address public). Get your numeric id with `gh api user --jq .id` (call it `ID`), turn on "Keep my email addresses private" in GitHub's email settings, then on a **copy** of the repository:

    ```bash
    brew install git-filter-repo      # or: pip install git-filter-repo
    # mailmap line: new name and address, then the old address in angle brackets
    printf 'Thomas Paras <ID+ThomasParas@users.noreply.github.com> <YOUR-CURRENT-COMMIT-EMAIL>\n' > mailmap.txt
    git filter-repo --mailmap mailmap.txt
    git config user.email "ID+ThomasParas@users.noreply.github.com"
    ```

    (`YOUR-CURRENT-COMMIT-EMAIL` is the address the `git log` command printed.) Check `git log --format='%ae' | sort -u` afterwards.
- [ ] Skim `git log` messages and `docs/` once for anything you would not want public (the phone script and SFEI notes contain no contact details; three plan files mention local `/Users/...` paths, which are harmless).

### Task C5 (OWNER, with the agent): Create the private repository and prove CI

- [ ] `gh repo create ThomasParas/yelamu --private --source . --remote origin --push` (from the repository root, after Task C4).
- [ ] Open the Actions tab: the **pipeline** and **viewer** jobs must pass. The **deploy** job will fail or be skipped because Pages is not enabled: expected. Fix any failure in CI (usually a missing generated file) with a commit, and repeat until the two test jobs are green.

### Task C6 (OWNER): DNS at Hostinger

- [ ] In Hostinger hPanel: Domains, `thomasparas.com`, DNS / Nameservers, DNS records. Add a record: **Type** `CNAME`, **Name** `yelamu`, **Target** `thomasparas.github.io`, TTL default. (If the domain's nameservers are not Hostinger's, add it where the DNS zone actually is.)
- [ ] If the zone has any **CAA** records, make sure they allow Let's Encrypt (`letsencrypt.org`), or the HTTPS certificate cannot be issued.
- [ ] Check: `dig +short yelamu.thomasparas.com CNAME` should print `thomasparas.github.io.` (it can take minutes to hours).

### Task C7 (OWNER, with the agent): Launch

Pre-flight, all must be true: Task C1 approved; Tasks B2 to B5 recorded with no open serious defect; Task C2 passed or its result accepted by you; Task C3 problems fixed or accepted; CI green; the DNS check of Task C6 prints the CNAME.

- [ ] Make the repository public: GitHub, Settings, General, Danger Zone, Change visibility, Public.
- [ ] Settings, Pages: **Source: GitHub Actions**. Custom domain: `yelamu.thomasparas.com`, Save (GitHub checks the DNS), then tick **Enforce HTTPS** once it becomes available (the certificate can take up to an hour).
- [ ] Run the workflow once (Actions, Test and deploy, Run workflow). The deploy job's URL appears in the run summary.

### Task C8: Verify the live site and record it

- [ ] An agent opens `https://yelamu.thomasparas.com/` in the browser tool and checks: the real city loads with no console warning; the About dialog opens on a first visit (clear site data to test) and its source link opens the repository; Sources lists the NOAA, landform and pond rows; a share link (`Copy link`) reopens the same view in a fresh tab; the sharing image URL (`/og.png`) loads; `/robots.txt` loads; the Network panel shows only requests to the site itself; a request for `/assets/real-city/nonexistent` returns the host's 404.
- [ ] Paste the live link into a chat or messaging app to see the preview card.
- [ ] Write `docs/research/launch-results.md`: what was checked, the numbers (phone fps, accessibility violations found and fixed), and **what was not exercised**. Commit it.
- [ ] Tell Pete at SFEI the site is live and thank him; ask whether the Data terms wording in the About dialog is what he intended.
- [ ] Update the project memory.

---

## Risks

| Risk | Mitigation |
|---|---|
| GitHub Pages cannot issue the certificate (CAA record, DNS not yet propagated) | Task C6 checks both before launch. Do not use the default `thomasparas.github.io/yelamu/` address as a fallback: the site's asset paths assume it is served from the root of a domain |
| A data rebuild adds about 8 MB to git history each time | Rebuild only when the data actually changes; commit the built files with the change that caused them |
| The map misleads: it is a reconstruction, much of the south-east shore is `inferred`, and Lake Merced, the lagoons and Treasure Island are approximations | The Legend, Sources and About say so; each layer carries its source and confidence. Task C1 is where you judge whether that is enough |
| GPL obligations | The code, pipeline and published data are in the public repository under GPL-3.0-or-later (`LICENSE`), with `NOTICE.md` for sources. This is not legal advice; ask someone qualified if you intend to rely on a particular interpretation |
| SFEI's expanded mapping (fall 2027) supersedes parts of the reconstruction | Plan a data refresh then; the pipeline and checks make it a rebuild, not a rewrite |

## Not in this plan

Analytics, a cultural layer (needs the Association's involvement), a mobile app, user accounts, a backend, internationalisation, a custom 404 page, and any change to the data beyond what Phase 3b did.

## Spec coverage

| Requirement | Task |
|---|---|
| Real city is what a visitor sees | A1 |
| Shareable and findable | A2 |
| Small, correct site build | A3, A7 |
| Source and licence visible, GPL satisfied | A4, A5, `LICENSE`, `NOTICE.md` |
| Reproducible from git, CI green | A5, A6, A7 |
| Wording reviewed against sources | B1, C1 |
| Accessibility, reduced motion, rotation flicker, failure states | B2 to B5, C3 |
| Phone performance | C2 |
| Public repo, Pages, subdomain, HTTPS | C4 to C7 |
| Live verification and record | C8 |

---

## Part A executed (2026-11-17)

Commits: `70710e0` A1, `890531f` A2, `4cc5252` A3, `10d3963` A4, `e5f2df2` A5, the A6 test fix, and the A7 workflow. Results:

- **Viewer tests 572 to 575**, typecheck and build clean; **pipeline 617 passed, 5 skipped** here, and **0 failed (614 passed, 8 skipped) on a fresh clone** (before A6: 2 failed).
- The production build (`vite preview`) loads the real city with five data requests, all to its own host, and no console warning. `dist` is 11 MB.
- The rebuilt real-city data is byte-identical to the one already on disk (same heightmap checksum), so the tracked files are the reproducible build of the committed inputs.
- Every viewer CI step (synthetic data, vitest, tsc, `build:site`) was rehearsed on a fresh clone; `npm ci` and the Actions run itself are only proven by Task C5.
- A2's sharing image (`og.png`, 1200 x 630) is a screenshot of the whole peninsula with the interface hidden. Look at it before launch: the south-west is bare grey ground where SFEI maps no habitat, and a thin land sliver shows at the map's east edge.
- `.playwright-mcp/` (browser tool scratch) is now gitignored.

## Part B executed (2026-11-17)

| Task | Result |
|---|---|
| B1 review sheet | `docs/research/launch-review-sheet.md`. All 11 hotspots re-checked against live pages (the earlier run did not record which 3 had been): **none contradicted**; 3 PARTLY (Yerba Buena Cove "tidal" not on the page; Washerwoman's Lagoon "below" vs "beyond" Russian Hill; Islais two paraphrases); timing and attribution caveats on Lake Merced, SoMa fens and Mountain Lake. Ten suggested changes listed for your decision; none applied |
| B2 accessibility (axe-core 4.10.2, production build, About open, closed, Places, Legend, Sources, a hotspot panel) | **Before:** 2 moderate (no main landmark; skip link and canvas outside landmarks) and 1 **serious** (the scrolling Legend and Sources panels not keyboard-focusable). **Fixed** (`a6d9df9`): `<main>` around the canvas, the skip link in a navigation landmark, the panel body focusable and named. **After: 0 violations in every state.** axe checks structure and many contrast cases, not everything: Task C3 (VoiceOver) still stands |
| B3 reduced motion | **Pass.** With `prefers-reduced-motion: reduce` the "Water motion" box is off and disabled and the idle map makes **0** renders in 2 s; with no preference, water animates (29 renders in 2 s idle) and unchecking the box stops all idle rendering (0 renders). Ponds share the water material |
| B4 rotation across the LOD switch | **Partly.** At rotation 1, zoom 3.40 (coarse LOD) against 3.62 (full detail), the shore at Islais, India Basin and Hunters Point lines up, with no shift; vegetation fills in on full detail. **Not tested:** frame-by-frame flicker during an animated Q/E rotation across the switch (only still frames were compared). The switch zoom depends on window size (3.54 at 750 px tall, 4.29 at 550) |
| B5 failure states | **Fixed** (`02cc445`): a missing heightmap showed a technical message ("expected 5543230 bytes ... got 1952"); it now says "The map could not be loaded. Please check your connection and reload the page." (detail only with `?debug`). Missing `overlay.json` and `ponds.json`: the map works, two console warnings, no hotspots. On GitHub Pages a missing file returns a 404 rather than this test server's HTML fallback; the message path is the same |

A regression I introduced and then caught: wrapping the canvas in `<main>` left it at its content's height (550 of 750 px, a blank strip at the bottom). Found by looking at the page, not by a test (the viewer tests run without a DOM); fixed in `d2f4cbd`. Lesson recorded: view the page after any layout change.

Tests now: viewer **577**, pipeline 617 (+5 skipped). Observations not acted on: loading the page with an extra query parameter `?x=...` makes the camera drift for about two seconds (shared links use the hash only, so a visitor will not hit it); the water's stripe pattern shows as a checker at some zooms (known cosmetic item).

## Task C1 executed (2026-11-17)

The owner reviewed the launch review sheet and decided each item; all were applied in `97e414d` (decisions recorded at the end of `docs/research/launch-review-sheet.md`). The Ramaytush Ohlone text was **approved as written**. **C1 is satisfied.** Remaining gates: C2 (phone), C3 (VoiceOver), C4 (git email), then C5 to C8. The Association of Ramaytush Ohlone has still not been contacted.

## Tasks C4 and C5 executed (2026-11-17)

- **C4:** the owner chose GitHub's no-reply address. The history was rewritten with `git filter-repo --mailmap` on a copy: all 111 commits now carry `5440145+ThomasParas@users.noreply.github.com` as author and committer, the tree is identical to the original, and the personal address appears nowhere in the history. A scan of the tracked files and history for emails, phone numbers and keys found nothing. **Commit hashes quoted earlier in this plan and in the results notes are from the pre-rewrite history; the commit titles are unchanged.** A backup of the old `.git` is at `~/Documents/yelamu-git-backup-before-rewrite-2026-11-17.tar.gz` (delete it once you are sure; it contains the personal address).
- **C5:** the **private** repository `ThomasParas/yelamu` was created and `main` pushed. First Actions run: **pipeline job passed, viewer job passed** (about 30 seconds each, `npm ci` included), **deploy job failed as expected** (`Failed to create deployment (404)`: Pages is not enabled yet). The deploy job will show red on every push until Task C7. The project folder now uses the pushed history (its old `.git` replaced; working files and the gitignored raw data untouched; `git status` clean and level with `origin/main`).
- **Remaining:** C2 (phone), C3 (VoiceOver), C6 (Hostinger CNAME), C7 (make public, enable Pages), C8 (verify live).

