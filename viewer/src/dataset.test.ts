import { describe, expect, it } from "vitest";
import { DEFAULT_DATASET, datasetFromSearch } from "./dataset";

describe("datasetFromSearch", () => {
  it("loads the real city when nothing is asked for", () => {
    expect(DEFAULT_DATASET).toBe("real-city");
    expect(datasetFromSearch("")).toBe("real-city");
    expect(datasetFromSearch("?debug")).toBe("real-city");
  });

  it("accepts a plain dataset name", () => {
    expect(datasetFromSearch("?data=slice")).toBe("slice");
    expect(datasetFromSearch("?x=1&data=city-synth&debug")).toBe("city-synth");
  });

  it("refuses names that could point at other paths", () => {
    for (const bad of ["../secret", "a/b", "A B", "real city", "%2e%2e", ""]) {
      expect(datasetFromSearch(`?data=${encodeURIComponent(bad)}`)).toBe("real-city");
    }
  });
});
