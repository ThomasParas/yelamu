import { describe, expect, it } from "vitest";
import { CONFIDENCE_INFO, confidenceInfo } from "./confidence";

describe("confidence", () => {
  it("has a label and a one-sentence meaning for each level", () => {
    for (const key of ["documented", "inferred", "illustrative"] as const) {
      const info = CONFIDENCE_INFO[key];
      expect(info.label.length).toBeGreaterThan(3);
      expect(info.meaning.endsWith(".")).toBe(true);
      expect(info.meaning.split(". ").length).toBe(1);
    }
  });

  it("confidenceInfo handles known and unknown values", () => {
    expect(confidenceInfo("inferred")).toMatchObject({ key: "inferred", label: "Inferred" });
    expect(confidenceInfo("weird")).toMatchObject({ key: "unknown", label: "weird" });
    expect(confidenceInfo("")).toMatchObject({ key: "unknown", label: "Unknown" });
    expect(confidenceInfo("constructor").key).toBe("unknown");
  });
});
