import { describe, expect, it } from "vitest";
import { linkTargetFrom, placeLinkPopover } from "./linkPopover";

const anchor = { left: 100, top: 200, width: 80, height: 20 };
const size = { width: 240, height: 96 };
const viewport = { width: 390, height: 844 };

describe("placeLinkPopover", () => {
  it("centres under the link and flips above when the bottom is tight", () => {
    const below = placeLinkPopover(anchor, size, viewport);
    expect(below.placement).toBe("below");
    expect(below.left).toBe(20);
    expect(below.top).toBe(228);

    const above = placeLinkPopover(
      { ...anchor, top: 760, height: 24 },
      size,
      viewport
    );
    expect(above.placement).toBe("above");
    expect(above.top).toBe(656);
  });

  it("keeps the box inside both phone gutters", () => {
    const leftEdge = placeLinkPopover(
      { ...anchor, left: 2, width: 30 },
      size,
      viewport
    );
    expect(leftEdge.left).toBe(8);

    const rightEdge = placeLinkPopover(
      { ...anchor, left: 360, width: 30 },
      size,
      viewport
    );
    expect(rightEdge.left).toBe(viewport.width - size.width - 8);
  });
});

describe("linkTargetFrom", () => {
  it("finds the anchor behind a child and keeps its readable text", () => {
    const host = document.createElement("div");
    host.innerHTML = '<p><a href="https://example.com/a"><strong>Docs</strong></a></p>';
    document.body.append(host);

    const target = host.querySelector("strong");
    expect(linkTargetFrom(target)).toEqual({
      href: "https://example.com/a",
      text: "Docs",
    });

    host.remove();
  });

  it("ignores non-link and empty href elements", () => {
    expect(linkTargetFrom(null)).toBeNull();

    const host = document.createElement("div");
    host.innerHTML = '<a href="  ">Nothing</a><span>Plain</span>';
    document.body.append(host);
    expect(linkTargetFrom(host.querySelector("span"))).toBeNull();
    expect(linkTargetFrom(host.querySelector("a"))).toBeNull();
    host.remove();
  });
});
