const GAP = 8;

interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

/**
 * Keeps a floating menu on screen: it opens down-right of the press point,
 * flips back off the right edge when there is no room, and opens upward with
 * its bottom at the press point when the lower half of the screen is full.
 */
export function menuPosition(
  anchor: Point,
  size: Size,
  viewport: Size
): { left: number; top: number } {
  const left =
    anchor.x + size.width + GAP > viewport.width
      ? Math.max(GAP, viewport.width - size.width - GAP)
      : anchor.x;

  const top =
    anchor.y + size.height + GAP > viewport.height
      ? Math.max(GAP, anchor.y - size.height)
      : anchor.y;

  return { left, top };
}
