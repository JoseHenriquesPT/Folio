import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  compensateScrollTop,
  decideHeaderCollapse,
  type HeaderCollapseState,
} from "../lib/headerCollapse";

// The rows that sit above the note body and disappear on collapse, and the
// only place focus may park while the header is open. One selector for both so
// the measurement and the focus guard can never disagree about what counts as
// the chrome.
const CHROME_SELECTOR = ".editor-header, .editor-meta-row";

// After the keyboard (or the window) resizes the layout viewport, the browser
// spends a few frames catching scrollTop up with the new geometry. Those moves
// are layout, not a gesture, so the tracker keeps out of the way for a moment.
const VIEWPORT_GRACE_MS = 250;

function measureChromeHeight(): number {
  let height = 0;
  for (const row of document.querySelectorAll<HTMLElement>(CHROME_SELECTOR)) {
    height += row.offsetHeight;
  }
  return height;
}

function focusIsInChrome(): boolean {
  return Boolean(document.activeElement?.closest(CHROME_SELECTOR));
}

// Drives the collapsing note header. Scroll events are coalesced into one
// decision per animation frame, and when the rows do disappear the scroller is
// scrolled by the height they gave back — in the same frame, before anything
// reaches the screen — so the note never moves under the reader's finger.
//
// The tracker lives in a ref rather than in React state: the layout effect has
// to re-seed it after every toggle, and doing that through state would cost an
// extra render of the whole editor for each scroll decision. Only `collapsed`
// is worth rendering, so only that one is state.
export function useHeaderCollapse() {
  const [collapsed, setCollapsed] = useState(false);
  const stateRef = useRef<HeaderCollapseState>({ collapsed: false, baseline: 0 });
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingScrollRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);
  // The chrome height a toggle still has to pay back on the scroller, or null
  // when no toggle is waiting to be painted.
  const pendingCompensationRef = useRef<number | null>(null);
  const pausedUntilRef = useRef(0);

  const flush = useCallback(() => {
    frameRef.current = null;
    const scrollTop = pendingScrollRef.current;
    pendingScrollRef.current = null;
    if (scrollTop === null) return;

    const delta = scrollTop - lastScrollTopRef.current;
    lastScrollTopRef.current = scrollTop;

    const previous = stateRef.current;
    if (Date.now() < pausedUntilRef.current) {
      // The viewport is mid-resize: follow the container and decide nothing.
      stateRef.current = { collapsed: previous.collapsed, baseline: scrollTop };
      return;
    }

    const chromeHeight = measureChromeHeight();
    const next = decideHeaderCollapse(previous, {
      scrollTop,
      delta,
      chromeHeight,
      headerHasFocus: focusIsInChrome(),
    });
    stateRef.current = next;
    if (next.collapsed !== previous.collapsed) {
      // React has not touched the rows yet, so this is their height going in;
      // the layout effect measures what they became and pays back the
      // difference on the scroller before the frame is painted.
      pendingCompensationRef.current = chromeHeight;
      setCollapsed(next.collapsed);
    }
  }, []);

  const handleScroll = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    pendingScrollRef.current = body.scrollTop;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(flush);
  }, [flush]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const heightBefore = pendingCompensationRef.current;
    pendingCompensationRef.current = null;
    if (!body) return;

    let scrollTop = body.scrollTop;
    if (heightBefore !== null) {
      scrollTop = compensateScrollTop(scrollTop, heightBefore, measureChromeHeight());
      body.scrollTop = scrollTop;
    }
    // Whatever just changed the chrome, the tracker now measures both travel
    // and per-event movement from the position the container is really in.
    stateRef.current = {
      collapsed: stateRef.current.collapsed,
      baseline: scrollTop,
    };
    lastScrollTopRef.current = scrollTop;
  }, [collapsed]);

  const reset = useCallback(() => {
    // A new note starts with the header open and the tracker aligned to the
    // container's real position, so a deep scroll cannot look like a gesture.
    const scrollTop = bodyRef.current?.scrollTop ?? 0;
    pendingScrollRef.current = null;
    pendingCompensationRef.current = null;
    stateRef.current = { collapsed: false, baseline: scrollTop };
    lastScrollTopRef.current = scrollTop;
    setCollapsed(false);
  }, []);

  useEffect(() => {
    const pause = () => {
      pausedUntilRef.current = Date.now() + VIEWPORT_GRACE_MS;
    };
    window.addEventListener("resize", pause);
    window.visualViewport?.addEventListener("resize", pause);
    return () => {
      window.removeEventListener("resize", pause);
      window.visualViewport?.removeEventListener("resize", pause);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return { collapsed, handleScroll, reset, bodyRef };
}
