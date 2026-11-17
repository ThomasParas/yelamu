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
