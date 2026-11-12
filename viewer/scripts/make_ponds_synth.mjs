// Synthetic freshwater ponds for exercising the viewer's pond layer (no real data).
// Reads public/assets/city-synth/{meta.json, heightmap.u16} (run make:city-synth first), then:
//   - writes ponds.json with TWO ponds over gentle land (the second has an island), and
//   - carves a bed under each pond in heightmap.u16 (cells inside the outline drop to 1.5 m
//     below the water level, island cells rise to 0.8 m above it), as the real pipeline does,
//   - sets meta.ponds_file and meta.hand_sources (hand_water, landforms and ponds rows).
// Idempotent: sites are chosen from terrain outside the ponds, which the carving never
// touches, and carving is a min()/max() against fixed targets, so a second run changes nothing.
// Everything here is fake: never copy it into a real dataset.
// Usage: node scripts/make_ponds_synth.mjs   then open  /?data=city-synth
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "city-synth");
const metaPath = join(dir, "meta.json");
const meta = JSON.parse(readFileSync(metaPath, "utf8"));
const heightsPath = join(dir, meta.heights_file);
const buf = readFileSync(heightsPath);
const { width: W, height: H, cell_m: CELL, min_m: MIN, max_m: MAX, water_level_m: WATER } = meta;
if (buf.length !== W * H * 2) throw new Error(`unexpected heightmap size ${buf.length}`);

const BED_DEPTH_M = 1.5; // how far below the water level the carved bed lies
const ISLAND_RISE_M = 0.8; // island cells are at least this far above the water level
const round1 = (n) => Math.round(n * 10) / 10;

const decode = (q) => MIN + (q / 65535) * (MAX - MIN);
const encode = (h) => Math.max(0, Math.min(65535, Math.round(((h - MIN) / (MAX - MIN)) * 65535)));
const cellOf = (x, z) => [
  Math.min(W - 1, Math.max(0, Math.round(x / CELL + (W - 1) / 2))),
  Math.min(H - 1, Math.max(0, Math.round(z / CELL + (H - 1) / 2))),
];
const heightAt = (x, z) => {
  const [c, r] = cellOf(x, z);
  return decode(buf.readUInt16LE((r * W + c) * 2));
};
const halfW = ((W - 1) * CELL) / 2;
const halfH = ((H - 1) * CELL) / 2;

// A wobbly closed outline: radii (rx, rz) rotated by `rot`, `n` points, `wobble` fractional bumps.
function outline(cx, cz, rx, rz, rot, n, wobble, phase) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    const k = 1 + wobble * Math.sin(3 * t + phase) + (wobble / 2) * Math.sin(5 * t + 2 * phase);
    const ex = rx * k * Math.cos(t);
    const ez = rz * k * Math.sin(t);
    pts.push(
      round1(cx + ex * Math.cos(rot) - ez * Math.sin(rot)),
      round1(cz + ex * Math.sin(rot) + ez * Math.cos(rot)),
    );
  }
  return pts;
}

function inside(ring, x, z) {
  let c = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[2 * i];
    const zi = ring[2 * i + 1];
    const xj = ring[2 * j];
    const zj = ring[2 * j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// Candidate sites: gentle land, judged by a band of terrain just outside the pond's reach
// (radius `reach` + 20..60 m), so the choice does not depend on what carving did inside.
function sampleBand(cx, cz, reach) {
  const hs = [];
  for (const r of [reach + 20, reach + 40, reach + 60]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 2 * Math.PI;
      hs.push(heightAt(cx + r * Math.cos(a), cz + r * Math.sin(a)));
    }
  }
  return hs;
}
function findSites(reach, maxRange, maxLevel) {
  const out = [];
  for (let z = -halfH + 600; z < halfH - 600; z += 100) {
    for (let x = -halfW + 600; x < halfW - 600; x += 100) {
      const hs = sampleBand(x, z, reach);
      const lo = Math.min(...hs);
      const hi = Math.max(...hs);
      if (lo > WATER + 3 && lo <= maxLevel && hi - lo <= maxRange) out.push({ x, z, level: round1(lo), d: Math.hypot(x, z) });
    }
  }
  return out.sort((a, b) => a.d - b.d);
}
function pickSites() {
  // Prefer ground below the high hills and close to the map centre, then relax.
  for (const maxLevel of [90, 400]) {
    for (const maxRange of [3, 5, 8]) {
      const sites = findSites(160, maxRange, maxLevel);
      if (sites.length === 0) continue;
      const a = sites[0];
      const b = sites.find((s) => Math.hypot(s.x - a.x, s.z - a.z) >= 1000);
      if (b) return [a, b];
    }
  }
  throw new Error("no gentle land found for two synthetic ponds");
}

const [siteA, siteB] = pickSites();

const ponds = [
  {
    id: "synthetic-pond-a",
    name: "Synthetic test pond A",
    level_m: siteA.level,
    source: "synthetic test data",
    confidence: "illustrative",
    rings: [outline(siteA.x, siteA.z, 130, 80, 0.45, 28, 0.08, 0.7)],
  },
  {
    id: "synthetic-pond-b",
    name: "Synthetic test pond B",
    level_m: siteB.level,
    source: "synthetic test data",
    confidence: "illustrative",
    rings: [
      outline(siteB.x, siteB.z, 140, 120, -0.3, 32, 0.07, 1.9),
      outline(siteB.x + 10, siteB.z - 5, 40, 32, 0.2, 10, 0.1, 0.3), // the island
    ],
  },
];

// Carve the beds.
let changed = 0;
for (const p of ponds) {
  const [outer, ...holes] = p.rings;
  const xs = outer.filter((_, i) => i % 2 === 0);
  const zs = outer.filter((_, i) => i % 2 === 1);
  const [c0, r0] = cellOf(Math.min(...xs) - CELL, Math.min(...zs) - CELL);
  const [c1, r1] = cellOf(Math.max(...xs) + CELL, Math.max(...zs) + CELL);
  const bed = p.level_m - BED_DEPTH_M;
  const island = p.level_m + ISLAND_RISE_M;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const x = (c - (W - 1) / 2) * CELL;
      const z = (r - (H - 1) / 2) * CELL;
      if (!inside(outer, x, z)) continue;
      const off = (r * W + c) * 2;
      const h = decode(buf.readUInt16LE(off));
      const inHole = holes.some((ring) => inside(ring, x, z));
      const q = encode(inHole ? Math.max(h, island) : Math.min(h, bed));
      if (q !== buf.readUInt16LE(off)) {
        buf.writeUInt16LE(q, off);
        changed++;
      }
    }
  }
}
writeFileSync(heightsPath, buf);
writeFileSync(
  join(dir, "ponds.json"),
  JSON.stringify({ version: 1, ponds, processing: { synthetic: true, bed_depth_m: BED_DEPTH_M } }),
);

const handSources = [
  { layer: "hand_water", source: "synthetic test data", confidence: "illustrative", count: 3 },
  { layer: "landforms", source: "synthetic test data", confidence: "illustrative", count: 1 },
  { layer: "ponds", source: "synthetic test data", confidence: "illustrative", count: ponds.length },
];
if (meta.ponds_file !== "ponds.json" || JSON.stringify(meta.hand_sources) !== JSON.stringify(handSources)) {
  meta.ponds_file = "ponds.json";
  meta.hand_sources = handSources;
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
}
console.log(
  `ponds.json: ${ponds.map((p) => `${p.id} at (${p.rings[0][0]}, ${p.rings[0][1]}) level ${p.level_m} m`).join("; ")}; ` +
    `${changed} heightmap cells carved`,
);
