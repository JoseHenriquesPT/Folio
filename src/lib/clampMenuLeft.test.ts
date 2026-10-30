import { describe, expect, it } from "vitest";
import { clampMenuLeft } from "./clampMenuLeft";

describe("clampMenuLeft", () => {
  it("leaves a menu that already fits where the picker put it", () => {
    expect(clampMenuLeft(20, 220, 325)).toBe(20);
    expect(clampMenuLeft(0, 220, 325)).toBe(0);
  });

  it("pulls a menu back inside the container's right edge", () => {
    // The picker sits late in a narrow editor column: 216 + 220 + 6 would end
    // at 442 of a 325px scroller, so the menu slides left instead of making the
    // note horizontally scrollable.
    expect(clampMenuLeft(216, 220, 325)).toBe(99);
    expect(clampMenuLeft(216, 220, 325) + 220 + 6).toBeLessThanOrEqual(325);
  });

  it("clamps a menu that starts past the edge", () => {
    expect(clampMenuLeft(300, 220, 325)).toBe(99);
  });

  it("trades the left edge away rather than overflowing in a pane too narrow for it", () => {
    // A 100px column cannot hold a 220px menu: clipping the picker side is
    // still better than letting the note scroll sideways.
    expect(clampMenuLeft(40, 220, 100)).toBe(-126);
    expect(-126 + 220 + 6).toBeLessThanOrEqual(100);
  });
});
