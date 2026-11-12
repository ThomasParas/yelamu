// Synthetic whole-city dataset for exercising the chunked viewer (no real data).
// Writes public/assets/city-synth/{heightmap.u16, habitat.u8, meta.json}:
//   1760 x 1560 cells at 10 m, little-endian uint16 heights over [min_m, max_m],
//   one habitat class id byte per cell, row-major, row 0 = north.
// Usage: node scripts/make_city_synth.mjs   then open  /?data=city-synth[&debug]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = 1760;
const H = 1560;
const CELL_M = 10;
const MIN_M = -3;
const MAX_M = 280;
const WATER_LEVEL_M = 0.6;

const CLASSES = [
  { id: 0, name: "Unmapped", group: "unmapped" },
  { id: 1, name: "Open Bay Water", group: "water" },
  { id: 2, name: "Tidal Salt Marsh", group: "marsh" },
  { id: 3, name: "Active Dune Field", group: "dune" },
  { id: 4, name: "Sandy Beach", group: "beach" },
  { id: 5, name: "Coast Live Oak Woodland", group: "woodland" },
  { id: 6, name: "Redwood Stand", group: "woodland" },
  { id: 7, name: "Coastal Prairie", group: "grassland" },
  { id: 8, name: "Serpentine Grassland", group: "grassland" },
  { id: 9, name: "Northern Coastal Scrub", group: "scrub" },
  { id: 10, name: "Willow Riparian Wetland", group: "wetland" },
  { id: 11, name: "Rocky Outcrop", group: "rock" },
];

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Deterministic hash -> [0, 1).
function hash(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Bilinearly interpolated value noise with feature size `scale` cells.
function vnoise(x, y, scale, seed) {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const gauss = (x, y, cx, cy, sx, sy) =>
  Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2) / 2);

// Hills: [centre x, centre y (cells), sigma x, sigma y, peak metres].
const HILLS = [
  [520, 520, 190, 160, 205],
  [980, 1000, 240, 200, 180],
  [300, 1150, 160, 190, 150],
  [1150, 330, 130, 120, 120],
  [700, 800, 320, 300, 90],
];

/** Column of the eastern shoreline at row y. */
function shoreX(y) {
  return (
    0.78 * W +
    0.05 * W * Math.sin((y / H) * Math.PI * 4) +
    0.02 * W * Math.sin((y / H) * Math.PI * 11 + 1.3) +
    // A deeper bay mouth in the middle rows.
    0.06 * W * gauss(0, y, 0, 0.5 * H, 1, 0.12 * H)
  );
}

function buildHeight(x, y) {
  const shore = shoreX(y);
  const dist = x - shore; // > 0: into the bay
  let land = 4 + 3 * Math.sin(x / 90) * Math.cos(y / 110) + 6 * (vnoise(x, y, 40, 1) - 0.5);
  for (const [cx, cy, sx, sy, peak] of HILLS) land += peak * gauss(x, y, cx, cy, sx, sy);
  land += 14 * vnoise(x, y, 70, 2) * smoothstep(0, 200, -dist);
  // Flatten towards a low coastal plain near the shore so the beach is gentle.
  land *= smoothstep(-5, 90, -dist) * 0.97 + 0.03;
  land = Math.max(land, 1.2 * smoothstep(-5, 0, -dist) + 0.9);

  if (dist <= 0) return Math.min(land, MAX_M - 1);
  // Bay: slope from the shoreline down to a -3 m shelf over ~40 cells.
  const shelf = -3;
  const t = smoothstep(0, 40, dist);
  const edge = 0.9; // just above water level at the shoreline
  return edge + (shelf - edge) * t;
}

function classify(x, y, h, slope) {
  if (h < WATER_LEVEL_M) return 1;
  const shore = shoreX(y);
  const dist = shore - x; // cells inland from the shoreline
  const n1 = vnoise(x, y, 120, 11);
  const n2 = vnoise(x, y, 45, 12);
  const n3 = vnoise(x, y, 220, 13);
  if (h < 3 && dist < 14) return 4; // beach strip
  if (h < 4 && n1 > 0.45 && y < 0.5 * H) return 2; // tidal marsh, northern shore
  if (h < 5 && y > 0.6 * H && n2 > 0.6 && dist < 120) return 10; // riparian lowlands
  if (x < 0.22 * W && h < 40) return n2 > 0.35 ? 3 : 9; // dunes behind the west coast
  if (h > 170 && slope > 0.5) return 11; // summits and ledges
  if (h > 190) return 11;
  if (h > 60 && n1 > 0.5) return n3 > 0.55 ? 6 : 5; // wooded slopes
  if (h > 25 && n2 > 0.62) return 5;
  if (n3 > 0.62) return 8; // serpentine grassland patches
  if (n1 < 0.38) return 9; // scrub
  if (n2 < 0.12) return 0; // a few unmapped holes
  return 7; // coastal prairie
}

const count = W * H;
const heights = new Float32Array(count);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) heights[y * W + x] = buildHeight(x, y);

const q = Buffer.alloc(count * 2);
const habitat = Buffer.alloc(count);
const span = MAX_M - MIN_M;
let minH = Infinity;
let maxH = -Infinity;
const used = new Set();
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const h = heights[i];
    minH = Math.min(minH, h);
    maxH = Math.max(maxH, h);
    q.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(((h - MIN_M) / span) * 65535))), i * 2);
    const hx = heights[y * W + Math.min(W - 1, x + 1)] - h;
    const hy = heights[Math.min(H - 1, y + 1) * W + x] - h;
    const slope = Math.hypot(hx, hy) / CELL_M;
    const c = classify(x, y, h, slope);
    habitat[i] = c;
    used.add(c);
  }
}

const meta = {
  width: W,
  height: H,
  cell_m: CELL_M,
  min_m: MIN_M,
  max_m: MAX_M,
  heights_file: "heightmap.u16",
  heights_format: "uint16-le",
  water_level_m: WATER_LEVEL_M,
  habitat_file: "habitat.u8",
  habitat_classes: CLASSES,
  layers: [],
};

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "city-synth");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "heightmap.u16"), q);
writeFileSync(join(out, "habitat.u8"), habitat);
writeFileSync(join(out, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
console.log(
  `wrote ${out}\n  heights ${minH.toFixed(1)}..${maxH.toFixed(1)} m, classes used: ${[...used].sort((a, b) => a - b).join(",")}`,
);
