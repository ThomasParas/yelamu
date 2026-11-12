/** Pure accessibility helpers: WCAG contrast maths and a live-region announcement trick. */

function channel(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance of an 0xRRGGBB colour (0 = black, 1 = white). */
export function relativeLuminance(hex: number): number {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two 0xRRGGBB colours: 1 (identical) .. 21 (black on white). */
export function contrastRatio(hexA: number, hexB: number): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** True when the pair reaches `minRatio` (4.5 for normal text, 3 for large text and UI parts). */
export function meetsContrast(hexA: number, hexB: number, minRatio: number): boolean {
  // The tiny epsilon keeps exact-threshold pairs (e.g. 21:1) from failing on rounding.
  return contrastRatio(hexA, hexB) + 1e-9 >= minRatio;
}

/** `fg` at opacity `alpha` composited over opaque `bg`, as 0xRRGGBB. */
export function blend(fg: number, alpha: number, bg: number): number {
  const a = Math.min(1, Math.max(0, alpha));
  const mix = (shift: number) => {
    const f = (fg >> shift) & 255;
    const b = (bg >> shift) & 255;
    return Math.round(f * a + b * (1 - a)) & 255;
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/**
 * Live regions only announce CHANGES, so saying the same thing twice in a row is silent.
 * Returns `text`, or `text` plus a trailing no-break space when it equals `previous`
 * (alternating, so the result always differs from the last message).
 */
export function nextAnnouncement(text: string, previous: string): string {
  if (text !== previous) return text;
  return previous.endsWith(" ") ? text : `${text} `;
}
