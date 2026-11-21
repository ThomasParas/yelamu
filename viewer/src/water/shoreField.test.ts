import { describe, expect, it } from "vitest";
import {
  EXPOSED_CELLS,
  SHELTER_PUSH,
  SHORE_DEPTH_RANGE_M,
  SHORE_DIST_SCALE,
  chamferDistance,
  computeShoreField,
  dryMask,
} from "./shoreField";

/** Signed distance in cells from a G byte. */
const signed = (g: number) => (g - 128) / SHORE_DIST_SCALE;

describe("chamferDistance", () => {
  it("counts cells along a row and caps far values", () => {
    const d = chamferDistance(Uint8Array.from([1, 0, 0, 0, 0]), 5, 1, 3);
    expect(Array.from(d)).toEqual([0, 1, 2, 3, 3]);
  });

  it("uses sqrt(2) for a diagonal step, from either direction", () => {
    const t = new Uint8Array(9);
    t[8] = 1; // bottom-right corner of a 3x3 grid
    const d = chamferDistance(t, 3, 3, 10);
    expect(d[4]).toBeCloseTo(Math.SQRT2, 6); // centre
    expect(d[0]).toBeCloseTo(2 * Math.SQRT2, 6); // opposite corner
    expect(d[2]).toBe(2); // straight up the column
  });
});

describe("computeShoreField", () => {
  // A 20 x 3 strip: land in columns 0..4, then water deepening to 10 m.
  const width = 20;
  const level = 0;
  const strip = (depthAt: (col: number) => number) => {
    const h = new Float32Array(width * 3);
    for (let y = 0; y < 3; y++) for (let x = 0; x < width; x++) h[y * width + x] = x < 5 ? 5 : -depthAt(x);
    return h;
  };
  const open = strip((x) => Math.min(10, (x - 4) * 2));
  const f = computeShoreField(open, width, 3, level);
  const g = (x: number, field = f) => field[(width + x) * 2 + 1]; // middle row
  const r = (x: number, field = f) => field[(width + x) * 2];

  it("encodes depth below the water level (0 on land, full at the range)", () => {
    expect(r(2)).toBe(0);
    expect(r(5)).toBe(Math.round((2 / SHORE_DEPTH_RANGE_M) * 255));
    expect(r(19)).toBe(255);
  });

  it("puts the shoreline halfway between the last land and the first water sample", () => {
    expect(signed(g(5))).toBeCloseTo(0.5, 6); // first water cell
    expect(signed(g(4))).toBeCloseTo(-0.5, 6); // last land cell
    expect(signed(g(8))).toBeCloseTo(3.5, 6);
    expect(signed(g(0))).toBeCloseTo(-4.5, 6);
  });

  it("caps the distance at the byte's range", () => {
    expect(g(19)).toBe(Math.min(255, Math.round(128 + 14.5 * SHORE_DIST_SCALE)));
  });

  it("pushes the line out over sheltered shallows, so foam fades instead of filling a lagoon", () => {
    // Same shape, but the water never gets deeper than 10 cm: no open water anywhere.
    const lagoon = computeShoreField(strip(() => 0.1), width, 3, level);
    expect(signed(g(5, lagoon))).toBeGreaterThan(signed(g(5)) + SHELTER_PUSH);
    // land is unaffected
    expect(g(4, lagoon)).toBe(g(4));
  });

  it("leaves a shore with open water close by fully exposed", () => {
    // Open water (deeper than 1 m) starts at column 6, well within EXPOSED_CELLS.
    expect(EXPOSED_CELLS).toBeGreaterThan(1);
    expect(signed(g(5))).toBeCloseTo(0.5, 6);
  });

  it("counts dry cells (tidal marsh, flat) as land although they are under the water level", () => {
    // Columns 5..7 are 10 cm under water but marked dry: the shore moves out to column 8.
    const marsh = strip((x) => (x < 8 ? 0.1 : Math.min(10, (x - 4) * 2)));
    const dry = new Uint8Array(width * 3);
    for (let y = 0; y < 3; y++) for (let x = 5; x < 8; x++) dry[y * width + x] = 1;
    const m = computeShoreField(marsh, width, 3, level, dry);
    expect(r(6, m)).toBe(0); // no depth on the marsh
    expect(signed(g(7, m))).toBeCloseTo(-0.5, 6); // last marsh cell: land side of the line
    expect(signed(g(8, m))).toBeCloseTo(0.5, 6); // first open water cell
    expect(() => computeShoreField(marsh, width, 3, level, new Uint8Array(4))).toThrow(/dry mask/);
  });

  it("refuses heights that do not match the grid", () => {
    expect(() => computeShoreField(new Float32Array(5), 3, 2, 0)).toThrow(/expected 6/);
  });
});

describe("dryMask", () => {
  it("flags tidal marsh, tidal flat and hand-drawn marsh, not sloughs, lagoons or bay", () => {
    const classes = [
      { id: 2, name: "Bay (hand-drawn)" },
      { id: 3, name: "Marsh (hand-drawn)" },
      { id: 30, name: "Tidal coastal lagoon" },
      { id: 31, name: "Tidal flat" },
      { id: 32, name: "Tidal marsh" },
      { id: 33, name: "Tidal slough" },
    ];
    const m = dryMask(Uint8Array.from([2, 3, 30, 31, 32, 33, 99]), classes);
    expect(Array.from(m)).toEqual([0, 1, 0, 1, 1, 0, 0]);
  });
});
