/** What the page says when the map data cannot be loaded. The detail is for `?debug` only. */
export function loadFailureMessage(err: unknown, debug: boolean): string {
  const base = "The map could not be loaded. Please check your connection and reload the page.";
  if (!debug) return base;
  return `${base} (${err instanceof Error ? err.message : String(err)})`;
}
