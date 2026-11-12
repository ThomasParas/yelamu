import { describe, expect, it } from "vitest";
import { keyAction } from "./keys";

describe("keyAction mappings", () => {
  it("arrows pan in the direction the view should move on screen", () => {
    expect(keyAction({ key: "ArrowLeft" })).toEqual({ type: "pan", dx: -1, dy: 0 });
    expect(keyAction({ key: "ArrowRight" })).toEqual({ type: "pan", dx: 1, dy: 0 });
    expect(keyAction({ key: "ArrowUp" })).toEqual({ type: "pan", dx: 0, dy: -1 });
    expect(keyAction({ key: "ArrowDown" })).toEqual({ type: "pan", dx: 0, dy: 1 });
  });

  it("WASD is not bound", () => {
    for (const k of ["w", "a", "s", "d"]) expect(keyAction({ key: k })).toBeNull();
  });

  it("+ and = zoom in; - and _ zoom out", () => {
    expect(keyAction({ key: "+", shiftKey: true })).toEqual({ type: "zoom", dir: 1 });
    expect(keyAction({ key: "=" })).toEqual({ type: "zoom", dir: 1 });
    expect(keyAction({ key: "-" })).toEqual({ type: "zoom", dir: -1 });
    expect(keyAction({ key: "_", shiftKey: true })).toEqual({ type: "zoom", dir: -1 });
  });

  it("q / e rotate left / right, case-insensitively", () => {
    expect(keyAction({ key: "q" })).toEqual({ type: "rotate", dir: -1 });
    expect(keyAction({ key: "Q", shiftKey: true })).toEqual({ type: "rotate", dir: -1 });
    expect(keyAction({ key: "e" })).toEqual({ type: "rotate", dir: 1 });
    expect(keyAction({ key: "E", shiftKey: true })).toEqual({ type: "rotate", dir: 1 });
  });

  it("h resets, / searches, ? opens help, Escape escapes", () => {
    expect(keyAction({ key: "h" })).toEqual({ type: "reset" });
    expect(keyAction({ key: "H", shiftKey: true })).toEqual({ type: "reset" });
    expect(keyAction({ key: "/" })).toEqual({ type: "search" });
    expect(keyAction({ key: "?", shiftKey: true })).toEqual({ type: "help" });
    expect(keyAction({ key: "Escape" })).toEqual({ type: "escape" });
    expect(keyAction({ key: "Esc" })).toEqual({ type: "escape" });
  });

  it("returns null for unmapped keys", () => {
    for (const k of ["x", "Enter", " ", "Tab", "F5", "1", "", "Shift", "Dead"]) {
      expect(keyAction({ key: k })).toBeNull();
    }
  });
});

describe("keyAction guards", () => {
  it("lets browser shortcuts through when ctrl, meta or alt is held", () => {
    for (const mod of ["ctrlKey", "metaKey", "altKey"] as const) {
      expect(keyAction({ key: "=", [mod]: true })).toBeNull();
      expect(keyAction({ key: "q", [mod]: true })).toBeNull();
      expect(keyAction({ key: "ArrowLeft", [mod]: true })).toBeNull();
      expect(keyAction({ key: "Escape", [mod]: true })).toBeNull();
    }
  });

  it("Shift alone does not block arrows", () => {
    expect(keyAction({ key: "ArrowLeft", shiftKey: true })).toEqual({ type: "pan", dx: -1, dy: 0 });
  });

  it("ignores keys typed into inputs, textareas, selects and contenteditable", () => {
    for (const tagName of ["INPUT", "input", "TEXTAREA", "SELECT"]) {
      expect(keyAction({ key: "q", target: { tagName } })).toBeNull();
      expect(keyAction({ key: "/", target: { tagName } })).toBeNull();
      expect(keyAction({ key: "ArrowLeft", target: { tagName } })).toBeNull();
    }
    expect(keyAction({ key: "e", target: { tagName: "DIV", isContentEditable: true } })).toBeNull();
  });

  it("Escape still works from a text field", () => {
    expect(keyAction({ key: "Escape", target: { tagName: "INPUT" } })).toEqual({ type: "escape" });
    expect(keyAction({ key: "Escape", target: { tagName: "DIV", isContentEditable: true } })).toEqual({
      type: "escape",
    });
  });

  it("handles keys on buttons, the body and a null target", () => {
    expect(keyAction({ key: "e", target: { tagName: "BUTTON" } })).toEqual({ type: "rotate", dir: 1 });
    expect(keyAction({ key: "e", target: { tagName: "BODY" } })).toEqual({ type: "rotate", dir: 1 });
    expect(keyAction({ key: "e", target: null })).toEqual({ type: "rotate", dir: 1 });
  });
});

describe("keyAction ignores keys inside side panels, dialogs and interactive links", () => {
  const inPanel = { tagName: "DIV", closest: (sel: string) => (sel === ".panel, dialog" ? {} : null) };
  const plain = { tagName: "DIV", closest: () => null };

  it("asks closest() for a side panel or dialog ancestor", () => {
    const asked: string[] = [];
    keyAction({ key: "q", target: { tagName: "DIV", closest: (s) => (asked.push(s), null) } });
    expect(asked).toEqual([".panel, dialog"]);
  });

  it("arrows, +/-, Q/E, H, / and ? are not ours inside a panel or dialog", () => {
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "_", "q", "e", "h", "/", "?"]) {
      expect(keyAction({ key, target: inPanel })).toBeNull();
    }
  });

  it("the same keys are handled for a target outside any panel", () => {
    expect(keyAction({ key: "ArrowLeft", target: plain })).toEqual({ type: "pan", dx: -1, dy: 0 });
    expect(keyAction({ key: "q", target: plain })).toEqual({ type: "rotate", dir: -1 });
    expect(keyAction({ key: "h", target: plain })).toEqual({ type: "reset" });
    expect(keyAction({ key: "?", target: plain })).toEqual({ type: "help" });
  });

  it("Escape is handled everywhere", () => {
    expect(keyAction({ key: "Escape", target: inPanel })).toEqual({ type: "escape" });
    expect(keyAction({ key: "Escape", target: { tagName: "A" } })).toEqual({ type: "escape" });
    expect(keyAction({ key: "Escape", target: { tagName: "SUMMARY" } })).toEqual({ type: "escape" });
  });

  it("links, selects and summaries keep their own keys", () => {
    for (const tagName of ["A", "a", "SELECT", "SUMMARY"]) {
      expect(keyAction({ key: "ArrowDown", target: { tagName } })).toBeNull();
      expect(keyAction({ key: "e", target: { tagName } })).toBeNull();
    }
  });

  it("top-bar buttons stay allowed, and a target without closest() is fine", () => {
    expect(keyAction({ key: "ArrowRight", target: { tagName: "BUTTON", closest: () => null } })).toEqual({
      type: "pan",
      dx: 1,
      dy: 0,
    });
    expect(keyAction({ key: "ArrowRight", target: { tagName: "BUTTON" } })).toEqual({ type: "pan", dx: 1, dy: 0 });
  });
});

