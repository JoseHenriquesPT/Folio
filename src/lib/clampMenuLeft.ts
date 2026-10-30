const GAP_PX = 6;

/**
 * The tag menu opens against its picker, which sits late in a narrow editor
 * column — in the three-pane layout that column is far narrower than the
 * viewport, so the menu would poke past its right edge and make the note
 * scroll sideways. Sliding the menu left keeps it inside the scroller: opening
 * it changes neither the scroll width nor what the reader can see of it.
 *
 * Returns the menu's left edge in scroller coordinates; a pane too narrow for
 * the menu gives up the picker's side rather than overflowing the right edge,
 * because content past the right edge is what creates the sideways scroll.
 */
export function clampMenuLeft(
  menuLeft: number,
  menuWidth: number,
  containerWidth: number
): number {
  return Math.min(menuLeft, containerWidth - menuWidth - GAP_PX);
}
