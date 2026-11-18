import { describe, expect, it } from "vitest";
import { CREEK_LAYERS, creekLayerDefs } from "./creeksModule";

describe("creekLayerDefs", () => {
  it("offers a toggle only for each layer the dataset has", () => {
    expect(creekLayerDefs({})).toEqual([]);
    expect(creekLayerDefs({ creeks_mapped: 26, creeks_modelled: 0 }).map((d) => d.id)).toEqual(["creeks"]);
    expect(creekLayerDefs({ creeks_mapped: 0, creeks_modelled: 40 }).map((d) => d.id)).toEqual(["modelled-streams"]);
    expect(creekLayerDefs({ creeks_mapped: 26, creeks_modelled: 40 }).map((d) => d.id)).toEqual(["creeks", "modelled-streams"]);
  });

  it("labels them and turns both on by default", () => {
    expect(CREEK_LAYERS.creeks).toMatchObject({ label: "Historical creeks", defaultOn: true });
    expect(CREEK_LAYERS.modelled).toMatchObject({ id: "modelled-streams", label: "Modelled streams", defaultOn: true });
  });

  it("ignores junk counts", () => {
    expect(creekLayerDefs({ creeks_mapped: "26" as unknown as number, creeks_modelled: -1 })).toEqual([]);
    expect(creekLayerDefs({ creeks_mapped: Number.NaN })).toEqual([]);
  });
});
