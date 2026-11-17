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
