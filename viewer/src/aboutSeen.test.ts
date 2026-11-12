import { describe, expect, it } from "vitest";
import { ABOUT_SEEN_KEY, takeFirstVisit } from "./aboutSeen";

const memory = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe("takeFirstVisit", () => {
  it("is true once, then false", () => {
    const s = memory();
    expect(takeFirstVisit(s)).toBe(true);
    expect(s.data.get(ABOUT_SEEN_KEY)).toBe("1");
    expect(takeFirstVisit(s)).toBe(false);
    expect(takeFirstVisit(s)).toBe(false);
  });

  it("uses the agreed key", () => {
    expect(ABOUT_SEEN_KEY).toBe("yelamu-about-seen");
  });

  it("shows the dialog when storage is unavailable", () => {
    expect(takeFirstVisit(null)).toBe(true);
  });

  it("shows the dialog when reading throws", () => {
    const s = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {},
    };
    expect(takeFirstVisit(s)).toBe(true);
  });

  it("still shows the dialog when writing throws", () => {
    const s = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(takeFirstVisit(s)).toBe(true);
  });

  it("default storage lookup does not throw in a non-browser environment", () => {
    expect(() => takeFirstVisit()).not.toThrow();
  });
});
