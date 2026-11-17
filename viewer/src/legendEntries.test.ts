import { describe, expect, it } from "vitest";
import { GROUP_COLORS } from "./habitat";
import { GROUP_LABELS, PONDS_LEGEND_NOTE, hexToCss, legendEntries, legendNotes } from "./legendEntries";

describe("hexToCss", () => {
  it("pads to six digits", () => {
    expect(hexToCss(0x3f7fa6)).toBe("#3f7fa6");
    expect(hexToCss(0x0000ff)).toBe("#0000ff");
    expect(hexToCss(0)).toBe("#000000");
  });
});

describe("legendEntries", () => {
  it("lists only groups present, once each, in legend order, with the terrain colours", () => {
    const e = legendEntries([
      { id: 0, name: "Unmapped", group: "unmapped" },
      { id: 1, name: "Redwood", group: "woodland" },
      { id: 2, name: "Oak", group: "woodland" },
      { id: 3, name: "Bay", group: "water" },
    ]);
    expect(e.map((x) => x.group)).toEqual(["water", "woodland", "unmapped"]);
    expect(e[0].label).toBe("Bay, ocean and ponds");
    expect(e[1].label).toBe("Oak and bay woodland");
    expect(e[2].label).toBe("Not covered by the historical habitat map (modern terrain shown for context)");
    expect(e[0].color).toBe("#3f7fa6");
  });

  it("treats unknown groups as unmapped and handles missing or empty classes", () => {
    expect(legendEntries([{ id: 1, name: "x", group: "lava" }]).map((x) => x.group)).toEqual(["unmapped"]);
    expect(legendEntries([{ id: 1, name: "x", group: "constructor" }]).map((x) => x.group)).toEqual(["unmapped"]);
    expect(legendEntries([])).toEqual([]);
    expect(legendEntries(undefined)).toEqual([]);
  });

  it("has a label for every colour group", () => {
    expect(GROUP_LABELS.map(([g]) => g).sort()).toEqual(Object.keys(GROUP_COLORS).sort());
  });
});

describe("legendNotes", () => {
  it("adds the ponds line only when the dataset has a ponds file", () => {
    expect(PONDS_LEGEND_NOTE).toBe("Ponds and lagoons sit at their own water level.");
    expect(legendNotes({ ponds_file: "ponds.json" })).toEqual([PONDS_LEGEND_NOTE]);
    expect(legendNotes({})).toEqual([]);
    expect(legendNotes({ ponds_file: "" })).toEqual([]);
    expect(legendNotes({ ponds_file: null })).toEqual([]);
  });
});
