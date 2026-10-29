import { useRef, type RefObject } from "react";
import { dropTargetFrom, type DropTarget } from "../lib/dragNote";

interface NoteDragOptions {
  cardRef: RefObject<HTMLElement>;
  /** Text shown on the floating copy. */
  label: string;
  /** Whether the shell's sidebar drawer is currently showing. */
  drawerOpen?: boolean;
  /** Opens it while dragging on a phone, closes it afterwards. */
  onDrawerOpenChange?: (open: boolean) => void;
}

export interface DragPoint {
  x: number;
  y: number;
}

/** Below this width the sidebar is a drawer that must be opened to receive a drop. */
const PHONE_WIDTH_PX = 860;

/**
 * The dragging half of the hold gesture: a floating copy under the pointer,
 * the source card dimmed, and the sidebar row under the pointer ringed. All
 * imperative on purpose — a drag fires dozens of moves per second and none of
 * them should re-render the list.
 */
export function useNoteDrag({
  cardRef,
  label,
  drawerOpen,
  onDrawerOpenChange,
}: NoteDragOptions) {
  const ghostRef = useRef<HTMLElement | null>(null);
  const hoverRef = useRef<HTMLElement | null>(null);
  const openedDrawerRef = useRef(false);
  const activeRef = useRef(false);

  function elementAt(point: DragPoint): Element | null {
    return document.elementFromPoint?.(point.x, point.y) ?? null;
  }

  function place(point: DragPoint) {
    const ghost = ghostRef.current;
    if (!ghost) return;
    ghost.style.left = `${point.x}px`;
    ghost.style.top = `${point.y}px`;
  }

  function ring(element: Element | null) {
    const next = element?.closest<HTMLElement>("[data-drop-kind]") ?? null;
    if (next === hoverRef.current) return;
    hoverRef.current?.classList.remove("drop-target");
    next?.classList.add("drop-target");
    hoverRef.current = next;
  }

  function tidy() {
    activeRef.current = false;
    ring(null);
    ghostRef.current?.remove();
    ghostRef.current = null;
    cardRef.current?.classList.remove("dragging");

    if (openedDrawerRef.current) {
      openedDrawerRef.current = false;
      onDrawerOpenChange?.(false);
    }
  }

  function lift(point: DragPoint) {
    activeRef.current = true;
    cardRef.current?.classList.add("dragging");

    const ghost = document.createElement("div");
    ghost.className = "note-ghost";
    ghost.textContent = label;
    place(point);
    document.body.append(ghost);
    ghostRef.current = ghost;

    if (onDrawerOpenChange && !drawerOpen && window.innerWidth <= PHONE_WIDTH_PX) {
      openedDrawerRef.current = true;
      onDrawerOpenChange(true);
    }
  }

  function move(point: DragPoint) {
    if (!activeRef.current) return;
    place(point);
    ring(elementAt(point));
  }

  /** Ends the drag, reporting what — if anything — was under the pointer. */
  function finish(point: DragPoint): DropTarget | null {
    const target = activeRef.current ? dropTargetFrom(elementAt(point)) : null;
    tidy();
    return target;
  }

  function cancel() {
    tidy();
  }

  return { lift, move, finish, cancel };
}
