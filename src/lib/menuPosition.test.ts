import { describe, expect, it } from "vitest";
import { menuPosition } from "./menuPosition";

const viewport = { width: 1000, height: 800 };
const size = { width: 200, height: 160 };

describe("menuPosition", () => {
  it("opens down and to the right of the press point", () => {
    expect(menuPosition({ x: 100, y: 120 }, size, viewport)).toEqual({
      left: 100,
      top: 120,
    });
  });

  it("shifts left when the right edge is too close", () => {
    const position = menuPosition({ x: 900, y: 120 }, size, viewport);

    expect(position.left).toBe(viewport.width - size.width - 8);
    expect(position.left + size.width).toBeLessThanOrEqual(viewport.width);
  });

  it("opens upward when there is no room below", () => {
    const position = menuPosition({ x: 100, y: 720 }, size, viewport);

    expect(position.top).toBe(720 - size.height);
    expect(position.top + size.height).toBeLessThanOrEqual(viewport.height);
  });

  it("stays inside both edges in a corner", () => {
    const position = menuPosition({ x: 980, y: 790 }, size, viewport);

    expect(position.left).toBeGreaterThanOrEqual(0);
    expect(position.top).toBeGreaterThanOrEqual(0);
    expect(position.left + size.width).toBeLessThanOrEqual(viewport.width);
    expect(position.top + size.height).toBeLessThanOrEqual(viewport.height);
  });
});
