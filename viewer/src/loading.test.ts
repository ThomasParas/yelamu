import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

describe("loading indicator", () => {
  it("is in the page itself, styled inline, so it shows before the script arrives", () => {
    expect(html).toMatch(/<div id="loading" class="loading" role="status">/);
    expect(html).toContain("Loading the map…");
    expect(html).toMatch(/<style>[\s\S]*\.loading__ring[\s\S]*<\/style>/);
    // Slower, not frozen, for visitors who ask for reduced motion; readable in dark mode.
    expect(html).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*animation-duration/);
    expect(html).toMatch(/prefers-color-scheme: dark\)[\s\S]*\.loading__text/);
  });

  it("goes once the first full frame is drawn, and when loading fails", () => {
    expect(main).toMatch(/renderer\.render\(scene, camera\);\s*hideLoading\(\);/);
    expect(main).toMatch(/start\(\)\.catch\(\(err\) => \{[\s\S]*?hideLoading\(\);/);
  });
});
