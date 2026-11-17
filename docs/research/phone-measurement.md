# Measuring the viewer on a real phone

Goal: find out whether the map is smooth enough on a mid-range phone, and which knob to
turn if it is not. Desktop numbers say little about a phone GPU, so measure on the device.

Smooth enough means: **at least 30 fps and a 95th-percentile frame gap under 50 ms** while
panning at full-resolution terrain (LOD 0) with vegetation on.

## 0. Quick route: the on-screen benchmark (no developer tools)

Open the production build with `?bench` on the phone, for example `http://<computer address>:4173/?bench`
(serve it with `cd viewer && npm run build:site && npx vite preview --host --port 4173`; both devices
on the same Wi-Fi). Close the About dialog, tap **Run the benchmark** and leave the phone alone for
about 40 seconds. It runs scenarios A to D below by itself and prints PASS or FAIL per scenario
(at least 30 fps, p95 frame gap under 50 ms, quality level not dropped) with the figures. Take a
screenshot of the box, and note the battery percentage before and after and whether the phone felt
warm. Use sections 1 to 3 only if you need the full detail; section 5 (idle battery cost of the
water) is not part of the quick route.

## 1. Serve the viewer to the phone

1. On the computer, from the `viewer/` folder: `npx vite --host`
2. Vite prints a `Network:` URL such as `http://192.168.1.20:5173/`. The phone and the
   computer must be on the same Wi-Fi network (no guest or client-isolated network).
3. On the phone open that URL with the debug overlay and the real data:
   `http://192.168.1.20:5173/?debug&data=real-city`
   (`?data=city-synth` is the synthetic whole-city grid, useful as a worst case: it has far
   more woodland and scrub than the real slice).
4. To switch the effects on without tapping, append a layer list to the address, for example
   `#l=vegetation,water-motion,landmarks,hotspots`. On a phone (coarse pointer) vegetation
   starts OFF; the "Vegetation" checkbox in the Menu turns it on.

Before each run: charge above 50 %, turn off Low Power Mode / Battery Saver (they cap the
frame rate and would hide real performance), set screen brightness to a fixed value, close
other apps, and let the phone cool down for a few minutes between runs.

## 2. Attach desktop developer tools to the phone

- **iPhone / iPad (Safari):** phone: Settings > Safari > Advanced > turn on Web Inspector.
  Connect by cable, tap "Trust". Mac: Safari > Settings > Advanced > "Show features for web
  developers", then Develop menu > (your phone) > the page. Use the Console tab.
- **Android (Chrome):** phone: enable Developer options and USB debugging. Connect by cable.
  Computer Chrome: open `chrome://inspect#devices`, wait for the page to be listed and press
  "inspect". Use the Console tab.

## 3. Run the benchmark snippet

The snippet is `docs/research/perf-bench.js` in the main repository. It defines
`window.__bench(label, seconds, dxPerMove)`, which pans the map back and forth through the
page's own pointer handlers and reports the cost of each render callback and the gap
between frames. Rendering is on demand, so the page only draws while input arrives, which is
exactly the interactive case.

1. Open `perf-bench.js` on the computer, select all, copy.
2. Paste it into the phone's Console (through the attached devtools) and press Enter once.
   It prints nothing; it only defines `window.__bench`.
3. Put the map in the situation to measure (below), then run
   `JSON.stringify(await window.__bench("zoomed in, panning", 4, 12))` and copy the result.

Scenarios (repeat each one three times and keep the median run):

| id | view | settings |
|----|------|----------|
| A | zoomed out, whole city (debug overlay says `LOD 1`) | vegetation on, water motion on |
| B | zoomed in past the switch zoom (`LOD 0`), woodland or scrub area | vegetation off, water motion off |
| C | same view as B | vegetation on, water motion off |
| D | same view as B | vegetation on, water motion on |
| E | same view as B, left alone for 30 s | vegetation on, water motion on (idle cost; see 5) |

Notes:
- The idle water animation also renders while you are not touching the map. For scenarios
  A-D switch "Water motion" off when you only want the interaction cost; the quality
  controller never sees these idle frames.
- The quality controller may lower the effects during a run (the toast says "Reduced effects
  to keep the map smooth", and the overlay's `quality level` drops from 2). Note the level at
  the START and the END of each run. A run that degraded is a failing run for that setting.

## 4. What to record

From the benchmark result: `effectiveFps`, `cbMs.p95` (render callback time) and
`frameGapMs.p95`. From the `?debug` overlay at the end of the run: `triangles`, `draw calls`,
`LOD`, `quality level` (with its p90 gap), and the vegetation instance count. Also write
down battery percentage before and after, and whether the phone felt warm or hot (thermal
throttling shows up as numbers getting worse from run to run).

| Result | ok if |
|--------|-------|
| `effectiveFps` | at least 30 |
| `frameGapMs.p95` | under 50 ms |
| `quality level` at the end | still 2 (nothing was switched off) |
| battery | not more than about 1 % per minute of continuous panning |

## 5. Idle cost of the animated water

With scenario E on screen and the phone untouched, the animation redraws about 15 times a
second (`IDLE_WATER_FPS`). Note the battery drop over 5 minutes against the same view with
"Water motion" off. If the difference is large, lower `IDLE_WATER_FPS` or make water motion
default to off on coarse pointers.

## 6. What to tune when a number is not ok

| Symptom | Knob | Where | Default |
|---------|------|-------|---------|
| LOD 0 itself is too slow (scenario B) | `MAX_COARSE_SPACING_PX`: larger switches to full resolution later (more zoom) | `src/main.ts` | 6 |
| Vegetation costs too much (C vs B) | `maxInstancesPerChunk`: fewer plants per chunk | `src/vegetation/layer.ts` (`DEFAULT_MAX_INSTANCES_PER_CHUNK`) | 1500 |
| Vegetation should not start on for phones | `defaultVegetationOn(coarsePointer)` | `src/effects.ts` | off on coarse pointers |
| Plants too big or too small | `sizeBoost` | `VegetationLayerOptions` / `DEFAULT_SIZE_BOOST` | 1.5 |
| Water motion costs too much | `IDLE_WATER_FPS`; `WAVE_SLOPE`, `GLINT_*` | `src/effectsModule.ts`, `src/water/waterMaterial.ts` | 15 fps |
| The controller degrades too eagerly or too late | `degradeAboveMs`, `upgradeBelowMs`, `degradeAfterMs`, `upgradeAfterMs`, `minDwellMs`, `windowSize` | `src/quality.ts` (`QualityOptions`) | 25 ms, 18 ms (so frames at a 60 Hz display's 16.7 ms can upgrade), 1.5 s, 8 s, 5 s, 60 |
| Several plant chunks built per frame hitch | `maxBuildsPerUpdate` (terrain) and `maxBuildsPerRefresh` (vegetation) | `src/terrainChunks.ts`, `src/vegetation/layer.ts` | 6, 3 |

Change one knob at a time and rerun the scenario that failed.

## 7. Results

Device: ______________________  OS / browser: ______________________  Date: ____________

Dataset: `real-city` / `city-synth` (circle one). Battery before: ____ %. Low Power Mode: off.

| Scenario | settings | effectiveFps | cbMs p95 | frameGapMs p95 | triangles | draw calls | quality level (start / end) | vegetation instances | battery after | thermal | verdict |
|----------|----------|--------------|----------|----------------|-----------|------------|------------------------------|----------------------|---------------|---------|---------|
| A | zoomed out, veg on, water on | | | | | | | | | | |
| B | LOD 0, veg off, water off | | | | | | | | | | |
| C | LOD 0, veg on, water off | | | | | | | | | | |
| D | LOD 0, veg on, water on | | | | | | | | | | |
| E | idle 30 s, veg on, water on | n/a | n/a | n/a | | | | | | | |

Decision: ____________________________________________________________________
