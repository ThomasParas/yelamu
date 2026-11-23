/**
 * Compass helpers, pure. The camera azimuth (viewRig.ts) is also the angle of true north on
 * screen, measured clockwise from straight up: azimuth 0 looks due north (camera.ts isoOffset).
 */

const DIRECTIONS = ["up", "up-right", "right", "down-right", "down", "down-left", "left", "up-left"] as const;

/** Azimuth in degrees, wrapped into 0..360 (what the compass needle is rotated by). */
export function northDegrees(azimuth: number): number {
  if (!Number.isFinite(azimuth)) return 0;
  const d = ((azimuth * 180) / Math.PI) % 360;
  return d < 0 ? d + 360 : d;
}

/** Where north points on screen, to the nearest 45 degrees: "up", "up-right", ... */
export function northDirection(azimuth: number): (typeof DIRECTIONS)[number] {
  return DIRECTIONS[Math.round(northDegrees(azimuth) / 45) % 8];
}

/** Accessible name of the compass button. */
export function compassLabel(azimuth: number): string {
  const dir = northDirection(azimuth);
  return dir === "up" ? "Compass: north is up" : `Compass: north is ${dir}. Turn the map so north is up`;
}
