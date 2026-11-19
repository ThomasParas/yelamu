# Launch results

Measurements and checks taken for the public launch (plan: `docs/superpowers/plans/2026-11-17-launch-readiness.md`). Each section is dated and says what was **not** tested.

## C2. Phone performance (2026-11-17)

**Method.** The on-screen benchmark (`?bench`, commit `353e59a`) on the production build (`npm run build:site`, then `vite preview`), opened on the phone over the owner's Tailscale network (the home Wi-Fi blocked phone-to-Mac traffic, so the first attempt on the LAN address failed; this affects only download time, not the frame rates). Pass rule: at least 30 fps, p95 frame gap under 50 ms, and the quality controller did not step down.

**Device.** An Android phone, Chrome 157, screen 411x777 CSS px at 2.625x, coarse pointer, reduced motion off, 60 Hz display.

| Scenario | fps | p95 frame gap | p95 JS time per frame | Quality | LOD | Triangles | Draw calls | Plants | Result |
|---|---|---|---|---|---|---|---|---|---|
| A whole city, zoom 1, vegetation + water | 59.7 | 17.2 ms | 2.8 ms | 2 -> 2 | 1 | 216,549 | 131 | 0 | **PASS** |
| B close-up, vegetation off | 59.5 | 17.5 ms | 1.7 ms | 2 -> 2 | 0 | 983,370 | 36 | 0 | **PASS** |
| C close-up, vegetation on | 59.5 | 17.4 ms | 2.0 ms | 2 -> 2 | 0 | 1,416,086 | 69 | 32,999 | **PASS** |
| D close-up, vegetation + water animation | 59.7 | 17.3 ms | 1.7 ms | 2 -> 2 | 0 | 1,416,086 | 69 | 32,999 | **PASS** |

All four scenarios held the display's 60 fps (the median frame gap is 16.7 ms, one refresh), with the quality level unchanged. The worst single JS callback was 28.1 ms (scenario B, once; a chunk loading); the 95th percentile stayed under 3 ms.

**Reading it honestly.**
- The run is capped by the screen's refresh rate, so it shows the phone **keeps up**, not how much headroom there is. The JS time per frame is small, but the benchmark does not measure GPU time directly; the steady 16.7 ms gaps show the GPU kept up.
- Scenario D is the plan's gate and it **passes** with vegetation and water animation both on. The page keeps vegetation **off by default on touch devices**; this result says that default is conservative for a recent phone.
- One phone, a recent one, over about 40 seconds. **Not tested:** an older or low-end phone, an iPhone (Safari), a long session (heat throttling), and battery drain. The owner did not record battery or warmth for this run.

**Decision.** C2 is **satisfied** for this device class. No knob was turned. Re-run `?bench` on any older phone you can borrow before relying on the vegetation default.

## Surrounding terrain (2026-11-17)

The grey modern surround (spec `docs/superpowers/specs/2026-11-17-surrounding-terrain-design.md`, plan `docs/superpowers/plans/2026-11-17-surrounding-terrain.md`) was built, reviewed in a browser and by an independent reviewer, and its findings fixed.

**What shipped.** Modern 3DEP terrain around the 1769 map (lon -122.60 to -122.05, lat 37.58 to 37.93; 814 x 656 vertices about 60 m apart, 1.1 MB), drawn as grey tiles with skirts, labelled with 19 modern towns, searchable. Legend, About and Sources say it is today's terrain and coastline, not a reconstruction (wording approved by the owner on 2026-11-17).

**Owner decisions (2026-11-17).** Keep the hard edge between the coloured map and the grey (no fade); keep real heights (no flattening of Mount Tamalpais); launch with the modern East Bay shore beside the 1850s San Francisco shore, and add the 1850s shores in stages after launch (East Bay, then the peninsula bayshore, then Marin; each needs its own plan, downloads and owner review of previews).

**Desktop (headless Chrome 157, 60 Hz).** Scenarios A to E all PASS at 60 fps; A (whole city, opening view) draws about 836,000 triangles (it was about 216,000 before the surround); E (whole region) about 1.26 million.

**Phone (Android, Chrome 157, 411x777 at 2.625x, 60 Hz, over Tailscale), final build.**

| Scenario | fps | p95 frame gap | Quality | Triangles | Draw calls | Result |
|---|---|---|---|---|---|---|
| A whole city (opening view), vegetation + water | 60.0 | 17.4 ms | 2 -> 2 | 527,233 | 124 | **PASS** |
| B close-up, vegetation off | 59.5 | 17.3 ms | 2 -> 2 | 842,612 | 36 | **PASS** |
| C close-up, vegetation on | 59.5 | 17.8 ms | 2 -> 2 | 1,471,936 | 75 | **PASS** |
| D close-up, vegetation + water | 59.7 | 17.1 ms | 2 -> 2 | 1,471,936 | 75 | **PASS** |
| E whole region (grey surround), vegetation + water | 59.7 | 17.1 ms | 2 -> 2 | 1,038,723 | 248 | **PASS** |

The refresh rate caps these at 60 fps, so they show the phone keeps up, not how much headroom it has. Not tested: an older or low-end phone, an iPhone, a long session (heat), battery drain (not recorded). If an older phone struggles, the surround's `cell_m` in `pipeline/regions/full-city.json` can go from 60 to 90 (rebuild with `scripts/build_context.py`).

**Known limits.** The East Bay, peninsula bayshore and Marin shores in the grey surround are modern (including fill). Alameda and South San Francisco labels are at downtown positions because Wikipedia's points are at sea level. The Legend note and Sources entry would still describe the surround on a dataset that has one but fails to load it (unlikely). Towns are listed under "Landmarks" in search and Places.

## C3. Screen reader and keyboard pass (2026-11-17)

On the final production build (after the grey surround), served locally.

**Keyboard, checked by the agent in a real browser:** the page title reads correctly; the About dialog opens by itself on a first visit with focus inside it, keeps focus inside while Tab is pressed, and closes with Esc; the page has a skip link, a main landmark, a header and the dialog; Tab order is skip link, map, hotspot buttons, search, Places, Legend, Sources, About, the layer toggles, Reset view; arrow keys pan, plus and minus zoom, E rotates, H resets, `/` focuses search, `?` opens About; a shared link to a ring town at high zoom still shows its label. axe-core 4.10.3 found 0 violations with the page, About, Legend, Sources and Places each open.

**VoiceOver, run by the owner:** title, About dialog, map label, hotspots, search ("Selected: ..." announcement), Places, Legend and Sources were listened to; the owner reported **"It was fine"**, no problems to fix.

**Not tested:** other screen readers (NVDA, TalkBack), VoiceOver on iPhone, Windows high-contrast mode. Known design note: the hotspot buttons come before the search box in Tab order (the "Skip to search" link is the way past them).

## C6 to C8. DNS, going public, and the live site (2026-11-17)

**C6 DNS.** The owner added `CNAME yelamu -> thomasparas.github.io` at Hostinger (thomasparas.com uses Hostinger's nameservers `byte.dns-parking.com` / `pixel.dns-parking.com`; no CAA records, no conflicting record). Confirmed on the authoritative server and on 8.8.8.8, resolving to GitHub's four Pages addresses; other resolvers lagged briefly.

**C7 launch (owner approved "Go public now").** Repository `ThomasParas/yelamu` made public; GitHub Pages enabled with the Actions source; custom domain `yelamu.thomasparas.com` set; the Let's Encrypt certificate was approved within minutes (expires 2027-02-15); "Enforce HTTPS" turned on; the workflow was run by hand (`workflow_dispatch`): pipeline, viewer and **deploy all succeeded**.

**C8 live checks.** `https://yelamu.thomasparas.com/` returns 200 over HTTP/2; `https://thomasparas.github.io/yelamu/` redirects (301) to it; `meta.json`, `context.json`, `og.png`, `favicon.svg`, `robots.txt` all served; in a real browser: correct title, About opens on a first visit, canonical and og:image point at the custom domain, the ring is drawn (59 tiles), 19 ring places loaded, camera limits widened, console empty (0 errors, 0 warnings).

**Also done before launch.** The sharing image (`og.png`) was regenerated from the new view (it showed the old floating island with a stray east-edge sliver).

**Open after launch.**
- `http://yelamu.thomasparas.com/` still answered 200 without redirecting to HTTPS a few minutes after "Enforce HTTPS" was switched on; GitHub applies it with a delay. Recheck within the hour.
- The unsent introduction to the Association of Ramaytush Ohlone was public in the repository at launch; it has since been replaced by a newer draft and moved out of git (outreach drafts now live in the ignored `docs/research/local/`). Send it soon.
- Thank the SFEI contact (Pete) and ask whether the Data terms wording is right.
- The git backup of the pre-rewrite history at `~/Documents/yelamu-git-backup-before-rewrite-2026-11-17.tar.gz` contains the personal email address; delete it when sure.
- The 1850s shore stages (East Bay, peninsula bayshore, Marin) each need their own plan.

## Visual improvements on the phone (2026-11-18)

**What changed since the launch run.** Branch `native-plant-shapes`, rebased on `a0cb107` (village sites): native plant shapes per habitat (oak, bay, willow, coyote brush, lupine, tule, reed), smooth terrain normals with baked hill shadows and ambient occlusion, and soft habitat edges drawn per pixel. Same method as above (production build, `vite preview`, over Tailscale).

**Phone (Android, Chrome 158, 411x777 at 2.625x, 60 Hz).**

| Scenario | fps | p95 frame gap | p95 JS time per frame | Quality | Triangles | Draw calls | Plants | Result |
|---|---|---|---|---|---|---|---|---|
| A whole city (opening view) | 60.0 | 17.3 ms | 3.6 ms | 2 -> 2 | 531,585 | 132 | 0 | **PASS** |
| B close-up, vegetation off | 59.2 | 17.3 ms | 1.9 ms | 2 -> 2 | 1,039,220 | 42 | 0 | **PASS** |
| C close-up, vegetation on | 59.5 | 17.2 ms | 2.3 ms | 2 -> 2 | 1,546,696 | 88 | 33,000 | **PASS** |
| D close-up, vegetation + water | 60.0 | 17.1 ms | 1.8 ms | 2 -> 2 | 1,531,615 | 86 | 33,000 | **PASS** |
| E whole region (grey surround) | 60.0 | 17.3 ms | 3.6 ms | 2 -> 2 | 1,049,603 | 268 | 33,000 | **PASS** |

Against the launch run, C has about 5% more triangles (1.47M to 1.55M) and 13 more draw calls (one mesh per plant species), and the frame gaps are unchanged. The worst single JS callback was 35.2 ms (scenario B, once, a chunk loading). Capped at 60 fps, so this shows the phone keeps up, not its headroom. Not tested: an older phone, an iPhone, a long session, battery and warmth (not recorded).

## Shoreline shallows and foam on the phone (2026-11-18)

Branch `shoreline-foam` (`cb05ad8`): a paler tint and a foam edge along exposed shores, drawn by the water shader from a shore field computed at load (after the first frame). Same method and phone as above (Chrome 158, 411x777 at 2.625x, 60 Hz).

| Scenario | fps | p95 frame gap | p95 JS time per frame | Quality | Triangles | Draw calls | Result |
|---|---|---|---|---|---|---|---|
| A whole city (opening view) | 59.7 | 17.3 ms | 3.6 ms | 2 -> 2 | 574,447 | 152 | **PASS** |
| B close-up, vegetation off | 59.5 | 17.4 ms | 1.6 ms | 2 -> 2 | 1,039,220 | 42 | **PASS** |
| C close-up, vegetation on | 59.5 | 17.4 ms | 2.5 ms | 2 -> 2 | 1,546,696 | 88 | **PASS** |
| D close-up, vegetation + water | 59.7 | 17.0 ms | 2.0 ms | 2 -> 2 | 1,546,696 | 88 | **PASS** |
| E whole region (grey surround) | 60.0 | 17.4 ms | 3.3 ms | 2 -> 2 | 1,049,603 | 268 | **PASS** |

Frame gaps match the run above to within 0.3 ms; the foam adds no geometry (B to E triangles and calls unchanged). The worst single JS callback was 22.9 ms (B, once, a chunk loading). Not measured: the one-off time to compute the shore field on the phone (about 110 ms on a Mac; it runs after the map first appears).

## Waterline notch fix on the phone (2026-11-18)

Branch `waterline-notches` (`022d659`): above the water surface the habitat shader no longer blends in sea colours, and pixels on steep banks take their colour from the nearest land cells (a ring lookup that only those pixels pay for). Same method and phone as above (Chrome 158, 411x777 at 2.625x, 60 Hz).

| Scenario | fps | p95 frame gap | p95 JS time per frame | Quality | Triangles | Draw calls | Result |
|---|---|---|---|---|---|---|---|
| A whole city (opening view) | 60.0 | 17.5 ms | 3.5 ms | 2 -> 2 | 531,585 | 132 | **PASS** |
| B close-up, vegetation off | 59.7 | 17.4 ms | 1.8 ms | 2 -> 2 | 842,612 | 36 | **PASS** |
| C close-up, vegetation on | 59.5 | 17.3 ms | 2.2 ms | 2 -> 2 | 1,546,696 | 88 | **PASS** |
| D close-up, vegetation + water | 60.0 | 17.1 ms | 2.4 ms | 2 -> 2 | 1,531,615 | 86 | **PASS** |
| E whole region (grey surround) | 60.0 | 17.3 ms | 3.1 ms | 2 -> 2 | 1,049,603 | 268 | **PASS** |

Frame gaps match the shoreline run to within 0.2 ms, and JS time per frame to within 0.4 ms. The fix is shader-only. The lower triangle counts in A, B and D come from how many chunks had streamed in when each scenario was sampled; this change adds no geometry.

## Water ripples without the grid, on the phone (2026-11-18)

Branch `water-ripples` (`4de25c7`, built before the creeks merge): three's lighting keeps the flat water normal; four long swell waves only shade the water, and the sun glint comes from three drifting noise octaves (chop), each faded out below about 8 px. More per-pixel work across the whole sea, no new geometry. Same method and phone as above (Chrome 158, 411x777 at 2.625x, 60 Hz).

| Scenario | fps | p95 frame gap | p95 JS time per frame | Quality | Triangles | Draw calls | Result |
|---|---|---|---|---|---|---|---|
| A whole city (opening view) | 59.7 | 17.3 ms | 3.2 ms | 2 -> 2 | 574,447 | 152 | **PASS** |
| B close-up, vegetation off | 59.2 | 17.3 ms | 1.7 ms | 2 -> 2 | 1,039,220 | 42 | **PASS** |
| C close-up, vegetation on | 59.5 | 17.2 ms | 2.4 ms | 2 -> 2 | 1,546,696 | 88 | **PASS** |
| D close-up, vegetation + water | 59.7 | 17.3 ms | 2.0 ms | 2 -> 2 | 1,546,696 | 88 | **PASS** |
| E whole region (grey surround) | 60.0 | 17.3 ms | 2.9 ms | 2 -> 2 | 1,049,603 | 268 | **PASS** |

Frame gaps match the waterline-notch run to within 0.2 ms and JS time to within 0.4 ms, so the heavier water shader does not cost frames on this phone. The desktop run showed a higher JS-time p95 in A (3.9 ms against 1.7 ms) that the phone does not; it looks like run-to-run noise. Not measured here: the creeks layer (merged to main after this build).

## Creeks on the phone (2026-11-18)

The creeks layer (main `c54d1b8`, with the water ripples merged on top) measured on the same phone and method as above (Chrome 158, 411x777 at 2.625x, 60 Hz), on the live site. All five scenarios PASS at 59.5 to 60.0 fps, p95 frame gap 17.1 to 17.7 ms, quality 2 -> 2. The creek layer adds exactly 34,680 triangles and 8 draw calls in A, C, D and E against the water-ripples run; the p95 render time is up 0.9 ms in A and 0.1 to 0.4 ms elsewhere. Full table and reading: `docs/research/creeks-results.md`. Not measured: battery and warmth, an older phone, an iPhone, a long session.

## Contact shadows on the phone (2026-11-18)

Branch `contact-shadows` (built on main `21e6057`, creeks present): a soft dark patch under each tree and shrub, one instanced quad per planted chunk, transparent and drawn without depth writes. Same method and phone as above (Chrome 158, 411x777 at 2.625x, 60 Hz).

| Scenario | fps | p95 frame gap | p95 render time | Quality | Triangles | Draw calls | Result |
|---|---|---|---|---|---|---|---|
| A whole city (opening view) | 59.7 | 17.1 ms | 4.0 ms | 2 -> 2 | 609,127 | 160 | **PASS** |
| B close-up, vegetation off | 59.5 | 17.3 ms | 2.1 ms | 2 -> 2 | 1,073,900 | 50 | **PASS** |
| C close-up, vegetation on | 59.5 | 17.5 ms | 3.0 ms | 2 -> 2 | 1,617,404 | 112 | **PASS** |
| D close-up, vegetation + water | 60.0 | 17.2 ms | 2.3 ms | 2 -> 2 | 1,602,323 | 110 | **PASS** |
| E whole region (grey surround) | 60.0 | 17.4 ms | 3.4 ms | 2 -> 2 | 1,084,283 | 276 | **PASS** |

Against the creeks run (`creeks-results.md`): C has 36,028 more triangles and 16 more draw calls, the shadow quads (two triangles each) of the planted chunks in view; D drew slightly fewer chunks when sampled. A and E are unchanged in triangles and calls, so no shadows are drawn at those distances, and B has vegetation off. Frame gaps are 17.1 to 17.5 ms against 17.1 to 17.7 ms before; the p95 render time is up 0.5 ms in C, 0.2 ms in E and unchanged elsewhere. The shadows do not cost frames on this phone. Not measured: battery and warmth, an older phone, an iPhone, a long session.

## Ground colour variation on the phone (2026-11-18)

Branch `ground-variation` (`a25ebce`, on main `5d52e46`): land colours vary in soft broad patches (lighter or darker, warm or cool) with fine mottling, from a 256x256 tiling noise texture baked once at load and fetched twice per pixel. A first version computed the noise in the shader and dropped the desktop bench from 120 to 60 fps in every scenario (main without it: 120); the baked texture brought it back to ~120. Same method and phone as above (Chrome 158, 411x777 at 2.625x, 60 Hz).

| Scenario | fps | p95 frame gap | p95 render time | Quality | Triangles | Draw calls | Result |
|---|---|---|---|---|---|---|---|
| A whole city (opening view) | 59.7 | 17.3 ms | 3.8 ms | 2 -> 2 | 609,127 | 160 | **PASS** |
| B close-up, vegetation off | 59.2 | 17.3 ms | 1.9 ms | 2 -> 2 | 1,073,900 | 50 | **PASS** |
| C close-up, vegetation on | 59.5 | 17.1 ms | 2.8 ms | 2 -> 2 | 1,353,714 | 98 | **PASS** |
| D close-up, vegetation + water | 59.7 | 17.2 ms | 2.3 ms | 2 -> 2 | 1,617,404 | 112 | **PASS** |
| E whole region (grey surround) | 59.7 | 17.4 ms | 3.2 ms | 2 -> 2 | 1,084,283 | 276 | **PASS** |

Against the contact-shadows run: frame gaps within 0.2 ms, p95 render time equal or up to 0.2 ms lower. The change adds no geometry; C had fewer chunks streamed in when sampled (D matches the shadows run's C exactly). The phone is capped at 60 Hz, so this shows it keeps up, not its GPU headroom. Not measured: battery and warmth, an older phone, an iPhone, a long session.

## Tone mapping on the phone (2026-11-18)

Branch `tone-mapping` (`36cb8b1`, built on main `dc5de3a`, before the zoom-dependent creek width `56dc697`): three's NeutralToneMapping at exposure 1.4 (`viewer/src/toneMapping.ts`). Colours about a third richer, relief deeper, scene 5-10% brighter; clipping unchanged (it was already under 0.5% of pixels). Same method and phone as above (Chrome 158, 411x777 at 2.625x, 60 Hz).

| Scenario | fps | p95 frame gap | p95 render time | Quality | Triangles | Draw calls | Result |
|---|---|---|---|---|---|---|---|
| A whole city (opening view) | 59.7 | 17.1 ms | 3.5 ms | 2 -> 2 | 611,784 | 167 | **PASS** |
| B close-up, vegetation off | 59.2 | 17.4 ms | 2.0 ms | 2 -> 2 | 1,073,900 | 50 | **PASS** |
| C close-up, vegetation on | 59.5 | 17.5 ms | 2.7 ms | 2 -> 2 | 1,353,714 | 98 | **PASS** |
| D close-up, vegetation + water | 59.7 | 17.2 ms | 2.5 ms | 2 -> 2 | 1,617,404 | 112 | **PASS** |
| E whole region (grey surround) | 59.7 | 17.3 ms | 3.2 ms | 2 -> 2 | 1,167,035 | 281 | **PASS** |

Against the ground-variation run: frame gaps within 0.2 ms, p95 render time within 0.3 ms either way. Tone mapping adds no geometry; the higher triangle and call counts in A and E come from more chunks having streamed in when sampled. Desktop bench A-E unchanged at ~120 fps. Not measured: battery and warmth, an older phone, an iPhone, a long session, and this exact build with the zoom-dependent creek width.


## Creek zoom-dependent width on the phone (2026-11-18)

Same phone and method as above (Chrome 158, 411x777 at 2.625x, 60 Hz), live site with the zoom-dependent creek width and the later visual work (contact shadows, ground colour variation, tone mapping). All five scenarios PASS at 59.5 to 59.7 fps, p95 frame gap 17.1 to 17.6 ms, quality 2 -> 2. Scenario E is unchanged from the earlier creeks run (1,084,283 triangles, 276 calls), so the ribbon rebuilds at width changes add no geometry. Table and reading: `docs/research/creeks-results.md`. Not measured: battery and warmth, visible pulsing of the width steps during a continuous pinch zoom, an older phone, an iPhone.

## Blender tree models on the phone (2026-11-18)

Branch `blender-trees` (main `391ef07`): oak, bay and willow drawn from Blender GLB models (`pipeline/yelamu/plants.py`, `viewer/src/vegetation/glb.ts`) instead of the procedural shapes. Same phone and method as above (Chrome 158, 411x777 at 2.625x, 60 Hz). Three tree sets were benched in a row; scene C (close-up, vegetation on) is the one that moves:

| Tree set (oak / bay / willow triangles) | C fps | C p95 frame gap | D fps | D p95 frame gap | Result |
|---|---|---|---|---|---|
| Simple Blender set (200 / 130 / 190) | 59.5 | 17.2 ms | 59.7 | 17.1 ms | **PASS** |
| Detailed (370 / 320 / 380) | 53.5 | 28.4 ms | 55.0 | 28.1 ms | PASS, but drops frames |
| **Trimmed detailed, shipped (250 / 260 / 250)** | 59.5 | 17.3 ms | 59.2 | 20.5 ms | **PASS** |

A, B and E stayed at 59.2 to 60 fps, gaps 17.2 to 17.5 ms, in every run. p95 render (CPU submit) stayed 2.2 to 3.1 ms throughout: the detailed set's cost was on the GPU. Triangle counts in C vary between runs (1.56M to 1.94M) with how many chunks had streamed in, so compare fps and gaps, not triangles. Keep `DETAILED_MAX_TRIANGLES` (260) unless a new phone bench says otherwise. Not measured: battery and warmth, an older phone, an iPhone, a long session.

## Distance haze on the phone (2026-11-18)

Branch `haze-sky` (`e43f5cc`, on main `4e830e7`): far ground and water fade to a pale blue-grey (`viewer/src/haze.ts`, three's fog with an exponential curve from 1.5 km past the view target, scale 5 km, at most 80%). Same phone and method as above (Chrome 158, 411x777 at 2.625x, 60 Hz).

| Scenario | fps | p95 frame gap | p95 render time | Quality | Triangles | Draw calls | Result |
|---|---|---|---|---|---|---|---|
| A whole city (opening view) | 59.7 | 17.2 ms | 4.2 ms | 2 -> 2 | 609,127 | 160 | **PASS** |
| B close-up, vegetation off | 59.7 | 17.8 ms | 3.6 ms | 2 -> 2 | 1,073,900 | 50 | **PASS** |
| C close-up, vegetation on | 59.5 | 17.6 ms | 2.6 ms | 2 -> 2 | 1,672,254 | 98 | **PASS** |
| D close-up, vegetation + water | 60 | 17.1 ms | 2.4 ms | 2 -> 2 | 1,920,863 | 110 | **PASS** |
| E whole region (grey surround) | 59.7 | 17.4 ms | 3.2 ms | 2 -> 2 | 1,084,283 | 276 | **PASS** |

Against the trimmed tree run: C within 0.3 ms, D 3 ms better (run-to-run noise). The haze adds no geometry, pass or texture. Desktop bench A-E ~120 fps, counts unchanged. A sky gradient was dropped: the sea planes cover the whole screen at every zoom, so scene.background is never seen. Not measured: battery and warmth, an older phone, an iPhone.

## Plant grow-in on the phone (2026-11-18)

Branch `plant-fade-in` (`d367fd5`, on main `71cc05f`): newly planted chunks grow in over 0.4 s from 30% size (`VegetationLayer.animate`, instance matrices rescaled on the CPU; off under reduced motion). Same phone and method as above (Chrome 158, 411x777 at 2.625x, 60 Hz).

| Scenario | fps | p95 frame gap | p95 render time | Quality | Triangles | Draw calls | Result |
|---|---|---|---|---|---|---|---|
| A whole city (opening view) | 59.7 | 17.1 ms | 3.6 ms | 2 -> 2 | 609,127 | 160 | **PASS** |
| B close-up, vegetation off | 59.0 | 17.2 ms | 1.9 ms | 2 -> 2 | 1,073,900 | 50 | **PASS** |
| C close-up, vegetation on | 59.5 | 17.6 ms | 3.0 ms | 2 -> 2 | 1,935,944 | 112 | **PASS** |
| D close-up, vegetation + water | 59.7 | 17.2 ms | 2.2 ms | 2 -> 2 | 1,935,944 | 112 | **PASS** |
| E whole region (grey surround) | 59.7 | 17.2 ms | 3.1 ms | 2 -> 2 | 1,084,283 | 276 | **PASS** |

C and D plant chunks during the run and match the haze run (C 59.5 fps / 17.6 ms both times), so the matrix uploads while growing cost no frames. Desktop bench A-E at the Mac's 60 Hz cap, render p95 and counts unchanged. Bare rock on steep slopes was tried and dropped first: in the 10 m DEM only 0.4% of land is steeper than 28 degrees (none past 35), and 97% of land over 20 degrees is the grey unmapped south-west hills, so the rock barely showed. Not measured: battery and warmth, an older phone, an iPhone.

## Ring edge mist on the phone (2026-11-18)

Branch `ring-edge-fade` (`8d7419e`, on main `625d3f8`): the grey ring's outer edge fades into the haze colour over its last 3.5 km (`viewer/src/haze.ts`, edge term in the fog step; rectangle baked in before the first frame). Same phone and method as above (Chrome 158, 411x777 at 2.625x, 60 Hz).

| Scenario | fps | p95 frame gap | p95 render time | Quality | Triangles | Draw calls | Result |
|---|---|---|---|---|---|---|---|
| A whole city (opening view) | 59.7 | 17.1 ms | 3.8 ms | 2 -> 2 | 609,127 | 160 | **PASS** |
| B close-up, vegetation off | 59.5 | 17.2 ms | 2.1 ms | 2 -> 2 | 1,073,900 | 50 | **PASS** |
| C close-up, vegetation on | 59.5 | 17.4 ms | 3.4 ms | 2 -> 2 | 1,935,944 | 112 | **PASS** |
| D close-up, vegetation + water | 59.5 | 20.8 ms | 2.5 ms | 2 -> 2 | 1,920,863 | 110 | **PASS** |
| E whole region (grey surround) | 60 | 17.6 ms | 3.2 ms | 2 -> 2 | 1,084,283 | 276 | **PASS** |

D's gap is within the 17-20.5 ms seen across earlier runs (render p95 unchanged), read as noise. Desktop bench A-E ~120 fps, counts unchanged. A canopy texture for zoomed-out woodland was tried and dropped first: at those zooms the woodland is mostly ribbons 4-10 px wide, so crowns (16 m, then 36 m) only lightened it. Not measured: battery and warmth, an older phone, an iPhone.
