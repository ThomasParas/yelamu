import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPalette,
  GROUP_COLORS,
  makeColorAt,
  paletteToLinear,
  seaClassIds,
  shadeByDepth,
  srgbToLinear,
  type HabitatClass,
} from "./habitat";
import { loadHabitat } from "./heightmap";

const GROUPS = [
  "unmapped",
  "water",
  "marsh",
  "dune",
  "beach",
  "woodland",
  "grassland",
  "scrub",
  "wetland",
  "rock",
];

describe("GROUP_COLORS", () => {
  it("has a colour for every habitat group", () => {
    for (const g of GROUPS) expect(typeof GROUP_COLORS[g]).toBe("number");
  });
});

describe("buildPalette", () => {
  const classes: HabitatClass[] = [
    { id: 0, name: "Unmapped", group: "unmapped" },
    { id: 1, name: "Bay", group: "water" },
    { id: 3, name: "Oak", group: "woodland" },
  ];
  const p = buildPalette(classes);

  it("has 3 floats per class id up to the maximum id", () => {
    expect(p).toBeInstanceOf(Float32Array);
    expect(p.length).toBe(4 * 3);
  });

  it("stores plain sRGB floats in 0..1", () => {
    expect(p[3]).toBeCloseTo(0x3f / 255, 5);
    expect(p[4]).toBeCloseTo(0x7f / 255, 5);
    expect(p[5]).toBeCloseTo(0xa6 / 255, 5);
    expect(p[9]).toBeCloseTo(0x4f / 255, 5);
  });

  it("fills unused ids with the unmapped colour", () => {
    expect(p[6]).toBeCloseTo(0x9a / 255, 5);
    expect(p[7]).toBeCloseTo(0x94 / 255, 5);
    expect(p[8]).toBeCloseTo(0x84 / 255, 5);
  });

  it("falls back to the unmapped colour for an unknown group", () => {
    const q = buildPalette([{ id: 0, name: "?", group: "lava" }]);
    expect(q[0]).toBeCloseTo(0x9a / 255, 5);
    expect(q[2]).toBeCloseTo(0x84 / 255, 5);
  });

  it("returns an empty palette for no classes", () => {
    expect(buildPalette([]).length).toBe(0);
  });
});

describe("srgbToLinear / paletteToLinear", () => {
  it("maps the endpoints and a mid value", () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 6);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214041, 5);
    expect(srgbToLinear(0.02)).toBeCloseTo(0.02 / 12.92, 6);
  });

  it("converts a whole palette without touching the source", () => {
    const src = Float32Array.from([0, 0.5, 1]);
    const lin = paletteToLinear(src);
    expect(lin[1]).toBeCloseTo(0.214041, 5);
    expect(src[1]).toBe(0.5);
  });
});

describe("shadeByDepth", () => {
  const c: [number, number, number] = [0.8, 0.6, 0.4];

  it("leaves colours at or above the water level unchanged", () => {
    expect(shadeByDepth(c, 0.6, 0.6, 6)).toEqual(c);
    expect(shadeByDepth(c, 10, 0.6, 6)).toEqual(c);
  });

  it("darkens to 0.55 at max depth and clamps beyond it", () => {
    const at = shadeByDepth(c, -5.4, 0.6, 6);
    expect(at[0]).toBeCloseTo(0.8 * 0.55, 5);
    expect(at[2]).toBeCloseTo(0.4 * 0.55, 5);
    const deep = shadeByDepth(c, -100, 0.6, 6);
    expect(deep[1]).toBeCloseTo(0.6 * 0.55, 5);
  });

  it("is linear in depth", () => {
    const mid = shadeByDepth(c, -2.4, 0.6, 6); // depth 3 of 6
    expect(mid[0]).toBeCloseTo(0.8 * (1 - 0.45 * 0.5), 5);
  });

  it("does not mutate its input and tolerates maxDepth 0", () => {
    shadeByDepth(c, -3, 0.6, 6);
    expect(c).toEqual([0.8, 0.6, 0.4]);
    const z = shadeByDepth(c, -1, 0.6, 0);
    expect(z[0]).toBeCloseTo(0.8 * 0.55, 5);
  });
});

describe("makeColorAt", () => {
  const palette = Float32Array.from([1, 0, 0, 0, 1, 0]); // id 0 red, id 1 green
  const fallback: [number, number, number] = [0.5, 0.5, 0.5];
  const habitat = Uint8Array.from([0, 1, 7]);

  it("looks up the class colour for the cell", () => {
    const f = makeColorAt(palette, habitat, 0, 6, fallback);
    expect(f(0, 10)).toEqual([1, 0, 0]);
    expect(f(1, 10)).toEqual([0, 1, 0]);
  });

  it("uses the fallback for ids beyond the palette", () => {
    const f = makeColorAt(palette, habitat, 0, 6, fallback);
    expect(f(2, 10)).toEqual(fallback);
  });

  it("applies depth shading below the water level", () => {
    const f = makeColorAt(palette, habitat, 0, 6, fallback);
    const c = f(0, -6);
    expect(c[0]).toBeCloseTo(0.55, 5);
  });

  it("works without a habitat raster (fallback only)", () => {
    const f = makeColorAt(palette, null, 0, 6, fallback);
    expect(f(5, 10)).toEqual(fallback);
  });
});

describe("loadHabitat", () => {
  afterEach(() => vi.unstubAllGlobals());

  const meta = { width: 2, height: 2, habitat_file: "habitat.u8" };

  it("returns null when the dataset has no habitat file", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await loadHabitat("/assets/x", { width: 2, height: 2 })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches and returns the bytes", async () => {
    const fetchMock = vi.fn(async () => new Response(Uint8Array.from([1, 2, 3, 4])));
    vi.stubGlobal("fetch", fetchMock);
    const out = await loadHabitat("/assets/x", meta);
    expect(fetchMock).toHaveBeenCalledWith("/assets/x/habitat.u8");
    expect(Array.from(out!)).toEqual([1, 2, 3, 4]);
    expect(out).toBeInstanceOf(Uint8Array);
  });

  it("throws with url and status on HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 404 })));
    await expect(loadHabitat("/assets/x", meta)).rejects.toThrow(/\/assets\/x\/habitat\.u8.*404/);
  });

  it("throws on a size mismatch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Uint8Array.from([1, 2, 3]))));
    await expect(loadHabitat("/assets/x", meta)).rejects.toThrow(/expected 4 bytes/);
  });
});

describe("seaClassIds", () => {
  const classes: HabitatClass[] = [
    { id: 1, name: "Open bay", group: "water" },
    { id: 4, name: "Pond (hand-drawn)", group: "water" },
    { id: 6, name: "Beach", group: "beach" },
    { id: 13, name: "Deep ocean/bay", group: "water" },
  ];

  it("keeps the water classes that are not ponds", () => {
    expect(seaClassIds(classes, ["Pond (hand-drawn)"])).toEqual([1, 13]);
  });

  it("treats a missing or malformed pond list as no ponds", () => {
    expect(seaClassIds(classes, undefined)).toEqual([1, 4, 13]);
    expect(seaClassIds(classes, "Pond (hand-drawn)")).toEqual([1, 4, 13]);
  });

  it("never picks a pond class from the shipped map as sea", () => {
    const city = JSON.parse(readFileSync(new URL("../public/assets/real-city/meta.json", import.meta.url), "utf8"));
    const sea = seaClassIds(city.habitat_classes, city.processing.pond_classes);
    const names = city.habitat_classes.filter((c: HabitatClass) => sea.includes(c.id)).map((c: HabitatClass) => c.name);
    expect(names.length).toBeGreaterThan(0);
    for (const pond of city.processing.pond_classes) expect(names).not.toContain(pond);
  });
});
