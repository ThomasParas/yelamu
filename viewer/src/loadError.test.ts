import { describe, expect, it } from "vitest";
import { loadFailureMessage } from "./loadError";

describe("loadFailureMessage", () => {
  it("tells a visitor what to do, without technical detail", () => {
    const m = loadFailureMessage(new Error("expected 5543230 bytes for 1771x1565, got 1952"), false);
    expect(m).toBe("The map could not be loaded. Please check your connection and reload the page.");
  });

  it("adds the detail in debug mode", () => {
    expect(loadFailureMessage(new Error("boom"), true)).toContain("(boom)");
    expect(loadFailureMessage("plain text", true)).toContain("(plain text)");
  });
});
