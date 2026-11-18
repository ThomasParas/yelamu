/**
 * The round turn buttons in the bottom corners (phones and tablets). The test runner has no
 * DOM, so this checks the stylesheet rules and the shell wiring as text; their colours are
 * checked in uiColors.test.ts.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./ui.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("./shell.ts", import.meta.url), "utf8");

/** The body of the @media block that starts with `query`, braces balanced. */
function mediaBlock(query: string): string {
  const start = css.indexOf(`@media ${query} {`);
  expect(start, `@media ${query}`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(css.indexOf("{", start) + 1, i);
  }
  throw new Error("unbalanced braces");
}
function rule(block: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?:^|[\\s}])${esc}\\s*\\{([^}]*)\\}`).exec(block);
  expect(m, selector).not.toBeNull();
  return m![1];
}
const px = (body: string, prop: string) => Number(new RegExp(`(?:^|[;\\s])${prop}:\\s*(\\d+)px`).exec(body)![1]);

describe("turn buttons: stylesheet", () => {
  const touch = mediaBlock("(max-width: 640px), (pointer: coarse)");
  const btn = rule(touch, ".turn__btn");

  it("are hidden by default (wide mouse screens) and shown on narrow or touch screens", () => {
    expect(rule(css, ".turn")).toMatch(/display:\s*none/);
    expect(rule(touch, ".turn")).toMatch(/display:\s*block/);
  });

  it("are round thumb targets of at least 44 px", () => {
    expect(px(btn, "width")).toBeGreaterThanOrEqual(44);
    expect(px(btn, "height")).toBeGreaterThanOrEqual(44);
    expect(btn).toMatch(/border-radius:\s*50%/);
  });

  it("sit above the home indicator and above the status line", () => {
    expect(btn).toMatch(/position:\s*fixed/);
    const bottom = /bottom:\s*([^;]+);/.exec(btn)![1];
    expect(bottom).toContain("var(--safe-bottom)");
    expect(bottom).toContain("var(--status-h");
    // --safe-bottom is the iOS safe-area inset.
    expect(css).toMatch(/--safe-bottom:\s*env\(safe-area-inset-bottom/);
  });

  it("take the bottom-left and bottom-right corners", () => {
    expect(rule(touch, ".turn__btn--left")).toMatch(/left:/);
    expect(rule(touch, ".turn__btn--right")).toMatch(/right:/);
  });

  it("step aside while a panel or bottom sheet is open", () => {
    expect(rule(touch, '.ui-root[data-panel-open="true"] .turn__btn')).toMatch(/display:\s*none/);
  });

  it("do not trigger double-tap zoom", () => {
    expect(btn).toMatch(/touch-action:\s*manipulation/);
  });
});

describe("turn buttons: shell wiring", () => {
  it("use the same accessible names as the toolbar rotate buttons", () => {
    expect(shell).toMatch(/"turn__btn turn__btn--left", "↺", "Rotate left", "Rotate left \(Q\)"/);
    expect(shell).toMatch(/"turn__btn turn__btn--right", "↻", "Rotate right", "Rotate right \(E\)"/);
  });

  it("call the same rotate handlers as the toolbar (left -1, right +1)", () => {
    expect(shell).toMatch(/turnLeftBtn\.addEventListener\("click", \(\) => rotateHandlers\.forEach\(\(h\) => h\(-1\)\)\)/);
    expect(shell).toMatch(/turnRightBtn\.addEventListener\("click", \(\) => rotateHandlers\.forEach\(\(h\) => h\(1\)\)\)/);
  });

  it("flag the root while any panel is open, and measure the status line", () => {
    expect(shell).toContain("root.dataset.panelOpen");
    expect(shell).toContain('"--status-h"');
  });
});
