/**
 * On-screen phone benchmark, loaded only with `?bench` (see main.ts). It runs the scenarios of
 * docs/research/phone-measurement.md (A to E) by itself and shows a results table, so a phone
 * needs no attached developer tools.
 */
import type { AppContext } from "./appContext";
import { PASS, summarize, verdict, type PanSummary } from "./benchMath";

interface Scenario {
  id: string;
  label: string;
  zoom: number;
  vegetation: boolean;
  water: boolean;
  /** Needs the grey surrounding terrain; skipped when the dataset has none. */
  needsContext?: boolean;
}

// Zoom 1 shows the whole city (coarse LOD); 10 is well past the LOD switch (full resolution).
const SCENARIOS: Scenario[] = [
  { id: "A", label: "whole city, vegetation on, water on", zoom: 1, vegetation: true, water: true },
  { id: "B", label: "close, vegetation off, water off", zoom: 10, vegetation: false, water: false },
  { id: "C", label: "close, vegetation on, water off", zoom: 10, vegetation: true, water: false },
  { id: "D", label: "close, vegetation on, water on", zoom: 10, vegetation: true, water: true },
  // Zoom 0.01 is far below any limit: the rig clamps it to the minimum zoom, which shows the whole ring.
  { id: "E", label: "whole region (grey surround), vegetation on, water on", zoom: 0.01, vegetation: true, water: true, needsContext: true },
];
const CLOSE_VIEW = { x: -2562, z: 126 }; // Golden Gate Park: woodland and scrub
const PAN_SECONDS = 4;
const SETTLE_MS = 2500;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function pan(canvas: HTMLCanvasElement, seconds: number, dxPerMove: number): Promise<PanSummary> {
  canvas.setPointerCapture = () => {}; // synthetic pointer ids cannot be captured
  const durations: number[] = [];
  const stamps: number[] = [];
  const orig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    orig((t) => {
      const s = performance.now();
      cb(t);
      durations.push(performance.now() - s);
      stamps.push(s);
    });
  const r = canvas.getBoundingClientRect();
  let x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  let dir = 1;
  let moves = 0;
  const fire = (type: string, buttons: number) =>
    canvas.dispatchEvent(
      new PointerEvent(type, { pointerId: 7, pointerType: "mouse", button: 0, buttons, clientX: x, clientY: y, bubbles: true }),
    );
  fire("pointerdown", 1);
  const t0 = performance.now();
  await new Promise<void>((res) => {
    const id = setInterval(() => {
      x += dir * dxPerMove;
      moves++;
      if (moves % 20 === 0) dir = -dir; // sweep back and forth so the view stays put
      fire("pointermove", 1);
      if (performance.now() - t0 > seconds * 1000) {
        clearInterval(id);
        res();
      }
    }, 8);
  });
  fire("pointerup", 0);
  window.requestAnimationFrame = orig;
  return summarize(durations, stamps, performance.now() - t0);
}

function setToggle(label: string, want: boolean): boolean | null {
  const box = [...document.querySelectorAll<HTMLInputElement>("input[type=checkbox]")].find((c) =>
    c.parentElement?.textContent?.includes(label),
  );
  if (!box) return null;
  if (!box.disabled && box.checked !== want) box.click();
  return box.checked;
}

interface Row {
  id: string;
  label: string;
  summary: PanSummary;
  triangles: number;
  drawCalls: number;
  lod: number;
  plants: number;
  levelStart: number;
  levelEnd: number;
  waterOn: boolean | null;
  pass: boolean;
  reasons: string[];
}

export function startBench(ctx: AppContext): void {
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;left:8px;right:8px;top:8px;z-index:100;max-height:70vh;overflow:auto;padding:10px;" +
    "background:rgba(0,0,0,.85);color:#fff;border-radius:8px;font:12px/1.4 ui-monospace,monospace";
  const title = document.createElement("div");
  title.textContent = `Yelamu benchmark. Pass: at least ${PASS.minFps} fps, p95 frame gap under ${PASS.maxGapP95Ms} ms, quality not dropped.`;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Run the benchmark (about 40 s; keep the screen on and do not touch it)";
  button.style.cssText = "display:block;margin:8px 0;padding:10px 12px;font:600 14px system-ui;width:100%";
  const out = document.createElement("pre");
  out.style.cssText = "margin:0;white-space:pre-wrap;word-break:break-word";
  box.append(title, button, out);
  document.body.appendChild(box);

  button.addEventListener("click", async () => {
    button.disabled = true;
    const rows: Row[] = [];
    out.textContent = "Running...\n";
    try {
      for (const sc of SCENARIOS) {
        out.textContent += `Scenario ${sc.id}: ${sc.label}\n`;
        if (sc.needsContext && !ctx.meta.context_file) {
          out.textContent += "  skipped: this dataset has no surrounding terrain\n";
          continue;
        }
        setToggle("Vegetation", sc.vegetation);
        const waterOn = setToggle("Water motion", sc.water);
        const ring = ctx.rig.getLimits().bounds;
        ctx.rig.setState(
          sc.needsContext
            ? { x: ring.centerX ?? 0, z: ring.centerZ ?? 0, zoom: sc.zoom } // clamps to the minimum zoom: the whole ring
            : sc.zoom > 2
              ? { ...CLOSE_VIEW, zoom: sc.zoom }
              : { x: 0, z: 0, zoom: sc.zoom },
        );
        ctx.requestRender();
        await sleep(SETTLE_MS);
        const levelStart = ctx.quality.level();
        const summary = await pan(ctx.canvas, PAN_SECONDS, 12);
        const levelEnd = ctx.quality.level();
        const ts = ctx.terrain.stats();
        const v = verdict({ effectiveFps: summary.effectiveFps, gapP95: summary.frameGapMs.p95, levelStart, levelEnd });
        rows.push({
          id: sc.id,
          label: sc.label,
          summary,
          triangles: ctx.renderer.info.render.triangles,
          drawCalls: ctx.renderer.info.render.calls,
          lod: ts.lod,
          plants: ctx.vegetation?.stats().instances ?? 0,
          levelStart,
          levelEnd,
          waterOn,
          pass: v.pass,
          reasons: v.reasons,
        });
        await sleep(1500); // let the device cool a little between runs
      }
    } catch (err) {
      out.textContent += `\nStopped: ${err instanceof Error ? err.message : String(err)}\n`;
    }
    const lines = rows.map(
      (r) =>
        `${r.id} ${r.pass ? "PASS" : "FAIL"}  fps ${r.summary.effectiveFps}  gap p95 ${r.summary.frameGapMs.p95} ms  ` +
        `render p95 ${r.summary.cbMs.p95} ms  quality ${r.levelStart}->${r.levelEnd}  LOD ${r.lod}  ` +
        `${r.triangles.toLocaleString()} tris  ${r.drawCalls} calls  ${r.plants} plants` +
        (r.reasons.length ? `\n   ${r.reasons.join("; ")}` : ""),
    );
    const ua = navigator.userAgent;
    out.textContent =
      `${lines.join("\n")}\n\nDevice: ${ua}\nScreen: ${innerWidth}x${innerHeight} @${devicePixelRatio}x, ` +
      `coarse pointer: ${matchMedia("(pointer: coarse)").matches}, reduced motion: ${matchMedia("(prefers-reduced-motion: reduce)").matches}\n` +
      `Take a screenshot of this box. Also note the battery % before and after, and whether the phone felt warm.\n\n` +
      JSON.stringify(rows.map((r) => ({ id: r.id, pass: r.pass, ...r.summary })), null, 1);
    button.disabled = false;
    button.textContent = "Run again";
  });
}
