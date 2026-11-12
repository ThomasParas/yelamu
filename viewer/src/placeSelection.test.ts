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
});
