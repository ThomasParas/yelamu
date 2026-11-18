import { describe, expect, it } from "vitest";
import { groupPlaces, layerAnnouncement, selectedAnnouncement } from "./placesList";

const h = (id: string, name: string, kind = "creek") => ({ id, name, kind });

describe("groupPlaces", () => {
  it("groups hotspots then landmarks, each sorted by name", () => {
    const groups = groupPlaces(
      [h("h2", "Lobos Creek"), h("h1", "Mission Creek"), h("h3", "laguna Dolores")],
      [h("l2", "Twin Peaks", "hill"), h("l1", "Alcatraz", "other")],
    );
    expect(groups.map((g) => g.title)).toEqual(["Hotspots", "Landmarks"]);
    expect(groups[0].items.map((i) => i.name)).toEqual(["laguna Dolores", "Lobos Creek", "Mission Creek"]);
    expect(groups[1].items.map((i) => i.name)).toEqual(["Alcatraz", "Twin Peaks"]);
  });

  it("keeps ids and kinds, and breaks name ties by id", () => {
    const [g] = groupPlaces([h("b", "Same"), h("a", "Same", "marsh")], []);
    expect(g.items).toEqual([
      { id: "a", name: "Same", kind: "marsh" },
      { id: "b", name: "Same", kind: "creek" },
    ]);
  });

  it("leaves out empty groups, blank names and duplicate ids", () => {
    expect(groupPlaces([], [])).toEqual([]);
    const groups = groupPlaces([h("a", "  "), h("b", "Real"), h("b", "Real again")], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual(["b"]);
    expect(groupPlaces([], [h("l", "Hill", "hill")]).map((g) => g.title)).toEqual(["Landmarks"]);
  });

  it("sorts numbers naturally and ignores accents' case", () => {
    const [g] = groupPlaces([h("a", "Spring 10"), h("b", "Spring 2"), h("c", "Élan")], []);
    expect(g.items.map((i) => i.name)).toEqual(["Élan", "Spring 2", "Spring 10"]);
  });

  it("does not modify its input", () => {
    const input = [h("b", "B"), h("a", "A")];
    groupPlaces(input, []);
    expect(input.map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("announcements", () => {
  it("formats selection and layer messages", () => {
    expect(selectedAnnouncement("Lobos Creek")).toBe("Selected: Lobos Creek");
    expect(layerAnnouncement("Streets", true)).toBe("Streets on");
    expect(layerAnnouncement("Water motion", false)).toBe("Water motion off");
  });
});

describe("groupPlaces with village sites", () => {
  it("lists Village sites between Hotspots and Landmarks, sorted by name", () => {
    const villages = [h("village-tubsinte", "Tubsinte", "village"), h("village-amuctac", "Amuctac", "village")];
    const groups = groupPlaces([h("h1", "Mission Creek")], [h("l1", "Alcatraz", "other")], villages);
    expect(groups.map((g) => g.title)).toEqual(["Hotspots", "Village sites", "Landmarks"]);
    expect(groups[1].items.map((i) => i.name)).toEqual(["Amuctac", "Tubsinte"]);
  });

  it("keeps working with two lists, and leaves an empty village group out", () => {
    expect(groupPlaces([h("h1", "A")], [h("l1", "B")]).map((g) => g.title)).toEqual(["Hotspots", "Landmarks"]);
    expect(groupPlaces([h("h1", "A")], [h("l1", "B")], []).map((g) => g.title)).toEqual(["Hotspots", "Landmarks"]);
    expect(groupPlaces([], [], [h("v", "V", "village")]).map((g) => g.title)).toEqual(["Village sites"]);
  });
});
