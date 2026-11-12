import { describe, expect, it } from "vitest";
import { PlaceSelection } from "./placeSelection";

describe("PlaceSelection", () => {
  it("starts from a valid initial id only", () => {
    expect(new PlaceSelection("mission-creek").get()).toBe("mission-creek");
    expect(new PlaceSelection("Bad Id").get()).toBeUndefined();
    expect(new PlaceSelection().get()).toBeUndefined();
  });

  it("notifies on real changes only", () => {
    const p = new PlaceSelection();
    const seen: Array<string | undefined> = [];
    p.onChange((id) => seen.push(id));
    p.set("a");
    p.set("a");
    p.set("b");
    p.set(undefined);
    p.set(undefined);
    expect(seen).toEqual(["a", "b", undefined]);
  });

  it("treats an invalid id as clearing", () => {
    const p = new PlaceSelection("a");
    p.set("<script>");
    expect(p.get()).toBeUndefined();
  });

  it("can be unsubscribed", () => {
    const p = new PlaceSelection();
    let n = 0;
    const off = p.onChange(() => n++);
    p.set("a");
    off();
    p.set("b");
    expect(n).toBe(1);
  });

  describe("restrictTo (only places that exist in the loaded overlay)", () => {
    const known = (id: string) => id === "mission-creek" || id === "twin-peaks";

    it("clears an unknown initial id once the known set is installed, notifying", () => {
      const p = new PlaceSelection("gone-place");
      const seen: Array<string | undefined> = [];
      p.onChange((id) => seen.push(id));
      p.restrictTo(known);
      expect(p.get()).toBeUndefined();
      expect(seen).toEqual([undefined]);
    });

    it("keeps a known initial id and stays silent", () => {
      const p = new PlaceSelection("twin-peaks");
      let n = 0;
      p.onChange(() => n++);
      p.restrictTo(known);
      expect(p.get()).toBe("twin-peaks");
      expect(n).toBe(0);
    });

    it("later set() calls with an unknown id clear the selection instead of keeping it", () => {
      const p = new PlaceSelection();
      p.restrictTo(known);
      const seen: Array<string | undefined> = [];
      p.onChange((id) => seen.push(id));
      p.set("mission-creek");
      p.set("hand-edited-id"); // e.g. a same-page hash edit
      expect(p.get()).toBeUndefined();
      p.set("hand-edited-id"); // nothing to clear: silent
      expect(seen).toEqual(["mission-creek", undefined]);
    });

    it("without a restriction every well-formed id is accepted (as before)", () => {
      const p = new PlaceSelection();
      p.set("anything-goes");
      expect(p.get()).toBe("anything-goes");
    });
  });
});
