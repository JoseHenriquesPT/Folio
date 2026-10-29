import { describe, expect, it } from "vitest";
import { decideHeaderCollapse } from "./headerCollapse";

describe("decideHeaderCollapse", () => {
  it("keeps the header visible near the top of the note", () => {
    expect(decideHeaderCollapse(0, false, 0, false)).toBe(false);
    expect(decideHeaderCollapse(40, true, -20, false)).toBe(false);
    expect(decideHeaderCollapse(80, false, 12, false)).toBe(false);
  });

  it("collapses the header when scrolling down below the fold", () => {
    expect(decideHeaderCollapse(120, false, 30, false)).toBe(true);
    expect(decideHeaderCollapse(81, false, 1, false)).toBe(true);
    expect(decideHeaderCollapse(400, false, 60, false)).toBe(true);
  });

  it("expands the header again when scrolling up", () => {
    expect(decideHeaderCollapse(300, true, -30, false)).toBe(false);
    expect(decideHeaderCollapse(85, true, -1, false)).toBe(false);
  });

  it("keeps the current state when the position did not change", () => {
    expect(decideHeaderCollapse(300, true, 0, false)).toBe(true);
    expect(decideHeaderCollapse(300, false, 0, false)).toBe(false);
  });

  it("never hides the header while focus is inside it", () => {
    expect(decideHeaderCollapse(300, false, 30, true)).toBe(false);
    expect(decideHeaderCollapse(300, true, 30, true)).toBe(false);
  });
});
