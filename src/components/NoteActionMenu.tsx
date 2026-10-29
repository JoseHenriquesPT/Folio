import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { noteTitle } from "../lib/format";
import { menuPosition } from "../lib/menuPosition";
import type { NoteMenuAction, NoteMenuItem } from "../lib/noteMenu";

export interface NoteActionAnchor {
  x: number;
  y: number;
}

/** Everything needed to show one note's menu at one point on screen. */
export interface NoteMenuRequest {
  /** The note under the pointer; only its title is shown. */
  note: { title: string };
  anchor: NoteActionAnchor;
  items: NoteMenuItem[];
}

/**
 * The app's replacement for the browser's long-press and right-click menu.
 * Presentational: it reports the chosen id and closes; the caller owns the
 * actions. It stays mounted between requests so focus can return to the card.
 */
export default function NoteActionMenu({
  request,
  onSelect,
  onClose,
}: {
  request: NoteMenuRequest | null;
  onSelect: (id: NoteMenuAction) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const closedRef = useRef(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  closeRef.current = onClose;

  /** Escape, an outside tap, and a Tab-out can all race: close once. */
  function close() {
    if (closedRef.current) return;
    closedRef.current = true;
    closeRef.current();
  }

  // Measure before paint so the menu never flashes at the wrong corner.
  useLayoutEffect(() => {
    if (!request) return;
    const node = menuRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setPosition(
      menuPosition(
        request.anchor,
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight }
      )
    );
  }, [request]);

  useEffect(() => {
    if (!request) return;

    closedRef.current = false;
    if (document.activeElement instanceof HTMLElement) {
      restoreFocusRef.current = document.activeElement;
    }
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();

    function focusableItems(): HTMLButtonElement[] {
      return Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]'
        ) ?? []
      );
    }

    function moveFocus(step: number) {
      const buttons = focusableItems();
      if (buttons.length === 0) return;
      const index = buttons.indexOf(
        document.activeElement as HTMLButtonElement
      );
      const next =
        index < 0 ? 0 : (index + step + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        moveFocus(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveFocus(-1);
      }
    }

    function handleMouseDown(event: MouseEvent) {
      const node = menuRef.current;
      if (node && !node.contains(event.target as Node)) close();
    }

    function handleFocusOut(event: FocusEvent) {
      const node = menuRef.current;
      const next = event.relatedTarget;
      if (node && next instanceof Node && !node.contains(next)) close();
    }

    const node = menuRef.current;
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);
    node?.addEventListener("focusout", handleFocusOut);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
      node?.removeEventListener("focusout", handleFocusOut);

      const restore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (restore && document.contains(restore)) restore.focus();
    };
  }, [request]);

  if (!request) return null;

  return (
    <div
      ref={menuRef}
      className="note-menu"
      role="menu"
      aria-label={`Actions for ${noteTitle(request.note.title)}`}
      aria-orientation="vertical"
      style={{ left: position.left, top: position.top }}
    >
      {request.items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={`note-menu-item${item.tone === "danger" ? " danger" : ""}`}
          onClick={() => {
            onSelect(item.id);
            close();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
