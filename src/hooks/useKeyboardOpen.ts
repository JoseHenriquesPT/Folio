import { useEffect, useState } from "react";

// The editor uses its phone layout at or below this width — the same
// breakpoint as the stylesheet. Above it the layout never changes for a
// keyboard, which also keeps a desktop window being dragged shorter from
// looking like one.
const PHONE_MAX_WIDTH_PX = 860;

// An on-screen keyboard takes several hundred pixels of height; a collapsing
// URL bar or a hand on the window's edge takes far less.
const KEYBOARD_SHRINK_PX = 150;

// Reports whether the on-screen keyboard is open. Two families of browser
// exist: ones that resize the layout viewport when the keyboard opens (the
// viewport meta asks for exactly that, so window.innerHeight drops) and ones
// that overlay the keyboard instead (only visualViewport.height drops). Both
// are read here, and the window's width is tracked so a real window resize is
// never mistaken for the keyboard.
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let width = window.innerWidth;
    let height = window.innerHeight;

    const evaluate = () => {
      const nextWidth = window.innerWidth;
      const nextHeight = window.innerHeight;

      if (nextWidth !== width) {
        // The window changed shape: that was a resize, and the window's new
        // height becomes the height it is supposed to have.
        width = nextWidth;
        height = nextHeight;
        setOpen(false);
        return;
      }
      if (nextHeight > height) height = nextHeight;

      const layoutShrunk = height - nextHeight >= KEYBOARD_SHRINK_PX;
      const visualHeight = window.visualViewport?.height ?? nextHeight;
      const visualShrunk = nextHeight - visualHeight >= KEYBOARD_SHRINK_PX;
      setOpen(nextWidth <= PHONE_MAX_WIDTH_PX && (layoutShrunk || visualShrunk));
    };

    window.addEventListener("resize", evaluate);
    window.visualViewport?.addEventListener("resize", evaluate);
    return () => {
      window.removeEventListener("resize", evaluate);
      window.visualViewport?.removeEventListener("resize", evaluate);
    };
  }, []);

  return open;
}
