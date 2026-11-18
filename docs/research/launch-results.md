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
- The unsent introduction to the Association of Ramaytush Ohlone (`docs/research/aro-outreach-draft.md`) is public in the repository now; send it soon.
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
