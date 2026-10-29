import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { menuPosition } from "../lib/menuPosition";
import type { NoteMenuAction, NoteMenuItem } from "../lib/noteMenu";

export interface NoteActionAnchor {
  x: number;
  y: number;
}

/**
 * The app's replacement for the browser's long-press and right-click menu.
 * Presentational: it reports the chosen id and closes; the caller owns the
 * actions.
 */
export default function NoteActionMenu({
  open,
  anchor,
  title,
  items,
  onSelect,
  onClose,
}: {
  open: boolean;
  anchor: NoteActionAnchor;
  title: string;
  items: NoteMenuItem[];
  onSelect: (id: NoteMenuAction) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const closedRef = useRef(false);
  const [position, setPosition] = useState({ left: anchor.x, top: anchor.y });

  closeRef.current = onClose;

  /** Escape, an outside tap, and a Tab-out can all race: close once. */
  function close() {
    if (closedRef.current) return;
    closedRef.current = true;
    closeRef.current();
  }

  // Measure before paint so the menu never flashes at the wrong corner.
  useLayoutEffect(() => {
    if (!open) return;
    const node = menuRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setPosition(
      menuPosition(
        anchor,
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight }
      )
    );
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;

    closedRef.current = false;

    if (document.activeElement instanceof HTMLElement) {
      restoreFocusRef.current = document.activeElement;
    }
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();

    function focusableItems(): HTMLButtonElement[] {
      return Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
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
      if (node && !node.contains(event.target as Node)) closeRef.current();
    }

    function handleFocusOut(event: FocusEvent) {
      const node = menuRef.current;
      const next = event.relatedTarget;
      if (node && next instanceof Node && !node.contains(next)) {
        close();
      }
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
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className="note-menu"
      role="menu"
      aria-label={`Actions for ${title}`}
      aria-orientation="vertical"
      style={{ left: position.left, top: position.top }}
    >
      {items.map((item) => (
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
