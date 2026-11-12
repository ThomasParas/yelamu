// Synthetic overlay for exercising the viewer's streets / labels / hotspots (no real data).
// Reads public/assets/city-synth/{meta.json, heightmap.u16} (run make:city-synth first),
// writes public/assets/city-synth/overlay.json and sets meta.overlay_file (idempotent).
// Everything here is fake: never copy these hotspots into a real dataset.
// Usage: node scripts/make_overlay_synth.mjs   then open  /?data=city-synth
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "city-synth");
const metaPath = join(dir, "meta.json");
const meta = JSON.parse(readFileSync(metaPath, "utf8"));
const buf = readFileSync(join(dir, meta.heights_file));
const { width: W, height: H, cell_m: CELL, min_m: MIN, max_m: MAX, water_level_m: WATER } = meta;
if (buf.length !== W * H * 2) throw new Error(`unexpected heightmap size ${buf.length}`);

const heightAtCell = (col, row) => {
  const c = Math.min(W - 1, Math.max(0, Math.round(col)));
  const r = Math.min(H - 1, Math.max(0, Math.round(row)));
  return MIN + (buf.readUInt16LE((r * W + c) * 2) / 65535) * (MAX - MIN);
};
// World metres (+x east, +z south, origin at the grid centre) <-> cells.
const heightAt = (x, z) => heightAtCell(x / CELL + (W - 1) / 2, z / CELL + (H - 1) / 2);
const isLand = (x, z) => heightAt(x, z) > WATER + 2;

const halfW = ((W - 1) * CELL) / 2;
const halfH = ((H - 1) * CELL) / 2;
const SPACING = 500; // metres between grid streets
const STEP = 50; // sampling along each street
const round1 = (n) => Math.round(n * 10) / 10;

const kindFor = (i) => (i % 6 === 0 ? "primary" : i % 2 === 0 ? "secondary" : "local");

// Walk a straight street, keep only the stretches on land (each stretch is one line).
function landRuns(points) {
  const lines = [];
  let run = [];
  for (const [x, z] of points) {
    if (isLand(x, z)) run.push(round1(x), round1(z));
    else {
      if (run.length >= 4) lines.push(run);
      run = [];
    }
  }
  if (run.length >= 4) lines.push(run);
  return lines;
}

const streets = [];
let n = 0;
for (let i = 0, x = -Math.floor(halfW / SPACING) * SPACING; x <= halfW; x += SPACING, i++) {
  const pts = [];
  for (let z = -halfH; z <= halfH; z += STEP) pts.push([x, z]);
  const lines = landRuns(pts);
  if (lines.length) streets.push({ name: `Test Street ${++n}`, kind: kindFor(i), lines });
}
for (let i = 0, z = -Math.floor(halfH / SPACING) * SPACING; z <= halfH; z += SPACING, i++) {
  const pts = [];
  for (let x = -halfW; x <= halfW; x += STEP) pts.push([x, z]);
  const lines = landRuns(pts);
  if (lines.length) streets.push({ name: `Test Street ${++n}`, kind: kindFor(i), lines });
}

// Spread landmarks / hotspots over land: scan a coarse lattice outward from the centre and
// take well-separated land points, highest ground first for the "hill" ones.
const candidates = [];
for (let z = -halfH + 400; z < halfH - 400; z += 200) {
  for (let x = -halfW + 400; x < halfW - 400; x += 200) {
    if (isLand(x, z)) candidates.push({ x, z, h: heightAt(x, z), d: Math.hypot(x, z) });
  }
}
candidates.sort((a, b) => a.d - b.d);
const chosen = [];
for (const c of candidates) {
  if (chosen.every((p) => Math.hypot(p.x - c.x, p.z - c.z) > 1500)) chosen.push(c);
  if (chosen.length === 9) break;
}
if (chosen.length < 9) throw new Error(`only found ${chosen.length} separated land points`);

// Rough lon/lat: 111.32 km per degree of latitude, centre at 37.77 N, 122.45 W.
const lonlat = (x, z) => ({
  lon: round1((-122.45 + x / (111320 * Math.cos((37.77 * Math.PI) / 180))) * 1e5) / 1e5,
  lat: round1((37.77 - z / 111320) * 1e5) / 1e5,
});

const landmarkDefs = [
  ["synthetic-park", "Test Park", "park"],
  ["synthetic-bridge", "Test Bridge", "bridge"],
  ["synthetic-hill", "Test Hill", "hill"],
  ["synthetic-hall", "Test Hall", "building"],
  ["synthetic-district", "Test District", "neighborhood"],
  ["synthetic-fort", "Test Fort", "fort"],
];
const landmarks = landmarkDefs.map(([id, name, kind], i) => ({
  id,
  name,
  kind,
  x: round1(chosen[i].x),
  z: round1(chosen[i].z),
  ...lonlat(chosen[i].x, chosen[i].z),
}));

const hotspotDefs = [
  ["synthetic-hotspot-a", "Synthetic test hotspot A", "creek"],
  ["synthetic-hotspot-b", "Synthetic test hotspot B", "lagoon"],
  ["synthetic-hotspot-c", "Synthetic test hotspot C", "dune"],
];
const hotspots = hotspotDefs.map(([id, name, kind], i) => {
  const c = chosen[6 + i];
  return {
    id,
    name,
    kind,
    x: round1(c.x),
    z: round1(c.z),
    ...lonlat(c.x, c.z),
    description: `${name} exists only to test the viewer. It does not describe any real place or event.`,
    sources: [{ title: "Synthetic test source", url: "https://example.org/synthetic" }],
    confidence: "illustrative",
  };
});

writeFileSync(join(dir, "overlay.json"), JSON.stringify({ version: 1, streets, landmarks, hotspots }));
if (meta.overlay_file !== "overlay.json") {
  meta.overlay_file = "overlay.json";
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
}
const pts = streets.reduce((s, st) => s + st.lines.reduce((a, l) => a + l.length / 2, 0), 0);
console.log(
  `overlay.json: ${streets.length} streets (${pts} points), ${landmarks.length} landmarks, ${hotspots.length} hotspots`,
);
