import { useEffect, useRef, type RefObject } from "react";

export interface HoldPoint {
  x: number;
  y: number;
}

interface HoldGestureOptions {
  ref: RefObject<HTMLElement>;
  /** The press held still past `delayMs`: the item is now in the hand. */
  onLift?: (point: HoldPoint) => void;
  /** Moved while held — the item is being dragged. */
  onDrag?: (point: HoldPoint) => void;
  /** The press ended. `dragged` separates a drop from a menu request. */
  onRelease?: (point: HoldPoint, dragged: boolean) => void;
  /** The gesture died after lifting: a scroll or an interrupted touch. */
  onCancel?: () => void;
  delayMs?: number;
  /** Pixels the pointer may wander before the press counts as a scroll. */
  tolerance?: number;
  /** False for items with no menu and nothing to drag. */
  enabled?: boolean;
}

/**
 * Hold to act. A press that stays still lifts the item; movement afterwards
 * drags it; lifting the finger reports the point either way, so the caller
 * can tell a drop from a menu request. Movement before the delay is treated
 * as a scroll, which keeps the list behaving normally.
 */
export function useLongPress({
  ref,
  onLift,
  onDrag,
  onRelease,
  onCancel,
  delayMs = 500,
  tolerance = 8,
  enabled = true,
}: HoldGestureOptions) {
  const callbacks = useRef({ onLift, onDrag, onRelease, onCancel });
  callbacks.current = { onLift, onDrag, onRelease, onCancel };

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let timer: number | null = null;
    let startX = 0;
    let startY = 0;
    let lifted = false;
    let dragged = false;
    // Deliberately outlives the release: browsers fire compatibility mouse
    // events after a hold, and those must neither navigate the item nor
    // close the menu that the release just opened.
    let swallowMouse = false;

    function endGesture() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      lifted = false;
      dragged = false;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handleInterrupt);
      window.removeEventListener("scroll", handleInterrupt, true);
      window.removeEventListener("touchmove", claimTouch);
    }

    function handlePointerDown(event: PointerEvent) {
      if (!enabled || event.button !== 0) return;

      endGesture();
      swallowMouse = false;
      startX = event.clientX;
      startY = event.clientY;

      timer = window.setTimeout(() => {
        timer = null;
        lifted = true;
        dragged = false;
        swallowMouse = true;
        callbacks.current.onLift?.({ x: startX, y: startY });
      }, delayMs);

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handleInterrupt);
      window.addEventListener("scroll", handleInterrupt, true);
      window.addEventListener("touchmove", claimTouch, { passive: false });
    }

    function handlePointerMove(event: PointerEvent) {
      const dx = Math.abs(event.clientX - startX);
      const dy = Math.abs(event.clientY - startY);

      if (!lifted) {
        if (dx > tolerance || dy > tolerance) endGesture();
        return;
      }

      if (dx <= tolerance && dy <= tolerance) return;
      dragged = true;
      callbacks.current.onDrag?.({ x: event.clientX, y: event.clientY });
    }

    function handlePointerUp(event: PointerEvent) {
      const point = { x: event.clientX, y: event.clientY };
      const wasLifted = lifted;
      const wasDragged = dragged;
      endGesture();
      if (wasLifted) callbacks.current.onRelease?.(point, wasDragged);
    }

    function handleInterrupt() {
      const wasLifted = lifted;
      endGesture();
      if (wasLifted) callbacks.current.onCancel?.();
    }

    /** Stops the list scrolling away from underneath a held item. */
    function claimTouch(event: TouchEvent) {
      if (!lifted) return;
      event.preventDefault();
    }

    function swallowMouseEvent(event: MouseEvent) {
      if (!swallowMouse) return;
      // Only the click ends the suppression; the events before it belong to
      // the same gesture.
      if (event.type === "click") swallowMouse = false;
      event.preventDefault();
      event.stopPropagation();
    }

    node.addEventListener("pointerdown", handlePointerDown);
    node.addEventListener("mousedown", swallowMouseEvent, true);
    node.addEventListener("mouseup", swallowMouseEvent, true);
    node.addEventListener("click", swallowMouseEvent, true);

    return () => {
      endGesture();
      node.removeEventListener("pointerdown", handlePointerDown);
      node.removeEventListener("mousedown", swallowMouseEvent, true);
      node.removeEventListener("mouseup", swallowMouseEvent, true);
      node.removeEventListener("click", swallowMouseEvent, true);
    };
  }, [ref, delayMs, tolerance, enabled]);
}
