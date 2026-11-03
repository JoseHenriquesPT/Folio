const GAP = 8;

export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Size {
  width: number;
  height: number;
}

export interface LinkTarget {
  href: string;
  text: string;
}

/**
 * Puts a small link card under the link, centred on it, and flips it above
 * when the phone's lower half has no room. Horizontal position is clamped to
 * the viewport so the card never overflows either gutter.
 */
export function placeLinkPopover(
  anchor: AnchorRect,
  size: Size,
  viewport: Size
): { left: number; top: number; placement: "above" | "below" } {
  const maxLeft = Math.max(GAP, viewport.width - size.width - GAP);
  const left = Math.min(
    maxLeft,
    Math.max(GAP, anchor.left + anchor.width / 2 - size.width / 2)
  );

  const below = anchor.top + anchor.height + GAP;
  const fitsBelow = below + size.height <= viewport.height - GAP;
  const fitsAbove = anchor.top - GAP - size.height >= GAP;
  const roomAbove = anchor.top;
  const roomBelow = viewport.height - (anchor.top + anchor.height);
  const above = (!fitsBelow && fitsAbove) || (!fitsBelow && roomAbove > roomBelow);

  return {
    left,
    top: above
      ? Math.max(GAP, anchor.top - GAP - size.height)
      : below,
    placement: above ? "above" : "below",
  };
}

/** Reads the link behind a click, including when a child of the anchor was hit. */
export function linkTargetFrom(element: Element | null): LinkTarget | null {
  const anchor = element?.closest("a[href]");
  if (!anchor) return null;

  const href = anchor.getAttribute("href")?.trim();
  if (!href) return null;

  return {
    href,
    text: anchor.textContent?.trim() || href,
  };
}
