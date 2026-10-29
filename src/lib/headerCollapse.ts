// Decides whether the title/status/tags header stays visible while the note
// body scrolls. The header collapses below the fold to give the note more
// reading space and re-opens near the top of the note.
//
// Three rules keep the toggle from ever moving the text under the reader's
// finger (the 2026-10-29 scrolling regression):
//
// 1. A collapse needs *both* a position past the fold — the expand line plus
//    the chrome height plus the travel minimum — and at least
//    HEADER_COLLAPSE_TRAVEL_MIN_PX of movement measured from the last toggle.
//    The fold is set so the scroll position is compensated by exactly the
//    height the chrome gives back (see compensateScrollTop), which always
//    lands inside the deadband: the travel minimum above the expand line.
// 2. Only the expand line is a plain position, so a collapsed header can never
//    be stuck no matter how the scroll position arrived there.
// 3. Movement between two scroll events bigger than HEADER_SCROLL_JUMP_PX is
//    not a finger on the screen: it is layout — scroll anchoring correcting
//    itself, a note switch, a keyboard resize. The tracker re-seeds on it and
//    decides nothing. (The keyboard's gradual resize is handled separately by
//    the viewport grace period in useHeaderCollapse.)
//
// A focused header never hides: focus releases the tracker, so the next
// collapse has to be a deliberate gesture from where focus left off.

export const HEADER_COLLAPSE_EXPAND_BELOW_PX = 80;
export const HEADER_COLLAPSE_TRAVEL_MIN_PX = 48;
export const HEADER_SCROLL_JUMP_PX = 200;

export type HeaderCollapseState = {
  readonly collapsed: boolean;
  /** Scroll position the travel is measured from: the last toggle or re-seed. */
  readonly baseline: number;
};

export type HeaderCollapseInput = {
  readonly scrollTop: number;
  /** Movement since the previous scroll event. */
  readonly delta: number;
  /** Height of the rows above the scroller, before they are hidden. */
  readonly chromeHeight: number;
  readonly headerHasFocus: boolean;
};

export function decideHeaderCollapse(
  state: HeaderCollapseState,
  input: HeaderCollapseInput
): HeaderCollapseState {
  if (Math.abs(input.delta) > HEADER_SCROLL_JUMP_PX) {
    return { collapsed: state.collapsed, baseline: input.scrollTop };
  }

  if (input.headerHasFocus) {
    return { collapsed: false, baseline: input.scrollTop };
  }

  if (!state.collapsed) {
    const travel = input.scrollTop - state.baseline;
    const fold =
      HEADER_COLLAPSE_EXPAND_BELOW_PX +
      input.chromeHeight +
      HEADER_COLLAPSE_TRAVEL_MIN_PX;
    if (travel >= HEADER_COLLAPSE_TRAVEL_MIN_PX && input.scrollTop >= fold) {
      return { collapsed: true, baseline: input.scrollTop };
    }
    return state;
  }

  if (input.scrollTop < HEADER_COLLAPSE_EXPAND_BELOW_PX) {
    return { collapsed: false, baseline: input.scrollTop };
  }
  return state;
}

// The rows above the scroller shrink or grow by `heightAfter - heightBefore`,
// which drags the text under them by that much. Scrolling by the same amount
// (in the opposite direction) in the same frame keeps every line of the note
// exactly where it was on screen, the way a bar that slides away over the
// content would.
export function compensateScrollTop(
  scrollTop: number,
  heightBefore: number,
  heightAfter: number
): number {
  return Math.max(0, scrollTop + (heightAfter - heightBefore));
}
