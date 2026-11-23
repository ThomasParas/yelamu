import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ISO_AZIMUTH } from "./camera";
import { compassLabel, northDegrees, northDirection } from "./compass";
import { NORTH_UP_ROT, azimuthFor } from "./viewRig";

describe("compass", () => {
  it("north is straight up at azimuth 0 (camera south of the target)", () => {
    expect(northDegrees(0)).toBe(0);
    expect(northDirection(0)).toBe("up");
    expect(northDirection(azimuthFor(NORTH_UP_ROT))).toBe("up");
  });

  it("the default view (rot 0) has north up-right, as the map has always opened", () => {
    expect(northDegrees(ISO_AZIMUTH)).toBeCloseTo(45);
    expect(northDirection(azimuthFor(0))).toBe("up-right");
  });

  it("names all eight 45 degree views", () => {
    const names = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((r) => northDirection(azimuthFor(r)));
    expect(new Set(names).size).toBe(8);
  });

  it("wraps negative and large azimuths, ignores NaN", () => {
    expect(northDegrees(-Math.PI / 2)).toBeCloseTo(270);
    expect(northDegrees(5 * Math.PI)).toBeCloseTo(180);
    expect(northDegrees(Number.NaN)).toBe(0);
  });

  it("the accessible name says where north is and what a tap does", () => {
    expect(compassLabel(0)).toBe("Compass: north is up");
    expect(compassLabel(-Math.PI / 4)).toBe("Compass: north is up-left. Turn the map so north is up");
  });
});

describe("compass: shell wiring and stylesheet", () => {
  const shell = readFileSync(new URL("./ui/shell.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("./ui/ui.css", import.meta.url), "utf8");
  const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

  it("is a real button drawn like the turn buttons (hidden with them while a panel is open)", () => {
    expect(shell).toMatch(/el\("button", "turn__btn compass"/);
    expect(shell).toMatch(/aria-hidden="true"/);
  });

  it("sits above the turn-left button, on the left like the zoom stack on the right", () => {
    const m = /\n\.compass\s*\{([^}]*)\}/.exec(css);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/left:/);
    expect(m![1]).toMatch(/\+ 56px\)/);
  });

  it("tapping it turns the map north-up, and it follows every view change", () => {
    expect(main).toMatch(/onNorthUp\(\(\) => rig\.rotateTo\(NORTH_UP_ROT\)\)/);
    expect(main).toMatch(/rig\.onChange\(syncCompass\)/);
  });
});
