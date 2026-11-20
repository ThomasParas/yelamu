import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The card is built in the DOM (identifyModule.ts), which the Node tests do not run: check
// the pieces that make the close button usable as text, like ui/menuZoom.test.ts does.
const src = readFileSync(new URL("./identifyModule.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("./ui/ui.css", import.meta.url), "utf8");
const rule = (selector: string) => {
  const i = css.indexOf(`${selector} {`);
  expect(i, `${selector} rule`).toBeGreaterThanOrEqual(0);
  return css.slice(i, css.indexOf("}", i));
};

describe("identify card close button", () => {
  it("is a real button with an accessible name, the glyph hidden from screen readers", () => {
    expect(src).toContain('document.createElement("button")');
    expect(src).toContain('closeBtn.type = "button"');
    expect(src).toContain('closeBtn.setAttribute("aria-label", "Close")');
    expect(src).toMatch(/glyph\.setAttribute\("aria-hidden", "true"\)/);
    expect(src).toContain('closeBtn.addEventListener("click"');
  });

  it("keeps Escape closing the card", () => {
    expect(src).toMatch(/ctx\.handlers\.escape = \(\) => \{\s*if \(!close\(\)\) prevEscape\(\);/);
  });

  it("takes the pointer back from the click-through layer and never shrinks over the text", () => {
    expect(rule(".ui-root > .identify")).toContain("pointer-events: none");
    const close = rule(".identify__close");
    expect(close).toContain("pointer-events: auto");
    expect(close).toContain("flex: none");
    expect(rule(".identify__text")).toContain("min-width: 0");
  });
});
