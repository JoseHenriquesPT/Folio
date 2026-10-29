import { useEffect, useRef, type RefObject } from "react";

interface LongPressOptions {
  ref: RefObject<HTMLElement>;
  /** Receives the press point, where the menu should appear. */
  onActivate: (point: { x: number; y: number }) => void;
  delayMs?: number;
  /** Pixels the pointer may wander before the press is treated as a scroll. */
  tolerance?: number;
  /** False for elements that have no menu of their own, so taps pass through. */
  enabled?: boolean;
}

/**
 * Hold to act: a press that stays still past `delayMs` activates, and the
 * click that browsers fire afterwards is swallowed so a card never navigates
 * while its menu is open. Movement, interruption, and scrolling cancel it.
 */
export function useLongPress({
  ref,
  onActivate,
  delayMs = 500,
  tolerance = 8,
  enabled = true,
}: LongPressOptions) {
  const activateRef = useRef(onActivate);

  useEffect(() => {
    activateRef.current = onActivate;
  }, [onActivate]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let timer: number | null = null;
    let startX = 0;
    let startY = 0;
    let activated = false;

    function finish() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("scroll", finish, true);
    }

    function handlePointerDown(event: PointerEvent) {
      if (!enabled || event.button !== 0) return;

      startX = event.clientX;
      startY = event.clientY;
      activated = false;
      finish();

      timer = window.setTimeout(() => {
        timer = null;
        activated = true;
        activateRef.current({ x: startX, y: startY });
      }, delayMs);

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
      window.addEventListener("scroll", finish, true);
    }

    function handlePointerMove(event: PointerEvent) {
      if (
        Math.abs(event.clientX - startX) > tolerance ||
        Math.abs(event.clientY - startY) > tolerance
      ) {
        finish();
      }
    }

    /**
     * Browsers fire compatibility mouse events after a hold; the menu is
     * already open by then, and letting those through would both navigate
     * the card and close the menu that just appeared.
     */
    function swallowMouseEvent(event: MouseEvent) {
      if (!activated) return;
      // Only the click ends the suppression; the events before it are part
      // of the same gesture.
      if (event.type === "click") activated = false;
      event.preventDefault();
      event.stopPropagation();
    }

    node.addEventListener("pointerdown", handlePointerDown);
    node.addEventListener("mousedown", swallowMouseEvent, true);
    node.addEventListener("mouseup", swallowMouseEvent, true);
    node.addEventListener("click", swallowMouseEvent, true);

    return () => {
      finish();
      node.removeEventListener("pointerdown", handlePointerDown);
      node.removeEventListener("mousedown", swallowMouseEvent, true);
      node.removeEventListener("mouseup", swallowMouseEvent, true);
      node.removeEventListener("click", swallowMouseEvent, true);
    };
  }, [ref, delayMs, tolerance, enabled]);
}
