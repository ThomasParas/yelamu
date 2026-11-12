import { describe, expect, it } from "vitest";
import { buildSearchIndex, normalize, search, searchMetaLabel, type SearchItem } from "./search";

const it_ = (id: string, name: string, group: SearchItem["group"] = "landmark", kind = "other"): SearchItem => ({
  id,
  name,
  group,
  kind,
  x: 0,
  z: 0,
});
const names = (r: SearchItem[]) => r.map((i) => i.name);

describe("normalize", () => {
  it("lowercases, strips diacritics and punctuation, collapses whitespace", () => {
    expect(normalize("  St. Mary's   Square ")).toBe("st marys square");
    expect(normalize("Cañada Café")).toBe("canada cafe");
    expect(normalize("Mission-Creek / Channel")).toBe("mission creek channel");
    expect(normalize("O’Farrell")).toBe("ofarrell");
    expect(normalize("...")).toBe("");
  });
});

describe("search ranking", () => {
  const index = buildSearchIndex([
    it_("1", "Mission Dolores"),
    it_("2", "Mission", "street"),
    it_("3", "Old Mission Road", "street"),
    it_("4", "Commission Hall"),
    it_("5", "Mission Creek", "hotspot", "creek"),
  ]);

  it("ranks exact > prefix > word prefix > substring", () => {
    const r = search(index, "mission");
    expect(names(r)).toEqual(["Mission", "Mission Creek", "Mission Dolores", "Old Mission Road", "Commission Hall"]);
  });

  it("breaks prefix ties by group (hotspot, landmark, street), then shorter, then alphabetical", () => {
    const idx = buildSearchIndex([
      it_("a", "Lake Merced Blvd", "street"),
      it_("b", "Lake Merced", "landmark"),
      it_("c", "Lake Merced Vista", "hotspot", "lake"),
      it_("d", "Lake Mead", "landmark"),
      it_("e", "Lake Maxwell", "landmark"),
    ]);
    expect(names(search(idx, "lake m"))).toEqual([
      "Lake Merced Vista", // hotspot first
      "Lake Mead", // then landmarks: shorter names first
      "Lake Merced",
      "Lake Maxwell",
      "Lake Merced Blvd", // street last
    ]);
  });

  it("falls back to alphabetical order and then id", () => {
    const idx = buildSearchIndex([it_("2", "Bb"), it_("1", "Ba"), it_("3", "Bc")]);
    expect(names(search(idx, "b"))).toEqual([]); // too short
    expect(names(search(idx, "ba"))).toEqual(["Ba"]);
    const same = buildSearchIndex([it_("z", "Fort A"), it_("y", "Fort B")]);
    expect(names(search(same, "fort"))).toEqual(["Fort A", "Fort B"]);
  });

  it("matches words inside a name only at word starts for tier 2", () => {
    const idx = buildSearchIndex([it_("1", "Golden Gate Park"), it_("2", "Gatehouse Lane", "street")]);
    // "gate": word prefix of Golden Gate Park (tier 2) vs name prefix Gatehouse (tier 1)
    expect(names(search(idx, "gate"))).toEqual(["Gatehouse Lane", "Golden Gate Park"]);
  });

  it("handles multi-word queries and punctuation in the query", () => {
    expect(names(search(index, "mission  creek"))).toEqual(["Mission Creek"]);
    expect(names(search(index, "MISSION-CREEK!"))).toEqual(["Mission Creek"]);
    expect(names(search(index, "old mission"))).toEqual(["Old Mission Road"]);
  });
});

describe("search matching rules", () => {
  it("ignores case and diacritics on both sides", () => {
    const idx = buildSearchIndex([it_("1", "Cañada Hill")]);
    expect(names(search(idx, "CANADA"))).toEqual(["Cañada Hill"]);
    expect(names(search(idx, "cañada"))).toEqual(["Cañada Hill"]);
  });

  it("returns [] for empty, short or punctuation-only queries", () => {
    const idx = buildSearchIndex([it_("1", "A Place")]);
    expect(search(idx, "")).toEqual([]);
    expect(search(idx, "a")).toEqual([]);
    expect(search(idx, " a ")).toEqual([]);
    expect(search(idx, "...")).toEqual([]);
    expect(names(search(idx, "pl"))).toEqual(["A Place"]);
  });

  it("returns [] for no match and for an empty index", () => {
    expect(search(buildSearchIndex([it_("1", "Alpha")]), "zzz")).toEqual([]);
    expect(search(buildSearchIndex([]), "alpha")).toEqual([]);
  });

  it("respects the limit (default 8)", () => {
    const many = Array.from({ length: 20 }, (_, i) => it_(`i${i}`, `Street ${String(i).padStart(2, "0")}`, "street"));
    const idx = buildSearchIndex(many);
    expect(search(idx, "street")).toHaveLength(8);
    expect(search(idx, "street", 3)).toHaveLength(3);
    expect(search(idx, "street", 0)).toEqual([]);
    expect(search(idx, "street", 100)).toHaveLength(20);
    expect(names(search(idx, "street", 3))).toEqual(["Street 00", "Street 01", "Street 02"]);
  });
});

describe("buildSearchIndex dedupe", () => {
  it("keeps one item per normalised name", () => {
    const idx = buildSearchIndex([
      it_("s1", "Market St", "street"),
      it_("s2", "market  st.", "street"),
      it_("s3", "MARKET ST", "street"),
    ]);
    expect(search(idx, "market")).toHaveLength(1);
    expect(search(idx, "market")[0].id).toBe("s1");
  });

  it("prefers the higher group when names collide across groups", () => {
    const idx = buildSearchIndex([
      it_("s", "Lobos Creek", "street"),
      it_("h", "Lobos Creek", "hotspot", "creek"),
      it_("l", "Lobos Creek", "landmark"),
    ]);
    const r = search(idx, "lobos");
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("h");
  });

  it("skips items without a usable name", () => {
    const idx = buildSearchIndex([it_("1", ""), it_("2", "..."), it_("3", "Real")]);
    expect(idx.entries).toHaveLength(1);
  });
});

describe("searchMetaLabel", () => {
  it("shows group and kind", () => {
    expect(searchMetaLabel(it_("1", "x", "hotspot", "creek"))).toBe("Hotspot · creek");
    expect(searchMetaLabel(it_("1", "x", "landmark", "park"))).toBe("Landmark · park");
    expect(searchMetaLabel(it_("1", "x", "street", "primary"))).toBe("Street");
  });
});
