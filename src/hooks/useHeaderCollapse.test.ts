import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HEADER_COLLAPSE_EXPAND_BELOW_PX,
  HEADER_COLLAPSE_TRAVEL_MIN_PX,
} from "../lib/headerCollapse";
import { useHeaderCollapse } from "./useHeaderCollapse";

// The rows above the note body measure about this on a phone; the tracker has
// to clear them before it collapses anything, and the collapse has to hand the
// space back to the scroller without moving the text.
const HEADER_PX = 100;
const META_PX = 45;
const CHROME_PX = HEADER_PX + META_PX;
const FOLD_PX =
  HEADER_COLLAPSE_EXPAND_BELOW_PX + CHROME_PX + HEADER_COLLAPSE_TRAVEL_MIN_PX;

function makeScroller(scrollTop: number): HTMLDivElement {
  const element = document.createElement("div");
  let value = scrollTop;
  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    get: () => value,
    set: (next: number) => {
      value = next;
    },
  });
  document.body.append(element);
  return element;
}

function makeRow(className: string, height: () => number): HTMLElement {
  const element = document.createElement("div");
  element.className = className;
  // jsdom has no layout, so the row reports the phone height while the header
  // is open and nothing once the collapsed class hides it.
  Object.defineProperty(element, "offsetHeight", { configurable: true, get: height });
  document.body.append(element);
  return element;
}

function setup() {
  // renderHook publishes result.current from a passive effect, which runs after
  // the hook's own layout effect — too late to report the height the rows have
  // while it measures them. The render callback runs earlier, so the rows read
  // this mirror instead.
  const mirror = { collapsed: false };
  const view = renderHook(() => {
    const state = useHeaderCollapse();
    mirror.collapsed = state.collapsed;
    return state;
  });
  const body = makeScroller(0);
  const header = makeRow("editor-header", () => (mirror.collapsed ? 0 : HEADER_PX));
  const meta = makeRow("editor-meta-row", () => (mirror.collapsed ? 0 : META_PX));
  view.result.current.bodyRef.current = body;
  return { ...view, body, header, meta };
}

type View = ReturnType<typeof setup>;

async function scroll(view: View, scrollTop: number): Promise<void> {
  await act(async () => {
    view.body.scrollTop = scrollTop;
    view.result.current.handleScroll();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useHeaderCollapse", () => {
  it("collapses once below the fold and hands the space to the scroller", async () => {
    const view = setup();

    await scroll(view, 150);
    expect(view.result.current.collapsed).toBe(false);

    await scroll(view, 300);
    expect(view.result.current.collapsed).toBe(true);
    // The rows give back their height, so the text under the reader does not
    // move by a single pixel.
    expect(view.body.scrollTop).toBe(300 - CHROME_PX);
  });

  it("holds the reading position through jitter while collapsed", async () => {
    const view = setup();
    await scroll(view, 150);
    await scroll(view, 300);
    expect(view.result.current.collapsed).toBe(true);
    const readingPosition = view.body.scrollTop;

    for (const top of [readingPosition + 1, readingPosition - 1, readingPosition + 4]) {
      await scroll(view, top);
      expect(view.result.current.collapsed).toBe(true);
    }
    expect(view.body.scrollTop).toBe(readingPosition + 4);
  });

  it("expands again near the top of the note, keeping the text still", async () => {
    const view = setup();
    await scroll(view, 150);
    await scroll(view, 300);
    expect(view.result.current.collapsed).toBe(true);

    // Above the expand line the header stays away even while scrolling up.
    await scroll(view, 100);
    expect(view.result.current.collapsed).toBe(true);
    expect(view.body.scrollTop).toBe(100);

    // Below it the rows come back without pushing the text down.
    await scroll(view, 70);
    expect(view.result.current.collapsed).toBe(false);
    expect(view.body.scrollTop).toBe(70 + CHROME_PX);
  });

  it("reset measures the real scroll position instead of zero", async () => {
    const view = setup();
    await scroll(view, 150);
    await scroll(view, 300);
    expect(view.result.current.collapsed).toBe(true);

    // Switch notes while the container sits deep in a note.
    view.body.scrollTop = 2000;
    act(() => view.result.current.reset());
    expect(view.result.current.collapsed).toBe(false);

    // A nudge from the fresh position is not a gesture.
    await scroll(view, 2010);
    expect(view.result.current.collapsed).toBe(false);

    // 48 px of real travel from 2000 collapses; measured from zero the jump
    // guard would swallow it and the header would never come back.
    await scroll(view, 2048);
    expect(view.result.current.collapsed).toBe(true);
  });

  it("ignores a phantom jump the tracker cannot explain", async () => {
    const view = setup();
    await scroll(view, 900);
    expect(view.result.current.collapsed).toBe(false);
  });

  it("pauses while the keyboard resizes the viewport, then resumes", async () => {
    const view = setup();
    await scroll(view, 150);

    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    window.dispatchEvent(new Event("resize"));

    // Past the fold with real travel, but the viewport just moved under us.
    await scroll(view, 300);
    expect(view.result.current.collapsed).toBe(false);

    now.mockReturnValue(1_300);
    await scroll(view, 348);
    expect(view.result.current.collapsed).toBe(true);
  });

  it("makes one decision for a burst of scrolls inside one frame", async () => {
    const view = setup();
    await scroll(view, 150);

    await act(async () => {
      view.body.scrollTop = FOLD_PX + 77;
      view.result.current.handleScroll();
      view.body.scrollTop = 100;
      view.result.current.handleScroll();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    // Only the position at the end of the frame counts: the burst reversed
    // before it was ever a deliberate scroll down.
    expect(view.result.current.collapsed).toBe(false);

    await scroll(view, 290);
    expect(view.result.current.collapsed).toBe(true);
  });

  it("never collapses while focus sits in the header", async () => {
    const view = setup();
    const input = document.createElement("input");
    view.header.append(input);
    input.focus();

    await scroll(view, 150);
    expect(view.result.current.collapsed).toBe(false);

    // Releasing focus re-seeds the tracker, so the next move starts fresh.
    input.blur();
    await scroll(view, 210);
    expect(view.result.current.collapsed).toBe(false);

    await scroll(view, 300);
    expect(view.result.current.collapsed).toBe(true);
  });

  it("cancels the pending frame on unmount", () => {
    const view = setup();
    const cancel = vi.spyOn(globalThis, "cancelAnimationFrame");

    view.result.current.handleScroll();
    view.unmount();

    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
