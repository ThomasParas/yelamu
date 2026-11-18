import { MAX_WIDTH_M, WIDTH_STEP } from "./colors";

/**
 * World metres covered by one CSS pixel on an orthographic camera: the frustum height over the zoom
 * over the viewport height. Returns 0 (which asks for the close-up widths) when any input is not a
 * usable positive finite number.
 */
export function metersPerPixel(top: number, bottom: number, zoom: number, viewportHeightPx: number): number {
  const span = top - bottom;
  if (!(span > 0) || !Number.isFinite(span)) return 0;
  if (!(zoom > 0) || !Number.isFinite(zoom)) return 0;
  if (!(viewportHeightPx > 0) || !Number.isFinite(viewportHeightPx)) return 0;
  return span / zoom / viewportHeightPx;
}

/**
 * The ribbon width, metres, for a band whose close-up width is `baseM` and which should look about
 * `targetPx` CSS pixels wide when one pixel is `mPerPx` metres. That is max(baseM, targetPx * mPerPx),
 * rounded UP to the level baseM * WIDTH_STEP^n (smallest integer n >= 0 that reaches it), then cut to
 * MAX_WIDTH_M. Only whole levels come out, so the width changes (and the ribbon is rebuilt) only
 * when the zoom crosses a level; it never shrinks as mPerPx grows. A non-finite or non-positive
 * input gives baseM.
 */
export function ribbonWidth(baseM: number, targetPx: number, mPerPx: number): number {
  if (!(baseM > 0) || !Number.isFinite(baseM)) return baseM;
  if (!(targetPx > 0) || !Number.isFinite(targetPx)) return baseM;
  if (!(mPerPx > 0) || !Number.isFinite(mPerPx)) return baseM;
  const wanted = targetPx * mPerPx;
  if (wanted <= baseM) return baseM;
  // The 1e-9 keeps a wanted width that sits exactly on a level from jumping to the next one
  // through floating point error in the logarithm.
  let n = Math.max(0, Math.ceil(Math.log(wanted / baseM) / Math.log(WIDTH_STEP) - 1e-9));
  // Guard the logarithm: step down while the level below still reaches, up while this one falls short.
  while (n > 0 && baseM * WIDTH_STEP ** (n - 1) >= wanted) n--;
  while (baseM * WIDTH_STEP ** n < wanted * (1 - 1e-12)) n++;
  return Math.min(MAX_WIDTH_M, baseM * WIDTH_STEP ** n);
}
