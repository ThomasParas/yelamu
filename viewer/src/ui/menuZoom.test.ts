/**
 * The compact top bar (Layers popover, collapsible menu) and the zoom buttons. The test runner
 * has no DOM, so this checks the stylesheet and the shell wiring as text.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./ui.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("./shell.ts", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");

function rule(block: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?:^|[\\s}])${esc}\\s*\\{([^}]*)\\}`).exec(block);
  expect(m, selector).not.toBeNull();
  return m![1];
}
const media = (query: string) => {
  const at = css.indexOf(`@media ${query} {`);
  expect(at, query).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf("\n}\n", at));
};

describe("Layers popover", () => {
  it("is a popover on wide screens, shown only while open", () => {
    const wide = media("(min-width: 641px)");
    expect(rule(wide, ".toggles")).toMatch(/position:\s*absolute/);
    expect(rule(wide, ".toggles")).toMatch(/display:\s*none/);
    expect(rule(wide, '.toggles[data-open="true"]:not([hidden])')).toMatch(/display:\s*flex/);
  });

  it("keeps its natural width and stays inside the bar when the button ends a row", () => {
    expect(rule(media("(min-width: 641px)"), ".toggles")).toMatch(/width:\s*max-content/);
    expect(shell).toContain("Math.max(inset, Math.min(layersBtn.offsetLeft, maxLeft))");
    expect(shell).toMatch(/const syncBarHeight = \(\) => \{[\s\S]*?placeLayers\(\);/);
  });

  it("leaves phones as they were: no Layers button, toggles inline in the Menu", () => {
    expect(rule(media("(max-width: 640px)"), ".topbar__layers-btn")).toMatch(/display:\s*none/);
  });

  it("is a disclosure button that controls the toggles", () => {
    expect(shell).toMatch(/"aria-controls": LAYERS_ID/);
    expect(shell).toMatch(/el\("fieldset", "toggles", \{ id: LAYERS_ID \}\)/);
    expect(shell).toContain("layersBtn.hidden = false;");
  });
});

describe("collapsible menu", () => {
  it("collapses on wide screens too, and the Menu button ends the row", () => {
    expect(rule(css, '.topbar__menu[data-open="false"]')).toMatch(/display:\s*none/);
    expect(rule(css, ".topbar__menu-btn")).toMatch(/order:\s*1/);
  });

  it("opens by default on wide screens, closed on phones, remembering a wide-screen choice safely", () => {
    expect(shell).toContain('isNarrow() ? false : (storedMenuOpen() ?? true)');
    expect(shell).toMatch(/if \(!isNarrow\(\)\) storeMenuOpen\(menuOpen\)/);
    // Storage access can throw (private mode): both helpers catch.
    expect(shell.match(/try \{\s*\n\s*(?:const v = )?localStorage\./g)?.length).toBe(2);
  });
});

describe("zoom buttons", () => {
  it("come in the menu and on the map, labelled with their shortcut", () => {
    expect(shell.match(/"Zoom in", "Zoom in \(\+\)"/g)?.length).toBe(2);
    expect(shell.match(/"Zoom out", "Zoom out \(\\u2212\)"/g)?.length).toBe(2);
  });

  it("on the map: stacked above the turn-right button, mouse screens only", () => {
    const out = rule(css, ".zoom__btn").match(/bottom:\s*([^;]+);/)![1];
    const inn = rule(css, ".zoom__btn--in").match(/bottom:\s*([^;]+);/)![1];
    expect(out).toContain("var(--status-h");
    expect(out).toContain("+ 56px");
    expect(inn).toContain("+ 112px");
    expect(rule(media("(max-width: 640px), (pointer: coarse)"), ".zoom__btn")).toMatch(/display:\s*none/);
  });

  it("grey out at the zoom limits, wired to the rig", () => {
    expect(rule(css, ".turn__btn:disabled,\n.turn__btn:disabled:hover")).toMatch(/opacity/);
    expect(main).toContain("shell.setZoomLimits(zoom < maxZoom * 0.999, zoom > minZoom * 1.001)");
    expect(main).toContain("rig.zoomBy(dir > 0 ? KEY_ZOOM_FACTOR : 1 / KEY_ZOOM_FACTOR)");
  });
});
