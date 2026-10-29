import { describe, expect, it } from "vitest";
import {
  HEADER_COLLAPSE_EXPAND_BELOW_PX,
  HEADER_COLLAPSE_TRAVEL_MIN_PX,
  HEADER_SCROLL_JUMP_PX,
  compensateScrollTop,
  decideHeaderCollapse,
  type HeaderCollapseInput,
  type HeaderCollapseState,
} from "./headerCollapse";

// The rows above the note body (wrapped two-row header plus the meta row)
// measure about this on a phone: hiding them shifts the body by that much, so
// the rule has to clear it before it ever fires.
const PHONE_CHROME_PX = 145;
const FOLD_PX =
  HEADER_COLLAPSE_EXPAND_BELOW_PX + PHONE_CHROME_PX + HEADER_COLLAPSE_TRAVEL_MIN_PX;

function at(
  scrollTop: number,
  options: Partial<HeaderCollapseInput> = {}
): HeaderCollapseInput {
  return {
    scrollTop,
    // Tests that are not about layout jumps describe a smooth scroll, where
    // nothing moved since the previous event.
    delta: 0,
    chromeHeight: PHONE_CHROME_PX,
    headerHasFocus: false,
    ...options,
  };
}

function start(baseline = 0): HeaderCollapseState {
  return { collapsed: false, baseline };
}

describe("decideHeaderCollapse", () => {
  it("keeps the header visible near the top of the note", () => {
    const state = start();
    expect(decideHeaderCollapse(state, at(0))).toBe(state);
    expect(decideHeaderCollapse(state, at(HEADER_COLLAPSE_EXPAND_BELOW_PX - 1))).toBe(
      state
    );
    // Deep in the note, but one pixel short of the fold: still nothing to do.
    expect(decideHeaderCollapse(state, at(FOLD_PX - 1))).toEqual({
      collapsed: false,
      baseline: 0,
    });
  });

  it("collapses once, below the fold, after deliberate travel", () => {
    let state = decideHeaderCollapse(start(), at(FOLD_PX));
    expect(state).toEqual({ collapsed: true, baseline: FOLD_PX });

    // Jitter in either direction around the collapsed position cannot flip it.
    for (const top of [FOLD_PX + 1, FOLD_PX, FOLD_PX + 4, FOLD_PX - 2, FOLD_PX + 3]) {
      state = decideHeaderCollapse(state, at(top));
      expect(state.collapsed).toBe(true);
    }
  });

  it("never toggles on the sign of a single small delta", () => {
    // One pixel down from just under the fold used to collapse the header.
    const aboutToCollapse: HeaderCollapseState = {
      collapsed: false,
      baseline: FOLD_PX - 1,
    };
    expect(decideHeaderCollapse(aboutToCollapse, at(FOLD_PX)).collapsed).toBe(false);
    expect(decideHeaderCollapse(aboutToCollapse, at(FOLD_PX + 1)).collapsed).toBe(false);

    // One pixel up from deep inside the note used to re-open it.
    const aboutToExpand: HeaderCollapseState = { collapsed: true, baseline: 401 };
    expect(decideHeaderCollapse(aboutToExpand, at(400)).collapsed).toBe(true);
    expect(decideHeaderCollapse(aboutToExpand, at(HEADER_COLLAPSE_EXPAND_BELOW_PX + 1)).collapsed).toBe(
      true
    );
  });

  it("holds the state through alternating sub-threshold movement", () => {
    let state = start();
    for (let i = 0; i < 30; i++) {
      state = decideHeaderCollapse(state, at(FOLD_PX - 1));
      state = decideHeaderCollapse(state, at(FOLD_PX - 49));
      expect(state.collapsed).toBe(false);
    }
    expect(state.baseline).toBe(0);
  });

  it("counts travel from the last toggle, not from the last event", () => {
    let state = decideHeaderCollapse(start(), at(150));
    expect(state.collapsed).toBe(false);
    // Scrolling back up changes nothing: the fold is still where it was.
    state = decideHeaderCollapse(state, at(60));
    expect(state.collapsed).toBe(false);
    expect(state.baseline).toBe(0);
    // One deliberate push past the fold collapses it.
    state = decideHeaderCollapse(state, at(FOLD_PX));
    expect(state.collapsed).toBe(true);
  });

  it("clears the chrome height before hiding it", () => {
    const seeded: HeaderCollapseState = { collapsed: false, baseline: 145 };
    // A shorter (desktop-sized) chrome is cleared earlier than a phone's.
    expect(decideHeaderCollapse(seeded, at(250, { chromeHeight: 105 })).collapsed).toBe(
      true
    );
    expect(decideHeaderCollapse(seeded, at(250)).collapsed).toBe(false);
    expect(decideHeaderCollapse(seeded, at(FOLD_PX)).collapsed).toBe(true);
  });

  it("treats a jump between two events as layout and re-seeds", () => {
    const jump = HEADER_SCROLL_JUMP_PX + 1;
    const jumped = decideHeaderCollapse(start(), at(jump, { delta: jump }));
    expect(jumped).toEqual({ collapsed: false, baseline: jump });
    // Real travel resumes from the new baseline once the fold is cleared.
    expect(decideHeaderCollapse(jumped, at(FOLD_PX)).collapsed).toBe(true);
    // A move the size of a gesture still decides nothing on its own.
    expect(decideHeaderCollapse(start(), at(FOLD_PX, { delta: FOLD_PX })).collapsed).toBe(
      false
    );
  });

  it("never hides the header while focus sits inside it", () => {
    let state = decideHeaderCollapse(start(), at(500, { headerHasFocus: true }));
    expect(state).toEqual({ collapsed: false, baseline: 500 });
    // Focus releases the tracker, so leaving the header needs fresh travel.
    expect(decideHeaderCollapse(state, at(510)).collapsed).toBe(false);
    state = decideHeaderCollapse(state, at(510));
    expect(
      decideHeaderCollapse(state, at(510 + HEADER_COLLAPSE_TRAVEL_MIN_PX)).collapsed
    ).toBe(true);
    // A focused header re-opens even a collapsed one.
    expect(
      decideHeaderCollapse({ collapsed: true, baseline: 500 }, at(500, { headerHasFocus: true }))
        .collapsed
    ).toBe(false);
  });

  it("brings the header back near the top of the note", () => {
    let state: HeaderCollapseState = { collapsed: true, baseline: FOLD_PX };
    state = decideHeaderCollapse(state, at(200));
    expect(state.collapsed).toBe(true);
    state = decideHeaderCollapse(state, at(HEADER_COLLAPSE_EXPAND_BELOW_PX));
    expect(state.collapsed).toBe(true);
    state = decideHeaderCollapse(state, at(HEADER_COLLAPSE_EXPAND_BELOW_PX - 1));
    expect(state.collapsed).toBe(false);

    // Once open at the top, jitter keeps it open and cannot re-collapse it.
    for (let i = 0; i < 10; i++) {
      state = decideHeaderCollapse(state, at(HEADER_COLLAPSE_EXPAND_BELOW_PX));
      state = decideHeaderCollapse(state, at(HEADER_COLLAPSE_EXPAND_BELOW_PX - 1));
      expect(state.collapsed).toBe(false);
    }
  });

  it("opens on position alone so a collapsed header can never be stuck", () => {
    const released: HeaderCollapseState = { collapsed: true, baseline: 500 };
    expect(
      decideHeaderCollapse(released, at(HEADER_COLLAPSE_EXPAND_BELOW_PX - 1)).collapsed
    ).toBe(false);
  });
});

describe("compensateScrollTop", () => {
  it("moves the scroll position by exactly the height the chrome changed", () => {
    expect(compensateScrollTop(350, PHONE_CHROME_PX, 0)).toBe(205);
    expect(compensateScrollTop(79, 0, PHONE_CHROME_PX)).toBe(224);
    expect(compensateScrollTop(120, 105, 105)).toBe(120);
  });

  it("drops the reader inside the deadband instead of on the expand line", () => {
    const collapsedTop = compensateScrollTop(FOLD_PX, PHONE_CHROME_PX, 0);
    expect(collapsedTop).toBe(128);
    expect(collapsedTop - HEADER_COLLAPSE_EXPAND_BELOW_PX).toBeGreaterThanOrEqual(
      HEADER_COLLAPSE_TRAVEL_MIN_PX
    );

    const collapsed: HeaderCollapseState = { collapsed: true, baseline: collapsedTop };
    expect(decideHeaderCollapse(collapsed, at(collapsedTop + 1)).collapsed).toBe(true);
    expect(decideHeaderCollapse(collapsed, at(collapsedTop - 1)).collapsed).toBe(true);
  });

  it("never scrolls above the top of the note", () => {
    expect(compensateScrollTop(10, PHONE_CHROME_PX, 0)).toBe(0);
    expect(compensateScrollTop(0, PHONE_CHROME_PX, 0)).toBe(0);
  });
});
