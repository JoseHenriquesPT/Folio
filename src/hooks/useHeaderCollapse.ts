import { useCallback, useRef, useState } from "react";
import { decideHeaderCollapse } from "../lib/headerCollapse";

// Drives the collapsing note header: the body's scroll position decides, with
// hysteresis in decideHeaderCollapse, and focus inside the header blocks it.
export function useHeaderCollapse() {
  const [collapsed, setCollapsed] = useState(false);
  const scrollTopRef = useRef(0);

  const handleScroll = useCallback((scrollTop: number) => {
    const delta = scrollTop - scrollTopRef.current;
    scrollTopRef.current = scrollTop;
    const active = document.activeElement;
    const headerHasFocus = Boolean(
      active?.closest(".editor-header, .editor-meta-row")
    );
    setCollapsed((prev) =>
      decideHeaderCollapse(scrollTop, prev, delta, headerHasFocus)
    );
  }, []);

  const reset = useCallback(() => {
    scrollTopRef.current = 0;
    setCollapsed(false);
  }, []);

  return { collapsed, handleScroll, reset };
}
