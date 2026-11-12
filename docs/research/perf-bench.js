// Paste into the browser console (or the Browser pane's javascript tool) on a page opened with ?debug.
// Drives continuous panning through the page's own pointer handlers and reports the cost of
// each render callback and the gap between frames. Rendering is on demand, so the page only
// draws while input arrives; that is exactly the interactive case we want to measure.
window.__bench = async function (label, seconds, dxPerMove) {
  const canvas = document.getElementById("scene");
  canvas.setPointerCapture = () => {}; // synthetic pointer ids cannot be captured
  const durations = [], stamps = [];
  const orig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    orig((t) => { const s = performance.now(); cb(t); durations.push(performance.now() - s); stamps.push(s); });
  const r = canvas.getBoundingClientRect();
  let x = r.left + r.width / 2, y = r.top + r.height / 2, dir = 1, moves = 0;
  const fire = (type, buttons) =>
    canvas.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: "mouse", button: 0, buttons, clientX: x, clientY: y, bubbles: true }));
  fire("pointerdown", 1);
  const t0 = performance.now();
  await new Promise((res) => {
    const id = setInterval(() => {
      x += dir * dxPerMove; moves++;
      if (moves % 20 === 0) dir = -dir; // sweep back and forth so the view stays put
      fire("pointermove", 1);
      if (performance.now() - t0 > seconds * 1000) { clearInterval(id); res(); }
    }, 8);
  });
  fire("pointerup", 0);
  window.requestAnimationFrame = orig;
  const gaps = stamps.slice(1).map((s, i) => s - stamps[i]).sort((a, b) => a - b);
  const d = durations.slice().sort((a, b) => a - b);
  const q = (arr, p) => (arr.length ? +arr[Math.min(arr.length - 1, Math.floor(arr.length * p))].toFixed(1) : null);
  return {
    label, frames: durations.length,
    effectiveFps: +(durations.length / ((performance.now() - t0) / 1000)).toFixed(1),
    cbMs: { median: q(d, 0.5), p95: q(d, 0.95), max: q(d, 1) },
    frameGapMs: { median: q(gaps, 0.5), p95: q(gaps, 0.95) },
  };
};
// Example: JSON.stringify(await window.__bench("zoomed in, panning", 4, 12))
